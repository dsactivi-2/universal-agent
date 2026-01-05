// ============================================================
// WORKFLOW TYPES
// Types for multi-step workflow definitions
// ============================================================

// ============================================================
// NODE TYPES
// ============================================================

export type WorkflowNodeType =
  | 'start'
  | 'end'
  | 'task'
  | 'decision'
  | 'parallel'
  | 'loop'
  | 'wait'
  | 'human_input'
  | 'webhook'
  | 'transform';

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  description?: string;
  config: NodeConfig;
  position?: { x: number; y: number };
}

export type NodeConfig =
  | StartNodeConfig
  | EndNodeConfig
  | TaskNodeConfig
  | DecisionNodeConfig
  | ParallelNodeConfig
  | LoopNodeConfig
  | WaitNodeConfig
  | HumanInputNodeConfig
  | WebhookNodeConfig
  | TransformNodeConfig;

export interface StartNodeConfig {
  type: 'start';
  inputs?: WorkflowInput[];
}

export interface EndNodeConfig {
  type: 'end';
  outputs?: string[];
}

export interface TaskNodeConfig {
  type: 'task';
  agent?: string;
  task: string;
  tools?: string[];
  timeout?: number;
  retries?: number;
  onError?: 'fail' | 'continue' | 'retry';
}

export interface DecisionNodeConfig {
  type: 'decision';
  conditions: DecisionCondition[];
  default?: string;
}

export interface DecisionCondition {
  expression: string;
  target: string;
}

export interface ParallelNodeConfig {
  type: 'parallel';
  branches: string[];
  waitFor: 'all' | 'any' | number;
}

export interface LoopNodeConfig {
  type: 'loop';
  iterator: string;
  collection: string;
  body: string;
  maxIterations?: number;
}

export interface WaitNodeConfig {
  type: 'wait';
  duration?: number;
  until?: string;
  event?: string;
}

export interface HumanInputNodeConfig {
  type: 'human_input';
  prompt: string;
  fields: InputField[];
  timeout?: number;
}

export interface InputField {
  name: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'multiselect';
  label: string;
  required?: boolean;
  options?: string[];
  default?: unknown;
}

export interface WebhookNodeConfig {
  type: 'webhook';
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export interface TransformNodeConfig {
  type: 'transform';
  operations: TransformOperation[];
}

export interface TransformOperation {
  type: 'map' | 'filter' | 'reduce' | 'extract' | 'format' | 'merge';
  expression: string;
  target?: string;
}

// ============================================================
// EDGE TYPES
// ============================================================

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: string;
}

// ============================================================
// WORKFLOW DEFINITION
// ============================================================

export interface WorkflowInput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  required?: boolean;
  default?: unknown;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  version: string;
  inputs?: WorkflowInput[];
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// EXECUTION TYPES
// ============================================================

export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type NodeStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface NodeExecution {
  nodeId: string;
  status: NodeStatus;
  startedAt?: string;
  completedAt?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  retries?: number;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: WorkflowStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  variables: Record<string, unknown>;
  nodeExecutions: Map<string, NodeExecution>;
  currentNodes: string[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}

// ============================================================
// EVENT TYPES
// ============================================================

export interface WorkflowEvent {
  type: 'node_started' | 'node_completed' | 'node_failed' | 'workflow_completed' | 'workflow_failed' | 'human_input_required';
  timestamp: string;
  executionId: string;
  nodeId?: string;
  data?: Record<string, unknown>;
}

export interface WorkflowCallbacks {
  onNodeStart?: (nodeId: string, input: Record<string, unknown>) => void;
  onNodeComplete?: (nodeId: string, output: Record<string, unknown>) => void;
  onNodeError?: (nodeId: string, error: string) => void;
  onWorkflowComplete?: (output: Record<string, unknown>) => void;
  onWorkflowError?: (error: string) => void;
  onHumanInputRequired?: (nodeId: string, config: HumanInputNodeConfig) => Promise<Record<string, unknown>>;
}
