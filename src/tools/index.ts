// ============================================================
// TOOLS INDEX
// ============================================================

export { ToolRegistry } from './registry.js';
export { WebSearchTool } from './web-search.js';

// Create default registry with all tools
import { ToolRegistry } from './registry.js';
import { WebSearchTool } from './web-search.js';

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // Register built-in tools
  registry.register(new WebSearchTool());

  return registry;
}
