import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    equipment?: string;
    parameters?: Record<string, any>;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  data?: Record<string, any>;
}

export interface FlowSheetData {
  nodes: FlowNode[];
  edges: FlowEdge[];
  aspenInstructions: string;
  description: string;
}

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const systemPrompt = `You are a chemical engineering expert specializing in process flowsheets and Aspen HYSYS simulation. 
    Convert natural language process descriptions into structured flowsheet data.

    Return ONLY valid JSON in this exact format:
    {
      "nodes": [
        {
          "id": "unique_id",
          "type": "equipment_type",
          "position": {"x": number, "y": number},
          "data": {
            "label": "Equipment Name",
            "equipment": "equipment_type",
            "parameters": {"key": "value"}
          }
        }
      ],
      "edges": [
        {
          "id": "edge_id",
          "source": "source_node_id",
          "target": "target_node_id",
          "label": "stream_name",
          "data": {"flow_rate": "value", "temperature": "value"}
        }
      ],
      "aspenInstructions": "Step-by-step Aspen HYSYS setup instructions",
      "description": "Brief description of the process"
    }

    Equipment types: reactor, separator, heat_exchanger, pump, compressor, valve, mixer, splitter, distillation_column, absorber, stripper, flash_drum, storage_tank, heat_exchanger, cooler, heater, expander, turbine, fan, blower, filter, crystallizer, dryer, evaporator, condenser, reboiler, preheater, cooler, intercooler, aftercooler, economizer, superheater, desuperheater, knockout_drum, surge_drum, reflux_drum, accumulator, knock_out_drum, phase_separator, liquid_liquid_separator, gas_liquid_separator, solid_liquid_separator, cyclone, scrubber, absorber, stripper, extractor, decanter, settler, thickener, clarifier, centrifuge, filter_press, belt_filter, vacuum_filter, rotary_filter, pressure_filter, gravity_filter, magnetic_filter, electrostatic_filter, ion_exchange, adsorption, absorption, stripping, extraction, distillation, rectification, stripping, absorption, desorption, regeneration, crystallization, precipitation, coagulation, flocculation, sedimentation, filtration, centrifugation, drying, evaporation, concentration, purification, separation, fractionation, rectification, stripping, absorption, desorption, regeneration, crystallization, precipitation, coagulation, flocculation, sedimentation, filtration, centrifugation, drying, evaporation, concentration, purification, separation, fractionation.

    Position nodes logically with proper spacing (x: 0-1000, y: 0-800).
    Include relevant process parameters in node data.
    Create meaningful connections between equipment.
    Provide detailed Aspen HYSYS setup instructions.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });

    const responseText = completion.choices[0]?.message?.content;
    
    if (!responseText) {
      throw new Error('No response from OpenAI');
    }

    // Parse and validate JSON response
    let flowsheetData: FlowSheetData;
    try {
      flowsheetData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', responseText);
      return NextResponse.json(
        { error: 'Invalid JSON response from AI' },
        { status: 500 }
      );
    }

    // Validate required fields
    if (!flowsheetData.nodes || !flowsheetData.edges || !flowsheetData.aspenInstructions) {
      return NextResponse.json(
        { error: 'Invalid flowsheet data structure' },
        { status: 500 }
      );
    }

    return NextResponse.json(flowsheetData);

  } catch (error) {
    console.error('Error in flowsheet API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
