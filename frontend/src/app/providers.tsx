'use client';

import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/api';

export function Providers({ children }: { children: React.ReactNode }) {
  const { theme, isAuthenticated, setAuthenticated } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);

  // Auto-login on app load
  useEffect(() => {
    const initAuth = async () => {
      // Check if we already have a token
      const existingToken = api.getToken();
      if (existingToken) {
        setAuthenticated(true);
        setIsLoading(false);
        return;
      }

      // Generate or retrieve user ID
      let userId = localStorage.getItem('user_id');
      if (!userId) {
        userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('user_id', userId);
      }

      try {
        await api.login(userId);
        setAuthenticated(true);
      } catch (error) {
        console.error('Auto-login failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [setAuthenticated]);

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  // Show loading state while authenticating
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-dark-400">Initializing...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'bg-white dark:bg-dark-800 text-dark-900 dark:text-white',
          duration: 4000
        }}
      />
    </>
  );
}
