'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import type { Workflow, WorkflowNode } from '@/types';
import {
  GitBranch,
  Plus,
  Play,
  Trash2,
  Edit,
  X,
  GripVertical,
  ChevronUp,
  ChevronDown,
  CheckCircle,
  Loader2,
  AlertCircle,
  Save
} from 'lucide-react';

// Step type for simple task chains
interface WorkflowStep {
  id: string;
  prompt: string;
  description?: string;
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newWorkflow, setNewWorkflow] = useState({ name: '', description: '' });

  // Edit Panel
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [newStepPrompt, setNewStepPrompt] = useState('');

  // Execute State
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<{
    status: 'running' | 'completed' | 'failed';
    currentStep?: number;
    output?: string;
    error?: string;
  } | null>(null);

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

  // Convert workflow nodes to simple steps
  function nodesToSteps(nodes: WorkflowNode[]): WorkflowStep[] {
    return nodes
      .filter(n => n.type === 'task')
      .map(n => ({
        id: n.id,
        prompt: (n.data as any)?.task || (n.data as any)?.prompt || '',
        description: (n.data as any)?.description
      }));
  }

  // Convert simple steps to workflow nodes
  function stepsToNodes(steps: WorkflowStep[]): WorkflowNode[] {
    const nodes: WorkflowNode[] = [];

    // Start node
    nodes.push({
      id: 'start',
      type: 'start',
      position: { x: 0, y: 0 },
      data: { type: 'start' }
    });

    // Task nodes
    steps.forEach((step, index) => {
      nodes.push({
        id: step.id,
        type: 'task',
        position: { x: 0, y: (index + 1) * 100 },
        data: {
          type: 'task',
          task: step.prompt,
          description: step.description,
          agent: 'default'
        }
      });
    });

    // End node
    nodes.push({
      id: 'end',
      type: 'end',
      position: { x: 0, y: (steps.length + 1) * 100 },
      data: { type: 'end' }
    });

    return nodes;
  }

  // Create edges connecting all nodes in sequence
  function createEdges(nodes: WorkflowNode[]) {
    const edges = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        id: `edge-${i}`,
        source: nodes[i].id,
        target: nodes[i + 1].id
      });
    }
    return edges;
  }

  async function handleCreate() {
    if (!newWorkflow.name.trim()) return;

    setCreating(true);
    try {
      const workflow = await api.createWorkflow({
        name: newWorkflow.name,
        description: newWorkflow.description,
        nodes: [],
        edges: [],
        variables: {}
      });
      setWorkflows([workflow, ...workflows]);
      setShowCreateModal(false);
      setNewWorkflow({ name: '', description: '' });
      // Open editor immediately
      handleEdit(workflow);
    } catch (error) {
      console.error('Create failed:', error);
    } finally {
      setCreating(false);
    }
  }

  function handleEdit(workflow: Workflow) {
    setEditingWorkflow(workflow);
    setSteps(nodesToSteps(workflow.nodes));
    setExecutionResult(null);
  }

  async function handleSave() {
    if (!editingWorkflow) return;

    setSaving(true);
    try {
      const nodes = stepsToNodes(steps);
      const edges = createEdges(nodes);

      const updated = await api.updateWorkflow(editingWorkflow.id, {
        nodes,
        edges
      });

      setWorkflows(workflows.map(w => w.id === updated.id ? updated : w));
      setEditingWorkflow(updated);
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Workflow wirklich löschen?')) return;

    try {
      await api.deleteWorkflow(id);
      setWorkflows(workflows.filter(w => w.id !== id));
      if (editingWorkflow?.id === id) {
        setEditingWorkflow(null);
      }
    } catch (error) {
      console.error('Delete failed:', error);
    }
  }

  async function handleExecute(workflow: Workflow) {
    setExecutingId(workflow.id);
    setExecutionResult({ status: 'running', currentStep: 0 });

    try {
      const result = await api.executeWorkflow(workflow.id);
      setExecutionResult({
        status: result.status === 'completed' ? 'completed' : 'failed',
        output: JSON.stringify(result.output, null, 2),
        error: result.error
      });
    } catch (error) {
      setExecutionResult({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Execution failed'
      });
    } finally {
      setExecutingId(null);
    }
  }

  function addStep() {
    if (!newStepPrompt.trim()) return;

    setSteps([...steps, {
      id: `step-${Date.now()}`,
      prompt: newStepPrompt
    }]);
    setNewStepPrompt('');
  }

  function removeStep(id: string) {
    setSteps(steps.filter(s => s.id !== id));
  }

  function moveStep(index: number, direction: 'up' | 'down') {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= steps.length) return;

    const newSteps = [...steps];
    [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
    setSteps(newSteps);
  }

  function updateStepPrompt(id: string, prompt: string) {
    setSteps(steps.map(s => s.id === id ? { ...s, prompt } : s));
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Workflows"
        subtitle="KI-Aufgaben automatisch verketten"
      />

      <div className="p-6">
        {/* Actions */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-4">
            <Input placeholder="Workflows suchen..." className="w-64" />
          </div>
          <Button data-testid="workflow_button_new" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Neuer Workflow
          </Button>
        </div>

        {/* Create Modal */}
        {showCreateModal && (
          <>
            <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowCreateModal(false)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-dark-900 rounded-xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between px-6 py-4 border-b border-dark-200 dark:border-dark-700">
                  <h2 className="text-lg font-semibold text-dark-900 dark:text-white">
                    Neuen Workflow erstellen
                  </h2>
                  <button onClick={() => setShowCreateModal(false)} className="p-2 rounded-lg hover:bg-dark-100 dark:hover:bg-dark-800 text-dark-500">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">Name *</label>
                    <Input
                      data-testid="workflow_input_name"
                      placeholder="z.B. Code Review Workflow"
                      value={newWorkflow.name}
                      onChange={(e) => setNewWorkflow({ ...newWorkflow, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">Beschreibung</label>
                    <textarea
                      data-testid="workflow_input_description"
                      className="w-full px-3 py-2 border border-dark-200 dark:border-dark-700 rounded-lg bg-white dark:bg-dark-800 text-dark-900 dark:text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      rows={3}
                      placeholder="Was macht dieser Workflow?"
                      value={newWorkflow.description}
                      onChange={(e) => setNewWorkflow({ ...newWorkflow, description: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-200 dark:border-dark-700">
                  <Button variant="ghost" onClick={() => setShowCreateModal(false)}>Abbrechen</Button>
                  <Button data-testid="workflow_button_create" onClick={handleCreate} loading={creating} disabled={!newWorkflow.name.trim()}>
                    Erstellen
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Edit Panel (Slide from right) */}
        {editingWorkflow && (
          <>
            <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setEditingWorkflow(null)} />
            <div className="fixed top-0 right-0 h-full w-full sm:w-[600px] md:w-[700px] z-[60] bg-white dark:bg-dark-900 shadow-2xl flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-dark-200 dark:border-dark-700">
                <div>
                  <h2 className="text-lg font-semibold text-dark-900 dark:text-white">
                    {editingWorkflow.name}
                  </h2>
                  <p className="text-sm text-dark-500">{steps.length} Schritte</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    data-testid="workflow_button_save"
                    variant="primary"
                    size="sm"
                    onClick={handleSave}
                    loading={saving}
                  >
                    <Save className="w-4 h-4 mr-1" />
                    Speichern
                  </Button>
                  <button onClick={() => setEditingWorkflow(null)} className="p-2 rounded-lg hover:bg-dark-100 dark:hover:bg-dark-800 text-dark-500">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Steps List */}
                <div>
                  <h3 className="text-sm font-medium text-dark-700 dark:text-dark-300 mb-3">
                    Workflow Schritte
                  </h3>

                  {steps.length === 0 ? (
                    <div className="text-center py-8 text-dark-500 bg-dark-50 dark:bg-dark-800/50 rounded-lg">
                      <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>Noch keine Schritte.</p>
                      <p className="text-xs">Füge unten einen Schritt hinzu.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {steps.map((step, index) => (
                        <div
                          key={step.id}
                          data-testid={`workflow_step_${index}`}
                          className="flex items-start gap-2 p-3 bg-dark-50 dark:bg-dark-800/50 rounded-lg border border-dark-200 dark:border-dark-700"
                        >
                          <div className="flex flex-col items-center gap-1 pt-2">
                            <button
                              onClick={() => moveStep(index, 'up')}
                              disabled={index === 0}
                              className="p-1 rounded hover:bg-dark-200 dark:hover:bg-dark-700 disabled:opacity-30"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <span className="text-xs font-medium text-dark-500">{index + 1}</span>
                            <button
                              onClick={() => moveStep(index, 'down')}
                              disabled={index === steps.length - 1}
                              className="p-1 rounded hover:bg-dark-200 dark:hover:bg-dark-700 disabled:opacity-30"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex-1">
                            <textarea
                              data-testid={`workflow_step_input_${index}`}
                              className="w-full px-3 py-2 border border-dark-200 dark:border-dark-700 rounded-lg bg-white dark:bg-dark-800 text-dark-900 dark:text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                              rows={2}
                              placeholder="KI-Aufgabe beschreiben..."
                              value={step.prompt}
                              onChange={(e) => updateStepPrompt(step.id, e.target.value)}
                            />
                          </div>
                          <button
                            data-testid={`workflow_step_delete_${index}`}
                            onClick={() => removeStep(step.id)}
                            className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-dark-400 hover:text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Step */}
                  <div className="mt-4 flex gap-2">
                    <Input
                      data-testid="workflow_input_new_step"
                      placeholder="Neuen Schritt hinzufügen..."
                      value={newStepPrompt}
                      onChange={(e) => setNewStepPrompt(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addStep()}
                      className="flex-1"
                    />
                    <Button
                      data-testid="workflow_button_add_step"
                      variant="secondary"
                      onClick={addStep}
                      disabled={!newStepPrompt.trim()}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Execute Section */}
                <div className="border-t border-dark-200 dark:border-dark-700 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-dark-700 dark:text-dark-300">
                      Workflow ausführen
                    </h3>
                    <Button
                      data-testid="workflow_button_execute"
                      onClick={() => handleExecute(editingWorkflow)}
                      disabled={steps.length === 0 || executingId === editingWorkflow.id}
                      loading={executingId === editingWorkflow.id}
                    >
                      <Play className="w-4 h-4 mr-1" />
                      Ausführen
                    </Button>
                  </div>

                  {/* Execution Result */}
                  {executionResult && (
                    <div className={`p-4 rounded-lg ${
                      executionResult.status === 'completed'
                        ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                        : executionResult.status === 'failed'
                        ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                        : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        {executionResult.status === 'running' && (
                          <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                        )}
                        {executionResult.status === 'completed' && (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        )}
                        {executionResult.status === 'failed' && (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className="font-medium text-sm capitalize">
                          {executionResult.status === 'running' ? 'Läuft...' :
                           executionResult.status === 'completed' ? 'Erfolgreich' : 'Fehlgeschlagen'}
                        </span>
                      </div>
                      {executionResult.output && (
                        <pre className="text-xs text-dark-700 dark:text-dark-300 whitespace-pre-wrap overflow-x-auto max-h-40">
                          {executionResult.output}
                        </pre>
                      )}
                      {executionResult.error && (
                        <p className="text-xs text-red-600 dark:text-red-400">
                          {executionResult.error}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Workflow Grid */}
        {loading ? (
          <div className="text-center py-12 text-dark-500">Workflows laden...</div>
        ) : workflows.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <GitBranch className="w-12 h-12 mx-auto mb-4 text-dark-300 dark:text-dark-600" />
              <h3 className="text-lg font-medium text-dark-700 dark:text-dark-300 mb-2">
                Noch keine Workflows
              </h3>
              <p className="text-sm text-dark-500 mb-4">
                Erstelle deinen ersten Workflow
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Workflow erstellen
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.map((workflow) => (
              <Card key={workflow.id} data-testid={`workflow_card_${workflow.id}`} className="hover:shadow-md transition-shadow">
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
                        {workflow.nodes.filter(n => n.type === 'task').length} Schritte
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
                    {formatRelativeTime(workflow.updatedAt)}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      data-testid={`workflow_button_execute_${workflow.id}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => handleExecute(workflow)}
                      loading={executingId === workflow.id}
                      disabled={workflow.nodes.filter(n => n.type === 'task').length === 0}
                      title={workflow.nodes.filter(n => n.type === 'task').length === 0 ? 'Keine Schritte - erst bearbeiten' : 'Ausführen'}
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                    <Button
                      data-testid={`workflow_button_edit_${workflow.id}`}
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(workflow)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      data-testid={`workflow_button_delete_${workflow.id}`}
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

        {/* Templates Section */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-dark-900 dark:text-white mb-4">
            Vorlagen
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { name: 'Code Review', description: 'Repository analysieren und reviewen', icon: '💻', steps: ['Repository klonen', 'Code analysieren', 'Review schreiben'] },
              { name: 'Research Flow', description: 'Thema recherchieren und zusammenfassen', icon: '🔍', steps: ['Web-Suche', 'Quellen analysieren', 'Zusammenfassung erstellen'] },
              { name: 'Data Pipeline', description: 'Daten laden, transformieren, speichern', icon: '📊', steps: ['Daten laden', 'Daten bereinigen', 'Analyse erstellen'] }
            ].map((template) => (
              <Card
                key={template.name}
                data-testid={`workflow_template_${template.name.toLowerCase().replace(' ', '_')}`}
                className="cursor-pointer hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
                onClick={async () => {
                  // Create workflow from template
                  const workflow = await api.createWorkflow({
                    name: template.name,
                    description: template.description,
                    nodes: [],
                    edges: [],
                    variables: {}
                  });
                  setWorkflows([workflow, ...workflows]);
                  // Open editor with pre-filled steps
                  setEditingWorkflow(workflow);
                  setSteps(template.steps.map((prompt, i) => ({
                    id: `step-${Date.now()}-${i}`,
                    prompt
                  })));
                }}
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
