// ============================================================
// WORKFLOW BUILDER
// Fluent API for creating workflows
// ============================================================

import { v4 as uuid } from 'uuid';
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
  WorkflowInput,
  TaskNodeConfig,
  DecisionNodeConfig,
  ParallelNodeConfig,
  LoopNodeConfig,
  WaitNodeConfig,
  TransformNodeConfig,
  WebhookNodeConfig,
  HumanInputNodeConfig,
  InputField
} from './types.js';

// ============================================================
// WORKFLOW BUILDER
// ============================================================

export class WorkflowBuilder {
  private workflow: WorkflowDefinition;
  private currentNodeId: string | null = null;

  constructor(name: string, description?: string) {
    this.workflow = {
      id: uuid(),
      name,
      description,
      version: '1.0.0',
      nodes: [],
      edges: [],
      variables: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  // ============================================================
  // INPUT DEFINITION
  // ============================================================

  /**
   * Add workflow input
   */
  input(name: string, type: WorkflowInput['type'], options?: {
    description?: string;
    required?: boolean;
    default?: unknown;
  }): this {
    if (!this.workflow.inputs) {
      this.workflow.inputs = [];
    }

    this.workflow.inputs.push({
      name,
      type,
      description: options?.description,
      required: options?.required ?? true,
      default: options?.default
    });

    return this;
  }

  // ============================================================
  // NODE CREATION
  // ============================================================

  /**
   * Add start node
   */
  start(id?: string): this {
    const nodeId = id || 'start';
    this.addNode({
      id: nodeId,
      type: 'start',
      name: 'Start',
      config: { type: 'start' }
    });
    this.currentNodeId = nodeId;
    return this;
  }

  /**
   * Add end node
   */
  end(id?: string): this {
    const nodeId = id || 'end';
    this.addNode({
      id: nodeId,
      type: 'end',
      name: 'End',
      config: { type: 'end' }
    });

    if (this.currentNodeId) {
      this.connect(this.currentNodeId, nodeId);
    }
    this.currentNodeId = null;
    return this;
  }

  /**
   * Add task node
   */
  task(id: string, task: string, options?: {
    name?: string;
    agent?: string;
    tools?: string[];
    timeout?: number;
    retries?: number;
    onError?: 'fail' | 'continue' | 'retry';
  }): this {
    const config: TaskNodeConfig = {
      type: 'task',
      task,
      agent: options?.agent,
      tools: options?.tools,
      timeout: options?.timeout,
      retries: options?.retries,
      onError: options?.onError
    };

    this.addNode({
      id,
      type: 'task',
      name: options?.name || id,
      config
    });

    if (this.currentNodeId) {
      this.connect(this.currentNodeId, id);
    }
    this.currentNodeId = id;
    return this;
  }

  /**
   * Add decision node
   */
  decision(id: string, conditions: Array<{ when: string; then: string }>, options?: {
    name?: string;
    default?: string;
  }): this {
    const config: DecisionNodeConfig = {
      type: 'decision',
      conditions: conditions.map(c => ({
        expression: c.when,
        target: c.then
      })),
      default: options?.default
    };

    this.addNode({
      id,
      type: 'decision',
      name: options?.name || id,
      config
    });

    if (this.currentNodeId) {
      this.connect(this.currentNodeId, id);
    }
    // Don't set currentNodeId - decision branches explicitly
    return this;
  }

  /**
   * Add parallel execution node
   */
  parallel(id: string, branches: string[], options?: {
    name?: string;
    waitFor?: 'all' | 'any' | number;
  }): this {
    const config: ParallelNodeConfig = {
      type: 'parallel',
      branches,
      waitFor: options?.waitFor || 'all'
    };

    this.addNode({
      id,
      type: 'parallel',
      name: options?.name || id,
      config
    });

    if (this.currentNodeId) {
      this.connect(this.currentNodeId, id);
    }
    this.currentNodeId = id;
    return this;
  }

  /**
   * Add loop node
   */
  loop(id: string, options: {
    name?: string;
    iterator: string;
    collection: string;
    body: string;
    maxIterations?: number;
  }): this {
    const config: LoopNodeConfig = {
      type: 'loop',
      iterator: options.iterator,
      collection: options.collection,
      body: options.body,
      maxIterations: options.maxIterations
    };

    this.addNode({
      id,
      type: 'loop',
      name: options.name || id,
      config
    });

    if (this.currentNodeId) {
      this.connect(this.currentNodeId, id);
    }
    this.currentNodeId = id;
    return this;
  }

  /**
   * Add wait node
   */
  wait(id: string, options: {
    name?: string;
    duration?: number;
    until?: string;
    event?: string;
  }): this {
    const config: WaitNodeConfig = {
      type: 'wait',
      duration: options.duration,
      until: options.until,
      event: options.event
    };

    this.addNode({
      id,
      type: 'wait',
      name: options.name || id,
      config
    });

    if (this.currentNodeId) {
      this.connect(this.currentNodeId, id);
    }
    this.currentNodeId = id;
    return this;
  }

  /**
   * Add transform node
   */
  transform(id: string, operations: Array<{
    type: 'map' | 'filter' | 'reduce' | 'extract' | 'format' | 'merge';
    expression: string;
    target?: string;
  }>, options?: { name?: string }): this {
    const config: TransformNodeConfig = {
      type: 'transform',
      operations
    };

    this.addNode({
      id,
      type: 'transform',
      name: options?.name || id,
      config
    });

    if (this.currentNodeId) {
      this.connect(this.currentNodeId, id);
    }
    this.currentNodeId = id;
    return this;
  }

  /**
   * Add webhook node
   */
  webhook(id: string, options: {
    name?: string;
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  }): this {
    const config: WebhookNodeConfig = {
      type: 'webhook',
      url: options.url,
      method: options.method,
      headers: options.headers,
      body: options.body,
      timeout: options.timeout
    };

    this.addNode({
      id,
      type: 'webhook',
      name: options.name || id,
      config
    });

    if (this.currentNodeId) {
      this.connect(this.currentNodeId, id);
    }
    this.currentNodeId = id;
    return this;
  }

  /**
   * Add human input node
   */
  humanInput(id: string, options: {
    name?: string;
    prompt: string;
    fields: InputField[];
    timeout?: number;
  }): this {
    const config: HumanInputNodeConfig = {
      type: 'human_input',
      prompt: options.prompt,
      fields: options.fields,
      timeout: options.timeout
    };

    this.addNode({
      id,
      type: 'human_input',
      name: options.name || id,
      config
    });

    if (this.currentNodeId) {
      this.connect(this.currentNodeId, id);
    }
    this.currentNodeId = id;
    return this;
  }

  // ============================================================
  // EDGE CREATION
  // ============================================================

  /**
   * Connect two nodes
   */
  connect(sourceId: string, targetId: string, options?: {
    label?: string;
    condition?: string;
  }): this {
    this.workflow.edges.push({
      id: `${sourceId}->${targetId}`,
      source: sourceId,
      target: targetId,
      label: options?.label,
      condition: options?.condition
    });
    return this;
  }

  /**
   * Continue from a specific node
   */
  from(nodeId: string): this {
    this.currentNodeId = nodeId;
    return this;
  }

  // ============================================================
  // VARIABLES
  // ============================================================

  /**
   * Set workflow variable
   */
  variable(name: string, value: unknown): this {
    if (!this.workflow.variables) {
      this.workflow.variables = {};
    }
    this.workflow.variables[name] = value;
    return this;
  }

  // ============================================================
  // BUILD
  // ============================================================

  /**
   * Build and return the workflow definition
   */
  build(): WorkflowDefinition {
    this.workflow.updatedAt = new Date().toISOString();
    return { ...this.workflow };
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private addNode(node: WorkflowNode): void {
    // Check for duplicate IDs
    if (this.workflow.nodes.some(n => n.id === node.id)) {
      throw new Error(`Node with ID "${node.id}" already exists`);
    }
    this.workflow.nodes.push(node);
  }
}

// ============================================================
// HELPER FUNCTION
// ============================================================

export function createWorkflow(name: string, description?: string): WorkflowBuilder {
  return new WorkflowBuilder(name, description);
}
