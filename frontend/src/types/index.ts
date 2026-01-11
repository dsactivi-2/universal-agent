// ============================================================
// SHARED TYPES FOR FRONTEND
// ============================================================

// Task Types
export interface Task {
  id: string;
  prompt: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: string;
  error?: string;
  agentId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  toolCalls: ToolCall[];
  logs: LogEntry[];
}

export interface ToolCall {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  error?: string;
  duration: number;
  timestamp: string;
}

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
  data?: unknown;
}

// Agent Types
export interface Agent {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  status: 'idle' | 'busy';
}

// Memory Types
export interface Memory {
  id: string;
  type: 'conversation' | 'task' | 'fact' | 'preference' | 'code' | 'document';
  content: string;
  metadata: Record<string, unknown>;
  embedding?: number[];
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  importance: number;
}

export interface MemorySearchResult {
  memory: Memory;
  score: number;
  highlights?: string[];
}

// Workflow Types
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowNode {
  id: string;
  type: 'start' | 'end' | 'task' | 'decision' | 'parallel' | 'loop' | 'wait' | 'transform';
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  currentNodes: string[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}

// Scheduler Types
export interface ScheduledJob {
  id: string;
  name: string;
  description?: string;
  schedule: {
    type: 'cron' | 'interval' | 'once';
    expression: string;
  };
  jobType: 'task' | 'workflow' | 'webhook' | 'command';
  config: Record<string, unknown>;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  runCount: number;
  failCount: number;
  createdAt: string;
}

export interface JobExecution {
  id: string;
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: unknown;
  error?: string;
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
}

// Stats Types
export interface SystemStats {
  tasks: {
    total: number;
    completed: number;
    failed: number;
    running: number;
  };
  memory: {
    total: number;
    byType: Record<string, number>;
  };
  agents: {
    total: number;
    active: number;
  };
  scheduler: {
    totalJobs: number;
    enabledJobs: number;
    executionsToday: number;
  };
}

// Chat Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
