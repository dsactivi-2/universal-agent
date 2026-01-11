'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { formatRelativeTime, getMemoryTypeIcon, truncate } from '@/lib/utils';
import type { Memory, MemorySearchResult } from '@/types';
import { Search, Trash2, Plus, Filter, Database } from 'lucide-react';

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [searchResults, setSearchResults] = useState<MemorySearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    loadMemories();
  }, [filterType]);

  async function loadMemories() {
    setLoading(true);
    try {
      const params: { type?: Memory['type']; limit: number } = { limit: 50 };
      if (filterType !== 'all') {
        params.type = filterType as Memory['type'];
      }
      const result = await api.listMemories(params);
      setMemories(result.items || []);
    } catch (error) {
      console.error('Failed to load memories:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const results = await api.searchMemory(searchQuery, { limit: 20 });
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this memory?')) return;

    try {
      await api.deleteMemory(id);
      setMemories(memories.filter((m) => m.id !== id));
    } catch (error) {
      console.error('Delete failed:', error);
    }
  }

  const memoryTypes = [
    { value: 'all', label: 'All' },
    { value: 'conversation', label: 'Conversations' },
    { value: 'task', label: 'Tasks' },
    { value: 'fact', label: 'Facts' },
    { value: 'code', label: 'Code' },
    { value: 'document', label: 'Documents' }
  ];

  const displayItems = searchQuery && searchResults.length > 0
    ? searchResults.map((r) => r.memory)
    : memories;

  return (
    <div className="min-h-screen">
      <Header title="Memory" subtitle="Agent knowledge and memories" />

      <div className="p-6 space-y-6">
        {/* Search and Filter */}
        <Card>
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 flex gap-2">
              <Input
                placeholder="Search memories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                icon={<Search className="w-4 h-4" />}
              />
              <Button onClick={handleSearch} loading={searching}>
                Search
              </Button>
            </div>

            {/* Type Filter */}
            <div className="flex gap-2 flex-wrap">
              {memoryTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setFilterType(type.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    filterType === type.value
                      ? 'bg-primary-500 text-white'
                      : 'bg-dark-100 dark:bg-dark-800 text-dark-600 dark:text-dark-400 hover:bg-dark-200 dark:hover:bg-dark-700'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-primary-500" />
              <div>
                <p className="text-2xl font-bold text-dark-900 dark:text-white">
                  {memories.length}
                </p>
                <p className="text-xs text-dark-500">Total Memories</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <span className="text-xl">💬</span>
              <div>
                <p className="text-2xl font-bold text-dark-900 dark:text-white">
                  {memories.filter((m) => m.type === 'conversation').length}
                </p>
                <p className="text-xs text-dark-500">Conversations</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <span className="text-xl">💻</span>
              <div>
                <p className="text-2xl font-bold text-dark-900 dark:text-white">
                  {memories.filter((m) => m.type === 'code').length}
                </p>
                <p className="text-xs text-dark-500">Code Snippets</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <span className="text-xl">📚</span>
              <div>
                <p className="text-2xl font-bold text-dark-900 dark:text-white">
                  {memories.filter((m) => m.type === 'fact').length}
                </p>
                <p className="text-xs text-dark-500">Facts</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Memory List */}
        <Card padding="none">
          <div className="divide-y divide-dark-200 dark:divide-dark-700">
            {loading ? (
              <div className="p-8 text-center text-dark-500">Loading memories...</div>
            ) : displayItems.length === 0 ? (
              <div className="p-8 text-center text-dark-500">
                {searchQuery ? 'No results found' : 'No memories yet'}
              </div>
            ) : (
              displayItems.map((memory) => (
                <div
                  key={memory.id}
                  className="p-4 hover:bg-dark-50 dark:hover:bg-dark-800/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className="text-xl flex-shrink-0">
                        {getMemoryTypeIcon(memory.type)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge>{memory.type}</Badge>
                          <span className="text-xs text-dark-500">
                            {formatRelativeTime(memory.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-dark-700 dark:text-dark-300 whitespace-pre-wrap">
                          {truncate(memory.content, 300)}
                        </p>
                        {memory.metadata && Object.keys(memory.metadata).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {Object.entries(memory.metadata).slice(0, 3).map(([key, value]) => (
                              <span
                                key={key}
                                className="text-xs px-2 py-0.5 rounded bg-dark-100 dark:bg-dark-700 text-dark-600 dark:text-dark-400"
                              >
                                {key}: {String(value).slice(0, 20)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(memory.id)}
                      className="p-2 text-dark-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
