// ============================================================
// SCHEDULER TYPES
// Types for scheduled task execution
// ============================================================

// ============================================================
// SCHEDULE TYPES
// ============================================================

export interface CronSchedule {
  type: 'cron';
  expression: string;
  timezone?: string;
}

export interface IntervalSchedule {
  type: 'interval';
  milliseconds: number;
}

export interface OnceSchedule {
  type: 'once';
  at: Date | string;
}

export type Schedule = CronSchedule | IntervalSchedule | OnceSchedule;

// ============================================================
// JOB DEFINITION
// ============================================================

export type JobType = 'task' | 'workflow' | 'webhook' | 'command';

export interface BaseJobConfig {
  type: JobType;
}

export interface TaskJobConfig extends BaseJobConfig {
  type: 'task';
  message: string;
  agent?: string;
}

export interface WorkflowJobConfig extends BaseJobConfig {
  type: 'workflow';
  workflowId: string;
  input?: Record<string, unknown>;
}

export interface WebhookJobConfig extends BaseJobConfig {
  type: 'webhook';
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
}

export interface CommandJobConfig extends BaseJobConfig {
  type: 'command';
  command: string;
  cwd?: string;
  timeout?: number;
}

export type JobConfig = TaskJobConfig | WorkflowJobConfig | WebhookJobConfig | CommandJobConfig;

export interface ScheduledJob {
  id: string;
  name: string;
  description?: string;
  schedule: Schedule;
  config: JobConfig;
  enabled: boolean;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// EXECUTION TYPES
// ============================================================

export type JobExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

export interface JobExecution {
  id: string;
  jobId: string;
  status: JobExecutionStatus;
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
  retryCount?: number;
  duration?: number;
}

// ============================================================
// EVENT TYPES
// ============================================================

export interface SchedulerEvent {
  type: 'job_scheduled' | 'job_started' | 'job_completed' | 'job_failed' | 'job_cancelled';
  timestamp: string;
  jobId: string;
  executionId?: string;
  data?: Record<string, unknown>;
}

export interface SchedulerCallbacks {
  onJobStart?: (job: ScheduledJob, executionId: string) => void;
  onJobComplete?: (job: ScheduledJob, executionId: string, result: unknown) => void;
  onJobFail?: (job: ScheduledJob, executionId: string, error: string) => void;
}

// ============================================================
// SCHEDULER CONFIG
// ============================================================

export interface SchedulerConfig {
  dbPath?: string;
  maxConcurrent?: number;
  defaultRetries?: number;
  defaultTimeout?: number;
  tickInterval?: number;
}
