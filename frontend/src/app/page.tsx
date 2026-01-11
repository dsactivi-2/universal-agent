'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import type { SystemStats, Task } from '@/types';
import {
  Activity,
  CheckCircle,
  Clock,
  Database,
  AlertCircle,
  TrendingUp,
  Bot,
  Zap
} from 'lucide-react';

export default function DashboardPage() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [statsData, tasksData] = await Promise.all([
          api.getStats().catch(() => null),
          api.listTasks({ limit: 5 }).catch(() => ({ items: [] }))
        ]);
        setStats(statsData);
        setRecentTasks(tasksData.items || []);
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const statCards = [
    {
      title: 'Total Tasks',
      value: stats?.tasks.total || 0,
      icon: Activity,
      color: 'text-blue-500',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30'
    },
    {
      title: 'Completed',
      value: stats?.tasks.completed || 0,
      icon: CheckCircle,
      color: 'text-green-500',
      bgColor: 'bg-green-100 dark:bg-green-900/30'
    },
    {
      title: 'Running',
      value: stats?.tasks.running || 0,
      icon: Zap,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/30'
    },
    {
      title: 'Memory Items',
      value: stats?.memory.total || 0,
      icon: Database,
      color: 'text-purple-500',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30'
    }
  ];

  return (
    <div className="min-h-screen">
      <Header title="Dashboard" subtitle="Overview of your AI agent system" />

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title}>
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                    <Icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-sm text-dark-500 dark:text-dark-400">
                      {stat.title}
                    </p>
                    <p className="text-2xl font-bold text-dark-900 dark:text-white">
                      {loading ? '...' : stat.value.toLocaleString()}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Tasks */}
          <Card>
            <CardHeader title="Recent Tasks" subtitle="Last 5 executed tasks" />
            <div className="space-y-3">
              {loading ? (
                <div className="text-center py-8 text-dark-500">Loading...</div>
              ) : recentTasks.length === 0 ? (
                <div className="text-center py-8 text-dark-500">
                  No tasks yet. Start a chat to create one!
                </div>
              ) : (
                recentTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-dark-50 dark:bg-dark-800/50"
                  >
                    <div className="flex-1 min-w-0 mr-4">
                      <p className="text-sm font-medium text-dark-900 dark:text-white truncate">
                        {task.prompt}
                      </p>
                      <p className="text-xs text-dark-500">
                        {formatRelativeTime(task.createdAt)}
                      </p>
                    </div>
                    <Badge
                      variant={
                        task.status === 'completed'
                          ? 'success'
                          : task.status === 'failed'
                          ? 'error'
                          : task.status === 'running'
                          ? 'info'
                          : 'default'
                      }
                    >
                      {task.status}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader title="Quick Actions" subtitle="Common operations" />
            <div className="grid grid-cols-2 gap-3">
              <a
                href="/chat"
                className="flex flex-col items-center gap-2 p-4 rounded-lg bg-dark-50 dark:bg-dark-800/50 hover:bg-dark-100 dark:hover:bg-dark-700 transition-colors"
              >
                <Bot className="w-8 h-8 text-primary-500" />
                <span className="text-sm font-medium text-dark-900 dark:text-white">
                  New Chat
                </span>
              </a>
              <a
                href="/workflows"
                className="flex flex-col items-center gap-2 p-4 rounded-lg bg-dark-50 dark:bg-dark-800/50 hover:bg-dark-100 dark:hover:bg-dark-700 transition-colors"
              >
                <TrendingUp className="w-8 h-8 text-green-500" />
                <span className="text-sm font-medium text-dark-900 dark:text-white">
                  Workflows
                </span>
              </a>
              <a
                href="/memory"
                className="flex flex-col items-center gap-2 p-4 rounded-lg bg-dark-50 dark:bg-dark-800/50 hover:bg-dark-100 dark:hover:bg-dark-700 transition-colors"
              >
                <Database className="w-8 h-8 text-purple-500" />
                <span className="text-sm font-medium text-dark-900 dark:text-white">
                  Memory
                </span>
              </a>
              <a
                href="/scheduler"
                className="flex flex-col items-center gap-2 p-4 rounded-lg bg-dark-50 dark:bg-dark-800/50 hover:bg-dark-100 dark:hover:bg-dark-700 transition-colors"
              >
                <Clock className="w-8 h-8 text-orange-500" />
                <span className="text-sm font-medium text-dark-900 dark:text-white">
                  Scheduler
                </span>
              </a>
            </div>
          </Card>
        </div>

        {/* System Status */}
        <Card>
          <CardHeader title="System Status" subtitle="Current system health" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
              <div>
                <p className="text-sm font-medium text-dark-900 dark:text-white">
                  API Server
                </p>
                <p className="text-xs text-green-500">Online</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
              <div>
                <p className="text-sm font-medium text-dark-900 dark:text-white">
                  Database
                </p>
                <p className="text-xs text-green-500">Connected</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
              <div>
                <p className="text-sm font-medium text-dark-900 dark:text-white">
                  Agents
                </p>
                <p className="text-xs text-green-500">
                  {stats?.agents.active || 0} active
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
              <div>
                <p className="text-sm font-medium text-dark-900 dark:text-white">
                  Scheduler
                </p>
                <p className="text-xs text-green-500">
                  {stats?.scheduler.enabledJobs || 0} jobs
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
