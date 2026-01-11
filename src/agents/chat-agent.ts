// ============================================================
// CHAT AGENT
// Handles conversational interactions with memory context
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import type { AgentDefinition, ExecutionCallbacks, LogEntry } from '../types/index.js';
import { BaseAgent, AgentAction } from './base-agent.js';
import { ToolRegistry } from '../tools/registry.js';

export interface ChatResult {
  response: string;
  language: string;
  conversationId?: string;
  timestamp: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export class ChatAgent extends BaseAgent {
  constructor(toolRegistry: ToolRegistry) {
    const definition: AgentDefinition = {
      id: 'chat',
      name: 'Chat Agent',
      description: 'Handles conversational interactions with memory and context awareness',
      domain: ['conversation', 'chat', 'general'],
      capabilities: [
        {
          name: 'conversation',
          description: 'Have a natural conversation with the user',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              language: { type: 'string', enum: ['de', 'en', 'bs'] },
              conversationHistory: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    role: { type: 'string' },
                    content: { type: 'string' }
                  }
                }
              }
            },
            required: ['message']
          },
          outputSchema: {
            type: 'object',
            properties: {
              response: { type: 'string' },
              language: { type: 'string' }
            }
          },
          estimatedDuration: 5000,
          estimatedCost: 0.01
        }
      ],
      requiredTools: ['web_search'],
      systemPrompt: `Du bist ein freundlicher und hilfreicher KI-Assistent.

WICHTIGE REGELN:
1. Antworte IMMER in der Sprache, die der User verwendet oder anfordert
2. Sei freundlich, natürlich und gesprächig
3. Erinnere dich an den Kontext der Konversation
4. Halte Antworten präzise aber hilfreich
5. Wenn du etwas nicht weißt, sag es ehrlich
6. Nutze Web-Suche nur wenn der User explizit nach aktuellen Informationen fragt

SPRACH-ANWEISUNGEN:
- Wenn "language: de" -> Antworte auf Deutsch
- Wenn "language: en" -> Antworte auf Englisch
- Wenn "language: bs" -> Antworte auf Bosnisch

Du hast Zugriff auf vorherige Nachrichten der Konversation. Nutze diesen Kontext um bessere Antworten zu geben.`,
      model: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        temperature: 0.7,
        maxTokens: 2048
      }
    };

    super(definition, toolRegistry);
  }

  async executeChat(
    message: string,
    language: string,
    conversationHistory: ConversationMessage[],
    callbacks: ExecutionCallbacks
  ): Promise<ChatResult> {
    const startTime = Date.now();

    this.log(callbacks, 'info', `Processing chat message in ${language}`);

    // Build conversation context
    const contextMessages = this.buildConversationContext(conversationHistory);

    // Build the user message with language instruction
    const languageInstruction = this.getLanguageInstruction(language);
    const fullMessage = `${languageInstruction}\n\nUser Message: ${message}`;

    // Get available tools (web search for when user asks for current info)
    const tools = this.toolRegistry.toAnthropicTools(this.requiredTools);

    // Build messages array with history
    const messages: Anthropic.Messages.MessageParam[] = [
      ...contextMessages,
      { role: 'user', content: fullMessage }
    ];

    this.log(callbacks, 'debug', `Sending ${messages.length} messages to Claude`);

    let iterations = 0;
    const maxIterations = 5;

    while (iterations < maxIterations) {
      iterations++;

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
          this.log(callbacks, 'info', `Using tool: ${toolUse.name}`);

          const tool = this.toolRegistry.get(toolUse.name);
          let result: unknown;

          try {
            if (!tool) {
              throw new Error(`Tool not found: ${toolUse.name}`);
            }
            result = await tool.execute(toolUse.input as Record<string, unknown>);
          } catch (e) {
            result = { error: e instanceof Error ? e.message : String(e) };
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result)
          });
        }

        // Add assistant response and tool results
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults });
      } else {
        // Extract final text response
        const textBlocks = response.content.filter(
          (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
        );

        const responseText = textBlocks.map(b => b.text).join('\n');

        this.log(callbacks, 'info', `Chat completed in ${Date.now() - startTime}ms`);

        return {
          response: responseText,
          language,
          timestamp: new Date().toISOString()
        };
      }
    }

    throw new Error('Chat agent exceeded max iterations');
  }

  private buildConversationContext(
    history: ConversationMessage[]
  ): Anthropic.Messages.MessageParam[] {
    // Take last 10 messages for context
    const recentHistory = history.slice(-10);

    return recentHistory.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));
  }

  private getLanguageInstruction(language: string): string {
    const instructions: Record<string, string> = {
      'de': '[Sprache: Deutsch] Antworte auf Deutsch.',
      'en': '[Language: English] Respond in English.',
      'bs': '[Jezik: Bosanski] Odgovori na bosanskom jeziku.'
    };
    return instructions[language] || instructions['de'];
  }

  // Required by BaseAgent but we use executeChat directly
  protected buildActionPrompt(
    action: AgentAction,
    inputs: Record<string, unknown>
  ): string {
    return inputs.message as string || '';
  }

  protected parseOutput(content: string, action: AgentAction): ChatResult {
    return {
      response: content,
      language: 'de',
      timestamp: new Date().toISOString()
    };
  }
}
