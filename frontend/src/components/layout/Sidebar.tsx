'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app-store';
import {
  LayoutDashboard,
  MessageSquare,
  GitBranch,
  Database,
  Clock,
  Settings,
  ChevronLeft,
  Bot
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Chat', href: '/chat', icon: MessageSquare },
  { name: 'Workflows', href: '/workflows', icon: GitBranch },
  { name: 'Memory', href: '/memory', icon: Database },
  { name: 'Scheduler', href: '/scheduler', icon: Clock },
  { name: 'Settings', href: '/settings', icon: Settings }
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar } = useAppStore();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-white dark:bg-dark-900 border-r border-dark-200 dark:border-dark-700 transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-16'
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-dark-200 dark:border-dark-700">
        {sidebarOpen && (
          <Link href="/" className="flex items-center gap-2">
            <Bot className="w-8 h-8 text-primary-500" />
            <span className="text-lg font-bold text-dark-900 dark:text-white">
              Universal Agent
            </span>
          </Link>
        )}
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg hover:bg-dark-100 dark:hover:bg-dark-800 text-dark-500"
        >
          <ChevronLeft
            className={cn('w-5 h-5 transition-transform', !sidebarOpen && 'rotate-180')}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="p-3 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                  : 'text-dark-600 dark:text-dark-400 hover:bg-dark-100 dark:hover:bg-dark-800 hover:text-dark-900 dark:hover:text-white'
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      {sidebarOpen && (
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-dark-200 dark:border-dark-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white font-medium">
              A
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-dark-900 dark:text-white truncate">
                Admin
              </p>
              <p className="text-xs text-dark-500 truncate">admin@agent.local</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

export default Sidebar;
