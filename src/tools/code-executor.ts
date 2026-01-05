// ============================================================
// CODE EXECUTOR TOOL - Run code in sandboxed environment
// ============================================================

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Tool, ToolDefinition } from '../types/index.js';

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  duration: number;
  error?: string;
}

export class CodeExecutorTool implements Tool {
  private tempDir: string;
  private maxExecutionTime: number;
  private maxOutputSize: number;

  definition: ToolDefinition = {
    name: 'code_execute',
    description: 'Execute code in various languages. Supports JavaScript/TypeScript, Python, and shell commands. Returns stdout, stderr, and exit code.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The code to execute'
        },
        language: {
          type: 'string',
          description: 'Programming language',
          enum: ['javascript', 'typescript', 'python', 'bash', 'shell']
        },
        timeout: {
          type: 'number',
          description: 'Maximum execution time in milliseconds (default: 30000)'
        },
        workingDir: {
          type: 'string',
          description: 'Working directory for execution (default: temp directory)'
        }
      },
      required: ['code', 'language']
    },
    requiresConfirmation: true,
    costPerCall: 0
  };

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'universal-agent-executor');
    this.maxExecutionTime = 30000; // 30 seconds default
    this.maxOutputSize = 100000; // 100KB max output
  }

  async execute(args: Record<string, unknown>): Promise<ExecutionResult> {
    const code = args.code as string;
    const language = args.language as string;
    const timeout = (args.timeout as number) || this.maxExecutionTime;
    const workingDir = (args.workingDir as string) || this.tempDir;

    // Ensure temp directory exists
    await fs.mkdir(this.tempDir, { recursive: true });

    const startTime = Date.now();

    try {
      switch (language) {
        case 'javascript':
          return await this.executeJavaScript(code, timeout, workingDir);
        case 'typescript':
          return await this.executeTypeScript(code, timeout, workingDir);
        case 'python':
          return await this.executePython(code, timeout, workingDir);
        case 'bash':
        case 'shell':
          return await this.executeShell(code, timeout, workingDir);
        default:
          return {
            success: false,
            stdout: '',
            stderr: '',
            exitCode: 1,
            duration: Date.now() - startTime,
            error: `Unsupported language: ${language}`
          };
      }
    } catch (error) {
      return {
        success: false,
        stdout: '',
        stderr: '',
        exitCode: 1,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async executeJavaScript(code: string, timeout: number, workingDir: string): Promise<ExecutionResult> {
    const tempFile = path.join(this.tempDir, `exec_${Date.now()}.js`);
    await fs.writeFile(tempFile, code);

    try {
      return await this.runProcess('node', [tempFile], timeout, workingDir);
    } finally {
      await fs.unlink(tempFile).catch(() => {});
    }
  }

  private async executeTypeScript(code: string, timeout: number, workingDir: string): Promise<ExecutionResult> {
    const tempFile = path.join(this.tempDir, `exec_${Date.now()}.ts`);
    await fs.writeFile(tempFile, code);

    try {
      // Use tsx for TypeScript execution
      return await this.runProcess('npx', ['tsx', tempFile], timeout, workingDir);
    } finally {
      await fs.unlink(tempFile).catch(() => {});
    }
  }

  private async executePython(code: string, timeout: number, workingDir: string): Promise<ExecutionResult> {
    const tempFile = path.join(this.tempDir, `exec_${Date.now()}.py`);
    await fs.writeFile(tempFile, code);

    try {
      return await this.runProcess('python3', [tempFile], timeout, workingDir);
    } finally {
      await fs.unlink(tempFile).catch(() => {});
    }
  }

  private async executeShell(code: string, timeout: number, workingDir: string): Promise<ExecutionResult> {
    const tempFile = path.join(this.tempDir, `exec_${Date.now()}.sh`);
    await fs.writeFile(tempFile, code);
    await fs.chmod(tempFile, 0o755);

    try {
      return await this.runProcess('bash', [tempFile], timeout, workingDir);
    } finally {
      await fs.unlink(tempFile).catch(() => {});
    }
  }

  private runProcess(
    command: string,
    args: string[],
    timeout: number,
    workingDir: string
  ): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let killed = false;

      const proc = spawn(command, args, {
        cwd: workingDir,
        timeout,
        env: {
          ...process.env,
          // Limit environment for security
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          LANG: 'en_US.UTF-8'
        }
      });

      const timeoutId = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');
        setTimeout(() => proc.kill('SIGKILL'), 1000);
      }, timeout);

      proc.stdout.on('data', (data: Buffer) => {
        if (stdout.length < this.maxOutputSize) {
          stdout += data.toString();
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        if (stderr.length < this.maxOutputSize) {
          stderr += data.toString();
        }
      });

      proc.on('close', (exitCode) => {
        clearTimeout(timeoutId);
        resolve({
          success: exitCode === 0 && !killed,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: killed ? null : exitCode,
          duration: Date.now() - startTime,
          error: killed ? `Execution timed out after ${timeout}ms` : undefined
        });
      });

      proc.on('error', (error) => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: null,
          duration: Date.now() - startTime,
          error: error.message
        });
      });
    });
  }
}

// ============================================================
// NPM TOOL - Run npm commands
// ============================================================

export class NpmTool implements Tool {
  definition: ToolDefinition = {
    name: 'npm_run',
    description: 'Run npm commands like install, test, build, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'npm command to run',
          enum: ['install', 'test', 'build', 'run', 'init', 'audit']
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional arguments for the command'
        },
        workingDir: {
          type: 'string',
          description: 'Working directory (must contain package.json)'
        }
      },
      required: ['command', 'workingDir']
    },
    requiresConfirmation: true,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const command = args.command as string;
    const cmdArgs = (args.args as string[]) || [];
    const workingDir = args.workingDir as string;

    const startTime = Date.now();

    return new Promise((resolve) => {
      const proc = spawn('npm', [command, ...cmdArgs], {
        cwd: workingDir,
        timeout: 120000, // 2 minutes for npm commands
        env: process.env
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (exitCode) => {
        resolve({
          success: exitCode === 0,
          command: `npm ${command} ${cmdArgs.join(' ')}`.trim(),
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode,
          duration: Date.now() - startTime
        });
      });

      proc.on('error', (error) => {
        resolve({
          success: false,
          command: `npm ${command}`,
          stdout: '',
          stderr: error.message,
          exitCode: null,
          duration: Date.now() - startTime,
          error: error.message
        });
      });
    });
  }
}
