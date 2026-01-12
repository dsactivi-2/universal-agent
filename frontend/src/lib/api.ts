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
  // TOOLS - Direct tool execution endpoints
  // ============================================================

  // File Operations
  async fileRead(path: string): Promise<ToolResult & { content?: string; path?: string; size?: number }> {
    return this.request('/api/tools/file/read', {
      method: 'POST',
      body: JSON.stringify({ path })
    });
  }

  async fileWrite(path: string, content: string): Promise<ToolResult> {
    return this.request('/api/tools/file/write', {
      method: 'POST',
      body: JSON.stringify({ path, content })
    });
  }

  async fileEdit(path: string, search: string, replace: string): Promise<ToolResult> {
    return this.request('/api/tools/file/edit', {
      method: 'POST',
      body: JSON.stringify({ path, search, replace })
    });
  }

  async fileList(path: string): Promise<ToolResult & { files?: Array<{ name: string; path: string; isDirectory: boolean; size: number; modified: string }> }> {
    return this.request('/api/tools/file/list', {
      method: 'POST',
      body: JSON.stringify({ path })
    });
  }

  // Code Execution
  async executeCode(language: string, code: string): Promise<ToolResult & { result?: string; output?: string; exitCode?: number }> {
    return this.request('/api/tools/code/execute', {
      method: 'POST',
      body: JSON.stringify({ language, code })
    });
  }

  async runNpm(command: string, cwd?: string): Promise<ToolResult & { result?: string; output?: string; exitCode?: number }> {
    return this.request('/api/tools/npm/run', {
      method: 'POST',
      body: JSON.stringify({ command, cwd })
    });
  }

  // Git Operations
  async gitStatus(path?: string): Promise<ToolResult & { result?: string; branch?: string; staged?: string[]; unstaged?: string[]; untracked?: string[] }> {
    return this.request('/api/tools/git/status', {
      method: 'POST',
      body: JSON.stringify({ path })
    });
  }

  async gitDiff(path?: string): Promise<ToolResult & { result?: string }> {
    return this.request('/api/tools/git/diff', {
      method: 'POST',
      body: JSON.stringify({ path })
    });
  }

  async gitLog(count?: number, path?: string): Promise<ToolResult & { result?: string; commits?: Array<{ hash: string; author: string; date: string; message: string }> }> {
    return this.request('/api/tools/git/log', {
      method: 'POST',
      body: JSON.stringify({ count, path })
    });
  }

  async gitAdd(files: string[]): Promise<ToolResult & { result?: string }> {
    return this.request('/api/tools/git/add', {
      method: 'POST',
      body: JSON.stringify({ files })
    });
  }

  async gitCommit(message: string): Promise<ToolResult & { result?: string }> {
    return this.request('/api/tools/git/commit', {
      method: 'POST',
      body: JSON.stringify({ message })
    });
  }

  async gitPush(remote?: string, branch?: string): Promise<ToolResult & { result?: string }> {
    return this.request('/api/tools/git/push', {
      method: 'POST',
      body: JSON.stringify({ remote, branch })
    });
  }

  async gitPull(remote?: string, branch?: string): Promise<ToolResult & { result?: string }> {
    return this.request('/api/tools/git/pull', {
      method: 'POST',
      body: JSON.stringify({ remote, branch })
    });
  }

  async gitBranch(name?: string): Promise<ToolResult & { result?: string; branches?: string[] }> {
    return this.request('/api/tools/git/branch', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  }

  // Data Operations
  async parseCsv(content: string): Promise<ToolResult & { result?: string; data?: unknown[] }> {
    return this.request('/api/tools/data/parse-csv', {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  }

  async parseJson(content: string): Promise<ToolResult & { result?: string; data?: unknown }> {
    return this.request('/api/tools/data/parse-json', {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  }

  async sqlQuery(query: string): Promise<ToolResult & { result?: string; columns?: string[]; rows?: unknown[][] }> {
    return this.request('/api/tools/data/query', {
      method: 'POST',
      body: JSON.stringify({ query })
    });
  }

  async createTempTable(name: string, columns: string[]): Promise<ToolResult & { result?: string }> {
    return this.request('/api/tools/data/table/create', {
      method: 'POST',
      body: JSON.stringify({ name, columns })
    });
  }

  async listTables(): Promise<ToolResult & { result?: string; tables?: string[] }> {
    return this.request('/api/tools/data/tables', {
      method: 'GET'
    });
  }

  async aggregateData(table: string, operation: string, column: string): Promise<ToolResult & { result?: string }> {
    return this.request('/api/tools/data/query', {
      method: 'POST',
      body: JSON.stringify({ query: `SELECT ${operation}(${column}) FROM ${table}` })
    });
  }

  // Chart Operations
  async createChart(type: string, data: unknown[], options: { title?: string; xLabel?: string; yLabel?: string }): Promise<ToolResult & { result?: string; chartData?: unknown }> {
    return this.request('/api/tools/chart/create', {
      method: 'POST',
      body: JSON.stringify({ type, data, options })
    });
  }

  async createBarChart(data: unknown[], title: string): Promise<ToolResult & { result?: string; chartData?: unknown }> {
    return this.createChart('bar', data, { title });
  }

  async createLineChart(data: unknown[], title: string): Promise<ToolResult & { result?: string; chartData?: unknown }> {
    return this.createChart('line', data, { title });
  }

  async createPieChart(data: unknown[], title: string): Promise<ToolResult & { result?: string; chartData?: unknown }> {
    return this.createChart('pie', data, { title });
  }

  async createScatterPlot(data: unknown[], title: string): Promise<ToolResult & { result?: string; chartData?: unknown }> {
    return this.createChart('scatter', data, { title });
  }

  async createHistogram(data: unknown[], title: string): Promise<ToolResult & { result?: string; chartData?: unknown }> {
    return this.createChart('histogram', data, { title });
  }

  // Web Search (still via AI agent as it requires external API)
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
