'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import type { Workflow } from '@/types';
import {
  GitBranch,
  Plus,
  Play,
  Trash2,
  Edit,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    loadWorkflows();
  }, []);

  async function loadWorkflows() {
    setLoading(true);
    try {
      const result = await api.listWorkflows();
      setWorkflows(result);
    } catch (error) {
      console.error('Failed to load workflows:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute(workflow: Workflow) {
    setExecuting(true);
    try {
      const execution = await api.executeWorkflow(workflow.id);
      console.log('Workflow started:', execution);
      // Could show execution status
    } catch (error) {
      console.error('Execute failed:', error);
    } finally {
      setExecuting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this workflow?')) return;

    try {
      await api.deleteWorkflow(id);
      setWorkflows(workflows.filter((w) => w.id !== id));
      if (selectedWorkflow?.id === id) {
        setSelectedWorkflow(null);
      }
    } catch (error) {
      console.error('Delete failed:', error);
    }
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Workflows"
        subtitle="Build and manage automation workflows"
      />

      <div className="p-6">
        {/* Actions */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-4">
            <Input
              placeholder="Search workflows..."
              className="w-64"
            />
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Workflow
          </Button>
        </div>

        {/* Workflow Grid */}
        {loading ? (
          <div className="text-center py-12 text-dark-500">
            Loading workflows...
          </div>
        ) : workflows.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <GitBranch className="w-12 h-12 mx-auto mb-4 text-dark-300 dark:text-dark-600" />
              <h3 className="text-lg font-medium text-dark-700 dark:text-dark-300 mb-2">
                No workflows yet
              </h3>
              <p className="text-sm text-dark-500 mb-4">
                Create your first workflow to automate tasks
              </p>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Workflow
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.map((workflow) => (
              <Card key={workflow.id} className="hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
                      <GitBranch className="w-5 h-5 text-primary-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-dark-900 dark:text-white">
                        {workflow.name}
                      </h3>
                      <p className="text-xs text-dark-500">
                        {workflow.nodes.length} nodes
                      </p>
                    </div>
                  </div>
                </div>

                {workflow.description && (
                  <p className="text-sm text-dark-600 dark:text-dark-400 mb-4 line-clamp-2">
                    {workflow.description}
                  </p>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-dark-200 dark:border-dark-700">
                  <span className="text-xs text-dark-500">
                    Updated {formatRelativeTime(workflow.updatedAt)}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleExecute(workflow)}
                      loading={executing}
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(workflow.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Workflow Templates */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-dark-900 dark:text-white mb-4">
            Templates
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                name: 'Data Pipeline',
                description: 'Fetch, transform, and store data',
                icon: '📊'
              },
              {
                name: 'Research Flow',
                description: 'Search, analyze, and summarize',
                icon: '🔍'
              },
              {
                name: 'Code Review',
                description: 'Analyze and review code changes',
                icon: '💻'
              }
            ].map((template) => (
              <Card
                key={template.name}
                className="cursor-pointer hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{template.icon}</span>
                  <div>
                    <h3 className="font-medium text-dark-900 dark:text-white">
                      {template.name}
                    </h3>
                    <p className="text-xs text-dark-500">{template.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
