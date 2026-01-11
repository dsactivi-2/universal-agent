// ============================================================
// ADDITIONAL API ROUTES FOR FRONTEND
// ============================================================

import { Router, Request, Response } from 'express';
import type { UniversalAgent } from '../index.js';
import type { Brain } from '../memory/brain.js';
import type { Scheduler } from '../scheduler/scheduler.js';
import type { WorkflowEngine, WorkflowDefinition } from '../workflow/index.js';
import Database from 'better-sqlite3';

interface AuthenticatedRequest extends Request {
  userId?: string;
}

// ============================================================
// WORKFLOW STORAGE (SQLite for persistence)
// ============================================================

class WorkflowStorage {
  private db: Database.Database;

  constructor(dbPath: string = './data/workflows.db') {
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  private initDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        nodes TEXT NOT NULL,
        edges TEXT NOT NULL,
        variables TEXT,
        inputs TEXT,
        outputs TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workflow_executions (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        input TEXT,
        output TEXT,
        error TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id)
      );

      CREATE INDEX IF NOT EXISTS idx_workflows_user ON workflows(user_id);
      CREATE INDEX IF NOT EXISTS idx_executions_workflow ON workflow_executions(workflow_id);
    `);
  }

  create(userId: string, data: Partial<WorkflowDefinition>): WorkflowDefinition {
    const now = new Date().toISOString();
    const id = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const workflow: WorkflowDefinition = {
      id,
      name: data.name || 'Untitled Workflow',
      description: data.description,
      version: data.version || '1.0.0',
      nodes: data.nodes || [],
      edges: data.edges || [],
      variables: data.variables || {},
      inputs: data.inputs || [],
      metadata: data.metadata || {},
      createdAt: now,
      updatedAt: now
    };

    this.db.prepare(`
      INSERT INTO workflows (id, user_id, name, description, nodes, edges, variables, inputs, outputs, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      workflow.id,
      userId,
      workflow.name,
      workflow.description || null,
      JSON.stringify(workflow.nodes),
      JSON.stringify(workflow.edges),
      JSON.stringify(workflow.variables),
      JSON.stringify(workflow.inputs),
      JSON.stringify(workflow.metadata),
      now,
      now
    );

    return workflow;
  }

  get(id: string): (WorkflowDefinition & { userId: string }) | null {
    const row = this.db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as any;
    return row ? this.rowToWorkflow(row) : null;
  }

  list(userId: string): WorkflowDefinition[] {
    const rows = this.db.prepare('SELECT * FROM workflows WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as any[];
    return rows.map(row => this.rowToWorkflow(row));
  }

  update(id: string, data: Partial<WorkflowDefinition>): WorkflowDefinition | null {
    const existing = this.get(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: WorkflowDefinition & { userId: string } = {
      ...existing,
      ...data,
      id: existing.id,
      updatedAt: now
    };

    this.db.prepare(`
      UPDATE workflows SET
        name = ?, description = ?, nodes = ?, edges = ?,
        variables = ?, inputs = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updated.name,
      updated.description || null,
      JSON.stringify(updated.nodes),
      JSON.stringify(updated.edges),
      JSON.stringify(updated.variables),
      JSON.stringify(updated.inputs),
      now,
      id
    );

    return updated;
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM workflows WHERE id = ?').run(id);
    return result.changes > 0;
  }

  saveExecution(userId: string, workflowId: string, execution: any): void {
    this.db.prepare(`
      INSERT INTO workflow_executions (id, workflow_id, user_id, status, input, output, error, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      execution.id,
      workflowId,
      userId,
      execution.status,
      JSON.stringify(execution.input),
      execution.output ? JSON.stringify(execution.output) : null,
      execution.error || null,
      execution.startedAt,
      execution.completedAt || null
    );
  }

  getExecutions(workflowId: string, limit = 10): any[] {
    const rows = this.db.prepare(`
      SELECT * FROM workflow_executions WHERE workflow_id = ?
      ORDER BY started_at DESC LIMIT ?
    `).all(workflowId, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      workflowId: row.workflow_id,
      status: row.status,
      input: row.input ? JSON.parse(row.input) : {},
      output: row.output ? JSON.parse(row.output) : null,
      error: row.error,
      startedAt: row.started_at,
      completedAt: row.completed_at
    }));
  }

  private rowToWorkflow(row: any): WorkflowDefinition & { userId: string } {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      version: '1.0.0',
      nodes: JSON.parse(row.nodes),
      edges: JSON.parse(row.edges),
      variables: row.variables ? JSON.parse(row.variables) : {},
      inputs: row.inputs ? JSON.parse(row.inputs) : [],
      metadata: row.outputs ? JSON.parse(row.outputs) : {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  close(): void {
    this.db.close();
  }
}

// ============================================================
// ROUTE FACTORY
// ============================================================

export function createAdditionalRoutes(
  agent: UniversalAgent,
  brain: Brain,
  scheduler?: Scheduler,
  workflowEngine?: WorkflowEngine,
  workflowStorage?: WorkflowStorage
): Router {
  const router = Router();

  // Initialize workflow storage if not provided
  const workflows = workflowStorage || new WorkflowStorage();

  // ============================================================
  // STATS
  // ============================================================

  router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const memoryStats = brain.getStats(userId);

      // Get task stats from state manager for this user
      const stateManager = agent.getStateManager();
      const userTasks = await stateManager.getTasksByUser(userId);

      const taskStats = {
        total: userTasks.length,
        completed: userTasks.filter(t => t.status.phase === 'completed').length,
        failed: userTasks.filter(t => t.status.phase === 'failed').length,
        running: userTasks.filter(t => t.status.phase === 'executing').length
      };

      // Get scheduler stats
      const schedulerStats = scheduler ? {
        totalJobs: scheduler.listJobs().length,
        enabledJobs: scheduler.listJobs({ enabled: true }).length,
        executionsToday: scheduler.listExecutions({ limit: 100 }).filter(e => {
          const today = new Date();
          const execDate = new Date(e.scheduledAt);
          return execDate.toDateString() === today.toDateString();
        }).length
      } : {
        totalJobs: 0,
        enabledJobs: 0,
        executionsToday: 0
      };

      // Get workflow stats
      const userWorkflows = workflows.list(userId);

      res.json({
        tasks: taskStats,
        memory: {
          total: memoryStats.totalMemories,
          byType: memoryStats.byType
        },
        agents: {
          total: 3, // coding, research, data
          active: taskStats.running > 0 ? 1 : 0
        },
        scheduler: schedulerStats,
        workflows: {
          total: userWorkflows.length
        }
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get stats'
      });
    }
  });

  // ============================================================
  // TASKS
  // ============================================================

  router.get('/tasks', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { status, limit = '50', offset = '0' } = req.query;
      const stateManager = agent.getStateManager();
      let tasks = await stateManager.getTasksByUser(userId);

      // Filter by status phase
      if (status) {
        tasks = tasks.filter(t => t.status.phase === status);
      }

      // Map to frontend format
      const mappedTasks = tasks.map(t => ({
        id: t.id,
        prompt: t.goal,
        status: t.status.phase,
        createdAt: t.createdAt.toISOString(),
        toolCalls: [],
        logs: []
      }));

      // Pagination
      const limitNum = parseInt(limit as string);
      const offsetNum = parseInt(offset as string);
      const paginatedTasks = mappedTasks.slice(offsetNum, offsetNum + limitNum);

      res.json({
        items: paginatedTasks,
        total: mappedTasks.length,
        page: Math.floor(offsetNum / limitNum) + 1,
        pageSize: limitNum,
        hasMore: offsetNum + limitNum < mappedTasks.length
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list tasks'
      });
    }
  });

  router.post('/tasks/:id/cancel', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const stateManager = agent.getStateManager();
      const task = await stateManager.getTask(id);

      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      // Mark as cancelled
      await stateManager.updateTaskStatus(id, { ...task.status, phase: 'failed' });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to cancel task'
      });
    }
  });

  // ============================================================
  // MEMORY
  // ============================================================

  router.get('/memory/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const memory = brain.getById(id);

      if (!memory) {
        res.status(404).json({ error: 'Memory not found' });
        return;
      }

      // Verify ownership
      if (memory.userId !== req.userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      res.json(memory);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get memory'
      });
    }
  });

  router.get('/memory', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { type, limit = '100', offset = '0' } = req.query;

      const limitNum = parseInt(limit as string);
      const offsetNum = parseInt(offset as string);

      // Get memories
      const types = type ? [type as string] : undefined;
      const memories = await brain.getRecentMemories(userId, limitNum + offsetNum, types as any);

      // Paginate
      const paginatedMemories = memories.slice(offsetNum, offsetNum + limitNum);

      res.json({
        items: paginatedMemories,
        total: memories.length,
        page: Math.floor(offsetNum / limitNum) + 1,
        pageSize: limitNum,
        hasMore: offsetNum + limitNum < memories.length
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list memories'
      });
    }
  });

  // ============================================================
  // AGENTS
  // ============================================================

  router.get('/agents', (req: AuthenticatedRequest, res: Response) => {
    res.json([
      {
        id: 'coding',
        name: 'Coding Agent',
        description: 'Code generation, file operations, debugging, and software development',
        capabilities: ['code_generation', 'file_operations', 'debugging', 'refactoring'],
        status: 'active'
      },
      {
        id: 'research',
        name: 'Research Agent',
        description: 'Web search, information gathering, summarization, and fact-checking',
        capabilities: ['web_search', 'summarization', 'fact_checking', 'data_gathering'],
        status: 'active'
      },
      {
        id: 'data',
        name: 'Data Analysis Agent',
        description: 'Data analysis, visualization, statistics, and report generation',
        capabilities: ['data_analysis', 'visualization', 'statistics', 'reporting'],
        status: 'active'
      }
    ]);
  });

  // ============================================================
  // SCHEDULER
  // ============================================================

  router.get('/scheduler/jobs', (req: AuthenticatedRequest, res: Response) => {
    if (!scheduler) {
      res.json([]);
      return;
    }

    try {
      const jobs = scheduler.listJobs();
      res.json(jobs.map(job => ({
        ...job,
        nextRun: getNextRunTime(job)
      })));
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list jobs'
      });
    }
  });

  router.post('/scheduler/jobs', (req: AuthenticatedRequest, res: Response) => {
    if (!scheduler) {
      res.status(501).json({ error: 'Scheduler not configured' });
      return;
    }

    try {
      const { name, description, schedule, config, enabled, retries, retryDelay, timeout, tags } = req.body;

      if (!name || !schedule || !config) {
        res.status(400).json({ error: 'name, schedule, and config are required' });
        return;
      }

      const job = scheduler.createJob({
        name,
        description,
        schedule,
        config,
        enabled: enabled !== false,
        retries,
        retryDelay,
        timeout,
        tags
      });

      res.status(201).json(job);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to create job'
      });
    }
  });

  router.get('/scheduler/jobs/:id', (req: AuthenticatedRequest, res: Response) => {
    if (!scheduler) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    try {
      const job = scheduler.getJob(req.params.id);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      res.json({
        ...job,
        nextRun: getNextRunTime(job)
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get job'
      });
    }
  });

  router.patch('/scheduler/jobs/:id', (req: AuthenticatedRequest, res: Response) => {
    if (!scheduler) {
      res.status(501).json({ error: 'Scheduler not configured' });
      return;
    }

    try {
      const job = scheduler.updateJob(req.params.id, req.body);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      res.json(job);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to update job'
      });
    }
  });

  router.delete('/scheduler/jobs/:id', (req: AuthenticatedRequest, res: Response) => {
    if (!scheduler) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    try {
      const deleted = scheduler.deleteJob(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to delete job'
      });
    }
  });

  router.post('/scheduler/jobs/:id/toggle', (req: AuthenticatedRequest, res: Response) => {
    if (!scheduler) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    try {
      const { enabled } = req.body;
      const success = enabled ? scheduler.enableJob(req.params.id) : scheduler.disableJob(req.params.id);

      if (!success) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const job = scheduler.getJob(req.params.id);
      res.json(job);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to toggle job'
      });
    }
  });

  router.get('/scheduler/jobs/:id/executions', (req: AuthenticatedRequest, res: Response) => {
    if (!scheduler) {
      res.json([]);
      return;
    }

    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const executions = scheduler.listExecutions({ jobId: req.params.id, limit });
      res.json(executions);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get executions'
      });
    }
  });

  router.post('/scheduler/jobs/:id/run', async (req: AuthenticatedRequest, res: Response) => {
    if (!scheduler) {
      res.status(501).json({ error: 'Scheduler not configured' });
      return;
    }

    try {
      const job = scheduler.getJob(req.params.id);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const execution = await scheduler.executeJob(job, true);
      res.json(execution);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to run job'
      });
    }
  });

  // ============================================================
  // WORKFLOWS
  // ============================================================

  router.get('/workflows', (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const userWorkflows = workflows.list(userId);
      res.json(userWorkflows);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list workflows'
      });
    }
  });

  router.post('/workflows', (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const workflow = workflows.create(userId, req.body);
      res.status(201).json(workflow);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to create workflow'
      });
    }
  });

  router.get('/workflows/:id', (req: AuthenticatedRequest, res: Response) => {
    try {
      const workflow = workflows.get(req.params.id);
      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }

      // Check ownership
      if (workflow.userId !== req.userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      res.json(workflow);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get workflow'
      });
    }
  });

  router.patch('/workflows/:id', (req: AuthenticatedRequest, res: Response) => {
    try {
      const existing = workflows.get(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }

      if (existing.userId !== req.userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const updated = workflows.update(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to update workflow'
      });
    }
  });

  router.delete('/workflows/:id', (req: AuthenticatedRequest, res: Response) => {
    try {
      const existing = workflows.get(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }

      if (existing.userId !== req.userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      workflows.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to delete workflow'
      });
    }
  });

  router.post('/workflows/:id/execute', async (req: AuthenticatedRequest, res: Response) => {
    if (!workflowEngine) {
      res.status(501).json({ error: 'Workflow engine not configured' });
      return;
    }

    try {
      const userId = req.userId!;
      const workflow = workflows.get(req.params.id);

      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }

      if (workflow.userId !== userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const input = req.body.input || {};
      const execution = await workflowEngine.execute(workflow, input);

      // Save execution to storage
      workflows.saveExecution(userId, workflow.id, execution);

      res.json({
        id: execution.id,
        workflowId: execution.workflowId,
        status: execution.status,
        output: execution.output,
        error: execution.error,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to execute workflow'
      });
    }
  });

  router.get('/workflows/:id/executions', (req: AuthenticatedRequest, res: Response) => {
    try {
      const workflow = workflows.get(req.params.id);
      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }

      if (workflow.userId !== req.userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const limit = parseInt(req.query.limit as string) || 10;
      const executions = workflows.getExecutions(req.params.id, limit);
      res.json(executions);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get executions'
      });
    }
  });

  // ============================================================
  // WORKFLOW TEMPLATES
  // ============================================================

  router.get('/workflow-templates', (req: AuthenticatedRequest, res: Response) => {
    res.json([
      {
        id: 'template_data_pipeline',
        name: 'Data Processing Pipeline',
        description: 'Extract, transform, and load data with validation',
        category: 'data',
        nodes: [
          { id: 'start', config: { type: 'start' } },
          { id: 'extract', config: { type: 'task', task: 'Extract data from source', agent: 'data' } },
          { id: 'validate', config: { type: 'decision', conditions: [{ expression: 'data.length > 0', target: 'transform' }], default: 'error' } },
          { id: 'transform', config: { type: 'task', task: 'Transform and clean data', agent: 'data' } },
          { id: 'load', config: { type: 'task', task: 'Load data to destination', agent: 'data' } },
          { id: 'end', config: { type: 'end' } },
          { id: 'error', config: { type: 'end' } }
        ],
        edges: [
          { source: 'start', target: 'extract' },
          { source: 'extract', target: 'validate' },
          { source: 'transform', target: 'load' },
          { source: 'load', target: 'end' }
        ]
      },
      {
        id: 'template_code_review',
        name: 'Automated Code Review',
        description: 'Review code for quality, security, and best practices',
        category: 'coding',
        nodes: [
          { id: 'start', config: { type: 'start' } },
          { id: 'analyze', config: { type: 'task', task: 'Analyze code structure', agent: 'coding' } },
          { id: 'security', config: { type: 'task', task: 'Check for security issues', agent: 'coding' } },
          { id: 'quality', config: { type: 'task', task: 'Review code quality', agent: 'coding' } },
          { id: 'report', config: { type: 'transform', operations: [{ type: 'merge', expression: 'analyze,security,quality' }] } },
          { id: 'end', config: { type: 'end' } }
        ],
        edges: [
          { source: 'start', target: 'analyze' },
          { source: 'analyze', target: 'security' },
          { source: 'security', target: 'quality' },
          { source: 'quality', target: 'report' },
          { source: 'report', target: 'end' }
        ]
      },
      {
        id: 'template_research',
        name: 'Research & Summarize',
        description: 'Research a topic and create a comprehensive summary',
        category: 'research',
        nodes: [
          { id: 'start', config: { type: 'start' } },
          { id: 'search', config: { type: 'task', task: 'Search for information on ${topic}', agent: 'research' } },
          { id: 'analyze', config: { type: 'task', task: 'Analyze and verify findings', agent: 'research' } },
          { id: 'summarize', config: { type: 'task', task: 'Create comprehensive summary', agent: 'research' } },
          { id: 'end', config: { type: 'end' } }
        ],
        edges: [
          { source: 'start', target: 'search' },
          { source: 'search', target: 'analyze' },
          { source: 'analyze', target: 'summarize' },
          { source: 'summarize', target: 'end' }
        ],
        inputs: [{ name: 'topic', type: 'string', required: true }]
      }
    ]);
  });

  return router;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getNextRunTime(job: any): string | null {
  if (!job.enabled) return null;

  const schedule = job.schedule;
  const now = new Date();

  switch (schedule.type) {
    case 'cron':
      // Simple next occurrence calculation
      return new Date(now.getTime() + 60000).toISOString(); // Placeholder
    case 'interval':
      return new Date(now.getTime() + schedule.milliseconds).toISOString();
    case 'once':
      const target = new Date(schedule.at);
      return target > now ? schedule.at : null;
    default:
      return null;
  }
}

// Export WorkflowStorage for use in server
export { WorkflowStorage };
