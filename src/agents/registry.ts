// ============================================================
// AGENT REGISTRY
// ============================================================

import type { AgentId, AgentDefinition } from '../types/index.js';
import { BaseAgent } from './base-agent.js';
import { ResearchAgent } from './research-agent.js';
import { CodingAgent } from './coding-agent.js';
import { ChatAgent } from './chat-agent.js';
import { ToolRegistry } from '../tools/registry.js';

export class AgentRegistry {
  private agents: Map<AgentId, BaseAgent> = new Map();
  private chatAgent: ChatAgent;

  constructor(toolRegistry: ToolRegistry) {
    // Register default agents
    this.chatAgent = new ChatAgent(toolRegistry);
    this.register(this.chatAgent);
    this.register(new ResearchAgent(toolRegistry));
    this.register(new CodingAgent(toolRegistry));
  }

  getChatAgent(): ChatAgent {
    return this.chatAgent;
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

    const agentCapabilities: Record<string, string[]> = {
      chat: ['conversation', 'general_chat', 'memory_aware'],
      research: ['web_research', 'competitive_analysis'],
      coding: ['write_code', 'edit_code', 'debug_code', 'execute_code', 'git_operations']
    };

    for (const [id, agent] of this.agents) {
      result.push({
        agentId: id,
        capabilities: agentCapabilities[id] || []
      });
    }

    return result;
  }
}
