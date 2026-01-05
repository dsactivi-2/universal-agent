// ============================================================
// MEMORY STORE - SQLite with FTS5 for search
// ============================================================

import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type {
  MemoryEntry,
  MemoryType,
  MemoryMetadata,
  MemoryQuery,
  MemorySearchResult
} from './types.js';

export class MemoryStore {
  private db: Database.Database;

  constructor(dbPath: string = './data/memory.db') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  // ============================================================
  // SCHEMA
  // ============================================================

  private initSchema(): void {
    this.db.exec(`
      -- Main memories table
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        embedding BLOB,
        created_at TEXT NOT NULL,
        last_accessed TEXT,
        access_count INTEGER DEFAULT 0,
        importance REAL DEFAULT 0.5
      );

      CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);

      -- Full-text search table
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        id,
        content,
        tags,
        content='memories',
        content_rowid='rowid'
      );

      -- Triggers to keep FTS in sync
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(id, content, tags)
        VALUES (
          new.id,
          new.content,
          json_extract(new.metadata, '$.tags')
        );
      END;

      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, id, content, tags)
        VALUES ('delete', old.id, old.content, json_extract(old.metadata, '$.tags'));
      END;

      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, id, content, tags)
        VALUES ('delete', old.id, old.content, json_extract(old.metadata, '$.tags'));
        INSERT INTO memories_fts(id, content, tags)
        VALUES (
          new.id,
          new.content,
          json_extract(new.metadata, '$.tags')
        );
      END;
    `);
  }

  // ============================================================
  // CRUD OPERATIONS
  // ============================================================

  add(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessCount'>): MemoryEntry {
    const id = uuid();
    const now = new Date();

    const fullEntry: MemoryEntry = {
      ...entry,
      id,
      createdAt: now,
      accessCount: 0
    };

    this.db.prepare(`
      INSERT INTO memories (id, user_id, type, content, metadata, embedding, created_at, importance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entry.userId,
      entry.type,
      entry.content,
      JSON.stringify(entry.metadata),
      entry.embedding ? Buffer.from(new Float32Array(entry.embedding).buffer) : null,
      now.toISOString(),
      entry.importance
    );

    return fullEntry;
  }

  get(id: string): MemoryEntry | null {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as any;
    if (!row) return null;

    // Update access tracking
    this.db.prepare(`
      UPDATE memories SET last_accessed = ?, access_count = access_count + 1 WHERE id = ?
    `).run(new Date().toISOString(), id);

    return this.rowToEntry(row);
  }

  update(id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'metadata' | 'importance'>>): boolean {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (updates.content !== undefined) {
      sets.push('content = ?');
      values.push(updates.content);
    }
    if (updates.metadata !== undefined) {
      sets.push('metadata = ?');
      values.push(JSON.stringify(updates.metadata));
    }
    if (updates.importance !== undefined) {
      sets.push('importance = ?');
      values.push(updates.importance);
    }

    if (sets.length === 0) return false;

    values.push(id);
    const result = this.db.prepare(`
      UPDATE memories SET ${sets.join(', ')} WHERE id = ?
    `).run(...values);

    return result.changes > 0;
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ============================================================
  // SEARCH
  // ============================================================

  search(query: MemoryQuery): MemorySearchResult[] {
    const results: MemorySearchResult[] = [];

    // Build FTS query
    const ftsTerms = query.query
      .split(/\s+/)
      .filter(t => t.length > 2)
      .map(t => `"${t}"*`)
      .join(' OR ');

    if (ftsTerms) {
      // Full-text search
      const ftsResults = this.db.prepare(`
        SELECT m.*, bm25(memories_fts) as rank
        FROM memories m
        JOIN memories_fts fts ON fts.id = m.id
        WHERE memories_fts MATCH ?
        ${query.userId ? 'AND m.user_id = ?' : ''}
        ${query.types?.length ? `AND m.type IN (${query.types.map(() => '?').join(',')})` : ''}
        ${query.minImportance ? 'AND m.importance >= ?' : ''}
        ORDER BY rank
        LIMIT ?
      `);

      const params: unknown[] = [ftsTerms];
      if (query.userId) params.push(query.userId);
      if (query.types?.length) params.push(...query.types);
      if (query.minImportance) params.push(query.minImportance);
      params.push(query.limit || 10);

      const rows = ftsResults.all(...params) as any[];

      for (const row of rows) {
        results.push({
          entry: this.rowToEntry(row),
          score: Math.min(1, Math.abs(row.rank) / 10), // Normalize BM25 score
          matchType: 'keyword'
        });
      }
    }

    // Fallback to LIKE search if no FTS results
    if (results.length === 0 && query.query) {
      const likeResults = this.db.prepare(`
        SELECT * FROM memories
        WHERE content LIKE ?
        ${query.userId ? 'AND user_id = ?' : ''}
        ${query.types?.length ? `AND type IN (${query.types.map(() => '?').join(',')})` : ''}
        ORDER BY importance DESC, created_at DESC
        LIMIT ?
      `);

      const params: unknown[] = [`%${query.query}%`];
      if (query.userId) params.push(query.userId);
      if (query.types?.length) params.push(...query.types);
      params.push(query.limit || 10);

      const rows = likeResults.all(...params) as any[];

      for (const row of rows) {
        results.push({
          entry: this.rowToEntry(row),
          score: 0.5, // Lower score for LIKE matches
          matchType: 'keyword'
        });
      }
    }

    return results;
  }

  getRecent(userId: string, limit: number = 10, types?: MemoryType[]): MemoryEntry[] {
    const query = `
      SELECT * FROM memories
      WHERE user_id = ?
      ${types?.length ? `AND type IN (${types.map(() => '?').join(',')})` : ''}
      ORDER BY created_at DESC
      LIMIT ?
    `;

    const params: unknown[] = [userId];
    if (types?.length) params.push(...types);
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.rowToEntry(row));
  }

  getByTag(userId: string, tag: string, limit: number = 10): MemoryEntry[] {
    const rows = this.db.prepare(`
      SELECT * FROM memories
      WHERE user_id = ?
      AND json_extract(metadata, '$.tags') LIKE ?
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    `).all(userId, `%"${tag}"%`, limit) as any[];

    return rows.map(row => this.rowToEntry(row));
  }

  // ============================================================
  // ANALYTICS
  // ============================================================

  getStats(userId: string): {
    totalMemories: number;
    byType: Record<MemoryType, number>;
    avgImportance: number;
  } {
    const total = this.db.prepare(
      'SELECT COUNT(*) as count FROM memories WHERE user_id = ?'
    ).get(userId) as { count: number };

    const byType = this.db.prepare(`
      SELECT type, COUNT(*) as count FROM memories WHERE user_id = ? GROUP BY type
    `).all(userId) as Array<{ type: MemoryType; count: number }>;

    const avgImportance = this.db.prepare(
      'SELECT AVG(importance) as avg FROM memories WHERE user_id = ?'
    ).get(userId) as { avg: number | null };

    const typeMap: Record<string, number> = {};
    for (const row of byType) {
      typeMap[row.type] = row.count;
    }

    return {
      totalMemories: total.count,
      byType: typeMap as Record<MemoryType, number>,
      avgImportance: avgImportance.avg || 0
    };
  }

  // ============================================================
  // MAINTENANCE
  // ============================================================

  prune(userId: string, options: {
    maxAge?: number;       // Days
    maxCount?: number;
    minImportance?: number;
  }): number {
    let deleted = 0;

    // Delete old low-importance memories
    if (options.maxAge && options.minImportance !== undefined) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - options.maxAge);

      const result = this.db.prepare(`
        DELETE FROM memories
        WHERE user_id = ?
        AND created_at < ?
        AND importance < ?
      `).run(userId, cutoff.toISOString(), options.minImportance);

      deleted += result.changes;
    }

    // Keep only maxCount most recent
    if (options.maxCount) {
      const result = this.db.prepare(`
        DELETE FROM memories
        WHERE user_id = ?
        AND id NOT IN (
          SELECT id FROM memories
          WHERE user_id = ?
          ORDER BY importance DESC, created_at DESC
          LIMIT ?
        )
      `).run(userId, userId, options.maxCount);

      deleted += result.changes;
    }

    return deleted;
  }

  close(): void {
    this.db.close();
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private rowToEntry(row: any): MemoryEntry {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type as MemoryType,
      content: row.content,
      metadata: JSON.parse(row.metadata || '{}'),
      embedding: row.embedding
        ? Array.from(new Float32Array(row.embedding.buffer))
        : undefined,
      createdAt: new Date(row.created_at),
      lastAccessed: row.last_accessed ? new Date(row.last_accessed) : undefined,
      accessCount: row.access_count,
      importance: row.importance
    };
  }
}
