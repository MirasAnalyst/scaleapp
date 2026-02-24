# ScaleApp Design System Memory

## Brand Design Tokens (from Hero.tsx)
- **Page bg**: `bg-white dark:bg-gray-950` (NOT gray-900)
- **Gradient blob**: `bg-blue-500/5 rounded-full blur-3xl` (subtle, decorative only)
- **Badge pill**: `border border-gray-300 dark:border-gray-700` with `text-gray-600 dark:text-gray-400`
- **Headline**: `font-bold text-gray-900 dark:text-white` with accent word in `text-blue-600`
- **Body text**: `text-gray-600 dark:text-gray-400`
- **Primary CTA**: `bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg`
- **Secondary CTA**: `bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg`
- **Card borders**: `border border-gray-200 dark:border-gray-800` (no heavy shadows)
- **Input dark bg**: `dark:bg-gray-900` with `dark:border-gray-700`
- **Single accent**: blue-600. No purple. No gradient text. No scale transforms.

## Layout Patterns
- Max width: `max-w-7xl` with `px-4 sm:px-6 lg:px-8`
- Hero spacing: `pt-32 lg:pt-40 pb-20`
- Section spacing: `py-20`
- Grid: 12-col with `lg:grid-cols-3` for form+sidebar layouts

## Component Imports
- Header: `import Header from "components/Header"`
- Footer: `import Footer from "components/Footer"`
- Icons: lucide-react

## Key Files
- `/Users/admin/Documents/scaleapp/components/Hero.tsx` - canonical design reference
- `/Users/admin/Documents/scaleapp/app/contact/page.tsx` - restyled Feb 2026
