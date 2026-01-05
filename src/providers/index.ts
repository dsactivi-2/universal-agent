// ============================================================
// PROVIDERS INDEX
// ============================================================

// Types
export type {
  Message,
  ContentBlock,
  ToolCall,
  ProviderConfig,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  ModelProvider,
  ProviderRegistry,
  ModelCapabilities
} from './types.js';

export { MODEL_CAPABILITIES, getModelCapabilities } from './types.js';

// Providers
export { AnthropicProvider } from './anthropic.js';
export { OpenAIProvider } from './openai.js';
export { OllamaProvider } from './ollama.js';

// Registry
export {
  ModelProviderRegistry,
  createProviderRegistry,
  ModelRouter
} from './registry.js';
export type { AutoConfigOptions, RoutingRule } from './registry.js';
