import { NextRequest, NextResponse } from 'next/server';
import { DXFGenerator } from '@/lib/diagram-generator/dxf-generator';
import { GeneratedDiagram } from '@/lib/diagram-generator/types';

export async function POST(request: NextRequest) {
  try {
    const body: { diagram: GeneratedDiagram } = await request.json();
    
    // Validate request
    if (!body.diagram) {
      return NextResponse.json(
        { 
          status: 'error', 
          message: 'Missing diagram data' 
        },
        { status: 400 }
      );
    }

    // Generate DXF file
    const dxfGenerator = new DXFGenerator();
    const dxfBuffer = dxfGenerator.generateDXF(body.diagram);
    
    // Create filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${body.diagram.discipline}_${body.diagram.id}_${timestamp}.dxf`;
    
    // Return DXF file as download
    return new NextResponse(dxfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/dxf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': dxfBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('Error in export-dxf API:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        message: 'Failed to export DXF file' 
      },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
