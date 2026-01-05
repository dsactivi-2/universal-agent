// ============================================================
// STATE MANAGER TESTS
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateManager } from '../src/db/state-manager.js';
import type { Task, TaskStatus, ExecutionPlan, StepResult } from '../src/types/index.js';
import * as fs from 'fs';

describe('StateManager', () => {
  let stateManager: StateManager;
  const testDbPath = './data/test-agent.db';

  beforeEach(() => {
    // Ensure data directory exists
    if (!fs.existsSync('./data')) {
      fs.mkdirSync('./data', { recursive: true });
    }
    // Remove old test db
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    stateManager = new StateManager(testDbPath);
  });

  afterEach(() => {
    stateManager.close();
    // Clean up test db
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Task Management', () => {
    it('should save and retrieve a task', async () => {
      const status: TaskStatus = {
        phase: 'planning',
        progress: 0
      };

      const task: Task = {
        id: 'test-task-1',
        userId: 'user-1',
        goal: 'Research AI trends',
        context: { source: 'test' },
        constraints: [],
        priority: 'normal',
        status,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await stateManager.saveTask(task);
      const retrieved = await stateManager.getTask('test-task-1');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('test-task-1');
      expect(retrieved?.goal).toBe('Research AI trends');
      expect(retrieved?.status.phase).toBe('planning');
    });

    it('should update task status', async () => {
      const status: TaskStatus = {
        phase: 'planning',
        progress: 0
      };

      const task: Task = {
        id: 'test-task-2',
        userId: 'user-1',
        goal: 'Test task',
        context: {},
        constraints: [],
        priority: 'normal',
        status,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await stateManager.saveTask(task);

      const newStatus: TaskStatus = {
        phase: 'executing',
        progress: 50
      };
      await stateManager.updateTaskStatus('test-task-2', newStatus);

      const retrieved = await stateManager.getTask('test-task-2');
      expect(retrieved?.status.phase).toBe('executing');
      expect(retrieved?.status.progress).toBe(50);
    });

    it('should return null for non-existent task', async () => {
      const result = await stateManager.getTask('non-existent');
      expect(result).toBeNull();
    });

    it('should get tasks by user', async () => {
      const status: TaskStatus = { phase: 'planning', progress: 0 };

      const task1: Task = {
        id: 'task-u1-1',
        userId: 'user-1',
        goal: 'Task 1',
        context: {},
        constraints: [],
        priority: 'normal',
        status,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const task2: Task = {
        id: 'task-u1-2',
        userId: 'user-1',
        goal: 'Task 2',
        context: {},
        constraints: [],
        priority: 'high',
        status,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const task3: Task = {
        id: 'task-u2-1',
        userId: 'user-2',
        goal: 'Task 3',
        context: {},
        constraints: [],
        priority: 'normal',
        status,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await stateManager.saveTask(task1);
      await stateManager.saveTask(task2);
      await stateManager.saveTask(task3);

      const user1Tasks = await stateManager.getTasksByUser('user-1');
      expect(user1Tasks.length).toBe(2);

      const user2Tasks = await stateManager.getTasksByUser('user-2');
      expect(user2Tasks.length).toBe(1);
    });
  });

  describe('Execution Plan', () => {
    it('should save and retrieve an execution plan', async () => {
      // First create a task
      const status: TaskStatus = { phase: 'planning', progress: 0 };
      const task: Task = {
        id: 'plan-test-task',
        userId: 'user-1',
        goal: 'Plan test',
        context: {},
        constraints: [],
        priority: 'normal',
        status,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await stateManager.saveTask(task);

      const plan: ExecutionPlan = {
        id: 'plan-1',
        taskId: 'plan-test-task',
        version: 1,
        steps: [
          {
            id: 'step-1',
            name: 'Research',
            description: 'Research the topic',
            agentId: 'research',
            action: { type: 'web_research', params: { topic: 'AI' } },
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
          confidence: 0.8
        },
        checkpoints: [],
        createdAt: new Date()
      };

      await stateManager.savePlan(plan);
      const retrieved = await stateManager.getPlan('plan-test-task');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('plan-1');
      expect(retrieved?.steps.length).toBe(1);
      expect(retrieved?.steps[0].name).toBe('Research');
    });
  });

  describe('Step Results', () => {
    it('should save and retrieve step results', async () => {
      // First create a task
      const status: TaskStatus = { phase: 'executing', progress: 0 };
      const task: Task = {
        id: 'result-test-task',
        userId: 'user-1',
        goal: 'Result test',
        context: {},
        constraints: [],
        priority: 'normal',
        status,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await stateManager.saveTask(task);

      const stepResult: StepResult = {
        stepId: 'step-1',
        status: 'success',
        output: { summary: 'Research completed' },
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 5000,
        cost: 0.02,
        logs: [],
        toolCalls: []
      };

      await stateManager.saveStepResult('result-test-task', stepResult);
      const results = await stateManager.getStepResults('result-test-task');

      expect(results.length).toBe(1);
      expect(results[0].stepId).toBe('step-1');
      expect(results[0].status).toBe('success');
      expect((results[0].output as any).summary).toBe('Research completed');
    });
  });

  describe('ID Generation', () => {
    it('should generate unique IDs', () => {
      const id1 = stateManager.generateId();
      const id2 = stateManager.generateId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(id1.length).toBeGreaterThan(0);
    });
  });
});
