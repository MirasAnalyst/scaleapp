'use client';

import { Cog, Bolt, Building, ArrowRight, Play, FileText, Download, CheckCircle } from 'lucide-react';
import { Discipline } from './types';
import DisciplineCard from './sections/DisciplineCard';
import PromptExamples from './components/PromptExamples';
import CTA from './components/CTA';

const disciplines: Array<{
  discipline: Discipline;
  icon: React.ReactNode;
  title: string;
  description: string;
  bullets: string[];
  href: string;
}> = [
  {
    discipline: 'mechanical',
    icon: <Cog className="w-8 h-8" />,
    title: 'Mechanical',
    description: 'Pumps, compressors, heat exchangers, pressure vessels, piping layouts.',
    bullets: ['Block libraries', 'Layer templates', 'BOM export', '2D/3D views'],
    href: '/autocad/mechanical'
  },
  {
    discipline: 'electrical',
    icon: <Bolt className="w-8 h-8" />,
    title: 'Electrical',
    description: 'Single-line diagrams, panel schedules, cable trays, grounding plans.',
    bullets: ['IEC/NEC symbols', 'Wire tags', 'Load calc placeholders', 'Revision clouds'],
    href: '/autocad/electrical'
  },
  {
    discipline: 'civil',
    icon: <Building className="w-8 h-8" />,
    title: 'Civil',
    description: 'Site plans, grading, utility routing, foundations.',
    bullets: ['Contours', 'Setout points', 'Title blocks', 'Sheet sets'],
    href: '/autocad/civil'
  }
];

export default function AutoCADPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
          <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
          
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
            <div className="text-center">
              {/* Badge */}
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-sm font-medium mb-8">
                <FileText className="w-4 h-4 mr-2" />
                AutoCAD Integration
              </div>

              {/* Main Headline */}
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 dark:text-white mb-6 leading-tight">
                AutoCAD Diagram
                <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"> Construction</span>
              </h1>

              {/* Subheadline */}
              <p className="text-xl sm:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto leading-relaxed">
                Generate professional 2D/3D drawings from natural-language prompts—organized by discipline.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
                <a
                  href="/signup"
                  className="group inline-flex items-center px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl"
                >
                  <span>Get Started</span>
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </a>
                <button
                  onClick={() => document.getElementById('prompt-examples')?.scrollIntoView({ behavior: 'smooth' })}
                  className="group inline-flex items-center px-8 py-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-semibold rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-300 hover:scale-105"
                >
                  <Play className="w-5 h-5 mr-2" />
                  <span>Try a Prompt</span>
                </button>
              </div>

              {/* Trust Indicators */}
              <div className="mt-16">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Works with</p>
                <div className="flex flex-wrap justify-center items-center gap-8 opacity-60">
                  <div className="text-lg font-semibold text-gray-400">AutoCAD</div>
                  <div className="text-lg font-semibold text-gray-400">AutoCAD Electrical</div>
                  <div className="text-lg font-semibold text-gray-400">Compatible CAD Tools</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Discipline Grid */}
        <section className="py-24 bg-white dark:bg-black">
          <div className="container mx-auto px-4 max-w-7xl">
            <div className="text-center mb-16">
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-sm font-medium mb-6">
                <CheckCircle className="w-4 h-4 mr-2" />
                Engineering Disciplines
              </div>
              <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
                Choose Your Discipline
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed">
                Specialized tools and templates for each engineering discipline. 
                <span className="font-semibold text-gray-900 dark:text-white"> Professional-grade results in minutes.</span>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {disciplines.map((discipline) => (
                <DisciplineCard
                  key={discipline.discipline}
                  icon={discipline.icon}
                  title={discipline.title}
                  description={discipline.description}
                  bullets={discipline.bullets}
                  href={discipline.href}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Prompt Examples */}
        <div id="prompt-examples">
          <PromptExamples />
        </div>

        {/* How It Works */}
        <section className="py-24 bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="text-center mb-16">
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-sm font-medium mb-6">
                <ArrowRight className="w-4 h-4 mr-2" />
                How It Works
              </div>
              <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
                From Idea to Drawing in 3 Steps
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed">
                Our AI-powered platform transforms your natural language descriptions into professional AutoCAD drawings.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <FileText className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">1. Describe Your Design</h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  Use natural language to describe your engineering requirements. Our AI understands technical terminology and industry standards.
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Cog className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">2. AI Drafts & Places Blocks</h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  Our AI automatically creates drawings with correct layers, symbols, and tags according to industry standards and your specifications.
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Download className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">3. Export to DWG/DXF</h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  Download your professional drawings in standard formats. Compatible with AutoCAD, AutoCAD Electrical, and all major CAD tools.
                </p>
              </div>
            </div>

            {/* Callout */}
            <div className="text-center mt-16">
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-100 dark:border-gray-700">
                <p className="text-lg text-gray-600 dark:text-gray-400">
                  <span className="font-semibold text-gray-900 dark:text-white">Works with AutoCAD, AutoCAD Electrical, and compatible CAD tools.</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <CTA />
      </div>
  );
}
