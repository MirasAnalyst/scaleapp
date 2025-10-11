'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { 
  Cog, 
  ArrowLeft, 
  Download, 
  Loader2, 
  AlertCircle, 
  CheckCircle,
  DraftingCompass,
  Layers,
  FileCog,
  BadgeCheck
} from 'lucide-react';
import Link from 'next/link';

// Removed old interface definitions - now using simplified AI-powered generation

interface GenerationState {
  isSubmitting: boolean;
  error: string | null;
  success: boolean;
  warnings: string[];
  logs: string[];
  cadSource: 'ai-powered' | 'fallback' | null;
}

const samplePrompts = [
  'Produce a manufacturing drawing set for an API 610 double-volute centrifugal pump: front elevation, plan, and SECTION A-A through the impeller. Show casing split lines, impeller geometry, shaft diameters, mechanical seal, bearing housings, coupling guard, baseplate, and anchor bolt layout. Dimension everything in millimeters and output an AutoCAD R2018 DXF with industry layers.',
  'Generate a fabrication drawing for a shell-and-tube heat exchanger: include plan, elevation, SECTION B-B, and detail callouts for tube sheet, baffles, floating head cover, nozzle flanges, and support saddles. Provide tube bundle layout, bolt circle dimensions, gasket specifications, and instrumentation ports in millimeters, exported as AutoCAD-ready DXF.',
  'Create a detailed offshore pump skid drawing: twin centrifugal pumps with API 682 cartridge seals, duplex strainers, seal support plan, condensate tank, suction/discharge manifolds, and instrumentation tree. Include plan, elevation, maintenance clearances, and an enlarged detail of the mechanical seal assembly. Deliver an AutoCAD R2018 DXF with separate layers for equipment, piping, instrumentation, and annotations.'
];

const capabilityCards = [
  {
    title: 'Rotating Equipment Sections',
    description: 'Centrifugal pumps, compressors, and turbomachinery with sectional views and annotated internals.',
    points: ['Mechanical seals & bearings detailed', 'Impeller and shaft geometry callouts', 'API/ISO layer templates']
  },
  {
    title: 'Pressure Vessels & Heat Exchangers',
    description: 'Shell-and-tube exchangers, reactors, and filters with internals, supports, and nozzle schedules.',
    points: ['Baffle and tube sheet layouts', 'Bolt circles & gasket specifications', 'Support skirts and saddles']
  },
  {
    title: 'Skids & Integrated Systems',
    description: 'Modular machinery skids for offshore, marine, and launch systems with full instrumentation.',
    points: ['Plan/elevation with maintenance zones', 'Control & instrument layering', 'AutoCAD R2018 DXF output']
  }
];

const detailPresets = [
  {
    title: 'Add mechanical seal cartridge detail',
    subtitle: 'Stationary & rotating faces, springs, flush plan, gland plate',
    snippet: 'Include an enlarged mechanical seal detail showing the rotating face, stationary face, springs, sleeve, gland plate, flush plan piping, and o-rings with millimeter dimensions and material callouts.'
  },
  {
    title: 'Specify shaft & bearing stack-up',
    subtitle: 'Journals, shoulders, bearing types, lubrication paths',
    snippet: 'Call out the shaft diameters, keyways, thrust collar, bearing selection (DE/NDE), lubrication fittings, and retaining hardware with tolerances and surface finishes.'
  },
  {
    title: 'Detail impeller & casing cutwater',
    subtitle: 'Blade geometry, wear rings, diffuser, casing split',
    snippet: 'Add a sectional breakout of the impeller showing blade count, vane angles, wear-rings, diffuser tongue, and casing split joint including bolt pattern and gasket specification.'
  },
  {
    title: 'Include support & baseplate information',
    subtitle: 'Anchor bolts, grout holes, leveling pads, lifting lugs',
    snippet: 'Document the fabricated baseplate with anchor bolt sizes, grout pocket details, leveling screws, lifting lugs, drain openings, and material thickness.'
  }
];

const deliverableHighlights: Array<{ title: string; description: string; icon: LucideIcon }> = [
  {
    title: 'Sectional Orthographic Views',
    description: 'Plan, elevation, and sectional cuts expose mechanical seals, shafts, bearings, baffles, and internals with engineering callouts in millimeters.',
    icon: DraftingCompass
  },
  {
    title: 'Component-Level Specifications',
    description: 'Each drawing notes materials, tolerances, bolt circles, gasket types, and maintenance clearances ready for fabrication and assembly.',
    icon: Layers
  },
  {
    title: 'AutoCAD Proven Output',
    description: 'DXF files follow R2018 standards, generated with AI-powered precision, and open cleanly in AutoCAD, Inventor, and downstream CAD with organized layers and blocks.',
    icon: FileCog
  }
];

const initialGenerationState: GenerationState = {
  isSubmitting: false,
  error: null,
  success: false,
  warnings: [],
  logs: [],
  cadSource: null
};

export default function MechanicalPage() {
  const [prompt, setPrompt] = useState('');
  const [generationState, setGenerationState] = useState<GenerationState>(initialGenerationState);

  const handlePresetAppend = useCallback((snippet: string) => {
    setPrompt((prev) => {
      if (!prev.trim()) {
        return snippet;
      }
      if (prev.includes(snippet)) {
        return prev;
      }
      return `${prev.trimEnd()}\n\n${snippet}`;
    });
  }, [setPrompt]);

  // Removed polling functionality - now using direct AI-powered generation

  const parseHeaderList = useCallback((headerValue: string | null): string[] => {
    if (!headerValue) {
      return [];
    }
    try {
      const decoded = decodeURIComponent(headerValue);
      const parsed = JSON.parse(decoded);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item)).filter(Boolean);
      }
      if (typeof parsed === 'string' && parsed.trim().length > 0) {
        return [parsed.trim()];
      }
      return [];
    } catch {
      try {
        return headerValue
          .split(';')
          .map((value) => value.trim())
          .filter(Boolean);
      } catch {
        return [];
      }
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setGenerationState({
        ...initialGenerationState,
        error: 'Please describe the mechanical system you want to generate'
      });
      return;
    }

    setGenerationState({
      ...initialGenerationState,
      isSubmitting: true
    });

    try {
      const response = await fetch('/api/generate-mechanical', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt: prompt.trim() })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to generate mechanical DXF');
      }

      const cadSourceHeader = response.headers.get('X-Mechanical-Cad');
      const cadSource: GenerationState['cadSource'] =
        cadSourceHeader === 'dxf-ai' ? 'ai-powered' : 'fallback';
      const warningsHeader = response.headers.get('X-Mechanical-Warnings');
      const logsHeader = response.headers.get('X-Mechanical-Logs');
      const warnings = parseHeaderList(warningsHeader);
      const logsFromHeaders = parseHeaderList(logsHeader);

      // Get filename from headers
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'mechanical-layout.dxf';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }

      // Download the DXF file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setGenerationState({
        ...initialGenerationState,
        success: true,
        cadSource,
        warnings,
        logs:
          logsFromHeaders.length > 0
            ? logsFromHeaders
            : cadSource === 'ai-powered'
              ? ['AI-powered DXF generator fulfilled the request.']
              : ['Fallback DXF generator fulfilled the request.']
      });

      // Clear success message after 5 seconds
      setTimeout(() => {
        setGenerationState((prev) => ({ ...prev, success: false }));
      }, 5000);
    } catch (error) {
      setGenerationState({
        ...initialGenerationState,
        error: error instanceof Error ? error.message : 'An unexpected error occurred'
      });
    }
  }, [parseHeaderList, prompt]);

  const isBusy = generationState.isSubmitting;

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 text-white py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <Link
            href="/autocad"
            className="inline-flex items-center space-x-2 text-white/80 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to AutoCAD</span>
          </Link>

          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
              <Cog className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold">AI-Powered Mechanical Drawings</h1>
              <p className="text-xl text-white/80">
                Generate AutoCAD-ready manufacturing drawings with sectional views, internal components, and detailed engineering specifications - powered entirely by AI.
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-sm text-white/80">
                <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1">
                  <BadgeCheck className="w-4 h-4 mr-2" />
                  DXF tested in AutoCAD 2024
                </span>
                <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1">
                  <DraftingCompass className="w-4 h-4 mr-2" />
                  Sectional views with internal detail
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-5xl py-12">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-800 p-8 mb-10">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Mechanical System Description</h2>
          <div className="space-y-6">
            <div>
              <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                What mechanical system do you want to generate? (Include sections, internal components, materials, tolerances)
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe the equipment, sectional views, internal components, materials, tolerances, and standards required for the AutoCAD-ready drawing..."
                className="w-full h-36 px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-800 dark:text-white resize-none"
                disabled={isBusy}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Need more internal detail?</p>
                <span className="text-xs text-gray-500 dark:text-gray-400">Click to append requirements</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {detailPresets.map((preset) => (
                  <button
                    key={preset.title}
                    type="button"
                    onClick={() => handlePresetAppend(preset.snippet)}
                    className="text-left rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/40 px-4 py-3 hover:border-indigo-400 hover:bg-indigo-50/70 dark:hover:border-indigo-500 dark:hover:bg-indigo-900/20 transition-colors disabled:opacity-60"
                    disabled={isBusy}
                  >
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{preset.title}</p>
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{preset.subtitle}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <button
                onClick={handleGenerate}
                disabled={isBusy}
                className="inline-flex items-center justify-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-500 text-white font-medium rounded-lg transition-colors"
              >
                {generationState.isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Generating DXF...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5 mr-2" />
                    Generate & Download DXF
                  </>
                )}
              </button>

              {/* Removed polling UI - now using direct AI-powered generation */}

              {generationState.success && (
                <div className="flex items-center p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-600 dark:text-green-400">
                  <CheckCircle className="w-5 h-5 mr-2" />
                  <span className="font-medium">
                    {generationState.cadSource === 'ai-powered'
                      ? 'AI-powered drawing generated and downloaded successfully!'
                      : 'DXF file generated and downloaded successfully!'}
                  </span>
                </div>
              )}
            </div>

            {generationState.error && (
              <div className="flex items-start space-x-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-red-800 dark:text-red-200">Generation Error</h4>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">{generationState.error}</p>
                </div>
              </div>
            )}

            {/* Removed old state UI sections - now using simplified AI-powered generation */}
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-8 mb-10 border border-gray-100 dark:border-gray-800">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Sample Prompts</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Click a sample to preload the description. Each example requests sectional views, internal components, and AutoCAD R2018 DXF output that opens cleanly in AutoCAD.
          </p>
          <div className="space-y-3">
            {samplePrompts.map((example, index) => (
              <button
                key={index}
                onClick={() => setPrompt(example)}
                className="w-full text-left p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 hover:bg-indigo-50/80 dark:hover:bg-indigo-900/30 transition-colors"
              >
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{example}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-8 mb-10">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">What the AI Draws</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Expect manufacturing-grade sectional drawings with internal components, material specifications, and organized layers ready for fabrication workflows.
          </p>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            {deliverableHighlights.map(({ title, description, icon: Icon }) => (
              <div
                key={title}
                className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/40 p-5"
              >
                <Icon className="w-6 h-6 text-indigo-500 dark:text-indigo-300 mb-3" />
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {capabilityCards.map((card) => (
            <div
              key={card.title}
              className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm"
            >
              <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{card.title}</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{card.description}</p>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                {card.points.map((point) => (
                  <li key={point}>• {point}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
