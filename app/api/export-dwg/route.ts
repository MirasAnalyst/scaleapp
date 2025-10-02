import { NextRequest, NextResponse } from 'next/server';
import { DWGGenerator } from '@/lib/diagram-generator/dwg-generator';
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

    // Generate DWG (DXF + instructions)
    const dwgGenerator = new DWGGenerator();
    const { dxfBuffer, instructions } = await dwgGenerator.generateDWG(body.diagram);
    
    // Create filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${body.diagram.discipline}_${body.diagram.id}_${timestamp}`;
    
    // Return response with DXF file and instructions
    return NextResponse.json({
      status: 'success',
      message: 'DWG export ready - DXF file generated with conversion instructions',
      data: {
        dxfFile: {
          buffer: dxfBuffer.toString('base64'),
          filename: `${filename}.dxf`,
          mimeType: 'application/dxf'
        },
        instructions: instructions,
        conversionMethods: [
          {
            name: 'AutoCAD Desktop',
            steps: [
              'Open AutoCAD software',
              'Use File > Open to open the DXF file',
              'Use File > Save As and select DWG format',
              'Choose your preferred DWG version'
            ]
          },
          {
            name: 'AutoCAD Web App',
            steps: [
              'Go to web.autocad.com',
              'Upload the DXF file',
              'Open the file in the web app',
              'Download as DWG format'
            ]
          },
          {
            name: 'Free CAD Software',
            steps: [
              'Use FreeCAD, LibreCAD, or QCAD',
              'Open the DXF file',
              'Export/Save as DWG format'
            ]
          }
        ],
        note: 'DXF files are fully compatible with AutoCAD and contain all the same drawing data as DWG files. The only difference is the file format (text-based vs binary).'
      }
    });

  } catch (error) {
    console.error('Error in export-dwg API:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        message: 'Failed to export DWG file' 
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
