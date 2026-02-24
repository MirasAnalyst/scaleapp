'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Beaker, Thermometer, Gauge, Droplets, RefreshCw } from 'lucide-react';
import { Edge } from 'reactflow';

interface FeedStreamEditorProps {
  edge: Edge;
  components: string[];
  onApply: (edgeId: string, properties: Record<string, unknown>) => void;
  onClose: () => void;
}

type CompositionBasis = 'mole' | 'mass' | 'volume';

export default function FeedStreamEditor({
  edge,
  components,
  onApply,
  onClose,
}: FeedStreamEditorProps) {
  const props = (edge.data ?? {}) as Record<string, unknown>;
  const existingProps = (props.properties ?? props) as Record<string, unknown>;

  const [temperature, setTemperature] = useState<string>(
    String(existingProps.temperature ?? existingProps.temperature_c ?? '25')
  );
  const [pressure, setPressure] = useState<string>(
    String(existingProps.pressure ?? existingProps.pressure_kpa ?? '101.325')
  );
  const [flowRate, setFlowRate] = useState<string>(
    String(existingProps.flow_rate ?? existingProps.mass_flow_kg_per_h ?? '1000')
  );
  const [basis, setBasis] = useState<CompositionBasis>(
    (existingProps.composition_basis as CompositionBasis) ?? 'mole'
  );

  // Build initial composition from existing edge data
  const existingComp = (existingProps.composition ?? {}) as Record<string, number>;
  const [composition, setComposition] = useState<Record<string, string>>(() => {
    const result: Record<string, string> = {};
    for (const comp of components) {
      const val = existingComp[comp] ?? existingComp[comp.toLowerCase()] ?? 0;
      result[comp] = String(val);
    }
    return result;
  });

  // Update composition when components change
  useEffect(() => {
    setComposition((prev) => {
      const updated: Record<string, string> = {};
      for (const comp of components) {
        updated[comp] = prev[comp] ?? '0';
      }
      return updated;
    });
  }, [components]);

  const handleCompChange = useCallback((comp: string, value: string) => {
    setComposition((prev) => ({ ...prev, [comp]: value }));
  }, []);

  const normalize = useCallback(() => {
    const values = components.map((c) => parseFloat(composition[c]) || 0);
    const total = values.reduce((a, b) => a + b, 0);
    if (total <= 0) return;
    const normalized: Record<string, string> = {};
    for (let i = 0; i < components.length; i++) {
      normalized[components[i]] = (values[i] / total).toFixed(6);
    }
    setComposition(normalized);
  }, [components, composition]);

  const handleApply = useCallback(() => {
    const compValues: Record<string, number> = {};
    for (const comp of components) {
      compValues[comp] = parseFloat(composition[comp]) || 0;
    }

    const newProps: Record<string, unknown> = {
      temperature: parseFloat(temperature) || 25,
      pressure: parseFloat(pressure) || 101.325,
      flow_rate: parseFloat(flowRate) || 1000,
      composition: compValues,
      composition_basis: basis,
    };

    onApply(edge.id, newProps);
  }, [edge.id, temperature, pressure, flowRate, composition, basis, components, onApply]);

  const total = components
    .map((c) => parseFloat(composition[c]) || 0)
    .reduce((a, b) => a + b, 0);

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-800 shadow-2xl border-l border-gray-200 dark:border-gray-700 z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/30 dark:to-yellow-900/30">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Feed: {edge.id}
          </h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Edit stream conditions
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Temperature */}
        <div>
          <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            <Thermometer className="w-4 h-4" />
            <span>Temperature (C)</span>
          </label>
          <input
            type="number"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Pressure */}
        <div>
          <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            <Gauge className="w-4 h-4" />
            <span>Pressure (kPa)</span>
          </label>
          <input
            type="number"
            value={pressure}
            onChange={(e) => setPressure(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Flow Rate */}
        <div>
          <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            <Droplets className="w-4 h-4" />
            <span>Mass Flow (kg/h)</span>
          </label>
          <input
            type="number"
            value={flowRate}
            onChange={(e) => setFlowRate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Composition Basis */}
        <div>
          <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            <Beaker className="w-4 h-4" />
            <span>Composition Basis</span>
          </label>
          <select
            value={basis}
            onChange={(e) => setBasis(e.target.value as CompositionBasis)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="mole">Mole Fraction</option>
            <option value="mass">Mass Fraction</option>
            <option value="volume">Volume Fraction</option>
          </select>
        </div>

        {/* Composition Table */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Composition
            </span>
            <div className="flex items-center space-x-2">
              <span
                className={`text-xs ${
                  Math.abs(total - 1.0) < 0.001
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-orange-600 dark:text-orange-400'
                }`}
              >
                Sum: {total.toFixed(4)}
              </span>
              <button
                onClick={normalize}
                title="Normalize to 1.0"
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              >
                <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            {components.map((comp) => (
              <div key={comp} className="flex items-center space-x-2">
                <span className="w-28 text-xs text-gray-600 dark:text-gray-400 truncate">
                  {comp}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={composition[comp] ?? '0'}
                  onChange={(e) => handleCompChange(comp, e.target.value)}
                  className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
          {components.length === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Add compounds in the sidebar first
            </p>
          )}
        </div>
      </div>

      {/* Footer with Apply button */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleApply}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Apply & Re-simulate</span>
        </button>
      </div>
    </div>
  );
}
