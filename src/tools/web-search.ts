// ============================================================
// WEB SEARCH TOOL
// Uses Tavily API for web search
// ============================================================

import type { Tool, ToolDefinition } from '../types/index.js';

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface WebSearchResponse {
  query: string;
  results: WebSearchResult[];
  answer?: string;
}

export class WebSearchTool implements Tool {
  definition: ToolDefinition = {
    name: 'web_search',
    description: 'Search the web for current information on any topic. Returns relevant web pages with their content.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query'
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5)',
          default: 5
        }
      },
      required: ['query']
    },
    requiresConfirmation: false,
    costPerCall: 0.01
  };

  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TAVILY_API_KEY;
  }

  async execute(args: Record<string, unknown>): Promise<WebSearchResponse> {
    const query = args.query as string;
    const maxResults = (args.maxResults as number) || 5;

    if (!this.apiKey) {
      // Fallback: Return a simulated response for testing
      return this.simulatedSearch(query, maxResults);
    }

    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          max_results: maxResults,
          include_answer: true,
          include_raw_content: false
        })
      });

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.status}`);
      }

      const data = await response.json() as {
        query: string;
        answer?: string;
        results: Array<{
          title: string;
          url: string;
          content: string;
          score: number;
        }>;
      };

      return {
        query: data.query,
        results: data.results.map(r => ({
          title: r.title,
          url: r.url,
          content: r.content,
          score: r.score
        })),
        answer: data.answer
      };
    } catch (error) {
      console.error('Web search failed:', error);
      return this.simulatedSearch(query, maxResults);
    }
  }

  private simulatedSearch(query: string, maxResults: number): WebSearchResponse {
    // Return a placeholder for testing without API key
    return {
      query,
      results: [
        {
          title: `Search result for: ${query}`,
          url: 'https://example.com/result1',
          content: `This is a simulated search result for "${query}". In production, this would contain real web content from Tavily API.`,
          score: 0.95
        },
        {
          title: `More about: ${query}`,
          url: 'https://example.com/result2',
          content: `Additional information about "${query}". Configure TAVILY_API_KEY for real search results.`,
          score: 0.85
        }
      ].slice(0, maxResults),
      answer: `[Simulated] This would be an AI-generated answer about "${query}" from real search results.`
    };
  }
}
