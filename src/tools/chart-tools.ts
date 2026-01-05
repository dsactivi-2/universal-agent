// ============================================================
// CHART GENERATION TOOLS
// ASCII charts and SVG generation for data visualization
// ============================================================

import * as fs from 'fs';
import type { Tool, ToolDefinition } from '../types/index.js';

// ============================================================
// BAR CHART TOOL
// ============================================================

export class BarChartTool implements Tool {
  definition: ToolDefinition = {
    name: 'chart_bar',
    description: 'Generate horizontal bar charts from data. Returns ASCII chart.',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'array', description: 'Data points with label and value' },
        title: { type: 'string', description: 'Chart title' },
        width: { type: 'number', description: 'Chart width in characters', default: 50 }
      },
      required: ['data']
    },
    requiresConfirmation: false,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const data = args.data as Array<{label: string; value: number}>;
    const title = args.title as string | undefined;
    const width = (args.width as number) || 50;

    if (!data || data.length === 0) {
      return { error: 'No data provided' };
    }

    const maxValue = Math.max(...data.map(d => d.value));
    const maxLabelLen = Math.max(...data.map(d => d.label.length));
    const barWidth = width - maxLabelLen - 15;

    let chart = '';
    if (title) {
      chart += `\n  ${title}\n  ${'═'.repeat(width)}\n`;
    }

    for (const item of data) {
      const normalizedWidth = Math.round((item.value / maxValue) * barWidth);
      const bar = '█'.repeat(normalizedWidth);
      const label = item.label.padEnd(maxLabelLen);
      const valueStr = item.value.toLocaleString().padStart(10);
      chart += `  ${label} │${bar} ${valueStr}\n`;
    }

    chart += `  ${'─'.repeat(maxLabelLen)}┴${'─'.repeat(barWidth + 12)}\n`;

    return { chart };
  }
}

// ============================================================
// LINE CHART TOOL
// ============================================================

export class LineChartTool implements Tool {
  definition: ToolDefinition = {
    name: 'chart_line',
    description: 'Generate line charts for time series data. Returns ASCII chart.',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'array', description: 'Data points with x and y values' },
        title: { type: 'string', description: 'Chart title' },
        height: { type: 'number', default: 15 },
        width: { type: 'number', default: 60 }
      },
      required: ['data']
    },
    requiresConfirmation: false,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const data = args.data as Array<{x: string | number; y: number}>;
    const title = args.title as string | undefined;
    const height = (args.height as number) || 15;
    const width = (args.width as number) || 60;

    if (!data || data.length === 0) {
      return { error: 'No data provided' };
    }

    const values = data.map(d => d.y);
    const minY = Math.min(...values);
    const maxY = Math.max(...values);
    const range = maxY - minY || 1;

    const grid: string[][] = [];
    for (let i = 0; i < height; i++) {
      grid.push(new Array(width).fill(' '));
    }

    const xStep = (width - 1) / Math.max(data.length - 1, 1);
    for (let i = 0; i < data.length; i++) {
      const x = Math.round(i * xStep);
      const normalizedY = (data[i].y - minY) / range;
      const y = height - 1 - Math.round(normalizedY * (height - 1));
      if (grid[y]) {
        grid[y][x] = '●';
      }
    }

    let chart = '';
    if (title) {
      chart += `\n  ${title}\n`;
    }

    const yLabelWidth = Math.max(maxY.toFixed(1).length, minY.toFixed(1).length);
    for (let i = 0; i < height; i++) {
      const yValue = maxY - (i / (height - 1)) * range;
      const label = i === 0 || i === height - 1 ? yValue.toFixed(1).padStart(yLabelWidth) : ' '.repeat(yLabelWidth);
      chart += `  ${label} │${grid[i].join('')}\n`;
    }

    chart += `  ${' '.repeat(yLabelWidth)} └${'─'.repeat(width)}\n`;

    return { chart };
  }
}

// ============================================================
// PIE CHART TOOL
// ============================================================

export class PieChartTool implements Tool {
  definition: ToolDefinition = {
    name: 'chart_pie',
    description: 'Generate pie charts showing proportions. Returns ASCII representation.',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'array', description: 'Data slices with label and value' },
        title: { type: 'string', description: 'Chart title' }
      },
      required: ['data']
    },
    requiresConfirmation: false,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const data = args.data as Array<{label: string; value: number}>;
    const title = args.title as string | undefined;

    if (!data || data.length === 0) {
      return { error: 'No data provided' };
    }

    const total = data.reduce((sum, d) => sum + d.value, 0);
    const symbols = ['█', '▓', '▒', '░', '▄', '▀', '▌', '▐', '■', '□'];
    const maxLabelLen = Math.max(...data.map(d => d.label.length));

    let chart = '';
    if (title) {
      chart += `\n  ${title}\n  ${'═'.repeat(50)}\n\n`;
    }

    data.forEach((item, i) => {
      const percentage = (item.value / total) * 100;
      const barWidth = Math.round(percentage / 2);
      const symbol = symbols[i % symbols.length];
      const bar = symbol.repeat(barWidth);

      chart += `  ${symbol} ${item.label.padEnd(maxLabelLen)} │ ${bar} ${percentage.toFixed(1)}%\n`;
    });

    chart += `\n  Total: ${total.toLocaleString()}\n`;

    return { chart };
  }
}

// ============================================================
// HISTOGRAM TOOL
// ============================================================

export class HistogramTool implements Tool {
  definition: ToolDefinition = {
    name: 'chart_histogram',
    description: 'Generate histograms showing distribution of numeric values',
    inputSchema: {
      type: 'object',
      properties: {
        values: { type: 'array', description: 'Array of numeric values' },
        bins: { type: 'number', default: 10 },
        title: { type: 'string' },
        width: { type: 'number', default: 50 }
      },
      required: ['values']
    },
    requiresConfirmation: false,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const values = args.values as number[];
    const bins = (args.bins as number) || 10;
    const title = args.title as string | undefined;
    const width = (args.width as number) || 50;

    if (!values || values.length === 0) {
      return { error: 'No values provided' };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const binWidth = (max - min) / bins;
    const binCounts: Array<{start: number; end: number; count: number}> = [];

    for (let i = 0; i < bins; i++) {
      const start = min + i * binWidth;
      const end = start + binWidth;
      const count = values.filter(v => v >= start && (i === bins - 1 ? v <= end : v < end)).length;
      binCounts.push({ start, end, count });
    }

    const maxCount = Math.max(...binCounts.map(b => b.count));
    const barWidth = width - 25;

    let chart = '';
    if (title) {
      chart += `\n  ${title}\n  ${'═'.repeat(width)}\n`;
    }

    for (const bin of binCounts) {
      const normalizedWidth = maxCount > 0 ? Math.round((bin.count / maxCount) * barWidth) : 0;
      const bar = '█'.repeat(normalizedWidth);
      const range = `${bin.start.toFixed(1)}-${bin.end.toFixed(1)}`.padEnd(15);
      chart += `  ${range} │${bar} ${bin.count}\n`;
    }

    return {
      chart,
      stats: {
        min,
        max,
        count: values.length,
        mean: values.reduce((a, b) => a + b, 0) / values.length
      }
    };
  }
}

// ============================================================
// SCATTER PLOT TOOL
// ============================================================

export class ScatterPlotTool implements Tool {
  definition: ToolDefinition = {
    name: 'chart_scatter',
    description: 'Generate scatter plots for correlation analysis. Returns ASCII chart.',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'array', description: 'Data points with x and y values' },
        title: { type: 'string' },
        height: { type: 'number', default: 20 },
        width: { type: 'number', default: 60 }
      },
      required: ['data']
    },
    requiresConfirmation: false,
    costPerCall: 0
  };

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const data = args.data as Array<{x: number; y: number}>;
    const title = args.title as string | undefined;
    const height = (args.height as number) || 20;
    const width = (args.width as number) || 60;

    if (!data || data.length === 0) {
      return { error: 'No data provided' };
    }

    const xValues = data.map(d => d.x);
    const yValues = data.map(d => d.y);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    const grid: string[][] = [];
    for (let i = 0; i < height; i++) {
      grid.push(new Array(width).fill(' '));
    }

    for (const point of data) {
      const x = Math.round(((point.x - minX) / rangeX) * (width - 1));
      const y = height - 1 - Math.round(((point.y - minY) / rangeY) * (height - 1));
      if (grid[y] && x >= 0 && x < width) {
        grid[y][x] = '●';
      }
    }

    // Calculate correlation
    const n = data.length;
    const sumX = data.reduce((s, d) => s + d.x, 0);
    const sumY = data.reduce((s, d) => s + d.y, 0);
    const sumXY = data.reduce((s, d) => s + d.x * d.y, 0);
    const sumX2 = data.reduce((s, d) => s + d.x * d.x, 0);
    const sumY2 = data.reduce((s, d) => s + d.y * d.y, 0);
    const correlation = (n * sumXY - sumX * sumY) /
      Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    let chart = '';
    if (title) {
      chart += `\n  ${title}\n`;
    }

    const yLabelWidth = Math.max(maxY.toFixed(1).length, minY.toFixed(1).length);
    for (let i = 0; i < height; i++) {
      const yValue = maxY - (i / (height - 1)) * rangeY;
      const label = i === 0 || i === height - 1 ? yValue.toFixed(1).padStart(yLabelWidth) : ' '.repeat(yLabelWidth);
      chart += `  ${label} │${grid[i].join('')}\n`;
    }

    chart += `  ${' '.repeat(yLabelWidth)} └${'─'.repeat(width)}\n`;
    chart += `  ${' '.repeat(yLabelWidth)}  ${minX.toFixed(1)}${' '.repeat(width - minX.toFixed(1).length - maxX.toFixed(1).length)}${maxX.toFixed(1)}\n`;

    return {
      chart,
      correlation: isNaN(correlation) ? null : correlation
    };
  }
}
