import { NextRequest, NextResponse } from 'next/server';
import { GenerationRequest, GenerationResponse } from '../../autocad/types';
import { ElectricalDiagramGenerator } from '@/lib/diagram-generator/electrical-generator';
import { AIMechanicalGenerator } from '@/lib/diagram-generator/ai-mechanical-generator';
import { DiagramGenerationRequest } from '@/lib/diagram-generator/types';

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
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Generate diagram based on discipline
    let diagram;
    const diagramRequest: DiagramGenerationRequest = {
      discipline: body.discipline,
      prompt: body.prompt,
      options: {
        includeDimensions: true,
        includeLabels: true,
        style: 'professional'
      }
    };
    
    if (body.discipline === 'electrical') {
      const generator = new ElectricalDiagramGenerator();
      diagram = generator.generateDiagram(diagramRequest);
        } else if (body.discipline === 'mechanical') {
          const generator = new AIMechanicalGenerator();
          diagram = generator.generateDiagram(diagramRequest);
    } else {
      // For civil, return placeholder for now
      diagram = {
        id: `diagram_${Date.now()}`,
        discipline: body.discipline,
        title: `${body.discipline.charAt(0).toUpperCase() + body.discipline.slice(1)} Diagram`,
        components: [],
        connections: [],
        svg: `<svg viewBox="0 0 800 400" class="w-full h-full">
          <rect width="800" height="400" fill="#f8fafc" stroke="#e2e8f0" stroke-width="2"/>
          <text x="400" y="200" text-anchor="middle" class="text-lg font-bold fill-gray-800">
            ${body.discipline.charAt(0).toUpperCase() + body.discipline.slice(1)} Diagram
          </text>
          <text x="400" y="230" text-anchor="middle" class="text-sm fill-gray-600">
            Generated from: "${body.prompt}"
          </text>
        </svg>`,
        metadata: {
          generatedAt: new Date().toISOString(),
          prompt: body.prompt,
          estimatedTime: '2-5 minutes',
          outputFormats: ['DWG', 'DXF', 'SVG']
        }
      };
    }

    // Success response with generated diagram
    const response: GenerationResponse = {
      status: 'ok',
      message: 'AutoCAD diagram generated successfully',
      data: {
        discipline: body.discipline,
        prompt: body.prompt,
        estimatedTime: diagram.metadata.estimatedTime,
        outputFormats: diagram.metadata.outputFormats,
        features: {
          layers: 'Auto-generated with proper naming convention',
          blocks: 'Industry-standard symbol libraries',
          annotations: 'Automatic tagging and callouts',
          dimensions: 'Smart dimensioning based on discipline'
        },
        diagram: diagram // Include the generated diagram
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
