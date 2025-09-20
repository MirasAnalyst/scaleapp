// Integration component showing how to use FlowsheetEngine with existing flowsheet builder
'use client';

import React, { useState, useEffect } from 'react';
import { useFlowsheetEngine } from '../hooks/useFlowsheetEngine';
import { ProcessResult } from '../lib/flowsheet';

export default function FlowsheetIntegration() {
  const {
    engine,
    isSolving,
    lastResult,
    createFlowsheet,
    addMixer,
    addReactor,
    addSeparator,
    addStream,
    connectUnits,
    solve,
    getSummary,
    exportForVisualization
  } = useFlowsheetEngine();

  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize with a simple example flowsheet
  useEffect(() => {
    if (!isInitialized) {
      initializeExampleFlowsheet();
      setIsInitialized(true);
    }
  }, [isInitialized]);

  const initializeExampleFlowsheet = () => {
    // Create a simple ethanol production flowsheet
    createFlowsheet('Ethanol Production Process');

    // Create feed streams
    const waterFeed = addStream('water_feed', 'Water Feed', {
      temperature: 298,
      pressure: 101325,
      flowRate: 100, // kg/s
      composition: { 'Water': 1.0 }
    });

    const ethanolFeed = addStream('ethanol_feed', 'Ethanol Feed', {
      temperature: 298,
      pressure: 101325,
      flowRate: 50, // kg/s
      composition: { 'Ethanol': 1.0 }
    });

    // Create unit operations
    const mixer = addMixer('mixer1', 'Feed Mixer', { x: 100, y: 200 });
    const reactor = addReactor('reactor1', 'Ethanol Reactor', { x: 300, y: 200 }, 0.85);
    const separator = addSeparator('separator1', 'Product Separator', { x: 500, y: 200 }, 0.92);

    // Connect the flowsheet
    connectUnits('mixer1', 'out', 'reactor1', 'in', waterFeed);
    connectUnits('reactor1', 'out', 'separator1', 'in', ethanolFeed);

    console.log('Example flowsheet initialized:', getSummary());
  };

  const handleSolve = async () => {
    try {
      const result = await solve({
        maxIterations: 50,
        tolerance: 1e-5,
        method: 'newton'
      });
      
      console.log('Flowsheet solved successfully:', result);
    } catch (error) {
      console.error('Error solving flowsheet:', error);
    }
  };

  const handleExport = () => {
    const data = exportForVisualization();
    console.log('Flowsheet data for visualization:', data);
    
    // This data can be used with your existing React Flow components
    // The nodes and edges are compatible with React Flow format
    return data;
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          FlowsheetEngine Integration
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          JavaScript equivalent of pyflowsheet integrated with React components
        </p>
      </div>

      {/* Status Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Flowsheet Status</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">{getSummary()}</p>
          {isSolving && (
            <div className="mt-2 flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-sm text-blue-600">Solving...</span>
            </div>
          )}
        </div>

        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Actions</h3>
          <div className="space-y-2">
            <button
              onClick={handleSolve}
              disabled={isSolving}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isSolving ? 'Solving...' : 'Solve Flowsheet'}
            </button>
            <button
              onClick={handleExport}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              Export for Visualization
            </button>
          </div>
        </div>
      </div>

      {/* Results Display */}
      {lastResult && (
        <div className="mb-6">
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Solution Results</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-1">Convergence</h4>
                <p className={`text-sm ${lastResult.converged ? 'text-green-600' : 'text-red-600'}`}>
                  {lastResult.converged ? '✓ Converged' : '✗ Not Converged'}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Iterations: {lastResult.iterations}
                </p>
              </div>
              <div>
                <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-1">Streams</h4>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Count: {Object.keys(lastResult.streams).length}
                </p>
              </div>
              <div>
                <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-1">Units</h4>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Count: {Object.keys(lastResult.units).length}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stream Results Table */}
      {lastResult && Object.keys(lastResult.streams).length > 0 && (
        <div className="mb-6">
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Stream Results</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-300 dark:border-gray-600">
                    <th className="text-left py-2">Stream</th>
                    <th className="text-left py-2">Flow (kg/s)</th>
                    <th className="text-left py-2">Temp (K)</th>
                    <th className="text-left py-2">Press (kPa)</th>
                    <th className="text-left py-2">Phase</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(lastResult.streams).map(([id, stream]) => (
                    <tr key={id} className="border-b border-gray-200 dark:border-gray-600">
                      <td className="py-2 font-medium">{stream.name}</td>
                      <td className="py-2">{stream.flowRate.toFixed(2)}</td>
                      <td className="py-2">{stream.temperature.toFixed(1)}</td>
                      <td className="py-2">{(stream.pressure / 1000).toFixed(1)}</td>
                      <td className="py-2">{stream.phase}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Integration Notes */}
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
        <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">Integration Notes</h3>
        <div className="text-sm text-blue-800 dark:text-blue-300 space-y-2">
          <p>
            <strong>React Flow Integration:</strong> The exportForVisualization() method returns data 
            compatible with React Flow components, including nodes and edges.
          </p>
          <p>
            <strong>Professional Equipment:</strong> All unit operations use the professional 
            equipment shapes we created earlier, matching industry standards.
          </p>
          <p>
            <strong>Process Simulation:</strong> The engine performs material and energy balances, 
            similar to commercial process simulation software.
          </p>
          <p>
            <strong>Extensible:</strong> Easy to add new unit operations, materials, and 
            calculation methods.
          </p>
        </div>
      </div>
    </div>
  );
}
