// ============================================================
// API SERVER - Express + WebSocket
// ============================================================

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';

import { UniversalAgent } from '../index.js';
import { Brain } from '../memory/brain.js';
import { Scheduler } from '../scheduler/scheduler.js';
import { WorkflowEngine } from '../workflow/engine.js';
import type { LogEntry, ToolCallRecord, ExecutionCallbacks } from '../types/index.js';
import { createAdditionalRoutes, WorkflowStorage } from './routes.js';
import { GitHubStorage, createGitHubRoutes, createGitHubCallbackRoute } from './github.js';
import { createDirectToolRoutes } from './tools-direct.js';

// ============================================================
// TYPES
// ============================================================

interface AuthenticatedRequest extends Request {
  userId?: string;
}

interface WSMessage {
  type: 'task' | 'ping' | 'cancel';
  id?: string;
  payload?: unknown;
}

interface WSClient {
  ws: WebSocket;
  userId: string;
  activeTaskId?: string;
}

// ============================================================
// SERVER CLASS
// ============================================================

export class APIServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private agent: UniversalAgent;
  private brain: Brain;
  private scheduler: Scheduler;
  private workflowEngine: WorkflowEngine;
  private workflowStorage: WorkflowStorage;
  private githubStorage: GitHubStorage;
  private jwtSecret: string;
  private wsClients: Map<string, WSClient> = new Map();
  private activeTasks: Map<string, { cancel: () => void }> = new Map();

  constructor(config?: {
    jwtSecret?: string;
    dbPath?: string;
    memoryDbPath?: string;
    schedulerDbPath?: string;
    workflowDbPath?: string;
  }) {
    this.jwtSecret = config?.jwtSecret || process.env.JWT_SECRET || 'dev-secret-change-in-production';
    this.agent = new UniversalAgent({ dbPath: config?.dbPath });
    this.brain = new Brain({ dbPath: config?.memoryDbPath });

    // Initialize Scheduler
    this.scheduler = new Scheduler({ dbPath: config?.schedulerDbPath });
    this.scheduler.setAgent(this.agent);

    // Initialize Workflow Engine
    this.workflowEngine = new WorkflowEngine();
    this.workflowStorage = new WorkflowStorage(config?.workflowDbPath);

    // Initialize GitHub Storage
    this.githubStorage = new GitHubStorage(config?.dbPath ? config.dbPath.replace('.db', '-github.db') : './data/github.db');

    // Register default agent adapter for workflows
    this.workflowEngine.registerAgent('default', {
      execute: async (task: string) => {
        const result = await this.agent.run(task);
        return { output: result.summary || '', status: result.status };
      }
    });
    this.workflowEngine.registerAgent('coding', {
      execute: async (task: string) => {
        const result = await this.agent.run(task);
        return { output: result.summary || '', status: result.status };
      }
    });
    this.workflowEngine.registerAgent('research', {
      execute: async (task: string) => {
        const result = await this.agent.run(task);
        return { output: result.summary || '', status: result.status };
      }
    });
    this.workflowEngine.registerAgent('data', {
      execute: async (task: string) => {
        const result = await this.agent.run(task);
        return { output: result.summary || '', status: result.status };
      }
    });

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();

    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.setupWebSocket();
  }

  // ============================================================
  // MIDDLEWARE
  // ============================================================

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  private authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { userId: string };
      req.userId = decoded.userId;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  }

  // ============================================================
  // ROUTES
  // ============================================================

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Auth routes
    this.app.post('/auth/token', (req, res) => {
      const { userId } = req.body;
      if (!userId) {
        res.status(400).json({ error: 'userId required' });
        return;
      }

      const token = jwt.sign({ userId }, this.jwtSecret, { expiresIn: '24h' });
      res.json({ token, expiresIn: 86400 });
    });

    // Public GitHub callback (no auth required)
    const githubCallbackRoute = createGitHubCallbackRoute(this.githubStorage);
    this.app.use('/api/github', githubCallbackRoute);

    // Protected routes
    const protectedRouter = express.Router();
    protectedRouter.use((req, res, next) => this.authMiddleware(req as AuthenticatedRequest, res, next));

    // Task routes
    protectedRouter.post('/tasks', async (req, res) => {
      await this.handleTaskCreate(req as AuthenticatedRequest, res);
    });

    protectedRouter.get('/tasks/:id', async (req, res) => {
      await this.handleTaskGet(req as AuthenticatedRequest, res);
    });

    // Memory routes
    protectedRouter.post('/memory', async (req, res) => {
      await this.handleMemoryCreate(req as AuthenticatedRequest, res);
    });

    protectedRouter.get('/memory/search', async (req, res) => {
      await this.handleMemorySearch(req as AuthenticatedRequest, res);
    });

    protectedRouter.get('/memory/recent', async (req, res) => {
      await this.handleMemoryRecent(req as AuthenticatedRequest, res);
    });

    protectedRouter.get('/memory/stats', async (req, res) => {
      await this.handleMemoryStats(req as AuthenticatedRequest, res);
    });

    protectedRouter.delete('/memory/:id', async (req, res) => {
      await this.handleMemoryDelete(req as AuthenticatedRequest, res);
    });

    // Add additional routes for frontend with Scheduler and Workflow Engine
    const additionalRoutes = createAdditionalRoutes(
      this.agent,
      this.brain,
      this.scheduler,
      this.workflowEngine,
      this.workflowStorage
    );
    protectedRouter.use(additionalRoutes);

    // Add GitHub OAuth routes
    const githubRoutes = createGitHubRoutes(this.githubStorage);
    protectedRouter.use('/github', githubRoutes);

    // Add direct tool routes (real execution, not via AI)
    const directToolRoutes = createDirectToolRoutes();
    protectedRouter.use('/tools', directToolRoutes);

    this.app.use('/api', protectedRouter);
  }

  // ============================================================
  // ROUTE HANDLERS
  // ============================================================

  private async handleTaskCreate(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { message, language } = req.body;
    const userId = req.userId!;

    if (!message) {
      res.status(400).json({ error: 'message required' });
      return;
    }

    try {
      // Execute task with Chat Agent (handles memory internally)
      const result = await this.agent.run(message, {
        userId,
        language: language || 'de'
      });

      res.json({
        taskId: result.taskId,
        status: result.status,
        summary: result.summary,
        duration: result.duration,
        error: result.error
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Task execution failed'
      });
    }
  }

  private async handleTaskGet(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const task = await this.agent.getStateManager().getTask(id);

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json(task);
  }

  private async handleMemoryCreate(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { content, type, metadata } = req.body;
    const userId = req.userId!;

    if (!content || !type) {
      res.status(400).json({ error: 'content and type required' });
      return;
    }

    try {
      const entry = await this.brain.remember(userId, content, type, metadata);
      res.status(201).json(entry);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to create memory'
      });
    }
  }

  private async handleMemorySearch(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { q, types, limit } = req.query;
    const userId = req.userId!;

    if (!q) {
      res.status(400).json({ error: 'q (query) required' });
      return;
    }

    try {
      const results = await this.brain.recall(userId, q as string, {
        types: types ? (types as string).split(',') as any : undefined,
        limit: limit ? parseInt(limit as string) : undefined
      });
      res.json(results);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Search failed'
      });
    }
  }

  private async handleMemoryRecent(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { types, limit } = req.query;
    const userId = req.userId!;

    try {
      const memories = await this.brain.getRecentMemories(
        userId,
        limit ? parseInt(limit as string) : undefined,
        types ? (types as string).split(',') as any : undefined
      );
      res.json(memories);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get memories'
      });
    }
  }

  private async handleMemoryStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.userId!;

    try {
      const stats = this.brain.getStats(userId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get stats'
      });
    }
  }

  private async handleMemoryDelete(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const deleted = this.brain.forget(id);
    if (deleted) {
      res.status(204).send();
    } else {
      res.status(404).json({ error: 'Memory not found' });
    }
  }

  // ============================================================
  // WEBSOCKET
  // ============================================================

  private setupWebSocket(): void {
    this.wss.on('connection', (ws, req) => {
      const clientId = uuid();
      console.log(`WebSocket connected: ${clientId}`);

      // Authenticate via query param or first message
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');

      let userId: string | null = null;

      if (token) {
        try {
          const decoded = jwt.verify(token, this.jwtSecret) as { userId: string };
          userId = decoded.userId;
        } catch {
          ws.close(4001, 'Invalid token');
          return;
        }
      }

      if (userId) {
        this.wsClients.set(clientId, { ws, userId });
      }

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString()) as WSMessage;
          await this.handleWSMessage(clientId, message, ws);
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Invalid message format'
          }));
        }
      });

      ws.on('close', () => {
        console.log(`WebSocket disconnected: ${clientId}`);
        const client = this.wsClients.get(clientId);
        if (client?.activeTaskId) {
          this.activeTasks.get(client.activeTaskId)?.cancel();
        }
        this.wsClients.delete(clientId);
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        authenticated: !!userId
      }));
    });
  }

  private async handleWSMessage(clientId: string, message: WSMessage, ws: WebSocket): Promise<void> {
    const client = this.wsClients.get(clientId);

    switch (message.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;

      case 'task':
        if (!client?.userId) {
          ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
          return;
        }

        await this.handleWSTask(client, message, ws);
        break;

      case 'cancel':
        if (client?.activeTaskId) {
          this.activeTasks.get(client.activeTaskId)?.cancel();
          ws.send(JSON.stringify({ type: 'cancelled', taskId: client.activeTaskId }));
        }
        break;
    }
  }

  private async handleWSTask(client: WSClient, message: WSMessage, ws: WebSocket): Promise<void> {
    const taskMessage = (message.payload as { message: string })?.message;
    if (!taskMessage) {
      ws.send(JSON.stringify({ type: 'error', error: 'message required in payload' }));
      return;
    }

    const taskId = uuid();
    client.activeTaskId = taskId;

    let cancelled = false;
    this.activeTasks.set(taskId, {
      cancel: () => { cancelled = true; }
    });

    ws.send(JSON.stringify({ type: 'task_started', taskId }));

    // Remember user message
    await this.brain.rememberConversation(client.userId, 'user', taskMessage, taskId);

    // Create streaming callbacks
    const callbacks: ExecutionCallbacks = {
      onLog: (log: LogEntry) => {
        if (!cancelled) {
          ws.send(JSON.stringify({ type: 'log', taskId, log }));
        }
      },
      onToolCall: (call: ToolCallRecord) => {
        if (!cancelled) {
          ws.send(JSON.stringify({ type: 'tool_call', taskId, call }));
        }
      },
      onProgress: (stepId, progress) => {
        if (!cancelled) {
          ws.send(JSON.stringify({ type: 'progress', taskId, stepId, progress }));
        }
      }
    };

    try {
      const result = await this.agent.run(taskMessage, {
        onLog: callbacks.onLog,
        onToolCall: callbacks.onToolCall,
        onProgress: callbacks.onProgress as (phase: string, progress: number) => void
      });

      if (!cancelled) {
        // Remember result
        if (result.summary) {
          await this.brain.rememberConversation(client.userId, 'assistant', result.summary, taskId);
        }

        ws.send(JSON.stringify({
          type: 'task_completed',
          taskId,
          result: {
            status: result.status,
            summary: result.summary,
            duration: result.duration,
            error: result.error
          }
        }));
      }
    } catch (error) {
      if (!cancelled) {
        ws.send(JSON.stringify({
          type: 'task_error',
          taskId,
          error: error instanceof Error ? error.message : 'Task failed'
        }));
      }
    } finally {
      this.activeTasks.delete(taskId);
      client.activeTaskId = undefined;
    }
  }

  // ============================================================
  // LIFECYCLE
  // ============================================================

  start(port: number = 3000, startScheduler: boolean = true): void {
    this.server.listen(port, () => {
      if (startScheduler) {
        this.scheduler.start();
      }

      console.log(`
╔═══════════════════════════════════════════════════════════╗
║        UNIVERSAL AGENT API SERVER                        ║
║        Running on http://localhost:${port}                   ║
╚═══════════════════════════════════════════════════════════╝

Endpoints:
  GET  /health                     - Health check
  POST /auth/token                 - Get JWT token

  Tasks:
  POST /api/tasks                  - Create and run task
  GET  /api/tasks                  - List all tasks
  GET  /api/tasks/:id              - Get task details
  POST /api/tasks/:id/cancel       - Cancel task

  Memory:
  POST /api/memory                 - Store memory
  GET  /api/memory                 - List memories
  GET  /api/memory/:id             - Get memory by ID
  GET  /api/memory/search?q=...    - Search memories
  GET  /api/memory/stats           - Memory statistics
  DEL  /api/memory/:id             - Delete memory

  Scheduler:
  GET  /api/scheduler/jobs         - List all jobs
  POST /api/scheduler/jobs         - Create job
  GET  /api/scheduler/jobs/:id     - Get job details
  PATCH /api/scheduler/jobs/:id    - Update job
  DEL  /api/scheduler/jobs/:id     - Delete job
  POST /api/scheduler/jobs/:id/toggle - Enable/disable job
  POST /api/scheduler/jobs/:id/run - Run job manually
  GET  /api/scheduler/jobs/:id/executions - Job history

  Workflows:
  GET  /api/workflows              - List workflows
  POST /api/workflows              - Create workflow
  GET  /api/workflows/:id          - Get workflow
  PATCH /api/workflows/:id         - Update workflow
  DEL  /api/workflows/:id          - Delete workflow
  POST /api/workflows/:id/execute  - Execute workflow
  GET  /api/workflows/:id/executions - Execution history
  GET  /api/workflow-templates     - Get templates

  Agents:
  GET  /api/agents                 - List available agents

  Stats:
  GET  /api/stats                  - System statistics

  GitHub:
  GET  /api/github/auth            - Get GitHub OAuth URL
  GET  /api/github/callback        - OAuth callback (internal)
  GET  /api/github/status          - Check connection status
  POST /api/github/disconnect      - Disconnect GitHub
  GET  /api/github/repos           - List repositories
  GET  /api/github/repos/:o/:r/branches - List branches
  GET  /api/github/repos/:o/:r/contents?path= - Get file/folder
  GET  /api/github/repos/:o/:r/commits - List commits

WebSocket: ws://localhost:${port}?token=JWT
Scheduler: ${startScheduler ? 'ACTIVE' : 'DISABLED'}
`);
    });
  }

  stop(): void {
    this.scheduler.stop();
    this.wss.close();
    this.server.close();
    this.agent.close();
    this.brain.close();
    this.scheduler.close();
    this.workflowStorage.close();
    this.githubStorage.close();
  }

  // Start the scheduler when server starts
  startScheduler(): void {
    this.scheduler.start();
    console.log('Scheduler started');
  }
}
