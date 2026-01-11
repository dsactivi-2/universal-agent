// ============================================================
// WORKFLOW ENGINE
// Execute multi-step workflows with conditions and loops
// ============================================================

import { v4 as uuid } from 'uuid';
import type {
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowNode,
  WorkflowEdge,
  WorkflowCallbacks,
  NodeExecution,
  NodeStatus,
  WorkflowStatus,
  TaskNodeConfig,
  DecisionNodeConfig,
  ParallelNodeConfig,
  LoopNodeConfig,
  WaitNodeConfig,
  TransformNodeConfig,
  WebhookNodeConfig
} from './types.js';

// ============================================================
// WORKFLOW AGENT INTERFACE
// ============================================================

/**
 * Simple agent interface for workflow compatibility.
 * Agents that want to work with workflows should implement this.
 */
export interface WorkflowAgent {
  execute(task: string): Promise<{ output: string; status: string }>;
}

// ============================================================
// EXPRESSION EVALUATOR
// ============================================================

/**
 * Simple expression evaluator for workflow conditions
 */
export function evaluateExpression(
  expression: string,
  context: Record<string, unknown>
): unknown {
  // Replace variable references with actual values
  const processedExpr = expression.replace(
    /\$\{([^}]+)\}/g,
    (_, path) => {
      const value = getNestedValue(context, path);
      return JSON.stringify(value);
    }
  );

  // Also support simple variable names
  const finalExpr = processedExpr.replace(
    /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g,
    (match) => {
      if (['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'].includes(match)) {
        return match;
      }
      if (match in context) {
        return JSON.stringify(context[match]);
      }
      return match;
    }
  );

  try {
    // Use Function constructor for safe evaluation
    return new Function('context', `with(context) { return ${finalExpr}; }`)(context);
  } catch (error) {
    console.warn(`Expression evaluation failed: ${expression}`, error);
    return false;
  }
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// ============================================================
// WORKFLOW ENGINE
// ============================================================

export class WorkflowEngine {
  private agents: Map<string, WorkflowAgent> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();

  /**
   * Register an agent for use in workflows
   */
  registerAgent(name: string, agent: WorkflowAgent): void {
    this.agents.set(name, agent);
  }

  /**
   * Execute a workflow
   */
  async execute(
    workflow: WorkflowDefinition,
    input: Record<string, unknown>,
    callbacks?: WorkflowCallbacks
  ): Promise<WorkflowExecution> {
    // Validate inputs
    this.validateInputs(workflow, input);

    // Create execution context
    const execution: WorkflowExecution = {
      id: uuid(),
      workflowId: workflow.id,
      status: 'running',
      input,
      variables: { ...workflow.variables, ...input },
      nodeExecutions: new Map(),
      currentNodes: [],
      startedAt: new Date().toISOString()
    };

    this.executions.set(execution.id, execution);

    try {
      // Find start node
      const startNode = workflow.nodes.find(n => n.config.type === 'start');
      if (!startNode) {
        throw new Error('Workflow has no start node');
      }

      // Execute from start node
      await this.executeNode(workflow, execution, startNode, callbacks);

      // Mark completed
      execution.status = 'completed';
      execution.completedAt = new Date().toISOString();
      execution.output = execution.variables;

      callbacks?.onWorkflowComplete?.(execution.output);

    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
      execution.completedAt = new Date().toISOString();

      callbacks?.onWorkflowError?.(execution.error);
    }

    return execution;
  }

  /**
   * Get execution by ID
   */
  getExecution(id: string): WorkflowExecution | undefined {
    return this.executions.get(id);
  }

  /**
   * Cancel a running execution
   */
  cancel(executionId: string): boolean {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'running') {
      return false;
    }

    execution.status = 'cancelled';
    execution.completedAt = new Date().toISOString();
    return true;
  }

  // ============================================================
  // NODE EXECUTION
  // ============================================================

  private async executeNode(
    workflow: WorkflowDefinition,
    execution: WorkflowExecution,
    node: WorkflowNode,
    callbacks?: WorkflowCallbacks
  ): Promise<void> {
    // Check if cancelled
    if (execution.status === 'cancelled') return;

    // Track current node
    execution.currentNodes.push(node.id);

    // Create node execution record
    const nodeExec: NodeExecution = {
      nodeId: node.id,
      status: 'running',
      startedAt: new Date().toISOString(),
      input: { ...execution.variables }
    };
    execution.nodeExecutions.set(node.id, nodeExec);

    callbacks?.onNodeStart?.(node.id, nodeExec.input || {});

    try {
      // Execute based on node type
      let output: Record<string, unknown> = {};

      switch (node.config.type) {
        case 'start':
          output = execution.input;
          break;

        case 'end':
          // End node - workflow complete
          nodeExec.status = 'completed';
          nodeExec.completedAt = new Date().toISOString();
          nodeExec.output = execution.variables;
          execution.currentNodes = execution.currentNodes.filter(id => id !== node.id);
          return;

        case 'task':
          output = await this.executeTaskNode(node.config as TaskNodeConfig, execution);
          break;

        case 'decision':
          await this.executeDecisionNode(workflow, execution, node, callbacks);
          return;

        case 'parallel':
          await this.executeParallelNode(workflow, execution, node, callbacks);
          return;

        case 'loop':
          await this.executeLoopNode(workflow, execution, node, callbacks);
          return;

        case 'wait':
          await this.executeWaitNode(node.config as WaitNodeConfig);
          break;

        case 'transform':
          output = this.executeTransformNode(node.config as TransformNodeConfig, execution);
          break;

        case 'webhook':
          output = await this.executeWebhookNode(node.config as WebhookNodeConfig, execution);
          break;

        case 'human_input':
          if (callbacks?.onHumanInputRequired) {
            output = await callbacks.onHumanInputRequired(node.id, node.config as any);
          } else {
            throw new Error('Human input required but no callback provided');
          }
          break;
      }

      // Update execution state
      nodeExec.status = 'completed';
      nodeExec.completedAt = new Date().toISOString();
      nodeExec.output = output;

      // Merge output into variables
      Object.assign(execution.variables, output);

      callbacks?.onNodeComplete?.(node.id, output);

      // Find and execute next nodes
      execution.currentNodes = execution.currentNodes.filter(id => id !== node.id);
      const nextEdges = workflow.edges.filter(e => e.source === node.id);

      for (const edge of nextEdges) {
        // Check edge condition if present
        if (edge.condition) {
          const conditionMet = evaluateExpression(edge.condition, execution.variables);
          if (!conditionMet) continue;
        }

        const nextNode = workflow.nodes.find(n => n.id === edge.target);
        if (nextNode) {
          await this.executeNode(workflow, execution, nextNode, callbacks);
        }
      }

    } catch (error) {
      nodeExec.status = 'failed';
      nodeExec.completedAt = new Date().toISOString();
      nodeExec.error = error instanceof Error ? error.message : String(error);

      callbacks?.onNodeError?.(node.id, nodeExec.error);

      // Handle error based on config
      const taskConfig = node.config as TaskNodeConfig;
      if (taskConfig.onError === 'continue') {
        // Continue to next nodes despite error
        execution.currentNodes = execution.currentNodes.filter(id => id !== node.id);
        const nextEdges = workflow.edges.filter(e => e.source === node.id);
        for (const edge of nextEdges) {
          const nextNode = workflow.nodes.find(n => n.id === edge.target);
          if (nextNode) {
            await this.executeNode(workflow, execution, nextNode, callbacks);
          }
        }
      } else if (taskConfig.onError === 'retry' && (nodeExec.retries || 0) < (taskConfig.retries || 3)) {
        nodeExec.retries = (nodeExec.retries || 0) + 1;
        nodeExec.status = 'pending';
        await this.executeNode(workflow, execution, node, callbacks);
      } else {
        throw error;
      }
    }
  }

  private async executeTaskNode(
    config: TaskNodeConfig,
    execution: WorkflowExecution
  ): Promise<Record<string, unknown>> {
    // Get agent
    const agentName = config.agent || 'default';
    const agent = this.agents.get(agentName);

    if (!agent) {
      throw new Error(`Agent not found: ${agentName}`);
    }

    // Substitute variables in task
    const task = this.substituteVariables(config.task, execution.variables);

    // Execute agent task
    const result = await agent.execute(task);

    return {
      taskResult: result.output,
      taskStatus: result.status
    };
  }

  private async executeDecisionNode(
    workflow: WorkflowDefinition,
    execution: WorkflowExecution,
    node: WorkflowNode,
    callbacks?: WorkflowCallbacks
  ): Promise<void> {
    const config = node.config as DecisionNodeConfig;

    // Evaluate conditions in order
    let targetNodeId: string | undefined;

    for (const condition of config.conditions) {
      const result = evaluateExpression(condition.expression, execution.variables);
      if (result) {
        targetNodeId = condition.target;
        break;
      }
    }

    // Use default if no condition matched
    if (!targetNodeId && config.default) {
      targetNodeId = config.default;
    }

    if (!targetNodeId) {
      throw new Error('No condition matched and no default specified');
    }

    // Mark decision node as complete
    const nodeExec = execution.nodeExecutions.get(node.id);
    if (nodeExec) {
      nodeExec.status = 'completed';
      nodeExec.completedAt = new Date().toISOString();
      nodeExec.output = { selectedBranch: targetNodeId };
    }

    callbacks?.onNodeComplete?.(node.id, { selectedBranch: targetNodeId });

    // Execute target node
    execution.currentNodes = execution.currentNodes.filter(id => id !== node.id);
    const targetNode = workflow.nodes.find(n => n.id === targetNodeId);
    if (targetNode) {
      await this.executeNode(workflow, execution, targetNode, callbacks);
    }
  }

  private async executeParallelNode(
    workflow: WorkflowDefinition,
    execution: WorkflowExecution,
    node: WorkflowNode,
    callbacks?: WorkflowCallbacks
  ): Promise<void> {
    const config = node.config as ParallelNodeConfig;

    // Execute all branches in parallel
    const branchPromises = config.branches.map(async (branchId) => {
      const branchNode = workflow.nodes.find(n => n.id === branchId);
      if (branchNode) {
        await this.executeNode(workflow, execution, branchNode, callbacks);
      }
    });

    if (config.waitFor === 'all') {
      await Promise.all(branchPromises);
    } else if (config.waitFor === 'any') {
      await Promise.race(branchPromises);
    } else if (typeof config.waitFor === 'number') {
      const results = await Promise.allSettled(branchPromises);
      const completed = results.filter(r => r.status === 'fulfilled').length;
      if (completed < config.waitFor) {
        throw new Error(`Only ${completed} branches completed, needed ${config.waitFor}`);
      }
    }

    // Mark parallel node complete
    const nodeExec = execution.nodeExecutions.get(node.id);
    if (nodeExec) {
      nodeExec.status = 'completed';
      nodeExec.completedAt = new Date().toISOString();
    }

    callbacks?.onNodeComplete?.(node.id, {});

    // Continue to next nodes
    execution.currentNodes = execution.currentNodes.filter(id => id !== node.id);
    const nextEdges = workflow.edges.filter(e => e.source === node.id);
    for (const edge of nextEdges) {
      const nextNode = workflow.nodes.find(n => n.id === edge.target);
      if (nextNode) {
        await this.executeNode(workflow, execution, nextNode, callbacks);
      }
    }
  }

  private async executeLoopNode(
    workflow: WorkflowDefinition,
    execution: WorkflowExecution,
    node: WorkflowNode,
    callbacks?: WorkflowCallbacks
  ): Promise<void> {
    const config = node.config as LoopNodeConfig;

    // Get collection to iterate
    const collection = evaluateExpression(config.collection, execution.variables) as unknown[];
    if (!Array.isArray(collection)) {
      throw new Error(`Loop collection is not an array: ${config.collection}`);
    }

    const maxIterations = config.maxIterations || 1000;
    let iteration = 0;

    for (const item of collection) {
      if (iteration >= maxIterations) {
        console.warn(`Loop reached max iterations: ${maxIterations}`);
        break;
      }

      // Set iterator variable
      execution.variables[config.iterator] = item;
      execution.variables[`${config.iterator}_index`] = iteration;

      // Execute loop body
      const bodyNode = workflow.nodes.find(n => n.id === config.body);
      if (bodyNode) {
        await this.executeNode(workflow, execution, bodyNode, callbacks);
      }

      iteration++;
    }

    // Mark loop node complete
    const nodeExec = execution.nodeExecutions.get(node.id);
    if (nodeExec) {
      nodeExec.status = 'completed';
      nodeExec.completedAt = new Date().toISOString();
      nodeExec.output = { iterations: iteration };
    }

    callbacks?.onNodeComplete?.(node.id, { iterations: iteration });

    // Continue to next nodes
    execution.currentNodes = execution.currentNodes.filter(id => id !== node.id);
    const nextEdges = workflow.edges.filter(e => e.source === node.id);
    for (const edge of nextEdges) {
      const nextNode = workflow.nodes.find(n => n.id === edge.target);
      if (nextNode) {
        await this.executeNode(workflow, execution, nextNode, callbacks);
      }
    }
  }

  private async executeWaitNode(config: WaitNodeConfig): Promise<void> {
    if (config.duration) {
      await new Promise(resolve => setTimeout(resolve, config.duration));
    }
  }

  private executeTransformNode(
    config: TransformNodeConfig,
    execution: WorkflowExecution
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const op of config.operations) {
      switch (op.type) {
        case 'extract':
          result[op.target || 'extracted'] = evaluateExpression(op.expression, execution.variables);
          break;

        case 'format':
          result[op.target || 'formatted'] = this.substituteVariables(op.expression, execution.variables);
          break;

        case 'map': {
          const source = evaluateExpression(op.expression.split('|')[0].trim(), execution.variables) as unknown[];
          const transform = op.expression.split('|')[1]?.trim();
          if (Array.isArray(source) && transform) {
            result[op.target || 'mapped'] = source.map((item, i) =>
              evaluateExpression(transform.replace(/item/g, JSON.stringify(item)).replace(/index/g, String(i)), execution.variables)
            );
          }
          break;
        }

        case 'filter': {
          const sourceArr = evaluateExpression(op.expression.split('|')[0].trim(), execution.variables) as unknown[];
          const predicate = op.expression.split('|')[1]?.trim();
          if (Array.isArray(sourceArr) && predicate) {
            result[op.target || 'filtered'] = sourceArr.filter(item =>
              evaluateExpression(predicate.replace(/item/g, JSON.stringify(item)), execution.variables)
            );
          }
          break;
        }

        case 'merge':
          const sources = op.expression.split(',').map(s => s.trim());
          const merged: Record<string, unknown> = {};
          for (const source of sources) {
            const value = evaluateExpression(source, execution.variables);
            if (typeof value === 'object' && value !== null) {
              Object.assign(merged, value);
            }
          }
          result[op.target || 'merged'] = merged;
          break;
      }
    }

    return result;
  }

  private async executeWebhookNode(
    config: WebhookNodeConfig,
    execution: WorkflowExecution
  ): Promise<Record<string, unknown>> {
    const url = this.substituteVariables(config.url, execution.variables);
    const body = config.body ? this.substituteVariables(config.body, execution.variables) : undefined;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config.headers
    };

    const response = await fetch(url, {
      method: config.method,
      headers,
      body,
      signal: config.timeout ? AbortSignal.timeout(config.timeout) : undefined
    });

    const data = await response.json();

    return {
      webhookStatus: response.status,
      webhookResponse: data
    };
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private validateInputs(workflow: WorkflowDefinition, input: Record<string, unknown>): void {
    if (!workflow.inputs) return;

    for (const inputDef of workflow.inputs) {
      if (inputDef.required && !(inputDef.name in input)) {
        throw new Error(`Missing required input: ${inputDef.name}`);
      }
    }
  }

  private substituteVariables(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\$\{([^}]+)\}/g, (_, path) => {
      const value = getNestedValue(variables, path);
      return String(value ?? '');
    });
  }
}
