'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ThemeSwitch from './ThemeSwitch';
import AuthButton from './AuthButton';

export default function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/80 dark:bg-gray-950/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <img src="/favicon.png" alt="ScaleApp" className="w-7 h-7 rounded" />
            ScaleApp
          </Link>

          {/* Center nav links */}
          <nav className="hidden md:flex items-center space-x-1">
            <Link
              href="/builder"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-4 py-2 rounded-md transition-colors"
            >
              Flowsheet Builder
            </Link>
            <Link
              href="/hysys-optimizer"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-4 py-2 rounded-md transition-colors"
            >
              Optimization Insights
            </Link>
            <Link
              href="/about"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-4 py-2 rounded-md transition-colors"
            >
              About
            </Link>
            <Link
              href="/contact"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-4 py-2 rounded-md transition-colors"
            >
              Contact
            </Link>
          </nav>

          {/* Right side */}
          <div className="flex items-center space-x-2">
            <ThemeSwitch />
            <AuthButton />
          </div>
        </div>
      </div>
    </header>
  );
}
