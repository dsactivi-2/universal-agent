// ============================================================
// UNIVERSAL AGENT - CORE TYPES
// Fixed version of Grok's design
// ============================================================

import { z } from 'zod';

// ============================================================
// IDs & UTILITIES
// ============================================================

export type TaskId = string;
export type StepId = string;
export type AgentId = string;
export type ToolId = string;
export type UserId = string;

// ============================================================
// TASK - Die Grundeinheit der Arbeit
// ============================================================

export const TaskPriority = z.enum(['low', 'normal', 'high', 'critical']);
export type TaskPriority = z.infer<typeof TaskPriority>;

export const TaskPhase = z.enum([
  'received',
  'analyzing',
  'planning',
  'executing',
  'waiting',
  'evaluating',
  'completed',
  'failed'
]);
export type TaskPhase = z.infer<typeof TaskPhase>;

export interface TaskStatus {
  phase: TaskPhase;
  currentStep?: StepId;
  progress?: number; // 0-100
  error?: TaskError;
  waitingFor?: string;
}

export interface TaskError {
  code: string;
  message: string;
  details?: unknown;
  recoverable: boolean;
}

export interface Constraint {
  type: 'budget' | 'time' | 'approval' | 'scope' | 'tool' | 'custom';
  description: string;
  value: unknown;
  strict: boolean;
}

export interface Task {
  id: TaskId;
  userId: UserId;
  goal: string;
  context: Record<string, unknown>;
  constraints: Constraint[];
  priority: TaskPriority;
  deadline?: Date;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// EXECUTION PLAN
// ============================================================

export interface StepInput {
  name: string;
  source:
    | { type: 'literal'; value: unknown }
    | { type: 'context'; path: string }
    | { type: 'step'; stepId: StepId; outputPath: string }
    | { type: 'user'; prompt: string };
  required: boolean;
  default?: unknown;
}

export interface PlanStep {
  id: StepId;
  name: string;
  description: string;
  agentId: AgentId;
  action: {
    type: string;
    params: Record<string, unknown>;
  };
  inputs: StepInput[];
  expectedOutput?: Record<string, unknown>;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  requiresApproval: boolean;
  approvalPrompt?: string;
}

export interface Dependency {
  stepId: StepId;
  dependsOn: StepId[];
  condition?: string;
}

export type ErrorStrategyType = 'abort' | 'skip' | 'retry' | 'fallback' | 'ask_user';

export interface StepErrorOverride {
  strategy: ErrorStrategyType;
  fallbackStepId?: StepId;
  maxRetries?: number;
}

export interface ErrorStrategy {
  default: ErrorStrategyType;
  stepOverrides: Record<StepId, StepErrorOverride>;
}

export interface PlanEstimates {
  totalDuration: number;  // ms
  totalCost: number;      // USD
  confidence: number;     // 0-1
}

export interface Checkpoint {
  afterStepId: StepId;
  saveState: boolean;
  notifyUser: boolean;
  message?: string;
}

export interface ExecutionPlan {
  id: string;
  taskId: TaskId;
  version: number;
  steps: PlanStep[];
  dependencies: Dependency[];
  errorHandling: ErrorStrategy;
  estimates: PlanEstimates;
  checkpoints: Checkpoint[];
  createdAt: Date;
}

// ============================================================
// EXECUTION RESULTS
// ============================================================

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  data?: unknown;
}

export interface ToolCallRecord {
  toolName: string;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  duration: number;
  timestamp: Date;
}

export type StepStatus = 'success' | 'failed' | 'skipped' | 'timeout' | 'pending' | 'running';

export interface StepResult {
  stepId: StepId;
  status: StepStatus;
  output?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    retryable: boolean;
  };
  startedAt: Date;
  completedAt?: Date;
  duration: number;
  cost: number;
  logs: LogEntry[];
  toolCalls: ToolCallRecord[];
}

export interface TaskResult {
  taskId: TaskId;
  success: boolean;
  output: unknown;
  summary: string;
  stepResults: StepResult[];
  totalDuration: number;
  totalCost: number;
  suggestedFollowUps?: string[];
}

// ============================================================
// TASK STATE (Runtime)
// ============================================================

export interface TaskState {
  task: Task;
  plan?: ExecutionPlan;
  currentStepIndex: number;
  completedSteps: StepResult[];
  accumulatedContext: Record<string, unknown>;
  lastCheckpoint?: {
    stepIndex: number;
    state: Record<string, unknown>;
    timestamp: Date;
  };
}

// ============================================================
// AGENT DEFINITION
// ============================================================

export interface Capability {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  examples?: Array<{ input: unknown; output: unknown }>;
  estimatedDuration: number;
  estimatedCost: number;
}

export interface ModelConfig {
  provider: 'anthropic' | 'openai';
  model: string;
  temperature: number;
  maxTokens: number;
  fallbackModel?: string;
}

export interface AgentDefinition {
  id: AgentId;
  name: string;
  description: string;
  domain: string[];
  capabilities: Capability[];
  requiredTools: ToolId[];
  systemPrompt: string;
  model: ModelConfig;
}

// ============================================================
// TOOL DEFINITION
// ============================================================

export interface ToolDefinition {
  name: ToolId;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  requiresConfirmation: boolean;
  costPerCall: number;
}

export interface Tool {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>): Promise<unknown>;
}

// ============================================================
// INTENT ANALYSIS
// ============================================================

export interface Intent {
  type: 'simple_query' | 'task' | 'clarification_needed';
  primaryGoal: string;
  subGoals: string[];
  entities: Record<string, unknown>;
  suggestedAgents: AgentId[];
  clarificationQuestions?: string[];
  urgency: 'low' | 'normal' | 'high';
}

// ============================================================
// USER REQUEST
// ============================================================

export interface UserRequest {
  message: string;
  userId: UserId;
  context?: Record<string, unknown>;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

// ============================================================
// CALLBACKS
// ============================================================

export interface ExecutionCallbacks {
  onLog: (entry: LogEntry) => void;
  onToolCall: (record: ToolCallRecord) => void;
  onProgress?: (stepId: StepId, progress: number) => void;
}

// ============================================================
// CUSTOM ERRORS
// ============================================================

export class AgentError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = false,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export class TimeoutError extends AgentError {
  constructor(timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms`, 'TIMEOUT', true);
    this.name = 'TimeoutError';
  }
}

export class UserInputRequired extends AgentError {
  constructor(
    public inputName: string,
    public prompt: string
  ) {
    super(`User input required: ${inputName}`, 'USER_INPUT_REQUIRED', true);
    this.name = 'UserInputRequired';
  }
}

export class PlanningError extends AgentError {
  constructor(message: string, details?: unknown) {
    super(message, 'PLANNING_FAILED', false, details);
    this.name = 'PlanningError';
  }
}
