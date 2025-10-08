import { NextRequest, NextResponse } from "next/server";
import { generateBuildingSpec } from "@/lib/openai";
import { generatePlanDXF, validateCoreFit } from "@/lib/dxf";
import { BuildingSpecType } from "@/lib/spec";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, overrides } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required and must be a string" },
        { status: 400 }
      );
    }

    // Generate building spec using OpenAI
    let spec: BuildingSpecType;
    try {
      spec = await generateBuildingSpec(prompt);
    } catch (error) {
      return NextResponse.json(
        { error: `Failed to generate building spec: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 400 }
      );
    }

    // Apply any overrides if provided
    if (overrides) {
      spec = { ...spec, ...overrides };
    }

    // Validate core fits within footprint
    if (!validateCoreFit(spec)) {
      return NextResponse.json(
        { error: "Core dimensions exceed footprint with required clearance" },
        { status: 400 }
      );
    }

    // Generate DXF content
    let dxfContent: string;
    try {
      dxfContent = generatePlanDXF(spec);
    } catch (error) {
      return NextResponse.json(
        { error: `Failed to generate DXF: ${error instanceof Error ? error.message : 'Unknown error'}` },
        { status: 500 }
      );
    }

    // Return DXF file
    const filename = `${spec.project.name.replace(/[^a-zA-Z0-9]/g, '_')}_plan.dxf`;
    
    return new NextResponse(dxfContent, {
      status: 200,
      headers: {
        "Content-Type": "application/dxf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    });

  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Optional: Add a GET endpoint for validation
export async function GET() {
  return NextResponse.json({
    message: "Building DXF Generator API",
    endpoints: {
      POST: "/api/generate - Generate DXF from building description",
      parameters: {
        prompt: "string - Building description",
        overrides: "object - Optional parameter overrides"
      }
    }
  });
}
