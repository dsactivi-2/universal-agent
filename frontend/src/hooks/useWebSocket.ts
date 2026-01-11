// ============================================================
// WEBSOCKET HOOK FOR REAL-TIME UPDATES
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Task, LogEntry, ToolCall } from '@/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000';

interface WebSocketMessage {
  type: 'task_started' | 'task_progress' | 'task_completed' | 'task_failed' | 'tool_call' | 'log' | 'stream';
  taskId: string;
  data: unknown;
}

interface UseWebSocketOptions {
  onTaskStarted?: (taskId: string) => void;
  onTaskProgress?: (taskId: string, progress: number) => void;
  onTaskCompleted?: (taskId: string, result: string) => void;
  onTaskFailed?: (taskId: string, error: string) => void;
  onToolCall?: (taskId: string, toolCall: ToolCall) => void;
  onLog?: (taskId: string, log: LogEntry) => void;
  onStream?: (taskId: string, text: string) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subscribedTasksRef = useRef<Set<string>>(new Set());

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const wsUrl = token ? `${WS_URL}?token=${token}` : WS_URL;

      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setIsConnected(true);
        setError(null);

        // Re-subscribe to tasks
        subscribedTasksRef.current.forEach(taskId => {
          wsRef.current?.send(JSON.stringify({ type: 'subscribe', taskId }));
        });
      };

      wsRef.current.onclose = () => {
        setIsConnected(false);

        // Reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      wsRef.current.onerror = () => {
        setError('WebSocket connection error');
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          switch (message.type) {
            case 'task_started':
              options.onTaskStarted?.(message.taskId);
              break;
            case 'task_progress':
              options.onTaskProgress?.(message.taskId, message.data as number);
              break;
            case 'task_completed':
              options.onTaskCompleted?.(message.taskId, message.data as string);
              break;
            case 'task_failed':
              options.onTaskFailed?.(message.taskId, message.data as string);
              break;
            case 'tool_call':
              options.onToolCall?.(message.taskId, message.data as ToolCall);
              break;
            case 'log':
              options.onLog?.(message.taskId, message.data as LogEntry);
              break;
            case 'stream':
              options.onStream?.(message.taskId, message.data as string);
              break;
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };
    } catch (e) {
      setError('Failed to connect to WebSocket');
    }
  }, [options]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
  }, []);

  const subscribeToTask = useCallback((taskId: string) => {
    subscribedTasksRef.current.add(taskId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', taskId }));
    }
  }, []);

  const unsubscribeFromTask = useCallback((taskId: string) => {
    subscribedTasksRef.current.delete(taskId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe', taskId }));
    }
  }, []);

  const sendMessage = useCallback((message: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    isConnected,
    error,
    connect,
    disconnect,
    subscribeToTask,
    unsubscribeFromTask,
    sendMessage
  };
}

export default useWebSocket;
