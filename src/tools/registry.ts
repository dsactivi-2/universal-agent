// ============================================================
// TOOL REGISTRY
// ============================================================

import type { Tool, ToolDefinition, ToolId } from '../types/index.js';

export class ToolRegistry {
  private tools: Map<ToolId, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.definition.name, tool);
  }

  get(name: ToolId): Tool | undefined {
    return this.tools.get(name);
  }

  has(name: ToolId): boolean {
    return this.tools.has(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  getForAgent(toolIds: ToolId[]): Tool[] {
    return toolIds
      .map(id => this.tools.get(id))
      .filter((t): t is Tool => t !== undefined);
  }

  // Convert to Anthropic tool format
  toAnthropicTools(toolIds?: ToolId[]): Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }> {
    const tools = toolIds
      ? this.getForAgent(toolIds)
      : Array.from(this.tools.values());

    return tools.map(t => ({
      name: t.definition.name,
      description: t.definition.description,
      input_schema: t.definition.inputSchema
    }));
  }
}
