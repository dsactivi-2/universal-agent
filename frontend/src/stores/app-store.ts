// ============================================================
// ZUSTAND APP STORE
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Task, ChatMessage, SystemStats } from '@/types';

interface AppState {
  // Theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

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
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Theme
      theme: 'dark',
      setTheme: (theme) => set({ theme }),

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
      setAuthenticated: (auth) => set({ isAuthenticated: auth })
    }),
    {
      name: 'universal-agent-storage',
      partialize: (state) => ({
        theme: state.theme,
        sidebarOpen: state.sidebarOpen,
        selectedAgent: state.selectedAgent
      })
    }
  )
);

export default useAppStore;
