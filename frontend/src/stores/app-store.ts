// ============================================================
// ZUSTAND APP STORE
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Task, ChatMessage, SystemStats } from '@/types';

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'error' | 'warning';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export type Language = 'de' | 'en' | 'bs';

// Background Task for monitoring
export interface BackgroundTask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  result?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
  source: string; // e.g., 'github', 'tools', 'chat'
  metadata?: Record<string, unknown>;
}

interface AppState {
  // Theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Language
  language: Language;
  setLanguage: (language: Language) => void;

  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Current task
  currentTask: Task | null;
  setCurrentTask: (task: Task | null) => void;

  // Chat messages
  chatMessages: ChatMessage[];
  addChatMessage: (message: ChatMessage) => void;
  updateChatMessage: (id: string, updates: Partial<ChatMessage>) => void;
  clearChatMessages: () => void;

  // Streaming text
  streamingText: string;
  setStreamingText: (text: string) => void;
  appendStreamingText: (text: string) => void;

  // Stats
  stats: SystemStats | null;
  setStats: (stats: SystemStats) => void;

  // Selected agent
  selectedAgent: string;
  setSelectedAgent: (agent: string) => void;

  // Auth
  isAuthenticated: boolean;
  setAuthenticated: (auth: boolean) => void;

  // Notifications
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  markNotificationRead: (id: string) => void;

  // Background Tasks
  backgroundTasks: BackgroundTask[];
  addBackgroundTask: (task: Omit<BackgroundTask, 'id' | 'createdAt' | 'status'> & { status?: BackgroundTask['status'] }) => string;
  updateBackgroundTask: (id: string, updates: Partial<BackgroundTask>) => void;
  removeBackgroundTask: (id: string) => void;
  clearCompletedTasks: () => void;
  getRunningTasks: () => BackgroundTask[];
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Theme
      theme: 'dark',
      setTheme: (theme) => set({ theme }),

      // Language
      language: 'de',
      setLanguage: (language) => set({ language }),

      // Sidebar
      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // Current task
      currentTask: null,
      setCurrentTask: (task) => set({ currentTask: task }),

      // Chat messages
      chatMessages: [],
      addChatMessage: (message) =>
        set((state) => ({
          chatMessages: [...state.chatMessages, message]
        })),
      updateChatMessage: (id, updates) =>
        set((state) => ({
          chatMessages: state.chatMessages.map((msg) =>
            msg.id === id ? { ...msg, ...updates } : msg
          )
        })),
      clearChatMessages: () => set({ chatMessages: [] }),

      // Streaming text
      streamingText: '',
      setStreamingText: (text) => set({ streamingText: text }),
      appendStreamingText: (text) =>
        set((state) => ({ streamingText: state.streamingText + text })),

      // Stats
      stats: null,
      setStats: (stats) => set({ stats }),

      // Selected agent
      selectedAgent: 'coding',
      setSelectedAgent: (agent) => set({ selectedAgent: agent }),

      // Auth
      isAuthenticated: false,
      setAuthenticated: (auth) => set({ isAuthenticated: auth }),

      // Notifications
      notifications: [],
      addNotification: (notification) =>
        set((state) => ({
          notifications: [
            {
              ...notification,
              id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              timestamp: new Date().toISOString(),
              read: false
            },
            ...state.notifications
          ].slice(0, 50) // Keep only last 50 notifications
        })),
      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id)
        })),
      clearNotifications: () => set({ notifications: [] }),
      markNotificationRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          )
        })),

      // Background Tasks
      backgroundTasks: [],
      addBackgroundTask: (task) => {
        const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        set((state) => ({
          backgroundTasks: [
            {
              ...task,
              id,
              status: task.status || 'running',
              createdAt: new Date().toISOString()
            },
            ...state.backgroundTasks
          ].slice(0, 100) // Keep only last 100 tasks
        }));
        return id;
      },
      updateBackgroundTask: (id, updates) =>
        set((state) => ({
          backgroundTasks: state.backgroundTasks.map((task) =>
            task.id === id
              ? {
                  ...task,
                  ...updates,
                  completedAt: updates.status === 'completed' || updates.status === 'failed'
                    ? new Date().toISOString()
                    : task.completedAt
                }
              : task
          )
        })),
      removeBackgroundTask: (id) =>
        set((state) => ({
          backgroundTasks: state.backgroundTasks.filter((t) => t.id !== id)
        })),
      clearCompletedTasks: () =>
        set((state) => ({
          backgroundTasks: state.backgroundTasks.filter(
            (t) => t.status === 'pending' || t.status === 'running'
          )
        })),
      getRunningTasks: () => {
        const state = get();
        return state.backgroundTasks.filter(
          (t) => t.status === 'pending' || t.status === 'running'
        );
      }
    }),
    {
      name: 'universal-agent-storage',
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
        sidebarOpen: state.sidebarOpen,
        selectedAgent: state.selectedAgent
      })
    }
  )
);

export default useAppStore;
