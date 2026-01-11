// ============================================================
// DATA ANALYSIS AGENT
// Specialized agent for data analysis tasks
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { ToolRegistry } from '../tools/registry.js';
import { CsvParseTool, JsonParseTool, DataTransformTool, DataExportTool } from '../tools/data-tools.js';
import { SqlQueryTool, CreateTempTableTool, DescribeTableTool, ListTablesTool, AggregateQueryTool } from '../tools/sql-tool.js';
import { BarChartTool, LineChartTool, PieChartTool, HistogramTool, ScatterPlotTool } from '../tools/chart-tools.js';
import { FileReadTool, FileWriteTool, FileListTool } from '../tools/file-tools.js';
import type { Tool, ToolCallRecord, LogEntry } from '../types/index.js';

// ============================================================
// TYPES
// ============================================================

export interface DataAgentResult {
  output: string;
  status: 'completed' | 'failed';
  error?: string;
  toolCalls: ToolCallRecord[];
  logs: LogEntry[];
}

// ============================================================
// DATA AGENT CLASS
// ============================================================

export class DataAnalysisAgent {
  private client: Anthropic;
  private tools: ToolRegistry;
  private model: string;
  private systemPrompt: string;

  constructor(config?: { apiKey?: string; model?: string }) {
    const apiKey = config?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    this.client = new Anthropic({ apiKey });
    this.model = config?.model || 'claude-3-5-sonnet-20241022';
    this.tools = new ToolRegistry();

    // Register data tools
    this.tools.register(new CsvParseTool());
    this.tools.register(new JsonParseTool());
    this.tools.register(new DataTransformTool());
    this.tools.register(new DataExportTool());

    // Register SQL tools
    this.tools.register(new SqlQueryTool());
    this.tools.register(new CreateTempTableTool());
    this.tools.register(new DescribeTableTool());
    this.tools.register(new ListTablesTool());
    this.tools.register(new AggregateQueryTool());

    // Register chart tools
    this.tools.register(new BarChartTool());
    this.tools.register(new LineChartTool());
    this.tools.register(new PieChartTool());
    this.tools.register(new HistogramTool());
    this.tools.register(new ScatterPlotTool());

    // Register file tools
    this.tools.register(new FileReadTool());
    this.tools.register(new FileWriteTool());
    this.tools.register(new FileListTool());

    this.systemPrompt = `You are an expert Data Analyst AI. You specialize in:
- Parsing and analyzing CSV, JSON, and other data formats
- Running SQL queries on databases and in-memory data
- Creating visualizations (charts, graphs, histograms)
- Statistical analysis and data transformation
- Generating reports and insights

## Available Tools

### Data Parsing
- csv_parse: Parse CSV files with automatic type detection
- json_parse: Parse JSON with nested data support

### Data Analysis
- sql_query: Run SQL SELECT queries on SQLite databases
- sql_aggregate: Perform aggregations (COUNT, SUM, AVG, MIN, MAX)
- sql_create_temp_table: Load data into temporary SQL tables
- sql_describe_table: Get schema information
- sql_list_tables: List all tables in a database

### Data Transformation
- data_transform: Filter, map, sort, group, and aggregate data

### Visualization
- chart_bar: Create horizontal bar charts
- chart_line: Create line charts for time series
- chart_pie: Create pie charts for proportions
- chart_histogram: Create histograms for distributions
- chart_scatter: Create scatter plots for correlations

### File Operations
- file_read: Read files from disk
- file_write: Write files to disk
- file_list: List files in directories

### Export
- data_export: Export data to CSV, JSON, or Markdown

## Workflow Guidelines

1. **Understand the Data First**
   - Read and parse the data file
   - Examine structure, columns, data types
   - Check for missing values or anomalies

2. **Perform Analysis**
   - Use SQL for complex queries
   - Apply transformations as needed
   - Calculate relevant statistics

3. **Visualize Results**
   - Choose appropriate chart type
   - Create clear, labeled visualizations

4. **Report Findings**
   - Summarize key insights
   - Highlight patterns and anomalies`;
  }

  async execute(task: string): Promise<DataAgentResult> {
    const logs: LogEntry[] = [];
    const toolCalls: ToolCallRecord[] = [];

    const log = (level: LogEntry['level'], message: string) => {
      logs.push({ level, message, timestamp: new Date() });
    };

    log('info', `Starting data analysis task`);

    const messages: Anthropic.Messages.MessageParam[] = [
      { role: 'user', content: task }
    ];

    const anthropicTools = this.tools.toAnthropicTools();
    let iterations = 0;
    const maxIterations = 15;

    while (iterations < maxIterations) {
      iterations++;

      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          temperature: 0.3,
          system: this.systemPrompt,
          messages,
          tools: anthropicTools as Anthropic.Messages.Tool[]
        });

        const toolUseBlocks = response.content.filter(
          (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
        );

        if (toolUseBlocks.length > 0) {
          const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

          for (const toolUse of toolUseBlocks) {
            const toolStartTime = Date.now();
            log('info', `Calling tool: ${toolUse.name}`);

            const tool = this.tools.get(toolUse.name);
            let result: unknown;
            let error: string | undefined;

            try {
              if (!tool) {
                throw new Error(`Tool not found: ${toolUse.name}`);
              }
              result = await tool.execute(toolUse.input as Record<string, unknown>);
            } catch (e) {
              error = e instanceof Error ? e.message : String(e);
              result = { error };
            }

            toolCalls.push({
              toolName: toolUse.name,
              input: toolUse.input as Record<string, unknown>,
              output: result,
              error,
              duration: Date.now() - toolStartTime,
              timestamp: new Date()
            });

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result)
            });
          }

          messages.push({ role: 'assistant', content: response.content });
          messages.push({ role: 'user', content: toolResults });
        } else {
          const textBlocks = response.content.filter(
            (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
          );

          const finalText = textBlocks.map(b => b.text).join('\n');
          log('info', 'Analysis completed');

          return {
            output: finalText,
            status: 'completed',
            toolCalls,
            logs
          };
        }

        if (response.stop_reason === 'end_turn') {
          const textBlocks = response.content.filter(
            (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
          );
          return {
            output: textBlocks.map(b => b.text).join('\n'),
            status: 'completed',
            toolCalls,
            logs
          };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log('error', `Error: ${errorMsg}`);
        return {
          output: '',
          status: 'failed',
          error: errorMsg,
          toolCalls,
          logs
        };
      }
    }

    return {
      output: '',
      status: 'failed',
      error: `Exceeded max iterations (${maxIterations})`,
      toolCalls,
      logs
    };
  }
}

// ============================================================
// CONVENIENCE FUNCTIONS
// ============================================================

export async function analyzeCSV(filePath: string, question: string): Promise<string> {
  const agent = new DataAnalysisAgent();
  const result = await agent.execute(`
    Analyze the CSV file at "${filePath}".

    Question: ${question}

    Steps:
    1. Parse the CSV file
    2. Examine the structure and data types
    3. Answer the question with relevant analysis
    4. Create appropriate visualizations if helpful
  `);

  return result.output || result.error || 'Analysis completed';
}

export async function analyzeDatabase(dbPath: string, question: string): Promise<string> {
  const agent = new DataAnalysisAgent();
  const result = await agent.execute(`
    Analyze the SQLite database at "${dbPath}".

    Question: ${question}

    Steps:
    1. List all tables in the database
    2. Describe relevant tables
    3. Run SQL queries to answer the question
    4. Create visualizations if helpful
  `);

  return result.output || result.error || 'Analysis completed';
}
