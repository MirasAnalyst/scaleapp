'use client';

import React from 'react';
import { Package } from 'lucide-react';

interface PropertyPackageSelectorProps {
  value: string;
  onChange: (pkg: string) => void;
}

const PACKAGES: { value: string; label: string; description: string }[] = [
  {
    value: 'Peng-Robinson',
    label: 'Peng-Robinson',
    description: 'Best for hydrocarbons, natural gas, refinery. Industry standard EOS.',
  },
  {
    value: 'SRK',
    label: 'SRK (Soave-Redlich-Kwong)',
    description: 'Good for gas processing, similar to PR. Better for H2-rich systems.',
  },
  {
    value: 'NRTL',
    label: 'NRTL',
    description: 'Best for polar/non-ideal liquids: alcohols, water, acids, amines.',
  },
  {
    value: 'UNIFAC',
    label: 'UNIFAC',
    description: 'Group contribution method. Use when binary data is unavailable.',
  },
  {
    value: 'UNIQUAC',
    label: 'UNIQUAC',
    description: 'For strongly non-ideal liquid mixtures and LLE calculations.',
  },
];

export default function PropertyPackageSelector({ value, onChange }: PropertyPackageSelectorProps) {
  const selected = PACKAGES.find((p) => p.value === value);

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
        <Package className="w-3 h-3" /> Property Package
      </label>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
      >
        {PACKAGES.map((pkg) => (
          <option key={pkg.value} value={pkg.value}>
            {pkg.label}
          </option>
        ))}
      </select>

      {selected && (
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">
          {selected.description}
        </p>
      )}
    </div>
  );
}
