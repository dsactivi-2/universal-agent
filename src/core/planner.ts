// ============================================================
// PLANNER - Creates execution plans from user goals
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuid } from 'uuid';
import type {
  Task,
  ExecutionPlan,
  PlanStep,
  Dependency,
  Intent,
  PlanningError
} from '../types/index.js';
import { AgentRegistry } from '../agents/registry.js';

export class Planner {
  private client: Anthropic;
  private agentRegistry: AgentRegistry;

  constructor(agentRegistry: AgentRegistry) {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
    this.agentRegistry = agentRegistry;
  }

  // ============================================================
  // INTENT ANALYSIS
  // ============================================================

  async analyzeIntent(message: string): Promise<Intent> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      temperature: 0.2,
      system: `You are an intent analyzer for a conversational AI assistant with memory.

IMPORTANT: The assistant has CONVERSATION MEMORY and can remember previous messages.
When a user asks about something they mentioned before (like their name, location, preferences),
classify it as "simple_query" - the Chat Agent will handle it using conversation history.

NEVER use "clarification_needed" for questions about the user's identity or previous statements.
Use "clarification_needed" ONLY when the task is genuinely ambiguous and cannot be completed.

Classification rules:
- Greetings, small talk, questions, opinions → "simple_query"
- Questions about user's previous statements → "simple_query" (memory will handle it)
- Complex multi-step tasks requiring planning → "task"
- Only use "clarification_needed" for truly ambiguous requests

Available agents:
- chat: For conversations, questions, opinions (DEFAULT - has memory)
- research: For web research, competitive analysis, market research
- coding: For code-related tasks

Respond in JSON format only:
{
  "type": "task" | "simple_query" | "clarification_needed",
  "primaryGoal": "string",
  "subGoals": ["string"],
  "entities": { "key": "value" },
  "suggestedAgents": ["agentId"],
  "urgency": "low" | "normal" | "high",
  "clarificationQuestions": ["string"] // only if type is clarification_needed
}`,
      messages: [{ role: 'user', content: message }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    try {
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        type: parsed.type || 'task',
        primaryGoal: parsed.primaryGoal || message,
        subGoals: parsed.subGoals || [],
        entities: parsed.entities || {},
        suggestedAgents: parsed.suggestedAgents || ['research'],
        urgency: parsed.urgency || 'normal',
        clarificationQuestions: parsed.clarificationQuestions
      };
    } catch (error) {
      // Fallback: assume it's a research task
      return {
        type: 'task',
        primaryGoal: message,
        subGoals: [],
        entities: {},
        suggestedAgents: ['research'],
        urgency: 'normal'
      };
    }
  }

  // ============================================================
  // PLAN GENERATION
  // ============================================================

  async createPlan(task: Task): Promise<ExecutionPlan> {
    const availableAgents = this.agentRegistry.list();
    const capabilities = this.agentRegistry.getCapabilities();

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      temperature: 0.3,
      system: `You are a task planner. Create an execution plan for the given task.

Available agents and their capabilities:
${capabilities.map(c => `- ${c.agentId}: ${c.capabilities.join(', ')}`).join('\n')}

Create a plan with clear, atomic steps. Each step should be executable by one agent.

Respond in JSON format only:
{
  "steps": [
    {
      "id": "step_1",
      "name": "Short name",
      "description": "What this step does",
      "agentId": "agent_id",
      "action": {
        "type": "action_type",
        "params": {}
      },
      "inputs": [
        {
          "name": "inputName",
          "source": { "type": "literal", "value": "..." },
          "required": true
        }
      ],
      "timeout": 30000,
      "maxRetries": 2,
      "requiresApproval": false
    }
  ],
  "dependencies": [
    { "stepId": "step_2", "dependsOn": ["step_1"] }
  ],
  "estimates": {
    "totalDuration": 60000,
    "totalCost": 0.05,
    "confidence": 0.85
  }
}

For research tasks, use:
- agentId: "research"
- action.type: "web_research" or "competitive_analysis"
- action.params: { "topic": "...", "focusAreas": [...], "depth": "standard" }`,
      messages: [
        {
          role: 'user',
          content: `Create an execution plan for this task:

Goal: ${task.goal}
Priority: ${task.priority}
Context: ${JSON.stringify(task.context)}
${task.constraints.length > 0 ? `Constraints: ${JSON.stringify(task.constraints)}` : ''}
${task.deadline ? `Deadline: ${task.deadline.toISOString()}` : ''}`
        }
      ]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in planning response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and build plan
      const plan = this.buildPlan(task.id, parsed);

      // Validate agents exist
      this.validatePlan(plan);

      return plan;
    } catch (error) {
      // Fallback: create a simple single-step plan
      console.error('Plan parsing failed, using fallback:', error);
      return this.createFallbackPlan(task);
    }
  }

  private buildPlan(taskId: string, parsed: any): ExecutionPlan {
    const steps: PlanStep[] = (parsed.steps || []).map((s: any, index: number) => ({
      id: s.id || `step_${index + 1}`,
      name: s.name || `Step ${index + 1}`,
      description: s.description || '',
      agentId: s.agentId || 'research',
      action: s.action || { type: 'web_research', params: {} },
      inputs: s.inputs || [],
      expectedOutput: s.expectedOutput,
      timeout: s.timeout || 60000,
      maxRetries: s.maxRetries ?? 2,
      retryDelay: s.retryDelay || 1000,
      requiresApproval: s.requiresApproval || false,
      approvalPrompt: s.approvalPrompt
    }));

    const dependencies: Dependency[] = (parsed.dependencies || []).map((d: any) => ({
      stepId: d.stepId,
      dependsOn: d.dependsOn || [],
      condition: d.condition
    }));

    return {
      id: uuid(),
      taskId,
      version: 1,
      steps,
      dependencies,
      errorHandling: {
        default: 'retry',
        stepOverrides: {}
      },
      estimates: {
        totalDuration: parsed.estimates?.totalDuration || 60000,
        totalCost: parsed.estimates?.totalCost || 0.05,
        confidence: parsed.estimates?.confidence || 0.7
      },
      checkpoints: [],
      createdAt: new Date()
    };
  }

  private validatePlan(plan: ExecutionPlan): void {
    for (const step of plan.steps) {
      if (!this.agentRegistry.has(step.agentId)) {
        throw new Error(`Unknown agent in plan: ${step.agentId}`);
      }
    }

    // Check for circular dependencies
    this.detectCircularDeps(plan);
  }

  private detectCircularDeps(plan: ExecutionPlan): void {
    const depMap = new Map<string, string[]>();
    for (const dep of plan.dependencies) {
      depMap.set(dep.stepId, dep.dependsOn);
    }

    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (stepId: string): void => {
      if (visited.has(stepId)) return;
      if (visiting.has(stepId)) {
        throw new Error(`Circular dependency detected involving step: ${stepId}`);
      }

      visiting.add(stepId);
      for (const dep of depMap.get(stepId) || []) {
        visit(dep);
      }
      visiting.delete(stepId);
      visited.add(stepId);
    };

    for (const step of plan.steps) {
      visit(step.id);
    }
  }

  private createFallbackPlan(task: Task): ExecutionPlan {
    // Simple single-step research plan
    return {
      id: uuid(),
      taskId: task.id,
      version: 1,
      steps: [
        {
          id: 'step_1',
          name: 'Research',
          description: `Research: ${task.goal}`,
          agentId: 'research',
          action: {
            type: 'web_research',
            params: {
              topic: task.goal,
              depth: 'standard'
            }
          },
          inputs: [],
          timeout: 60000,
          maxRetries: 2,
          retryDelay: 1000,
          requiresApproval: false
        }
      ],
      dependencies: [],
      errorHandling: {
        default: 'retry',
        stepOverrides: {}
      },
      estimates: {
        totalDuration: 60000,
        totalCost: 0.05,
        confidence: 0.6
      },
      checkpoints: [],
      createdAt: new Date()
    };
  }

  // ============================================================
  // TOPOLOGICAL SORT
  // ============================================================

  topologicalSort(plan: ExecutionPlan): PlanStep[] {
    const depMap = new Map<string, Set<string>>();
    for (const dep of plan.dependencies) {
      depMap.set(dep.stepId, new Set(dep.dependsOn));
    }

    const sorted: PlanStep[] = [];
    const visited = new Set<string>();

    const visit = (stepId: string): void => {
      if (visited.has(stepId)) return;

      // Visit dependencies first
      for (const depId of depMap.get(stepId) || []) {
        visit(depId);
      }

      visited.add(stepId);
      const step = plan.steps.find(s => s.id === stepId);
      if (step) sorted.push(step);
    };

    for (const step of plan.steps) {
      visit(step.id);
    }

    return sorted;
  }

  // ============================================================
  // PARALLEL GROUPING
  // ============================================================

  groupParallelSteps(plan: ExecutionPlan): PlanStep[][] {
    const groups: PlanStep[][] = [];
    const completed = new Set<string>();
    const depMap = new Map<string, Set<string>>();

    for (const dep of plan.dependencies) {
      depMap.set(dep.stepId, new Set(dep.dependsOn));
    }

    let remaining = [...plan.steps];

    while (remaining.length > 0) {
      // Find all steps whose dependencies are satisfied
      const ready = remaining.filter(step => {
        const deps = depMap.get(step.id) || new Set();
        return [...deps].every(d => completed.has(d));
      });

      if (ready.length === 0) {
        // No progress possible - take remaining in order
        groups.push(remaining);
        break;
      }

      groups.push(ready);
      ready.forEach(s => completed.add(s.id));
      remaining = remaining.filter(s => !completed.has(s.id));
    }

    return groups;
  }
}
