import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Lazy initialization of OpenAI client
function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    equipment?: string;
    parameters?: Record<string, any>;
    ports?: {
      inlets: string[];
      outlets: string[];
    };
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  data?: Record<string, any>;
}

export interface FlowSheetData {
  nodes: FlowNode[];
  edges: FlowEdge[];
  dwsimInstructions: string;
  description: string;
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, retryCount = 0 } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable.' },
        { status: 500 }
      );
    }

    const systemPrompt = `You are a chemical engineering expert specializing in process flowsheets and DWSIM simulation. 
    Convert natural language process descriptions into structured flowsheet data that can be executed in DWSIM.

    IMPORTANT: Generate flowsheets compatible with DWSIM's capabilities. The flowsheet will be executed in DWSIM, not Aspen HYSYS.
    Use DWSIM-supported unit operations, property packages, and parameter formats.

    CRITICAL: Return ONLY valid JSON. Do NOT include markdown code blocks, explanations, or any other text.
    Return ONLY the JSON object starting with { and ending with }.
    
    Required JSON format:
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
          "type": "step",
          "label": "stream_name",
          "data": {"flow_rate": "value", "temperature": "value"},
          "style": {"strokeWidth": 2, "stroke": "#6B7280"},
          "markerEnd": {"type": "arrowclosed", "width": 20, "height": 20, "color": "#6B7280"}
        }
      ],
      "dwsimInstructions": "Step-by-step DWSIM setup instructions",
      "description": "Brief description of the process"
    }

    🧪 DWSIM-SUPPORTED UNIT OPERATIONS (use these EXACT types):
    - distillationColumn (DistillationColumn - with reboiler and condenser)
    - packedColumn (PackedColumn - packed distillation/absorption)
    - absorber (AbsorptionColumn - gas absorption)
    - stripper (StrippingColumn - liquid stripping)
    - flashDrum (FlashDrum - flash separator)
    - separator (Separator - 2-phase separator)
    - separator3p (ThreePhaseSeparator - 3-phase separator)
    - tank (Tank - storage tank)
    - surgeDrum (SurgeDrum - surge drum)
    - knockoutDrumH (KnockoutDrum - knockout drum)
    - heaterCooler (Heater - heater/cooler)
    - shellTubeHX (HeatExchanger - shell & tube HX)
    - airCooler (AirCooler - air-cooled exchanger)
    - kettleReboiler (KettleReboiler - kettle reboiler)
    - firedHeater (FiredHeater - fired heater/furnace)
    - cstr (CSTR - continuous stirred tank reactor)
    - pfr (PFR - plug flow reactor)
    - gibbsReactor (GibbsReactor - Gibbs free energy reactor)
    - equilibriumReactor (EquilibriumReactor - equilibrium reactor)
    - conversionReactor (ConversionReactor - conversion reactor)
    - pump (Pump - centrifugal pump)
    - compressor (Compressor - compressor)
    - turbine (Turbine - expander/turbine)
    - valve (Valve - control valve)
    - mixer (Mixer - stream mixer)
    - splitter (Splitter - stream splitter)
    - filter (Filter - filter/strainer)
    - cyclone (Cyclone - cyclone separator)
    - adsorber (Adsorber - adsorption unit)
    - membrane (Membrane - membrane separator)
    - boiler (Boiler - boiler)
    - condenser (Condenser - condenser)
    - label (Label - text labels)

    ⚠️ DWSIM LIMITATIONS - DO NOT USE (these will be mapped to alternatives):
    - recipPump, recipCompressor (not supported - use pump/compressor instead)
    - controlValve, checkValve, prv, throttleValve (use valve instead)
    - plateHX, doublePipeHX (use shellTubeHX instead)
    - batchReactor (use cstr instead)
    - steamTurbine (use turbine instead)
    - tee (use splitter instead)
    - horizontalVessel (use tank or separator instead)

    🔬 DWSIM PROPERTY PACKAGES (use in thermo.package):
    - "Peng-Robinson" (default, recommended for hydrocarbons)
    - "Soave-Redlich-Kwong" or "SRK" (for hydrocarbons)
    - "NRTL" (for polar compounds, liquid-liquid)
    - "UNIFAC" (for mixtures with limited data)
    - "UNIQUAC" (for polar mixtures)
    - "Lee-Kesler-Plöcker" (for hydrocarbons)
    - "IAPWS-IF97" (for water/steam)
    - "Chao-Seader" (for petroleum)
    - "Grayson-Streed" (for petroleum)

    📊 STREAM PROPERTIES (use in stream.data.properties):
    - temperature: temperature in Celsius (required for feed streams)
    - pressure: pressure in kPa (required for feed streams)
    - flow_rate: mass flow in kg/h (optional, can be calculated)
    - composition: mole fractions as object {"C1": 0.5, "C2": 0.3, ...} (required for feed streams)
    - vapor_fraction: vapor fraction 0-1 (optional)

    🔌 PORT CONNECTIONS - Use these EXACT handle IDs for proper PHYSICAL positioning:
    
    **Distillation Columns & Towers (vertical equipment):**
    - distillationColumn, packedColumn, absorber, stripper
    - Inlets: reflux-top (top of column), feed-stage-6, feed-stage-8, feed-stage-10, feed-stage-12, feed-stage-18 (side at feed stage), feed-left, in-left
    - Outlets: overhead-top (top of column), bottoms-bottom (bottom of column), sidedraw-<n>-<phase> (side at stage)
    - LOGICAL POSITIONING: Vapor products exit from TOP, liquid products exit from BOTTOM
    
    **Separators (vertical equipment):**
    - separator3p: Inlets: feed-left (side) | Outlets: gas-top (top), oil-right (side), water-bottom (bottom)
    - separator, flashDrum, surgeDrum, knockoutDrumH: Inlets: feed-left (side) | Outlets: vapor-top (top), liquid-bottom (bottom)
    - LOGICAL POSITIONING: Gas/vapor exits TOP, heavy liquid exits BOTTOM, light liquid exits SIDE
    
    **Rotating Equipment (horizontal flow):**
    - pump, recipPump, compressor, recipCompressor, turbine
    - Inlets: suction-left (left side) | Outlets: discharge-right (right side)
    - LOGICAL POSITIONING: Flow is LEFT to RIGHT (suction → discharge)
    
    **Heat Exchangers (horizontal flow):**
    - shellTubeHX, plateHX, doublePipeHX, heaterCooler, condenser, airCooler
    - Hot side: hot-in-left (left), hot-out-right (right)
    - Cold side: cold-in-bottom (bottom), cold-out-top (top)
    - LOGICAL POSITIONING: Hot streams flow horizontally, cold streams flow vertically
    - CRITICAL: Every heat exchanger MUST have at least ONE side connected (hot OR cold)
    - For coolers/condensers: Connect the hot process stream (hot-in-left → hot-out-right)
    - For heaters: Connect the cold process stream (cold-in-bottom → cold-out-top)
    - If both sides are used, connect BOTH hot and cold streams with separate edges
    
    **Valves (horizontal flow):**
    - valve, controlValve, checkValve, throttleValve
    - Inlets: in-left (left side) | Outlets: out-right (right side)
    - LOGICAL POSITIONING: Flow is LEFT to RIGHT
    
    **Tanks & Vessels (vertical flow):**
    - tank: Inlets: in-top (top) | Outlets: out-bottom (bottom)
    - mixer: Inlets: in-1-left, in-2-left, in-3-left (sides) | Outlets: out-right (right side)
    - splitter, tee: Inlets: in-left (left side) | Outlets: out-1-right, out-2-right, out-3-right (right sides)
    - LOGICAL POSITIONING: Tanks flow TOP to BOTTOM, mixers/splitters flow LEFT to RIGHT

    🔗 WIRING RULES (MANDATORY):
    - Every edge MUST have sourceHandle and targetHandle
    - sourceHandle must ALWAYS be an 'outlet' handle of the source node
    - targetHandle must ALWAYS be an 'inlet' handle of the target node
    - Flow direction: left→right where possible; vertical only when physically required
    - Columns: overhead-top for vapor, bottoms-bottom for liquid, reflux-top for reflux
    - Separators: gas-top, oil-right, water-bottom for 3-phase; vapor-top, liquid-bottom for 2-phase
    - Rotating equipment: suction-left → discharge-right
    - Heat exchangers: never cross-connect hot/cold sides
    - Auto-correct wrong ports and note corrections in dwsimInstructions

    🗺️ Layout (positions) & naming:
    - Place nodes left-to-right from feed to product (x: 0–1200, y: 0–1000)
    - CRITICAL SPACING REQUIREMENTS:
      * Minimum 200 px horizontal spacing between equipment units
      * Minimum 250 px vertical spacing between parallel equipment (columns, pumps)
      * Minimum 300 px spacing between different process trains
      * Ensure clear visual separation so users can easily follow "what goes after what"
    - Align parallel trains horizontally with generous spacing
    - Use the full available space (x: 0–1200, y: 0–1000) to spread equipment out
    
    📐 SPECIFIC POSITIONING GUIDELINES:
    - Separators: Position at x: 100-200, y: 200-400
    - Pumps: Position at x: 400-500, y: 100-600 (with 250px vertical spacing between pumps)
    - Distillation Columns: Position at x: 700-800, y: 50-750 (with 300px vertical spacing between columns)
    - Heat Exchangers: Position at x: 500-600, y: 200-500
    - Tanks: Position at x: 900-1000, y: 200-600
    - For 3 parallel trains: Use y: 100, 400, 700 for clear separation
    - For 2 parallel trains: Use y: 200, 500 for clear separation
    
    Name nodes and streams consistently:
    - Nodes: sep-1, pump-oil-1, comp-1, hx-01, col-dist-1, etc.
    - Streams: feed-01, oil-01, gas-01, water-01, overhead-01, bottoms-01, recycle-01, flare-01, steam-600kPa, cw-30C
    
    When generating the flowsheet, always be detailed in the choice of equipment and unit operations, so that no major process equipment is missed. Include all unit operations that would normally appear in a DWSIM flowsheet to make the process operational (e.g., separators, pumps, compressors, heat exchangers, columns, reactors, valves, mixers, splitters).
    Only include the main process material streams that connect these units (feed streams, product streams, and intermediate streams). Do not include auxiliary or utility streams (e.g., steam, cooling water, fuel gas, flare lines, drains, vents) and do not include controller signal lines. The flowsheet should focus on the complete core process pathway as it would appear in DWSIM.
    
    IMPORTANT: Use only DWSIM-supported unit operations listed above. If you need a unit type not in the list, use the closest alternative from the supported list.
    
    🔗 CONNECTIVITY REQUIREMENTS (MANDATORY):
    - EVERY piece of equipment MUST be connected to at least one other piece of equipment via stream lines
    - NO equipment should be completely isolated (no connections at all)
    - Create a COMPLETE and CONTINUOUS process flow from feed to final products
    - All equipment must be part of the main process pathway - no standalone units
    - Ensure that all equipment/unit operations are properly connected with process stream lines, in the same way they would be interconnected in a DWSIM process flowsheet, so the result forms a complete and continuous process flow
    - If you create multiple equipment pieces, they MUST all be connected in a logical process sequence
    CRITICAL: Never create edges that connect a node to itself (source and target cannot be the same node). All edges must connect different equipment units.
    IMPORTANT: For separation processes, create separate equipment units for each product stream (e.g., separate pumps for gas, oil, water products from a separator).
    
    🚨 ABSOLUTE RULE: NO COMPLETELY ISOLATED EQUIPMENT ALLOWED
    - If you create a heat exchanger, pump, compressor, separator, column, or ANY equipment, it MUST be connected
    - Every piece of equipment must have at least one connection (incoming OR outgoing)
    - Equipment with NO connections at all will cause the generation to fail
    - VALID PATTERNS: Feed equipment (only outgoing), Product equipment (only incoming), Process equipment (both incoming and outgoing)
    - INVALID PATTERN: Equipment with no connections at all
    - Either connect all equipment to the process flow or don't create it
    
    🔥 HEAT EXCHANGER CONNECTIVITY (CRITICAL):
    - Every heat exchanger (shellTubeHX, heaterCooler, condenser, airCooler) MUST be connected
    - For coolers/condensers: Connect the hot process stream through the exchanger
    - Create TWO edges for a cooler: one TO the cooler (hot-in-left) and one FROM the cooler (hot-out-right)
    - Example: If you create "hx-cooler-1", create edges connecting it to upstream and downstream equipment
    - NEVER create a heat exchanger without creating edges that connect it to the process flow
    
    🏭 COLUMN CONNECTIVITY (CRITICAL):
    - ALL columns (distillation, vacuum, packed, absorber, stripper) MUST have connections
    - Every column MUST have at least one feed inlet connected (feed-stage-10, feed-left, etc.)
    - Every column MUST have at least one product outlet connected (overhead-top, bottoms-bottom, etc.)
    - Vacuum columns are process equipment and MUST be connected to feed streams and product streams
    - If you create a vacuum column, you MUST create edges connecting:
      * Feed stream TO the column (edge from source equipment to column with targetHandle like "feed-stage-10")
      * Product streams FROM the column (edges from column with sourceHandle like "overhead-top" or "bottoms-bottom" to destination equipment)
    - Never create a column without creating the corresponding edges that connect it to the process flow
    
    Include relevant process parameters in node data that DWSIM supports:
    - For columns: "stages" (number of stages), "reflux_ratio", "reboiler_duty" (kW)
    - For pumps: "pressure_rise" (kPa), "efficiency" (0-1)
    - For compressors: "pressure_ratio", "efficiency" (0-1)
    - For heat exchangers: "duty" (kW), "approach_temp" (C)
    - For reactors: "conversion" (0-1), "temperature" (C), "pressure" (kPa)
    
    Create meaningful connections between equipment.
    All edges should use type: "step" for horizontal/vertical lines.
    Provide detailed DWSIM setup instructions (not Aspen HYSYS).

    ✅ VALIDATION CHECKLIST (must pass before returning JSON):
    - Every edge has sourceHandle and targetHandle
    - Handles used exist in the ports of the corresponding nodes
    - Column overhead uses overhead-top; bottoms uses bottoms-bottom; reflux uses reflux-top
    - separator3p uses gas-top, oil-right, water-bottom
    - Pumps/compressors use suction-left → discharge-right
    - Heat exchangers hot/cold sides not crossed
    - Keep main process streams only (no utilities or signal lines)
    - Streams connect at LOGICALLY CORRECT physical locations (top/bottom/sides)
    - ALL equipment has at least one connection (NO completely isolated units)
    - ALL columns (distillation, vacuum, packed, absorber, stripper) have feed and product edges
    - Process flow is COMPLETE and CONTINUOUS from feed to products
    - Feed equipment can have only outgoing connections (VALID)
    - Product equipment can have only incoming connections (VALID)
    - Process equipment should have both incoming and outgoing connections (VALID)
    - CRITICAL: Every node in the "nodes" array must appear in at least one edge in the "edges" array
    - All unit operation types are DWSIM-supported (see list above)
    - Property package is DWSIM-supported (Peng-Robinson, NRTL, UNIFAC, etc.)
    - Feed streams have temperature, pressure, and composition specified in stream.data.properties
    - No unsupported unit types (recipPump, controlValve, etc.) are used - use alternatives instead

    📋 EXAMPLE (three-phase separation with proper spacing):
    {
      "nodes": [
        {
          "id": "sep-1",
          "type": "separator3p",
          "position": {"x": 150, "y": 300},
          "data": {
            "label": "Three-Phase Separator",
            "equipment": "separator3p",
            "ports": {
              "inlets": ["feed-left"],
              "outlets": ["gas-top", "oil-right", "water-bottom"]
            }
          }
        },
        {
          "id": "pump-gas-1",
          "type": "pump",
          "position": {"x": 450, "y": 100},
          "data": {
            "label": "Gas Pump",
            "equipment": "pump",
            "ports": {
              "inlets": ["suction-left"],
              "outlets": ["discharge-right"]
            }
          }
        },
        {
          "id": "pump-oil-1",
          "type": "pump",
          "position": {"x": 450, "y": 400},
          "data": {
            "label": "Oil Pump",
            "equipment": "pump",
            "ports": {
              "inlets": ["suction-left"],
              "outlets": ["discharge-right"]
            }
          }
        },
        {
          "id": "pump-water-1",
          "type": "pump",
          "position": {"x": 450, "y": 700},
          "data": {
            "label": "Water Pump",
            "equipment": "pump",
            "ports": {
              "inlets": ["suction-left"],
              "outlets": ["discharge-right"]
            }
          }
        },
        {
          "id": "col-gas-1",
          "type": "distillationColumn",
          "position": {"x": 750, "y": 50},
          "data": {
            "label": "Gas Column",
            "equipment": "distillationColumn",
            "ports": {
              "inlets": ["feed-stage-10"],
              "outlets": ["overhead-top", "bottoms-bottom"]
            }
          }
        },
        {
          "id": "col-oil-1",
          "type": "distillationColumn",
          "position": {"x": 750, "y": 400},
          "data": {
            "label": "Oil Column",
            "equipment": "distillationColumn",
            "ports": {
              "inlets": ["feed-stage-10"],
              "outlets": ["overhead-top", "bottoms-bottom"]
            }
          }
        },
        {
          "id": "col-water-1",
          "type": "distillationColumn",
          "position": {"x": 750, "y": 750},
          "data": {
            "label": "Water Column",
            "equipment": "distillationColumn",
            "ports": {
              "inlets": ["feed-stage-10"],
              "outlets": ["overhead-top", "bottoms-bottom"]
            }
          }
        }
      ],
      "edges": [
        {
          "id": "gas-stream",
          "source": "sep-1",
          "sourceHandle": "gas-top",
          "target": "pump-gas-1",
          "targetHandle": "suction-left",
          "type": "step",
          "label": "Gas Stream"
        },
        {
          "id": "oil-stream",
          "source": "sep-1",
          "sourceHandle": "oil-right",
          "target": "pump-oil-1",
          "targetHandle": "suction-left",
          "type": "step",
          "label": "Oil Stream"
        },
        {
          "id": "water-stream",
          "source": "sep-1",
          "sourceHandle": "water-bottom",
          "target": "pump-water-1",
          "targetHandle": "suction-left",
          "type": "step",
          "label": "Water Stream"
        },
        {
          "id": "gas-to-column",
          "source": "pump-gas-1",
          "sourceHandle": "discharge-right",
          "target": "col-gas-1",
          "targetHandle": "feed-stage-10",
          "type": "step",
          "label": "Gas Feed"
        },
        {
          "id": "oil-to-column",
          "source": "pump-oil-1",
          "sourceHandle": "discharge-right",
          "target": "col-oil-1",
          "targetHandle": "feed-stage-10",
          "type": "step",
          "label": "Oil Feed"
        },
        {
          "id": "water-to-column",
          "source": "pump-water-1",
          "sourceHandle": "discharge-right",
          "target": "col-water-1",
          "targetHandle": "feed-stage-10",
          "type": "step",
          "label": "Water Feed"
        }
      ]
    }`;

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 10000,
      response_format: { type: "json_object" }, // Force JSON mode (requires model support)
    });

    const responseText = completion.choices[0]?.message?.content;
    
    if (!responseText) {
      throw new Error('No response from OpenAI');
    }

    // Extract JSON from response (handle markdown code blocks and extra text)
    let jsonText = responseText.trim();
    
    // Remove markdown code blocks if present
    if (jsonText.startsWith('```')) {
      // Remove opening ```json or ```
      jsonText = jsonText.replace(/^```(?:json)?\s*/i, '');
      // Remove closing ```
      jsonText = jsonText.replace(/\s*```$/i, '');
      jsonText = jsonText.trim();
    }
    
    // Try to extract JSON object if there's extra text
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    // Parse and validate JSON response
    let flowsheetData: FlowSheetData;
    try {
      flowsheetData = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', {
        originalLength: responseText.length,
        extractedLength: jsonText.length,
        firstChars: jsonText.substring(0, 200),
        lastChars: jsonText.substring(Math.max(0, jsonText.length - 200)),
        parseError: parseError instanceof Error ? parseError.message : String(parseError)
      });
      
      // If this is a retry, don't retry again
      if (retryCount > 0) {
        return NextResponse.json(
          { 
            error: 'Invalid JSON response from AI after retry',
            details: 'The AI returned malformed JSON. Please try again with a simpler prompt.'
          },
          { status: 500 }
        );
      }
      
      // First attempt failed, retry with explicit JSON format instruction
      const jsonRetryPrompt = `${prompt}

🚨 CRITICAL: JSON FORMAT ERROR
The previous response was not valid JSON. You MUST return ONLY valid JSON, nothing else.

REQUIREMENTS:
- Return ONLY the JSON object, no markdown code blocks, no explanations
- Do NOT wrap the JSON in \`\`\`json code blocks
- Do NOT add any text before or after the JSON
- The response must start with { and end with }
- Ensure all strings are properly quoted
- Ensure all brackets and braces are properly closed
- Ensure no trailing commas

Return ONLY this JSON structure:
{
  "nodes": [...],
  "edges": [...],
  "dwsimInstructions": "...",
  "description": "..."
}`;

      // Recursive call with retry count
      const retryRequest = new NextRequest(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify({ prompt: jsonRetryPrompt, retryCount: 1 })
      });
      
      return POST(retryRequest);
    }

    // Node type mapping for fallback compatibility
    const nodeTypeMapping: { [key: string]: string } = {
      'reactor': 'cstr',
      'distillation_column': 'distillationColumn',
      'heat_exchanger': 'shellTubeHX',
      'storage_tank': 'tank',
      'flash_drum': 'flashDrum',
      'knockout_drum': 'knockoutDrumH',
      'surge_drum': 'surgeDrum',
      'reflux_drum': 'surgeDrum',
      'accumulator': 'surgeDrum',
      'phase_separator': 'separator',
      'gas_liquid_separator': 'separator',
      'liquid_liquid_separator': 'separator',
      'solid_liquid_separator': 'separator',
      'cooler': 'heaterCooler',
      'heater': 'heaterCooler',
      'preheater': 'heaterCooler',
      'intercooler': 'heaterCooler',
      'aftercooler': 'heaterCooler',
      'economizer': 'heaterCooler',
      'superheater': 'heaterCooler',
      'desuperheater': 'heaterCooler',
      'reboiler': 'kettleReboiler',
      'condenser': 'condenser',
      'boiler': 'boiler',
      'expander': 'turbine',
      'fan': 'compressor',
      'blower': 'compressor',
      'crystallizer': 'cstr',
      'dryer': 'heaterCooler',
      'evaporator': 'heaterCooler',
      'scrubber': 'absorber',
      'extractor': 'separator',
      'decanter': 'separator',
      'settler': 'separator',
      'thickener': 'separator',
      'clarifier': 'separator',
      'centrifuge': 'separator',
      'filter_press': 'filter',
      'belt_filter': 'filter',
      'vacuum_filter': 'filter',
      'rotary_filter': 'filter',
      'pressure_filter': 'filter',
      'gravity_filter': 'filter',
      'magnetic_filter': 'filter',
      'electrostatic_filter': 'filter',
      'ion_exchange': 'adsorber',
      'adsorption': 'adsorber',
      'absorption': 'absorber',
      'stripping': 'stripper',
      'extraction': 'separator',
      'distillation': 'distillationColumn',
      'rectification': 'distillationColumn',
      'desorption': 'stripper',
      'regeneration': 'heaterCooler',
      'crystallization': 'cstr',
      'precipitation': 'separator',
      'coagulation': 'separator',
      'flocculation': 'separator',
      'sedimentation': 'separator',
      'filtration': 'filter',
      'centrifugation': 'separator',
      'drying': 'heaterCooler',
      'evaporation': 'heaterCooler',
      'concentration': 'heaterCooler',
      'purification': 'separator',
      'separation': 'separator',
      'fractionation': 'distillationColumn'
    };

    // Apply node type mapping
    if (flowsheetData.nodes) {
      flowsheetData.nodes = flowsheetData.nodes.map(node => ({
        ...node,
        type: nodeTypeMapping[node.type] || node.type
      }));
    }

    // Validate required fields
    if (!flowsheetData.nodes || !flowsheetData.edges || !flowsheetData.dwsimInstructions) {
      return NextResponse.json(
        { error: 'Invalid flowsheet data structure' },
        { status: 500 }
      );
    }

    // Check for isolated equipment (equipment not connected to any other equipment)
    const connectedNodes = new Set<string>();
    const nodesWithIncomingConnections = new Set<string>();
    const nodesWithOutgoingConnections = new Set<string>();
    
    flowsheetData.edges.forEach(edge => {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
      nodesWithOutgoingConnections.add(edge.source);
      nodesWithIncomingConnections.add(edge.target);
    });
    
    // Find truly isolated nodes (not connected at all)
    const trulyIsolatedNodes = flowsheetData.nodes.filter(node => !connectedNodes.has(node.id));
    
    // Find nodes that might be feed or product equipment (only incoming or only outgoing)
    const potentialFeedNodes = flowsheetData.nodes.filter(node => 
      connectedNodes.has(node.id) && 
      nodesWithOutgoingConnections.has(node.id) && 
      !nodesWithIncomingConnections.has(node.id)
    );
    
    const potentialProductNodes = flowsheetData.nodes.filter(node => 
      connectedNodes.has(node.id) && 
      nodesWithIncomingConnections.has(node.id) && 
      !nodesWithOutgoingConnections.has(node.id)
    );
    
    // Log connectivity analysis for debugging
    console.log('Connectivity Analysis:', {
      totalNodes: flowsheetData.nodes.length,
      totalEdges: flowsheetData.edges.length,
      trulyIsolatedNodes: trulyIsolatedNodes.map(n => n.id),
      potentialFeedNodes: potentialFeedNodes.map(n => n.id),
      potentialProductNodes: potentialProductNodes.map(n => n.id),
      connectedNodes: Array.from(connectedNodes)
    });

    // Only flag as error if there are truly isolated nodes (not connected at all)
    if (trulyIsolatedNodes.length > 0) {
      // If this is a retry attempt, return error immediately
      if (retryCount > 0) {
        return NextResponse.json(
          { error: `Isolated equipment found after retry: ${trulyIsolatedNodes.map(n => n.id).join(', ')}. All equipment must be connected to the main process flow.` },
          { status: 500 }
        );
      }
      
      // Build detailed list of isolated equipment with their types
      const isolatedEquipmentDetails = trulyIsolatedNodes.map(n => {
        const nodeType = n.type || 'unknown';
        const nodeLabel = n.data?.label || n.id;
        return `- ${n.id} (${nodeType}, "${nodeLabel}")`;
      }).join('\n');
      
      // Check if any isolated equipment are heat exchangers
      const isolatedHeatExchangers = trulyIsolatedNodes.filter(n => 
        ['shellTubeHX', 'heaterCooler', 'condenser', 'airCooler', 'kettleReboiler'].includes(n.type)
      );
      
      let heatExchangerGuidance = '';
      if (isolatedHeatExchangers.length > 0) {
        const hxList = isolatedHeatExchangers.map(n => n.id).join(', ');
        const exampleHx = isolatedHeatExchangers[0].id;
        heatExchangerGuidance = `
🔥 CRITICAL: HEAT EXCHANGER CONNECTIVITY ISSUE
The following heat exchangers are isolated: ${hxList}

For EACH heat exchanger, you MUST create edges connecting it:
- For coolers/condensers: Connect hot process stream
  * Edge TO exchanger: {"source": "upstream-equipment-id", "sourceHandle": "outlet-handle", "target": "${exampleHx}", "targetHandle": "hot-in-left", "type": "step"}
  * Edge FROM exchanger: {"source": "${exampleHx}", "sourceHandle": "hot-out-right", "target": "downstream-equipment-id", "targetHandle": "inlet-handle", "type": "step"}
- For heaters: Connect cold process stream
  * Edge TO exchanger: {"source": "upstream-equipment-id", "sourceHandle": "outlet-handle", "target": "${exampleHx}", "targetHandle": "cold-in-bottom", "type": "step"}
  * Edge FROM exchanger: {"source": "${exampleHx}", "sourceHandle": "cold-out-top", "target": "downstream-equipment-id", "targetHandle": "inlet-handle", "type": "step"}

If you cannot logically connect a heat exchanger, REMOVE it from the nodes array entirely.`;
      }
      
      // First attempt failed, retry with enhanced prompt
      const enhancedPrompt = `${prompt}

🚨 CRITICAL ERROR: The previous attempt created isolated equipment that is not connected to the main process flow. You MUST follow these rules EXACTLY:

ISOLATED EQUIPMENT DETECTED (these have NO connections at all):
${isolatedEquipmentDetails}${heatExchangerGuidance}

🚨 ABSOLUTE RULE: ALL EQUIPMENT MUST BE CONNECTED
- Every piece of equipment MUST be connected to at least one other piece of equipment via edges
- NO equipment can exist in complete isolation (no connections at all)
- If you create equipment, you MUST create edges connecting it to the process flow
- Either connect isolated equipment to the nearest logical process path or remove it entirely

🔧 MANDATORY CONNECTIVITY REQUIREMENTS:
- Every separator must have feed inlet and product outlets connected via edges
- Every pump must have suction inlet and discharge outlet connected via edges
- Every compressor must have suction inlet and discharge outlet connected via edges
- Every heat exchanger (shellTubeHX, heaterCooler, condenser, airCooler) MUST have at least ONE side connected:
  * For coolers/condensers: Connect hot process stream (hot-in-left → hot-out-right)
  * For heaters: Connect cold process stream (cold-in-bottom → cold-out-top)
  * Example cooler edge: {"source": "upstream-equipment", "sourceHandle": "outlet", "target": "hx-cooler-1", "targetHandle": "hot-in-left"}
  * Example cooler edge: {"source": "hx-cooler-1", "sourceHandle": "hot-out-right", "target": "downstream-equipment", "targetHandle": "inlet"}
- Every column (including vacuum columns) MUST have:
  * At least one feed inlet edge (from another equipment TO the column)
  * At least one product outlet edge (from the column TO another equipment)
- Every tank must have inlet and outlet connections via edges (unless it's a final product tank)

🏭 CRITICAL: COLUMN CONNECTIVITY
- If you created a column (distillation, vacuum, packed, absorber, stripper), you MUST create edges for it
- For each column, create edges in the "edges" array:
  * Feed edge: {"source": "source-equipment-id", "sourceHandle": "outlet-handle", "target": "column-id", "targetHandle": "feed-stage-10"}
  * Product edge: {"source": "column-id", "sourceHandle": "overhead-top", "target": "destination-equipment-id", "targetHandle": "inlet-handle"}
- Example: If you have "col-vacuum-1", create edges connecting it:
  * One edge FROM another equipment TO col-vacuum-1 (feed)
  * One or more edges FROM col-vacuum-1 TO other equipment (products)

📋 VALID CONNECTIVITY PATTERNS:
- Feed equipment: Only outgoing connections (no incoming connections) - THIS IS VALID
- Product equipment: Only incoming connections (no outgoing connections) - THIS IS VALID
- Process equipment: Both incoming and outgoing connections - THIS IS VALID
- Isolated equipment: No connections at all - THIS IS INVALID AND WILL CAUSE FAILURE

📋 EXAMPLE OF CORRECT CONNECTIVITY:
- separator3p: feed → separator → gas/oil/water → pumps/compressors (with edges connecting each step)
- heat exchanger/cooler: upstream → hx-cooler-1 (hot-in-left) → hx-cooler-1 (hot-out-right) → downstream (with edges for both connections)
- column: feed → column → overhead/bottoms → next equipment (with edges for feed, overhead, and bottoms)
- vacuum column: feed → col-vacuum-1 → overhead/bottoms → next equipment (with edges connecting all)

📋 SPECIFIC EXAMPLE FOR HEAT EXCHANGER (hx-cooler-1):
If you create "hx-cooler-1", you MUST create edges like:
{
  "id": "stream-to-cooler",
  "source": "upstream-equipment-id",
  "sourceHandle": "outlet-handle",
  "target": "hx-cooler-1",
  "targetHandle": "hot-in-left",
  "type": "step"
},
{
  "id": "stream-from-cooler",
  "source": "hx-cooler-1",
  "sourceHandle": "hot-out-right",
  "target": "downstream-equipment-id",
  "targetHandle": "inlet-handle",
  "type": "step"
}

🚨 FINAL WARNING: If you create any equipment with NO connections at all, the generation will fail. Every piece of equipment must be part of the continuous process flow. You MUST create edges in the "edges" array for every piece of equipment you create.`;

      // Recursive call with retry count
      const retryRequest = new NextRequest(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify({ prompt: enhancedPrompt, retryCount: 1 })
      });
      
      return POST(retryRequest);
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
