'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { GitBranch, GitCommit, GitPullRequest, Upload, Download, History, FileText, Plus } from 'lucide-react';

export function GitTools() {
  const [repoPath, setRepoPath] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [files, setFiles] = useState('');
  const [branchName, setBranchName] = useState('');
  const [remote, setRemote] = useState('origin');
  const [branch, setBranch] = useState('');
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleStatus = async () => {
    setLoading(true);
    try {
      const res = await api.gitStatus(repoPath || undefined);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handleDiff = async () => {
    setLoading(true);
    try {
      const res = await api.gitDiff(repoPath || undefined);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handleLog = async () => {
    setLoading(true);
    try {
      const res = await api.gitLog(10, repoPath || undefined);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!files) return;
    setLoading(true);
    try {
      const fileList = files.split(',').map(f => f.trim());
      const res = await api.gitAdd(fileList);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handleCommit = async () => {
    if (!commitMessage) return;
    setLoading(true);
    try {
      const res = await api.gitCommit(commitMessage);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handlePush = async () => {
    setLoading(true);
    try {
      const res = await api.gitPush(remote, branch || undefined);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handlePull = async () => {
    setLoading(true);
    try {
      const res = await api.gitPull(remote, branch || undefined);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handleBranch = async () => {
    setLoading(true);
    try {
      const res = await api.gitBranch(branchName || undefined);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* Repository Path */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <GitBranch className="w-5 h-5" />
          Git Repository
        </h3>

        <div className="space-y-4">
          <Input
            data-testid="tools_input_repo_path"
            placeholder="Repository-Pfad (optional, nutzt aktuelles Verzeichnis)"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
          />

          <div className="flex gap-2 flex-wrap">
            <Button
              data-testid="tools_button_git_status"
              onClick={handleStatus}
              loading={loading}
              variant="secondary"
              size="sm"
            >
              <FileText className="w-4 h-4 mr-1" />
              Status
            </Button>
            <Button
              data-testid="tools_button_git_diff"
              onClick={handleDiff}
              loading={loading}
              variant="secondary"
              size="sm"
            >
              <GitPullRequest className="w-4 h-4 mr-1" />
              Diff
            </Button>
            <Button
              data-testid="tools_button_git_log"
              onClick={handleLog}
              loading={loading}
              variant="secondary"
              size="sm"
            >
              <History className="w-4 h-4 mr-1" />
              Log
            </Button>
          </div>
        </div>
      </Card>

      {/* Add & Commit */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <GitCommit className="w-5 h-5" />
          Add & Commit
        </h3>

        <div className="space-y-4">
          <Input
            data-testid="tools_input_git_files"
            placeholder="Dateien zum Hinzufügen (kommagetrennt, z.B. file1.ts, file2.ts oder .)"
            value={files}
            onChange={(e) => setFiles(e.target.value)}
          />

          <Button
            data-testid="tools_button_git_add"
            onClick={handleAdd}
            loading={loading}
            disabled={!files}
            variant="secondary"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-1" />
            Git Add
          </Button>

          <Input
            data-testid="tools_input_commit_message"
            placeholder="Commit-Nachricht"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
          />

          <Button
            data-testid="tools_button_git_commit"
            onClick={handleCommit}
            loading={loading}
            disabled={!commitMessage}
          >
            <GitCommit className="w-4 h-4 mr-2" />
            Commit
          </Button>
        </div>
      </Card>

      {/* Push & Pull */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Push & Pull
        </h3>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              data-testid="tools_input_git_remote"
              placeholder="Remote (default: origin)"
              value={remote}
              onChange={(e) => setRemote(e.target.value)}
            />
            <Input
              data-testid="tools_input_git_branch"
              placeholder="Branch (optional)"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              data-testid="tools_button_git_push"
              onClick={handlePush}
              loading={loading}
            >
              <Upload className="w-4 h-4 mr-2" />
              Push
            </Button>
            <Button
              data-testid="tools_button_git_pull"
              onClick={handlePull}
              loading={loading}
              variant="secondary"
            >
              <Download className="w-4 h-4 mr-2" />
              Pull
            </Button>
          </div>
        </div>
      </Card>

      {/* Branch */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <GitBranch className="w-5 h-5" />
          Branches
        </h3>

        <div className="space-y-4">
          <Input
            data-testid="tools_input_branch_name"
            placeholder="Neuer Branch-Name (leer lassen um alle anzuzeigen)"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
          />

          <Button
            data-testid="tools_button_git_branch"
            onClick={handleBranch}
            loading={loading}
            variant="secondary"
          >
            <GitBranch className="w-4 h-4 mr-2" />
            {branchName ? 'Branch erstellen' : 'Branches auflisten'}
          </Button>
        </div>
      </Card>

      {/* Result */}
      {result && (
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4">Ergebnis</h3>
          <pre
            data-testid="tools_result_git"
            className="p-4 bg-dark-100 dark:bg-dark-800 rounded-lg overflow-auto text-sm max-h-96 font-mono"
          >
            {result}
          </pre>
        </Card>
      )}
    </div>
  );
}

export default GitTools;
