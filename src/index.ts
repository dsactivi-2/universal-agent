// ============================================================
// UNIVERSAL AGENT - Main Entry Point
// ============================================================

import { StateManager } from './db/state-manager.js';
import { ToolRegistry } from './tools/registry.js';
import { WebSearchTool } from './tools/web-search.js';
import { Brain } from './memory/brain.js';
import { Orchestrator, type OrchestratorConfig, type ExecutionResult } from './core/orchestrator.js';
import type { LogEntry, ToolCallRecord, ExecutionCallbacks } from './types/index.js';

export interface UniversalAgentConfig {
  dbPath?: string;
  memoryDbPath?: string;
  tavilyApiKey?: string;
  orchestrator?: Partial<OrchestratorConfig>;
}

export class UniversalAgent {
  private orchestrator: Orchestrator;
  private stateManager: StateManager;
  private brain: Brain;

  constructor(config?: UniversalAgentConfig) {
    // Initialize state manager
    this.stateManager = new StateManager(config?.dbPath);

    // Initialize brain (memory)
    this.brain = new Brain({ dbPath: config?.memoryDbPath });

    // Initialize tool registry
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(new WebSearchTool(config?.tavilyApiKey));

    // Initialize orchestrator with brain
    this.orchestrator = new Orchestrator(
      this.stateManager,
      toolRegistry,
      this.brain,
      config?.orchestrator
    );
  }

  async run(
    message: string,
    options?: {
      userId?: string;
      language?: string;
      onLog?: (log: LogEntry) => void;
      onToolCall?: (call: ToolCallRecord) => void;
      onProgress?: (phase: string, progress: number) => void;
    }
  ): Promise<ExecutionResult> {
    const callbacks: ExecutionCallbacks = {
      onLog: options?.onLog || ((log) => {
        const prefix = log.level === 'error' ? '❌' : log.level === 'warn' ? '⚠️' : '📝';
        console.log(`${prefix} ${log.message}`);
      }),
      onToolCall: options?.onToolCall || ((call) => {
        console.log(`🔧 Tool: ${call.toolName} (${call.duration}ms)`);
      }),
      onProgress: options?.onProgress
    };

    return this.orchestrator.handleMessage(
      message,
      callbacks,
      options?.userId || 'default',
      options?.language || 'de'
    );
  }

  getStateManager(): StateManager {
    return this.stateManager;
  }

  getBrain(): Brain {
    return this.brain;
  }

  close(): void {
    this.stateManager.close();
    this.brain.close();
  }
}

// Re-export types
export type { ExecutionResult, OrchestratorConfig };
export type { LogEntry, ToolCallRecord, ExecutionCallbacks } from './types/index.js';
export type { Task, ExecutionPlan, StepResult } from './types/index.js';
