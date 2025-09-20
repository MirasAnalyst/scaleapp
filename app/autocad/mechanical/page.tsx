import { Metadata } from 'next';
import { Cog, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import GenerationForm from '../components/GenerationForm';
import DiagramPreview from '../components/DiagramPreview';

export const metadata: Metadata = {
  title: 'Mechanical AutoCAD Drawings | ScaleApp',
  description: 'Generate professional mechanical engineering drawings including pumps, compressors, heat exchangers, and piping layouts.',
};

export default function MechanicalPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white py-16">
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
              <Cog className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold">Mechanical Engineering</h1>
              <p className="text-xl text-white/80">Pumps, compressors, heat exchangers, pressure vessels, piping layouts</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 max-w-7xl py-12">
        {/* Generation Form */}
        <div className="mb-12">
          <GenerationForm 
            discipline="mechanical"
            placeholder="Example: Draw a pump-to-heat-exchanger loop with centrifugal pump (P-101), shell-and-tube heat exchanger (E-201), 4-inch carbon steel pipe, include 2 gate valves and 1 check valve, show flow arrows and tag callouts."
          />
        </div>

        {/* Diagram Preview */}
        <div className="mb-12">
          <DiagramPreview 
            discipline="mechanical"
            initialPrompt="Pump-to-heat-exchanger loop with centrifugal pump, shell-and-tube heat exchanger, 4-inch carbon steel pipe, gate valves, and check valve"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Features & Info */}
          <div className="space-y-8">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                Mechanical Engineering Features
              </h2>
              <ul className="space-y-4">
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Block Libraries</h3>
                    <p className="text-gray-600 dark:text-gray-400">Comprehensive symbol libraries for pumps, valves, heat exchangers, and more</p>
                  </div>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Layer Templates</h3>
                    <p className="text-gray-600 dark:text-gray-400">Pre-configured layers following industry standards and best practices</p>
                  </div>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">BOM Export</h3>
                    <p className="text-gray-600 dark:text-gray-400">Automatic bill of materials generation with equipment specifications</p>
                  </div>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">2D/3D Views</h3>
                    <p className="text-gray-600 dark:text-gray-400">Multiple view generation including plan, elevation, and isometric views</p>
                  </div>
                </li>
              </ul>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Common Mechanical Systems
              </h3>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                <li>• Pump and piping systems</li>
                <li>• Heat exchanger networks</li>
                <li>• Compressor skids and air systems</li>
                <li>• Pressure vessel layouts</li>
                <li>• Process flow diagrams (PFDs)</li>
                <li>• Piping and instrumentation diagrams (P&IDs)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
