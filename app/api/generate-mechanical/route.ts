import { NextRequest, NextResponse } from 'next/server';
import { generateMechanicalSystemSpec } from '@/lib/mechanical-openai';
import { MechanicalSystemSpecType } from '@/lib/mechanical-spec';
import { generateMechanicalDXF } from '@/lib/mechanical-dxf-ai';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt } = body ?? {};

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required and must be a string' },
        { status: 400 }
      );
    }

    console.log('[generate-mechanical] Generating AI-powered mechanical system for:', prompt.slice(0, 100));

    const hasApiKey = !!process.env.OPENAI_API_KEY;
    if (!hasApiKey) {
      console.error('[generate-mechanical] OPENAI_API_KEY missing – cannot generate AI drawing');
      return NextResponse.json(
        { error: 'AI generation requires OPENAI_API_KEY. Please configure the key and try again.' },
        { status: 503 }
      );
    }

    let spec: MechanicalSystemSpecType;

    try {
      console.log('[generate-mechanical] Generating AI-powered mechanical system specification');
      spec = await generateMechanicalSystemSpec(prompt);
      console.log('[generate-mechanical] AI generation successful');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[generate-mechanical] AI generation failed:', message);
      return NextResponse.json(
        { error: `AI generation failed: ${message}` },
        { status: 502 }
      );
    }

    try {
      // Generate DXF using AI-powered generation
      console.log('[generate-mechanical] Generating DXF with spec:', JSON.stringify(spec, null, 2));
      const dxf = generateMechanicalDXF(spec);
      const filename = generateFilename(spec.project.systemType);
      
      console.log('[generate-mechanical] AI-powered DXF generated successfully:', filename);
      
      return new NextResponse(dxf, {
        status: 200,
        headers: {
          'Content-Type': 'application/dxf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-cache',
          'X-Mechanical-System': encodeURIComponent(spec.project.systemType),
          'X-Mechanical-Components': String(spec.components.length),
          'X-AI-Generated': 'true',
          'X-Generation-Method': 'AI-Powered',
          'X-Mechanical-Cad': 'dxf-ai',
        }
      });
    } catch (dxfError) {
      const message = dxfError instanceof Error ? dxfError.message : String(dxfError);
      console.error('[generate-mechanical] DXF generation failed:', message);
      return NextResponse.json(
        { error: `DXF generation failed: ${message}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[generate-mechanical] DXF generation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

function generateFilename(systemType: string): string {
  const baseName = systemType.replace(/_/g, '-');
  return `${baseName}-layout.dxf`;
}

export async function GET() {
  return NextResponse.json({
    message: 'AI-Powered Mechanical DXF Generator API',
    description: 'Generates detailed, professional mechanical drawings using AI - no FreeCAD required',
    endpoints: {
      POST: '/api/generate-mechanical - Generate AutoCAD DXF from mechanical system description',
      parameters: {
        prompt: 'string - Mechanical system description mentioning equipment, rockets, ships, etc.'
      },
      response: 'Returns professional DXF file as attachment ready to open in AutoCAD'
    }
  });
}
