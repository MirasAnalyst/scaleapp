'use client';

import { useState } from 'react';
import { Copy, Check, Cog, Bolt, Building, ArrowRight } from 'lucide-react';
import { Discipline, PromptExample } from '../types';

const promptExamples: Record<Discipline, PromptExample[]> = {
  mechanical: [
    {
      title: 'Pump-to-Heat-Exchanger Loop',
      prompt: 'Draw a pump-to-heat-exchanger loop: centrifugal pump (P-101), shell-and-tube (E-201), 4-inch carbon steel pipe, include 2 gate valves and 1 check valve, show flow arrows and tag callouts.',
      discipline: 'mechanical'
    },
    {
      title: 'Compressor Skid Layout',
      prompt: 'Create a compressor skid layout 4m×3m with compressor, air receiver, filter, and maintenance clearances.',
      discipline: 'mechanical'
    },
    {
      title: 'P&ID Sheet',
      prompt: 'Generate a P&ID sheet with equipment tags, line specs, and instrument bubbles per ISA S5.1.',
      discipline: 'mechanical'
    }
  ],
  electrical: [
    {
      title: 'Single-Line Diagram',
      prompt: 'Produce a single-line diagram: utility > main switchboard 480V, three feeders to MCCs, metering and protective devices per NEC.',
      discipline: 'electrical'
    },
    {
      title: 'Cable Tray Routes',
      prompt: 'Lay out cable tray routes on Level 2 with 300mm width, include drop points to panels E-201–E-206.',
      discipline: 'electrical'
    },
    {
      title: 'Panel Schedule',
      prompt: 'Create a panel schedule for 24 circuits with spare breakers and load summaries.',
      discipline: 'electrical'
    }
  ],
  civil: [
    {
      title: 'Site Plan',
      prompt: 'Draft a site plan at 1:200 with building footprint, parking, sidewalks, and utility connections.',
      discipline: 'civil'
    },
    {
      title: 'Grading Plan',
      prompt: 'Generate grading with 2% slope away from building and spot elevations at corners.',
      discipline: 'civil'
    },
    {
      title: 'Stormwater Network',
      prompt: 'Add stormwater network with manholes every 50m and connect to main line.',
      discipline: 'civil'
    }
  ]
};

const disciplineIcons = {
  mechanical: Cog,
  electrical: Bolt,
  civil: Building
};

const disciplineLabels = {
  mechanical: 'Mechanical',
  electrical: 'Electrical',
  civil: 'Civil'
};

export default function PromptExamples() {
  const [activeTab, setActiveTab] = useState<Discipline>('mechanical');
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);

  const copyToClipboard = async (text: string, promptTitle: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPrompt(promptTitle);
      setTimeout(() => setCopiedPrompt(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <section className="py-24 bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-16">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-sm font-medium mb-6">
            <Copy className="w-4 h-4 mr-2" />
            Example Prompts
          </div>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
            Try These Prompts
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed">
            Get started with these professional examples. Click to copy and customize for your projects.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {Object.entries(disciplineLabels).map(([key, label]) => {
            const IconComponent = disciplineIcons[key as Discipline];
            const isActive = activeTab === key;
            
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key as Discipline)}
                className={`group inline-flex items-center px-6 py-3 rounded-lg font-semibold transition-all duration-300 ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600'
                }`}
                aria-label={`Switch to ${label} examples`}
              >
                <IconComponent className="w-5 h-5 mr-2" />
                {label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {promptExamples[activeTab].map((example, index) => (
            <div
              key={index}
              className="group bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-100 dark:border-gray-700"
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {example.title}
                </h3>
                <button
                  onClick={() => copyToClipboard(example.prompt, example.title)}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  aria-label={`Copy prompt: ${example.title}`}
                >
                  {copiedPrompt === example.title ? (
                    <>
                      <Check className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-green-500">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span className="text-sm">Copy</span>
                    </>
                  )}
                </button>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-mono text-sm">
                  {example.prompt}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-16">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white">
            <h3 className="text-2xl font-bold mb-4">
              Ready to Create Your Own?
            </h3>
            <p className="text-lg mb-6 opacity-90">
              Start with these examples and customize them for your specific project needs.
            </p>
            <a
              href="/signup"
              className="inline-flex items-center space-x-2 bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              <span>Get Started Free</span>
              <ArrowRight className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
