// ============================================================
// CODING AGENT
// Writes, edits, and executes code
// ============================================================

import type { AgentDefinition } from '../types/index.js';
import { BaseAgent, AgentAction } from './base-agent.js';
import { ToolRegistry } from '../tools/registry.js';

export interface CodingResult {
  action: string;
  files: Array<{
    path: string;
    action: 'created' | 'modified' | 'read';
    summary?: string;
  }>;
  executionResult?: {
    success: boolean;
    output?: string;
    error?: string;
  };
  summary: string;
  generatedAt: string;
}

export class CodingAgent extends BaseAgent {
  constructor(toolRegistry: ToolRegistry) {
    const definition: AgentDefinition = {
      id: 'coding',
      name: 'Coding Agent',
      description: 'Expert software developer that can write, edit, and execute code across multiple languages',
      domain: ['coding', 'development', 'programming', 'debugging'],
      capabilities: [
        {
          name: 'write_code',
          description: 'Write new code files or functions',
          inputSchema: {
            type: 'object',
            properties: {
              task: { type: 'string' },
              language: { type: 'string' },
              targetPath: { type: 'string' }
            },
            required: ['task']
          },
          outputSchema: { type: 'object' },
          estimatedDuration: 30000,
          estimatedCost: 0.05
        },
        {
          name: 'edit_code',
          description: 'Modify existing code',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string' },
              instruction: { type: 'string' }
            },
            required: ['filePath', 'instruction']
          },
          outputSchema: { type: 'object' },
          estimatedDuration: 20000,
          estimatedCost: 0.03
        },
        {
          name: 'debug_code',
          description: 'Find and fix bugs in code',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string' },
              errorMessage: { type: 'string' }
            },
            required: ['filePath']
          },
          outputSchema: { type: 'object' },
          estimatedDuration: 40000,
          estimatedCost: 0.08
        },
        {
          name: 'execute_code',
          description: 'Run code and return results',
          inputSchema: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              language: { type: 'string' }
            },
            required: ['code', 'language']
          },
          outputSchema: { type: 'object' },
          estimatedDuration: 15000,
          estimatedCost: 0.01
        },
        {
          name: 'git_operations',
          description: 'Perform git operations like commit, push, pull',
          inputSchema: {
            type: 'object',
            properties: {
              operation: { type: 'string', enum: ['status', 'commit', 'push', 'pull', 'branch'] },
              message: { type: 'string' },
              path: { type: 'string' }
            },
            required: ['operation']
          },
          outputSchema: { type: 'object' },
          estimatedDuration: 10000,
          estimatedCost: 0.01
        }
      ],
      requiredTools: [
        'file_read',
        'file_write',
        'file_list',
        'file_edit',
        'code_execute',
        'git_status',
        'git_diff',
        'git_add',
        'git_commit'
      ],
      systemPrompt: `You are an expert software developer AI assistant.

Your capabilities:
1. Write clean, efficient, well-documented code
2. Edit and refactor existing code
3. Debug and fix errors
4. Execute code and interpret results
5. Manage git operations

Best practices you follow:
- Write modular, testable code
- Include helpful comments
- Follow language-specific conventions
- Handle errors gracefully
- Consider edge cases
- Write type-safe code when applicable

When writing code:
- First understand the full context by reading relevant files
- Plan your approach before coding
- Write code incrementally, testing as you go
- Explain your changes and reasoning

Available tools:
- file_read: Read file contents
- file_write: Create or overwrite files
- file_edit: Make targeted edits to files
- file_list: List directory contents
- code_execute: Run code (JavaScript, TypeScript, Python, bash)
- git_*: Git operations (status, diff, add, commit, push, pull)

Always verify your changes work before considering a task complete.`,
      model: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        temperature: 0.2,
        maxTokens: 8192
      }
    };

    super(definition, toolRegistry);
  }

  protected buildActionPrompt(
    action: AgentAction,
    inputs: Record<string, unknown>
  ): string {
    switch (action.type) {
      case 'write_code':
        return this.buildWriteCodePrompt(inputs);
      case 'edit_code':
        return this.buildEditCodePrompt(inputs);
      case 'debug_code':
        return this.buildDebugCodePrompt(inputs);
      case 'execute_code':
        return this.buildExecuteCodePrompt(inputs);
      case 'git_operations':
        return this.buildGitPrompt(inputs);
      default:
        return `Execute coding action: ${action.type}\n\nInputs:\n${JSON.stringify(inputs, null, 2)}`;
    }
  }

  private buildWriteCodePrompt(inputs: Record<string, unknown>): string {
    const task = inputs.task as string;
    const language = inputs.language as string | undefined;
    const targetPath = inputs.targetPath as string | undefined;

    return `Write code to accomplish the following task:

TASK: ${task}
${language ? `LANGUAGE: ${language}` : ''}
${targetPath ? `TARGET PATH: ${targetPath}` : ''}

INSTRUCTIONS:
1. First, use file_list to understand the project structure if needed
2. Read any relevant existing files for context
3. Write the code using file_write
4. If applicable, test the code using code_execute
5. Verify the output is correct

OUTPUT FORMAT:
After completing the task, summarize:
- What files were created/modified
- Key implementation details
- Any assumptions made
- How to test/use the code`;
  }

  private buildEditCodePrompt(inputs: Record<string, unknown>): string {
    const filePath = inputs.filePath as string;
    const instruction = inputs.instruction as string;

    return `Edit the following file according to the instruction:

FILE: ${filePath}
INSTRUCTION: ${instruction}

STEPS:
1. Read the file using file_read
2. Understand the current implementation
3. Make the necessary changes using file_edit
4. Verify the changes are correct

Be precise with your edits. Use file_edit for targeted changes rather than rewriting the entire file.`;
  }

  private buildDebugCodePrompt(inputs: Record<string, unknown>): string {
    const filePath = inputs.filePath as string;
    const errorMessage = inputs.errorMessage as string | undefined;

    return `Debug the following code:

FILE: ${filePath}
${errorMessage ? `ERROR MESSAGE: ${errorMessage}` : ''}

DEBUGGING STEPS:
1. Read the file using file_read
2. Analyze the code for potential issues
3. If there's an error message, trace its source
4. Identify the root cause
5. Fix the bug using file_edit
6. Test the fix using code_execute if applicable

Provide a clear explanation of:
- What the bug was
- Why it occurred
- How you fixed it`;
  }

  private buildExecuteCodePrompt(inputs: Record<string, unknown>): string {
    const code = inputs.code as string;
    const language = inputs.language as string;

    return `Execute the following code:

LANGUAGE: ${language}
CODE:
\`\`\`${language}
${code}
\`\`\`

Use the code_execute tool to run this code and report the results.
If there are errors, explain what went wrong and suggest fixes.`;
  }

  private buildGitPrompt(inputs: Record<string, unknown>): string {
    const operation = inputs.operation as string;
    const message = inputs.message as string | undefined;
    const repoPath = (inputs.path as string) || '.';

    switch (operation) {
      case 'status':
        return `Check the git status of the repository at: ${repoPath}
Use git_status to see current changes.`;

      case 'commit':
        return `Create a git commit in: ${repoPath}
${message ? `COMMIT MESSAGE: ${message}` : 'Generate an appropriate commit message based on the changes.'}

STEPS:
1. Use git_status to see what files are changed
2. Use git_diff to review the changes
3. Use git_add to stage files
4. Use git_commit to create the commit`;

      case 'push':
        return `Push changes to remote repository from: ${repoPath}
Use git_push to push to origin.`;

      case 'pull':
        return `Pull latest changes to: ${repoPath}
Use git_pull to fetch and merge from origin.`;

      default:
        return `Perform git ${operation} on repository: ${repoPath}`;
    }
  }

  protected parseOutput(content: string, action: AgentAction): CodingResult {
    // Extract file operations from content
    const files: CodingResult['files'] = [];

    // Look for file creation mentions
    const createMatches = content.matchAll(/(?:created|wrote|saved)\s+(?:file\s+)?['"`]?([^\s'"`]+)['"`]?/gi);
    for (const match of createMatches) {
      files.push({ path: match[1], action: 'created' });
    }

    // Look for file modification mentions
    const modifyMatches = content.matchAll(/(?:modified|edited|updated)\s+(?:file\s+)?['"`]?([^\s'"`]+)['"`]?/gi);
    for (const match of modifyMatches) {
      if (!files.find(f => f.path === match[1])) {
        files.push({ path: match[1], action: 'modified' });
      }
    }

    // Extract execution results if present
    let executionResult: CodingResult['executionResult'] | undefined;
    const execMatch = content.match(/(?:output|result):\s*```[\s\S]*?```/i);
    if (execMatch) {
      executionResult = {
        success: !content.toLowerCase().includes('error'),
        output: execMatch[0]
      };
    }

    return {
      action: action.type,
      files,
      executionResult,
      summary: content.slice(0, 500),
      generatedAt: new Date().toISOString()
    };
  }
}
