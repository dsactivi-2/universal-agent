// ============================================================
// BASE AGENT - Abstract agent with LLM integration
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import type {
  AgentDefinition,
  AgentId,
  ExecutionCallbacks,
  LogEntry,
  Tool,
  ToolCallRecord
} from '../types/index.js';
import { ToolRegistry } from '../tools/registry.js';

export interface AgentAction {
  type: string;
  params: Record<string, unknown>;
}

export abstract class BaseAgent {
  protected id: AgentId;
  protected name: string;
  protected systemPrompt: string;
  protected client: Anthropic;
  protected model: string;
  protected temperature: number;
  protected maxTokens: number;
  protected toolRegistry: ToolRegistry;
  protected requiredTools: string[];

  constructor(definition: AgentDefinition, toolRegistry: ToolRegistry) {
    this.id = definition.id;
    this.name = definition.name;
    this.systemPrompt = definition.systemPrompt;
    this.model = definition.model.model;
    this.temperature = definition.model.temperature;
    this.maxTokens = definition.model.maxTokens;
    this.toolRegistry = toolRegistry;
    this.requiredTools = definition.requiredTools;

    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  get agentId(): AgentId {
    return this.id;
  }

  async execute(
    action: AgentAction,
    inputs: Record<string, unknown>,
    callbacks: ExecutionCallbacks
  ): Promise<unknown> {
    const startTime = Date.now();
    const logs: LogEntry[] = [];
    const toolCalls: ToolCallRecord[] = [];

    // Build the action prompt
    const userPrompt = this.buildActionPrompt(action, inputs);

    this.log(callbacks, 'info', `Starting action: ${action.type}`);

    // Get available tools
    const tools = this.toolRegistry.toAnthropicTools(this.requiredTools);

    // Initial message
    const messages: Anthropic.Messages.MessageParam[] = [
      { role: 'user', content: userPrompt }
    ];

    let iterations = 0;
    const maxIterations = 10;

    while (iterations < maxIterations) {
      iterations++;

      this.log(callbacks, 'debug', `Iteration ${iterations}`);

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: this.systemPrompt,
        messages,
        tools: tools.length > 0 ? tools as Anthropic.Messages.Tool[] : undefined
      });

      // Check for tool use
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUseBlocks.length > 0) {
        // Process tool calls
        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          const toolStartTime = Date.now();

          this.log(callbacks, 'info', `Calling tool: ${toolUse.name}`);

          const tool = this.toolRegistry.get(toolUse.name);
          let result: unknown;
          let error: string | undefined;

          try {
            if (!tool) {
              throw new Error(`Tool not found: ${toolUse.name}`);
            }
            result = await tool.execute(toolUse.input as Record<string, unknown>);
          } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            result = { error };
          }

          const toolRecord: ToolCallRecord = {
            toolName: toolUse.name,
            input: toolUse.input as Record<string, unknown>,
            output: result,
            error,
            duration: Date.now() - toolStartTime,
            timestamp: new Date()
          };

          toolCalls.push(toolRecord);
          callbacks.onToolCall(toolRecord);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result)
          });
        }

        // Add assistant message with tool use
        messages.push({
          role: 'assistant',
          content: response.content
        });

        // Add tool results
        messages.push({
          role: 'user',
          content: toolResults
        });
      } else {
        // No tool use - extract final response
        const textBlocks = response.content.filter(
          (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
        );

        const finalText = textBlocks.map(b => b.text).join('\n');

        this.log(callbacks, 'info', `Action completed in ${Date.now() - startTime}ms`);

        return this.parseOutput(finalText, action);
      }

      // Check stop reason
      if (response.stop_reason === 'end_turn') {
        const textBlocks = response.content.filter(
          (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
        );
        const finalText = textBlocks.map(b => b.text).join('\n');
        return this.parseOutput(finalText, action);
      }
    }

    throw new Error(`Agent ${this.name} exceeded max iterations (${maxIterations})`);
  }

  protected log(
    callbacks: ExecutionCallbacks,
    level: LogEntry['level'],
    message: string,
    data?: unknown
  ): void {
    const entry: LogEntry = {
      level,
      message: `[${this.name}] ${message}`,
      timestamp: new Date(),
      data
    };
    callbacks.onLog(entry);
  }

  // Abstract methods for subclasses
  protected abstract buildActionPrompt(
    action: AgentAction,
    inputs: Record<string, unknown>
  ): string;

  protected abstract parseOutput(content: string, action: AgentAction): unknown;
}
