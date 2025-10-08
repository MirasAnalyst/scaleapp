'use client';

import { useState } from 'react';
import { Building, ArrowLeft, Download, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';

interface GenerationState {
  isLoading: boolean;
  error: string | null;
  success: boolean;
  filename: string | null;
}

export default function CivilPage() {
  const [prompt, setPrompt] = useState('');
  const [generationState, setGenerationState] = useState<GenerationState>({
    isLoading: false,
    error: null,
    success: false,
    filename: null
  });

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setGenerationState({
        isLoading: false,
        error: 'Please enter a building description',
        success: false,
        filename: null
      });
      return;
    }

    setGenerationState({
      isLoading: true,
      error: null,
      success: false,
      filename: null
    });

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate DXF');
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : 'building_plan.dxf';

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setGenerationState({
        isLoading: false,
        error: null,
        success: true,
        filename
      });

    } catch (error) {
      setGenerationState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
        success: false,
        filename: null
      });
    }
  };

  const samplePrompts = [
    "50-story office/residential tower called SkyOne on a 60×80 m site, setbacks 6/3/6 m, rectangle tower 42×30 m, grid 8.4×8.4 m, 4 stairs, 8 elevators, cores 14×22 m, typical floor 3.6 m, setbacks every 10 floors by 2 m. Output plans + dxf only.",
    "30-story residential building called GreenTower on a 40×60 ft site, setbacks 5/3/5 ft, rectangle tower 30×20 ft, grid 6×6 ft, 2 stairs, 4 elevators, cores 12×18 ft, typical floor 10 ft.",
    "20-story office building called TechHub on a 50×70 m site, setbacks 8/4/8 m, rectangle tower 35×25 m, grid 7×7 m, 3 stairs, 6 elevators, cores 15×20 m, typical floor 3.5 m."
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-teal-600 text-white py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <Link 
            href="/autocad" 
            className="inline-flex items-center space-x-2 text-white/80 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to AutoCAD</span>
          </Link>
          
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
              <Building className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold">AI Building Design</h1>
              <p className="text-xl text-white/80">Generate AutoCAD DXF files from natural language descriptions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 max-w-4xl py-12">
        {/* Generation Form */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Building Description
          </h2>
          
          <div className="space-y-6">
            <div>
              <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Describe your building project
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Example: 50-story office/residential tower called SkyOne on a 60×80 m site, setbacks 6/3/6 m, rectangle tower 42×30 m, grid 8.4×8.4 m, 4 stairs, 8 elevators, cores 14×22 m, typical floor 3.6 m, setbacks every 10 floors by 2 m. Output plans + dxf only."
                className="w-full h-32 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none"
              />
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={handleGenerate}
                disabled={generationState.isLoading}
                className="inline-flex items-center px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
              >
                {generationState.isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5 mr-2" />
                    Generate DXF
                  </>
                )}
              </button>

              {generationState.success && (
                <div className="flex items-center text-green-600 dark:text-green-400">
                  <CheckCircle className="w-5 h-5 mr-2" />
                  <span>DXF generated successfully!</span>
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
          </div>
        </div>

        {/* Sample Prompts */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-8 mb-8">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            Sample Prompts
          </h3>
          <div className="space-y-3">
            {samplePrompts.map((samplePrompt, index) => (
              <button
                key={index}
                onClick={() => setPrompt(samplePrompt)}
                className="w-full text-left p-4 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
              >
                <p className="text-sm text-gray-700 dark:text-gray-300">{samplePrompt}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              What&apos;s Generated
            </h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li>• Building footprint with proper dimensions</li>
              <li>• Core layout (stairs, elevators)</li>
              <li>• Structural grid system</li>
              <li>• Professional layers (A-WALL-FULL, A-CORE, A-GRID, A-ANNO-TEXT)</li>
              <li>• Project information and annotations</li>
              <li>• AutoCAD-compatible DXF format</li>
            </ul>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Supported Parameters
            </h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li>• Building name and type</li>
              <li>• Site dimensions and setbacks</li>
              <li>• Number of floors and floor height</li>
              <li>• Structural grid spacing</li>
              <li>• Core dimensions and layout</li>
              <li>• Units (meters or feet)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}