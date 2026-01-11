// ============================================================
// SCHEDULER ENGINE
// Execute scheduled jobs
// ============================================================

import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { parseCron, matchesCron, getNextOccurrence } from './cron.js';
import type {
  ScheduledJob,
  JobExecution,
  JobExecutionStatus,
  Schedule,
  SchedulerConfig,
  SchedulerCallbacks,
  TaskJobConfig,
  WorkflowJobConfig,
  WebhookJobConfig,
  CommandJobConfig
} from './types.js';
import type { UniversalAgent } from '../index.js';
import type { WorkflowEngine, WorkflowDefinition } from '../workflow/index.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================
// SCHEDULER CLASS
// ============================================================

export class Scheduler {
  private db: Database.Database;
  private agent?: UniversalAgent;
  private workflowEngine?: WorkflowEngine;
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private callbacks?: SchedulerCallbacks;
  private config: Required<SchedulerConfig>;
  private timer?: NodeJS.Timeout;
  private running: Map<string, Promise<JobExecution>> = new Map();

  constructor(config?: SchedulerConfig) {
    this.config = {
      dbPath: config?.dbPath || './data/scheduler.db',
      maxConcurrent: config?.maxConcurrent || 10,
      defaultRetries: config?.defaultRetries || 3,
      defaultTimeout: config?.defaultTimeout || 300000,
      tickInterval: config?.tickInterval || 60000
    };

    this.db = new Database(this.config.dbPath);
    this.initDatabase();
  }

  // ============================================================
  // DATABASE SETUP
  // ============================================================

  private initDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        schedule TEXT NOT NULL,
        config TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        retries INTEGER,
        retry_delay INTEGER,
        timeout INTEGER,
        tags TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        status TEXT NOT NULL,
        scheduled_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        result TEXT,
        error TEXT,
        retry_count INTEGER DEFAULT 0,
        duration INTEGER,
        FOREIGN KEY (job_id) REFERENCES jobs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_executions_job ON executions(job_id);
      CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
      CREATE INDEX IF NOT EXISTS idx_jobs_enabled ON jobs(enabled);
    `);
  }

  // ============================================================
  // DEPENDENCY INJECTION
  // ============================================================

  setAgent(agent: UniversalAgent): void {
    this.agent = agent;
  }

  setWorkflowEngine(engine: WorkflowEngine): void {
    this.workflowEngine = engine;
  }

  registerWorkflow(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow);
  }

  setCallbacks(callbacks: SchedulerCallbacks): void {
    this.callbacks = callbacks;
  }

  // ============================================================
  // JOB MANAGEMENT
  // ============================================================

  createJob(job: Omit<ScheduledJob, 'id' | 'createdAt' | 'updatedAt'>): ScheduledJob {
    const now = new Date().toISOString();
    const newJob: ScheduledJob = {
      ...job,
      id: uuid(),
      createdAt: now,
      updatedAt: now
    };

    this.db.prepare(`
      INSERT INTO jobs (id, name, description, schedule, config, enabled, retries, retry_delay, timeout, tags, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newJob.id,
      newJob.name,
      newJob.description || null,
      JSON.stringify(newJob.schedule),
      JSON.stringify(newJob.config),
      newJob.enabled ? 1 : 0,
      newJob.retries || null,
      newJob.retryDelay || null,
      newJob.timeout || null,
      newJob.tags ? JSON.stringify(newJob.tags) : null,
      newJob.metadata ? JSON.stringify(newJob.metadata) : null,
      newJob.createdAt,
      newJob.updatedAt
    );

    return newJob;
  }

  getJob(id: string): ScheduledJob | null {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as any;
    return row ? this.rowToJob(row) : null;
  }

  listJobs(options?: { enabled?: boolean; tags?: string[] }): ScheduledJob[] {
    let query = 'SELECT * FROM jobs WHERE 1=1';
    const params: unknown[] = [];

    if (options?.enabled !== undefined) {
      query += ' AND enabled = ?';
      params.push(options.enabled ? 1 : 0);
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    let jobs = rows.map(row => this.rowToJob(row));

    if (options?.tags && options.tags.length > 0) {
      jobs = jobs.filter(job =>
        options.tags!.some(tag => job.tags?.includes(tag))
      );
    }

    return jobs;
  }

  updateJob(id: string, updates: Partial<Omit<ScheduledJob, 'id' | 'createdAt'>>): ScheduledJob | null {
    const existing = this.getJob(id);
    if (!existing) return null;

    const updated: ScheduledJob = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.db.prepare(`
      UPDATE jobs SET
        name = ?, description = ?, schedule = ?, config = ?,
        enabled = ?, retries = ?, retry_delay = ?, timeout = ?,
        tags = ?, metadata = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updated.name,
      updated.description || null,
      JSON.stringify(updated.schedule),
      JSON.stringify(updated.config),
      updated.enabled ? 1 : 0,
      updated.retries || null,
      updated.retryDelay || null,
      updated.timeout || null,
      updated.tags ? JSON.stringify(updated.tags) : null,
      updated.metadata ? JSON.stringify(updated.metadata) : null,
      updated.updatedAt,
      id
    );

    return updated;
  }

  deleteJob(id: string): boolean {
    const result = this.db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
    return result.changes > 0;
  }

  enableJob(id: string): boolean {
    const result = this.db.prepare('UPDATE jobs SET enabled = 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
    return result.changes > 0;
  }

  disableJob(id: string): boolean {
    const result = this.db.prepare('UPDATE jobs SET enabled = 0, updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
    return result.changes > 0;
  }

  // ============================================================
  // EXECUTION MANAGEMENT
  // ============================================================

  getExecution(id: string): JobExecution | null {
    const row = this.db.prepare('SELECT * FROM executions WHERE id = ?').get(id) as any;
    return row ? this.rowToExecution(row) : null;
  }

  listExecutions(options?: {
    jobId?: string;
    status?: JobExecutionStatus;
    limit?: number;
    offset?: number;
  }): JobExecution[] {
    let query = 'SELECT * FROM executions WHERE 1=1';
    const params: unknown[] = [];

    if (options?.jobId) {
      query += ' AND job_id = ?';
      params.push(options.jobId);
    }

    if (options?.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY scheduled_at DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.rowToExecution(row));
  }

  // ============================================================
  // SCHEDULER LIFECYCLE
  // ============================================================

  start(): void {
    if (this.timer) return;

    console.log(`Scheduler started (tick interval: ${this.config.tickInterval}ms)`);
    this.tick(); // Run immediately
    this.timer = setInterval(() => this.tick(), this.config.tickInterval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      console.log('Scheduler stopped');
    }
  }

  private async tick(): Promise<void> {
    const now = new Date();
    const jobs = this.listJobs({ enabled: true });

    for (const job of jobs) {
      if (this.shouldRun(job, now)) {
        // Check concurrent limit
        if (this.running.size >= this.config.maxConcurrent) {
          console.log(`Skipping job ${job.name}: max concurrent limit reached`);
          continue;
        }

        // Execute job
        const promise = this.executeJob(job);
        this.running.set(job.id, promise);
        promise.finally(() => this.running.delete(job.id));
      }
    }
  }

  private shouldRun(job: ScheduledJob, now: Date): boolean {
    const schedule = job.schedule;

    switch (schedule.type) {
      case 'cron': {
        const parsed = parseCron(schedule.expression);
        return matchesCron(parsed, now);
      }

      case 'interval': {
        // Check last execution
        const lastExec = this.listExecutions({ jobId: job.id, limit: 1 })[0];
        if (!lastExec) return true;
        const lastRun = new Date(lastExec.scheduledAt);
        return now.getTime() - lastRun.getTime() >= schedule.milliseconds;
      }

      case 'once': {
        const targetTime = new Date(schedule.at);
        // Check if already executed
        const execs = this.listExecutions({ jobId: job.id, limit: 1 });
        if (execs.length > 0) return false;
        // Check if time has passed
        return now >= targetTime;
      }

      default:
        return false;
    }
  }

  // ============================================================
  // JOB EXECUTION
  // ============================================================

  async executeJob(job: ScheduledJob, manual: boolean = false): Promise<JobExecution> {
    const executionId = uuid();
    const now = new Date().toISOString();

    // Create execution record
    const execution: JobExecution = {
      id: executionId,
      jobId: job.id,
      status: 'pending',
      scheduledAt: now,
      retryCount: 0
    };

    this.db.prepare(`
      INSERT INTO executions (id, job_id, status, scheduled_at, retry_count)
      VALUES (?, ?, ?, ?, ?)
    `).run(execution.id, execution.jobId, execution.status, execution.scheduledAt, execution.retryCount);

    try {
      // Update status to running
      execution.status = 'running';
      execution.startedAt = new Date().toISOString();
      this.updateExecution(execution);

      this.callbacks?.onJobStart?.(job, executionId);

      // Execute based on job type
      const timeout = job.timeout || this.config.defaultTimeout;
      const result = await this.executeWithTimeout(job, timeout);

      // Update status to completed
      execution.status = 'completed';
      execution.completedAt = new Date().toISOString();
      execution.result = result;
      execution.duration = new Date(execution.completedAt).getTime() - new Date(execution.startedAt!).getTime();
      this.updateExecution(execution);

      this.callbacks?.onJobComplete?.(job, executionId, result);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check for timeout
      if (errorMsg === 'Job execution timeout') {
        execution.status = 'timeout';
      } else {
        execution.status = 'failed';
      }

      execution.completedAt = new Date().toISOString();
      execution.error = errorMsg;
      execution.duration = execution.startedAt
        ? new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()
        : 0;
      this.updateExecution(execution);

      this.callbacks?.onJobFail?.(job, executionId, errorMsg);

      // Handle retries
      const maxRetries = job.retries ?? this.config.defaultRetries;
      if (execution.retryCount! < maxRetries && execution.status === 'failed') {
        const retryDelay = job.retryDelay || 5000;
        setTimeout(() => this.retryExecution(job, execution), retryDelay);
      }
    }

    return execution;
  }

  private async executeWithTimeout(job: ScheduledJob, timeout: number): Promise<unknown> {
    return Promise.race([
      this.executeJobConfig(job.config),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Job execution timeout')), timeout)
      )
    ]);
  }

  private async executeJobConfig(config: TaskJobConfig | WorkflowJobConfig | WebhookJobConfig | CommandJobConfig): Promise<unknown> {
    switch (config.type) {
      case 'task':
        return this.executeTaskJob(config);

      case 'workflow':
        return this.executeWorkflowJob(config);

      case 'webhook':
        return this.executeWebhookJob(config);

      case 'command':
        return this.executeCommandJob(config);

      default:
        throw new Error(`Unknown job type: ${(config as any).type}`);
    }
  }

  private async executeTaskJob(config: TaskJobConfig): Promise<unknown> {
    if (!this.agent) {
      throw new Error('No agent configured for task jobs');
    }

    const result = await this.agent.run(config.message);
    return result;
  }

  private async executeWorkflowJob(config: WorkflowJobConfig): Promise<unknown> {
    if (!this.workflowEngine) {
      throw new Error('No workflow engine configured');
    }

    const workflow = this.workflows.get(config.workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${config.workflowId}`);
    }

    const execution = await this.workflowEngine.execute(workflow, config.input || {});
    return execution;
  }

  private async executeWebhookJob(config: WebhookJobConfig): Promise<unknown> {
    const response = await fetch(config.url, {
      method: config.method,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      },
      body: config.body
    });

    const data = await response.json().catch(() => response.text());
    return {
      status: response.status,
      data
    };
  }

  private async executeCommandJob(config: CommandJobConfig): Promise<unknown> {
    const { stdout, stderr } = await execAsync(config.command, {
      cwd: config.cwd,
      timeout: config.timeout
    });

    return { stdout, stderr };
  }

  private async retryExecution(job: ScheduledJob, prevExecution: JobExecution): Promise<void> {
    console.log(`Retrying job ${job.name} (attempt ${(prevExecution.retryCount || 0) + 1})`);

    const execution: JobExecution = {
      id: uuid(),
      jobId: job.id,
      status: 'pending',
      scheduledAt: new Date().toISOString(),
      retryCount: (prevExecution.retryCount || 0) + 1
    };

    this.db.prepare(`
      INSERT INTO executions (id, job_id, status, scheduled_at, retry_count)
      VALUES (?, ?, ?, ?, ?)
    `).run(execution.id, execution.jobId, execution.status, execution.scheduledAt, execution.retryCount);

    try {
      execution.status = 'running';
      execution.startedAt = new Date().toISOString();
      this.updateExecution(execution);

      const result = await this.executeJobConfig(job.config);

      execution.status = 'completed';
      execution.completedAt = new Date().toISOString();
      execution.result = result;
      execution.duration = new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime();
      this.updateExecution(execution);

      this.callbacks?.onJobComplete?.(job, execution.id, result);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      execution.status = 'failed';
      execution.completedAt = new Date().toISOString();
      execution.error = errorMsg;
      this.updateExecution(execution);

      // Continue retrying if under limit
      const maxRetries = job.retries ?? this.config.defaultRetries;
      if (execution.retryCount! < maxRetries) {
        const retryDelay = job.retryDelay || 5000;
        setTimeout(() => this.retryExecution(job, execution), retryDelay);
      } else {
        this.callbacks?.onJobFail?.(job, execution.id, `Max retries exceeded: ${errorMsg}`);
      }
    }
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private updateExecution(execution: JobExecution): void {
    this.db.prepare(`
      UPDATE executions SET
        status = ?, started_at = ?, completed_at = ?,
        result = ?, error = ?, duration = ?
      WHERE id = ?
    `).run(
      execution.status,
      execution.startedAt || null,
      execution.completedAt || null,
      execution.result ? JSON.stringify(execution.result) : null,
      execution.error || null,
      execution.duration || null,
      execution.id
    );
  }

  private rowToJob(row: any): ScheduledJob {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      schedule: JSON.parse(row.schedule),
      config: JSON.parse(row.config),
      enabled: row.enabled === 1,
      retries: row.retries,
      retryDelay: row.retry_delay,
      timeout: row.timeout,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private rowToExecution(row: any): JobExecution {
    return {
      id: row.id,
      jobId: row.job_id,
      status: row.status,
      scheduledAt: row.scheduled_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error,
      retryCount: row.retry_count,
      duration: row.duration
    };
  }

  // ============================================================
  // CLEANUP
  // ============================================================

  close(): void {
    this.stop();
    this.db.close();
  }
}
