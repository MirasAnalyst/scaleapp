import { Metadata } from 'next';
import { autocadMetadata } from './metadata';

export const metadata: Metadata = autocadMetadata;

export default function AutoCADLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
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
          }),
        }}
      />
      {children}
    </>
  );
}
