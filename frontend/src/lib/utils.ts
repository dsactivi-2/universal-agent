// ============================================================
// UTILITY FUNCTIONS
// ============================================================

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format date to relative time
 */
export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return then.toLocaleDateString();
}

/**
 * Format date to readable string
 */
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleString();
}

/**
 * Format duration in milliseconds to readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.slice(0, length) + '...';
}

/**
 * Generate a random ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Parse cron expression to human readable
 */
export function cronToHuman(expression: string): string {
  const parts = expression.split(' ');
  if (parts.length !== 5) return expression;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  if (minute === '*' && hour === '*') return 'Every minute';
  if (minute === '0' && hour === '*') return 'Every hour';
  if (minute === '0' && hour === '0' && dayOfMonth === '*') return 'Every day at midnight';
  if (dayOfWeek === '1-5' && minute === '0' && hour === '9') return 'Weekdays at 9:00 AM';

  return expression;
}

/**
 * Status color mapping
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'text-yellow-500 bg-yellow-100 dark:bg-yellow-900/30',
    running: 'text-blue-500 bg-blue-100 dark:bg-blue-900/30',
    completed: 'text-green-500 bg-green-100 dark:bg-green-900/30',
    failed: 'text-red-500 bg-red-100 dark:bg-red-900/30',
    cancelled: 'text-gray-500 bg-gray-100 dark:bg-gray-900/30',
    paused: 'text-orange-500 bg-orange-100 dark:bg-orange-900/30'
  };
  return colors[status] || 'text-gray-500 bg-gray-100 dark:bg-gray-900/30';
}

/**
 * Memory type icon mapping
 */
export function getMemoryTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    conversation: '💬',
    task: '📋',
    fact: '📚',
    preference: '⚙️',
    code: '💻',
    document: '📄'
  };
  return icons[type] || '📝';
}
