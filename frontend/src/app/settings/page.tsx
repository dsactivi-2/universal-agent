'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAppStore } from '@/stores/app-store';
import { Sun, Moon, Monitor, Key, Bell, Database, Shield } from 'lucide-react';

export default function SettingsPage() {
  const { theme, setTheme } = useAppStore();
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  const themes = [
    { id: 'light', name: 'Light', icon: Sun },
    { id: 'dark', name: 'Dark', icon: Moon },
    { id: 'system', name: 'System', icon: Monitor }
  ];

  const handleSaveApiKey = async () => {
    setSaving(true);
    try {
      // Save API key logic here
      await new Promise((r) => setTimeout(r, 500));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header title="Settings" subtitle="Configure your agent system" />

      <div className="p-6 max-w-3xl space-y-6">
        {/* Appearance */}
        <Card>
          <CardHeader
            title="Appearance"
            subtitle="Customize the look and feel"
          />
          <div className="grid grid-cols-3 gap-3">
            {themes.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id as 'light' | 'dark' | 'system')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                    theme === t.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-dark-200 dark:border-dark-700 hover:border-dark-300 dark:hover:border-dark-600'
                  }`}
                >
                  <Icon className="w-6 h-6 text-dark-600 dark:text-dark-400" />
                  <span className="text-sm font-medium text-dark-900 dark:text-white">
                    {t.name}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* API Keys */}
        <Card>
          <CardHeader
            title="API Keys"
            subtitle="Manage your API credentials"
          />
          <div className="space-y-4">
            <Input
              label="Anthropic API Key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              icon={<Key className="w-4 h-4" />}
            />
            <Input
              label="OpenAI API Key"
              type="password"
              placeholder="sk-..."
              icon={<Key className="w-4 h-4" />}
            />
            <Button onClick={handleSaveApiKey} loading={saving}>
              Save API Keys
            </Button>
          </div>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader
            title="Notifications"
            subtitle="Configure notification preferences"
          />
          <div className="space-y-4">
            {[
              { id: 'task_complete', label: 'Task completed' },
              { id: 'task_failed', label: 'Task failed' },
              { id: 'scheduler', label: 'Scheduled job executed' }
            ].map((item) => (
              <label
                key={item.id}
                className="flex items-center justify-between"
              >
                <span className="text-sm text-dark-700 dark:text-dark-300">
                  {item.label}
                </span>
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-4 h-4 rounded border-dark-300 text-primary-500 focus:ring-primary-500"
                />
              </label>
            ))}
          </div>
        </Card>

        {/* Database */}
        <Card>
          <CardHeader title="Database" subtitle="Manage data storage" />
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-dark-50 dark:bg-dark-800/50">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-dark-400" />
                <div>
                  <p className="text-sm font-medium text-dark-900 dark:text-white">
                    SQLite Database
                  </p>
                  <p className="text-xs text-dark-500">./data/agent.db</p>
                </div>
              </div>
              <span className="text-xs text-green-500">Connected</span>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm">
                Export Data
              </Button>
              <Button variant="danger" size="sm">
                Clear All Data
              </Button>
            </div>
          </div>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader title="Security" subtitle="Authentication settings" />
          <div className="space-y-4">
            <Input
              label="JWT Secret"
              type="password"
              placeholder="Your secret key"
              icon={<Shield className="w-4 h-4" />}
            />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-dark-900 dark:text-white">
                  Two-Factor Authentication
                </p>
                <p className="text-xs text-dark-500">
                  Add an extra layer of security
                </p>
              </div>
              <Button variant="secondary" size="sm">
                Enable
              </Button>
            </div>
          </div>
        </Card>

        {/* About */}
        <Card>
          <CardHeader title="About" subtitle="System information" />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-dark-500">Version</span>
              <span className="text-dark-900 dark:text-white">0.1.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-500">Backend</span>
              <span className="text-dark-900 dark:text-white">Node.js + Express</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-500">Frontend</span>
              <span className="text-dark-900 dark:text-white">Next.js 14</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-500">Database</span>
              <span className="text-dark-900 dark:text-white">SQLite</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
