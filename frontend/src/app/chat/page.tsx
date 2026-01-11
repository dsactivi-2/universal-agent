'use client';

import { useState, useRef, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/stores/app-store';
import { useWebSocket } from '@/hooks/useWebSocket';
import { api } from '@/lib/api';
import { cn, generateId, formatRelativeTime } from '@/lib/utils';
import type { ChatMessage, ToolCall } from '@/types';
import { Send, Bot, User, Loader2, Code, Wrench } from 'lucide-react';

export default function ChatPage() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    chatMessages,
    addChatMessage,
    updateChatMessage,
    streamingText,
    setStreamingText,
    appendStreamingText,
    selectedAgent,
    setSelectedAgent
  } = useAppStore();

  // WebSocket for streaming
  const { isConnected, subscribeToTask } = useWebSocket({
    onStream: (taskId, text) => {
      appendStreamingText(text);
    },
    onTaskCompleted: (taskId, result) => {
      // Update the last assistant message
      const lastMessage = chatMessages.findLast((m) => m.role === 'assistant');
      if (lastMessage) {
        updateChatMessage(lastMessage.id, {
          content: result,
          isStreaming: false
        });
      }
      setStreamingText('');
      setIsLoading(false);
    },
    onTaskFailed: (taskId, error) => {
      addChatMessage({
        id: generateId(),
        role: 'assistant',
        content: `Error: ${error}`,
        timestamp: new Date().toISOString()
      });
      setStreamingText('');
      setIsLoading(false);
    },
    onToolCall: (taskId, toolCall) => {
      // Could show tool calls in UI
      console.log('Tool call:', toolCall);
    }
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, streamingText]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString()
    };

    addChatMessage(userMessage);
    setInput('');
    setIsLoading(true);

    try {
      // Create task via API
      const task = await api.createTask(input.trim(), selectedAgent);

      // Add placeholder assistant message
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        isStreaming: true
      };
      addChatMessage(assistantMessage);

      // Subscribe to task updates
      subscribeToTask(task.id);
    } catch (error) {
      addChatMessage({
        id: generateId(),
        role: 'assistant',
        content: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString()
      });
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const agents = [
    { id: 'coding', name: 'Coding Agent', icon: Code },
    { id: 'research', name: 'Research Agent', icon: Bot },
    { id: 'data', name: 'Data Agent', icon: Wrench }
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header title="Chat" subtitle="Talk to your AI agents" />

      <div className="flex-1 flex">
        {/* Agent Selector */}
        <div className="w-64 border-r border-dark-200 dark:border-dark-700 p-4">
          <h3 className="text-sm font-medium text-dark-500 dark:text-dark-400 mb-3">
            Select Agent
          </h3>
          <div className="space-y-2">
            {agents.map((agent) => {
              const Icon = agent.icon;
              return (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                    selectedAgent === agent.id
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                      : 'hover:bg-dark-100 dark:hover:bg-dark-800 text-dark-600 dark:text-dark-400'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{agent.name}</span>
                </button>
              );
            })}
          </div>

          {/* Connection Status */}
          <div className="mt-6 pt-4 border-t border-dark-200 dark:border-dark-700">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-2 h-2 rounded-full',
                  isConnected ? 'bg-green-500' : 'bg-red-500'
                )}
              />
              <span className="text-xs text-dark-500">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {chatMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Bot className="w-16 h-16 text-dark-300 dark:text-dark-600 mb-4" />
                <h3 className="text-lg font-medium text-dark-700 dark:text-dark-300">
                  Start a conversation
                </h3>
                <p className="text-sm text-dark-500 mt-1">
                  Send a message to the {agents.find((a) => a.id === selectedAgent)?.name}
                </p>
              </div>
            ) : (
              chatMessages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-3',
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}

                  <div
                    className={cn(
                      'chat-message',
                      message.role === 'user' ? 'user' : 'assistant'
                    )}
                  >
                    {message.isStreaming && streamingText ? (
                      <span>{streamingText}</span>
                    ) : (
                      <span className="whitespace-pre-wrap">{message.content}</span>
                    )}
                    {message.isStreaming && !streamingText && (
                      <Loader2 className="w-4 h-4 animate-spin inline ml-1" />
                    )}
                  </div>

                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-dark-200 dark:bg-dark-700 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-dark-600 dark:text-dark-400" />
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-dark-200 dark:border-dark-700 p-4">
            <form onSubmit={handleSubmit} className="flex gap-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                rows={1}
                className="flex-1 resize-none rounded-lg border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 px-4 py-3 text-dark-900 dark:text-white placeholder:text-dark-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
              <Button
                type="submit"
                disabled={!input.trim() || isLoading}
                loading={isLoading}
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
