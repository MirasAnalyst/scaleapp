import { Metadata } from 'next';

export const autocadMetadata: Metadata = {
  title: 'AutoCAD Diagram Construction | ScaleApp',
  description: 'Generate mechanical, electrical, and civil AutoCAD drawings from natural-language prompts. Export DWG/DXF with professional precision.',
  keywords: [
    'AutoCAD',
    'CAD drawings',
    'mechanical engineering',
    'electrical engineering',
    'civil engineering',
    'DWG',
    'DXF',
    'engineering diagrams',
    'P&ID',
    'single-line diagrams',
    'site plans'
  ],
  authors: [{ name: 'ScaleApp Team' }],
  creator: 'ScaleApp',
  publisher: 'ScaleApp',
  openGraph: {
    title: 'AutoCAD Diagram Construction | ScaleApp',
    description: 'Generate professional 2D/3D drawings from natural-language prompts—organized by discipline.',
    url: 'https://scaleapp.com/autocad',
    siteName: 'ScaleApp',
    images: [
      {
        url: '/og-autocad.png',
        width: 1200,
        height: 630,
        alt: 'AutoCAD Diagram Construction Platform',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AutoCAD Diagram Construction | ScaleApp',
    description: 'Generate professional 2D/3D drawings from natural-language prompts—organized by discipline.',
    images: ['/og-autocad.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://scaleapp.com/autocad',
  },
};

export const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'AutoCAD Diagram Construction',
  applicationCategory: 'EngineeringApplication',
  operatingSystem: 'Web Browser',
  description: 'Generate professional 2D/3D drawings from natural-language prompts—organized by discipline.',
  url: 'https://scaleapp.com/autocad',
  author: {
    '@type': 'Organization',
    name: 'ScaleApp',
  },
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'Free tier available',
  },
  featureList: [
    'Mechanical Engineering Diagrams',
    'Electrical Engineering Diagrams', 
    'Civil Engineering Diagrams',
    'DWG/DXF Export',
    'Natural Language Processing',
    'Professional Templates',
  ],
  supportedDisciplines: ['Mechanical', 'Electrical', 'Civil'],
};
