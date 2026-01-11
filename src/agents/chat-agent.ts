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
      requiredTools: [
        'web_search',
        'file_read',
        'file_write',
        'file_list',
        'file_edit',
        'code_execute',
        'npm',
        'git_status',
        'git_diff',
        'git_log',
        'git_add',
        'git_commit',
        'git_branch',
        'git_push',
        'git_pull',
        'csv_parse',
        'json_parse',
        'data_transform',
        'data_export',
        'sql_query',
        'create_temp_table',
        'describe_table',
        'list_tables',
        'aggregate_query',
        'bar_chart',
        'line_chart',
        'pie_chart',
        'histogram',
        'scatter_plot'
      ],
      systemPrompt: `Du bist ein mächtiger KI-Assistent mit vielen Fähigkeiten.

DEINE FÄHIGKEITEN:
1. **Konversation**: Natürliche Gespräche mit Gedächtnis
2. **Web-Recherche**: Aktuelle Informationen aus dem Internet
3. **Dateien**: Lesen, schreiben, bearbeiten von Dateien
4. **Programmieren**: Code schreiben, ausführen, debuggen
5. **Git**: Versionskontrolle (commit, push, pull, etc.)
6. **Daten**: CSV, JSON, SQL-Datenbanken verarbeiten
7. **Visualisierung**: Diagramme und Charts erstellen

VERFÜGBARE TOOLS:
- web_search: Internet-Suche
- file_read/write/edit/list: Datei-Operationen
- code_execute: Code ausführen (JS, TS, Python, Bash)
- npm: NPM-Befehle ausführen
- git_*: Git-Operationen
- csv_parse, json_parse: Daten parsen
- sql_query: SQL-Abfragen
- bar_chart, line_chart, pie_chart: Diagramme

WICHTIGE REGELN:
1. Antworte IMMER in der Sprache des Users (de/en/bs)
2. Nutze Tools aktiv wenn sie helfen können
3. Erkläre was du tust
4. Bei Code-Aufgaben: Schreibe und teste den Code
5. Sei präzise und hilfreich

SPRACH-ANWEISUNGEN:
- "language: de" -> Antworte auf Deutsch
- "language: en" -> Antworte auf Englisch
- "language: bs" -> Antworte auf Bosnisch`,
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
