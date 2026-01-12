'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { api, GitHubRepo, GitHubBranch, GitHubContent, GitHubCommit } from '@/lib/api';
import { useAppStore, type BackgroundTask } from '@/stores/app-store';
import toast from 'react-hot-toast';
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
  Code,
  Search,
  Bug,
  BookOpen,
  FileCode,
  MessageSquare,
  Sparkles,
  X,
  Loader2,
  Activity,
  CheckCircle2,
  XCircle
} from 'lucide-react';

type ActionType = 'analyze' | 'explain' | 'readme' | 'bugs' | 'chat' | 'guide-short' | 'guide-long';

export function GitHubTools() {
  const { language, addBackgroundTask, updateBackgroundTask, backgroundTasks } = useAppStore();
  const [connected, setConnected] = useState(false);
  const [githubUser, setGithubUser] = useState<{ login: string; avatar: string } | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [contents, setContents] = useState<GitHubContent[]>([]);
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<GitHubContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'files' | 'commits' | 'actions'>('files');

  // Action states
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [currentAction, setCurrentAction] = useState<ActionType | null>(null);

  const getLanguageName = () => {
    switch (language) {
      case 'de': return 'Deutsch';
      case 'en': return 'English';
      case 'bs': return 'Bosanski';
      default: return 'Deutsch';
    }
  };

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
    setSelectedFile(null);
    setActiveTab('files');
    setActionResult(null);

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
      setSelectedFile(null);

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
        setSelectedFile(item);
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
    setSelectedFile(null);

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
    setSelectedFile(null);
    setActionResult(null);
  };

  // Get action title for display
  const getActionTitle = (action: ActionType): string => {
    switch (action) {
      case 'analyze': return 'Repo Analyse';
      case 'explain': return 'Code Erklärung';
      case 'readme': return 'README generieren';
      case 'bugs': return 'Bugs finden';
      case 'chat': return 'Chat öffnen';
      case 'guide-short': return 'Kurze Anleitung';
      case 'guide-long': return 'Vollständige Anleitung';
    }
  };

  // Action handlers - now with background tasks
  const executeAction = async (action: ActionType) => {
    if (!selectedRepo) return;

    // Handle chat action separately (redirect)
    if (action === 'chat') {
      const filePath = selectedFile?.path;
      const fileCode = fileContent;

      localStorage.setItem('github_context', JSON.stringify({
        repo: selectedRepo.fullName,
        url: selectedRepo.url,
        file: filePath,
        code: fileCode
      }));

      window.location.href = '/chat';
      return;
    }

    const langName = getLanguageName();
    const repoUrl = selectedRepo.url;
    const repoName = selectedRepo.fullName;
    const filePath = selectedFile?.path;
    const fileCode = fileContent;

    let prompt = '';
    let taskDescription = '';

    switch (action) {
      case 'analyze':
        taskDescription = `Analysiere ${repoName}`;
        prompt = `Analysiere das GitHub Repository ${repoName} (${repoUrl}).
Gib eine strukturierte Übersicht über:
1. Projekttyp und Technologien
2. Ordnerstruktur
3. Hauptfunktionalitäten
4. Code-Qualität Einschätzung
5. Verbesserungsvorschläge

Antworte auf ${langName}.`;
        break;

      case 'explain':
        if (filePath && fileCode) {
          taskDescription = `Erkläre ${filePath}`;
          prompt = `Erkläre den folgenden Code aus ${repoName}/${filePath}:

\`\`\`
${fileCode}
\`\`\`

Erkläre:
1. Was macht dieser Code?
2. Wie funktioniert er?
3. Wichtige Funktionen/Klassen
4. Potentielle Verbesserungen

Antworte auf ${langName}.`;
        } else {
          taskDescription = `Erkläre ${repoName}`;
          prompt = `Erkläre das Repository ${repoName} (${repoUrl}).
Was ist der Zweck dieses Projekts und wie ist es aufgebaut?
Antworte auf ${langName}.`;
        }
        break;

      case 'readme':
        taskDescription = `README für ${repoName}`;
        prompt = `Erstelle eine professionelle README.md für das Repository ${repoName} (${repoUrl}).

Die README sollte enthalten:
1. Projektname und Beschreibung
2. Features
3. Installation
4. Verwendung
5. Konfiguration
6. API/Endpoints (falls relevant)
7. Lizenz

Formatiere als gültiges Markdown. Antworte auf ${langName}.`;
        break;

      case 'bugs':
        if (filePath && fileCode) {
          taskDescription = `Bugs in ${filePath}`;
          prompt = `Analysiere den folgenden Code aus ${repoName}/${filePath} auf Bugs und Probleme:

\`\`\`
${fileCode}
\`\`\`

Suche nach:
1. Bugs und Fehler
2. Sicherheitslücken
3. Performance-Probleme
4. Code Smells
5. Best Practice Verstöße

Gib konkrete Verbesserungsvorschläge. Antworte auf ${langName}.`;
        } else {
          taskDescription = `Bugs in ${repoName}`;
          prompt = `Analysiere das Repository ${repoName} (${repoUrl}) auf potentielle Bugs und Probleme.
Fokussiere auf häufige Fehlerquellen und Sicherheitsrisiken.
Antworte auf ${langName}.`;
        }
        break;

      case 'guide-short':
        taskDescription = `Kurze Anleitung für ${repoName}`;
        prompt = `Erstelle eine KURZE Benutzeranleitung für das Tool/Projekt ${repoName} (${repoUrl}).

Die Anleitung ist für ENDBENUTZER gedacht, nicht für Entwickler.
Halte sie einfach, verständlich und auf das Wesentliche fokussiert.

Format:
1. Was ist dieses Tool? (1-2 Sätze)
2. Wie starte ich es? (Schritte)
3. Grundfunktionen (Bullet Points)
4. Tipps (optional, max 3)

Maximal 1 Seite. Antworte auf ${langName}.`;
        break;

      case 'guide-long':
        taskDescription = `Vollständige Anleitung für ${repoName}`;
        prompt = `Erstelle eine VOLLSTÄNDIGE Benutzeranleitung für das Tool/Projekt ${repoName} (${repoUrl}).

Die Anleitung soll umfassend sein und alle Aspekte abdecken:

1. Einführung
   - Was ist dieses Tool?
   - Für wen ist es gedacht?
   - Hauptvorteile

2. Installation & Setup
   - Voraussetzungen
   - Schritt-für-Schritt Installation
   - Konfiguration

3. Erste Schritte
   - Grundlegende Bedienung
   - Wichtige Konzepte

4. Funktionen im Detail
   - Alle Features erklärt
   - Screenshots/Beispiele beschreiben

5. Erweiterte Nutzung
   - Fortgeschrittene Features
   - Tipps & Tricks

6. Fehlerbehebung
   - Häufige Probleme
   - Lösungen

7. FAQ

Formatiere als gut strukturiertes Dokument. Antworte auf ${langName}.`;
        break;
    }

    // Start the task in the background
    try {
      const task = await api.createTask(prompt, undefined, language);

      // Add to background tasks
      const bgTaskId = addBackgroundTask({
        title: getActionTitle(action),
        description: taskDescription,
        source: 'github',
        metadata: {
          taskId: task.id,
          action,
          repo: repoName,
          file: filePath
        }
      });

      toast.success(`Task gestartet: ${getActionTitle(action)}`, {
        duration: 3000,
        icon: '🚀'
      });

      // Also show result inline if we want
      setCurrentAction(action);
      setActionResult(null);
      setActiveTab('actions');

    } catch (e) {
      toast.error(`Fehler: ${e instanceof Error ? e.message : 'Unbekannter Fehler'}`);
    }
  };

  // Get running tasks for this repo
  const getRepoTasks = () => {
    return backgroundTasks.filter((t: BackgroundTask) =>
      t.source === 'github' && t.metadata?.repo === selectedRepo?.fullName
    );
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
          <div className="flex gap-2 flex-wrap">
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
            <Button
              data-testid="tools_tab_actions"
              onClick={() => setActiveTab('actions')}
              variant={activeTab === 'actions' ? 'primary' : 'secondary'}
              size="sm"
            >
              <Sparkles className="w-4 h-4 mr-1" />
              AI Aktionen
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
                      {selectedFile?.path || 'Datei-Inhalt'}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        data-testid="tools_button_explain_file"
                        onClick={() => executeAction('explain')}
                        variant="secondary"
                        size="sm"
                      >
                        <FileCode className="w-4 h-4 mr-1" />
                        Erklären
                      </Button>
                      <Button
                        data-testid="tools_button_bugs_file"
                        onClick={() => executeAction('bugs')}
                        variant="secondary"
                        size="sm"
                      >
                        <Bug className="w-4 h-4 mr-1" />
                        Bugs finden
                      </Button>
                      <Button
                        data-testid="tools_button_close_file"
                        onClick={() => { setFileContent(null); setSelectedFile(null); }}
                        variant="ghost"
                        size="sm"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
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

          {/* Actions Tab */}
          {activeTab === 'actions' && (
            <div className="space-y-4">
              {/* Running Tasks for this Repo */}
              {getRepoTasks().length > 0 && (
                <Card className="p-4">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-500" />
                    Laufende Tasks
                  </h3>
                  <div className="space-y-3">
                    {getRepoTasks().map((task: BackgroundTask) => (
                      <div
                        key={task.id}
                        className="p-3 rounded-lg border border-dark-200 dark:border-dark-700 bg-dark-50 dark:bg-dark-800/50"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {task.status === 'running' || task.status === 'pending' ? (
                              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                            ) : task.status === 'completed' ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500" />
                            )}
                            <span className="font-medium">{task.title}</span>
                          </div>
                          <Badge
                            variant={
                              task.status === 'completed' ? 'success' :
                              task.status === 'failed' ? 'error' :
                              task.status === 'running' ? 'info' : 'warning'
                            }
                          >
                            {task.status === 'pending' ? 'Wartend' :
                             task.status === 'running' ? 'Läuft' :
                             task.status === 'completed' ? 'Fertig' : 'Fehlgeschlagen'}
                          </Badge>
                        </div>
                        <p className="text-sm text-dark-500 mt-1">{task.description}</p>
                        {task.status === 'completed' && task.result && (
                          <div className="mt-3 p-3 bg-dark-100 dark:bg-dark-900 rounded-lg">
                            <pre className="whitespace-pre-wrap font-sans text-sm max-h-48 overflow-auto">
                              {task.result}
                            </pre>
                          </div>
                        )}
                        {task.status === 'failed' && task.error && (
                          <p className="mt-2 text-sm text-red-500">{task.error}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Action Buttons */}
              <Card className="p-4">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary-500" />
                  AI Aktionen für {selectedRepo.name}
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Button
                    data-testid="tools_action_analyze"
                    onClick={() => executeAction('analyze')}
                    variant="secondary"
                    className="flex-col h-24 text-center"
                  >
                    <Search className="w-6 h-6 mb-2" />
                    Repo analysieren
                  </Button>

                  <Button
                    data-testid="tools_action_explain"
                    onClick={() => executeAction('explain')}
                    variant="secondary"
                    className="flex-col h-24 text-center"
                  >
                    <FileCode className="w-6 h-6 mb-2" />
                    Code erklären
                  </Button>

                  <Button
                    data-testid="tools_action_readme"
                    onClick={() => executeAction('readme')}
                    variant="secondary"
                    className="flex-col h-24 text-center"
                  >
                    <BookOpen className="w-6 h-6 mb-2" />
                    README generieren
                  </Button>

                  <Button
                    data-testid="tools_action_bugs"
                    onClick={() => executeAction('bugs')}
                    variant="secondary"
                    className="flex-col h-24 text-center"
                  >
                    <Bug className="w-6 h-6 mb-2" />
                    Bugs finden
                  </Button>

                  <Button
                    data-testid="tools_action_chat"
                    onClick={() => executeAction('chat')}
                    variant="secondary"
                    className="flex-col h-24 text-center"
                  >
                    <MessageSquare className="w-6 h-6 mb-2" />
                    Im Chat öffnen
                  </Button>

                  <div className="col-span-2 md:col-span-1">
                    <p className="text-xs text-dark-500 mb-2 text-center">Anleitung erstellen</p>
                    <div className="flex gap-2">
                      <Button
                        data-testid="tools_action_guide_short"
                        onClick={() => executeAction('guide-short')}
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                      >
                        Kurz
                      </Button>
                      <Button
                        data-testid="tools_action_guide_long"
                        onClick={() => executeAction('guide-long')}
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                      >
                        Lang
                      </Button>
                    </div>
                  </div>
                </div>

                {selectedFile && (
                  <p className="mt-4 text-sm text-dark-500">
                    Ausgewählte Datei: <code className="bg-dark-100 dark:bg-dark-800 px-2 py-0.5 rounded">{selectedFile.path}</code>
                  </p>
                )}

                <p className="mt-2 text-xs text-dark-400">
                  Sprache: {getLanguageName()} (änderbar in Settings) • Tasks laufen im Hintergrund
                </p>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default GitHubTools;
