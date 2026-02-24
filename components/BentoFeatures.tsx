import Link from 'next/link';
import { Zap, Target, TrendingUp } from 'lucide-react';

const features = [
  {
    icon: Zap,
    title: 'Flowsheets in Seconds',
    description:
      'Generate complete process flowsheets for oil, gas, chemical, and industrial plants from a single prompt. Go from idea to detailed design in minutes—not weeks.',
    colSpan: 'md:col-span-2',
    rowSpan: 'md:row-span-2',
    href: '/builder',
  },
  {
    icon: Target,
    title: 'Engineer-Level Precision',
    description:
      'Built on rigorous thermodynamic models (PR, SRK, NRTL, UNIFAC). Every simulation meets the same standards as manual Aspen HYSYS setups—without the learning curve.',
    colSpan: 'md:col-span-2',
    rowSpan: 'md:row-span-2',
    href: '',
  },
  {
    icon: TrendingUp,
    title: 'Optimize & Scale',
    description:
      'Run parametric studies, optimize operating conditions, and scale from concept to production-ready designs with built-in convergence tools.',
    colSpan: 'md:col-span-4',
    rowSpan: '',
    href: '/hysys-optimizer',
  },
];

export default function BentoFeatures() {
  return (
    <section className="py-24 bg-white dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Everything you need to design at scale
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl">
            From concept to production-ready flowsheets, ScaleApp gives engineering teams the tools to move faster with confidence.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            const cardClass = `${feature.colSpan} ${feature.rowSpan} block bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 transition-colors hover:border-gray-300 dark:hover:border-gray-700`;
            const content = (
              <>
                <div className="w-10 h-10 rounded-lg bg-blue-600/10 dark:bg-blue-500/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {feature.description}
                </p>
              </>
            );
            return feature.href ? (
              <Link key={feature.title} href={feature.href} className={cardClass}>
                {content}
              </Link>
            ) : (
              <div key={feature.title} className={cardClass}>
                {content}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
