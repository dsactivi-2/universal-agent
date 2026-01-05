// ============================================================
// SQL QUERY TOOL
// Query SQLite databases and in-memory data
// ============================================================

import Database from 'better-sqlite3';
import type { Tool, ToolDefinition } from '../types/index.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// SQL QUERY TOOL
// ============================================================

export class SqlQueryTool implements Tool {
  definition: ToolDefinition = {
    name: 'sql_query',
    description: 'Execute SQL SELECT queries on SQLite databases. Safe read-only queries only.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL query to execute (SELECT only for safety)' },
        database: { type: 'string', description: 'Path to SQLite database file' },
        limit: { type: 'number', description: 'Maximum rows to return', default: 1000 },
        format: { type: 'string', enum: ['table', 'json', 'csv'], description: 'Output format', default: 'json' }
      },
      required: ['query']
    },
    requiresConfirmation: false,
    costPerCall: 0
  };

  private connections: Map<string, Database.Database> = new Map();
  private memoryDb: Database.Database | null = null;

  private getConnection(dbPath?: string): Database.Database {
    if (!dbPath) {
      if (!this.memoryDb) {
        this.memoryDb = new Database(':memory:');
      }
      return this.memoryDb;
    }

    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database file not found: ${dbPath}`);
    }

    if (this.connections.has(dbPath)) {
      return this.connections.get(dbPath)!;
    }

    const db = new Database(dbPath, { readonly: true });
    this.connections.set(dbPath, db);
    return db;
  }

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const query = args.query as string;
    const database = args.database as string | undefined;
    const limit = (args.limit as number) || 1000;
    const format = (args.format as string) || 'json';

    // Security: Only allow SELECT queries
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery.startsWith('select') &&
        !normalizedQuery.startsWith('with') &&
        !normalizedQuery.startsWith('pragma')) {
      return { error: 'Only SELECT, WITH (CTE), and PRAGMA queries are allowed for safety' };
    }

    // Block dangerous statements
    const dangerous = ['drop', 'delete', 'update', 'insert', 'alter', 'create', 'truncate'];
    for (const word of dangerous) {
      if (normalizedQuery.includes(word) && !normalizedQuery.startsWith('with')) {
        return { error: `Query contains forbidden operation: ${word.toUpperCase()}` };
      }
    }

    try {
      const db = this.getConnection(database);

      // Add LIMIT if not present
      let finalQuery = query;
      if (!normalizedQuery.includes('limit')) {
        finalQuery = `${query} LIMIT ${limit}`;
      }

      const stmt = db.prepare(finalQuery);
      const rows = stmt.all() as Record<string, unknown>[];

      return {
        rowCount: rows.length,
        columns: rows.length > 0 ? Object.keys(rows[0]) : [],
        rows: rows,
        formatted: this.formatOutput(rows, format)
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Query execution failed' };
    }
  }

  private formatOutput(rows: Record<string, unknown>[], format: string): string {
    if (rows.length === 0) return 'No results';

    switch (format) {
      case 'csv': {
        const columns = Object.keys(rows[0]);
        const header = columns.join(',');
        const dataRows = rows.map(row =>
          columns.map(col => {
            const val = row[col];
            if (val === null || val === undefined) return '';
            const str = String(val);
            return str.includes(',') || str.includes('"')
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          }).join(',')
        );
        return [header, ...dataRows].join('\n');
      }

      case 'table': {
        const columns = Object.keys(rows[0]);
        const colWidths = columns.map(col => {
          const maxDataWidth = Math.max(...rows.map(row => String(row[col] ?? '').length));
          return Math.max(col.length, maxDataWidth, 4);
        });

        const separator = '+' + colWidths.map(w => '-'.repeat(w + 2)).join('+') + '+';
        const header = '|' + columns.map((col, i) => ` ${col.padEnd(colWidths[i])} `).join('|') + '|';
        const dataRows = rows.slice(0, 50).map(row =>
          '|' + columns.map((col, i) => ` ${String(row[col] ?? '').padEnd(colWidths[i])} `).join('|') + '|'
        );

        let result = [separator, header, separator, ...dataRows, separator].join('\n');
        if (rows.length > 50) {
          result += `\n... and ${rows.length - 50} more rows`;
        }
        return result;
      }

      default:
        return JSON.stringify(rows, null, 2);
    }
  }

  close(): void {
    for (const db of this.connections.values()) {
      db.close();
    }
    this.connections.clear();
    if (this.memoryDb) {
      this.memoryDb.close();
      this.memoryDb = null;
    }
  }
}

// ============================================================
// CREATE TEMP TABLE TOOL
// ============================================================

export class CreateTempTableTool implements Tool {
  definition: ToolDefinition = {
    name: 'sql_create_temp_table',
    description: 'Create a temporary table from data for SQL queries. Useful for analyzing CSV/JSON data with SQL.',
    inputSchema: {
      type: 'object',
      properties: {
        tableName: { type: 'string', description: 'Name for the temporary table' },
        data: { type: 'array', description: 'Array of objects to load into table' }
      },
      required: ['tableName', 'data']
    },
    requiresConfirmation: false,
    costPerCall: 0
  };

  private db: Database.Database | null = null;

  getDatabase(): Database.Database {
    if (!this.db) {
      this.db = new Database(':memory:');
    }
    return this.db;
  }

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const tableName = args.tableName as string;
    const data = args.data as Record<string, unknown>[];

    if (!data || data.length === 0) {
      return { error: 'Data array is empty' };
    }

    const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
    const db = this.getDatabase();

    try {
      // Infer schema from first row
      const columns = Object.keys(data[0]);
      const columnDefs = columns.map(col => {
        const sampleValue = data[0][col];
        let type = 'TEXT';
        if (typeof sampleValue === 'number') {
          type = Number.isInteger(sampleValue) ? 'INTEGER' : 'REAL';
        } else if (typeof sampleValue === 'boolean') {
          type = 'INTEGER';
        }
        return `"${col}" ${type}`;
      });

      db.exec(`DROP TABLE IF EXISTS "${safeName}"`);
      db.exec(`CREATE TABLE "${safeName}" (${columnDefs.join(', ')})`);

      const placeholders = columns.map(() => '?').join(', ');
      const insertStmt = db.prepare(`INSERT INTO "${safeName}" VALUES (${placeholders})`);

      const insertMany = db.transaction((rows: Record<string, unknown>[]) => {
        for (const row of rows) {
          const values = columns.map(col => {
            const val = row[col];
            if (val === null || val === undefined) return null;
            if (typeof val === 'boolean') return val ? 1 : 0;
            if (typeof val === 'object') return JSON.stringify(val);
            return val;
          });
          insertStmt.run(...values);
        }
      });

      insertMany(data);

      return {
        tableName: safeName,
        rowCount: data.length,
        columns: columns,
        sampleQuery: `SELECT * FROM "${safeName}" LIMIT 10`
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to create table' };
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// ============================================================
// DESCRIBE TABLE TOOL
// ============================================================

export class DescribeTableTool implements Tool {
  definition: ToolDefinition = {
    name: 'sql_describe_table',
    description: 'Get schema information about a table in a SQLite database',
    inputSchema: {
      type: 'object',
      properties: {
        tableName: { type: 'string', description: 'Name of table to describe' },
        database: { type: 'string', description: 'Path to SQLite database file' }
      },
      required: ['tableName', 'database']
    },
    requiresConfirmation: false,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const tableName = args.tableName as string;
    const database = args.database as string;

    if (!fs.existsSync(database)) {
      return { error: `Database file not found: ${database}` };
    }

    const db = new Database(database, { readonly: true });

    try {
      const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: unknown;
        pk: number;
      }>;

      if (columns.length === 0) {
        return { error: `Table not found: ${tableName}` };
      }

      const countResult = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get() as { count: number };
      const indexes = db.prepare(`PRAGMA index_list("${tableName}")`).all() as Array<{
        seq: number;
        name: string;
        unique: number;
      }>;
      const foreignKeys = db.prepare(`PRAGMA foreign_key_list("${tableName}")`).all();

      return {
        tableName,
        columns: columns.map(col => ({
          name: col.name,
          type: col.type,
          nullable: col.notnull === 0,
          defaultValue: col.dflt_value,
          primaryKey: col.pk > 0
        })),
        rowCount: countResult.count,
        indexes: indexes.map(idx => ({ name: idx.name, unique: idx.unique === 1 })),
        foreignKeys
      };
    } finally {
      db.close();
    }
  }
}

// ============================================================
// LIST TABLES TOOL
// ============================================================

export class ListTablesTool implements Tool {
  definition: ToolDefinition = {
    name: 'sql_list_tables',
    description: 'List all tables in a SQLite database',
    inputSchema: {
      type: 'object',
      properties: {
        database: { type: 'string', description: 'Path to SQLite database file' }
      },
      required: ['database']
    },
    requiresConfirmation: false,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const database = args.database as string;

    if (!fs.existsSync(database)) {
      return { error: `Database file not found: ${database}` };
    }

    const db = new Database(database, { readonly: true });

    try {
      const tables = db.prepare(`
        SELECT name, type
        FROM sqlite_master
        WHERE type IN ('table', 'view')
        AND name NOT LIKE 'sqlite_%'
        ORDER BY type, name
      `).all() as Array<{ name: string; type: string }>;

      const tableInfo = tables.map(t => {
        try {
          const count = db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get() as { count: number };
          return { name: t.name, type: t.type, rowCount: count.count };
        } catch {
          return { name: t.name, type: t.type, rowCount: -1 };
        }
      });

      return {
        database: path.basename(database),
        tableCount: tables.length,
        tables: tableInfo
      };
    } finally {
      db.close();
    }
  }
}

// ============================================================
// AGGREGATE QUERY TOOL
// ============================================================

export class AggregateQueryTool implements Tool {
  definition: ToolDefinition = {
    name: 'sql_aggregate',
    description: 'Run aggregate queries (COUNT, SUM, AVG, etc.) on SQLite tables with grouping',
    inputSchema: {
      type: 'object',
      properties: {
        tableName: { type: 'string', description: 'Table name to aggregate' },
        database: { type: 'string', description: 'Database path' },
        groupBy: { type: 'array', description: 'Columns to group by' },
        aggregations: {
          type: 'array',
          description: 'Aggregation functions to apply',
          items: {
            type: 'object',
            properties: {
              column: { type: 'string' },
              function: { type: 'string', enum: ['count', 'sum', 'avg', 'min', 'max', 'total'] },
              alias: { type: 'string' }
            }
          }
        },
        where: { type: 'string', description: 'WHERE clause (without WHERE keyword)' },
        having: { type: 'string', description: 'HAVING clause (without HAVING keyword)' },
        orderBy: { type: 'string', description: 'ORDER BY clause' },
        limit: { type: 'number', default: 100 }
      },
      required: ['tableName', 'database', 'aggregations']
    },
    requiresConfirmation: false,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const tableName = args.tableName as string;
    const database = args.database as string;
    const groupBy = args.groupBy as string[] | undefined;
    const aggregations = args.aggregations as Array<{ column: string; function: string; alias?: string }>;
    const where = args.where as string | undefined;
    const having = args.having as string | undefined;
    const orderBy = args.orderBy as string | undefined;
    const limit = (args.limit as number) || 100;

    if (!fs.existsSync(database)) {
      return { error: `Database file not found: ${database}` };
    }

    try {
      const selectParts: string[] = [];

      if (groupBy && groupBy.length > 0) {
        selectParts.push(...groupBy.map(col => `"${col}"`));
      }

      for (const agg of aggregations) {
        const alias = agg.alias || `${agg.function}_${agg.column}`;
        if (agg.column === '*') {
          selectParts.push(`${agg.function.toUpperCase()}(*) AS "${alias}"`);
        } else {
          selectParts.push(`${agg.function.toUpperCase()}("${agg.column}") AS "${alias}"`);
        }
      }

      let query = `SELECT ${selectParts.join(', ')} FROM "${tableName}"`;

      if (where) query += ` WHERE ${where}`;
      if (groupBy && groupBy.length > 0) {
        query += ` GROUP BY ${groupBy.map(col => `"${col}"`).join(', ')}`;
      }
      if (having) query += ` HAVING ${having}`;
      if (orderBy) query += ` ORDER BY ${orderBy}`;
      query += ` LIMIT ${limit}`;

      const db = new Database(database, { readonly: true });

      try {
        const rows = db.prepare(query).all();
        return { query, rowCount: rows.length, results: rows };
      } finally {
        db.close();
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Aggregate query failed' };
    }
  }
}
