import { NextRequest, NextResponse } from 'next/server';
import { GenerationRequest, GenerationResponse } from '../../autocad/types';

export async function POST(request: NextRequest) {
  try {
    const body: GenerationRequest = await request.json();
    
    // Validate request
    if (!body.discipline || !body.prompt) {
      return NextResponse.json(
        { 
          status: 'error', 
          message: 'Missing required fields: discipline and prompt' 
        } as GenerationResponse,
        { status: 400 }
      );
    }

    // Validate discipline
    const validDisciplines = ['mechanical', 'electrical', 'civil'];
    if (!validDisciplines.includes(body.discipline)) {
      return NextResponse.json(
        { 
          status: 'error', 
          message: 'Invalid discipline. Must be one of: mechanical, electrical, civil' 
        } as GenerationResponse,
        { status: 400 }
      );
    }

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Placeholder response
    const response: GenerationResponse = {
      status: 'ok',
      message: 'AutoCAD diagram generation initiated successfully',
      data: {
        discipline: body.discipline,
        prompt: body.prompt,
        estimatedTime: '2-5 minutes',
        outputFormats: ['DWG', 'DXF'],
        features: {
          layers: 'Auto-generated with proper naming convention',
          blocks: 'Industry-standard symbol libraries',
          annotations: 'Automatic tagging and callouts',
          dimensions: 'Smart dimensioning based on discipline'
        }
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error in generate-autocad API:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        message: 'Internal server error' 
      } as GenerationResponse,
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
