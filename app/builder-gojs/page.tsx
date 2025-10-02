'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import GoJSFlowsheetBuilder from '@/components/GoJSFlowsheetBuilder';
import GoJSUnitPalette from '@/components/GoJSUnitPalette';
import GoJSTest from '@/components/GoJSTest';
import SimpleFlowsheetBuilder from '@/components/SimpleFlowsheetBuilder';
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
  Home,
  Settings,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Info
} from 'lucide-react';

interface HistoryItem {
  id: string;
  prompt: string;
  timestamp: number;
  data: any;
}

export default function GoJSBuilderPage() {
  const router = useRouter();
  const flowsheetRef = useRef<any>(null);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [aspenInstructions, setAspenInstructions] = useState('');
  const [description, setDescription] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showPalette, setShowPalette] = useState(true);
  const [diagramData, setDiagramData] = useState<any>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [useSimpleBuilder, setUseSimpleBuilder] = useState(false);
  const [gojsError, setGojsError] = useState<string | null>(null);
  const [autoFallback, setAutoFallback] = useState(false);

  // Load history from localStorage on component mount
  React.useEffect(() => {
    const savedHistory = localStorage.getItem('gojs-flowsheet-history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (error) {
        console.error('Failed to load history:', error);
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  React.useEffect(() => {
    localStorage.setItem('gojs-flowsheet-history', JSON.stringify(history));
  }, [history]);

  const handleDiagramChange = useCallback((data: any) => {
    setDiagramData(data);
  }, []);

  // Auto-fallback to Simple Builder if GoJS fails
  React.useEffect(() => {
    if (gojsError && !autoFallback) {
      setAutoFallback(true);
      setUseSimpleBuilder(true);
    }
  }, [gojsError, autoFallback]);

  // Auto-fallback after 5 seconds if GoJS is still loading
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (!diagramData && !gojsError && !useSimpleBuilder) {
        console.warn('GoJS taking too long to load, switching to Simple Builder');
        setUseSimpleBuilder(true);
        setAutoFallback(true);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [diagramData, gojsError, useSimpleBuilder]);

  const handleUnitSelected = useCallback((unitType: string, unitData: any) => {
    if (flowsheetRef.current) {
      const newUnit = {
        key: `${unitType}_${Date.now()}`,
        category: unitData.category,
        text: unitData.text,
        pos: "200 200",
        fillLevel: unitData.fillLevel || "0.5",
        angle: unitData.angle || 0,
        isOn: true
      };
      flowsheetRef.current.addUnitOperation(newUnit);
    }
  }, []);

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

      const data = await response.json();

      // Convert React Flow data to GoJS format
      const gojsData = convertToGoJSFormat(data);
      
      // Set the diagram data state
      setDiagramData(gojsData);
      
      // Import the data into the GoJS diagram
      if (flowsheetRef.current) {
        flowsheetRef.current.importDiagram(gojsData);
      }

      setAspenInstructions(data.aspenInstructions);
      setDescription(data.description);

      // Add to history
      const historyItem: HistoryItem = {
        id: Date.now().toString(),
        prompt,
        timestamp: Date.now(),
        data: gojsData,
      };

      setHistory(prev => [historyItem, ...prev.slice(0, 49)]); // Keep last 50 items
      setSuccess('Flowsheet generated successfully!');
    } catch (error) {
      console.error('Error generating flowsheet:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate flowsheet');
    } finally {
      setIsLoading(false);
    }
  };

  const convertToGoJSFormat = (reactFlowData: any) => {
    console.log('Converting React Flow data to GoJS format:', reactFlowData);
    
    const nodes = reactFlowData.nodes.map((node: any, index: number) => ({
      key: node.id || `node_${index}`,
      text: node.data?.label || node.type || `Unit ${index + 1}`,
      loc: `${node.position?.x || 100 + index * 200} ${node.position?.y || 100}`,
      category: getNodeCategory(node.type),
      fillLevel: "0.5",
      angle: 0,
      isOn: true
    }));

    const links = reactFlowData.edges.map((edge: any, index: number) => ({
      from: edge.source,
      to: edge.target,
      text: edge.label || `Stream ${index + 1}`,
      stroke: "rgba(117, 147, 175, 0.5)"
    }));

    const gojsData = { nodes, links };
    console.log('Converted GoJS data:', gojsData);
    return gojsData;
  };

  const getNodeCategory = (type: string) => {
    const categoryMap: Record<string, string> = {
      reactor: "Tank",
      separator: "DistillationColumn",
      heat_exchanger: "Condenser",
      pump: "Pump",
      compressor: "Pump",
      valve: "Valve",
      mixer: "Tank",
      splitter: "Tank",
      distillation_column: "DistillationColumn",
      storage_tank: "Tank"
    };
    return categoryMap[type] || "Tank";
  };

  const loadFromHistory = (item: HistoryItem) => {
    if (flowsheetRef.current) {
      flowsheetRef.current.importDiagram(item.data);
    }
    setAspenInstructions(item.data.aspenInstructions || '');
    setDescription(item.data.description || '');
    setPrompt(item.prompt);
    setShowHistory(false);
    setSuccess('Flowsheet loaded from history');
  };

  const clearFlowsheet = () => {
    if (flowsheetRef.current) {
      flowsheetRef.current.clearDiagram();
    }
    setAspenInstructions('');
    setDescription('');
    setPrompt('');
    setError(null);
    setSuccess(null);
  };

  const downloadFlowsheet = () => {
    if (flowsheetRef.current) {
      const data = flowsheetRef.current.exportDiagram();
      if (data) {
        const exportData = {
          ...data,
          aspenInstructions,
          description,
          timestamp: new Date().toISOString(),
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gojs-flowsheet-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    }
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
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              GoJS Process Flow Builder
            </h1>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Layers className="w-4 h-4" />
              <span>Professional Process Diagrams</span>
            </div>
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="p-1 text-blue-600 hover:text-blue-800 transition-colors"
              title="About GoJS Integration"
            >
              <Info className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowTest(!showTest)}
              className="p-1 text-green-600 hover:text-green-800 transition-colors"
              title="Test GoJS Integration"
            >
              <Play className="w-4 h-4" />
            </button>
            <button
              onClick={() => setUseSimpleBuilder(!useSimpleBuilder)}
              className="p-1 text-orange-600 hover:text-orange-800 transition-colors"
              title="Switch to Simple Builder"
            >
              <Layers className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowPalette(!showPalette)}
              className="flex items-center space-x-2 px-4 py-2 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
            >
              <Layers className="w-4 h-4" />
              <span>{showPalette ? 'Hide' : 'Show'} Palette</span>
            </button>
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
              disabled={!diagramData}
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

        {/* Info Panel */}
        {showInfo && (
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
              GoJS Process Flow Integration
            </h3>
            <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <p>• Based on the official <a href="https://gojs.net/latest/samples/processFlow.html" target="_blank" rel="noopener noreferrer" className="underline">GoJS Process Flow sample</a></p>
              <p>• Professional unit operation blocks with graduated panels</p>
              <p>• Grid snapping and automatic layout algorithms</p>
              <p>• Context menus for editing and deletion</p>
              <p>• Drag & drop from palette to flowsheet</p>
              <p>• Export/import functionality with JSON format</p>
            </div>
          </div>
        )}

        {/* Test Panel */}
        {showTest && (
          <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">
              GoJS Integration Test
            </h3>
            <div className="text-sm text-green-800 dark:text-green-200 mb-3">
              <p>Testing GoJS functionality to ensure no runtime errors:</p>
            </div>
            <GoJSTest />
          </div>
        )}

        {/* Error Panel */}
        {gojsError && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <h3 className="font-semibold text-red-900 dark:text-red-100 mb-2">
              GoJS Error Detected
            </h3>
            <div className="text-sm text-red-800 dark:text-red-200 mb-3">
              <p>Error: {gojsError}</p>
              <p>Switching to Simple Builder as fallback...</p>
            </div>
            <button
              onClick={() => {
                setGojsError(null);
                setUseSimpleBuilder(true);
              }}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Use Simple Builder
            </button>
          </div>
        )}
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
        <div className="flex-1 flex">
          {/* Unit Palette */}
          {showPalette && (
            <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
              <GoJSUnitPalette onUnitSelected={handleUnitSelected} />
            </div>
          )}

          {/* Diagram Area */}
          <div className="flex-1 relative">
            {useSimpleBuilder ? (
              <SimpleFlowsheetBuilder ref={flowsheetRef} onDiagramChange={handleDiagramChange} initialData={diagramData} />
            ) : (
              <GoJSFlowsheetBuilder 
                ref={flowsheetRef} 
                onDiagramChange={handleDiagramChange} 
                initialData={diagramData}
                onError={(error: string) => setGojsError(error)}
              />
            )}
            <div className="absolute bottom-4 right-4 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 text-xs text-gray-600 dark:text-gray-300">
              <div>Builder: {useSimpleBuilder ? 'Simple' : 'GoJS'}</div>
              <div>Nodes: {diagramData?.nodes?.length || 0}</div>
              <div>Connections: {diagramData?.links?.length || diagramData?.connections?.length || 0}</div>
              {autoFallback && <div className="text-orange-600">Auto-fallback active</div>}
            </div>
          </div>
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
                        {item.data?.nodes?.length || 0} nodes, {item.data?.links?.length || 0} links
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