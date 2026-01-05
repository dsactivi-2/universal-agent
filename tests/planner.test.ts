// ============================================================
// PLANNER TESTS
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { Planner } from '../src/core/planner.js';
import { AgentRegistry } from '../src/agents/registry.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { WebSearchTool } from '../src/tools/web-search.js';
import type { ExecutionPlan, PlanStep, Dependency } from '../src/types/index.js';

describe('Planner', () => {
  let planner: Planner;
  let agentRegistry: AgentRegistry;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    toolRegistry.register(new WebSearchTool());
    agentRegistry = new AgentRegistry(toolRegistry);
    planner = new Planner(agentRegistry);
  });

  describe('Topological Sort', () => {
    it('should sort steps with no dependencies', () => {
      const plan: ExecutionPlan = {
        id: 'plan-1',
        taskId: 'task-1',
        version: 1,
        steps: [
          createStep('step-1', 'Step 1'),
          createStep('step-2', 'Step 2'),
          createStep('step-3', 'Step 3')
        ],
        dependencies: [],
        errorHandling: { default: 'retry', stepOverrides: {} },
        estimates: { totalDuration: 60000, totalCost: 0.1, confidence: 0.8 },
        checkpoints: [],
        createdAt: new Date()
      };

      const sorted = planner.topologicalSort(plan);

      expect(sorted.length).toBe(3);
      // All steps should be present
      const ids = sorted.map(s => s.id);
      expect(ids).toContain('step-1');
      expect(ids).toContain('step-2');
      expect(ids).toContain('step-3');
    });

    it('should sort steps with linear dependencies', () => {
      const plan: ExecutionPlan = {
        id: 'plan-1',
        taskId: 'task-1',
        version: 1,
        steps: [
          createStep('step-1', 'Step 1'),
          createStep('step-2', 'Step 2'),
          createStep('step-3', 'Step 3')
        ],
        dependencies: [
          { stepId: 'step-2', dependsOn: ['step-1'] },
          { stepId: 'step-3', dependsOn: ['step-2'] }
        ],
        errorHandling: { default: 'retry', stepOverrides: {} },
        estimates: { totalDuration: 60000, totalCost: 0.1, confidence: 0.8 },
        checkpoints: [],
        createdAt: new Date()
      };

      const sorted = planner.topologicalSort(plan);

      expect(sorted.length).toBe(3);
      // Check order: step-1 must come before step-2, step-2 before step-3
      const indexOf = (id: string) => sorted.findIndex(s => s.id === id);
      expect(indexOf('step-1')).toBeLessThan(indexOf('step-2'));
      expect(indexOf('step-2')).toBeLessThan(indexOf('step-3'));
    });

    it('should handle diamond dependencies', () => {
      // step-1 -> step-2 -> step-4
      // step-1 -> step-3 -> step-4
      const plan: ExecutionPlan = {
        id: 'plan-1',
        taskId: 'task-1',
        version: 1,
        steps: [
          createStep('step-1', 'Step 1'),
          createStep('step-2', 'Step 2'),
          createStep('step-3', 'Step 3'),
          createStep('step-4', 'Step 4')
        ],
        dependencies: [
          { stepId: 'step-2', dependsOn: ['step-1'] },
          { stepId: 'step-3', dependsOn: ['step-1'] },
          { stepId: 'step-4', dependsOn: ['step-2', 'step-3'] }
        ],
        errorHandling: { default: 'retry', stepOverrides: {} },
        estimates: { totalDuration: 60000, totalCost: 0.1, confidence: 0.8 },
        checkpoints: [],
        createdAt: new Date()
      };

      const sorted = planner.topologicalSort(plan);

      expect(sorted.length).toBe(4);
      const indexOf = (id: string) => sorted.findIndex(s => s.id === id);
      // step-1 must come first
      expect(indexOf('step-1')).toBe(0);
      // step-4 must come last
      expect(indexOf('step-4')).toBe(3);
      // step-2 and step-3 come between
      expect(indexOf('step-2')).toBeGreaterThan(indexOf('step-1'));
      expect(indexOf('step-3')).toBeGreaterThan(indexOf('step-1'));
      expect(indexOf('step-2')).toBeLessThan(indexOf('step-4'));
      expect(indexOf('step-3')).toBeLessThan(indexOf('step-4'));
    });
  });

  describe('Parallel Step Grouping', () => {
    it('should group independent steps together', () => {
      const plan: ExecutionPlan = {
        id: 'plan-1',
        taskId: 'task-1',
        version: 1,
        steps: [
          createStep('step-1', 'Step 1'),
          createStep('step-2', 'Step 2'),
          createStep('step-3', 'Step 3')
        ],
        dependencies: [],
        errorHandling: { default: 'retry', stepOverrides: {} },
        estimates: { totalDuration: 60000, totalCost: 0.1, confidence: 0.8 },
        checkpoints: [],
        createdAt: new Date()
      };

      const groups = planner.groupParallelSteps(plan);

      // All steps can run in parallel (no dependencies)
      expect(groups.length).toBe(1);
      expect(groups[0].length).toBe(3);
    });

    it('should separate dependent steps into different groups', () => {
      const plan: ExecutionPlan = {
        id: 'plan-1',
        taskId: 'task-1',
        version: 1,
        steps: [
          createStep('step-1', 'Step 1'),
          createStep('step-2', 'Step 2'),
          createStep('step-3', 'Step 3')
        ],
        dependencies: [
          { stepId: 'step-2', dependsOn: ['step-1'] },
          { stepId: 'step-3', dependsOn: ['step-2'] }
        ],
        errorHandling: { default: 'retry', stepOverrides: {} },
        estimates: { totalDuration: 60000, totalCost: 0.1, confidence: 0.8 },
        checkpoints: [],
        createdAt: new Date()
      };

      const groups = planner.groupParallelSteps(plan);

      // Each step in its own group (sequential)
      expect(groups.length).toBe(3);
      expect(groups[0].length).toBe(1);
      expect(groups[0][0].id).toBe('step-1');
      expect(groups[1][0].id).toBe('step-2');
      expect(groups[2][0].id).toBe('step-3');
    });

    it('should group steps that can run in parallel', () => {
      // step-1 runs first, then step-2 and step-3 can run in parallel
      const plan: ExecutionPlan = {
        id: 'plan-1',
        taskId: 'task-1',
        version: 1,
        steps: [
          createStep('step-1', 'Step 1'),
          createStep('step-2', 'Step 2'),
          createStep('step-3', 'Step 3')
        ],
        dependencies: [
          { stepId: 'step-2', dependsOn: ['step-1'] },
          { stepId: 'step-3', dependsOn: ['step-1'] }
        ],
        errorHandling: { default: 'retry', stepOverrides: {} },
        estimates: { totalDuration: 60000, totalCost: 0.1, confidence: 0.8 },
        checkpoints: [],
        createdAt: new Date()
      };

      const groups = planner.groupParallelSteps(plan);

      expect(groups.length).toBe(2);
      expect(groups[0].length).toBe(1);
      expect(groups[0][0].id).toBe('step-1');
      expect(groups[1].length).toBe(2);
      const group2Ids = groups[1].map(s => s.id);
      expect(group2Ids).toContain('step-2');
      expect(group2Ids).toContain('step-3');
    });
  });
});

// Helper function to create a minimal step
function createStep(id: string, name: string): PlanStep {
  return {
    id,
    name,
    description: `Description for ${name}`,
    agentId: 'research',
    action: { type: 'web_research', params: { topic: 'test' } },
    inputs: [],
    timeout: 60000,
    maxRetries: 2,
    retryDelay: 1000,
    requiresApproval: false
  };
}
