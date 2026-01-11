// ============================================================
// GIT TOOLS - Git operations
// ============================================================

import { spawn } from 'child_process';
import type { Tool, ToolDefinition } from '../types/index.js';

interface GitResult {
  success: boolean;
  output: string;
  error?: string;
}

// ============================================================
// GIT STATUS TOOL
// ============================================================

export class GitStatusTool implements Tool {
  definition: ToolDefinition = {
    name: 'git_status',
    description: 'Get the current git status showing modified, staged, and untracked files.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Repository path (default: current directory)'
        }
      }
    },
    requiresConfirmation: false,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const repoPath = (args.path as string) || '.';
    return runGitCommand(['status', '--porcelain', '-b'], repoPath);
  }
}

// ============================================================
// GIT DIFF TOOL
// ============================================================

export class GitDiffTool implements Tool {
  definition: ToolDefinition = {
    name: 'git_diff',
    description: 'Show changes between commits, working tree, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Repository path'
        },
        file: {
          type: 'string',
          description: 'Specific file to diff (optional)'
        },
        staged: {
          type: 'boolean',
          description: 'Show staged changes (default: false)'
        }
      }
    },
    requiresConfirmation: false,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const repoPath = (args.path as string) || '.';
    const file = args.file as string | undefined;
    const staged = args.staged === true;

    const gitArgs = ['diff'];
    if (staged) gitArgs.push('--staged');
    if (file) gitArgs.push('--', file);

    return runGitCommand(gitArgs, repoPath);
  }
}

// ============================================================
// GIT LOG TOOL
// ============================================================

export class GitLogTool implements Tool {
  definition: ToolDefinition = {
    name: 'git_log',
    description: 'Show commit history.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Repository path'
        },
        count: {
          type: 'number',
          description: 'Number of commits to show (default: 10)'
        },
        oneline: {
          type: 'boolean',
          description: 'Show condensed output (default: true)'
        }
      }
    },
    requiresConfirmation: false,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const repoPath = (args.path as string) || '.';
    const count = (args.count as number) || 10;
    const oneline = args.oneline !== false;

    const gitArgs = ['log', `-${count}`];
    if (oneline) {
      gitArgs.push('--oneline', '--decorate');
    } else {
      gitArgs.push('--format=%H%n%an%n%ae%n%ad%n%s%n%b%n---');
    }

    return runGitCommand(gitArgs, repoPath);
  }
}

// ============================================================
// GIT ADD TOOL
// ============================================================

export class GitAddTool implements Tool {
  definition: ToolDefinition = {
    name: 'git_add',
    description: 'Stage files for commit.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Repository path'
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Files to stage (use ["."] for all files)'
        }
      },
      required: ['files']
    },
    requiresConfirmation: true,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const repoPath = (args.path as string) || '.';
    const files = args.files as string[];

    return runGitCommand(['add', ...files], repoPath);
  }
}

// ============================================================
// GIT COMMIT TOOL
// ============================================================

export class GitCommitTool implements Tool {
  definition: ToolDefinition = {
    name: 'git_commit',
    description: 'Create a new commit with staged changes.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Repository path'
        },
        message: {
          type: 'string',
          description: 'Commit message'
        }
      },
      required: ['message']
    },
    requiresConfirmation: true,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const repoPath = (args.path as string) || '.';
    const message = args.message as string;

    return runGitCommand(['commit', '-m', message], repoPath);
  }
}

// ============================================================
// GIT BRANCH TOOL
// ============================================================

export class GitBranchTool implements Tool {
  definition: ToolDefinition = {
    name: 'git_branch',
    description: 'List, create, or delete branches.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Repository path'
        },
        action: {
          type: 'string',
          description: 'Action to perform',
          enum: ['list', 'create', 'delete', 'checkout']
        },
        name: {
          type: 'string',
          description: 'Branch name (required for create/delete/checkout)'
        }
      },
      required: ['action']
    },
    requiresConfirmation: true,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const repoPath = (args.path as string) || '.';
    const action = args.action as string;
    const name = args.name as string | undefined;

    switch (action) {
      case 'list':
        return runGitCommand(['branch', '-a'], repoPath);
      case 'create':
        if (!name) return { success: false, error: 'Branch name required' };
        return runGitCommand(['checkout', '-b', name], repoPath);
      case 'delete':
        if (!name) return { success: false, error: 'Branch name required' };
        return runGitCommand(['branch', '-d', name], repoPath);
      case 'checkout':
        if (!name) return { success: false, error: 'Branch name required' };
        return runGitCommand(['checkout', name], repoPath);
      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  }
}

// ============================================================
// GIT PUSH TOOL
// ============================================================

export class GitPushTool implements Tool {
  definition: ToolDefinition = {
    name: 'git_push',
    description: 'Push commits to remote repository.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Repository path'
        },
        remote: {
          type: 'string',
          description: 'Remote name (default: origin)'
        },
        branch: {
          type: 'string',
          description: 'Branch name (default: current branch)'
        },
        setUpstream: {
          type: 'boolean',
          description: 'Set upstream tracking (default: false)'
        }
      }
    },
    requiresConfirmation: true,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const repoPath = (args.path as string) || '.';
    const remote = (args.remote as string) || 'origin';
    const branch = args.branch as string | undefined;
    const setUpstream = args.setUpstream === true;

    const gitArgs = ['push'];
    if (setUpstream) gitArgs.push('-u');
    gitArgs.push(remote);
    if (branch) gitArgs.push(branch);

    return runGitCommand(gitArgs, repoPath);
  }
}

// ============================================================
// GIT PULL TOOL
// ============================================================

export class GitPullTool implements Tool {
  definition: ToolDefinition = {
    name: 'git_pull',
    description: 'Pull changes from remote repository.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Repository path'
        },
        remote: {
          type: 'string',
          description: 'Remote name (default: origin)'
        },
        branch: {
          type: 'string',
          description: 'Branch name (default: current branch)'
        }
      }
    },
    requiresConfirmation: true,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const repoPath = (args.path as string) || '.';
    const remote = (args.remote as string) || 'origin';
    const branch = args.branch as string | undefined;

    const gitArgs = ['pull', remote];
    if (branch) gitArgs.push(branch);

    return runGitCommand(gitArgs, repoPath);
  }
}

// ============================================================
// HELPER FUNCTION
// ============================================================

function runGitCommand(args: string[], cwd: string): Promise<GitResult> {
  return new Promise((resolve) => {
    const proc = spawn('git', args, { cwd, timeout: 30000 });

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
        output: stdout.trim() || stderr.trim(),
        error: exitCode !== 0 ? stderr.trim() : undefined
      });
    });

    proc.on('error', (error) => {
      resolve({
        success: false,
        output: '',
        error: error.message
      });
    });
  });
}
