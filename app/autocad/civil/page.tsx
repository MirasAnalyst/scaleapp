import { Metadata } from 'next';
import { Building, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import GenerationForm from '../components/GenerationForm';
import DiagramPreview from '../components/DiagramPreview';

export const metadata: Metadata = {
  title: 'Civil AutoCAD Drawings | ScaleApp',
  description: 'Generate professional civil engineering drawings including site plans, grading, utility routing, and foundations.',
};

export default function CivilPage() {
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
              <h1 className="text-4xl font-bold">Civil Engineering</h1>
              <p className="text-xl text-white/80">Site plans, grading, utility routing, foundations</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 max-w-7xl py-12">
        {/* Generation Form */}
        <div className="mb-12">
          <GenerationForm 
            discipline="civil"
            placeholder="Example: Draft a site plan at 1:200 scale with building footprint, parking areas, sidewalks, and utility connections including water, sewer, and electrical services."
          />
        </div>

        {/* Diagram Preview */}
        <div className="mb-12">
          <DiagramPreview 
            discipline="civil"
            initialPrompt="Site plan at 1:200 scale with building footprint, parking areas, sidewalks, and utility connections"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Features & Info */}
          <div className="space-y-8">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                Civil Engineering Features
              </h2>
              <ul className="space-y-4">
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Contours</h3>
                    <p className="text-gray-600 dark:text-gray-400">Automatic contour generation and elevation modeling for site analysis</p>
                  </div>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Setout Points</h3>
                    <p className="text-gray-600 dark:text-gray-400">Precise coordinate systems and setout point generation for construction</p>
                  </div>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Title Blocks</h3>
                    <p className="text-gray-600 dark:text-gray-400">Professional title blocks with project information and approval stamps</p>
                  </div>
                </li>
                <li className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Sheet Sets</h3>
                    <p className="text-gray-600 dark:text-gray-400">Organized sheet sets with proper numbering and cross-references</p>
                  </div>
                </li>
              </ul>
            </div>

            <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-8">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Common Civil Systems
              </h3>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                <li>• Site plans and master planning</li>
                <li>• Grading and earthwork plans</li>
                <li>• Utility routing and infrastructure</li>
                <li>• Foundation and structural layouts</li>
                <li>• Stormwater management systems</li>
                <li>• Road and parking lot design</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
