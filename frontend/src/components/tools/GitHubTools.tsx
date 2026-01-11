'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { api, GitHubRepo, GitHubBranch, GitHubContent, GitHubCommit } from '@/lib/api';
import {
  Github,
  GitBranch,
  GitCommit,
  Folder,
  FileText,
  Star,
  GitFork,
  ExternalLink,
  LogOut,
  Lock,
  Globe,
  RefreshCw,
  ChevronRight,
  ArrowLeft,
  Code
} from 'lucide-react';

export function GitHubTools() {
  const [connected, setConnected] = useState(false);
  const [githubUser, setGithubUser] = useState<{ login: string; avatar: string } | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [contents, setContents] = useState<GitHubContent[]>([]);
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'files' | 'commits'>('files');

  useEffect(() => {
    checkGitHubStatus();
  }, []);

  const checkGitHubStatus = async () => {
    try {
      const status = await api.githubStatus();
      setConnected(status.connected);
      if (status.connected && status.login) {
        setGithubUser({ login: status.login, avatar: status.avatar || '' });
        loadRepos();
      }
    } catch (e) {
      console.error('GitHub status check failed:', e);
    }
  };

  const handleConnect = async () => {
    try {
      setLoading(true);
      const { authUrl } = await api.githubGetAuthUrl();
      window.location.href = authUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verbindung fehlgeschlagen');
    }
    setLoading(false);
  };

  const handleDisconnect = async () => {
    try {
      setLoading(true);
      await api.githubDisconnect();
      setConnected(false);
      setGithubUser(null);
      setRepos([]);
      setSelectedRepo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Trennen fehlgeschlagen');
    }
    setLoading(false);
  };

  const loadRepos = async () => {
    try {
      setLoading(true);
      const repoList = await api.githubRepos({ sort: 'updated', per_page: 50 });
      setRepos(repoList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Repos laden fehlgeschlagen');
    }
    setLoading(false);
  };

  const selectRepo = async (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setCurrentPath([]);
    setFileContent(null);
    setActiveTab('files');

    try {
      setLoading(true);
      const [owner, repoName] = repo.fullName.split('/');

      const [branchList, contentList, commitList] = await Promise.all([
        api.githubBranches(owner, repoName),
        api.githubContents(owner, repoName, ''),
        api.githubCommits(owner, repoName, { per_page: 10 })
      ]);

      setBranches(branchList);
      setContents(Array.isArray(contentList) ? contentList : [contentList]);
      setCommits(commitList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Repo-Details laden fehlgeschlagen');
    }
    setLoading(false);
  };

  const navigateTo = async (item: GitHubContent) => {
    if (!selectedRepo) return;
    const [owner, repoName] = selectedRepo.fullName.split('/');

    if (item.type === 'dir') {
      setCurrentPath([...currentPath, item.name]);
      setFileContent(null);

      try {
        setLoading(true);
        const contentList = await api.githubContents(owner, repoName, item.path);
        setContents(Array.isArray(contentList) ? contentList : [contentList]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ordner laden fehlgeschlagen');
      }
      setLoading(false);
    } else {
      try {
        setLoading(true);
        const content = await api.githubContents(owner, repoName, item.path) as GitHubContent;
        setFileContent(content.content || 'Keine Vorschau verfügbar');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Datei laden fehlgeschlagen');
      }
      setLoading(false);
    }
  };

  const goBack = async () => {
    if (!selectedRepo) return;
    const [owner, repoName] = selectedRepo.fullName.split('/');

    const newPath = currentPath.slice(0, -1);
    setCurrentPath(newPath);
    setFileContent(null);

    try {
      setLoading(true);
      const path = newPath.join('/');
      const contentList = await api.githubContents(owner, repoName, path);
      setContents(Array.isArray(contentList) ? contentList : [contentList]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Navigation fehlgeschlagen');
    }
    setLoading(false);
  };

  const backToRepos = () => {
    setSelectedRepo(null);
    setBranches([]);
    setContents([]);
    setCommits([]);
    setCurrentPath([]);
    setFileContent(null);
  };

  // Not connected
  if (!connected) {
    return (
      <div className="space-y-6">
        <Card className="p-8 text-center">
          <Github className="w-16 h-16 mx-auto mb-4 text-dark-400" />
          <h3 className="text-xl font-semibold mb-2">Mit GitHub verbinden</h3>
          <p className="text-dark-500 mb-6">
            Verbinde dein GitHub-Konto um deine Repositories direkt zu sehen und zu verwalten.
          </p>
          <Button
            data-testid="tools_button_github_connect"
            onClick={handleConnect}
            loading={loading}
            size="lg"
          >
            <Github className="w-5 h-5 mr-2" />
            Mit GitHub verbinden
          </Button>
          {error && (
            <p className="mt-4 text-red-500">{error}</p>
          )}
        </Card>
      </div>
    );
  }

  // Connected - show repos or repo details
  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {githubUser?.avatar && (
              <img
                src={githubUser.avatar}
                alt={githubUser.login}
                className="w-10 h-10 rounded-full"
              />
            )}
            <div>
              <p className="font-semibold flex items-center gap-2">
                <Github className="w-4 h-4" />
                {githubUser?.login}
              </p>
              <p className="text-sm text-dark-500">
                {repos.length} Repositories
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              data-testid="tools_button_github_refresh"
              onClick={loadRepos}
              loading={loading}
              variant="secondary"
              size="sm"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              data-testid="tools_button_github_disconnect"
              onClick={handleDisconnect}
              loading={loading}
              variant="ghost"
              size="sm"
            >
              <LogOut className="w-4 h-4 mr-1" />
              Trennen
            </Button>
          </div>
        </div>
      </Card>

      {error && (
        <Card className="p-4 border-red-500 bg-red-50 dark:bg-red-900/20">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </Card>
      )}

      {/* Repo List or Repo Details */}
      {!selectedRepo ? (
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4">Deine Repositories</h3>

          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {repos.map((repo) => (
              <button
                key={repo.id}
                data-testid={`tools_repo_${repo.name}`}
                onClick={() => selectRepo(repo)}
                className="w-full text-left p-4 rounded-lg border border-dark-200 dark:border-dark-700 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {repo.private ? (
                        <Lock className="w-4 h-4 text-dark-400" />
                      ) : (
                        <Globe className="w-4 h-4 text-dark-400" />
                      )}
                      <span className="font-medium">{repo.name}</span>
                      {repo.language && (
                        <span className="text-xs px-2 py-0.5 rounded bg-dark-100 dark:bg-dark-800 text-dark-600 dark:text-dark-400">
                          {repo.language}
                        </span>
                      )}
                    </div>
                    {repo.description && (
                      <p className="text-sm text-dark-500 mt-1 line-clamp-2">
                        {repo.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-sm text-dark-400">
                      <span className="flex items-center gap-1">
                        <Star className="w-4 h-4" />
                        {repo.stars}
                      </span>
                      <span className="flex items-center gap-1">
                        <GitFork className="w-4 h-4" />
                        {repo.forks}
                      </span>
                      <span>
                        Aktualisiert: {new Date(repo.updatedAt).toLocaleDateString('de')}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-dark-400" />
                </div>
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <>
          {/* Repo Header */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  data-testid="tools_button_back_to_repos"
                  onClick={backToRepos}
                  variant="ghost"
                  size="sm"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Zurück
                </Button>
                <div>
                  <h3 className="font-semibold flex items-center gap-2">
                    {selectedRepo.private ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                    {selectedRepo.fullName}
                  </h3>
                  <p className="text-sm text-dark-500">{selectedRepo.description}</p>
                </div>
              </div>
              <a
                href={selectedRepo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary-500 hover:underline"
              >
                <ExternalLink className="w-4 h-4" />
                Auf GitHub öffnen
              </a>
            </div>

            {/* Branches */}
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <GitBranch className="w-4 h-4 text-dark-400" />
              <span className="text-sm text-dark-500">Branches:</span>
              {branches.slice(0, 10).map((branch) => (
                <span
                  key={branch.name}
                  className="text-xs px-2 py-0.5 rounded bg-dark-100 dark:bg-dark-800"
                >
                  {branch.name}
                </span>
              ))}
              {branches.length > 10 && (
                <span className="text-xs text-dark-400">+{branches.length - 10} mehr</span>
              )}
            </div>
          </Card>

          {/* Tab Navigation */}
          <div className="flex gap-2">
            <Button
              data-testid="tools_tab_files"
              onClick={() => setActiveTab('files')}
              variant={activeTab === 'files' ? 'primary' : 'secondary'}
              size="sm"
            >
              <Folder className="w-4 h-4 mr-1" />
              Dateien
            </Button>
            <Button
              data-testid="tools_tab_commits"
              onClick={() => setActiveTab('commits')}
              variant={activeTab === 'commits' ? 'primary' : 'secondary'}
              size="sm"
            >
              <GitCommit className="w-4 h-4 mr-1" />
              Commits
            </Button>
          </div>

          {/* Files Tab */}
          {activeTab === 'files' && (
            <Card className="p-4">
              {/* Breadcrumb */}
              {currentPath.length > 0 && (
                <div className="flex items-center gap-2 mb-4 text-sm">
                  <Button
                    data-testid="tools_button_go_back"
                    onClick={goBack}
                    variant="ghost"
                    size="sm"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-dark-500">/</span>
                  {currentPath.map((part, i) => (
                    <span key={i} className="flex items-center gap-2">
                      <span>{part}</span>
                      {i < currentPath.length - 1 && <span className="text-dark-500">/</span>}
                    </span>
                  ))}
                </div>
              )}

              {/* File/Folder List */}
              {!fileContent ? (
                <div className="space-y-1 max-h-[400px] overflow-y-auto">
                  {contents
                    .sort((a, b) => {
                      if (a.type === b.type) return a.name.localeCompare(b.name);
                      return a.type === 'dir' ? -1 : 1;
                    })
                    .map((item) => (
                      <button
                        key={item.sha}
                        data-testid={`tools_file_${item.name}`}
                        onClick={() => navigateTo(item)}
                        className="w-full text-left p-2 rounded hover:bg-dark-100 dark:hover:bg-dark-800 flex items-center gap-2"
                      >
                        {item.type === 'dir' ? (
                          <Folder className="w-4 h-4 text-blue-500" />
                        ) : (
                          <FileText className="w-4 h-4 text-dark-400" />
                        )}
                        <span>{item.name}</span>
                        {item.type === 'file' && (
                          <span className="text-xs text-dark-400 ml-auto">
                            {item.size > 1024 ? `${(item.size / 1024).toFixed(1)} KB` : `${item.size} B`}
                          </span>
                        )}
                      </button>
                    ))}
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-dark-500 flex items-center gap-2">
                      <Code className="w-4 h-4" />
                      Datei-Inhalt
                    </span>
                    <Button
                      data-testid="tools_button_close_file"
                      onClick={() => setFileContent(null)}
                      variant="ghost"
                      size="sm"
                    >
                      Schließen
                    </Button>
                  </div>
                  <pre
                    data-testid="tools_file_content"
                    className="p-4 bg-dark-100 dark:bg-dark-900 rounded-lg overflow-auto text-sm max-h-[400px] font-mono"
                  >
                    {fileContent}
                  </pre>
                </div>
              )}
            </Card>
          )}

          {/* Commits Tab */}
          {activeTab === 'commits' && (
            <Card className="p-4">
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {commits.map((commit) => (
                  <div
                    key={commit.sha}
                    className="p-3 rounded-lg border border-dark-200 dark:border-dark-700"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium line-clamp-2">{commit.message}</p>
                        <p className="text-sm text-dark-500 mt-1">
                          {commit.author} - {new Date(commit.date).toLocaleString('de')}
                        </p>
                      </div>
                      <a
                        href={commit.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-primary-500 hover:underline"
                      >
                        {commit.sha.substring(0, 7)}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default GitHubTools;
