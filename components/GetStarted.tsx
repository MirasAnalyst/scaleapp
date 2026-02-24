import { ArrowRight } from "lucide-react";

export default function GetStarted() {
  return (
    <section className="py-20 bg-white dark:bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative bg-gray-900 rounded-2xl overflow-hidden px-8 py-16 sm:px-16 text-center">
          {/* Radial glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent pointer-events-none" />

          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Start building in minutes
            </h2>
            <p className="text-gray-400 text-lg mb-8 max-w-xl mx-auto">
              5 free designs — no credit card required. Generate production-ready flowsheets with AI.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="/builder"
                className="group inline-flex items-center justify-center px-6 py-3 bg-white text-gray-900 font-medium rounded-lg hover:bg-gray-100 transition-colors"
              >
                Get Started
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
              </a>
              <a
                href="/login"
                className="inline-flex items-center justify-center px-6 py-3 border border-gray-600 text-gray-300 font-medium rounded-lg hover:border-gray-500 hover:text-white transition-colors"
              >
                Log In
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
