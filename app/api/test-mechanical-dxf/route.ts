import { NextRequest, NextResponse } from 'next/server';
import { generateTestMechanicalDXF } from '@/lib/mechanical-dxf-test';

export async function GET() {
  try {
    const dxfString = generateTestMechanicalDXF();
    
    return new NextResponse(dxfString, {
      status: 200,
      headers: {
        'Content-Type': 'application/dxf',
        'Content-Disposition': 'attachment; filename="test-mechanical.dxf"',
        'Cache-Control': 'no-cache',
      }
    });
  } catch (error) {
    console.error('Test mechanical DXF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate test mechanical DXF' },
      { status: 500 }
    );
  }
}
