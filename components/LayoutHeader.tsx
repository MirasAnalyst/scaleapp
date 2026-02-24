'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import AuthButton from '@/components/AuthButton';

export default function LayoutHeader() {
  const pathname = usePathname();

  // Landing page uses its own Header component
  if (pathname === '/') return null;

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link
              href="/"
              className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <img src="/favicon.png" alt="ScaleApp" className="w-7 h-7 rounded" />
              ScaleApp
            </Link>
          </div>
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
