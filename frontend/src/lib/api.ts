// ============================================================
// API CLIENT
// ============================================================

import type {
  Task,
  Memory,
  MemorySearchResult,
  SystemStats,
  ScheduledJob,
  JobExecution,
  Workflow,
  WorkflowExecution,
  ApiResponse,
  PaginatedResponse,
  ToolResult,
  FileReadResult,
  FileListResult,
  CodeExecuteResult,
  GitStatusResult,
  GitLogResult,
  SqlQueryResult,
  ChartResult
} from '@/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // ============================================================
  // AUTH
  // ============================================================

  async login(userId: string): Promise<{ token: string }> {
    // Backend uses /auth/token (outside /api prefix)
    const response = await fetch(`${API_BASE}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });

    if (!response.ok) {
      throw new Error('Authentication failed');
    }

    const result = await response.json();
    this.setToken(result.token);
    return result;
  }

  logout() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  // ============================================================
  // TASKS
  // ============================================================

  async createTask(prompt: string, agentId?: string, language?: string): Promise<Task> {
    return this.request<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ message: prompt, agentId, language })
    });
  }

  async getTask(id: string): Promise<Task> {
    return this.request<Task>(`/api/tasks/${id}`);
  }

  async listTasks(params?: {
    status?: string;
    limit?: number;
    offset?: number
  }): Promise<PaginatedResponse<Task>> {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return this.request<PaginatedResponse<Task>>(`/api/tasks?${query}`);
  }

  async cancelTask(id: string): Promise<void> {
    await this.request(`/api/tasks/${id}/cancel`, { method: 'POST' });
  }

  // ============================================================
  // MEMORY
  // ============================================================

  async createMemory(data: {
    type: Memory['type'];
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<Memory> {
    return this.request<Memory>('/api/memory', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getMemory(id: string): Promise<Memory> {
    return this.request<Memory>(`/api/memory/${id}`);
  }

  async searchMemory(query: string, options?: {
    type?: Memory['type'];
    limit?: number;
  }): Promise<MemorySearchResult[]> {
    const params = new URLSearchParams({ query, ...options as Record<string, string> });
    return this.request<MemorySearchResult[]>(`/api/memory/search?${params}`);
  }

  async listMemories(params?: {
    type?: Memory['type'];
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<Memory>> {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return this.request<PaginatedResponse<Memory>>(`/api/memory?${query}`);
  }

  async deleteMemory(id: string): Promise<void> {
    await this.request(`/api/memory/${id}`, { method: 'DELETE' });
  }

  // ============================================================
  // STATS
  // ============================================================

  async getStats(): Promise<SystemStats> {
    return this.request<SystemStats>('/api/stats');
  }

  // ============================================================
  // SCHEDULER
  // ============================================================

  async createJob(data: Partial<ScheduledJob>): Promise<ScheduledJob> {
    return this.request<ScheduledJob>('/api/scheduler/jobs', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async listJobs(): Promise<ScheduledJob[]> {
    return this.request<ScheduledJob[]>('/api/scheduler/jobs');
  }

  async getJob(id: string): Promise<ScheduledJob> {
    return this.request<ScheduledJob>(`/api/scheduler/jobs/${id}`);
  }

  async updateJob(id: string, data: Partial<ScheduledJob>): Promise<ScheduledJob> {
    return this.request<ScheduledJob>(`/api/scheduler/jobs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async deleteJob(id: string): Promise<void> {
    await this.request(`/api/scheduler/jobs/${id}`, { method: 'DELETE' });
  }

  async toggleJob(id: string, enabled: boolean): Promise<ScheduledJob> {
    return this.request<ScheduledJob>(`/api/scheduler/jobs/${id}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled })
    });
  }

  async getJobExecutions(jobId: string, limit = 10): Promise<JobExecution[]> {
    return this.request<JobExecution[]>(`/api/scheduler/jobs/${jobId}/executions?limit=${limit}`);
  }

  async runJob(jobId: string): Promise<JobExecution> {
    return this.request<JobExecution>(`/api/scheduler/jobs/${jobId}/run`, {
      method: 'POST'
    });
  }

  // ============================================================
  // WORKFLOWS
  // ============================================================

  async createWorkflow(data: Partial<Workflow>): Promise<Workflow> {
    return this.request<Workflow>('/api/workflows', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async listWorkflows(): Promise<Workflow[]> {
    return this.request<Workflow[]>('/api/workflows');
  }

  async getWorkflow(id: string): Promise<Workflow> {
    return this.request<Workflow>(`/api/workflows/${id}`);
  }

  async updateWorkflow(id: string, data: Partial<Workflow>): Promise<Workflow> {
    return this.request<Workflow>(`/api/workflows/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.request(`/api/workflows/${id}`, { method: 'DELETE' });
  }

  async executeWorkflow(id: string, input?: Record<string, unknown>): Promise<WorkflowExecution> {
    return this.request<WorkflowExecution>(`/api/workflows/${id}/execute`, {
      method: 'POST',
      body: JSON.stringify({ input })
    });
  }

  async getWorkflowExecutions(workflowId: string, limit = 10): Promise<WorkflowExecution[]> {
    return this.request<WorkflowExecution[]>(`/api/workflows/${workflowId}/executions?limit=${limit}`);
  }

  async getWorkflowTemplates(): Promise<Workflow[]> {
    return this.request<Workflow[]>('/api/workflow-templates');
  }

  // ============================================================
  // AGENTS
  // ============================================================

  async listAgents(): Promise<{ id: string; name: string; description: string }[]> {
    return this.request('/api/agents');
  }

  // ============================================================
  // TOOLS - Direct tool execution via Chat Agent
  // All tools return Task which contains the result in the summary field
  // ============================================================

  // File Operations
  async fileRead(path: string): Promise<Task> {
    return this.createTask(`Lies die Datei: ${path}`);
  }

  async fileWrite(path: string, content: string): Promise<Task> {
    return this.createTask(`Schreibe in Datei ${path}:\n\n${content}`);
  }

  async fileEdit(path: string, search: string, replace: string): Promise<Task> {
    return this.createTask(`Ersetze in Datei ${path} "${search}" mit "${replace}"`);
  }

  async fileList(path: string): Promise<Task> {
    return this.createTask(`Liste alle Dateien in: ${path}`);
  }

  // Code Execution
  async executeCode(language: string, code: string): Promise<Task> {
    return this.createTask(`Führe diesen ${language} Code aus:\n\`\`\`${language}\n${code}\n\`\`\``);
  }

  async runNpm(command: string, cwd?: string): Promise<Task> {
    const dir = cwd ? ` im Verzeichnis ${cwd}` : '';
    return this.createTask(`Führe npm ${command}${dir} aus`);
  }

  // Git Operations
  async gitStatus(path?: string): Promise<Task> {
    const dir = path ? ` in ${path}` : '';
    return this.createTask(`Zeige git status${dir}`);
  }

  async gitDiff(path?: string): Promise<Task> {
    const dir = path ? ` in ${path}` : '';
    return this.createTask(`Zeige git diff${dir}`);
  }

  async gitLog(count?: number, path?: string): Promise<Task> {
    const n = count || 10;
    const dir = path ? ` in ${path}` : '';
    return this.createTask(`Zeige die letzten ${n} git commits${dir}`);
  }

  async gitAdd(files: string[]): Promise<Task> {
    return this.createTask(`Git add: ${files.join(', ')}`);
  }

  async gitCommit(message: string): Promise<Task> {
    return this.createTask(`Git commit mit Message: "${message}"`);
  }

  async gitPush(remote?: string, branch?: string): Promise<Task> {
    const r = remote || 'origin';
    const b = branch ? ` ${branch}` : '';
    return this.createTask(`Git push zu ${r}${b}`);
  }

  async gitPull(remote?: string, branch?: string): Promise<Task> {
    const r = remote || 'origin';
    const b = branch ? ` ${branch}` : '';
    return this.createTask(`Git pull von ${r}${b}`);
  }

  async gitBranch(name?: string): Promise<Task> {
    if (name) {
      return this.createTask(`Erstelle git branch: ${name}`);
    }
    return this.createTask('Liste alle git branches');
  }

  // Data Operations
  async parseCsv(content: string): Promise<Task> {
    return this.createTask(`Parse diese CSV Daten:\n${content}`);
  }

  async parseJson(content: string): Promise<Task> {
    return this.createTask(`Parse dieses JSON:\n${content}`);
  }

  async sqlQuery(query: string): Promise<Task> {
    return this.createTask(`Führe diese SQL Query aus: ${query}`);
  }

  async createTempTable(name: string, columns: string[]): Promise<Task> {
    return this.createTask(`Erstelle temporäre Tabelle ${name} mit Spalten: ${columns.join(', ')}`);
  }

  async listTables(): Promise<Task> {
    return this.createTask('Liste alle Datenbank-Tabellen');
  }

  async aggregateData(table: string, operation: string, column: string): Promise<Task> {
    return this.createTask(`Berechne ${operation} für Spalte ${column} in Tabelle ${table}`);
  }

  // Chart Operations
  async createBarChart(data: unknown[], title: string): Promise<Task> {
    return this.createTask(`Erstelle ein Balkendiagramm mit Titel "${title}" und diesen Daten: ${JSON.stringify(data)}`);
  }

  async createLineChart(data: unknown[], title: string): Promise<Task> {
    return this.createTask(`Erstelle ein Liniendiagramm mit Titel "${title}" und diesen Daten: ${JSON.stringify(data)}`);
  }

  async createPieChart(data: unknown[], title: string): Promise<Task> {
    return this.createTask(`Erstelle ein Kreisdiagramm mit Titel "${title}" und diesen Daten: ${JSON.stringify(data)}`);
  }

  async createScatterPlot(data: unknown[], title: string): Promise<Task> {
    return this.createTask(`Erstelle ein Streudiagramm mit Titel "${title}" und diesen Daten: ${JSON.stringify(data)}`);
  }

  async createHistogram(data: unknown[], title: string): Promise<Task> {
    return this.createTask(`Erstelle ein Histogramm mit Titel "${title}" und diesen Daten: ${JSON.stringify(data)}`);
  }

  // Web Search
  async webSearch(query: string): Promise<Task> {
    return this.createTask(`Suche im Internet nach: ${query}`);
  }

  // ============================================================
  // GITHUB OAUTH
  // ============================================================

  async githubGetAuthUrl(): Promise<{ authUrl: string }> {
    return this.request<{ authUrl: string }>('/api/github/auth');
  }

  async githubStatus(): Promise<{ connected: boolean; login?: string; avatar?: string }> {
    return this.request('/api/github/status');
  }

  async githubDisconnect(): Promise<{ success: boolean }> {
    return this.request('/api/github/disconnect', { method: 'POST' });
  }

  async githubRepos(params?: { sort?: string; per_page?: number; page?: number }): Promise<GitHubRepo[]> {
    const query = params ? new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.request<GitHubRepo[]>(`/api/github/repos${query ? '?' + query : ''}`);
  }

  async githubBranches(owner: string, repo: string): Promise<GitHubBranch[]> {
    return this.request<GitHubBranch[]>(`/api/github/repos/${owner}/${repo}/branches`);
  }

  async githubContents(owner: string, repo: string, path: string = '', ref?: string): Promise<GitHubContent | GitHubContent[]> {
    const params = new URLSearchParams();
    if (path) params.set('path', path);
    if (ref) params.set('ref', ref);
    const query = params.toString();
    return this.request(`/api/github/repos/${owner}/${repo}/contents${query ? '?' + query : ''}`);
  }

  async githubCommits(owner: string, repo: string, params?: { sha?: string; per_page?: number }): Promise<GitHubCommit[]> {
    const query = params ? new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.request<GitHubCommit[]>(`/api/github/repos/${owner}/${repo}/commits${query ? '?' + query : ''}`);
  }
}

// GitHub Types
export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  description: string;
  private: boolean;
  url: string;
  cloneUrl: string;
  defaultBranch: string;
  language: string;
  stars: number;
  forks: number;
  updatedAt: string;
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
  sha: string;
}

export interface GitHubContent {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  sha: string;
  content?: string;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export const api = new ApiClient();
export default api;
