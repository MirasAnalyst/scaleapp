'use client';

import { ArrowRight, FileText, Download } from 'lucide-react';
import Link from 'next/link';

export default function CTA() {
  return (
    <section className="py-24 bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center text-white">
          {/* Main Content */}
          <div className="max-w-4xl mx-auto mb-12">
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6">
              Design like a senior CAD engineer—without the learning curve
            </h2>
            <p className="text-xl sm:text-2xl mb-8 opacity-90 leading-relaxed">
              Generate professional AutoCAD drawings in minutes, not hours. Export to DWG/DXF and integrate seamlessly with your existing workflow.
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <Link
              href="/signup"
              className="group inline-flex items-center space-x-2 bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-all duration-300 hover:scale-105 shadow-lg"
            >
              <span>Start Free</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/docs/autocad"
              className="group inline-flex items-center space-x-2 bg-transparent border-2 border-white text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white hover:text-blue-600 transition-all duration-300 hover:scale-105"
            >
              <FileText className="w-5 h-5" />
              <span>Documentation</span>
            </Link>
          </div>

          {/* Feature Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="flex flex-col items-center text-center">
              <div className="bg-white bg-opacity-20 p-4 rounded-full mb-4">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Professional Templates</h3>
              <p className="text-sm opacity-80">Industry-standard templates and symbol libraries</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="bg-white bg-opacity-20 p-4 rounded-full mb-4">
                <Download className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2">DWG/DXF Export</h3>
              <p className="text-sm opacity-80">Compatible with AutoCAD and all major CAD tools</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="bg-white bg-opacity-20 p-4 rounded-full mb-4">
                <ArrowRight className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Seamless Integration</h3>
              <p className="text-sm opacity-80">Works with AutoCAD, AutoCAD Electrical, and compatible tools</p>
            </div>
          </div>

          {/* Trust Indicators */}
          <div className="mt-16">
            <p className="text-sm opacity-80 mb-6">Trusted by engineers at</p>
            <div className="flex flex-wrap justify-center items-center gap-8 opacity-60">
              <div className="text-lg font-semibold">Autodesk</div>
              <div className="text-lg font-semibold">Bentley</div>
              <div className="text-lg font-semibold">SolidWorks</div>
              <div className="text-lg font-semibold">PTC</div>
              <div className="text-lg font-semibold">Dassault</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
