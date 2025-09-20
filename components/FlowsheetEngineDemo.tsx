// React component demonstrating FlowsheetEngine integration
'use client';

import React, { useState } from 'react';
import { useFlowsheetEngine } from '../hooks/useFlowsheetEngine';
import { ProcessResult } from '../lib/flowsheet';

export default function FlowsheetEngineDemo() {
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
    clear,
    getSummary,
    exportForVisualization,
    validateFlowsheet,
    createExampleFlowsheet
  } = useFlowsheetEngine();

  const [flowsheetName, setFlowsheetName] = useState('My Process Flowsheet');
  const [solverOptions, setSolverOptions] = useState({
    maxIterations: 100,
    tolerance: 1e-6,
    method: 'newton' as const
  });

  const handleCreateFlowsheet = () => {
    createFlowsheet(flowsheetName);
  };

  const handleCreateExample = () => {
    createExampleFlowsheet();
  };

  const handleSolve = async () => {
    try {
      const result = await solve(solverOptions);
      console.log('Solution result:', result);
    } catch (error) {
      console.error('Solution error:', error);
    }
  };

  const handleValidate = () => {
    const validation = validateFlowsheet();
    console.log('Validation result:', validation);
  };

  const handleExport = () => {
    const data = exportForVisualization();
    console.log('Export data:', data);
  };

  const handleClear = () => {
    clear();
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          FlowsheetEngine Demo
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          JavaScript equivalent of pyflowsheet for process flowsheet simulation
        </p>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Flowsheet Control</h3>
          <div className="space-y-2">
            <input
              type="text"
              value={flowsheetName}
              onChange={(e) => setFlowsheetName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm"
              placeholder="Flowsheet name"
            />
            <button
              onClick={handleCreateFlowsheet}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Create Flowsheet
            </button>
            <button
              onClick={handleCreateExample}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              Create Example
            </button>
            <button
              onClick={handleClear}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              Clear All
            </button>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Solver Options</h3>
          <div className="space-y-2">
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300">Max Iterations</label>
              <input
                type="number"
                value={solverOptions.maxIterations}
                onChange={(e) => setSolverOptions({...solverOptions, maxIterations: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300">Tolerance</label>
              <input
                type="number"
                step="1e-6"
                value={solverOptions.tolerance}
                onChange={(e) => setSolverOptions({...solverOptions, tolerance: parseFloat(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300">Method</label>
              <select
                value={solverOptions.method}
                onChange={(e) => setSolverOptions({...solverOptions, method: e.target.value as any})}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm"
              >
                <option value="newton">Newton</option>
                <option value="secant">Secant</option>
                <option value="broyden">Broyden</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Actions</h3>
          <div className="space-y-2">
            <button
              onClick={handleSolve}
              disabled={isSolving}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {isSolving ? 'Solving...' : 'Solve Flowsheet'}
            </button>
            <button
              onClick={handleValidate}
              className="w-full px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors"
            >
              Validate
            </button>
            <button
              onClick={handleExport}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
            >
              Export Data
            </button>
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="mb-6">
        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Flowsheet Status</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">{getSummary()}</p>
          {isSolving && (
            <div className="mt-2">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="text-sm text-blue-600">Solving flowsheet...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {lastResult && (
        <div className="mb-6">
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Solution Results</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-1">Streams & Units</h4>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Streams: {Object.keys(lastResult.streams).length}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Units: {Object.keys(lastResult.units).length}
                </p>
              </div>
            </div>
            
            {lastResult.warnings.length > 0 && (
              <div className="mt-3">
                <h4 className="font-medium text-yellow-600 mb-1">Warnings</h4>
                <ul className="text-sm text-yellow-600">
                  {lastResult.warnings.map((warning, index) => (
                    <li key={index}>• {warning}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {lastResult.errors.length > 0 && (
              <div className="mt-3">
                <h4 className="font-medium text-red-600 mb-1">Errors</h4>
                <ul className="text-sm text-red-600">
                  {lastResult.errors.map((error, index) => (
                    <li key={index}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stream Results */}
      {lastResult && Object.keys(lastResult.streams).length > 0 && (
        <div className="mb-6">
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Stream Results</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-300 dark:border-gray-600">
                    <th className="text-left py-2">Stream</th>
                    <th className="text-left py-2">Flow Rate (kg/s)</th>
                    <th className="text-left py-2">Temperature (K)</th>
                    <th className="text-left py-2">Pressure (kPa)</th>
                    <th className="text-left py-2">Phase</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(lastResult.streams).map(([id, stream]) => (
                    <tr key={id} className="border-b border-gray-200 dark:border-gray-600">
                      <td className="py-2 font-medium">{stream.name}</td>
                      <td className="py-2">{stream.flowRate.toFixed(3)}</td>
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

      {/* Instructions */}
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
        <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">How to Use</h3>
        <ol className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
          <li>1. Create a new flowsheet or use the example</li>
          <li>2. Add unit operations (mixer, reactor, separator, etc.)</li>
          <li>3. Add streams and connect units</li>
          <li>4. Configure solver options</li>
          <li>5. Solve the flowsheet to get results</li>
          <li>6. Validate and export data as needed</li>
        </ol>
      </div>
    </div>
  );
}
