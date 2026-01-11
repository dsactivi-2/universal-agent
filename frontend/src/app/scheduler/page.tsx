'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { formatRelativeTime, cronToHuman } from '@/lib/utils';
import type { ScheduledJob, JobExecution } from '@/types';
import {
  Clock,
  Play,
  Pause,
  Trash2,
  Plus,
  Calendar,
  CheckCircle,
  XCircle,
  RefreshCw
} from 'lucide-react';

export default function SchedulerPage() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<ScheduledJob | null>(null);
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Form state for new job
  const [newJob, setNewJob] = useState({
    name: '',
    scheduleType: 'cron',
    expression: '0 * * * *',
    jobType: 'task',
    task: ''
  });

  useEffect(() => {
    loadJobs();
  }, []);

  useEffect(() => {
    if (selectedJob) {
      loadExecutions(selectedJob.id);
    }
  }, [selectedJob]);

  async function loadJobs() {
    setLoading(true);
    try {
      const result = await api.listJobs();
      setJobs(result);
      if (result.length > 0 && !selectedJob) {
        setSelectedJob(result[0]);
      }
    } catch (error) {
      console.error('Failed to load jobs:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadExecutions(jobId: string) {
    try {
      const result = await api.getJobExecutions(jobId, 10);
      setExecutions(result);
    } catch (error) {
      console.error('Failed to load executions:', error);
    }
  }

  async function handleToggle(job: ScheduledJob) {
    try {
      const updated = await api.toggleJob(job.id, !job.enabled);
      setJobs(jobs.map((j) => (j.id === job.id ? updated : j)));
      if (selectedJob?.id === job.id) {
        setSelectedJob(updated);
      }
    } catch (error) {
      console.error('Toggle failed:', error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this job?')) return;

    try {
      await api.deleteJob(id);
      setJobs(jobs.filter((j) => j.id !== id));
      if (selectedJob?.id === id) {
        setSelectedJob(null);
      }
    } catch (error) {
      console.error('Delete failed:', error);
    }
  }

  async function handleCreate() {
    try {
      const job = await api.createJob({
        name: newJob.name,
        schedule: {
          type: newJob.scheduleType as 'cron' | 'interval' | 'once',
          expression: newJob.expression
        },
        jobType: newJob.jobType as 'task' | 'workflow' | 'webhook' | 'command',
        config: { task: newJob.task }
      });
      setJobs([...jobs, job]);
      setShowCreate(false);
      setNewJob({ name: '', scheduleType: 'cron', expression: '0 * * * *', jobType: 'task', task: '' });
    } catch (error) {
      console.error('Create failed:', error);
    }
  }

  return (
    <div className="min-h-screen">
      <Header title="Scheduler" subtitle="Manage scheduled jobs and automation" />

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Jobs List */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-dark-900 dark:text-white">
                  Scheduled Jobs
                </h3>
                <Button size="sm" onClick={() => setShowCreate(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  New
                </Button>
              </div>

              {loading ? (
                <div className="text-center py-8 text-dark-500">Loading...</div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-8 text-dark-500">
                  No scheduled jobs
                </div>
              ) : (
                <div className="space-y-2">
                  {jobs.map((job) => (
                    <div
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedJob?.id === job.id
                          ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800'
                          : 'hover:bg-dark-50 dark:hover:bg-dark-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-dark-400" />
                          <span className="font-medium text-dark-900 dark:text-white">
                            {job.name}
                          </span>
                        </div>
                        <Badge variant={job.enabled ? 'success' : 'default'}>
                          {job.enabled ? 'Active' : 'Paused'}
                        </Badge>
                      </div>
                      <p className="text-xs text-dark-500 mt-1">
                        {cronToHuman(job.schedule.expression)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Job Details */}
          <div className="lg:col-span-2 space-y-4">
            {selectedJob ? (
              <>
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-dark-900 dark:text-white">
                        {selectedJob.name}
                      </h3>
                      <p className="text-sm text-dark-500">
                        {selectedJob.description || 'No description'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleToggle(selectedJob)}
                      >
                        {selectedJob.enabled ? (
                          <>
                            <Pause className="w-4 h-4 mr-1" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-1" />
                            Enable
                          </>
                        )}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(selectedJob.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-dark-500 mb-1">Schedule</p>
                      <p className="text-sm font-medium text-dark-900 dark:text-white">
                        {cronToHuman(selectedJob.schedule.expression)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-dark-500 mb-1">Type</p>
                      <p className="text-sm font-medium text-dark-900 dark:text-white capitalize">
                        {selectedJob.jobType}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-dark-500 mb-1">Run Count</p>
                      <p className="text-sm font-medium text-dark-900 dark:text-white">
                        {selectedJob.runCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-dark-500 mb-1">Next Run</p>
                      <p className="text-sm font-medium text-dark-900 dark:text-white">
                        {selectedJob.nextRun
                          ? formatRelativeTime(selectedJob.nextRun)
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                </Card>

                {/* Execution History */}
                <Card>
                  <CardHeader
                    title="Execution History"
                    subtitle="Recent job executions"
                    action={
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadExecutions(selectedJob.id)}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    }
                  />

                  {executions.length === 0 ? (
                    <div className="text-center py-8 text-dark-500">
                      No executions yet
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {executions.map((exec) => (
                        <div
                          key={exec.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-dark-50 dark:bg-dark-800/50"
                        >
                          <div className="flex items-center gap-3">
                            {exec.status === 'completed' ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : exec.status === 'failed' ? (
                              <XCircle className="w-4 h-4 text-red-500" />
                            ) : (
                              <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                            )}
                            <div>
                              <p className="text-sm font-medium text-dark-900 dark:text-white">
                                {formatRelativeTime(exec.scheduledAt)}
                              </p>
                              {exec.error && (
                                <p className="text-xs text-red-500">{exec.error}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge
                              variant={
                                exec.status === 'completed'
                                  ? 'success'
                                  : exec.status === 'failed'
                                  ? 'error'
                                  : 'info'
                              }
                            >
                              {exec.status}
                            </Badge>
                            {exec.duration && (
                              <p className="text-xs text-dark-500 mt-1">
                                {exec.duration}ms
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </>
            ) : (
              <Card>
                <div className="text-center py-12 text-dark-500">
                  <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Select a job to view details</p>
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* Create Job Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <Card className="w-full max-w-md">
              <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4">
                Create Scheduled Job
              </h3>

              <div className="space-y-4">
                <Input
                  label="Job Name"
                  value={newJob.name}
                  onChange={(e) => setNewJob({ ...newJob, name: e.target.value })}
                  placeholder="Daily backup"
                />

                <div>
                  <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                    Schedule Type
                  </label>
                  <select
                    value={newJob.scheduleType}
                    onChange={(e) => setNewJob({ ...newJob, scheduleType: e.target.value })}
                    className="w-full rounded-lg border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 px-4 py-2 text-dark-900 dark:text-white"
                  >
                    <option value="cron">Cron</option>
                    <option value="interval">Interval</option>
                    <option value="once">Once</option>
                  </select>
                </div>

                <Input
                  label="Expression"
                  value={newJob.expression}
                  onChange={(e) => setNewJob({ ...newJob, expression: e.target.value })}
                  placeholder="0 * * * *"
                />

                <Input
                  label="Task"
                  value={newJob.task}
                  onChange={(e) => setNewJob({ ...newJob, task: e.target.value })}
                  placeholder="Generate daily report"
                />
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button variant="secondary" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate}>Create Job</Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
