// ============================================================
// DATA TOOLS - CSV, JSON, Excel analysis
// ============================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Tool, ToolDefinition } from '../types/index.js';

// ============================================================
// CSV PARSER TOOL
// ============================================================

export class CsvParseTool implements Tool {
  definition: ToolDefinition = {
    name: 'csv_parse',
    description: 'Parse a CSV file and return structured data. Can also perform basic analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the CSV file'
        },
        delimiter: {
          type: 'string',
          description: 'Column delimiter (default: ",")'
        },
        hasHeader: {
          type: 'boolean',
          description: 'First row is header (default: true)'
        },
        limit: {
          type: 'number',
          description: 'Maximum rows to return (default: 100)'
        },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific columns to extract'
        }
      },
      required: ['path']
    },
    requiresConfirmation: false,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const filePath = args.path as string;
    const delimiter = (args.delimiter as string) || ',';
    const hasHeader = args.hasHeader !== false;
    const limit = (args.limit as number) || 100;
    const columns = args.columns as string[] | undefined;

    try {
      const content = await fs.readFile(path.resolve(filePath), 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      if (lines.length === 0) {
        return { success: false, error: 'Empty file' };
      }

      // Parse header
      const headerLine = lines[0];
      const headers = this.parseCsvLine(headerLine, delimiter);

      // Determine which columns to include
      let columnIndices: number[] = [];
      let outputHeaders: string[] = [];

      if (columns && columns.length > 0) {
        for (const col of columns) {
          const idx = headers.indexOf(col);
          if (idx !== -1) {
            columnIndices.push(idx);
            outputHeaders.push(col);
          }
        }
      } else {
        columnIndices = headers.map((_, i) => i);
        outputHeaders = headers;
      }

      // Parse data rows
      const startRow = hasHeader ? 1 : 0;
      const rows: Record<string, string>[] = [];

      for (let i = startRow; i < Math.min(lines.length, startRow + limit); i++) {
        const values = this.parseCsvLine(lines[i], delimiter);
        const row: Record<string, string> = {};

        for (let j = 0; j < columnIndices.length; j++) {
          const colIdx = columnIndices[j];
          row[outputHeaders[j]] = values[colIdx] || '';
        }

        rows.push(row);
      }

      // Basic stats
      const stats = this.calculateStats(rows, outputHeaders);

      return {
        success: true,
        path: filePath,
        totalRows: lines.length - (hasHeader ? 1 : 0),
        returnedRows: rows.length,
        columns: outputHeaders,
        data: rows,
        stats
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to parse CSV'
      };
    }
  }

  private parseCsvLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  private calculateStats(rows: Record<string, string>[], columns: string[]): Record<string, unknown> {
    const stats: Record<string, unknown> = {};

    for (const col of columns) {
      const values = rows.map(r => r[col]).filter(v => v !== '');
      const numericValues = values.map(v => parseFloat(v)).filter(v => !isNaN(v));

      if (numericValues.length > 0) {
        stats[col] = {
          type: 'numeric',
          count: numericValues.length,
          min: Math.min(...numericValues),
          max: Math.max(...numericValues),
          avg: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
          sum: numericValues.reduce((a, b) => a + b, 0)
        };
      } else {
        const uniqueValues = [...new Set(values)];
        stats[col] = {
          type: 'string',
          count: values.length,
          unique: uniqueValues.length,
          sample: uniqueValues.slice(0, 5)
        };
      }
    }

    return stats;
  }
}

// ============================================================
// JSON PARSE TOOL
// ============================================================

export class JsonParseTool implements Tool {
  definition: ToolDefinition = {
    name: 'json_parse',
    description: 'Parse a JSON file and extract data with optional JSONPath queries.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the JSON file'
        },
        query: {
          type: 'string',
          description: 'JSONPath-like query (e.g., "data.users[*].name")'
        }
      },
      required: ['path']
    },
    requiresConfirmation: false,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const filePath = args.path as string;
    const query = args.query as string | undefined;

    try {
      const content = await fs.readFile(path.resolve(filePath), 'utf-8');
      const data = JSON.parse(content);

      let result = data;

      if (query) {
        result = this.queryJson(data, query);
      }

      // Get structure info
      const structure = this.analyzeStructure(data);

      return {
        success: true,
        path: filePath,
        structure,
        data: result,
        dataType: Array.isArray(result) ? 'array' : typeof result,
        itemCount: Array.isArray(result) ? result.length : undefined
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to parse JSON'
      };
    }
  }

  private queryJson(data: unknown, query: string): unknown {
    const parts = query.split('.').filter(p => p);
    let current: unknown = data;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;

      // Handle array access like "users[*]" or "users[0]"
      const arrayMatch = part.match(/^(\w+)\[(\*|\d+)\]$/);

      if (arrayMatch) {
        const [, key, index] = arrayMatch;
        current = (current as Record<string, unknown>)[key];

        if (Array.isArray(current)) {
          if (index === '*') {
            // Return all items
          } else {
            current = current[parseInt(index)];
          }
        }
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }

    return current;
  }

  private analyzeStructure(data: unknown, depth: number = 0, maxDepth: number = 3): unknown {
    if (depth >= maxDepth) return '...';

    if (Array.isArray(data)) {
      if (data.length === 0) return '[]';
      return [this.analyzeStructure(data[0], depth + 1, maxDepth)];
    }

    if (data !== null && typeof data === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = this.analyzeStructure(value, depth + 1, maxDepth);
      }
      return result;
    }

    return typeof data;
  }
}

// ============================================================
// DATA TRANSFORM TOOL
// ============================================================

export class DataTransformTool implements Tool {
  definition: ToolDefinition = {
    name: 'data_transform',
    description: 'Transform data: filter, map, aggregate, sort, group by.',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          description: 'Array of objects to transform'
        },
        operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['filter', 'map', 'sort', 'groupBy', 'aggregate', 'limit'] },
              params: { type: 'object' }
            }
          },
          description: 'Operations to apply in order'
        }
      },
      required: ['data', 'operations']
    },
    requiresConfirmation: false,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    let data = args.data as Record<string, unknown>[];
    const operations = args.operations as Array<{ type: string; params: Record<string, unknown> }>;

    try {
      for (const op of operations) {
        data = this.applyOperation(data, op.type, op.params);
      }

      return {
        success: true,
        resultCount: Array.isArray(data) ? data.length : 1,
        data
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transform failed'
      };
    }
  }

  private applyOperation(
    data: Record<string, unknown>[],
    type: string,
    params: Record<string, unknown>
  ): Record<string, unknown>[] {
    switch (type) {
      case 'filter': {
        const { field, operator, value } = params;
        return data.filter(item => {
          const itemValue = item[field as string];
          switch (operator) {
            case 'eq': return itemValue === value;
            case 'ne': return itemValue !== value;
            case 'gt': return Number(itemValue) > Number(value);
            case 'gte': return Number(itemValue) >= Number(value);
            case 'lt': return Number(itemValue) < Number(value);
            case 'lte': return Number(itemValue) <= Number(value);
            case 'contains': return String(itemValue).includes(String(value));
            case 'startsWith': return String(itemValue).startsWith(String(value));
            default: return true;
          }
        });
      }

      case 'map': {
        const { fields, rename } = params;
        const fieldList = fields as string[];
        const renameMap = (rename || {}) as Record<string, string>;

        return data.map(item => {
          const result: Record<string, unknown> = {};
          for (const field of fieldList) {
            const newName = renameMap[field] || field;
            result[newName] = item[field];
          }
          return result;
        });
      }

      case 'sort': {
        const { field, order } = params;
        const sortField = field as string;
        const sortOrder = (order as string) || 'asc';

        return [...data].sort((a, b) => {
          const aVal = a[sortField];
          const bVal = b[sortField];

          if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
          }

          const comparison = String(aVal).localeCompare(String(bVal));
          return sortOrder === 'asc' ? comparison : -comparison;
        });
      }

      case 'groupBy': {
        const { field, aggregations } = params;
        const groupField = field as string;
        const aggs = (aggregations || []) as Array<{ field: string; op: string; as: string }>;

        const groups = new Map<unknown, Record<string, unknown>[]>();

        for (const item of data) {
          const key = item[groupField];
          if (!groups.has(key)) {
            groups.set(key, []);
          }
          groups.get(key)!.push(item);
        }

        const result: Record<string, unknown>[] = [];

        for (const [key, items] of groups) {
          const row: Record<string, unknown> = { [groupField]: key, count: items.length };

          for (const agg of aggs) {
            const values = items.map(i => Number(i[agg.field])).filter(v => !isNaN(v));
            switch (agg.op) {
              case 'sum': row[agg.as] = values.reduce((a, b) => a + b, 0); break;
              case 'avg': row[agg.as] = values.reduce((a, b) => a + b, 0) / values.length; break;
              case 'min': row[agg.as] = Math.min(...values); break;
              case 'max': row[agg.as] = Math.max(...values); break;
            }
          }

          result.push(row);
        }

        return result;
      }

      case 'aggregate': {
        const { aggregations } = params;
        const aggs = aggregations as Array<{ field: string; op: string; as: string }>;

        const result: Record<string, unknown> = { totalCount: data.length };

        for (const agg of aggs) {
          const values = data.map(i => Number(i[agg.field])).filter(v => !isNaN(v));
          switch (agg.op) {
            case 'sum': result[agg.as] = values.reduce((a, b) => a + b, 0); break;
            case 'avg': result[agg.as] = values.reduce((a, b) => a + b, 0) / values.length; break;
            case 'min': result[agg.as] = Math.min(...values); break;
            case 'max': result[agg.as] = Math.max(...values); break;
            case 'count': result[agg.as] = values.length; break;
          }
        }

        return [result];
      }

      case 'limit': {
        const { count, offset } = params;
        const limitCount = (count as number) || 10;
        const limitOffset = (offset as number) || 0;
        return data.slice(limitOffset, limitOffset + limitCount);
      }

      default:
        return data;
    }
  }
}

// ============================================================
// DATA EXPORT TOOL
// ============================================================

export class DataExportTool implements Tool {
  definition: ToolDefinition = {
    name: 'data_export',
    description: 'Export data to CSV, JSON, or Markdown table format.',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          description: 'Array of objects to export'
        },
        format: {
          type: 'string',
          enum: ['csv', 'json', 'markdown'],
          description: 'Output format'
        },
        path: {
          type: 'string',
          description: 'File path to save (optional, returns content if not provided)'
        }
      },
      required: ['data', 'format']
    },
    requiresConfirmation: true,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const data = args.data as Record<string, unknown>[];
    const format = args.format as string;
    const filePath = args.path as string | undefined;

    try {
      let content: string;

      switch (format) {
        case 'csv':
          content = this.toCsv(data);
          break;
        case 'json':
          content = JSON.stringify(data, null, 2);
          break;
        case 'markdown':
          content = this.toMarkdown(data);
          break;
        default:
          return { success: false, error: `Unknown format: ${format}` };
      }

      if (filePath) {
        await fs.writeFile(path.resolve(filePath), content, 'utf-8');
        return {
          success: true,
          path: filePath,
          format,
          rowCount: data.length,
          size: content.length
        };
      }

      return {
        success: true,
        format,
        rowCount: data.length,
        content
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Export failed'
      };
    }
  }

  private toCsv(data: Record<string, unknown>[]): string {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const lines: string[] = [headers.join(',')];

    for (const row of data) {
      const values = headers.map(h => {
        const val = row[h];
        const str = val === null || val === undefined ? '' : String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      });
      lines.push(values.join(','));
    }

    return lines.join('\n');
  }

  private toMarkdown(data: Record<string, unknown>[]): string {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const lines: string[] = [];

    // Header row
    lines.push('| ' + headers.join(' | ') + ' |');
    lines.push('| ' + headers.map(() => '---').join(' | ') + ' |');

    // Data rows
    for (const row of data) {
      const values = headers.map(h => {
        const val = row[h];
        return val === null || val === undefined ? '' : String(val);
      });
      lines.push('| ' + values.join(' | ') + ' |');
    }

    return lines.join('\n');
  }
}
