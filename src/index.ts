// ============================================================
// UNIVERSAL AGENT - Main Entry Point
// ============================================================

import { StateManager } from './db/state-manager.js';
import { ToolRegistry } from './tools/registry.js';
import { WebSearchTool } from './tools/web-search.js';
import { Orchestrator, type OrchestratorConfig, type ExecutionResult } from './core/orchestrator.js';
import type { LogEntry, ToolCallRecord, ExecutionCallbacks } from './types/index.js';

export interface UniversalAgentConfig {
  dbPath?: string;
  tavilyApiKey?: string;
  orchestrator?: Partial<OrchestratorConfig>;
}

export class UniversalAgent {
  private orchestrator: Orchestrator;
  private stateManager: StateManager;

  constructor(config?: UniversalAgentConfig) {
    // Initialize state manager
    this.stateManager = new StateManager(config?.dbPath);

    // Initialize tool registry
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(new WebSearchTool(config?.tavilyApiKey));

    // Initialize orchestrator
    this.orchestrator = new Orchestrator(
      this.stateManager,
      toolRegistry,
      config?.orchestrator
    );
  }

  async run(
    message: string,
    options?: {
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

    return this.orchestrator.handleMessage(message, callbacks);
  }

  getStateManager(): StateManager {
    return this.stateManager;
  }

  close(): void {
    this.stateManager.close();
  }
}

// Re-export types
export type { ExecutionResult, OrchestratorConfig };
export type { LogEntry, ToolCallRecord, ExecutionCallbacks } from './types/index.js';
export type { Task, ExecutionPlan, StepResult } from './types/index.js';
