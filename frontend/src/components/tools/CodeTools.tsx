'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { Code, Play, Package, Terminal } from 'lucide-react';

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'bash', label: 'Bash' }
];

export function CodeTools() {
  const [language, setLanguage] = useState('javascript');
  const [code, setCode] = useState('');
  const [npmCommand, setNpmCommand] = useState('');
  const [npmCwd, setNpmCwd] = useState('');
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleExecute = async () => {
    if (!code) return;
    setLoading(true);
    try {
      const res = await api.executeCode(language, code);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const handleNpm = async () => {
    if (!npmCommand) return;
    setLoading(true);
    try {
      const res = await api.runNpm(npmCommand, npmCwd || undefined);
      setResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* Code Execution */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Code className="w-5 h-5" />
          Code ausführen
        </h3>

        <div className="space-y-4">
          <div className="flex gap-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.value}
                data-testid={`tools_button_lang_${lang.value}`}
                onClick={() => setLanguage(lang.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  language === lang.value
                    ? 'bg-primary-500 text-white'
                    : 'bg-dark-100 dark:bg-dark-800 text-dark-700 dark:text-dark-300 hover:bg-dark-200 dark:hover:bg-dark-700'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>

          <textarea
            data-testid="tools_textarea_code"
            className="w-full h-48 p-3 font-mono text-sm border rounded-lg bg-white dark:bg-dark-800 border-dark-200 dark:border-dark-700 text-dark-900 dark:text-white"
            placeholder={`// Schreibe deinen ${language} Code hier...`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />

          <Button
            data-testid="tools_button_execute_code"
            onClick={handleExecute}
            loading={loading}
            disabled={!code}
          >
            <Play className="w-4 h-4 mr-2" />
            Code ausführen
          </Button>
        </div>
      </Card>

      {/* NPM Commands */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Package className="w-5 h-5" />
          NPM Befehle
        </h3>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              data-testid="tools_input_npm_command"
              placeholder="NPM Befehl (z.B. install, run build)"
              value={npmCommand}
              onChange={(e) => setNpmCommand(e.target.value)}
            />
            <Input
              data-testid="tools_input_npm_cwd"
              placeholder="Arbeitsverzeichnis (optional)"
              value={npmCwd}
              onChange={(e) => setNpmCwd(e.target.value)}
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              data-testid="tools_button_npm_install"
              onClick={() => {
                setNpmCommand('install');
                handleNpm();
              }}
              variant="secondary"
              size="sm"
            >
              <Terminal className="w-4 h-4 mr-1" />
              npm install
            </Button>
            <Button
              data-testid="tools_button_npm_build"
              onClick={() => {
                setNpmCommand('run build');
                handleNpm();
              }}
              variant="secondary"
              size="sm"
            >
              <Terminal className="w-4 h-4 mr-1" />
              npm run build
            </Button>
            <Button
              data-testid="tools_button_npm_test"
              onClick={() => {
                setNpmCommand('test');
                handleNpm();
              }}
              variant="secondary"
              size="sm"
            >
              <Terminal className="w-4 h-4 mr-1" />
              npm test
            </Button>
          </div>

          <Button
            data-testid="tools_button_npm_run"
            onClick={handleNpm}
            loading={loading}
            disabled={!npmCommand}
          >
            <Terminal className="w-4 h-4 mr-2" />
            Ausführen
          </Button>
        </div>
      </Card>

      {/* Result */}
      {result && (
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4">Ausgabe</h3>
          <pre
            data-testid="tools_result_code"
            className="p-4 bg-dark-900 text-green-400 rounded-lg overflow-auto text-sm max-h-96 font-mono"
          >
            {result}
          </pre>
        </Card>
      )}
    </div>
  );
}

export default CodeTools;
