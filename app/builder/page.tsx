'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FlowSheetData } from '../api/flowsheet/route';
import HYSYSFlowsheetEditor from '../../components/HYSYSFlowsheetEditor';
import { 
  Wand2, 
  Save, 
  History, 
  Download, 
  Trash2, 
  Play,
  Loader2,
  AlertCircle,
  CheckCircle,
  Home
} from 'lucide-react';

interface HistoryItem {
  id: string;
  prompt: string;
  timestamp: number;
  data: FlowSheetData;
}

export default function BuilderPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [aspenInstructions, setAspenInstructions] = useState('');
  const [description, setDescription] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [generatedNodes, setGeneratedNodes] = useState<any[]>([]);
  const [generatedEdges, setGeneratedEdges] = useState<any[]>([]);

  // Load history from localStorage on component mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('flowsheet-history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (error) {
        console.error('Failed to load history:', error);
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('flowsheet-history', JSON.stringify(history));
  }, [history]);

  // Connection handling is now managed by HYSYSFlowsheetEditor

  const generateFlowsheet = async () => {
    if (!prompt.trim()) {
      setError('Please enter a process description');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/flowsheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate flowsheet');
      }

      const data: FlowSheetData = await response.json();

      // Update the flow with new data
      setGeneratedNodes(data.nodes);
      setGeneratedEdges(data.edges);
      setAspenInstructions(data.aspenInstructions);
      setDescription(data.description);

      // Add to history
      const historyItem: HistoryItem = {
        id: Date.now().toString(),
        prompt,
        timestamp: Date.now(),
        data,
      };

      setHistory(prev => [historyItem, ...prev.slice(0, 49)]); // Keep last 50 items
      setSuccess('Flowsheet generated successfully! Use the equipment palette to build your flowsheet.');
    } catch (error) {
      console.error('Error generating flowsheet:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate flowsheet');
    } finally {
      setIsLoading(false);
    }
  };

  const loadFromHistory = (item: HistoryItem) => {
    setGeneratedNodes(item.data.nodes);
    setGeneratedEdges(item.data.edges);
    setAspenInstructions(item.data.aspenInstructions);
    setDescription(item.data.description);
    setPrompt(item.prompt);
    setShowHistory(false);
    setSuccess('Flowsheet loaded from history');
  };

  const clearFlowsheet = () => {
    setGeneratedNodes([]);
    setGeneratedEdges([]);
    setAspenInstructions('');
    setDescription('');
    setPrompt('');
    setError(null);
    setSuccess(null);
  };

  const downloadFlowsheet = () => {
    const data = {
      nodes: generatedNodes,
      edges: generatedEdges,
      aspenInstructions,
      description,
      prompt,
      timestamp: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flowsheet-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAspenInstructions = () => {
    const blob = new Blob([aspenInstructions], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aspen-instructions-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Process Flowsheet Builder
          </h1>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => router.push('/')}
              className="flex items-center space-x-2 px-4 py-2 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <History className="w-4 h-4" />
              <span>History</span>
            </button>
            <button
              onClick={downloadFlowsheet}
              disabled={generatedNodes.length === 0}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
            <button
              onClick={clearFlowsheet}
              className="flex items-center space-x-2 px-4 py-2 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          {/* Prompt Input */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Process Description
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your chemical process... (e.g., 'Create a distillation column to separate ethanol from water with a reboiler and condenser')"
              className="w-full h-32 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
            <button
              onClick={generateFlowsheet}
              disabled={isLoading || !prompt.trim()}
              className="w-full mt-3 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              <span>{isLoading ? 'Generating...' : 'Generate Flowsheet'}</span>
            </button>
          </div>

          {/* Status Messages */}
          {error && (
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          )}

          {success && (
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-2 text-green-600 dark:text-green-400">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm">{success}</span>
              </div>
            </div>
          )}

          {/* Description */}
          {description && (
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Process Description
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
            </div>
          )}

          {/* Aspen Instructions */}
          {aspenInstructions && (
            <div className="flex-1 p-4 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Aspen HYSYS Instructions
                </h3>
                <button
                  onClick={downloadAspenInstructions}
                  className="flex items-center space-x-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  <span>Download</span>
                </button>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono">
                  {aspenInstructions}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Main Flow Area */}
        <div className="flex-1 relative">
          <HYSYSFlowsheetEditor 
            generatedNodes={generatedNodes}
            generatedEdges={generatedEdges}
          />
        </div>
      </div>

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Flowsheet History
              </h2>
              <button
                onClick={() => setShowHistory(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>
            {history.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No flowsheets in history yet
              </p>
            ) : (
              <div className="space-y-2">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => loadFromHistory(item)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {item.prompt}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(item.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {item.data.nodes.length} nodes, {item.data.edges.length} edges
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
