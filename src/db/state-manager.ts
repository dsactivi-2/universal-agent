// ============================================================
// STATE MANAGER - SQLite-based local storage
// ============================================================

import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type {
  Task,
  TaskId,
  TaskState,
  ExecutionPlan,
  StepResult,
  TaskStatus,
  UserId
} from '../types/index.js';

export class StateManager {
  private db: Database.Database;

  constructor(dbPath: string = './data/agent.db') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  // ============================================================
  // SCHEMA
  // ============================================================

  private initSchema(): void {
    this.db.exec(`
      -- Tasks
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        goal TEXT NOT NULL,
        context TEXT DEFAULT '{}',
        constraints TEXT DEFAULT '[]',
        priority TEXT DEFAULT 'normal',
        deadline TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(json_extract(status, '$.phase'));

      -- Execution Plans
      CREATE TABLE IF NOT EXISTS execution_plans (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id),
        version INTEGER DEFAULT 1,
        steps TEXT NOT NULL,
        dependencies TEXT DEFAULT '[]',
        error_handling TEXT NOT NULL,
        estimates TEXT NOT NULL,
        checkpoints TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_plans_task_id ON execution_plans(task_id);

      -- Step Results
      CREATE TABLE IF NOT EXISTS step_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        status TEXT NOT NULL,
        output TEXT,
        error TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        duration INTEGER DEFAULT 0,
        cost REAL DEFAULT 0,
        logs TEXT DEFAULT '[]',
        tool_calls TEXT DEFAULT '[]',
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_results_task_id ON step_results(task_id);

      -- Task State (runtime cache)
      CREATE TABLE IF NOT EXISTS task_states (
        task_id TEXT PRIMARY KEY,
        current_step_index INTEGER DEFAULT 0,
        accumulated_context TEXT DEFAULT '{}',
        last_checkpoint TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      -- Error Logs
      CREATE TABLE IF NOT EXISTS error_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT,
        error TEXT NOT NULL,
        stack TEXT,
        created_at TEXT NOT NULL
      );
    `);
  }

  // ============================================================
  // TASK MANAGEMENT
  // ============================================================

  generateId(): string {
    return uuid();
  }

  async saveTask(task: Task): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (id, user_id, goal, context, constraints, priority, deadline, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      task.id,
      task.userId,
      task.goal,
      JSON.stringify(task.context),
      JSON.stringify(task.constraints),
      task.priority,
      task.deadline?.toISOString() ?? null,
      JSON.stringify(task.status),
      task.createdAt.toISOString(),
      new Date().toISOString()
    );
  }

  async getTask(taskId: TaskId): Promise<Task | null> {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      goal: row.goal,
      context: JSON.parse(row.context),
      constraints: JSON.parse(row.constraints),
      priority: row.priority,
      deadline: row.deadline ? new Date(row.deadline) : undefined,
      status: JSON.parse(row.status),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  async updateTaskStatus(taskId: TaskId, status: TaskStatus): Promise<void> {
    this.db.prepare(`
      UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?
    `).run(JSON.stringify(status), new Date().toISOString(), taskId);
  }

  async getTasksByUser(userId: UserId): Promise<Task[]> {
    const rows = this.db.prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      goal: row.goal,
      context: JSON.parse(row.context),
      constraints: JSON.parse(row.constraints),
      priority: row.priority,
      deadline: row.deadline ? new Date(row.deadline) : undefined,
      status: JSON.parse(row.status),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  // ============================================================
  // EXECUTION PLANS
  // ============================================================

  async savePlan(plan: ExecutionPlan): Promise<void> {
    this.db.prepare(`
      INSERT INTO execution_plans (id, task_id, version, steps, dependencies, error_handling, estimates, checkpoints, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      plan.id,
      plan.taskId,
      plan.version,
      JSON.stringify(plan.steps),
      JSON.stringify(plan.dependencies),
      JSON.stringify(plan.errorHandling),
      JSON.stringify(plan.estimates),
      JSON.stringify(plan.checkpoints),
      plan.createdAt.toISOString()
    );
  }

  async getPlan(taskId: TaskId): Promise<ExecutionPlan | null> {
    const row = this.db.prepare(`
      SELECT * FROM execution_plans WHERE task_id = ? ORDER BY version DESC LIMIT 1
    `).get(taskId) as any;

    if (!row) return null;

    return {
      id: row.id,
      taskId: row.task_id,
      version: row.version,
      steps: JSON.parse(row.steps),
      dependencies: JSON.parse(row.dependencies),
      errorHandling: JSON.parse(row.error_handling),
      estimates: JSON.parse(row.estimates),
      checkpoints: JSON.parse(row.checkpoints),
      createdAt: new Date(row.created_at)
    };
  }

  // ============================================================
  // TASK STATE (Runtime)
  // ============================================================

  async getTaskState(taskId: TaskId): Promise<TaskState | null> {
    const task = await this.getTask(taskId);
    if (!task) return null;

    const plan = await this.getPlan(taskId);
    const stateRow = this.db.prepare('SELECT * FROM task_states WHERE task_id = ?').get(taskId) as any;
    const completedSteps = await this.getStepResults(taskId);

    return {
      task,
      plan: plan ?? undefined,
      currentStepIndex: stateRow?.current_step_index ?? 0,
      completedSteps,
      accumulatedContext: stateRow ? JSON.parse(stateRow.accumulated_context) : {},
      lastCheckpoint: stateRow?.last_checkpoint ? JSON.parse(stateRow.last_checkpoint) : undefined
    };
  }

  async updateTaskState(taskId: TaskId, state: Partial<TaskState>): Promise<void> {
    const existing = this.db.prepare('SELECT task_id FROM task_states WHERE task_id = ?').get(taskId);

    if (existing) {
      this.db.prepare(`
        UPDATE task_states SET
          current_step_index = COALESCE(?, current_step_index),
          accumulated_context = COALESCE(?, accumulated_context),
          last_checkpoint = COALESCE(?, last_checkpoint),
          updated_at = ?
        WHERE task_id = ?
      `).run(
        state.currentStepIndex ?? null,
        state.accumulatedContext ? JSON.stringify(state.accumulatedContext) : null,
        state.lastCheckpoint ? JSON.stringify(state.lastCheckpoint) : null,
        new Date().toISOString(),
        taskId
      );
    } else {
      this.db.prepare(`
        INSERT INTO task_states (task_id, current_step_index, accumulated_context, last_checkpoint, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        taskId,
        state.currentStepIndex ?? 0,
        JSON.stringify(state.accumulatedContext ?? {}),
        state.lastCheckpoint ? JSON.stringify(state.lastCheckpoint) : null,
        new Date().toISOString()
      );
    }
  }

  // ============================================================
  // STEP RESULTS
  // ============================================================

  async saveStepResult(taskId: TaskId, result: StepResult): Promise<void> {
    this.db.prepare(`
      INSERT INTO step_results (task_id, step_id, status, output, error, started_at, completed_at, duration, cost, logs, tool_calls)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      taskId,
      result.stepId,
      result.status,
      result.output ? JSON.stringify(result.output) : null,
      result.error ? JSON.stringify(result.error) : null,
      result.startedAt.toISOString(),
      result.completedAt?.toISOString() ?? null,
      result.duration,
      result.cost,
      JSON.stringify(result.logs),
      JSON.stringify(result.toolCalls)
    );
  }

  async getStepResults(taskId: TaskId): Promise<StepResult[]> {
    const rows = this.db.prepare('SELECT * FROM step_results WHERE task_id = ? ORDER BY id').all(taskId) as any[];

    return rows.map(row => ({
      stepId: row.step_id,
      status: row.status,
      output: row.output ? JSON.parse(row.output) : undefined,
      error: row.error ? JSON.parse(row.error) : undefined,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      duration: row.duration,
      cost: row.cost,
      logs: JSON.parse(row.logs),
      toolCalls: JSON.parse(row.tool_calls)
    }));
  }

  // ============================================================
  // ERROR LOGGING
  // ============================================================

  async logError(taskId: TaskId | null, error: Error): Promise<void> {
    this.db.prepare(`
      INSERT INTO error_logs (task_id, error, stack, created_at)
      VALUES (?, ?, ?, ?)
    `).run(
      taskId,
      error.message,
      error.stack ?? null,
      new Date().toISOString()
    );
  }

  // ============================================================
  // CLEANUP
  // ============================================================

  close(): void {
    this.db.close();
  }
}

// Singleton for convenience
let instance: StateManager | null = null;

export function getStateManager(dbPath?: string): StateManager {
  if (!instance) {
    instance = new StateManager(dbPath);
  }
  return instance;
}
