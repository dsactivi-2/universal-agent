// ============================================================
// ADDITIONAL API ROUTES FOR FRONTEND
// ============================================================

import { Router, Request, Response } from 'express';
import type { UniversalAgent } from '../index.js';
import type { Brain } from '../memory/brain.js';
import type { Scheduler } from '../scheduler/scheduler.js';
import type { WorkflowEngine } from '../workflow/engine.js';

interface AuthenticatedRequest extends Request {
  userId?: string;
}

export function createAdditionalRoutes(
  agent: UniversalAgent,
  brain: Brain,
  scheduler?: Scheduler,
  workflowEngine?: WorkflowEngine
): Router {
  const router = Router();

  // ============================================================
  // STATS
  // ============================================================

  router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const memoryStats = brain.getStats(userId);

      // Get task stats from state manager for this user
      const stateManager = agent.getStateManager();
      const userTasks = await stateManager.getTasksByUser(userId);

      const taskStats = {
        total: userTasks.length,
        completed: userTasks.filter(t => t.status.phase === 'completed').length,
        failed: userTasks.filter(t => t.status.phase === 'failed').length,
        running: userTasks.filter(t => t.status.phase === 'executing').length
      };

      res.json({
        tasks: taskStats,
        memory: {
          total: memoryStats.totalMemories,
          byType: memoryStats.byType
        },
        agents: {
          total: 3, // coding, research, data
          active: taskStats.running > 0 ? 1 : 0
        },
        scheduler: {
          totalJobs: 0,
          enabledJobs: 0,
          executionsToday: 0
        }
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get stats'
      });
    }
  });

  // ============================================================
  // TASKS
  // ============================================================

  router.get('/tasks', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { status, limit = '50', offset = '0' } = req.query;
      const stateManager = agent.getStateManager();
      let tasks = await stateManager.getTasksByUser(userId);

      // Filter by status phase
      if (status) {
        tasks = tasks.filter(t => t.status.phase === status);
      }

      // Map to frontend format
      const mappedTasks = tasks.map(t => ({
        id: t.id,
        prompt: t.goal,
        status: t.status.phase,
        createdAt: t.createdAt.toISOString(),
        toolCalls: [],
        logs: []
      }));

      // Pagination
      const limitNum = parseInt(limit as string);
      const offsetNum = parseInt(offset as string);
      const paginatedTasks = mappedTasks.slice(offsetNum, offsetNum + limitNum);

      res.json({
        items: paginatedTasks,
        total: mappedTasks.length,
        page: Math.floor(offsetNum / limitNum) + 1,
        pageSize: limitNum,
        hasMore: offsetNum + limitNum < mappedTasks.length
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list tasks'
      });
    }
  });

  router.post('/tasks/:id/cancel', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const stateManager = agent.getStateManager();
      const task = await stateManager.getTask(id);

      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      // Mark as cancelled
      await stateManager.updateTaskStatus(id, { ...task.status, phase: 'failed' });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to cancel task'
      });
    }
  });

  // ============================================================
  // MEMORY (LIST)
  // ============================================================

  router.get('/memory', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { type, limit = '100', offset = '0' } = req.query;

      const limitNum = parseInt(limit as string);
      const offsetNum = parseInt(offset as string);

      // Get memories
      const types = type ? [type as string] : undefined;
      const memories = await brain.getRecentMemories(userId, limitNum + offsetNum, types as any);

      // Paginate
      const paginatedMemories = memories.slice(offsetNum, offsetNum + limitNum);

      res.json({
        items: paginatedMemories,
        total: memories.length,
        page: Math.floor(offsetNum / limitNum) + 1,
        pageSize: limitNum,
        hasMore: offsetNum + limitNum < memories.length
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list memories'
      });
    }
  });

  // ============================================================
  // AGENTS
  // ============================================================

  router.get('/agents', (req: AuthenticatedRequest, res: Response) => {
    res.json([
      { id: 'coding', name: 'Coding Agent', description: 'Code generation and file operations' },
      { id: 'research', name: 'Research Agent', description: 'Web search and information gathering' },
      { id: 'data', name: 'Data Analysis Agent', description: 'Data analysis and visualization' }
    ]);
  });

  // ============================================================
  // SCHEDULER (PLACEHOLDER)
  // ============================================================

  router.get('/scheduler/jobs', (req: AuthenticatedRequest, res: Response) => {
    // Return empty for now if no scheduler
    res.json([]);
  });

  router.post('/scheduler/jobs', (req: AuthenticatedRequest, res: Response) => {
    res.status(501).json({ error: 'Scheduler not configured' });
  });

  router.get('/scheduler/jobs/:id', (req: AuthenticatedRequest, res: Response) => {
    res.status(404).json({ error: 'Job not found' });
  });

  router.delete('/scheduler/jobs/:id', (req: AuthenticatedRequest, res: Response) => {
    res.status(404).json({ error: 'Job not found' });
  });

  router.post('/scheduler/jobs/:id/toggle', (req: AuthenticatedRequest, res: Response) => {
    res.status(404).json({ error: 'Job not found' });
  });

  router.get('/scheduler/jobs/:id/executions', (req: AuthenticatedRequest, res: Response) => {
    res.json([]);
  });

  // ============================================================
  // WORKFLOWS (PLACEHOLDER)
  // ============================================================

  router.get('/workflows', (req: AuthenticatedRequest, res: Response) => {
    res.json([]);
  });

  router.post('/workflows', (req: AuthenticatedRequest, res: Response) => {
    res.status(501).json({ error: 'Workflow engine not configured' });
  });

  router.get('/workflows/:id', (req: AuthenticatedRequest, res: Response) => {
    res.status(404).json({ error: 'Workflow not found' });
  });

  router.delete('/workflows/:id', (req: AuthenticatedRequest, res: Response) => {
    res.status(404).json({ error: 'Workflow not found' });
  });

  router.post('/workflows/:id/execute', (req: AuthenticatedRequest, res: Response) => {
    res.status(404).json({ error: 'Workflow not found' });
  });

  return router;
}
