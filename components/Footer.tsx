import Link from "next/link";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
              <img src="/favicon.png" alt="ScaleApp" className="w-6 h-6 rounded" />
              ScaleApp
            </Link>
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs">
              AI-powered engineering platform for flowsheets, P&IDs, and process design.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4">Product</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/builder" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Flowsheet Builder
                </Link>
              </li>
              <li>
                <Link href="/hysys-optimizer" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Optimization Insights
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4">Company</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/about" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4">Connect</h4>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://www.linkedin.com/in/miras-muratov-7535741b3/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  LinkedIn
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/MirasAnalyst"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-800">
          <p className="text-sm text-gray-400 dark:text-gray-500">
            &copy; {currentYear} ScaleApp. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
