// ============================================================
// ORCHESTRATOR - Main coordinator for task execution
// ============================================================

import { v4 as uuid } from 'uuid';
import type {
  Task,
  TaskStatus,
  TaskPhase,
  ExecutionPlan,
  PlanStep,
  StepResult,
  StepStatus,
  LogEntry,
  ToolCallRecord,
  ExecutionCallbacks
} from '../types/index.js';
import { AgentError, TimeoutError } from '../types/index.js';
import { Planner } from './planner.js';
import { StateManager } from '../db/state-manager.js';
import { AgentRegistry } from '../agents/registry.js';
import { ToolRegistry } from '../tools/registry.js';
import { AnthropicProvider } from '../providers/anthropic.js';

export interface OrchestratorConfig {
  maxConcurrentSteps: number;
  defaultStepTimeout: number;
  maxRetries: number;
  retryDelay: number;
}

export interface ExecutionResult {
  taskId: string;
  status: 'completed' | 'failed' | 'cancelled';
  results: Record<string, StepResult>;
  summary?: string;
  error?: string;
  duration: number;
}

export class Orchestrator {
  private planner: Planner;
  private stateManager: StateManager;
  private agentRegistry: AgentRegistry;
  private toolRegistry: ToolRegistry;
  private config: OrchestratorConfig;

  constructor(
    stateManager: StateManager,
    toolRegistry: ToolRegistry,
    config?: Partial<OrchestratorConfig>
  ) {
    this.stateManager = stateManager;
    this.toolRegistry = toolRegistry;
    this.agentRegistry = new AgentRegistry(toolRegistry);
    this.planner = new Planner(this.agentRegistry);

    this.config = {
      maxConcurrentSteps: config?.maxConcurrentSteps || 3,
      defaultStepTimeout: config?.defaultStepTimeout || 60000,
      maxRetries: config?.maxRetries || 2,
      retryDelay: config?.retryDelay || 1000
    };
  }

  // ============================================================
  // MAIN ENTRY POINT
  // ============================================================

  async handleMessage(
    message: string,
    callbacks: ExecutionCallbacks,
    userId: string = 'default'
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    let taskId: string | undefined;

    try {
      // 1. Analyze intent
      this.log(callbacks, 'info', 'Analyzing intent...');
      const intent = await this.planner.analyzeIntent(message);

      // 2. Handle different intent types
      if (intent.type === 'clarification_needed') {
        return {
          taskId: 'clarification',
          status: 'completed',
          results: {},
          summary: `Need clarification: ${intent.clarificationQuestions?.join(', ')}`,
          duration: Date.now() - startTime
        };
      }

      if (intent.type === 'simple_query') {
        // Simple queries don't need full task processing
        return this.handleSimpleQuery(message, intent, callbacks, startTime);
      }

      // 3. Create task
      const task = this.createTask(message, intent, userId);
      taskId = task.id;
      await this.stateManager.saveTask(task);
      this.log(callbacks, 'info', `Created task: ${task.id}`);

      // 4. Create execution plan
      this.log(callbacks, 'info', 'Creating execution plan...');
      const plan = await this.planner.createPlan(task);
      await this.stateManager.savePlan(plan);
      this.log(callbacks, 'info', `Plan created with ${plan.steps.length} steps`);

      // 5. Execute plan
      const results = await this.executePlan(task, plan, callbacks);

      // 6. Generate summary
      const summary = this.generateSummary(task, results);

      // 7. Update task status
      await this.updateTaskStatus(task.id, 'completed');

      return {
        taskId: task.id,
        status: 'completed',
        results,
        summary,
        duration: Date.now() - startTime
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(callbacks, 'error', `Execution failed: ${errorMessage}`);

      if (taskId) {
        await this.updateTaskStatus(taskId, 'failed');
      }

      return {
        taskId: taskId || 'unknown',
        status: 'failed',
        results: {},
        error: errorMessage,
        duration: Date.now() - startTime
      };
    }
  }

  // ============================================================
  // PLAN EXECUTION
  // ============================================================

  private async executePlan(
    task: Task,
    plan: ExecutionPlan,
    callbacks: ExecutionCallbacks
  ): Promise<Record<string, StepResult>> {
    const results: Record<string, StepResult> = {};
    const stepOutputs: Record<string, unknown> = {};

    // Group steps for parallel execution
    const stepGroups = this.planner.groupParallelSteps(plan);

    for (let groupIdx = 0; groupIdx < stepGroups.length; groupIdx++) {
      const group = stepGroups[groupIdx];
      this.log(callbacks, 'info', `Executing step group ${groupIdx + 1}/${stepGroups.length} (${group.length} steps)`);

      // Execute group in parallel (with concurrency limit)
      const groupResults = await this.executeStepGroup(
        task.id,
        group,
        stepOutputs,
        callbacks
      );

      // Store results
      for (const result of groupResults) {
        results[result.stepId] = result;
        if (result.status === 'success' && result.output) {
          stepOutputs[result.stepId] = result.output;
        }
      }

      // Check for failures
      const failures = groupResults.filter(r => r.status === 'failed');
      if (failures.length > 0) {
        const errorHandling = plan.errorHandling.default;

        if (errorHandling === 'abort') {
          throw new AgentError(
            `Step ${failures[0].stepId} failed: ${failures[0].error?.message}`,
            'STEP_FAILED',
            false
          );
        }
        // For 'skip' or 'retry' we continue (retries handled in executeStep)
      }
    }

    return results;
  }

  private async executeStepGroup(
    taskId: string,
    steps: PlanStep[],
    previousOutputs: Record<string, unknown>,
    callbacks: ExecutionCallbacks
  ): Promise<StepResult[]> {
    // Limit concurrency
    const batches = this.batchArray(steps, this.config.maxConcurrentSteps);
    const results: StepResult[] = [];

    for (const batch of batches) {
      const batchPromises = batch.map(step =>
        this.executeStep(taskId, step, previousOutputs, callbacks)
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  private async executeStep(
    taskId: string,
    step: PlanStep,
    previousOutputs: Record<string, unknown>,
    callbacks: ExecutionCallbacks
  ): Promise<StepResult> {
    const startTime = Date.now();
    const startedAt = new Date();
    let lastError: { code: string; message: string; retryable: boolean } | undefined;
    let retries = 0;
    const maxRetries = step.maxRetries ?? this.config.maxRetries;
    const logs: LogEntry[] = [];
    const toolCalls: ToolCallRecord[] = [];

    this.log(callbacks, 'info', `Starting step: ${step.name}`);

    while (retries <= maxRetries) {
      try {
        // Resolve inputs
        const resolvedInputs = this.resolveInputs(step, previousOutputs);

        // Get agent
        const agent = this.agentRegistry.get(step.agentId);
        if (!agent) {
          throw new AgentError(`Agent not found: ${step.agentId}`, 'AGENT_NOT_FOUND', false);
        }

        // Create step-specific callbacks to collect logs and tool calls
        const stepCallbacks: ExecutionCallbacks = {
          onLog: (entry) => {
            logs.push(entry);
            callbacks.onLog(entry);
          },
          onToolCall: (record) => {
            toolCalls.push(record);
            callbacks.onToolCall(record);
          },
          onProgress: callbacks.onProgress
        };

        // Execute with timeout
        const output = await this.withTimeout(
          agent.execute(step.action, resolvedInputs, stepCallbacks),
          step.timeout || this.config.defaultStepTimeout
        );

        // Success
        const result: StepResult = {
          stepId: step.id,
          status: 'success' as StepStatus,
          output,
          startedAt,
          completedAt: new Date(),
          duration: Date.now() - startTime,
          cost: 0, // TODO: Calculate actual cost
          logs,
          toolCalls
        };

        await this.stateManager.saveStepResult(taskId, result);
        this.log(callbacks, 'info', `Step completed: ${step.name}`);

        return result;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        lastError = {
          code: error instanceof AgentError ? error.code : 'UNKNOWN',
          message: errorMsg,
          retryable: retries < maxRetries
        };
        retries++;

        if (retries <= maxRetries) {
          this.log(callbacks, 'warn', `Step ${step.name} failed, retrying (${retries}/${maxRetries}): ${errorMsg}`);
          await this.delay(step.retryDelay || this.config.retryDelay);
        }
      }
    }

    // All retries exhausted
    const result: StepResult = {
      stepId: step.id,
      status: 'failed' as StepStatus,
      error: lastError,
      startedAt,
      completedAt: new Date(),
      duration: Date.now() - startTime,
      cost: 0,
      logs,
      toolCalls
    };

    await this.stateManager.saveStepResult(taskId, result);
    this.log(callbacks, 'error', `Step failed after ${retries} retries: ${step.name}`);

    return result;
  }

  // ============================================================
  // INPUT RESOLUTION
  // ============================================================

  private resolveInputs(
    step: PlanStep,
    previousOutputs: Record<string, unknown>
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    // Add action params as base
    if (step.action.params) {
      Object.assign(resolved, step.action.params);
    }

    // Resolve declared inputs
    for (const input of step.inputs) {
      let value: unknown;

      if (input.source.type === 'literal') {
        value = input.source.value;
      } else if (input.source.type === 'step') {
        const stepOutput = previousOutputs[input.source.stepId];
        if (input.source.outputPath) {
          value = this.getNestedValue(stepOutput, input.source.outputPath);
        } else {
          value = stepOutput;
        }
      } else if (input.source.type === 'context') {
        // Context values would come from task context
        value = undefined;
      }

      if (value === undefined && input.required) {
        if (input.default !== undefined) {
          value = input.default;
        } else {
          throw new Error(`Required input not found: ${input.name}`);
        }
      }

      if (value !== undefined) {
        resolved[input.name] = value;
      }
    }

    return resolved;
  }

  private getNestedValue(obj: unknown, path: string): unknown {
    if (!obj || typeof obj !== 'object') return undefined;

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
  // SIMPLE QUERY HANDLING
  // ============================================================

  private async handleSimpleQuery(
    message: string,
    intent: { primaryGoal: string },
    callbacks: ExecutionCallbacks,
    startTime: number
  ): Promise<ExecutionResult> {
    // For simple conversational queries, use direct Claude API call
    try {
      const provider = new AnthropicProvider();

      // The message already contains language instruction if specified
      const response = await provider.chat({
        system: `You are a helpful AI assistant. Be conversational and friendly.
If the message contains a language instruction (like "WICHTIG: Antworte IMMER auf Deutsch"),
you MUST respond in that language. Keep responses concise but helpful.`,
        messages: [
          { role: 'user', content: message }
        ],
        maxTokens: 1024,
        temperature: 0.7
      });

      // Extract text from response
      const textContent = response.content.find(c => c.type === 'text');
      const summary = textContent?.text || 'No response generated';

      const now = new Date();
      const stepResult: StepResult = {
        stepId: 'simple',
        status: 'success' as StepStatus,
        output: { summary },
        startedAt: now,
        completedAt: now,
        duration: Date.now() - startTime,
        cost: 0,
        logs: [],
        toolCalls: []
      };

      return {
        taskId: 'simple',
        status: 'completed',
        results: { simple: stepResult },
        summary,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        taskId: 'simple',
        status: 'failed',
        results: {},
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  // ============================================================
  // TASK CREATION
  // ============================================================

  private createTask(message: string, intent: { primaryGoal: string; urgency: string }, userId: string): Task {
    const status: TaskStatus = {
      phase: 'planning' as TaskPhase,
      progress: 0
    };

    return {
      id: uuid(),
      userId,
      goal: intent.primaryGoal,
      status,
      priority: intent.urgency === 'high' ? 'high' : intent.urgency === 'low' ? 'low' : 'normal',
      context: { originalMessage: message },
      constraints: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  private async updateTaskStatus(taskId: string, phase: TaskPhase): Promise<void> {
    const task = await this.stateManager.getTask(taskId);
    if (task) {
      task.status.phase = phase;
      task.updatedAt = new Date();
      await this.stateManager.saveTask(task);
    }
  }

  // ============================================================
  // SUMMARY GENERATION
  // ============================================================

  private generateSummary(task: Task, results: Record<string, StepResult>): string {
    const completedSteps = Object.values(results).filter(r => r.status === 'success');
    const failedSteps = Object.values(results).filter(r => r.status === 'failed');

    let summary = `Task "${task.goal}" completed.\n`;
    summary += `Steps: ${completedSteps.length} succeeded, ${failedSteps.length} failed.\n\n`;

    // Collect outputs
    for (const result of completedSteps) {
      if (result.output) {
        const output = result.output as Record<string, unknown>;
        if (output.summary) {
          summary += `${output.summary}\n\n`;
        } else if (output.findings && Array.isArray(output.findings)) {
          summary += `Findings:\n`;
          for (const finding of output.findings.slice(0, 5)) {
            const content = typeof finding === 'object' && finding !== null
              ? (finding as Record<string, unknown>).content || (finding as Record<string, unknown>).title || JSON.stringify(finding)
              : String(finding);
            summary += `- ${content}\n`;
          }
          summary += '\n';
        }
      }
    }

    return summary.trim();
  }

  // ============================================================
  // UTILITIES
  // ============================================================

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new TimeoutError(timeoutMs));
      }, timeoutMs);

      promise
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private batchArray<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  private log(
    callbacks: ExecutionCallbacks,
    level: LogEntry['level'],
    message: string,
    data?: unknown
  ): void {
    callbacks.onLog({
      level,
      message: `[Orchestrator] ${message}`,
      timestamp: new Date(),
      data
    });
  }
}
