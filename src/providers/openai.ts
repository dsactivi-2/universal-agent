// ============================================================
// OPENAI PROVIDER
// GPT models via OpenAI API
// ============================================================

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
// OPENAI API TYPES
// ============================================================

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | OpenAIContentPart[] | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: string };
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================
// OPENAI PROVIDER
// ============================================================

export class OpenAIProvider implements ModelProvider {
  readonly name = 'openai';
  readonly defaultModel = 'gpt-4o';
  readonly supportedModels = [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo'
  ];

  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config?: ProviderConfig) {
    const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }

    this.apiKey = apiKey;
    this.baseUrl = config?.baseUrl || 'https://api.openai.com/v1';
    this.model = config?.model || this.defaultModel;
    this.maxTokens = config?.maxTokens || 4096;
    this.temperature = config?.temperature ?? 0.7;
  }

  isAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY;
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
    const messages = this.convertMessages(request.messages, request.system);
    const tools = request.tools ? this.convertTools(request.tools) : undefined;

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: request.maxTokens || this.maxTokens,
      temperature: request.temperature ?? this.temperature
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    if (request.stopSequences) {
      body.stop = request.stopSequences;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const data = await response.json() as OpenAIResponse;
    return this.convertResponse(data);
  }

  async *streamChat(request: ChatRequest): AsyncIterable<StreamChunk> {
    const messages = this.convertMessages(request.messages, request.system);
    const tools = request.tools ? this.convertTools(request.tools) : undefined;

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: request.maxTokens || this.maxTokens,
      temperature: request.temperature ?? this.temperature,
      stream: true
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let currentToolCall: Partial<ToolCall> | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') {
          if (currentToolCall) {
            yield { type: 'tool_use_end', toolCall: currentToolCall };
          }
          yield { type: 'done' };
          continue;
        }

        try {
          const chunk = JSON.parse(data);
          const delta = chunk.choices?.[0]?.delta;

          if (delta?.content) {
            yield { type: 'text', text: delta.content };
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.id) {
                if (currentToolCall) {
                  yield { type: 'tool_use_end', toolCall: currentToolCall };
                }
                currentToolCall = {
                  id: tc.id,
                  name: tc.function?.name,
                  input: {}
                };
                yield { type: 'tool_use_start', toolCall: currentToolCall };
              }
              if (tc.function?.arguments && currentToolCall) {
                try {
                  const partialInput = JSON.parse(tc.function.arguments);
                  currentToolCall.input = { ...currentToolCall.input, ...partialInput };
                } catch {
                  // Partial JSON, ignore
                }
                yield { type: 'tool_use_delta', toolCall: currentToolCall };
              }
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }

  private convertMessages(messages: Message[], system?: string): OpenAIMessage[] {
    const result: OpenAIMessage[] = [];

    // Add system message if provided
    if (system) {
      result.push({ role: 'system', content: system });
    }

    for (const msg of messages) {
      if (msg.role === 'system') {
        result.push({ role: 'system', content: msg.content as string });
        continue;
      }

      if (msg.role === 'tool') {
        result.push({
          role: 'tool',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          tool_call_id: msg.tool_call_id || ''
        });
        continue;
      }

      if (typeof msg.content === 'string') {
        result.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        });
        continue;
      }

      // Handle content blocks
      const content: OpenAIContentPart[] = [];
      const toolCalls: OpenAIToolCall[] = [];

      for (const block of msg.content) {
        if (block.type === 'text') {
          content.push({ type: 'text', text: block.text || '' });
        } else if (block.type === 'image') {
          content.push({
            type: 'image_url',
            image_url: { url: block.image_url?.url || '', detail: block.image_url?.detail }
          });
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id || '',
            type: 'function',
            function: {
              name: block.name || '',
              arguments: JSON.stringify(block.input || {})
            }
          });
        }
      }

      const openAIMsg: OpenAIMessage = {
        role: msg.role as 'user' | 'assistant',
        content: content.length > 0 ? (content.length === 1 && content[0].type === 'text' ? content[0].text! : content) : null
      };

      if (toolCalls.length > 0) {
        openAIMsg.tool_calls = toolCalls;
      }

      result.push(openAIMsg);
    }

    return result;
  }

  private convertTools(tools: ProviderTool[]): OpenAITool[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }));
  }

  private convertResponse(response: OpenAIResponse): ChatResponse {
    const choice = response.choices[0];
    const message = choice.message;

    const content: ContentBlock[] = [];

    if (message.content) {
      content.push({ type: 'text', text: message.content });
    }

    const toolCalls: ToolCall[] = [];
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        const toolCall: ToolCall = {
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments || '{}')
        };
        toolCalls.push(toolCall);
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: toolCall.input
        });
      }
    }

    // Map OpenAI finish reasons to our format
    const stopReasonMap: Record<string, string> = {
      'stop': 'end_turn',
      'length': 'max_tokens',
      'tool_calls': 'tool_use',
      'content_filter': 'end_turn'
    };

    return {
      content,
      stopReason: stopReasonMap[choice.finish_reason] || choice.finish_reason,
      usage: {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      },
      model: response.model,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }
}
