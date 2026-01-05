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

// Data Tools
export {
  CsvParseTool,
  JsonParseTool,
  DataTransformTool,
  DataExportTool
} from './data-tools.js';

// SQL Tools
export {
  SqlQueryTool,
  CreateTempTableTool,
  DescribeTableTool,
  ListTablesTool,
  AggregateQueryTool
} from './sql-tool.js';

// Chart Tools
export {
  BarChartTool,
  LineChartTool,
  PieChartTool,
  HistogramTool,
  ScatterPlotTool
} from './chart-tools.js';

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
import { CsvParseTool, JsonParseTool, DataTransformTool, DataExportTool } from './data-tools.js';
import { SqlQueryTool, CreateTempTableTool, DescribeTableTool, ListTablesTool, AggregateQueryTool } from './sql-tool.js';
import { BarChartTool, LineChartTool, PieChartTool, HistogramTool, ScatterPlotTool } from './chart-tools.js';

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

  // Data Tools
  registry.register(new CsvParseTool());
  registry.register(new JsonParseTool());
  registry.register(new DataTransformTool());
  registry.register(new DataExportTool());

  // SQL Tools
  registry.register(new SqlQueryTool());
  registry.register(new CreateTempTableTool());
  registry.register(new DescribeTableTool());
  registry.register(new ListTablesTool());
  registry.register(new AggregateQueryTool());

  // Chart Tools
  registry.register(new BarChartTool());
  registry.register(new LineChartTool());
  registry.register(new PieChartTool());
  registry.register(new HistogramTool());
  registry.register(new ScatterPlotTool());

  return registry;
}
