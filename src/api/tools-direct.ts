// ============================================================
// DIRECT TOOL ENDPOINTS - Real execution, not via AI
// ============================================================

import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

interface AuthenticatedRequest extends Request {
  userId?: string;
}

// ============================================================
// ERROR LOGGING
// ============================================================

interface ToolError {
  timestamp: string;
  tool: string;
  userId?: string;
  error: string;
  input?: Record<string, unknown>;
}

const errorLog: ToolError[] = [];
const MAX_ERROR_LOG = 1000;

function logToolError(tool: string, error: Error | string, userId?: string, input?: Record<string, unknown>): void {
  const entry: ToolError = {
    timestamp: new Date().toISOString(),
    tool,
    userId,
    error: error instanceof Error ? error.message : error,
    input
  };

  errorLog.unshift(entry);
  if (errorLog.length > MAX_ERROR_LOG) {
    errorLog.pop();
  }

  console.error(`[TOOL ERROR] ${entry.timestamp} | ${tool} | User: ${userId || 'anonymous'} | ${entry.error}`);
}

// ============================================================
// FILE TOOLS
// ============================================================

export function createDirectToolRoutes(): Router {
  const router = Router();

  // ------------------------------------------------------------
  // ERROR LOG ENDPOINT
  // ------------------------------------------------------------
  router.get('/errors', async (req: AuthenticatedRequest, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    res.json({
      success: true,
      count: errorLog.length,
      errors: errorLog.slice(0, limit)
    });
  });

  // ------------------------------------------------------------
  // FILE: Read
  // ------------------------------------------------------------
  router.post('/file/read', async (req: AuthenticatedRequest, res: Response) => {
    const { path: filePath } = req.body;

    if (!filePath) {
      res.status(400).json({ success: false, error: 'Path is required' });
      return;
    }

    try {
      const resolvedPath = path.resolve(filePath);
      const stats = await fs.stat(resolvedPath);

      if (stats.isDirectory()) {
        res.json({ success: false, error: 'Path is a directory, use /file/list' });
        return;
      }

      if (stats.size > 1024 * 1024) {
        res.json({ success: false, error: `File too large (${stats.size} bytes). Max 1MB.` });
        return;
      }

      const content = await fs.readFile(resolvedPath, 'utf-8');

      res.json({
        success: true,
        result: content,
        path: resolvedPath,
        content,
        size: stats.size,
        modified: stats.mtime.toISOString()
      });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      logToolError('file/read', err, req.userId, { path: filePath });
      if (err.code === 'ENOENT') {
        res.json({ success: false, error: `File not found: ${filePath}` });
      } else if (err.code === 'EACCES') {
        res.json({ success: false, error: `Permission denied: ${filePath}` });
      } else {
        res.json({ success: false, error: `Failed to read file: ${err.message}` });
      }
    }
  });

  // ------------------------------------------------------------
  // FILE: List directory
  // ------------------------------------------------------------
  router.post('/file/list', async (req: AuthenticatedRequest, res: Response) => {
    const { path: dirPath = '.' } = req.body;

    try {
      const resolvedPath = path.resolve(dirPath);
      const stats = await fs.stat(resolvedPath);

      if (!stats.isDirectory()) {
        res.json({ success: false, error: 'Path is not a directory' });
        return;
      }

      const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
      const results = await Promise.all(
        entries
          .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
          .map(async (entry) => {
            const fullPath = path.join(resolvedPath, entry.name);
            if (entry.isDirectory()) {
              return { name: entry.name, type: 'directory' as const };
            } else {
              const fileStats = await fs.stat(fullPath);
              return { name: entry.name, type: 'file' as const, size: fileStats.size };
            }
          })
      );

      const fileList = results.map(e => `${e.type === 'directory' ? '[DIR]' : '[FILE]'} ${e.name}`).join('\n');
      res.json({
        success: true,
        result: `${resolvedPath}:\n${fileList}`,
        path: resolvedPath,
        count: results.length,
        entries: results
      });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      logToolError('file/list', err, req.userId, { path: dirPath });
      res.json({ success: false, error: `Failed to list directory: ${err.message}` });
    }
  });

  // ------------------------------------------------------------
  // FILE: Write
  // ------------------------------------------------------------
  router.post('/file/write', async (req: AuthenticatedRequest, res: Response) => {
    const { path: filePath, content, createDirs = true } = req.body;

    if (!filePath || content === undefined) {
      res.status(400).json({ success: false, error: 'Path and content are required' });
      return;
    }

    try {
      const resolvedPath = path.resolve(filePath);

      if (createDirs) {
        await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      }

      await fs.writeFile(resolvedPath, content, 'utf-8');
      const stats = await fs.stat(resolvedPath);

      res.json({
        success: true,
        result: `Datei geschrieben: ${resolvedPath} (${stats.size} bytes)`,
        path: resolvedPath,
        size: stats.size
      });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      logToolError('file/write', err, req.userId, { path: filePath });
      res.json({ success: false, error: `Failed to write file: ${err.message}` });
    }
  });

  // ------------------------------------------------------------
  // FILE: Edit (Search & Replace)
  // ------------------------------------------------------------
  router.post('/file/edit', async (req: AuthenticatedRequest, res: Response) => {
    // Support both naming conventions: search/replace and oldText/newText
    const { path: filePath, search, replace, oldText, newText, replaceAll = false } = req.body;
    const searchText = search || oldText;
    const replaceText = replace ?? newText;

    if (!filePath || !searchText || replaceText === undefined) {
      res.status(400).json({ success: false, error: 'Path, search, and replace are required' });
      return;
    }

    try {
      const resolvedPath = path.resolve(filePath);
      const content = await fs.readFile(resolvedPath, 'utf-8');

      if (!content.includes(searchText)) {
        res.json({ success: false, error: 'Text not found in file' });
        return;
      }

      let newContent: string;
      let replacements: number;

      if (replaceAll) {
        const parts = content.split(searchText);
        replacements = parts.length - 1;
        newContent = parts.join(replaceText);
      } else {
        newContent = content.replace(searchText, replaceText);
        replacements = 1;
      }

      await fs.writeFile(resolvedPath, newContent, 'utf-8');

      res.json({
        success: true,
        result: `${replacements} Ersetzung(en) in ${resolvedPath}`,
        path: resolvedPath,
        replacements
      });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      logToolError('file/edit', err, req.userId, { path: filePath, search: searchText });
      res.json({ success: false, error: `Failed to edit file: ${err.message}` });
    }
  });

  // ============================================================
  // CODE EXECUTION
  // ============================================================

  router.post('/code/execute', async (req: AuthenticatedRequest, res: Response) => {
    const { language, code, timeout = 30000 } = req.body;

    if (!language || !code) {
      res.status(400).json({ success: false, error: 'Language and code are required' });
      return;
    }

    try {
      let command: string;

      switch (language) {
        case 'javascript':
          command = `node -e "${code.replace(/"/g, '\\"')}"`;
          break;
        case 'typescript':
          command = `npx tsx -e "${code.replace(/"/g, '\\"')}"`;
          break;
        case 'python':
          command = `python3 -c "${code.replace(/"/g, '\\"')}"`;
          break;
        case 'bash':
          command = code;
          break;
        default:
          res.json({ success: false, error: `Unsupported language: ${language}` });
          return;
      }

      const { stdout, stderr } = await execAsync(command, { timeout });

      res.json({
        success: true,
        result: stdout || stderr || '(keine Ausgabe)',
        language,
        output: stdout || stderr,
        exitCode: 0
      });
    } catch (error) {
      const err = error as Error & { code?: string; stdout?: string; stderr?: string };
      logToolError('code/execute', err, req.userId, { language, codeLength: code?.length });
      res.json({
        success: false,
        error: err.stderr || err.message,
        result: err.stdout || '',
        output: err.stdout || ''
      });
    }
  });

  // ------------------------------------------------------------
  // NPM Commands
  // ------------------------------------------------------------
  router.post('/npm/run', async (req: AuthenticatedRequest, res: Response) => {
    const { command, cwd, timeout = 120000 } = req.body;

    if (!command) {
      res.status(400).json({ success: false, error: 'Command is required' });
      return;
    }

    try {
      const options: { timeout: number; cwd?: string } = { timeout };
      if (cwd) options.cwd = path.resolve(cwd);

      const { stdout, stderr } = await execAsync(`npm ${command}`, options);

      const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');
      res.json({
        success: true,
        result: output || `npm ${command} erfolgreich`,
        command: `npm ${command}`,
        output,
        cwd: options.cwd
      });
    } catch (error) {
      const err = error as Error & { stdout?: string; stderr?: string };
      logToolError('npm/run', err, req.userId, { command, cwd });
      res.json({
        success: false,
        error: err.stderr || err.message,
        result: err.stdout || '',
        output: err.stdout || ''
      });
    }
  });

  // ============================================================
  // GIT COMMANDS
  // ============================================================

  const runGit = async (command: string, cwd?: string, timeout = 30000) => {
    const options: { timeout: number; cwd?: string } = { timeout };
    if (cwd) options.cwd = path.resolve(cwd);
    return execAsync(`git ${command}`, options);
  };

  router.post('/git/status', async (req: AuthenticatedRequest, res: Response) => {
    const { cwd } = req.body;
    try {
      const { stdout } = await runGit('status --porcelain', cwd);
      const { stdout: branchStdout } = await runGit('branch --show-current', cwd);
      const branch = branchStdout.trim();
      const statusLines = stdout.trim().split('\n').filter(Boolean);

      const summary = statusLines.length > 0
        ? `Branch: ${branch}\n${statusLines.length} Datei(en) geändert:\n${stdout}`
        : `Branch: ${branch}\nArbeitsverzeichnis ist sauber`;

      res.json({
        success: true,
        result: summary,
        branch,
        status: statusLines.map(line => ({
          status: line.substring(0, 2).trim(),
          file: line.substring(3)
        })),
        raw: stdout
      });
    } catch (error) {
      const err = error as Error;
      logToolError('git/status', err, req.userId, { cwd });
      res.json({ success: false, error: err.message });
    }
  });

  router.post('/git/diff', async (req: AuthenticatedRequest, res: Response) => {
    const { cwd } = req.body;
    try {
      const { stdout } = await runGit('diff', cwd);
      res.json({ success: true, result: stdout || '(keine Änderungen)', diff: stdout });
    } catch (error) {
      const err = error as Error;
      logToolError('git/diff', err, req.userId, { cwd });
      res.json({ success: false, error: err.message });
    }
  });

  router.post('/git/log', async (req: AuthenticatedRequest, res: Response) => {
    const { cwd, count = 10 } = req.body;
    try {
      const { stdout } = await runGit(`log --oneline -${count}`, cwd);
      const commits = stdout.trim().split('\n').filter(Boolean).map(line => {
        const [hash, ...messageParts] = line.split(' ');
        return { hash, message: messageParts.join(' ') };
      });
      res.json({ success: true, result: stdout || '(keine Commits)', commits, raw: stdout });
    } catch (error) {
      const err = error as Error;
      logToolError('git/log', err, req.userId, { cwd, count });
      res.json({ success: false, error: err.message });
    }
  });

  router.post('/git/add', async (req: AuthenticatedRequest, res: Response) => {
    const { files, cwd } = req.body;
    if (!files || !Array.isArray(files)) {
      res.status(400).json({ success: false, error: 'Files array is required' });
      return;
    }
    try {
      const { stdout } = await runGit(`add ${files.join(' ')}`, cwd);
      res.json({ success: true, result: `${files.length} Datei(en) hinzugefügt: ${files.join(', ')}`, message: `Added ${files.length} file(s)`, output: stdout });
    } catch (error) {
      const err = error as Error;
      logToolError('git/add', err, req.userId, { files, cwd });
      res.json({ success: false, error: err.message });
    }
  });

  router.post('/git/commit', async (req: AuthenticatedRequest, res: Response) => {
    const { message, cwd } = req.body;
    if (!message) {
      res.status(400).json({ success: false, error: 'Commit message is required' });
      return;
    }
    try {
      const { stdout } = await runGit(`commit -m "${message.replace(/"/g, '\\"')}"`, cwd);
      res.json({ success: true, result: stdout || `Commit erstellt: "${message}"`, output: stdout });
    } catch (error) {
      const err = error as Error;
      logToolError('git/commit', err, req.userId, { message, cwd });
      res.json({ success: false, error: err.message });
    }
  });

  router.post('/git/push', async (req: AuthenticatedRequest, res: Response) => {
    const { remote = 'origin', branch, cwd } = req.body;
    try {
      const branchArg = branch ? ` ${branch}` : '';
      const { stdout } = await runGit(`push ${remote}${branchArg}`, cwd, 60000);
      res.json({ success: true, result: stdout || `Push zu ${remote}${branchArg} erfolgreich`, output: stdout });
    } catch (error) {
      const err = error as Error;
      logToolError('git/push', err, req.userId, { remote, branch, cwd });
      res.json({ success: false, error: err.message });
    }
  });

  router.post('/git/pull', async (req: AuthenticatedRequest, res: Response) => {
    const { remote = 'origin', branch, cwd } = req.body;
    try {
      const branchArg = branch ? ` ${branch}` : '';
      const { stdout } = await runGit(`pull ${remote}${branchArg}`, cwd, 60000);
      res.json({ success: true, result: stdout || `Pull von ${remote}${branchArg} erfolgreich`, output: stdout });
    } catch (error) {
      const err = error as Error;
      logToolError('git/pull', err, req.userId, { remote, branch, cwd });
      res.json({ success: false, error: err.message });
    }
  });

  router.post('/git/branch', async (req: AuthenticatedRequest, res: Response) => {
    const { name, cwd } = req.body;
    try {
      if (name) {
        const { stdout } = await runGit(`checkout -b ${name}`, cwd);
        res.json({ success: true, result: `Branch "${name}" erstellt`, message: `Created branch: ${name}`, output: stdout });
      } else {
        const { stdout } = await runGit('branch -a', cwd);
        const branches = stdout.trim().split('\n').map(b => b.trim().replace('* ', ''));
        res.json({ success: true, result: stdout, branches, raw: stdout });
      }
    } catch (error) {
      const err = error as Error;
      logToolError('git/branch', err, req.userId, { name, cwd });
      res.json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // DATA TOOLS (In-Memory SQLite)
  // ============================================================

  // Simple in-memory data store for demo
  const dataStore: Map<string, { columns: string[]; rows: unknown[][] }> = new Map();

  router.post('/data/parse-csv', async (req: AuthenticatedRequest, res: Response) => {
    const { content } = req.body;
    if (!content) {
      res.status(400).json({ success: false, error: 'CSV content is required' });
      return;
    }

    try {
      const lines = content.trim().split('\n');
      const headers = lines[0].split(',').map((h: string) => h.trim());
      const rows = lines.slice(1).map((line: string) =>
        line.split(',').map((cell: string) => cell.trim())
      );

      const preview = rows.slice(0, 5).map((row: string[]) => row.join(' | ')).join('\n');
      res.json({
        success: true,
        result: `CSV geparst: ${headers.length} Spalten, ${rows.length} Zeilen\n\nSpalten: ${headers.join(', ')}\n\nVorschau:\n${preview}`,
        columns: headers,
        rows,
        rowCount: rows.length
      });
    } catch (error) {
      const err = error as Error;
      logToolError('data/parse-csv', err, req.userId, { contentLength: content?.length });
      res.json({ success: false, error: `Failed to parse CSV: ${err.message}` });
    }
  });

  router.post('/data/parse-json', async (req: AuthenticatedRequest, res: Response) => {
    const { content } = req.body;
    if (!content) {
      res.status(400).json({ success: false, error: 'JSON content is required' });
      return;
    }

    try {
      const parsed = JSON.parse(content);
      const type = Array.isArray(parsed) ? 'array' : typeof parsed;
      res.json({
        success: true,
        result: `JSON geparst (${type}):\n${JSON.stringify(parsed, null, 2)}`,
        data: parsed,
        type
      });
    } catch (error) {
      const err = error as Error;
      logToolError('data/parse-json', err, req.userId, { contentLength: content?.length });
      res.json({ success: false, error: `Invalid JSON: ${err.message}` });
    }
  });

  router.post('/data/table/create', async (req: AuthenticatedRequest, res: Response) => {
    const { name, columns } = req.body;
    if (!name || !columns || !Array.isArray(columns)) {
      res.status(400).json({ success: false, error: 'Table name and columns array required' });
      return;
    }

    dataStore.set(name, { columns, rows: [] });
    res.json({ success: true, result: `Tabelle '${name}' erstellt mit Spalten: ${columns.join(', ')}`, message: `Table '${name}' created with ${columns.length} columns` });
  });

  router.get('/data/tables', async (req: AuthenticatedRequest, res: Response) => {
    const tables = Array.from(dataStore.keys()).map(name => ({
      name,
      columns: dataStore.get(name)?.columns,
      rowCount: dataStore.get(name)?.rows.length
    }));
    const list = tables.length > 0
      ? tables.map(t => `${t.name} (${t.columns?.length} Spalten, ${t.rowCount} Zeilen)`).join('\n')
      : '(keine Tabellen)';
    res.json({ success: true, result: `Tabellen:\n${list}`, tables });
  });

  router.post('/data/query', async (req: AuthenticatedRequest, res: Response) => {
    const { query } = req.body;
    if (!query) {
      res.status(400).json({ success: false, error: 'SQL query is required' });
      return;
    }

    // Simple SQL parser for demo (SELECT only)
    const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)/i);
    if (!selectMatch) {
      res.json({ success: false, error: 'Only SELECT queries supported in demo mode' });
      return;
    }

    const tableName = selectMatch[2];
    const table = dataStore.get(tableName);
    if (!table) {
      res.json({ success: false, error: `Table '${tableName}' not found` });
      return;
    }

    const preview = table.rows.slice(0, 10).map(row => row.join(' | ')).join('\n');
    res.json({
      success: true,
      result: `Query: ${query}\n\nSpalten: ${table.columns.join(', ')}\n${table.rows.length} Zeile(n)\n\n${preview || '(leer)'}`,
      columns: table.columns,
      rows: table.rows,
      rowCount: table.rows.length
    });
  });

  // ============================================================
  // CHART TOOLS
  // ============================================================

  router.post('/chart/create', async (req: AuthenticatedRequest, res: Response) => {
    const { type, data, title } = req.body;
    if (!type || !data || !title) {
      res.status(400).json({ success: false, error: 'Type, data, and title are required' });
      return;
    }

    // Return chart config for frontend rendering (e.g., with Chart.js)
    const chartConfig = {
      type,
      data: {
        labels: data.map((d: { label?: string; name?: string; x?: number }) => d.label || d.name || d.x),
        datasets: [{
          label: title,
          data: data.map((d: { value?: number; y?: number }) => d.value || d.y),
          backgroundColor: [
            '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
            '#EC4899', '#06B6D4', '#84CC16'
          ]
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: title }
        }
      }
    };

    res.json({
      success: true,
      result: `${type.toUpperCase()} Diagramm "${title}" generiert\n\nDaten: ${data.length} Datenpunkte\nVerwende chartConfig für Chart.js Rendering`,
      chartConfig,
      message: `${type} chart config generated for "${title}"`
    });
  });

  return router;
}
