'use client';

import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { useAppStore } from '@/stores/app-store';

export function Providers({ children }: { children: React.ReactNode }) {
  const { theme } = useAppStore();

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
