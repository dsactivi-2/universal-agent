// ============================================================
// PROVIDER REGISTRY
// Manage multiple model providers
// ============================================================

import type { ModelProvider, ProviderRegistry } from './types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { OllamaProvider } from './ollama.js';

// ============================================================
// PROVIDER REGISTRY IMPLEMENTATION
// ============================================================

export class ModelProviderRegistry implements ProviderRegistry {
  private providers: Map<string, ModelProvider> = new Map();
  private defaultProviderName: string | null = null;

  register(provider: ModelProvider): void {
    this.providers.set(provider.name, provider);

    // Set as default if it's the first one
    if (this.defaultProviderName === null) {
      this.defaultProviderName = provider.name;
    }
  }

  get(name: string): ModelProvider | undefined {
    return this.providers.get(name);
  }

  getAvailable(): ModelProvider[] {
    return Array.from(this.providers.values()).filter(p => p.isAvailable());
  }

  getDefault(): ModelProvider | undefined {
    if (!this.defaultProviderName) return undefined;
    return this.providers.get(this.defaultProviderName);
  }

  setDefault(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`Provider not found: ${name}`);
    }
    this.defaultProviderName = name;
  }

  /**
   * List all registered providers
   */
  list(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get all providers with their status
   */
  status(): Array<{ name: string; available: boolean; model: string }> {
    return Array.from(this.providers.values()).map(p => ({
      name: p.name,
      available: p.isAvailable(),
      model: p.getModel()
    }));
  }
}

// ============================================================
// AUTO-CONFIGURE PROVIDERS
// ============================================================

export interface AutoConfigOptions {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  ollamaBaseUrl?: string;
  preferredProvider?: 'anthropic' | 'openai' | 'ollama';
}

/**
 * Automatically configure available providers based on environment
 */
export function createProviderRegistry(options?: AutoConfigOptions): ModelProviderRegistry {
  const registry = new ModelProviderRegistry();

  // Try Anthropic
  const anthropicKey = options?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      registry.register(new AnthropicProvider({ apiKey: anthropicKey }));
    } catch (e) {
      console.warn('Failed to initialize Anthropic provider:', e);
    }
  }

  // Try OpenAI
  const openaiKey = options?.openaiApiKey || process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      registry.register(new OpenAIProvider({ apiKey: openaiKey }));
    } catch (e) {
      console.warn('Failed to initialize OpenAI provider:', e);
    }
  }

  // Try Ollama (local, always available to try)
  try {
    registry.register(new OllamaProvider({
      baseUrl: options?.ollamaBaseUrl || process.env.OLLAMA_BASE_URL
    }));
  } catch (e) {
    console.warn('Failed to initialize Ollama provider:', e);
  }

  // Set preferred provider as default
  if (options?.preferredProvider && registry.get(options.preferredProvider)) {
    registry.setDefault(options.preferredProvider);
  }

  return registry;
}

// ============================================================
// MODEL ROUTER
// ============================================================

export interface RoutingRule {
  condition: (request: { message: string; tools?: unknown[] }) => boolean;
  provider: string;
  model?: string;
}

/**
 * Route requests to appropriate models based on rules
 */
export class ModelRouter {
  private registry: ModelProviderRegistry;
  private rules: RoutingRule[] = [];

  constructor(registry: ModelProviderRegistry) {
    this.registry = registry;
  }

  /**
   * Add a routing rule
   */
  addRule(rule: RoutingRule): void {
    this.rules.push(rule);
  }

  /**
   * Get the best provider for a request
   */
  route(request: { message: string; tools?: unknown[] }): ModelProvider {
    // Check rules in order
    for (const rule of this.rules) {
      if (rule.condition(request)) {
        const provider = this.registry.get(rule.provider);
        if (provider?.isAvailable()) {
          if (rule.model) {
            provider.setModel(rule.model);
          }
          return provider;
        }
      }
    }

    // Fall back to default
    const defaultProvider = this.registry.getDefault();
    if (!defaultProvider) {
      throw new Error('No model provider available');
    }
    return defaultProvider;
  }

  /**
   * Add common routing rules
   */
  addDefaultRules(): void {
    // Use cheaper models for simple queries
    this.addRule({
      condition: (req) => req.message.length < 100 && !req.tools?.length,
      provider: 'anthropic',
      model: 'claude-3-haiku-20240307'
    });

    // Use Ollama for code tasks if available (free)
    this.addRule({
      condition: (req) => /\b(code|function|class|implement)\b/i.test(req.message),
      provider: 'ollama',
      model: 'codellama'
    });

    // Use powerful models for complex tasks
    this.addRule({
      condition: (req) => req.message.length > 1000 || (req.tools?.length || 0) > 3,
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022'
    });
  }
}
