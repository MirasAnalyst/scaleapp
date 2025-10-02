import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Electrical AutoCAD Drawings | ScaleApp',
  description: 'Generate professional electrical engineering drawings including single-line diagrams, panel schedules, cable trays, and grounding plans.',
};

export default function ElectricalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
