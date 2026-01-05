// ============================================================
// BRAIN - High-level memory management
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { MemoryStore } from './store.js';
import type {
  MemoryEntry,
  MemoryType,
  MemoryMetadata,
  MemoryQuery,
  MemorySearchResult,
  ConversationContext
} from './types.js';

export interface BrainConfig {
  dbPath?: string;
  maxConversationHistory?: number;
  extractEntities?: boolean;
  autoSummarize?: boolean;
}

export class Brain {
  private store: MemoryStore;
  private client: Anthropic;
  private config: Required<BrainConfig>;

  constructor(config?: BrainConfig) {
    this.store = new MemoryStore(config?.dbPath || './data/memory.db');
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    this.config = {
      dbPath: config?.dbPath || './data/memory.db',
      maxConversationHistory: config?.maxConversationHistory || 20,
      extractEntities: config?.extractEntities ?? true,
      autoSummarize: config?.autoSummarize ?? true
    };
  }

  // ============================================================
  // REMEMBER - Store new memories
  // ============================================================

  async remember(
    userId: string,
    content: string,
    type: MemoryType,
    metadata?: Partial<MemoryMetadata>
  ): Promise<MemoryEntry> {
    // Auto-extract entities and generate summary if enabled
    let enhancedMetadata: MemoryMetadata = { ...metadata };

    if (this.config.extractEntities || this.config.autoSummarize) {
      const analysis = await this.analyzeContent(content);

      if (this.config.extractEntities && analysis.entities) {
        enhancedMetadata.entities = analysis.entities;
      }

      if (this.config.autoSummarize && analysis.summary) {
        enhancedMetadata.summary = analysis.summary;
      }

      // Auto-calculate importance
      const importance = this.calculateImportance(content, type, analysis);

      return this.store.add({
        userId,
        type,
        content,
        metadata: enhancedMetadata,
        importance
      });
    }

    return this.store.add({
      userId,
      type,
      content,
      metadata: enhancedMetadata,
      importance: 0.5
    });
  }

  async rememberConversation(
    userId: string,
    role: 'user' | 'assistant',
    content: string,
    taskId?: string
  ): Promise<MemoryEntry> {
    return this.remember(userId, content, 'conversation', {
      source: role,
      taskId,
      tags: ['conversation', role]
    });
  }

  async rememberTaskResult(
    userId: string,
    taskId: string,
    goal: string,
    result: string,
    success: boolean
  ): Promise<MemoryEntry> {
    return this.remember(userId, `Task: ${goal}\n\nResult: ${result}`, 'task', {
      taskId,
      tags: ['task', success ? 'success' : 'failure'],
      source: 'task_completion'
    });
  }

  async rememberFact(
    userId: string,
    fact: string,
    source?: string,
    tags?: string[]
  ): Promise<MemoryEntry> {
    return this.remember(userId, fact, 'fact', {
      source,
      tags: ['fact', ...(tags || [])]
    });
  }

  async rememberPreference(
    userId: string,
    preference: string,
    category?: string
  ): Promise<MemoryEntry> {
    return this.remember(userId, preference, 'preference', {
      tags: ['preference', category].filter(Boolean) as string[]
    });
  }

  async rememberCode(
    userId: string,
    code: string,
    language: string,
    description?: string
  ): Promise<MemoryEntry> {
    return this.remember(userId, code, 'code', {
      tags: ['code', language],
      summary: description
    });
  }

  // ============================================================
  // RECALL - Search and retrieve memories
  // ============================================================

  async recall(
    userId: string,
    query: string,
    options?: {
      types?: MemoryType[];
      limit?: number;
      minScore?: number;
    }
  ): Promise<MemorySearchResult[]> {
    const results = this.store.search({
      query,
      userId,
      types: options?.types,
      limit: options?.limit || 10
    });

    // Filter by minimum score
    if (options?.minScore) {
      return results.filter(r => r.score >= options.minScore!);
    }

    return results;
  }

  async getRelevantContext(
    userId: string,
    currentMessage: string,
    taskContext?: string
  ): Promise<ConversationContext> {
    // Get recent conversation
    const recentMessages = this.store.getRecent(userId, this.config.maxConversationHistory, ['conversation']);

    // Search for relevant memories
    const searchQuery = taskContext
      ? `${currentMessage} ${taskContext}`
      : currentMessage;

    const relevantMemories = await this.recall(userId, searchQuery, {
      types: ['fact', 'preference', 'task', 'code'],
      limit: 5,
      minScore: 0.3
    });

    return {
      messages: recentMessages.map(m => ({
        role: (m.metadata.source as 'user' | 'assistant') || 'user',
        content: m.content,
        timestamp: m.createdAt
      })).reverse(), // Oldest first
      relevantMemories: relevantMemories.map(r => r.entry)
    };
  }

  async getRecentMemories(
    userId: string,
    limit?: number,
    types?: MemoryType[]
  ): Promise<MemoryEntry[]> {
    return this.store.getRecent(userId, limit, types);
  }

  async getMemoriesByTag(
    userId: string,
    tag: string,
    limit?: number
  ): Promise<MemoryEntry[]> {
    return this.store.getByTag(userId, tag, limit);
  }

  // ============================================================
  // FORGET - Remove memories
  // ============================================================

  forget(memoryId: string): boolean {
    return this.store.delete(memoryId);
  }

  async forgetOld(
    userId: string,
    olderThanDays: number,
    keepImportant: boolean = true
  ): Promise<number> {
    return this.store.prune(userId, {
      maxAge: olderThanDays,
      minImportance: keepImportant ? 0.7 : 0
    });
  }

  // ============================================================
  // REFLECT - Analyze and consolidate memories
  // ============================================================

  async consolidate(userId: string): Promise<{
    factCount: number;
    preferencesFound: string[];
  }> {
    // Get recent conversations
    const conversations = this.store.getRecent(userId, 50, ['conversation']);

    if (conversations.length < 10) {
      return { factCount: 0, preferencesFound: [] };
    }

    // Use LLM to extract facts and preferences
    const conversationText = conversations
      .map(c => `[${c.metadata.source}]: ${c.content}`)
      .join('\n');

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      temperature: 0.3,
      system: `Extract important facts and user preferences from the conversation history.

Output JSON only:
{
  "facts": ["fact1", "fact2"],
  "preferences": ["preference1", "preference2"]
}

Focus on:
- Concrete information the user shared
- Preferences they expressed
- Important decisions or conclusions`,
      messages: [{ role: 'user', content: conversationText }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { factCount: 0, preferencesFound: [] };

      const extracted = JSON.parse(jsonMatch[0]);

      // Store extracted facts
      let factCount = 0;
      for (const fact of extracted.facts || []) {
        await this.rememberFact(userId, fact, 'consolidation', ['extracted']);
        factCount++;
      }

      // Store preferences
      const preferencesFound: string[] = [];
      for (const pref of extracted.preferences || []) {
        await this.rememberPreference(userId, pref, 'extracted');
        preferencesFound.push(pref);
      }

      return { factCount, preferencesFound };
    } catch {
      return { factCount: 0, preferencesFound: [] };
    }
  }

  // ============================================================
  // STATISTICS
  // ============================================================

  getStats(userId: string) {
    return this.store.getStats(userId);
  }

  // ============================================================
  // INTERNAL HELPERS
  // ============================================================

  private async analyzeContent(content: string): Promise<{
    entities?: string[];
    summary?: string;
    keywords?: string[];
  }> {
    // For short content, skip LLM analysis
    if (content.length < 100) {
      return {
        keywords: this.extractKeywords(content)
      };
    }

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        temperature: 0,
        system: `Extract entities, summary, and keywords from text. Output JSON only:
{
  "entities": ["entity1", "entity2"],
  "summary": "one sentence summary",
  "keywords": ["keyword1", "keyword2"]
}`,
        messages: [{ role: 'user', content }]
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback to simple extraction
    }

    return {
      keywords: this.extractKeywords(content)
    };
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3);

    // Count frequency
    const freq = new Map<string, number>();
    for (const word of words) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }

    // Return top keywords
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  private calculateImportance(
    content: string,
    type: MemoryType,
    analysis: { entities?: string[]; keywords?: string[] }
  ): number {
    let importance = 0.5;

    // Type-based importance
    const typeWeights: Record<MemoryType, number> = {
      preference: 0.8,
      fact: 0.7,
      task: 0.6,
      code: 0.6,
      document: 0.5,
      conversation: 0.4
    };
    importance = typeWeights[type] || 0.5;

    // Length bonus
    if (content.length > 500) importance += 0.1;

    // Entity bonus
    if (analysis.entities && analysis.entities.length > 2) importance += 0.1;

    // Clamp to 0-1
    return Math.min(1, Math.max(0, importance));
  }

  close(): void {
    this.store.close();
  }
}
