'use client';

import React, { useState } from 'react';
import { X, Droplets, Thermometer, Gauge, Activity } from 'lucide-react';
import { SimulationStreamResult } from '../lib/simulation';

interface StreamPropertyPanelProps {
  stream: SimulationStreamResult;
  onClose: () => void;
}

const fmt = (v: number | undefined | null, decimals = 2): string =>
  v != null ? v.toFixed(decimals) : '—';

const phaseColor = (phase?: string) => {
  switch (phase) {
    case 'vapor': return 'text-blue-500';
    case 'liquid': return 'text-cyan-600';
    case 'two-phase': return 'text-purple-500';
    default: return 'text-gray-500';
  }
};

export default function StreamPropertyPanel({ stream, onClose }: StreamPropertyPanelProps) {
  const [compBasis, setCompBasis] = useState<'mole' | 'mass'>('mole');

  const overallComp = compBasis === 'mass' && stream.mass_composition
    ? stream.mass_composition
    : stream.composition;
  const compLabel = compBasis === 'mass' ? 'mass frac' : 'mole frac';

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-800 shadow-2xl border-l border-gray-200 dark:border-gray-700 z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{stream.id}</h2>
          <span className={`text-sm font-medium ${phaseColor(stream.phase)}`}>
            {stream.phase ? stream.phase.charAt(0).toUpperCase() + stream.phase.slice(1) : 'Unknown'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Primary conditions */}
        <Section title="Conditions">
          <PropRow icon={<Thermometer className="w-4 h-4 text-red-500" />} label="Temperature" value={fmt(stream.temperature_c)} unit="°C" />
          <PropRow icon={<Gauge className="w-4 h-4 text-blue-500" />} label="Pressure" value={fmt(stream.pressure_kpa)} unit="kPa" />
          <PropRow icon={<Droplets className="w-4 h-4 text-cyan-500" />} label="Vapor Fraction" value={fmt(stream.vapor_fraction, 4)} unit="" />
          <PropRow icon={<Droplets className="w-4 h-4 text-blue-700" />} label="Liquid Fraction" value={fmt(stream.liquid_fraction, 4)} unit="" />
        </Section>

        {/* Flow rates */}
        <Section title="Flow Rates">
          <PropRow label="Mass Flow" value={fmt(stream.mass_flow_kg_per_h)} unit="kg/h" />
          <PropRow label="Molar Flow" value={fmt(stream.mole_flow_kmol_per_h, 4)} unit="kmol/h" />
          <PropRow label="Volume Flow" value={fmt(stream.volume_flow_m3_per_h, 4)} unit="m³/h" />
          <PropRow label="Std Gas Flow" value={fmt(stream.std_gas_flow_sm3_per_h, 4)} unit="Sm³/h" />
        </Section>

        {/* Thermodynamic properties */}
        <Section title="Thermodynamic Properties">
          <PropRow label="Enthalpy" value={fmt(stream.enthalpy_kj_per_kg)} unit="kJ/kg" />
          <PropRow label="Entropy" value={fmt(stream.entropy_kj_per_kg_k, 4)} unit="kJ/(kg·K)" />
          <PropRow label="Gibbs Energy" value={fmt(stream.gibbs_energy_kj_per_kg)} unit="kJ/kg" />
          <PropRow label="Heat Capacity (Cp)" value={fmt(stream.heat_capacity_kj_per_kg_k, 4)} unit="kJ/(kg·K)" />
          <PropRow label="Heat Capacity (Cv)" value={fmt(stream.heat_capacity_cv_kj_per_kg_k, 4)} unit="kJ/(kg·K)" />
          <PropRow label="Isentropic Exponent" value={fmt(stream.isentropic_exponent, 4)} unit="" />
          <PropRow label="Density" value={fmt(stream.density_kg_per_m3)} unit="kg/m³" />
          <PropRow label="Molecular Weight" value={fmt(stream.molecular_weight)} unit="g/mol" />
        </Section>

        {/* Transport properties */}
        <Section title="Transport Properties">
          <PropRow label="Viscosity" value={fmt(stream.viscosity_cp, 4)} unit="cP" />
          <PropRow label="Thermal Conductivity" value={fmt(stream.thermal_conductivity_w_per_mk, 4)} unit="W/(m·K)" />
          <PropRow label="Surface Tension" value={fmt(stream.surface_tension_n_per_m, 6)} unit="N/m" />
          <PropRow label="Speed of Sound" value={fmt(stream.speed_of_sound_m_per_s)} unit="m/s" />
          <PropRow label="Compressibility (Z)" value={fmt(stream.compressibility_factor, 4)} unit="" />
          <PropRow label="Joule-Thomson" value={fmt(stream.joule_thomson_k_per_kpa, 6)} unit="K/kPa" />
        </Section>

        {/* Overall composition with mole/mass toggle */}
        {overallComp && Object.keys(overallComp).length > 0 && (
          <Section title={`Overall Composition (${compLabel})`}>
            <div className="flex gap-1 mb-2">
              <button
                onClick={() => setCompBasis('mole')}
                className={`px-2 py-0.5 text-xs rounded ${compBasis === 'mole' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'}`}
              >
                Mole
              </button>
              <button
                onClick={() => setCompBasis('mass')}
                className={`px-2 py-0.5 text-xs rounded ${compBasis === 'mass' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'}`}
              >
                Mass
              </button>
            </div>
            <div className="space-y-1">
              {Object.entries(overallComp).map(([comp, frac]) => (
                <div key={comp} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300 capitalize">{comp}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${Math.min(frac * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-gray-900 dark:text-white font-mono w-16 text-right">
                      {(frac * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Vapor composition */}
        {stream.vapor_composition && Object.keys(stream.vapor_composition).length > 0 && (
          <Section title="Vapor Composition (mole frac)">
            <CompTable comp={stream.vapor_composition} />
          </Section>
        )}

        {/* Liquid composition */}
        {stream.liquid_composition && Object.keys(stream.liquid_composition).length > 0 && (
          <Section title="Liquid Composition (mole frac)">
            <CompTable comp={stream.liquid_composition} />
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        {title}
      </h3>
      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-2">
        {children}
      </div>
    </div>
  );
}

function PropRow({
  icon,
  label,
  value,
  unit,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
        {icon}
        <span>{label}</span>
      </div>
      <span className="font-mono text-gray-900 dark:text-white">
        {value} <span className="text-gray-400 text-xs">{unit}</span>
      </span>
    </div>
  );
}

function CompTable({ comp }: { comp: Record<string, number> }) {
  return (
    <div className="space-y-1">
      {Object.entries(comp).map(([name, frac]) => (
        <div key={name} className="flex items-center justify-between text-sm">
          <span className="text-gray-700 dark:text-gray-300 capitalize">{name}</span>
          <span className="font-mono text-gray-900 dark:text-white">{(frac * 100).toFixed(2)}%</span>
        </div>
      ))}
    </div>
  );
}
