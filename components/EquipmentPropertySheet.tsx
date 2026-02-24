'use client';

import React, { useState } from 'react';
import { X, Settings, Zap, ArrowDown } from 'lucide-react';
import { SimulationUnitResult } from '../lib/simulation';

interface EquipmentPropertySheetProps {
  node: {
    id: string;
    type?: string;
    data?: {
      label?: string;
      equipment?: string;
      parameters?: Record<string, unknown>;
    };
  };
  unitResult: SimulationUnitResult | null;
  onParameterChange: (nodeId: string, params: Record<string, unknown>) => void;
  onClose: () => void;
}

const fmt = (v: number | undefined | null, decimals = 2): string =>
  v != null ? v.toFixed(decimals) : '—';

// Map equipment types to user-friendly names and available parameters
const EQUIPMENT_CONFIG: Record<string, { label: string; params: ParamDef[] }> = {
  pump: {
    label: 'Centrifugal Pump',
    params: [
      { key: 'outlet_pressure_kpa', label: 'Outlet Pressure', unit: 'kPa', type: 'number' },
      { key: 'pressure_rise_kpa', label: 'Pressure Rise', unit: 'kPa', type: 'number' },
      { key: 'efficiency', label: 'Efficiency', unit: '', type: 'number', min: 0.1, max: 1.0, step: 0.05 },
    ],
  },
  compressor: {
    label: 'Compressor',
    params: [
      { key: 'outlet_pressure_kpa', label: 'Outlet Pressure', unit: 'kPa', type: 'number' },
      { key: 'pressure_ratio', label: 'Pressure Ratio', unit: '', type: 'number' },
      { key: 'efficiency', label: 'Efficiency', unit: '', type: 'number', min: 0.1, max: 1.0, step: 0.05 },
    ],
  },
  turbine: {
    label: 'Turbine / Expander',
    params: [
      { key: 'outlet_pressure_kpa', label: 'Outlet Pressure', unit: 'kPa', type: 'number' },
      { key: 'pressure_ratio', label: 'Pressure Ratio', unit: '', type: 'number' },
      { key: 'efficiency', label: 'Efficiency', unit: '', type: 'number', min: 0.1, max: 1.0, step: 0.05 },
    ],
  },
  heaterCooler: {
    label: 'Heater / Cooler',
    params: [
      { key: 'outlet_temperature_c', label: 'Outlet Temperature', unit: '°C', type: 'number' },
      { key: 'duty_kw', label: 'Duty', unit: 'kW', type: 'number' },
      { key: 'pressure_drop_kpa', label: 'Pressure Drop', unit: 'kPa', type: 'number' },
    ],
  },
  shellTubeHX: {
    label: 'Shell & Tube Heat Exchanger',
    params: [
      { key: 'hot_outlet_temperature_c', label: 'Hot Outlet Temp', unit: '°C', type: 'number' },
      { key: 'cold_outlet_temperature_c', label: 'Cold Outlet Temp', unit: '°C', type: 'number' },
      { key: 'duty_kw', label: 'Duty', unit: 'kW', type: 'number' },
    ],
  },
  valve: {
    label: 'Valve',
    params: [
      { key: 'outlet_pressure_kpa', label: 'Outlet Pressure', unit: 'kPa', type: 'number' },
      { key: 'pressure_drop_kpa', label: 'Pressure Drop', unit: 'kPa', type: 'number' },
    ],
  },
  flashDrum: {
    label: 'Flash Drum',
    params: [
      { key: 'temperature_c', label: 'Temperature', unit: '°C', type: 'number' },
      { key: 'pressure_kpa', label: 'Pressure', unit: 'kPa', type: 'number' },
    ],
  },
  separator: {
    label: 'Separator',
    params: [
      { key: 'temperature_c', label: 'Temperature', unit: '°C', type: 'number' },
      { key: 'pressure_kpa', label: 'Pressure', unit: 'kPa', type: 'number' },
    ],
  },
  separator3p: {
    label: '3-Phase Separator',
    params: [
      { key: 'temperature_c', label: 'Temperature', unit: '°C', type: 'number' },
      { key: 'pressure_kpa', label: 'Pressure', unit: 'kPa', type: 'number' },
    ],
  },
  distillationColumn: {
    label: 'Distillation Column',
    params: [
      { key: 'n_stages', label: 'Number of Stages', unit: '', type: 'number' },
      { key: 'reflux_ratio_multiple', label: 'R/R_min Ratio', unit: '', type: 'number', step: 0.1 },
      { key: 'light_key', label: 'Light Key Component', unit: '', type: 'text' },
      { key: 'heavy_key', label: 'Heavy Key Component', unit: '', type: 'text' },
      { key: 'light_key_recovery', label: 'LK Recovery', unit: '', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'heavy_key_recovery', label: 'HK Recovery', unit: '', type: 'number', min: 0, max: 1, step: 0.01 },
      { key: 'condenser_pressure_kpa', label: 'Condenser Pressure', unit: 'kPa', type: 'number' },
    ],
  },
  mixer: {
    label: 'Mixer',
    params: [
      { key: 'outlet_pressure_kpa', label: 'Outlet Pressure', unit: 'kPa', type: 'number' },
    ],
  },
  splitter: {
    label: 'Splitter',
    params: [
      { key: 'fractions', label: 'Split Fractions (comma-sep)', unit: '', type: 'text' },
    ],
  },
  cstr: {
    label: 'CSTR Reactor',
    params: [
      { key: 'temperature_c', label: 'Temperature', unit: '°C', type: 'number' },
      { key: 'pressure_kpa', label: 'Pressure', unit: 'kPa', type: 'number' },
    ],
  },
  gibbsReactor: {
    label: 'Gibbs Reactor',
    params: [
      { key: 'temperature_c', label: 'Temperature', unit: '°C', type: 'number' },
      { key: 'pressure_kpa', label: 'Pressure', unit: 'kPa', type: 'number' },
    ],
  },
  kineticReactor: {
    label: 'Kinetic Reactor (CSTR/PFR)',
    params: [
      { key: 'reactor_type', label: 'Reactor Type (CSTR/PFR)', unit: '', type: 'text' },
      { key: 'volume_m3', label: 'Volume', unit: 'm³', type: 'number' },
      { key: 'temperature_c', label: 'Temperature', unit: '°C', type: 'number' },
      { key: 'pressure_kpa', label: 'Pressure', unit: 'kPa', type: 'number' },
    ],
  },
  rigorousDistillationColumn: {
    label: 'Rigorous Distillation Column',
    params: [
      { key: 'n_stages', label: 'Number of Stages', unit: '', type: 'number' },
      { key: 'feed_tray', label: 'Feed Tray', unit: '', type: 'number' },
      { key: 'reflux_ratio', label: 'Reflux Ratio (L/D)', unit: '', type: 'number', step: 0.1 },
      { key: 'condenser_type', label: 'Condenser (total/partial)', unit: '', type: 'text' },
      { key: 'condenser_pressure_kpa', label: 'Condenser Pressure', unit: 'kPa', type: 'number' },
      { key: 'pressure_drop_per_tray_kpa', label: 'ΔP per Tray', unit: 'kPa', type: 'number', step: 0.1 },
    ],
  },
  polytropicCompressor: {
    label: 'Polytropic Compressor',
    params: [
      { key: 'outlet_pressure_kpa', label: 'Outlet Pressure', unit: 'kPa', type: 'number' },
      { key: 'pressure_ratio', label: 'Pressure Ratio', unit: '', type: 'number' },
      { key: 'polytropic_efficiency', label: 'Polytropic Efficiency', unit: '', type: 'number', min: 0.1, max: 1.0, step: 0.05 },
      { key: 'n_stages', label: 'Number of Stages', unit: '', type: 'number' },
    ],
  },
  equilibriumReactor: {
    label: 'Equilibrium Reactor',
    params: [
      { key: 'temperature_c', label: 'Temperature', unit: '°C', type: 'number' },
      { key: 'pressure_kpa', label: 'Pressure', unit: 'kPa', type: 'number' },
    ],
  },
};

interface ParamDef {
  key: string;
  label: string;
  unit: string;
  type: 'number' | 'text';
  min?: number;
  max?: number;
  step?: number;
}

export default function EquipmentPropertySheet({
  node,
  unitResult,
  onParameterChange,
  onClose,
}: EquipmentPropertySheetProps) {
  const equipType = node.type ?? node.data?.equipment ?? 'unknown';
  const config = EQUIPMENT_CONFIG[equipType];
  const displayName = node.data?.label ?? config?.label ?? equipType;

  const [localParams, setLocalParams] = useState<Record<string, unknown>>(
    node.data?.parameters ?? {}
  );

  const handleParamChange = (key: string, value: string) => {
    const paramDef = config?.params.find((p) => p.key === key);
    const parsed = paramDef?.type === 'number' ? (value === '' ? undefined : parseFloat(value)) : value;
    const updated = { ...localParams, [key]: parsed };
    setLocalParams(updated);
    onParameterChange(node.id, updated);
  };

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-800 shadow-2xl border-l border-gray-200 dark:border-gray-700 z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{displayName}</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">{equipType}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Parameters */}
        {config && config.params.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Settings className="w-3 h-3" /> Parameters
            </h3>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-3">
              {config.params.map((param) => (
                <div key={param.key}>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                    {param.label} {param.unit && <span className="text-gray-400">({param.unit})</span>}
                  </label>
                  <input
                    type={param.type}
                    value={localParams[param.key] != null ? String(localParams[param.key]) : ''}
                    onChange={(e) => handleParamChange(param.key, e.target.value)}
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    placeholder={`Enter ${param.label.toLowerCase()}`}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Calculated results */}
        {unitResult && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Zap className="w-3 h-3" /> Calculated Results
            </h3>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-2">
              {unitResult.duty_kw != null && (
                <ResultRow label="Duty" value={fmt(unitResult.duty_kw)} unit="kW" />
              )}
              {unitResult.pressure_drop_kpa != null && (
                <ResultRow label="Pressure Drop" value={fmt(unitResult.pressure_drop_kpa)} unit="kPa" />
              )}
              {unitResult.efficiency != null && (
                <ResultRow label="Efficiency" value={fmt(unitResult.efficiency * 100)} unit="%" />
              )}
              <ResultRow label="Status" value={unitResult.status ?? '—'} unit="" />

              {/* Extra parameters from solver */}
              {unitResult.extra && Object.entries(unitResult.extra).map(([key, val]) => (
                <ResultRow
                  key={key}
                  label={key.replace(/_/g, ' ')}
                  value={typeof val === 'number' ? fmt(val) : String(val)}
                  unit=""
                />
              ))}
            </div>
          </div>
        )}

        {!config && (
          <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            No configurable parameters for this equipment type.
          </div>
        )}
      </div>
    </div>
  );
}

function ResultRow({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600 dark:text-gray-400 capitalize">{label}</span>
      <span className="font-mono text-gray-900 dark:text-white">
        {value} <span className="text-gray-400 text-xs">{unit}</span>
      </span>
    </div>
  );
}
