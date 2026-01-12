'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useAppStore, type BackgroundTask } from '@/stores/app-store';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronUp,
  ChevronDown,
  Trash2,
  Minimize2,
  X,
  Eye,
  Copy,
  Check
} from 'lucide-react';

interface TaskMonitorProps {
  className?: string;
}

export function TaskMonitor({ className }: TaskMonitorProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [selectedTask, setSelectedTask] = useState<BackgroundTask | null>(null);
  const [copied, setCopied] = useState(false);
  const {
    backgroundTasks,
    updateBackgroundTask,
    removeBackgroundTask,
    clearCompletedTasks
  } = useAppStore();

  // Count tasks by status
  const runningCount = backgroundTasks.filter((t: BackgroundTask) => t.status === 'running' || t.status === 'pending').length;
  const completedCount = backgroundTasks.filter((t: BackgroundTask) => t.status === 'completed').length;
  const failedCount = backgroundTasks.filter((t: BackgroundTask) => t.status === 'failed').length;

  // Poll for task updates
  useEffect(() => {
    if (runningCount === 0) return;

    const pollInterval = setInterval(async () => {
      const runningTasks = backgroundTasks.filter((t: BackgroundTask) =>
        (t.status === 'running' || t.status === 'pending') && t.metadata?.taskId
      );

      for (const task of runningTasks) {
        try {
          const taskId = task.metadata?.taskId as string;
          const result = await api.getTask(taskId);

          if (result.status === 'completed') {
            updateBackgroundTask(task.id, {
              status: 'completed',
              result: result.result || 'Erfolgreich abgeschlossen',
              progress: 100
            });
          } else if (result.status === 'failed') {
            updateBackgroundTask(task.id, {
              status: 'failed',
              error: result.error || 'Unbekannter Fehler'
            });
          }
        } catch (error) {
          console.error('Failed to poll task:', error);
        }
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [backgroundTasks, runningCount, updateBackgroundTask]);

  // Update selected task when it changes in background
  useEffect(() => {
    if (selectedTask) {
      const updated = backgroundTasks.find((t: BackgroundTask) => t.id === selectedTask.id);
      if (updated) {
        setSelectedTask(updated);
      }
    }
  }, [backgroundTasks, selectedTask]);

  // Don't render if no tasks
  if (backgroundTasks.length === 0) return null;

  const getStatusIcon = (status: BackgroundTask['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusBadge = (status: BackgroundTask['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="warning">Wartend</Badge>;
      case 'running':
        return <Badge variant="info">Läuft</Badge>;
      case 'completed':
        return <Badge variant="success">Fertig</Badge>;
      case 'failed':
        return <Badge variant="error">Fehlgeschlagen</Badge>;
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const handleCopyResult = async () => {
    if (selectedTask?.result) {
      await navigator.clipboard.writeText(selectedTask.result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Minimized view - just a floating badge
  if (isMinimized) {
    return (
      <button
        data-testid="taskmonitor_button_expand"
        onClick={() => setIsMinimized(false)}
        className={cn(
          'fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-full',
          'bg-primary-500 text-white shadow-lg hover:bg-primary-600 transition-colors',
          className
        )}
      >
        <Activity className="w-5 h-5" />
        {runningCount > 0 && (
          <span className="flex items-center gap-1">
            <Loader2 className="w-4 h-4 animate-spin" />
            {runningCount}
          </span>
        )}
        {completedCount > 0 && (
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" />
            {completedCount}
          </span>
        )}
        {failedCount > 0 && (
          <span className="flex items-center gap-1">
            <XCircle className="w-4 h-4" />
            {failedCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      {/* Task Detail Slide Panel */}
      {selectedTask && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-[60] transition-opacity"
            onClick={() => setSelectedTask(null)}
          />

          {/* Slide Panel */}
          <div
            data-testid="taskmonitor_panel_details"
            className={cn(
              'fixed top-0 right-0 h-full w-full sm:w-[500px] md:w-[600px] z-[70]',
              'bg-white dark:bg-dark-900 shadow-2xl',
              'transform transition-transform duration-300 ease-out',
              'flex flex-col'
            )}
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-200 dark:border-dark-700">
              <div className="flex items-center gap-3">
                {getStatusIcon(selectedTask.status)}
                <div>
                  <h2 className="font-semibold text-dark-900 dark:text-white">
                    {selectedTask.title}
                  </h2>
                  <p className="text-xs text-dark-500">
                    {selectedTask.source} • {formatDateTime(selectedTask.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(selectedTask.status)}
                <button
                  data-testid="taskmonitor_button_close_details"
                  onClick={() => setSelectedTask(null)}
                  className="p-2 rounded-lg hover:bg-dark-100 dark:hover:bg-dark-800 text-dark-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Description */}
              <div>
                <h3 className="text-sm font-medium text-dark-500 dark:text-dark-400 mb-2">
                  Beschreibung
                </h3>
                <p className="text-dark-900 dark:text-white">
                  {selectedTask.description}
                </p>
              </div>

              {/* Progress for running tasks */}
              {selectedTask.status === 'running' && selectedTask.progress !== undefined && (
                <div>
                  <h3 className="text-sm font-medium text-dark-500 dark:text-dark-400 mb-2">
                    Fortschritt
                  </h3>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-dark-200 dark:bg-dark-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 transition-all duration-300"
                        style={{ width: `${selectedTask.progress}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-dark-700 dark:text-dark-300">
                      {selectedTask.progress}%
                    </span>
                  </div>
                </div>
              )}

              {/* Result */}
              {selectedTask.status === 'completed' && selectedTask.result && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-dark-500 dark:text-dark-400">
                      Ergebnis
                    </h3>
                    <button
                      data-testid="taskmonitor_button_copy_result"
                      onClick={handleCopyResult}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs rounded hover:bg-dark-100 dark:hover:bg-dark-800 text-dark-500"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-green-500" />
                          Kopiert
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Kopieren
                        </>
                      )}
                    </button>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <pre className="text-sm text-green-800 dark:text-green-200 whitespace-pre-wrap font-mono">
                      {selectedTask.result}
                    </pre>
                  </div>
                </div>
              )}

              {/* Error */}
              {selectedTask.status === 'failed' && selectedTask.error && (
                <div>
                  <h3 className="text-sm font-medium text-dark-500 dark:text-dark-400 mb-2">
                    Fehler
                  </h3>
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <pre className="text-sm text-red-800 dark:text-red-200 whitespace-pre-wrap font-mono">
                      {selectedTask.error}
                    </pre>
                  </div>
                </div>
              )}

              {/* Metadata */}
              {selectedTask.metadata && Object.keys(selectedTask.metadata).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-dark-500 dark:text-dark-400 mb-2">
                    Metadaten
                  </h3>
                  <div className="bg-dark-50 dark:bg-dark-800 rounded-lg p-4">
                    <dl className="space-y-2">
                      {Object.entries(selectedTask.metadata).map(([key, value]) => (
                        <div key={key} className="flex">
                          <dt className="w-24 text-xs font-medium text-dark-500 dark:text-dark-400">
                            {key}:
                          </dt>
                          <dd className="text-xs text-dark-700 dark:text-dark-300 break-all">
                            {String(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div>
                <h3 className="text-sm font-medium text-dark-500 dark:text-dark-400 mb-2">
                  Zeitstempel
                </h3>
                <div className="bg-dark-50 dark:bg-dark-800 rounded-lg p-4">
                  <dl className="space-y-2">
                    <div className="flex">
                      <dt className="w-24 text-xs font-medium text-dark-500 dark:text-dark-400">
                        Erstellt:
                      </dt>
                      <dd className="text-xs text-dark-700 dark:text-dark-300">
                        {formatDateTime(selectedTask.createdAt)}
                      </dd>
                    </div>
                    {selectedTask.completedAt && (
                      <div className="flex">
                        <dt className="w-24 text-xs font-medium text-dark-500 dark:text-dark-400">
                          Beendet:
                        </dt>
                        <dd className="text-xs text-dark-700 dark:text-dark-300">
                          {formatDateTime(selectedTask.completedAt)}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
            </div>

            {/* Panel Footer */}
            <div className="px-6 py-4 border-t border-dark-200 dark:border-dark-700 flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => setSelectedTask(null)}
              >
                Schließen
              </Button>
              {(selectedTask.status === 'completed' || selectedTask.status === 'failed') && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    removeBackgroundTask(selectedTask.id);
                    setSelectedTask(null);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Löschen
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Main Task Monitor Panel */}
      <div
        data-testid="taskmonitor_panel"
        className={cn(
          'fixed bottom-0 right-0 z-50 w-96 bg-white dark:bg-dark-900 border border-dark-200 dark:border-dark-700 rounded-tl-xl shadow-xl',
          className
        )}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-dark-200 dark:border-dark-700 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary-500" />
            <span className="font-semibold text-dark-900 dark:text-white">
              Task Monitor
            </span>
            {runningCount > 0 && (
              <Badge variant="info">{runningCount} aktiv</Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              data-testid="taskmonitor_button_minimize"
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(true);
              }}
              className="p-1 rounded hover:bg-dark-100 dark:hover:bg-dark-800 text-dark-500"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              data-testid="taskmonitor_button_toggle"
              className="p-1 rounded hover:bg-dark-100 dark:hover:bg-dark-800 text-dark-500"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Task List */}
        {isExpanded && (
          <div className="max-h-80 overflow-y-auto">
            {backgroundTasks.length === 0 ? (
              <div className="p-4 text-center text-dark-500">
                Keine aktiven Tasks
              </div>
            ) : (
              <div className="divide-y divide-dark-100 dark:divide-dark-800">
                {backgroundTasks.map((task: BackgroundTask) => (
                  <div
                    key={task.id}
                    data-testid={`taskmonitor_task_${task.id}`}
                    className="p-3 hover:bg-dark-50 dark:hover:bg-dark-800/50 cursor-pointer"
                    onClick={() => setSelectedTask(task)}
                  >
                    <div className="flex items-start gap-3">
                      {getStatusIcon(task.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm text-dark-900 dark:text-white truncate">
                            {task.title}
                          </span>
                          {getStatusBadge(task.status)}
                        </div>
                        <p className="text-xs text-dark-500 mt-1 line-clamp-2">
                          {task.description}
                        </p>

                        {/* Progress bar for running tasks */}
                        {task.status === 'running' && task.progress !== undefined && (
                          <div className="mt-2">
                            <div className="h-1.5 bg-dark-200 dark:bg-dark-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary-500 transition-all duration-300"
                                style={{ width: `${task.progress}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Result/Error Preview */}
                        {task.status === 'completed' && task.result && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1 line-clamp-2">
                            {task.result}
                          </p>
                        )}
                        {task.status === 'failed' && task.error && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1 line-clamp-2">
                            {task.error}
                          </p>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-dark-400">
                            {task.source} • {formatTime(task.createdAt)}
                          </span>
                          <div className="flex items-center gap-1">
                            {(task.status === 'completed' || task.status === 'failed') && (
                              <>
                                <button
                                  data-testid={`taskmonitor_button_view_${task.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTask(task);
                                  }}
                                  className="p-1 text-dark-400 hover:text-primary-500 transition-colors"
                                  title="Details anzeigen"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  data-testid={`taskmonitor_button_remove_${task.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeBackgroundTask(task.id);
                                  }}
                                  className="p-1 text-dark-400 hover:text-red-500 transition-colors"
                                  title="Löschen"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Footer Actions */}
            {backgroundTasks.length > 0 && (
              <div className="p-3 border-t border-dark-200 dark:border-dark-700 flex justify-between">
                <Button
                  data-testid="taskmonitor_button_clear"
                  variant="ghost"
                  size="sm"
                  onClick={clearCompletedTasks}
                  disabled={completedCount + failedCount === 0}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Erledigte löschen
                </Button>
                <span className="text-xs text-dark-400 self-center">
                  {backgroundTasks.length} Tasks
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default TaskMonitor;
