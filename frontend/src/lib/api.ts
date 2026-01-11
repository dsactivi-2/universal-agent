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
  PaginatedResponse
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

  async login(email: string, password: string): Promise<{ token: string }> {
    const result = await this.request<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
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

  async createTask(prompt: string, agentId?: string): Promise<Task> {
    return this.request<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ prompt, agentId })
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

  // ============================================================
  // AGENTS
  // ============================================================

  async listAgents(): Promise<{ id: string; name: string; description: string }[]> {
    return this.request('/api/agents');
  }
}

export const api = new ApiClient();
export default api;
