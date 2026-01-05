// ============================================================
// FILE TOOLS - Read, Write, List operations
// ============================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Tool, ToolDefinition } from '../types/index.js';

// ============================================================
// FILE READ TOOL
// ============================================================

export class FileReadTool implements Tool {
  definition: ToolDefinition = {
    name: 'file_read',
    description: 'Read the contents of a file. Returns the file content as text.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path to read (relative or absolute)'
        },
        encoding: {
          type: 'string',
          description: 'File encoding (default: utf-8)',
          enum: ['utf-8', 'ascii', 'base64']
        }
      },
      required: ['path']
    },
    requiresConfirmation: false,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const filePath = args.path as string;
    const encoding = (args.encoding as BufferEncoding) || 'utf-8';

    try {
      const resolvedPath = path.resolve(filePath);
      const stats = await fs.stat(resolvedPath);

      if (stats.isDirectory()) {
        return {
          success: false,
          error: 'Path is a directory, not a file. Use file_list to list directory contents.'
        };
      }

      // Limit file size to 1MB
      if (stats.size > 1024 * 1024) {
        return {
          success: false,
          error: `File too large (${stats.size} bytes). Maximum size is 1MB.`
        };
      }

      const content = await fs.readFile(resolvedPath, encoding);

      return {
        success: true,
        path: resolvedPath,
        content,
        size: stats.size,
        modified: stats.mtime.toISOString()
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { success: false, error: `File not found: ${filePath}` };
      }
      if (err.code === 'EACCES') {
        return { success: false, error: `Permission denied: ${filePath}` };
      }
      return { success: false, error: `Failed to read file: ${err.message}` };
    }
  }
}

// ============================================================
// FILE WRITE TOOL
// ============================================================

export class FileWriteTool implements Tool {
  definition: ToolDefinition = {
    name: 'file_write',
    description: 'Write content to a file. Creates the file if it does not exist, or overwrites if it does.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path to write to'
        },
        content: {
          type: 'string',
          description: 'The content to write to the file'
        },
        createDirs: {
          type: 'boolean',
          description: 'Create parent directories if they do not exist (default: true)'
        }
      },
      required: ['path', 'content']
    },
    requiresConfirmation: true,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const filePath = args.path as string;
    const content = args.content as string;
    const createDirs = args.createDirs !== false;

    try {
      const resolvedPath = path.resolve(filePath);

      // Create parent directories if needed
      if (createDirs) {
        const dir = path.dirname(resolvedPath);
        await fs.mkdir(dir, { recursive: true });
      }

      await fs.writeFile(resolvedPath, content, 'utf-8');
      const stats = await fs.stat(resolvedPath);

      return {
        success: true,
        path: resolvedPath,
        size: stats.size,
        created: stats.birthtime.toISOString()
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      return { success: false, error: `Failed to write file: ${err.message}` };
    }
  }
}

// ============================================================
// FILE LIST TOOL
// ============================================================

export class FileListTool implements Tool {
  definition: ToolDefinition = {
    name: 'file_list',
    description: 'List files and directories in a given path. Returns file names, sizes, and types.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The directory path to list (default: current directory)'
        },
        recursive: {
          type: 'boolean',
          description: 'List files recursively (default: false)'
        },
        pattern: {
          type: 'string',
          description: 'Filter files by glob pattern (e.g., "*.ts", "**/*.js")'
        }
      }
    },
    requiresConfirmation: false,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const dirPath = (args.path as string) || '.';
    const recursive = args.recursive === true;
    const pattern = args.pattern as string | undefined;

    try {
      const resolvedPath = path.resolve(dirPath);
      const stats = await fs.stat(resolvedPath);

      if (!stats.isDirectory()) {
        return {
          success: false,
          error: 'Path is not a directory'
        };
      }

      const entries = await this.listDirectory(resolvedPath, recursive, pattern);

      return {
        success: true,
        path: resolvedPath,
        count: entries.length,
        entries
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { success: false, error: `Directory not found: ${dirPath}` };
      }
      return { success: false, error: `Failed to list directory: ${err.message}` };
    }
  }

  private async listDirectory(
    dirPath: string,
    recursive: boolean,
    pattern?: string,
    basePath: string = dirPath
  ): Promise<Array<{ name: string; type: 'file' | 'directory'; size?: number; relativePath: string }>> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const results: Array<{ name: string; type: 'file' | 'directory'; size?: number; relativePath: string }> = [];

    for (const entry of entries) {
      // Skip hidden files and common ignore patterns
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);

      // Apply pattern filter if specified
      if (pattern && !this.matchPattern(entry.name, pattern)) {
        if (!entry.isDirectory() || !recursive) {
          continue;
        }
      }

      if (entry.isDirectory()) {
        results.push({
          name: entry.name,
          type: 'directory',
          relativePath
        });

        if (recursive) {
          const subEntries = await this.listDirectory(fullPath, recursive, pattern, basePath);
          results.push(...subEntries);
        }
      } else {
        const stats = await fs.stat(fullPath);
        results.push({
          name: entry.name,
          type: 'file',
          size: stats.size,
          relativePath
        });
      }
    }

    return results;
  }

  private matchPattern(filename: string, pattern: string): boolean {
    // Simple glob matching
    const regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regex}$`).test(filename);
  }
}

// ============================================================
// FILE EDIT TOOL
// ============================================================

export class FileEditTool implements Tool {
  definition: ToolDefinition = {
    name: 'file_edit',
    description: 'Edit a file by replacing specific text. Use for precise modifications without rewriting the entire file.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path to edit'
        },
        oldText: {
          type: 'string',
          description: 'The exact text to find and replace'
        },
        newText: {
          type: 'string',
          description: 'The new text to replace with'
        },
        replaceAll: {
          type: 'boolean',
          description: 'Replace all occurrences (default: false, replaces first only)'
        }
      },
      required: ['path', 'oldText', 'newText']
    },
    requiresConfirmation: true,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const filePath = args.path as string;
    const oldText = args.oldText as string;
    const newText = args.newText as string;
    const replaceAll = args.replaceAll === true;

    try {
      const resolvedPath = path.resolve(filePath);
      const content = await fs.readFile(resolvedPath, 'utf-8');

      if (!content.includes(oldText)) {
        return {
          success: false,
          error: 'Old text not found in file'
        };
      }

      let newContent: string;
      let replacements: number;

      if (replaceAll) {
        const parts = content.split(oldText);
        replacements = parts.length - 1;
        newContent = parts.join(newText);
      } else {
        newContent = content.replace(oldText, newText);
        replacements = 1;
      }

      await fs.writeFile(resolvedPath, newContent, 'utf-8');

      return {
        success: true,
        path: resolvedPath,
        replacements,
        oldLength: content.length,
        newLength: newContent.length
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      return { success: false, error: `Failed to edit file: ${err.message}` };
    }
  }
}
