// ============================================================
// AGENT REGISTRY
// ============================================================

import type { AgentId, AgentDefinition } from '../types/index.js';
import { BaseAgent } from './base-agent.js';
import { ResearchAgent } from './research-agent.js';
import { ToolRegistry } from '../tools/registry.js';

export class AgentRegistry {
  private agents: Map<AgentId, BaseAgent> = new Map();

  constructor(toolRegistry: ToolRegistry) {
    // Register default agents
    this.register(new ResearchAgent(toolRegistry));
  }

  register(agent: BaseAgent): void {
    this.agents.set(agent.agentId, agent);
  }

  get(id: AgentId): BaseAgent | undefined {
    return this.agents.get(id);
  }

  has(id: AgentId): boolean {
    return this.agents.has(id);
  }

  list(): AgentId[] {
    return Array.from(this.agents.keys());
  }

  getCapabilities(): Array<{
    agentId: AgentId;
    capabilities: string[];
  }> {
    const result: Array<{ agentId: AgentId; capabilities: string[] }> = [];

    for (const [id, agent] of this.agents) {
      // For now, just return agent IDs
      // In a full implementation, we'd store capabilities in the agent
      result.push({
        agentId: id,
        capabilities: ['web_research', 'competitive_analysis'] // TODO: Get from agent
      });
    }

    return result;
  }
}
