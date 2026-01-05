// ============================================================
// RESEARCH AGENT
// Conducts web research, analysis, and report generation
// ============================================================

import type { AgentDefinition } from '../types/index.js';
import { BaseAgent, AgentAction } from './base-agent.js';
import { ToolRegistry } from '../tools/registry.js';

export interface ResearchResult {
  topic: string;
  summary: string;
  findings: Array<{
    title: string;
    content: string;
    source?: string;
  }>;
  sources: string[];
  generatedAt: string;
}

export class ResearchAgent extends BaseAgent {
  constructor(toolRegistry: ToolRegistry) {
    const definition: AgentDefinition = {
      id: 'research',
      name: 'Research Agent',
      description: 'Conducts thorough web research and synthesizes findings into structured reports',
      domain: ['research', 'analysis', 'information'],
      capabilities: [
        {
          name: 'web_research',
          description: 'Research a topic using web search',
          inputSchema: {
            type: 'object',
            properties: {
              topic: { type: 'string' },
              focusAreas: { type: 'array', items: { type: 'string' } },
              depth: { type: 'string', enum: ['quick', 'standard', 'deep'] }
            },
            required: ['topic']
          },
          outputSchema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              findings: { type: 'array' },
              sources: { type: 'array' }
            }
          },
          estimatedDuration: 30000,
          estimatedCost: 0.05
        },
        {
          name: 'competitive_analysis',
          description: 'Analyze competitors in a market',
          inputSchema: {
            type: 'object',
            properties: {
              company: { type: 'string' },
              competitors: { type: 'array', items: { type: 'string' } }
            },
            required: ['company']
          },
          outputSchema: { type: 'object' },
          estimatedDuration: 60000,
          estimatedCost: 0.10
        }
      ],
      requiredTools: ['web_search'],
      systemPrompt: `You are an expert research analyst AI assistant.

Your role is to:
1. Conduct thorough research using web search
2. Synthesize information from multiple sources
3. Present findings in clear, structured formats
4. Always cite your sources
5. Distinguish between facts and opinions/speculation

When researching:
- Start with broad searches, then narrow down
- Look for primary sources when possible
- Cross-reference information across sources
- Note any conflicting information

Output format:
- Use clear headings and bullet points
- Include source URLs for key facts
- Provide a summary at the beginning
- End with actionable insights or recommendations`,
      model: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        temperature: 0.3,
        maxTokens: 4096
      }
    };

    super(definition, toolRegistry);
  }

  protected buildActionPrompt(
    action: AgentAction,
    inputs: Record<string, unknown>
  ): string {
    switch (action.type) {
      case 'web_research':
        return this.buildResearchPrompt(inputs);
      case 'competitive_analysis':
        return this.buildCompetitiveAnalysisPrompt(inputs);
      default:
        return `Execute research action: ${action.type}\n\nInputs:\n${JSON.stringify(inputs, null, 2)}`;
    }
  }

  private buildResearchPrompt(inputs: Record<string, unknown>): string {
    const topic = inputs.topic as string;
    const focusAreas = inputs.focusAreas as string[] | undefined;
    const depth = (inputs.depth as string) || 'standard';

    return `Research the following topic thoroughly:

TOPIC: ${topic}

${focusAreas ? `FOCUS AREAS:\n${focusAreas.map(a => `- ${a}`).join('\n')}` : ''}

DEPTH: ${depth}
${depth === 'quick' ? '- Brief overview, 2-3 key points' : ''}
${depth === 'standard' ? '- Comprehensive coverage, 5-7 key findings' : ''}
${depth === 'deep' ? '- In-depth analysis, 10+ findings with detailed context' : ''}

INSTRUCTIONS:
1. Use web_search to find current information about the topic
2. Conduct multiple searches if needed to cover different aspects
3. Synthesize the information into a structured report
4. Include sources for all key facts

OUTPUT FORMAT:
Provide your findings as a structured report with:
- Executive Summary (2-3 sentences)
- Key Findings (bullet points with sources)
- Detailed Analysis
- Sources Used`;
  }

  private buildCompetitiveAnalysisPrompt(inputs: Record<string, unknown>): string {
    const company = inputs.company as string;
    const competitors = inputs.competitors as string[] | undefined;

    return `Conduct a competitive analysis:

COMPANY: ${company}
${competitors ? `KNOWN COMPETITORS:\n${competitors.map(c => `- ${c}`).join('\n')}` : 'TASK: Identify main competitors first'}

INSTRUCTIONS:
1. Research the company and its market position
2. ${competitors ? 'Research each competitor' : 'Identify top 3-5 competitors'}
3. Compare across key dimensions:
   - Products/Services
   - Pricing (if available)
   - Market position
   - Strengths and weaknesses
   - Recent news/developments

OUTPUT FORMAT:
- Company Overview
- Competitor Profiles
- Comparison Matrix
- Key Insights
- Sources`;
  }

  protected parseOutput(content: string, action: AgentAction): ResearchResult {
    // Try to extract structured data from the response
    const topic = action.params.topic as string || 'Research';

    // Extract sources (URLs) from content
    const urlRegex = /https?:\/\/[^\s\)]+/g;
    const sources = content.match(urlRegex) || [];

    // Try to identify sections
    const findings: ResearchResult['findings'] = [];

    // Simple parsing: look for bullet points or numbered lists
    const lines = content.split('\n');
    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Check for headers
      if (trimmed.startsWith('#') || trimmed.endsWith(':')) {
        currentSection = trimmed.replace(/^#+\s*/, '').replace(/:$/, '');
        continue;
      }

      // Check for bullet points or numbered items
      if (trimmed.match(/^[-*•]\s+/) || trimmed.match(/^\d+\.\s+/)) {
        const content = trimmed.replace(/^[-*•\d.]+\s+/, '');
        if (content.length > 20) { // Only significant findings
          findings.push({
            title: currentSection || 'Finding',
            content: content,
            source: sources.find(s => content.includes(s))
          });
        }
      }
    }

    // Extract summary (first paragraph or section)
    const summaryMatch = content.match(/(?:summary|overview)[:\s]*([^\n]+(?:\n(?![#\-*•\d])[^\n]+)*)/i);
    const summary = summaryMatch?.[1]?.trim() || content.split('\n\n')[0]?.trim() || content.slice(0, 500);

    return {
      topic,
      summary,
      findings: findings.slice(0, 10), // Limit to top 10 findings
      sources: [...new Set(sources)], // Unique sources
      generatedAt: new Date().toISOString()
    };
  }
}
