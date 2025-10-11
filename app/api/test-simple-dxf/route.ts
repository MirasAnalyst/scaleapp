import { NextRequest, NextResponse } from 'next/server';
import { generateSimpleMechanicalDXF } from '@/lib/mechanical-dxf-simple';

export async function GET() {
  try {
    const dxfString = generateSimpleMechanicalDXF();
    
    return new NextResponse(dxfString, {
      status: 200,
      headers: {
        'Content-Type': 'application/dxf',
        'Content-Disposition': 'attachment; filename="simple-mechanical.dxf"',
        'Cache-Control': 'no-cache',
      }
    });
  } catch (error) {
    console.error('Simple DXF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate simple DXF' },
      { status: 500 }
    );
  }
}
