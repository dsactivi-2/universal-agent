// ============================================================
// TOOLS INDEX
// ============================================================

export { ToolRegistry } from './registry.js';
export { WebSearchTool } from './web-search.js';

// File Tools
export { FileReadTool, FileWriteTool, FileListTool, FileEditTool } from './file-tools.js';

// Code Execution
export { CodeExecutorTool, NpmTool } from './code-executor.js';

// Git Tools
export {
  GitStatusTool,
  GitDiffTool,
  GitLogTool,
  GitAddTool,
  GitCommitTool,
  GitBranchTool,
  GitPushTool,
  GitPullTool
} from './git-tools.js';

// Create default registry with all tools
import { ToolRegistry } from './registry.js';
import { WebSearchTool } from './web-search.js';
import { FileReadTool, FileWriteTool, FileListTool, FileEditTool } from './file-tools.js';
import { CodeExecutorTool, NpmTool } from './code-executor.js';
import {
  GitStatusTool,
  GitDiffTool,
  GitLogTool,
  GitAddTool,
  GitCommitTool,
  GitBranchTool,
  GitPushTool,
  GitPullTool
} from './git-tools.js';

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // Web Tools
  registry.register(new WebSearchTool());

  // File Tools
  registry.register(new FileReadTool());
  registry.register(new FileWriteTool());
  registry.register(new FileListTool());
  registry.register(new FileEditTool());

  // Code Execution
  registry.register(new CodeExecutorTool());
  registry.register(new NpmTool());

  // Git Tools
  registry.register(new GitStatusTool());
  registry.register(new GitDiffTool());
  registry.register(new GitLogTool());
  registry.register(new GitAddTool());
  registry.register(new GitCommitTool());
  registry.register(new GitBranchTool());
  registry.register(new GitPushTool());
  registry.register(new GitPullTool());

  return registry;
}
