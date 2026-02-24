'use client';

import React, { useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import Header from 'components/Header';
import Footer from 'components/Footer';
import {
  Upload,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Download,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Zap,
  Leaf,
  DollarSign,
  ArrowUpDown,
  Factory,
  Eye,
  EyeOff,
  Info,
  HelpCircle,
  Settings2,
} from 'lucide-react';
import { DEFAULT_SCENARIO } from '@/lib/constants/hysys-optimizer';
import type {
  HYSYSImportData,
  ScenarioParams,
  OptimizerRunResult,
  OptimizationSuggestion,
  ProcessType,
  OptimizationGoal,
  GoalCategory,
  UnitSystem,
} from '@/types/hysys-optimizer';

const PROCESS_TYPE_LABELS: Record<ProcessType, string> = {
  oil_and_gas: 'Oil & Gas Processing',
  refining: 'Refining',
  chemicals: 'Chemicals',
  petrochemicals: 'Petrochemicals',
  pharma: 'Pharmaceutical',
  utilities: 'Utilities',
  general: 'General',
};

const GOAL_LABELS: Record<OptimizationGoal, string> = {
  production: 'Production',
  energy: 'Energy',
  carbon: 'Carbon',
  cost: 'Cost',
};

const GOAL_COLORS: Record<GoalCategory, { bg: string; text: string; border: string }> = {
  production: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
  energy: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
  carbon: { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  cost: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300', border: 'border-green-200 dark:border-green-800' },
};

const UNCERTAINTY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  low: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300', dot: 'bg-green-500' },
  medium: { bg: 'bg-yellow-100 dark:bg-yellow-900/40', text: 'text-yellow-700 dark:text-yellow-300', dot: 'bg-yellow-500' },
  high: { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' },
};

const OPTIMIZATION_FOCUS_OPTIONS: { value: string; label: string; goals: OptimizationGoal[] }[] = [
  { value: 'cost', label: 'Cost Reduction', goals: ['cost', 'energy', 'production', 'carbon'] },
  { value: 'energy', label: 'Energy Efficiency', goals: ['energy', 'cost', 'carbon', 'production'] },
  { value: 'production', label: 'Production Increase', goals: ['production', 'cost', 'energy', 'carbon'] },
  { value: 'carbon', label: 'Carbon Reduction', goals: ['carbon', 'energy', 'cost', 'production'] },
  { value: 'balanced', label: 'Balanced (all)', goals: ['cost', 'energy', 'production', 'carbon'] },
];

type SortField = 'revenueOrSavingsUSDPerYear' | 'paybackYears' | 'improvementPct';

const CSV_TEMPLATE_CONTENT = `stream_id,temperature_c,pressure_kpa,mass_flow_kg_h,vapor_fraction,composition
feed-1,85,1200,15000,0,"{""Water"":0.6,""Ethanol"":0.4}"
distillate,78,200,6000,1,
bottoms,102,220,9000,0,

unit_id,type,duty_mw,reflux_ratio,pressure_kpa,design_limit_notes
col-1,distillationColumn,2.5,1.8,200,
reboiler-1,reboiler,2.2,,,
condenser-1,condenser,-2.0,,,`;

function inferStreamsAndUnits(rows: Record<string, unknown>[]): {
  streams: HYSYSImportData['streams'];
  units: HYSYSImportData['units'];
  unitSystem: HYSYSImportData['unitSystem'];
  warning?: string;
} {
  const streams: HYSYSImportData['streams'] = [];
  const units: HYSYSImportData['units'] = [];
  let unitSystem: HYSYSImportData['unitSystem'] = 'SI';
  let warning: string | undefined;

  const first = rows[0] ?? {};
  if (
    Object.keys(first).some(
      (k) =>
        k.toLowerCase().includes('temperature_f') ||
        k.toLowerCase().includes('pressure_psig') ||
        k.toLowerCase().includes('lb_h'),
    )
  ) {
    unitSystem = 'US';
  }

  for (const row of rows) {
    const r = row as Record<string, unknown>;
    if (
      r.temperature_c != null ||
      r.temperature_f != null ||
      r.mass_flow_kg_h != null ||
      r.mass_flow_lb_h != null ||
      r.pressure_kpa != null ||
      r.pressure_psig != null
    ) {
      streams.push(r as HYSYSImportData['streams'] extends (infer S)[] ? S : never);
    }
    if (
      r.duty_mw != null ||
      r.duty_mmbtu_h != null ||
      r.reflux_ratio != null ||
      (r.type != null && typeof r.type === 'string')
    ) {
      units.push(r as HYSYSImportData['units'] extends (infer U)[] ? U : never);
    }
  }

  // Fix #18: warn instead of silently treating all rows as streams
  if (streams.length === 0 && units.length === 0 && rows.length > 0) {
    const sample = rows[0] as Record<string, unknown>;
    const cols = Object.keys(sample);
    if (cols.length > 0) {
      warning = `No recognized column names found (got: ${cols.slice(0, 5).join(', ')}${cols.length > 5 ? '...' : ''}). Expected columns like temperature_c, pressure_kpa, mass_flow_kg_h, duty_mw, etc. Data was loaded but may not be interpreted correctly.`;
      streams.push(
        ...rows.map((row) => row as HYSYSImportData['streams'] extends (infer S)[] ? S : never),
      );
    }
  }
  return { streams, units, unitSystem, warning };
}

export default function HYSYSOptimizerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseWarning, setParseWarning] = useState<string | null>(null);
  const [importData, setImportData] = useState<HYSYSImportData | null>(null);
  const [scenario, setScenario] = useState<ScenarioParams>(DEFAULT_SCENARIO);
  const [userNotes, setUserNotes] = useState('');
  const [processDescription, setProcessDescription] = useState('');
  const [result, setResult] = useState<OptimizerRunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [processType, setProcessType] = useState<ProcessType>('general');
  const [optimizationFocus, setOptimizationFocus] = useState('balanced');
  const [showDataPreview, setShowDataPreview] = useState(false);
  const [sortField, setSortField] = useState<SortField>('revenueOrSavingsUSDPerYear');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);
  const [showExportHelp, setShowExportHelp] = useState(false);
  const [configCollapsed, setConfigCollapsed] = useState(false);
  const [unitSystemOverride, setUnitSystemOverride] = useState<UnitSystem | null>(null);

  const resultsRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const effectiveUnitSystem = unitSystemOverride ?? importData?.unitSystem ?? 'SI';

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFile(f ?? null);
    setParseError(null);
    setParseWarning(null);
    setImportData(null);
    setResult(null);
    setConfigCollapsed(false);
    setUnitSystemOverride(null);
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        const ext = (f.name.split('.').pop() ?? '').toLowerCase();
        if (ext === 'json') {
          const data = JSON.parse(text) as HYSYSImportData | Record<string, unknown>[];
          if (Array.isArray(data)) {
            const { streams, units, unitSystem, warning } = inferStreamsAndUnits(data);
            setImportData({ streams, units, unitSystem });
            if (warning) setParseWarning(warning);
          } else {
            const imported: HYSYSImportData = {
              unitSystem: (data as HYSYSImportData).unitSystem ?? 'SI',
              streams: (data as HYSYSImportData).streams,
              units: (data as HYSYSImportData).units,
              raw: data as unknown as Record<string, unknown>,
              processType: (data as HYSYSImportData).processType,
            };
            setImportData(imported);
            if ((data as HYSYSImportData).processType) {
              setProcessType((data as HYSYSImportData).processType!);
            }
          }
        } else if (ext === 'csv' || ext === 'txt') {
          // Use papaparse for robust CSV parsing (#16)
          const parsed = Papa.parse<Record<string, unknown>>(text, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            transformHeader: (h: string) => h.trim().replace(/^["']|["']$/g, ''),
          });
          if (parsed.errors.length > 0) {
            const firstError = parsed.errors[0];
            setParseWarning(`CSV parse warning: ${firstError.message} (row ${firstError.row})`);
          }
          const rows = parsed.data;
          const { streams, units, unitSystem, warning } = inferStreamsAndUnits(rows);
          setImportData({ streams, units, unitSystem, sourceFile: f.name });
          if (warning) setParseWarning(warning);
        } else {
          setParseError('Use CSV or JSON. For Excel, export as CSV first.');
        }
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Parse error');
      }
    };
    reader.readAsText(f);
  }, []);

  const runOptimization = async () => {
    if (!importData) return;
    setLoading(true);
    setError(null);
    setLoadingStage('Preparing request...');

    const controller = new AbortController();
    abortRef.current = controller;

    // Timeout at 30s
    const timeout = setTimeout(() => {
      controller.abort();
      setError('Request timed out after 30 seconds. Please try again.');
      setLoading(false);
    }, 30000);

    // Show "taking longer" after 10s
    const slowTimer = setTimeout(() => {
      setLoadingStage(`Taking longer than expected... Analyzing ${importData.streams?.length ?? 0} streams and ${importData.units?.length ?? 0} units...`);
    }, 10000);

    const goals = OPTIMIZATION_FOCUS_OPTIONS.find((o) => o.value === optimizationFocus)?.goals
      ?? ['cost', 'energy', 'production', 'carbon'];

    // Apply unit system override
    const dataToSend = unitSystemOverride
      ? { ...importData, unitSystem: unitSystemOverride }
      : importData;

    try {
      setLoadingStage(`Analyzing ${importData.streams?.length ?? 0} streams and ${importData.units?.length ?? 0} units...`);
      const res = await fetch('/api/hysys-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: dataToSend,
          scenario,
          userNotes: userNotes || undefined,
          processDescription: processDescription || undefined,
          processType,
          optimizationGoals: goals,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Request failed');
        return;
      }
      setResult(json as OptimizerRunResult);
      setConfigCollapsed(true);
      // Auto-scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Already handled by timeout
      } else {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    } finally {
      clearTimeout(timeout);
      clearTimeout(slowTimer);
      setLoading(false);
      setLoadingStage('');
      abortRef.current = null;
    }
  };

  const sortedSuggestions = useMemo(() => {
    if (!result?.allSuggestions) return [];
    return [...result.allSuggestions].sort((a, b) => {
      const aVal = a[sortField] ?? 0;
      const bVal = b[sortField] ?? 0;
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [result?.allSuggestions, sortField, sortAsc]);

  // Group by goal category for section headers
  const groupedSuggestions = useMemo(() => {
    const groups: Record<string, OptimizationSuggestion[]> = {};
    for (const s of sortedSuggestions) {
      const cat = s.goalCategory ?? 'cost';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    }
    return groups;
  }, [sortedSuggestions]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const toggleCard = (id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const downloadCSV = () => {
    if (!result?.allSuggestions?.length) return;
    const headers = [
      'Action', 'Category', 'Goal', 'Expected effect', 'Before', 'After',
      'Improvement %', 'Production gain %', 'Energy savings %',
      'Revenue/savings $/yr', 'Constraints/assumptions', 'CAPEX/OPEX note',
      'Payback (yr)', 'Uncertainty',
    ];
    const rows = result.allSuggestions.map((s) => [
      s.action, s.category, s.goalCategory ?? '', s.expectedEffect,
      s.beforeValue ?? '', s.afterValue ?? '', s.improvementPct ?? '',
      s.productionGainPct ?? '', s.energySavingsPct ?? '',
      s.revenueOrSavingsUSDPerYear, s.constraintsOrAssumptions, s.capexOpexNote,
      s.paybackYears ?? '', s.uncertainty,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hysys-optimizer-${result.runId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE_CONTENT], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hysys-optimizer-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const metrics = result?.summaryMetrics;

  // Confidence breakdown counts
  const uncertaintyCounts = useMemo(() => {
    if (!result?.allSuggestions) return { low: 0, medium: 0, high: 0 };
    const counts = { low: 0, medium: 0, high: 0 };
    for (const s of result.allSuggestions) {
      const u = s.uncertainty ?? 'medium';
      if (u in counts) counts[u as keyof typeof counts]++;
    }
    return counts;
  }, [result?.allSuggestions]);

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <Header />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-white dark:bg-gray-950 pt-32 lg:pt-40 pb-20">
        {/* Subtle radial gradient blob */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            {/* Badge pill */}
            <div className="inline-flex items-center px-3 py-1 rounded-full border border-gray-300 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 mb-6">
              <BarChart3 className="w-4 h-4 mr-2" />
              AI-Powered Process Optimization
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6 leading-[1.1]">
              Optimization{' '}
              <span className="text-blue-600">Insights</span>
            </h1>

            {/* Subheadline */}
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto leading-relaxed">
              Upload Aspen HYSYS stream and unit exports. Get AI-driven optimization suggestions with estimated savings, payback periods, and uncertainty ratings.
            </p>
          </div>
        </div>
      </section>

      <main className="flex-1 bg-white dark:bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">

        {/* Configuration section — collapsible after run */}
        {configCollapsed ? (
          <button
            type="button"
            onClick={() => setConfigCollapsed(false)}
            className="mb-6 text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <Settings2 className="w-4 h-4" />
            Edit parameters &amp; re-run
          </button>
        ) : (
          <div className="space-y-6">
            {/* Export help / CSV template (#10) */}
            <section>
              <button
                type="button"
                onClick={() => setShowExportHelp(!showExportHelp)}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                <HelpCircle className="w-4 h-4" />
                {showExportHelp ? 'Hide' : 'How to export from HYSYS + expected format'}
              </button>
              {showExportHelp && (
                <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-sm space-y-3">
                  <p className="font-medium text-gray-700 dark:text-gray-300">Expected CSV columns</p>
                  <div className="grid sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="font-medium text-gray-600 dark:text-gray-400 mb-1">Streams</p>
                      <code className="block bg-gray-100 dark:bg-gray-800 p-2 rounded">
                        stream_id, temperature_c, pressure_kpa,<br />
                        mass_flow_kg_h, vapor_fraction, composition
                      </code>
                      <p className="mt-1 text-gray-500 dark:text-gray-400">
                        US units: temperature_f, pressure_psig, mass_flow_lb_h
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-600 dark:text-gray-400 mb-1">Units</p>
                      <code className="block bg-gray-100 dark:bg-gray-800 p-2 rounded">
                        unit_id, type, duty_mw, reflux_ratio,<br />
                        pressure_kpa, design_limit_notes
                      </code>
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-gray-600 dark:text-gray-400 mb-1">How to export from Aspen HYSYS</p>
                    <ol className="list-decimal list-inside text-gray-600 dark:text-gray-400 space-y-1 text-xs">
                      <li>Open your HYSYS case file</li>
                      <li>Go to Workbook &rarr; select Streams or Unit Operations tab</li>
                      <li>Right-click the data table &rarr; Export to CSV</li>
                      <li>Rename columns to match the expected names above (or use the template)</li>
                    </ol>
                  </div>
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline text-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download CSV template
                  </button>
                </div>
              )}
            </section>

            {/* Upload */}
            <section>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                HYSYS export (CSV or JSON)
              </label>
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center bg-white dark:bg-gray-900">
                <input
                  type="file"
                  accept=".csv,.json,.txt"
                  onChange={handleFile}
                  className="hidden"
                  id="hysys-file"
                />
                <label htmlFor="hysys-file" className="cursor-pointer flex flex-col items-center gap-2">
                  <Upload className="w-10 h-10 text-gray-500" />
                  <span className="text-gray-600 dark:text-gray-400">
                    {file ? file.name : 'Choose file (CSV/JSON). For Excel, export as CSV.'}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const sample: HYSYSImportData = {
                      unitSystem: 'SI',
                      streams: [
                        { stream_id: 'feed-1', temperature_c: 85, pressure_kpa: 1200, mass_flow_kg_h: 15000, vapor_fraction: 0, composition: { Water: 0.6, Ethanol: 0.4 } },
                        { stream_id: 'distillate', temperature_c: 78, pressure_kpa: 200, mass_flow_kg_h: 6000, vapor_fraction: 1 },
                        { stream_id: 'bottoms', temperature_c: 102, pressure_kpa: 220, mass_flow_kg_h: 9000, vapor_fraction: 0 },
                      ],
                      units: [
                        { unit_id: 'col-1', type: 'distillationColumn', duty_mw: 2.5, reflux_ratio: 1.8, pressure_kpa: 200 },
                        { unit_id: 'reboiler-1', type: 'reboiler', duty_mw: 2.2 },
                        { unit_id: 'condenser-1', type: 'condenser', duty_mw: -2.0 },
                      ],
                    };
                    setImportData(sample);
                    setFile(null);
                    setParseError(null);
                    setParseWarning(null);
                    setResult(null);
                    setConfigCollapsed(false);
                    setUnitSystemOverride(null);
                  }}
                  className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Load sample data (no file)
                </button>
                {parseError && (
                  <p className="mt-2 text-red-600 dark:text-red-400 flex items-center justify-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    {parseError}
                  </p>
                )}
                {parseWarning && (
                  <p className="mt-2 text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    {parseWarning}
                  </p>
                )}
                {importData && !parseWarning && (
                  <p className="mt-2 text-green-600 dark:text-green-400 flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    Loaded: {importData.streams?.length ?? 0} streams, {importData.units?.length ?? 0} units
                  </p>
                )}
              </div>
            </section>

            {/* Unit system toggle (#8) */}
            {importData && (
              <section className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                <Info className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Detected: <span className="font-medium">{effectiveUnitSystem === 'SI' ? 'SI (°C, kPa, kg/h)' : 'US (°F, psig, lb/h)'}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setUnitSystemOverride(effectiveUnitSystem === 'SI' ? 'US' : 'SI')}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Switch to {effectiveUnitSystem === 'SI' ? 'US' : 'SI'}
                </button>
              </section>
            )}

            {/* Data preview */}
            {importData && (
              <section>
                <button
                  type="button"
                  onClick={() => setShowDataPreview(!showDataPreview)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {showDataPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showDataPreview ? 'Hide' : 'Show'} data preview
                </button>
                {showDataPreview && (
                  <div className="mt-3 space-y-4">
                    {importData.streams && importData.streams.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Streams ({importData.streams.length})</p>
                        <div className="overflow-x-auto max-h-60 overflow-y-auto rounded border border-gray-200 dark:border-gray-700">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-gray-100 dark:bg-gray-900">
                              <tr>
                                <th className="text-left p-2 font-medium">Stream ID</th>
                                <th className="text-right p-2 font-medium">Temp ({effectiveUnitSystem === 'US' ? 'F' : 'C'})</th>
                                <th className="text-right p-2 font-medium">Pressure ({effectiveUnitSystem === 'US' ? 'psig' : 'kPa'})</th>
                                <th className="text-right p-2 font-medium">Mass flow ({effectiveUnitSystem === 'US' ? 'lb/h' : 'kg/h'})</th>
                                <th className="text-right p-2 font-medium">VF</th>
                              </tr>
                            </thead>
                            <tbody>
                              {importData.streams.map((s, i) => (
                                <tr key={s.stream_id ?? i} className="border-t border-gray-100 dark:border-gray-700/50">
                                  <td className="p-2 font-medium">{s.stream_id ?? s.name ?? `stream-${i}`}</td>
                                  <td className="p-2 text-right">{s.temperature_c ?? s.temperature_f ?? '—'}</td>
                                  <td className="p-2 text-right">{s.pressure_kpa ?? s.pressure_psig ?? '—'}</td>
                                  <td className="p-2 text-right">{s.mass_flow_kg_h ?? s.mass_flow_lb_h ?? '—'}</td>
                                  <td className="p-2 text-right">{s.vapor_fraction != null ? s.vapor_fraction : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {importData.units && importData.units.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Units ({importData.units.length})</p>
                        <div className="overflow-x-auto max-h-60 overflow-y-auto rounded border border-gray-200 dark:border-gray-700">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-gray-100 dark:bg-gray-900">
                              <tr>
                                <th className="text-left p-2 font-medium">Unit ID</th>
                                <th className="text-left p-2 font-medium">Type</th>
                                <th className="text-right p-2 font-medium">Duty (MW)</th>
                                <th className="text-right p-2 font-medium">Reflux</th>
                                <th className="text-left p-2 font-medium">Design limits</th>
                              </tr>
                            </thead>
                            <tbody>
                              {importData.units.map((u, i) => (
                                <tr key={u.unit_id ?? i} className="border-t border-gray-100 dark:border-gray-700/50">
                                  <td className="p-2 font-medium">{u.unit_id ?? u.name ?? `unit-${i}`}</td>
                                  <td className="p-2">{u.type ?? '—'}</td>
                                  <td className="p-2 text-right">{u.duty_mw != null ? u.duty_mw : '—'}</td>
                                  <td className="p-2 text-right">{u.reflux_ratio != null ? u.reflux_ratio : '—'}</td>
                                  <td className="p-2 text-gray-500 dark:text-gray-400 max-w-xs truncate">{u.design_limit_notes ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Process description (#6) */}
            {importData && (
              <section>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Process description
                </label>
                <textarea
                  value={processDescription}
                  onChange={(e) => setProcessDescription(e.target.value)}
                  placeholder="e.g. Ethanol-water distillation column. Feed is 40 wt% ethanol at 85°C. Target distillate purity >95 wt% ethanol. Reboiler is steam-heated, 30 trays."
                  rows={3}
                  className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Helps the AI understand your process context. Raw stream data alone can&apos;t distinguish process types.
                </p>
              </section>
            )}

            {/* Process type + optimization focus (#12) */}
            {importData && (
              <section className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Factory className="w-4 h-4 inline mr-1" />
                    Process type
                  </label>
                  <select
                    value={processType}
                    onChange={(e) => setProcessType(e.target.value as ProcessType)}
                    className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm w-full"
                  >
                    {(Object.keys(PROCESS_TYPE_LABELS) as ProcessType[]).map((pt) => (
                      <option key={pt} value={pt}>{PROCESS_TYPE_LABELS[pt]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Primary optimization focus
                  </label>
                  <select
                    value={optimizationFocus}
                    onChange={(e) => setOptimizationFocus(e.target.value)}
                    className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm w-full"
                  >
                    {OPTIMIZATION_FOCUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </section>
            )}

            {/* Scenario parameters (#13) — show 3, collapse 2 */}
            <section>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Scenario parameters</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Energy ($/MWh)</label>
                  <input
                    type="number"
                    value={scenario.energyPriceUSDPerMWh ?? ''}
                    onChange={(e) =>
                      setScenario((s) => ({ ...s, energyPriceUSDPerMWh: e.target.value ? Number(e.target.value) : undefined }))
                    }
                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Carbon ($/tCO2)</label>
                  <input
                    type="number"
                    value={scenario.carbonPriceUSDPerTonne ?? ''}
                    onChange={(e) =>
                      setScenario((s) => ({ ...s, carbonPriceUSDPerTonne: e.target.value ? Number(e.target.value) : undefined }))
                    }
                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                    Operating hours (h/yr)
                    <span className="group relative">
                      <Info className="w-3 h-3 text-gray-400 cursor-help" />
                      <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded whitespace-nowrap z-10">
                        8400 h/yr = 95.9% on-stream
                      </span>
                    </span>
                  </label>
                  <input
                    type="number"
                    value={scenario.operatingHoursPerYear ?? ''}
                    onChange={(e) =>
                      setScenario((s) => ({ ...s, operatingHoursPerYear: e.target.value ? Number(e.target.value) : undefined }))
                    }
                    className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>

              {/* Advanced params */}
              <button
                type="button"
                onClick={() => setShowAdvancedParams(!showAdvancedParams)}
                className="mt-3 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${showAdvancedParams ? 'rotate-180' : ''}`} />
                Advanced
              </button>
              {showAdvancedParams && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                      Steam ($/MMBtu)
                      <span className="group relative">
                        <Info className="w-3 h-3 text-gray-400 cursor-help" />
                        <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded whitespace-nowrap z-10">
                          Used to cost steam-heated equipment
                        </span>
                      </span>
                    </label>
                    <input
                      type="number"
                      value={scenario.steamPriceUSDPerMMBtu ?? ''}
                      onChange={(e) =>
                        setScenario((s) => ({ ...s, steamPriceUSDPerMMBtu: e.target.value ? Number(e.target.value) : undefined }))
                      }
                      className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                      Product value ($/ton)
                      <span className="group relative">
                        <Info className="w-3 h-3 text-gray-400 cursor-help" />
                        <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded whitespace-nowrap z-10">
                          Used to value production throughput gains
                        </span>
                      </span>
                    </label>
                    <input
                      type="number"
                      value={scenario.productValueUSDPerTon ?? ''}
                      onChange={(e) =>
                        setScenario((s) => ({ ...s, productValueUSDPerTon: e.target.value ? Number(e.target.value) : undefined }))
                      }
                      className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Run notes */}
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Run notes (optional)</label>
              <input
                type="text"
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                placeholder="e.g. Q1 2026 base case"
                className="w-full max-w-md rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              />
            </div>

            {/* Run button */}
            <button
              type="button"
              onClick={runOptimization}
              disabled={!importData || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {loadingStage || 'Running...'}
                </>
              ) : (
                <>
                  <BarChart3 className="w-4 h-4" />
                  Run optimization
                </>
              )}
            </button>
          </div>
        )}

        {error && (
          <p className="mt-3 text-red-600 dark:text-red-400 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </p>
        )}

        {/* Results */}
        {result && (
          <section ref={resultsRef} className="mt-10 space-y-6">
            {/* Disclaimer banner (#7) */}
            <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-200">
                These are AI-generated screening estimates (~&plusmn;50% accuracy). Validate with rigorous simulation before implementation. Process changes require proper safety review (HAZOP, MOC).
              </p>
            </div>

            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold">Results</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Run {result.runId} &middot; {new Date(result.timestamp).toLocaleString()}
                {result.userNotes && ` · ${result.userNotes}`}
                {result.processType && ` · ${PROCESS_TYPE_LABELS[result.processType] ?? result.processType}`}
              </p>
            </div>

            {/* Two summary metric cards (#4) */}
            {metrics && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-4">
                  <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">Total potential savings</p>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                    ${metrics.totalSavingsUSDPerYear.toLocaleString()}
                    <span className="text-sm font-normal">/yr</span>
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Confidence breakdown</p>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="flex items-center gap-1.5 text-sm">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                      <span className="font-medium">{uncertaintyCounts.low}</span>
                      <span className="text-xs text-gray-500">low</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-sm">
                      <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                      <span className="font-medium">{uncertaintyCounts.medium}</span>
                      <span className="text-xs text-gray-500">medium</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-sm">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                      <span className="font-medium">{uncertaintyCounts.high}</span>
                      <span className="text-xs text-gray-500">high</span>
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Uncertainty legend (#9) */}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium">Uncertainty:</span>{' '}
              <span className="text-green-600 dark:text-green-400">Low</span> = well-supported by data.{' '}
              <span className="text-yellow-600 dark:text-yellow-400">Medium</span> = verify with simulation.{' '}
              <span className="text-red-600 dark:text-red-400">High</span> = directional only.
            </p>

            {result.validationSummary?.issues?.length > 0 && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-3">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Validation</p>
                <ul className="text-xs text-gray-600 dark:text-gray-400 list-disc list-inside">
                  {result.validationSummary.issues.map((issue, idx) => (
                    <li key={idx}>{issue.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.dataQualityGaps?.length > 0 && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">Data quality gaps</p>
                <ul className="text-sm text-amber-700 dark:text-amber-300 list-disc list-inside">
                  {result.dataQualityGaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Top 3 cards */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Top 3 high-ROI actions</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                {result.topSuggestions?.map((s, i) => (
                  <TopSuggestionCard key={s.id} suggestion={s} rank={i + 1} />
                ))}
              </div>
            </div>

            {/* Sort controls */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 dark:text-gray-400">Sort by:</span>
              <SortButton field="revenueOrSavingsUSDPerYear" label="$/yr" current={sortField} asc={sortAsc} onSort={handleSort} />
              <SortButton field="paybackYears" label="Payback" current={sortField} asc={sortAsc} onSort={handleSort} />
              <SortButton field="improvementPct" label="Improvement" current={sortField} asc={sortAsc} onSort={handleSort} />
            </div>

            {/* Expandable card list grouped by goal (#14, #5) */}
            {Object.entries(groupedSuggestions).map(([category, suggestions]) => {
              const goalColors = GOAL_COLORS[category as GoalCategory];
              return (
                <div key={category}>
                  <h3 className={`text-sm font-medium mb-3 flex items-center gap-2 ${goalColors?.text ?? 'text-gray-700 dark:text-gray-300'}`}>
                    <span className={`inline-block w-2 h-2 rounded-full ${
                      category === 'production' ? 'bg-blue-500' :
                      category === 'energy' ? 'bg-amber-500' :
                      category === 'carbon' ? 'bg-emerald-500' :
                      'bg-green-500'
                    }`} />
                    {GOAL_LABELS[category as GoalCategory] ?? category} ({suggestions.length})
                  </h3>
                  <div className="space-y-2">
                    {suggestions.map((s) => (
                      <SuggestionExpandableCard
                        key={s.id}
                        suggestion={s}
                        expanded={expandedCards.has(s.id)}
                        onToggle={() => toggleCard(s.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Download */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={downloadCSV}
                className="inline-flex items-center gap-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <Download className="w-4 h-4" />
                Download report (CSV)
              </button>
            </div>
          </section>
        )}
      </div>
      </main>

      <Footer />
    </div>
  );
}

/* --- Sub-components --- */

function SortButton({
  field,
  label,
  current,
  asc,
  onSort,
}: {
  field: SortField;
  label: string;
  current: SortField;
  asc: boolean;
  onSort: (f: SortField) => void;
}) {
  const isActive = current === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
        isActive
          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900'
      }`}
    >
      {label}
      {isActive ? (
        asc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  );
}

function TopSuggestionCard({ suggestion, rank }: { suggestion: OptimizationSuggestion; rank: number }) {
  const goalColors = suggestion.goalCategory ? GOAL_COLORS[suggestion.goalCategory] : null;
  const uncColors = UNCERTAINTY_COLORS[suggestion.uncertainty] ?? UNCERTAINTY_COLORS.medium;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">#{rank}</span>
          {suggestion.goalCategory && goalColors && (
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${goalColors.bg} ${goalColors.text}`}>
              {GOAL_LABELS[suggestion.goalCategory]}
            </span>
          )}
        </div>
        <UncertaintyBadge uncertainty={suggestion.uncertainty} />
      </div>
      <h4 className="font-medium text-gray-900 dark:text-white mb-1">{suggestion.action}</h4>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{suggestion.expectedEffect}</p>
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1 font-medium">
          <DollarSign className="w-3.5 h-3.5" />
          ${suggestion.revenueOrSavingsUSDPerYear?.toLocaleString()}/yr
        </span>
        {suggestion.paybackYears != null && (
          <span className="text-gray-500 dark:text-gray-400">Payback ~{suggestion.paybackYears} yr</span>
        )}
      </div>
    </div>
  );
}

function SuggestionExpandableCard({
  suggestion,
  expanded,
  onToggle,
}: {
  suggestion: OptimizationSuggestion;
  expanded: boolean;
  onToggle: () => void;
}) {
  const goalColors = suggestion.goalCategory ? GOAL_COLORS[suggestion.goalCategory] : null;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      {/* Collapsed header — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        <span className="flex-1 font-medium text-sm truncate">{suggestion.action}</span>
        {suggestion.goalCategory && goalColors && (
          <span className={`hidden sm:inline-block px-2 py-0.5 rounded text-xs font-medium ${goalColors.bg} ${goalColors.text}`}>
            {GOAL_LABELS[suggestion.goalCategory]}
          </span>
        )}
        <span className="text-sm font-medium whitespace-nowrap">
          ${suggestion.revenueOrSavingsUSDPerYear?.toLocaleString()}/yr
        </span>
        {suggestion.paybackYears != null && (
          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap hidden sm:inline">
            {suggestion.paybackYears} yr payback
          </span>
        )}
        <UncertaintyBadge uncertainty={suggestion.uncertainty} />
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-700/50 pt-3 space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">{suggestion.expectedEffect}</p>

          {(suggestion.beforeValue || suggestion.afterValue) && (
            <div className="rounded border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-2 text-xs">
              {suggestion.beforeValue && (
                <div className="text-gray-500 dark:text-gray-400">
                  <span className="font-medium">Before:</span> {suggestion.beforeValue}
                </div>
              )}
              {suggestion.afterValue && (
                <div className="text-gray-700 dark:text-gray-200">
                  <span className="font-medium">After:</span> {suggestion.afterValue}
                </div>
              )}
            </div>
          )}

          {suggestion.improvementPct != null && (
            <div>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-gray-500 dark:text-gray-400">Improvement</span>
                <span className="font-medium">{suggestion.improvementPct.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min(suggestion.improvementPct, 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3 text-xs">
            {suggestion.productionGainPct != null && (
              <span className="flex items-center gap-1">
                <BarChart3 className="w-3.5 h-3.5" />
                +{suggestion.productionGainPct}% prod
              </span>
            )}
            {(suggestion.energySavingsPct != null || suggestion.energySavingsMMBtuPerYear != null) && (
              <span className="flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                {suggestion.energySavingsPct != null
                  ? `${suggestion.energySavingsPct}% energy`
                  : `${suggestion.energySavingsMMBtuPerYear} MMBtu/yr`}
              </span>
            )}
            {suggestion.carbonReductionTonnePerYear != null && (
              <span className="flex items-center gap-1">
                <Leaf className="w-3.5 h-3.5" />
                {suggestion.carbonReductionTonnePerYear} tCO2/yr
              </span>
            )}
          </div>

          <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
            {suggestion.capexOpexNote && (
              <p><span className="font-medium">CAPEX/OPEX:</span> {suggestion.capexOpexNote}</p>
            )}
            {suggestion.constraintsOrAssumptions && (
              <p><span className="font-medium">Constraints:</span> {suggestion.constraintsOrAssumptions}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UncertaintyBadge({ uncertainty }: { uncertainty: string }) {
  const colors = UNCERTAINTY_COLORS[uncertainty] ?? UNCERTAINTY_COLORS.medium;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      {uncertainty}
    </span>
  );
}
