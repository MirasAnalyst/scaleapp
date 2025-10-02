'use client';

import { useState } from 'react';
import { Bolt, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import GenerationForm from '../components/GenerationForm';
import DiagramPreview from '../components/DiagramPreview';

export default function ElectricalPage() {
  const [generatedDiagram, setGeneratedDiagram] = useState<any>(null);
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Header */}
      <div className="bg-gradient-to-r from-yellow-600 to-orange-600 text-white py-16">
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
              <Bolt className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold">Electrical Engineering</h1>
              <p className="text-xl text-white/80">Single-line diagrams, panel schedules, cable trays, grounding plans</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 max-w-7xl py-12">
        {/* Generation Form */}
        <div className="mb-12">
          <GenerationForm 
            discipline="electrical"
            placeholder="Example: Produce a single-line diagram with utility feed to main switchboard 480V, three feeders to MCCs, metering and protective devices per NEC standards."
            onDiagramGenerated={setGeneratedDiagram}
          />
        </div>

        {/* Diagram Preview */}
        <div className="mb-12">
          <DiagramPreview 
            discipline="electrical"
            initialPrompt="Single-line diagram with utility feed to main switchboard 480V, three feeders to MCCs, metering and protective devices per NEC"
            generatedDiagram={generatedDiagram}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Features & Info */}
          <div className="space-y-8">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                Electrical Engineering Features
              </h2>
              <ul className="space-y-4">
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">IEC/NEC Symbols</h3>
                    <p className="text-gray-600 dark:text-gray-400">Comprehensive symbol libraries following international and national electrical codes</p>
                  </div>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Wire Tags</h3>
                    <p className="text-gray-600 dark:text-gray-400">Automatic wire numbering and tagging for easy identification and maintenance</p>
                  </div>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Load Calc Placeholders</h3>
                    <p className="text-gray-600 dark:text-gray-400">Pre-configured load calculation templates and placeholder fields</p>
                  </div>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Revision Clouds</h3>
                    <p className="text-gray-600 dark:text-gray-400">Automatic revision tracking and cloud markup for design changes</p>
                  </div>
                </li>
              </ul>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Common Electrical Systems
              </h3>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                <li>• Single-line diagrams (SLDs)</li>
                <li>• Panel schedules and load calculations</li>
                <li>• Cable tray and conduit routing</li>
                <li>• Grounding and bonding plans</li>
                <li>• Lighting and power layouts</li>
                <li>• Fire alarm and security systems</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
