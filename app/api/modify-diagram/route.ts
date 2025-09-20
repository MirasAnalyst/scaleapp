import { NextRequest, NextResponse } from 'next/server';
import { Discipline } from '../../autocad/types';

interface ModifyRequest {
  discipline: Discipline;
  originalPrompt: string;
  modificationPrompt: string;
  currentDiagram?: any;
}

interface ModifyResponse {
  status: 'ok' | 'error';
  message?: string;
  data?: {
    modifiedDiagram: any;
    changes: string[];
    suggestions: string[];
    estimatedTime: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: ModifyRequest = await request.json();
    
    // Validate request
    if (!body.discipline || !body.modificationPrompt) {
      return NextResponse.json(
        { 
          status: 'error', 
          message: 'Missing required fields: discipline and modificationPrompt' 
        } as ModifyResponse,
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
        } as ModifyResponse,
        { status: 400 }
      );
    }

    // Simulate AI processing time
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Generate modification suggestions based on discipline
    const modificationSuggestions = {
      mechanical: [
        "Consider adding pressure monitoring points",
        "Include maintenance access points",
        "Add isolation valves for equipment maintenance",
        "Consider thermal expansion compensation"
      ],
      electrical: [
        "Add redundant power paths for critical loads",
        "Include power quality monitoring",
        "Consider future expansion capacity",
        "Add emergency lighting circuits"
      ],
      civil: [
        "Include drainage considerations",
        "Add accessibility compliance features",
        "Consider environmental impact mitigation",
        "Include future expansion planning"
      ]
    };

    // Simulate changes made
    const changes = [
      `Applied modification: ${body.modificationPrompt}`,
      "Updated layer structure for better organization",
      "Added proper dimensioning and annotations",
      "Included industry-standard symbols and blocks"
    ];

    const response: ModifyResponse = {
      status: 'ok',
      message: 'Diagram successfully modified with AI assistance',
      data: {
        modifiedDiagram: {
          // In a real implementation, this would contain the actual modified diagram data
          id: `modified_${Date.now()}`,
          discipline: body.discipline,
          originalPrompt: body.originalPrompt,
          modificationPrompt: body.modificationPrompt,
          timestamp: new Date().toISOString(),
          version: '2.0'
        },
        changes,
        suggestions: modificationSuggestions[body.discipline],
        estimatedTime: '1-3 minutes'
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error in modify-diagram API:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        message: 'Internal server error' 
      } as ModifyResponse,
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
