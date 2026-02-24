'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { X, Search, Plus, FlaskConical } from 'lucide-react';

interface CompoundInfo {
  name: string;
  cas: string;
  formula?: string;
  molecular_weight?: number;
  boiling_point_c?: number;
}

interface CompoundPickerProps {
  selected: string[];
  onChange: (compounds: string[]) => void;
}

export default function CompoundPicker({ selected, onChange }: CompoundPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CompoundInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Search compounds from backend
  const searchCompounds = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/compounds?q=${encodeURIComponent(q)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.compounds ?? []);
      }
    } catch {
      // Backend might not be running — use fallback list
      setResults(
        FALLBACK_COMPOUNDS
          .filter((c) => c.toLowerCase().includes(q.toLowerCase()))
          .map((name) => ({ name, cas: '' }))
      );
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length >= 1) {
      debounceRef.current = setTimeout(() => searchCompounds(query), 250);
      setShowDropdown(true);
    } else {
      setResults([]);
      setShowDropdown(false);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchCompounds]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as HTMLElement)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const addCompound = (name: string) => {
    const normalized = name.toLowerCase().trim();
    if (!selected.includes(normalized)) {
      onChange([...selected, normalized]);
    }
    setQuery('');
    setShowDropdown(false);
  };

  const removeCompound = (name: string) => {
    onChange(selected.filter((c) => c !== name));
  };

  return (
    <div ref={containerRef} className="space-y-2">
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
        <FlaskConical className="w-3 h-3" /> Components
      </label>

      {/* Selected compounds as tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((comp) => (
            <span
              key={comp}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded text-xs capitalize"
            >
              {comp}
              <button
                onClick={() => removeCompound(comp)}
                className="hover:text-blue-900 dark:hover:text-blue-100"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 1 && setShowDropdown(true)}
          placeholder="Search compounds (e.g. methane, water)"
          className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        />

        {/* Dropdown results */}
        {showDropdown && (
          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {isSearching && (
              <div className="px-3 py-2 text-xs text-gray-500">Searching...</div>
            )}
            {!isSearching && results.length === 0 && query.length >= 1 && (
              <div className="px-3 py-2 text-xs text-gray-500">
                No compounds found. Try a different name.
              </div>
            )}
            {results
              .filter((r) => !selected.includes(r.name.toLowerCase()))
              .map((compound) => (
                <button
                  key={compound.cas || compound.name}
                  onClick={() => addCompound(compound.name)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between text-sm"
                >
                  <div>
                    <span className="text-gray-900 dark:text-white capitalize">{compound.name}</span>
                    {compound.formula && (
                      <span className="ml-2 text-gray-400 text-xs">{compound.formula}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 flex items-center gap-2">
                    {compound.molecular_weight != null && (
                      <span>MW: {compound.molecular_weight.toFixed(1)}</span>
                    )}
                    {compound.boiling_point_c != null && (
                      <span>Tb: {compound.boiling_point_c.toFixed(0)}°C</span>
                    )}
                    <Plus className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Fallback compounds when backend is not available
const FALLBACK_COMPOUNDS = [
  'water', 'methane', 'ethane', 'propane', 'n-butane', 'i-butane',
  'n-pentane', 'n-hexane', 'n-heptane', 'n-octane', 'n-nonane', 'n-decane',
  'ethylene', 'propylene', 'benzene', 'toluene', 'xylene',
  'methanol', 'ethanol', 'i-propanol', 'acetone',
  'hydrogen', 'nitrogen', 'oxygen', 'carbon dioxide', 'carbon monoxide',
  'hydrogen sulfide', 'ammonia', 'sulfur dioxide',
  'acetic acid', 'formic acid',
  'cyclohexane', 'styrene', 'phenol',
  'diethyl ether', 'tetrahydrofuran',
  'chloroform', 'dichloromethane',
  'dimethyl sulfoxide',
];
