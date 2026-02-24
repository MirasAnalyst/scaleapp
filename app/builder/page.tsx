'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Node, Edge } from 'reactflow';
import { FlowSheetData } from '../api/flowsheet/route';
import HYSYSFlowsheetEditor from '../../components/HYSYSFlowsheetEditor';
import StreamPropertyPanel from '../../components/StreamPropertyPanel';
import EquipmentPropertySheet from '../../components/EquipmentPropertySheet';
import FeedStreamEditor from '../../components/FeedStreamEditor';
import ResultsWorkbook from '../../components/ResultsWorkbook';
import CompoundPicker from '../../components/CompoundPicker';
import PropertyPackageSelector from '../../components/PropertyPackageSelector';
import {
  buildSimulationPayload,
  SimulationResult,
  SimulationStreamResult,
  SimulationUnitResult,
} from '../../lib/simulation';
import { normalizeFlowsheetHandles } from '../../lib/flowsheet/handleNormalization';
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
  const [dwsimInstructions, setDwsimInstructions] = useState('');
  const [description, setDescription] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [generatedNodes, setGeneratedNodes] = useState<any[]>([]);
  const [generatedEdges, setGeneratedEdges] = useState<any[]>([]);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Thermodynamic config
  const [components, setComponents] = useState<string[]>([]);
  const [propertyPackage, setPropertyPackage] = useState('Peng-Robinson');

  // Panel state
  const [selectedStream, setSelectedStream] = useState<SimulationStreamResult | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedFeedEdge, setSelectedFeedEdge] = useState<Edge | null>(null);
  const [showWorkbook, setShowWorkbook] = useState(false);

  // Backend health status
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        setBackendOnline(data.status === 'ok');
      } catch {
        setBackendOnline(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

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

  const runSimulation = async (flowsheet: FlowSheetData) => {
    setIsSimulating(true);
    setSimulationError(null);
    try {
      // Use thermo config from AI response, or from user-selected values
      const thermoComponents = flowsheet.thermo?.components ?? components;
      const thermoPkg = flowsheet.thermo?.package ?? propertyPackage;

      // Auto-populate picker state from AI-generated config
      if (flowsheet.thermo?.components && flowsheet.thermo.components.length > 0) {
        setComponents(flowsheet.thermo.components);
      }
      if (flowsheet.thermo?.package) {
        setPropertyPackage(flowsheet.thermo.package);
      }

      const payload = buildSimulationPayload(
        flowsheet.description || flowsheet?.nodes?.[0]?.data?.label || 'generated-flowsheet',
        flowsheet.nodes,
        flowsheet.edges,
        thermoComponents,
        thermoPkg,
      );

      const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Simulation run failed');
      }

      const data: SimulationResult = await response.json();
      setSimulationResult(data);
      setShowWorkbook(true);
    } catch (err) {
      console.error('Simulation error', err);
      setSimulationError(err instanceof Error ? err.message : 'Simulation run failed');
      setSimulationResult(null);
      throw err; // Re-throw so callers can detect failure
    } finally {
      setIsSimulating(false);
    }
  };

  // Click handlers for canvas
  const handleNodeClick = useCallback(
    (node: Node) => {
      setSelectedStream(null); // close stream panel if open
      const unitResult = simulationResult?.units.find((u) => u.id === node.id) ?? null;
      setSelectedNode(node);
    },
    [simulationResult]
  );

  const handleEdgeClick = useCallback(
    (edge: Edge) => {
      setSelectedNode(null); // close equipment panel if open
      // Detect feed edge: source is null/undefined or not in equipment nodes
      const nodeIds = new Set(generatedNodes.map((n: any) => n.id));
      const isFeedEdge = !edge.source || !nodeIds.has(edge.source);
      if (isFeedEdge) {
        setSelectedStream(null);
        setSelectedFeedEdge(edge);
      } else {
        setSelectedFeedEdge(null);
        const streamData = simulationResult?.streams.find((s) => s.id === edge.id) ?? null;
        setSelectedStream(streamData);
      }
    },
    [simulationResult, generatedNodes]
  );

  const handleParameterChange = useCallback(
    (nodeId: string, params: Record<string, unknown>) => {
      setGeneratedNodes((prev: any[]) =>
        prev.map((n: any) =>
          n.id === nodeId ? { ...n, data: { ...n.data, parameters: params } } : n
        )
      );
    },
    []
  );

  const handleFeedApply = useCallback(
    (edgeId: string, properties: Record<string, unknown>) => {
      // Update edge data with new feed properties and re-simulate
      setGeneratedEdges((prev: any[]) =>
        prev.map((e: any) =>
          e.id === edgeId
            ? { ...e, data: { ...e.data, properties: { ...(e.data?.properties ?? {}), ...properties } } }
            : e
        )
      );
      setSelectedFeedEdge(null);
      // Trigger re-simulation after state update
      setTimeout(() => {
        runSimulation({
          nodes: generatedNodes,
          edges: generatedEdges.map((e: any) =>
            e.id === edgeId
              ? { ...e, data: { ...e.data, properties: { ...(e.data?.properties ?? {}), ...properties } } }
              : e
          ),
          description,
          dwsimInstructions,
        });
      }, 0);
    },
    [generatedNodes, generatedEdges, description, dwsimInstructions]
  );

  const handleRunSimulation = useCallback(() => {
    if (generatedNodes.length === 0) return;
    runSimulation({
      nodes: generatedNodes,
      edges: generatedEdges,
      description,
      dwsimInstructions,
    });
  }, [generatedNodes, generatedEdges, description, dwsimInstructions]);

  const generateFlowsheet = async () => {
    if (!prompt.trim()) {
      setError('Please enter a process description');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setSimulationResult(null);
    setSimulationError(null);

    try {
      const response = await fetch('/api/flowsheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, components, propertyPackage }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate flowsheet');
      }

      const rawData: FlowSheetData = await response.json();
      const data = normalizeFlowsheetHandles(rawData);

      // Update the flow with new data
      setGeneratedNodes(data.nodes);
      setGeneratedEdges(data.edges);
      setDwsimInstructions(data.dwsimInstructions);
      setDescription(data.description);

      // Add to history
      const historyItem: HistoryItem = {
        id: Date.now().toString(),
        prompt,
        timestamp: Date.now(),
        data,
      };
      setHistory(prev => [historyItem, ...prev.slice(0, 49)]); // Keep last 50 items

      // Auto-simulate with context-aware messages
      if (!backendOnline) {
        setSuccess('Flowsheet generated. Start the Python backend to run simulation.');
      } else {
        try {
          await runSimulation(data);
          setSuccess('Flowsheet generated and simulation complete.');
        } catch {
          setSuccess('Flowsheet generated. Simulation failed — see error below.');
        }
      }
    } catch (error) {
      console.error('Error generating flowsheet:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate flowsheet');
    } finally {
      setIsLoading(false);
    }
  };

  const loadFromHistory = async (item: HistoryItem) => {
    setGeneratedNodes(item.data.nodes);
    setGeneratedEdges(item.data.edges);
    setDwsimInstructions(item.data.dwsimInstructions);
    setDescription(item.data.description);
    setPrompt(item.prompt);
    setShowHistory(false);

    if (!backendOnline) {
      setSuccess('Flowsheet loaded from history. Start the Python backend to run simulation.');
    } else {
      try {
        await runSimulation(item.data);
        setSuccess('Flowsheet loaded and simulation complete.');
      } catch {
        setSuccess('Flowsheet loaded from history. Simulation failed — see error below.');
      }
    }
  };

  const clearFlowsheet = () => {
    setGeneratedNodes([]);
    setGeneratedEdges([]);
    setDwsimInstructions('');
    setDescription('');
    setPrompt('');
    setError(null);
    setSuccess(null);
    setSimulationResult(null);
    setSimulationError(null);
    setSelectedStream(null);
    setSelectedNode(null);
    setSelectedFeedEdge(null);
    setShowWorkbook(false);
    setComponents([]);
    setPropertyPackage('Peng-Robinson');
  };

  const downloadFlowsheet = () => {
    const data = {
      nodes: generatedNodes,
      edges: generatedEdges,
      dwsimInstructions,
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

  const downloadDwsimInstructions = () => {
    const blob = new Blob([dwsimInstructions], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dwsim-instructions-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const exportDwsim = async () => {
    if (!simulationResult) return;
    setIsExporting(true);
    setShowExportMenu(false);
    try {
      const payload = buildSimulationPayload(
        description || 'flowsheet',
        generatedNodes,
        generatedEdges,
        components,
        propertyPackage,
      );
      const res = await fetch('/api/export/dwsim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, result: simulationResult }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${description || 'flowsheet'}.dwxmz`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setSimulationError('DWSIM export failed. Is the Python backend running?');
    } finally {
      setIsExporting(false);
    }
  };

  const exportCsv = async () => {
    if (!simulationResult) return;
    setIsExporting(true);
    setShowExportMenu(false);
    try {
      const payload = buildSimulationPayload(
        description || 'flowsheet',
        generatedNodes,
        generatedEdges,
        components,
        propertyPackage,
      );
      const res = await fetch('/api/export/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, result: simulationResult }),
      });
      if (!res.ok) throw new Error('Export failed');
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${description || 'flowsheet'}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setSimulationError('CSV export failed. Is the Python backend running?');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Process Flowsheet Builder
            </h1>
            {backendOnline !== null && (
              <span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${backendOnline ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'}`}>
                <span className={`w-2 h-2 rounded-full ${backendOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                <span>{backendOnline ? 'Backend Connected' : 'Backend Offline'}</span>
              </span>
            )}
          </div>
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
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={generatedNodes.length === 0}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span>Export</span>
              </button>
              {showExportMenu && (
                <div className="absolute right-0 mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50">
                  <button
                    onClick={downloadFlowsheet}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg"
                  >
                    <div className="font-medium text-gray-900 dark:text-white">JSON Flowsheet</div>
                    <div className="text-xs text-gray-500">Nodes, edges, and parameters</div>
                  </button>
                  <button
                    onClick={exportDwsim}
                    disabled={!simulationResult}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="font-medium text-gray-900 dark:text-white">DWSIM File (.dwxmz)</div>
                    <div className="text-xs text-gray-500">Open in DWSIM desktop</div>
                  </button>
                  <button
                    onClick={exportCsv}
                    disabled={!simulationResult}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-b-lg"
                  >
                    <div className="font-medium text-gray-900 dark:text-white">CSV Stream Table</div>
                    <div className="text-xs text-gray-500">HYSYS spreadsheet import</div>
                  </button>
                </div>
              )}
            </div>
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

          {/* Thermodynamic Configuration */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
            <CompoundPicker selected={components} onChange={setComponents} />
            <PropertyPackageSelector value={propertyPackage} onChange={setPropertyPackage} />
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

          {/* DWSIM Instructions */}
          {dwsimInstructions && (
            <div className="flex-1 p-4 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  DWSIM Instructions
                </h3>
                <button
                  onClick={downloadDwsimInstructions}
                  className="flex items-center space-x-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  <span>Download</span>
                </button>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono">
                  {dwsimInstructions}
                </pre>
              </div>
            </div>
          )}

          {/* Run Simulation button */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={handleRunSimulation}
              disabled={isSimulating || generatedNodes.length === 0}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {isSimulating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>{isSimulating ? 'Simulating...' : 'Run Simulation'}</span>
            </button>

            {simulationError && (
              <div className="mt-2 flex items-start space-x-2 text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="text-xs">{simulationError}</span>
              </div>
            )}

            {simulationResult && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${simulationResult.converged ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {simulationResult.converged ? 'Converged' : 'Not Converged'}
                    {simulationResult.iterations != null && ` (${simulationResult.iterations} iter)`}
                    {simulationResult.mass_balance_error != null && ` | MB err: ${(simulationResult.mass_balance_error * 100).toFixed(3)}%`}
                  </span>
                  <button
                    onClick={() => setShowWorkbook(!showWorkbook)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {showWorkbook ? 'Hide Results' : 'Show Results'}
                  </button>
                </div>
                {simulationResult.warnings && simulationResult.warnings.length > 0 && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded p-2">
                    {simulationResult.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-yellow-700 dark:text-yellow-300">{w}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main Flow Area */}
        <div className="flex-1 relative">
          <HYSYSFlowsheetEditor
            generatedNodes={generatedNodes}
            generatedEdges={generatedEdges}
            simulationResult={simulationResult}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
          />
        </div>
      </div>

      {/* Feed stream editor (right side) */}
      {selectedFeedEdge && (
        <FeedStreamEditor
          edge={selectedFeedEdge}
          components={components}
          onApply={handleFeedApply}
          onClose={() => setSelectedFeedEdge(null)}
        />
      )}

      {/* Stream property panel (right side) */}
      {selectedStream && !selectedFeedEdge && (
        <StreamPropertyPanel
          stream={selectedStream}
          onClose={() => setSelectedStream(null)}
        />
      )}

      {/* Equipment property sheet (right side) */}
      {selectedNode && (
        <EquipmentPropertySheet
          node={selectedNode}
          unitResult={simulationResult?.units.find((u) => u.id === selectedNode.id) ?? null}
          onParameterChange={handleParameterChange}
          onClose={() => setSelectedNode(null)}
        />
      )}

      {/* Results workbook (bottom panel) */}
      {showWorkbook && simulationResult && (
        <ResultsWorkbook
          result={simulationResult}
          onClose={() => setShowWorkbook(false)}
          onStreamClick={(streamId) => {
            const stream = simulationResult.streams.find((s) => s.id === streamId);
            if (stream) {
              setSelectedNode(null);
              setSelectedStream(stream);
            }
          }}
          onUnitClick={(unitId) => {
            const node = generatedNodes.find((n: any) => n.id === unitId);
            if (node) {
              setSelectedStream(null);
              setSelectedNode(node);
            }
          }}
        />
      )}

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
