// ============================================================
// OLLAMA PROVIDER
// Local models via Ollama API
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
// OLLAMA API TYPES
// ============================================================

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
  tool_calls?: OllamaToolCall[];
}

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

// ============================================================
// OLLAMA PROVIDER
// ============================================================

export class OllamaProvider implements ModelProvider {
  readonly name = 'ollama';
  readonly defaultModel = 'llama3.2';
  readonly supportedModels = [
    'llama3.2',
    'llama3.1',
    'llama3',
    'llama2',
    'mistral',
    'mixtral',
    'codellama',
    'phi3',
    'gemma2',
    'qwen2.5'
  ];

  private baseUrl: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(config?: ProviderConfig) {
    this.baseUrl = config?.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = config?.model || this.defaultModel;
    this.maxTokens = config?.maxTokens || 4096;
    this.temperature = config?.temperature ?? 0.7;
  }

  isAvailable(): boolean {
    // Ollama is available if running locally - check async
    return true;
  }

  getModel(): string {
    return this.model;
  }

  setModel(model: string): void {
    this.model = model;
  }

  /**
   * Check if Ollama server is running
   */
  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models from Ollama
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];
      const data = await response.json() as { models: Array<{ name: string }> };
      return data.models.map(m => m.name);
    } catch {
      return [];
    }
  }

  /**
   * Pull a model from Ollama registry
   */
  async pullModel(modelName: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName })
    });

    if (!response.ok) {
      throw new Error(`Failed to pull model: ${modelName}`);
    }

    // Stream the pull progress
    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      console.log(text);
    }
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const messages = this.convertMessages(request.messages, request.system);
    const tools = request.tools ? this.convertTools(request.tools) : undefined;

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: false,
      options: {
        num_predict: request.maxTokens || this.maxTokens,
        temperature: request.temperature ?? this.temperature
      }
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    if (request.stopSequences) {
      body.options = { ...(body.options as object), stop: request.stopSequences };
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${error}`);
    }

    const data = await response.json() as OllamaResponse;
    return this.convertResponse(data);
  }

  async *streamChat(request: ChatRequest): AsyncIterable<StreamChunk> {
    const messages = this.convertMessages(request.messages, request.system);
    const tools = request.tools ? this.convertTools(request.tools) : undefined;

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: true,
      options: {
        num_predict: request.maxTokens || this.maxTokens,
        temperature: request.temperature ?? this.temperature
      }
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const chunk = JSON.parse(line) as OllamaResponse;

          if (chunk.message?.content) {
            yield { type: 'text', text: chunk.message.content };
          }

          if (chunk.message?.tool_calls) {
            for (const tc of chunk.message.tool_calls) {
              const toolCall: ToolCall = {
                id: `call_${Date.now()}`,
                name: tc.function.name,
                input: tc.function.arguments
              };
              yield { type: 'tool_use_start', toolCall };
              yield { type: 'tool_use_end', toolCall };
            }
          }

          if (chunk.done) {
            yield { type: 'done' };
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }

  private convertMessages(messages: Message[], system?: string): OllamaMessage[] {
    const result: OllamaMessage[] = [];

    // Add system message if provided
    if (system) {
      result.push({ role: 'system', content: system });
    }

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        result.push({
          role: msg.role as 'system' | 'user' | 'assistant' | 'tool',
          content: msg.content
        });
        continue;
      }

      // Handle content blocks - Ollama has limited support
      let textContent = '';
      const images: string[] = [];
      const toolCalls: OllamaToolCall[] = [];

      for (const block of msg.content) {
        if (block.type === 'text') {
          textContent += block.text || '';
        } else if (block.type === 'image') {
          // Ollama expects base64 images
          const url = block.image_url?.url || '';
          if (url.startsWith('data:')) {
            const base64 = url.split(',')[1];
            if (base64) images.push(base64);
          }
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            function: {
              name: block.name || '',
              arguments: block.input || {}
            }
          });
        } else if (block.type === 'tool_result') {
          // Tool results are added as user messages
          result.push({
            role: 'tool',
            content: block.content || ''
          });
          continue;
        }
      }

      const ollamaMsg: OllamaMessage = {
        role: msg.role as 'system' | 'user' | 'assistant' | 'tool',
        content: textContent
      };

      if (images.length > 0) {
        ollamaMsg.images = images;
      }

      if (toolCalls.length > 0) {
        ollamaMsg.tool_calls = toolCalls;
      }

      result.push(ollamaMsg);
    }

    return result;
  }

  private convertTools(tools: ProviderTool[]): OllamaTool[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: (tool.inputSchema as any).properties || {},
          required: (tool.inputSchema as any).required || []
        }
      }
    }));
  }

  private convertResponse(response: OllamaResponse): ChatResponse {
    const content: ContentBlock[] = [];
    const toolCalls: ToolCall[] = [];

    if (response.message.content) {
      content.push({ type: 'text', text: response.message.content });
    }

    if (response.message.tool_calls) {
      for (const tc of response.message.tool_calls) {
        const toolCall: ToolCall = {
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          name: tc.function.name,
          input: tc.function.arguments
        };
        toolCalls.push(toolCall);
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: tc.function.name,
          input: tc.function.arguments
        });
      }
    }

    // Estimate tokens (Ollama doesn't always return exact counts)
    const inputTokens = response.prompt_eval_count || 0;
    const outputTokens = response.eval_count || 0;

    // Map done_reason to stop reason
    const stopReason = response.message.tool_calls ? 'tool_use' :
                       response.done_reason === 'length' ? 'max_tokens' : 'end_turn';

    return {
      content,
      stopReason,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens
      },
      model: response.model,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }
}
