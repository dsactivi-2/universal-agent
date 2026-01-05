// ============================================================
// TOOL REGISTRY TESTS
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../src/tools/registry.js';
import { WebSearchTool } from '../src/tools/web-search.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('Tool Registration', () => {
    it('should register a tool', () => {
      const webSearch = new WebSearchTool();
      registry.register(webSearch);

      const retrieved = registry.get('web_search');
      expect(retrieved).toBeDefined();
      expect(retrieved?.definition.name).toBe('web_search');
    });

    it('should list all registered tools', () => {
      const webSearch = new WebSearchTool();
      registry.register(webSearch);

      const tools = registry.list();
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('web_search');
    });

    it('should return undefined for non-existent tool', () => {
      const tool = registry.get('non_existent');
      expect(tool).toBeUndefined();
    });
  });

  describe('Anthropic Tool Conversion', () => {
    it('should convert tools to Anthropic format', () => {
      const webSearch = new WebSearchTool();
      registry.register(webSearch);

      const anthropicTools = registry.toAnthropicTools();

      expect(anthropicTools.length).toBe(1);
      expect(anthropicTools[0].name).toBe('web_search');
      expect(anthropicTools[0].description).toBeDefined();
      expect(anthropicTools[0].input_schema).toBeDefined();
    });

    it('should filter tools by ID', () => {
      const webSearch = new WebSearchTool();
      registry.register(webSearch);

      const filtered = registry.toAnthropicTools(['web_search']);
      expect(filtered.length).toBe(1);

      const empty = registry.toAnthropicTools(['non_existent']);
      expect(empty.length).toBe(0);
    });
  });
});

describe('WebSearchTool', () => {
  it('should have correct definition', () => {
    const tool = new WebSearchTool();

    expect(tool.definition.name).toBe('web_search');
    expect(tool.definition.description.toLowerCase()).toContain('search');
  });

  it('should execute search (simulated)', async () => {
    // Without API key, it uses simulated results
    const tool = new WebSearchTool();

    const result = await tool.execute({
      query: 'test query',
      max_results: 3
    });

    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    // Simulated results have a specific structure
    const resultObj = result as { results: any[] };
    expect(resultObj.results).toBeDefined();
  });
});
