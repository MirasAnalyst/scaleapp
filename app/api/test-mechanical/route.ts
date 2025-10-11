import { NextRequest, NextResponse } from 'next/server';

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

    console.log('[test-mechanical] Received prompt:', prompt.slice(0, 100));

    // Simple fallback spec without any complex imports
    const spec = {
      project: {
        name: `Test System for "${prompt.slice(0, 30)}"`,
        systemType: 'pump_station',
        units: 'mm',
        description: `Test generated spec for: ${prompt}`,
        revision: 'A',
        generatedAtIso: new Date().toISOString(),
      },
      components: [
        {
          id: 'PUMP-001',
          type: 'pump',
          name: 'Centrifugal Pump',
          dimensions: { lengthMm: 1000, widthMm: 500, heightMm: 500 },
          position: { xMm: 0, yMm: 0, zMm: 0 },
        },
        {
          id: 'TANK-001',
          type: 'tank',
          name: 'Inlet Tank',
          dimensions: { lengthMm: 2000, widthMm: 1000, heightMm: 1500 },
          position: { xMm: 2000, yMm: 0, zMm: 0 },
        },
      ],
    };

    // Simple DXF generation without complex imports
    const dxf = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1015
9
$HANDSEED
5
FFFF
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
70
1
0
LAYER
2
COMPONENTS
62
4
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
0
CIRCLE
8
COMPONENTS
10
0.0
20
0.0
30
0.0
40
250.0
0
CIRCLE
8
COMPONENTS
10
2000.0
20
0.0
30
0.0
40
500.0
0
TEXT
8
COMPONENTS
10
0.0
20
-300.0
30
0.0
40
100.0
1
Centrifugal Pump
0
TEXT
8
COMPONENTS
10
2000.0
20
-600.0
30
0.0
40
100.0
1
Inlet Tank
0
ENDSEC
0
EOF`;

    const filename = 'test-mechanical-system.dxf';

    console.log('[test-mechanical] DXF generated successfully:', filename);

    return new NextResponse(dxf, {
      status: 200,
      headers: {
        'Content-Type': 'application/dxf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
        'X-Mechanical-System': 'pump_station',
        'X-Mechanical-Components': '2',
        'X-AI-Generated': 'false'
      }
    });
  } catch (error) {
    console.error('[test-mechanical] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Test Mechanical DXF Generator API',
    endpoints: {
      POST: '/api/test-mechanical - Generate test DXF from mechanical system description',
      parameters: {
        prompt: 'string - Mechanical system description'
      },
      response: 'Returns DXF file as attachment'
    }
  });
}
