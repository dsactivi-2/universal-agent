// ============================================================
// GITHUB OAUTH & API INTEGRATION
// ============================================================

import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';

interface AuthenticatedRequest extends Request {
  userId?: string;
}

interface GitHubUser {
  id: number;
  login: string;
  name: string;
  avatar_url: string;
  email: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  private: boolean;
  html_url: string;
  clone_url: string;
  default_branch: string;
  language: string;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
}

// ============================================================
// GITHUB TOKEN STORAGE
// ============================================================

export class GitHubStorage {
  private db: Database.Database;

  constructor(dbPath: string = './data/github.db') {
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  private initDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS github_tokens (
        user_id TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        github_user_id INTEGER,
        github_login TEXT,
        github_name TEXT,
        github_avatar TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  saveToken(userId: string, accessToken: string, githubUser: GitHubUser): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT OR REPLACE INTO github_tokens
      (user_id, access_token, github_user_id, github_login, github_name, github_avatar, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM github_tokens WHERE user_id = ?), ?), ?)
    `).run(
      userId,
      accessToken,
      githubUser.id,
      githubUser.login,
      githubUser.name,
      githubUser.avatar_url,
      userId,
      now,
      now
    );
  }

  getToken(userId: string): { accessToken: string; githubLogin: string; githubAvatar: string } | null {
    const row = this.db.prepare('SELECT * FROM github_tokens WHERE user_id = ?').get(userId) as any;
    if (!row) return null;
    return {
      accessToken: row.access_token,
      githubLogin: row.github_login,
      githubAvatar: row.github_avatar
    };
  }

  deleteToken(userId: string): boolean {
    const result = this.db.prepare('DELETE FROM github_tokens WHERE user_id = ?').run(userId);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}

// ============================================================
// GITHUB API CLIENT
// ============================================================

async function githubFetch<T>(endpoint: string, token: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Universal-Agent',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<T>;
}

// ============================================================
// ROUTES
// ============================================================

export function createGitHubRoutes(storage: GitHubStorage): Router {
  const router = Router();

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const redirectUri = process.env.GITHUB_REDIRECT_URI || 'http://localhost:3001/api/github/callback';

  // ============================================================
  // OAUTH FLOW
  // ============================================================

  // Step 1: Redirect to GitHub
  router.get('/auth', (req: AuthenticatedRequest, res: Response) => {
    if (!clientId) {
      res.status(500).json({ error: 'GitHub OAuth not configured' });
      return;
    }

    const state = req.userId || 'anonymous';
    const scope = 'repo read:user user:email';

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;

    res.json({ authUrl });
  });

  // Step 2: Handle callback from GitHub
  router.get('/callback', async (req: Request, res: Response) => {
    const { code, state } = req.query;

    if (!code || !clientId || !clientSecret) {
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/tools?error=github_auth_failed`);
      return;
    }

    try {
      // Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri
        })
      });

      const tokenData = await tokenResponse.json() as { access_token?: string; error?: string };

      if (!tokenData.access_token) {
        throw new Error(tokenData.error || 'Failed to get access token');
      }

      // Get user info
      const githubUser = await githubFetch<GitHubUser>('/user', tokenData.access_token);

      // Save token
      const userId = state as string || 'default';
      storage.saveToken(userId, tokenData.access_token, githubUser);

      // Redirect back to frontend
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/tools?github=connected`);
    } catch (error) {
      console.error('GitHub OAuth error:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/tools?error=github_auth_failed`);
    }
  });

  // ============================================================
  // STATUS & DISCONNECT
  // ============================================================

  router.get('/status', (req: AuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const tokenData = storage.getToken(userId);

    if (!tokenData) {
      res.json({ connected: false });
      return;
    }

    res.json({
      connected: true,
      login: tokenData.githubLogin,
      avatar: tokenData.githubAvatar
    });
  });

  router.post('/disconnect', (req: AuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    storage.deleteToken(userId);
    res.json({ success: true });
  });

  // ============================================================
  // REPOS
  // ============================================================

  router.get('/repos', async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const tokenData = storage.getToken(userId);

    if (!tokenData) {
      res.status(401).json({ error: 'GitHub not connected' });
      return;
    }

    try {
      const { sort = 'updated', per_page = '30', page = '1' } = req.query;
      const repos = await githubFetch<GitHubRepo[]>(
        `/user/repos?sort=${sort}&per_page=${per_page}&page=${page}&affiliation=owner,collaborator`,
        tokenData.accessToken
      );

      res.json(repos.map(repo => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        private: repo.private,
        url: repo.html_url,
        cloneUrl: repo.clone_url,
        defaultBranch: repo.default_branch,
        language: repo.language,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        updatedAt: repo.updated_at
      })));
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to fetch repos'
      });
    }
  });

  // ============================================================
  // BRANCHES
  // ============================================================

  router.get('/repos/:owner/:repo/branches', async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const tokenData = storage.getToken(userId);

    if (!tokenData) {
      res.status(401).json({ error: 'GitHub not connected' });
      return;
    }

    try {
      const { owner, repo } = req.params;
      const branches = await githubFetch<any[]>(
        `/repos/${owner}/${repo}/branches`,
        tokenData.accessToken
      );

      res.json(branches.map(b => ({
        name: b.name,
        protected: b.protected,
        sha: b.commit.sha
      })));
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to fetch branches'
      });
    }
  });

  // ============================================================
  // FILES
  // ============================================================

  router.get('/repos/:owner/:repo/contents', async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const tokenData = storage.getToken(userId);

    if (!tokenData) {
      res.status(401).json({ error: 'GitHub not connected' });
      return;
    }

    try {
      const { owner, repo } = req.params;
      const path = (req.query.path as string) || '';
      const { ref } = req.query;

      let endpoint = `/repos/${owner}/${repo}/contents/${path}`;
      if (ref) endpoint += `?ref=${ref}`;

      const contents = await githubFetch<any>(endpoint, tokenData.accessToken);

      // Handle both file and directory responses
      if (Array.isArray(contents)) {
        res.json(contents.map(item => ({
          name: item.name,
          path: item.path,
          type: item.type,
          size: item.size,
          sha: item.sha
        })));
      } else {
        res.json({
          name: contents.name,
          path: contents.path,
          type: contents.type,
          size: contents.size,
          sha: contents.sha,
          content: contents.content ? Buffer.from(contents.content, 'base64').toString('utf-8') : null,
          encoding: contents.encoding
        });
      }
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to fetch contents'
      });
    }
  });

  // ============================================================
  // COMMITS
  // ============================================================

  router.get('/repos/:owner/:repo/commits', async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const tokenData = storage.getToken(userId);

    if (!tokenData) {
      res.status(401).json({ error: 'GitHub not connected' });
      return;
    }

    try {
      const { owner, repo } = req.params;
      const { sha, per_page = '30' } = req.query;

      let endpoint = `/repos/${owner}/${repo}/commits?per_page=${per_page}`;
      if (sha) endpoint += `&sha=${sha}`;

      const commits = await githubFetch<any[]>(endpoint, tokenData.accessToken);

      res.json(commits.map(c => ({
        sha: c.sha,
        message: c.commit.message,
        author: c.commit.author.name,
        date: c.commit.author.date,
        url: c.html_url
      })));
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to fetch commits'
      });
    }
  });

  return router;
}
