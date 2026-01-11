// ============================================================
// MODEL PROVIDER TYPES
// Unified interface for multiple LLM providers
// ============================================================

// Provider-specific tool type for multi-model support
export interface ProviderTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ============================================================
// MESSAGE TYPES
// ============================================================

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentBlock[];
  name?: string;
  tool_call_id?: string;
}

export interface ContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// ============================================================
// PROVIDER CONFIG
// ============================================================

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

export interface ChatRequest {
  messages: Message[];
  system?: string;
  tools?: ProviderTool[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  stopSequences?: string[];
}

export interface ChatResponse {
  content: ContentBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model: string;
  toolCalls?: ToolCall[];
}

export interface StreamChunk {
  type: 'text' | 'tool_use_start' | 'tool_use_delta' | 'tool_use_end' | 'done';
  text?: string;
  toolCall?: Partial<ToolCall>;
}

// ============================================================
// PROVIDER INTERFACE
// ============================================================

export interface ModelProvider {
  readonly name: string;
  readonly defaultModel: string;
  readonly supportedModels: string[];

  /**
   * Send a chat request and get response
   */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /**
   * Stream chat response
   */
  streamChat?(request: ChatRequest): AsyncIterable<StreamChunk>;

  /**
   * Check if the provider is available (has valid config)
   */
  isAvailable(): boolean;

  /**
   * Get current model being used
   */
  getModel(): string;

  /**
   * Set the model to use
   */
  setModel(model: string): void;
}

// ============================================================
// PROVIDER REGISTRY
// ============================================================

export interface ProviderRegistry {
  /**
   * Register a provider
   */
  register(provider: ModelProvider): void;

  /**
   * Get a provider by name
   */
  get(name: string): ModelProvider | undefined;

  /**
   * Get all available providers
   */
  getAvailable(): ModelProvider[];

  /**
   * Get the default provider
   */
  getDefault(): ModelProvider | undefined;

  /**
   * Set the default provider
   */
  setDefault(name: string): void;
}

// ============================================================
// MODEL CAPABILITIES
// ============================================================

export interface ModelCapabilities {
  maxContextTokens: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
  costPer1kInput: number;
  costPer1kOutput: number;
}

export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  // Anthropic
  'claude-3-opus-20240229': {
    maxContextTokens: 200000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075
  },
  'claude-3-sonnet-20240229': {
    maxContextTokens: 200000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015
  },
  'claude-3-5-sonnet-20241022': {
    maxContextTokens: 200000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015
  },
  'claude-3-haiku-20240307': {
    maxContextTokens: 200000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    costPer1kInput: 0.00025,
    costPer1kOutput: 0.00125
  },

  // OpenAI
  'gpt-4o': {
    maxContextTokens: 128000,
    maxOutputTokens: 16384,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    costPer1kInput: 0.005,
    costPer1kOutput: 0.015
  },
  'gpt-4o-mini': {
    maxContextTokens: 128000,
    maxOutputTokens: 16384,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006
  },
  'gpt-4-turbo': {
    maxContextTokens: 128000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    costPer1kInput: 0.01,
    costPer1kOutput: 0.03
  },

  // Ollama (local - no cost)
  'llama3.2': {
    maxContextTokens: 128000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    costPer1kInput: 0,
    costPer1kOutput: 0
  },
  'mistral': {
    maxContextTokens: 32000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    costPer1kInput: 0,
    costPer1kOutput: 0
  },
  'codellama': {
    maxContextTokens: 16000,
    maxOutputTokens: 4096,
    supportsTools: false,
    supportsVision: false,
    supportsStreaming: true,
    costPer1kInput: 0,
    costPer1kOutput: 0
  }
};

export function getModelCapabilities(model: string): ModelCapabilities | undefined {
  return MODEL_CAPABILITIES[model];
}
