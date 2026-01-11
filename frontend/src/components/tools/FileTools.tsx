'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { File, FolderOpen, Edit, Save, RefreshCw } from 'lucide-react';

export function FileTools() {
  const [path, setPath] = useState('');
  const [content, setContent] = useState('');
  const [search, setSearch] = useState('');
  const [replace, setReplace] = useState('');
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleRead = async () => {
    if (!path) return;
    setLoading(true);
    try {
      const res = await api.fileRead(path);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handleList = async () => {
    if (!path) return;
    setLoading(true);
    try {
      const res = await api.fileList(path);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handleWrite = async () => {
    if (!path || !content) return;
    setLoading(true);
    try {
      const res = await api.fileWrite(path, content);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handleEdit = async () => {
    if (!path || !search || !replace) return;
    setLoading(true);
    try {
      const res = await api.fileEdit(path, search, replace);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* Path Input */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <File className="w-5 h-5" />
          Datei-Operationen
        </h3>

        <div className="space-y-4">
          <Input
            data-testid="tools_input_path"
            placeholder="Dateipfad (z.B. /Users/user/file.txt)"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />

          <div className="flex gap-2 flex-wrap">
            <Button
              data-testid="tools_button_file_read"
              onClick={handleRead}
              loading={loading}
              variant="secondary"
            >
              <File className="w-4 h-4 mr-2" />
              Lesen
            </Button>

            <Button
              data-testid="tools_button_file_list"
              onClick={handleList}
              loading={loading}
              variant="secondary"
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Verzeichnis auflisten
            </Button>
          </div>
        </div>
      </Card>

      {/* Write File */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Save className="w-5 h-5" />
          Datei schreiben
        </h3>

        <div className="space-y-4">
          <textarea
            data-testid="tools_textarea_content"
            className="w-full h-32 p-3 border rounded-lg bg-white dark:bg-dark-800 border-dark-200 dark:border-dark-700 text-dark-900 dark:text-white"
            placeholder="Inhalt der Datei..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />

          <Button
            data-testid="tools_button_file_write"
            onClick={handleWrite}
            loading={loading}
            disabled={!path || !content}
          >
            <Save className="w-4 h-4 mr-2" />
            Datei schreiben
          </Button>
        </div>
      </Card>

      {/* Edit File */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Edit className="w-5 h-5" />
          Datei bearbeiten (Suchen & Ersetzen)
        </h3>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              data-testid="tools_input_search"
              placeholder="Suchen nach..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Input
              data-testid="tools_input_replace"
              placeholder="Ersetzen mit..."
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
            />
          </div>

          <Button
            data-testid="tools_button_file_edit"
            onClick={handleEdit}
            loading={loading}
            disabled={!path || !search || !replace}
            variant="secondary"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Ersetzen
          </Button>
        </div>
      </Card>

      {/* Result */}
      {result && (
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4">Ergebnis</h3>
          <pre
            data-testid="tools_result_file"
            className="p-4 bg-dark-100 dark:bg-dark-800 rounded-lg overflow-auto text-sm max-h-96"
          >
            {result}
          </pre>
        </Card>
      )}
    </div>
  );
}

export default FileTools;
