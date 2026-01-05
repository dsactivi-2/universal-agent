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
import type { LogEntry, ToolCallRecord, ExecutionCallbacks } from '../types/index.js';

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
  private jwtSecret: string;
  private wsClients: Map<string, WSClient> = new Map();
  private activeTasks: Map<string, { cancel: () => void }> = new Map();

  constructor(config?: {
    jwtSecret?: string;
    dbPath?: string;
    memoryDbPath?: string;
  }) {
    this.jwtSecret = config?.jwtSecret || process.env.JWT_SECRET || 'dev-secret-change-in-production';
    this.agent = new UniversalAgent({ dbPath: config?.dbPath });
    this.brain = new Brain({ dbPath: config?.memoryDbPath });

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

    this.app.use('/api', protectedRouter);
  }

  // ============================================================
  // ROUTE HANDLERS
  // ============================================================

  private async handleTaskCreate(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { message } = req.body;
    const userId = req.userId!;

    if (!message) {
      res.status(400).json({ error: 'message required' });
      return;
    }

    try {
      // Remember the user message
      await this.brain.rememberConversation(userId, 'user', message);

      // Execute task (synchronous for REST API)
      const result = await this.agent.run(message);

      // Remember the result
      if (result.summary) {
        await this.brain.rememberConversation(userId, 'assistant', result.summary);
      }

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

  start(port: number = 3000): void {
    this.server.listen(port, () => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║        UNIVERSAL AGENT API SERVER                        ║
║        Running on http://localhost:${port}                   ║
╚═══════════════════════════════════════════════════════════╝

Endpoints:
  GET  /health           - Health check
  POST /auth/token       - Get JWT token
  POST /api/tasks        - Create and run task
  GET  /api/tasks/:id    - Get task details
  POST /api/memory       - Store memory
  GET  /api/memory/search?q=... - Search memories
  GET  /api/memory/recent - Get recent memories
  GET  /api/memory/stats  - Memory statistics
  DEL  /api/memory/:id    - Delete memory

WebSocket: ws://localhost:${port}?token=JWT
`);
    });
  }

  stop(): void {
    this.wss.close();
    this.server.close();
    this.agent.close();
    this.brain.close();
  }
}
