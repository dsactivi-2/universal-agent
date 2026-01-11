// ============================================================
// MEMORY SYSTEM TYPES
// ============================================================

export interface MemoryEntry {
  id: string;
  userId: string;
  type: MemoryType;
  content: string;
  metadata: MemoryMetadata;
  embedding?: number[];
  createdAt: Date;
  lastAccessed?: Date;
  accessCount: number;
  importance: number; // 0-1, higher = more important
}

export type MemoryType =
  | 'conversation'  // Chat messages
  | 'task'          // Task descriptions and results
  | 'fact'          // Extracted facts
  | 'preference'    // User preferences
  | 'code'          // Code snippets
  | 'document';     // Documents/notes

export interface MemoryMetadata {
  source?: string;          // Where this memory came from
  taskId?: string;          // Related task
  agentId?: string;         // Agent that created it
  tags?: string[];          // Searchable tags
  entities?: string[];      // Named entities
  summary?: string;         // Short summary
  [key: string]: unknown;   // Additional metadata
}

export interface MemoryQuery {
  query: string;
  userId?: string;
  types?: MemoryType[];
  tags?: string[];
  limit?: number;
  minImportance?: number;
  since?: Date;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;          // Relevance score 0-1
  matchType: 'semantic' | 'keyword' | 'exact';
}

export interface ConversationContext {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  relevantMemories: MemoryEntry[];
}
