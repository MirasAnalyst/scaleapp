import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import FlowsheetMockup from './FlowsheetMockup';

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-white dark:bg-gray-950 pt-32 lg:pt-40 pb-20">
      {/* Subtle radial gradient */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-12 lg:gap-12 items-center">
          {/* Left column — copy */}
          <div className="lg:col-span-6 mb-12 lg:mb-0">
            {/* Badge pill */}
            <div className="inline-flex items-center px-3 py-1 rounded-full border border-gray-300 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 mb-6">
              AI-Powered Engineering Platform
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6 leading-[1.1]">
              Create entire plants in{' '}
              <span className="text-blue-600">seconds</span>
            </h1>

            {/* Subheadline */}
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-lg leading-relaxed">
              Generate Process Flow Diagrams (PFDs) and unlock industrial optimization insights worth millions—in minutes, not weeks. Join 10,000+ engineers already building the future.
            </p>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row gap-3 mb-10">
              <Link
                href="/builder"
                className="group inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Start Building Free
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <a
                href="https://cal.com/miras-muratov-uyocve/30min"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-6 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Schedule Demo
              </a>
            </div>

            {/* Inline stats */}
            <div className="flex items-center divide-x divide-gray-200 dark:divide-gray-800 text-sm">
              <div className="pr-6">
                <span className="block text-2xl font-bold text-gray-900 dark:text-white">10,000+</span>
                <span className="text-gray-500 dark:text-gray-400">Active Engineers</span>
              </div>
              <div className="px-6">
                <span className="block text-2xl font-bold text-gray-900 dark:text-white">95%</span>
                <span className="text-gray-500 dark:text-gray-400">Time Saved</span>
              </div>
              <div className="pl-6">
                <span className="block text-2xl font-bold text-gray-900 dark:text-white">$2M+</span>
                <span className="text-gray-500 dark:text-gray-400">Cost Savings</span>
              </div>
            </div>
          </div>

          {/* Right column — product mockup */}
          <div className="lg:col-span-6">
            <FlowsheetMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
