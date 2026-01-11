'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { FileTools, CodeTools, GitTools, DataTools, ChartTools } from '@/components/tools';
import {
  File,
  Code,
  GitBranch,
  Database,
  BarChart3,
  Search,
  Wrench
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';

const TABS = [
  { id: 'file', label: 'Dateien', icon: File },
  { id: 'code', label: 'Code', icon: Code },
  { id: 'git', label: 'Git', icon: GitBranch },
  { id: 'data', label: 'Daten', icon: Database },
  { id: 'chart', label: 'Diagramme', icon: BarChart3 }
];

export default function ToolsPage() {
  const [activeTab, setActiveTab] = useState('file');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState('');
  const [loading, setLoading] = useState(false);

  const handleWebSearch = async () => {
    if (!searchQuery) return;
    setLoading(true);
    try {
      const res = await api.webSearch(searchQuery);
      setSearchResult(res.result || res.error || 'Keine Antwort');
    } catch (e) {
      setSearchResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    setLoading(false);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'file':
        return <FileTools />;
      case 'code':
        return <CodeTools />;
      case 'git':
        return <GitTools />;
      case 'data':
        return <DataTools />;
      case 'chart':
        return <ChartTools />;
      default:
        return <FileTools />;
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1
          data-testid="tools_page_title"
          className="text-3xl font-bold text-dark-900 dark:text-white flex items-center gap-3"
        >
          <Wrench className="w-8 h-8 text-primary-500" />
          Tools
        </h1>
        <p className="text-dark-600 dark:text-dark-400 mt-2">
          Nutze die verschiedenen Tools des Universal Agent direkt.
        </p>
      </div>

      {/* Web Search */}
      <Card className="p-4 mb-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Search className="w-5 h-5" />
          Web-Suche
        </h3>

        <div className="flex gap-4">
          <Input
            data-testid="tools_input_web_search"
            placeholder="Im Internet suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleWebSearch()}
          />
          <Button
            data-testid="tools_button_web_search"
            onClick={handleWebSearch}
            loading={loading}
            disabled={!searchQuery}
          >
            <Search className="w-4 h-4 mr-2" />
            Suchen
          </Button>
        </div>

        {searchResult && (
          <pre
            data-testid="tools_result_search"
            className="mt-4 p-4 bg-dark-100 dark:bg-dark-800 rounded-lg overflow-auto text-sm max-h-48"
          >
            {searchResult}
          </pre>
        )}
      </Card>

      {/* Tab Navigation */}
      <div className="mb-6">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                data-testid={`tools_tab_${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors whitespace-nowrap',
                  activeTab === tab.id
                    ? 'bg-primary-500 text-white'
                    : 'bg-white dark:bg-dark-800 text-dark-700 dark:text-dark-300 hover:bg-dark-100 dark:hover:bg-dark-700 border border-dark-200 dark:border-dark-700'
                )}
              >
                <Icon className="w-5 h-5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div data-testid="tools_content">{renderContent()}</div>
    </div>
  );
}
