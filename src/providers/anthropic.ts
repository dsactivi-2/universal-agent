// ============================================================
// ANTHROPIC PROVIDER
// Claude models via Anthropic API
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import type {
  ModelProvider,
  ProviderConfig,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  Message,
  ContentBlock,
  ToolCall,
  ProviderTool
} from './types.js';

// ============================================================
// ANTHROPIC PROVIDER
// ============================================================

export class AnthropicProvider implements ModelProvider {
  readonly name = 'anthropic';
  readonly defaultModel = 'claude-sonnet-4-20250514';
  readonly supportedModels = [
    'claude-sonnet-4-20250514',
    'claude-opus-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
    'claude-3-haiku-20240307'
  ];

  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config?: ProviderConfig) {
    const apiKey = config?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    this.client = new Anthropic({
      apiKey,
      baseURL: config?.baseUrl
    });

    this.model = config?.model || this.defaultModel;
    this.maxTokens = config?.maxTokens || 4096;
    this.temperature = config?.temperature ?? 0.7;
  }

  isAvailable(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  getModel(): string {
    return this.model;
  }

  setModel(model: string): void {
    if (!this.supportedModels.includes(model)) {
      console.warn(`Model ${model} not in supported list, using anyway`);
    }
    this.model = model;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const messages = this.convertMessages(request.messages);
    const tools = request.tools ? this.convertTools(request.tools) : undefined;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens || this.maxTokens,
      temperature: request.temperature ?? this.temperature,
      system: request.system,
      messages,
      tools,
      stop_sequences: request.stopSequences
    });

    return this.convertResponse(response);
  }

  async *streamChat(request: ChatRequest): AsyncIterable<StreamChunk> {
    const messages = this.convertMessages(request.messages);
    const tools = request.tools ? this.convertTools(request.tools) : undefined;

    const stream = await this.client.messages.stream({
      model: this.model,
      max_tokens: request.maxTokens || this.maxTokens,
      temperature: request.temperature ?? this.temperature,
      system: request.system,
      messages,
      tools
    });

    let currentToolCall: Partial<ToolCall> | null = null;

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          currentToolCall = {
            id: event.content_block.id,
            name: event.content_block.name,
            input: {}
          };
          yield { type: 'tool_use_start', toolCall: currentToolCall };
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        } else if (event.delta.type === 'input_json_delta' && currentToolCall) {
          yield { type: 'tool_use_delta', toolCall: currentToolCall };
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolCall) {
          yield { type: 'tool_use_end', toolCall: currentToolCall };
          currentToolCall = null;
        }
      } else if (event.type === 'message_stop') {
        yield { type: 'done' };
      }
    }
  }

  private convertMessages(messages: Message[]): Anthropic.MessageParam[] {
    return messages
      .filter(m => m.role !== 'system')
      .map(msg => {
        if (typeof msg.content === 'string') {
          return {
            role: msg.role === 'tool' ? 'user' : msg.role as 'user' | 'assistant',
            content: msg.role === 'tool'
              ? [{
                  type: 'tool_result' as const,
                  tool_use_id: msg.tool_call_id || '',
                  content: msg.content
                }]
              : msg.content
          };
        }

        // Convert content blocks
        type ContentBlockParam = Anthropic.TextBlockParam | Anthropic.ImageBlockParam | Anthropic.ToolUseBlockParam | Anthropic.ToolResultBlockParam;
        const content: ContentBlockParam[] = [];

        for (const block of msg.content) {
          if (block.type === 'text') {
            content.push({ type: 'text', text: block.text || '' });
          } else if (block.type === 'image') {
            // Handle image - extract base64 from data URL
            const url = block.image_url?.url || '';
            if (url.startsWith('data:')) {
              // Parse data URL: data:image/png;base64,<data>
              const matches = url.match(/^data:([^;]+);base64,(.+)$/);
              if (matches) {
                content.push({
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: matches[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                    data: matches[2]
                  }
                });
              }
            }
            // Skip non-data URLs for now - Anthropic needs base64
          } else if (block.type === 'tool_use') {
            content.push({
              type: 'tool_use',
              id: block.id || '',
              name: block.name || '',
              input: block.input || {}
            });
          } else if (block.type === 'tool_result') {
            content.push({
              type: 'tool_result',
              tool_use_id: block.tool_use_id || '',
              content: block.content || '',
              is_error: block.is_error
            });
          }
        }

        // Ensure there's at least one content block
        if (content.length === 0) {
          content.push({ type: 'text', text: '' });
        }

        return {
          role: msg.role as 'user' | 'assistant',
          content
        };
      });
  }

  private convertTools(tools: ProviderTool[]): Anthropic.Tool[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema
    }));
  }

  private convertResponse(response: Anthropic.Message): ChatResponse {
    const content: ContentBlock[] = response.content.map(block => {
      if (block.type === 'text') {
        return { type: 'text' as const, text: block.text };
      }
      if (block.type === 'tool_use') {
        return {
          type: 'tool_use' as const,
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>
        };
      }
      return { type: 'text' as const, text: '' };
    });

    const toolCalls: ToolCall[] = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map(block => ({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>
      }));

    return {
      content,
      stopReason: response.stop_reason || 'end_turn',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      },
      model: response.model,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }
}
