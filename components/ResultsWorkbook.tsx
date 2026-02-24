'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  Table2,
  Scale,
  Flame,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { SimulationResult, SimulationStreamResult, SimulationUnitResult } from '../lib/simulation';

interface ResultsWorkbookProps {
  result: SimulationResult;
  onClose: () => void;
  onStreamClick?: (streamId: string) => void;
  onUnitClick?: (unitId: string) => void;
}

type TabKey = 'streams' | 'material' | 'energy' | 'units';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'streams', label: 'Streams', icon: <Table2 className="w-4 h-4" /> },
  { key: 'material', label: 'Material Balance', icon: <Scale className="w-4 h-4" /> },
  { key: 'energy', label: 'Energy Balance', icon: <Flame className="w-4 h-4" /> },
  { key: 'units', label: 'Unit Operations', icon: <Table2 className="w-4 h-4" /> },
];

const fmt = (v: number | undefined | null, decimals = 2): string =>
  v != null ? v.toFixed(decimals) : '—';

export default function ResultsWorkbook({
  result,
  onClose,
  onStreamClick,
  onUnitClick,
}: ResultsWorkbookProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('streams');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 shadow-2xl border-t border-gray-200 dark:border-gray-700 z-40 flex flex-col transition-all ${
        collapsed ? 'h-12' : 'h-[45vh]'
      }`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900/50 dark:to-gray-900/50 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">
            Results: {result.flowsheet_name}
          </h2>
          <StatusBadge result={result} />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? (
              <ChevronUp className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Tab bar */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}

            {/* Summary info on the right */}
            <div className="ml-auto flex items-center gap-4 pr-4 text-xs text-gray-500 dark:text-gray-400">
              {result.iterations != null && <span>Iterations: {result.iterations}</span>}
              {result.property_package && <span>Package: {result.property_package}</span>}
              {result.components && result.components.length > 0 && (
                <span>Components: {result.components.join(', ')}</span>
              )}
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto">
            {activeTab === 'streams' && (
              <StreamSummaryTable streams={result.streams} onStreamClick={onStreamClick} />
            )}
            {activeTab === 'material' && <MaterialBalanceTable result={result} />}
            {activeTab === 'energy' && <EnergyBalanceTable result={result} />}
            {activeTab === 'units' && (
              <UnitOperationsTable units={result.units} onUnitClick={onUnitClick} />
            )}
          </div>

          {/* Warnings */}
          {result.warnings && result.warnings.length > 0 && (
            <div className="px-4 py-2 border-t border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800 shrink-0">
              <div className="flex items-start gap-2 text-xs text-yellow-700 dark:text-yellow-400">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  {result.warnings.map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ result }: { result: SimulationResult }) {
  const converged = result.converged ?? result.status === 'converged';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        converged
          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
          : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
      }`}
    >
      {converged ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        <AlertTriangle className="w-3 h-3" />
      )}
      {converged ? 'Converged' : result.status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stream Summary Table (HYSYS-style)
// ---------------------------------------------------------------------------

const STREAM_COLS: { label: string; unit: string; getter: (s: SimulationStreamResult) => string }[] = [
  { label: 'Temperature', unit: '°C', getter: (s) => fmt(s.temperature_c) },
  { label: 'Pressure', unit: 'kPa', getter: (s) => fmt(s.pressure_kpa) },
  { label: 'Mass Flow', unit: 'kg/h', getter: (s) => fmt(s.mass_flow_kg_per_h) },
  { label: 'Molar Flow', unit: 'kmol/h', getter: (s) => fmt(s.mole_flow_kmol_per_h, 4) },
  { label: 'Volume Flow', unit: 'm³/h', getter: (s) => fmt(s.volume_flow_m3_per_h, 4) },
  { label: 'Std Gas Flow', unit: 'Sm³/h', getter: (s) => fmt(s.std_gas_flow_sm3_per_h, 4) },
  { label: 'Vapor Frac', unit: '', getter: (s) => fmt(s.vapor_fraction, 4) },
  { label: 'Phase', unit: '', getter: (s) => s.phase ?? '—' },
  { label: 'Enthalpy', unit: 'kJ/kg', getter: (s) => fmt(s.enthalpy_kj_per_kg) },
  { label: 'Entropy', unit: 'kJ/(kg·K)', getter: (s) => fmt(s.entropy_kj_per_kg_k, 4) },
  { label: 'Cp', unit: 'kJ/(kg·K)', getter: (s) => fmt(s.heat_capacity_kj_per_kg_k, 4) },
  { label: 'Cv', unit: 'kJ/(kg·K)', getter: (s) => fmt(s.heat_capacity_cv_kj_per_kg_k, 4) },
  { label: 'Density', unit: 'kg/m³', getter: (s) => fmt(s.density_kg_per_m3) },
  { label: 'MW', unit: 'g/mol', getter: (s) => fmt(s.molecular_weight) },
  { label: 'Viscosity', unit: 'cP', getter: (s) => fmt(s.viscosity_cp, 4) },
  { label: 'Thermal Cond.', unit: 'W/(m·K)', getter: (s) => fmt(s.thermal_conductivity_w_per_mk, 4) },
  { label: 'Z Factor', unit: '', getter: (s) => fmt(s.compressibility_factor, 4) },
  { label: 'Speed of Sound', unit: 'm/s', getter: (s) => fmt(s.speed_of_sound_m_per_s) },
];

function StreamSummaryTable({
  streams,
  onStreamClick,
}: {
  streams: SimulationStreamResult[];
  onStreamClick?: (id: string) => void;
}) {
  if (streams.length === 0) {
    return <EmptyState message="No stream results available." />;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-700/50">
            <th className="sticky left-0 bg-gray-50 dark:bg-gray-700/50 px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
              Property
            </th>
            {streams.map((s) => (
              <th
                key={s.id}
                className="px-3 py-2 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 whitespace-nowrap"
                onClick={() => onStreamClick?.(s.id)}
              >
                {s.id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STREAM_COLS.map((col, idx) => (
            <tr
              key={col.label}
              className={idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-750/50'}
            >
              <td className="sticky left-0 bg-inherit px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                {col.label}{' '}
                {col.unit && (
                  <span className="text-gray-400 dark:text-gray-500">({col.unit})</span>
                )}
              </td>
              {streams.map((s) => (
                <td
                  key={s.id}
                  className="px-3 py-1.5 text-center font-mono text-xs text-gray-900 dark:text-white whitespace-nowrap"
                >
                  {col.getter(s)}
                </td>
              ))}
            </tr>
          ))}

          {/* Composition rows */}
          {getAllComponents(streams).map((comp) => (
            <tr key={comp} className="bg-blue-50/30 dark:bg-blue-900/10">
              <td className="sticky left-0 bg-inherit px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 capitalize whitespace-nowrap">
                {comp} <span className="text-gray-400">(mol frac)</span>
              </td>
              {streams.map((s) => (
                <td
                  key={s.id}
                  className="px-3 py-1.5 text-center font-mono text-xs text-gray-900 dark:text-white"
                >
                  {fmt(s.composition?.[comp], 4)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getAllComponents(streams: SimulationStreamResult[]): string[] {
  const set = new Set<string>();
  for (const s of streams) {
    if (s.composition) {
      for (const key of Object.keys(s.composition)) set.add(key);
    }
  }
  return Array.from(set).sort();
}

// ---------------------------------------------------------------------------
// Material Balance Table
// ---------------------------------------------------------------------------

function MaterialBalanceTable({ result }: { result: SimulationResult }) {
  // Identify feed streams (those without a source unit) and product streams (those without a target unit)
  const unitIds = new Set(result.units.map((u) => u.id));

  // Feed = streams that appear as inlet but have no source unit producing them
  // Product = streams that appear as outlet but no unit consumes them
  // We use inlet_streams/outlet_streams from unit results for classification
  const allInlets = new Set<string>();
  const allOutlets = new Set<string>();
  for (const u of result.units) {
    u.inlet_streams?.forEach((s) => allInlets.add(s));
    u.outlet_streams?.forEach((s) => allOutlets.add(s));
  }

  const feedStreams = result.streams.filter(
    (s) => allInlets.has(s.id) && !allOutlets.has(s.id)
  );
  const productStreams = result.streams.filter(
    (s) => allOutlets.has(s.id) && !allInlets.has(s.id)
  );

  const totalFeedFlow = feedStreams.reduce((sum, s) => sum + (s.mass_flow_kg_per_h ?? 0), 0);
  const totalProductFlow = productStreams.reduce((sum, s) => sum + (s.mass_flow_kg_per_h ?? 0), 0);
  const balanceError = totalFeedFlow > 0 ? Math.abs(totalFeedFlow - totalProductFlow) / totalFeedFlow * 100 : 0;

  const components = getAllComponents(result.streams);

  return (
    <div className="overflow-auto p-4 space-y-4">
      {/* Overall balance */}
      <div className="grid grid-cols-3 gap-4 max-w-lg">
        <BalanceCard label="Total Feed" value={fmt(totalFeedFlow)} unit="kg/h" />
        <BalanceCard label="Total Product" value={fmt(totalProductFlow)} unit="kg/h" />
        <BalanceCard
          label="Error"
          value={fmt(balanceError, 4)}
          unit="%"
          highlight={balanceError > 1}
        />
      </div>

      {/* Component balance table */}
      {components.length > 0 && (
        <table className="w-full text-sm max-w-2xl">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700/50">
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                Component
              </th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">
                Feed (mol frac avg)
              </th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">
                Product (mol frac avg)
              </th>
            </tr>
          </thead>
          <tbody>
            {components.map((comp, idx) => {
              const feedAvg = weightedAvgComp(feedStreams, comp);
              const prodAvg = weightedAvgComp(productStreams, comp);
              return (
                <tr
                  key={comp}
                  className={idx % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-750/50'}
                >
                  <td className="px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 capitalize">
                    {comp}
                  </td>
                  <td className="px-3 py-1.5 text-center font-mono text-xs text-gray-900 dark:text-white">
                    {fmt(feedAvg, 4)}
                  </td>
                  <td className="px-3 py-1.5 text-center font-mono text-xs text-gray-900 dark:text-white">
                    {fmt(prodAvg, 4)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {result.mass_balance_error != null && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Solver mass balance error: {fmt(result.mass_balance_error, 6)}%
        </div>
      )}
    </div>
  );
}

function weightedAvgComp(streams: SimulationStreamResult[], comp: string): number | null {
  let totalFlow = 0;
  let weighted = 0;
  for (const s of streams) {
    const flow = s.mole_flow_kmol_per_h ?? s.mass_flow_kg_per_h ?? 0;
    const frac = s.composition?.[comp] ?? 0;
    weighted += flow * frac;
    totalFlow += flow;
  }
  if (totalFlow === 0) return null;
  return weighted / totalFlow;
}

// ---------------------------------------------------------------------------
// Energy Balance Table
// ---------------------------------------------------------------------------

function EnergyBalanceTable({ result }: { result: SimulationResult }) {
  const totalDuty = result.units.reduce((sum, u) => sum + (u.duty_kw ?? 0), 0);

  return (
    <div className="overflow-auto p-4 space-y-4">
      <div className="grid grid-cols-2 gap-4 max-w-md">
        <BalanceCard label="Total Duty" value={fmt(totalDuty)} unit="kW" />
        {result.energy_balance_error != null && (
          <BalanceCard
            label="Energy Balance Error"
            value={fmt(result.energy_balance_error, 4)}
            unit="%"
            highlight={result.energy_balance_error > 1}
          />
        )}
      </div>

      <table className="w-full text-sm max-w-2xl">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-700/50">
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
              Unit Operation
            </th>
            <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">
              Duty (kW)
            </th>
            <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {result.units.map((u, idx) => (
            <tr
              key={u.id}
              className={idx % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-750/50'}
            >
              <td className="px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300">{u.id}</td>
              <td className="px-3 py-1.5 text-center font-mono text-xs text-gray-900 dark:text-white">
                {fmt(u.duty_kw)}
              </td>
              <td className="px-3 py-1.5 text-center text-xs">
                <span
                  className={
                    u.status === 'ok'
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-yellow-600 dark:text-yellow-400'
                  }
                >
                  {u.status ?? '—'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unit Operations Table
// ---------------------------------------------------------------------------

function UnitOperationsTable({
  units,
  onUnitClick,
}: {
  units: SimulationUnitResult[];
  onUnitClick?: (id: string) => void;
}) {
  if (units.length === 0) {
    return <EmptyState message="No unit operation results available." />;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-700/50">
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">ID</th>
            <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Duty (kW)</th>
            <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Pressure Drop (kPa)</th>
            <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Efficiency (%)</th>
            <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Inlets</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Outlets</th>
          </tr>
        </thead>
        <tbody>
          {units.map((u, idx) => (
            <tr
              key={u.id}
              className={`cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 ${
                idx % 2 === 0 ? '' : 'bg-gray-50/50 dark:bg-gray-750/50'
              }`}
              onClick={() => onUnitClick?.(u.id)}
            >
              <td className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                {u.id}
              </td>
              <td className="px-3 py-1.5 text-center font-mono text-xs text-gray-900 dark:text-white">
                {fmt(u.duty_kw)}
              </td>
              <td className="px-3 py-1.5 text-center font-mono text-xs text-gray-900 dark:text-white">
                {fmt(u.pressure_drop_kpa)}
              </td>
              <td className="px-3 py-1.5 text-center font-mono text-xs text-gray-900 dark:text-white">
                {u.efficiency != null ? fmt(u.efficiency * 100) : '—'}
              </td>
              <td className="px-3 py-1.5 text-center text-xs">
                <span
                  className={
                    u.status === 'ok'
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-yellow-600 dark:text-yellow-400'
                  }
                >
                  {u.status ?? '—'}
                </span>
              </td>
              <td className="px-3 py-1.5 text-xs text-gray-500">{u.inlet_streams?.join(', ') ?? '—'}</td>
              <td className="px-3 py-1.5 text-xs text-gray-500">{u.outlet_streams?.join(', ') ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function BalanceCard({
  label,
  value,
  unit,
  highlight = false,
}: {
  label: string;
  value: string;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 ${
        highlight
          ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
          : 'bg-gray-50 dark:bg-gray-700/50'
      }`}
    >
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-lg font-mono font-bold text-gray-900 dark:text-white">
        {value} <span className="text-xs text-gray-400 font-normal">{unit}</span>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full text-sm text-gray-500 dark:text-gray-400 py-8">
      {message}
    </div>
  );
}
