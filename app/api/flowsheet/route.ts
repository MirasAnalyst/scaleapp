import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

import { getHandlesForType } from '@/lib/nodeHandles';

const HANDLE_ALIAS_MAP: Record<string, string> = {
  'feed': 'feed-left',
  'feedin': 'feed-left',
  'feed-in': 'feed-left',
  'feed_in': 'feed-left',
  'feedleft': 'feed-left',
  'feedstage6': 'feed-stage-6',
  'feedstage8': 'feed-stage-8',
  'feedstage10': 'feed-stage-10',
  'feedstage12': 'feed-stage-12',
  'feedstage18': 'feed-stage-18',
  'feed-stage6': 'feed-stage-6',
  'feed-stage8': 'feed-stage-8',
  'feed-stage10': 'feed-stage-10',
  'feed-stage12': 'feed-stage-12',
  'feed-stage18': 'feed-stage-18',
  'feed_stage_6': 'feed-stage-6',
  'feed_stage_8': 'feed-stage-8',
  'feed_stage_10': 'feed-stage-10',
  'feed_stage_12': 'feed-stage-12',
  'feed_stage_18': 'feed-stage-18',
  'reflux': 'reflux-top',
  'refluxtop': 'reflux-top',
  'overhead': 'overhead-top',
  'overheadtop': 'overhead-top',
  'top': 'overhead-top',
  'bottom': 'bottoms-bottom',
  'bottoms': 'bottoms-bottom',
  'bottomout': 'bottoms-bottom',
  'vaporout': 'vapor',
  'vapor-top': 'vapor',
  'liquidout': 'liquid',
  'liquid-bottom': 'liquid',
  'gasout': 'gas',
  'gas-top': 'gas-top',
  'oilout': 'oil-right',
  'oil-right': 'oil-right',
  'waterout': 'water-bottom',
  'water-bottom': 'water-bottom',
  'suction': 'suction-left',
  'discharge': 'discharge-right',
  'outlet': 'out',
  'product': 'out',
  'outlet1': 'out1',
  'outlet-1': 'out1',
  'outlet_1': 'out1',
  'product1': 'out1',
  'outlet2': 'out2',
  'outlet-2': 'out2',
  'outlet_2': 'out2',
  'product2': 'out2',
  'outlet3': 'out3',
  'outlet-3': 'out3',
  'outlet_3': 'out3',
  'product3': 'out3',
  'inlet': 'in',
  'inlet1': 'in1',
  'inlet-1': 'in1',
  'inlet_1': 'in1',
  'inlet2': 'in2',
  'inlet-2': 'in2',
  'inlet_2': 'in2',
  'branchout': 'branch',
  'branch-out': 'branch',
  'branch_out': 'branch',
  'qin': 'Qin',
  'q_in': 'Qin',
  'q-in': 'Qin',
  'qout': 'Qout',
  'q_out': 'Qout',
  'q-out': 'Qout',
  'shellin': 'shellIn',
  'shell-in': 'shellIn',
  'shell_in': 'shellIn',
  'shellout': 'shellOut',
  'shell-out': 'shellOut',
  'shell_out': 'shellOut',
  'tubein': 'tubeIn',
  'tube-in': 'tubeIn',
  'tube_in': 'tubeIn',
  'tubeout': 'tubeOut',
  'tube-out': 'tubeOut',
  'tube_out': 'tubeOut',
  'secin': 'secIn',
  'sec-in': 'secIn',
  'sec_in': 'secIn',
  'secout': 'secOut',
  'sec-out': 'secOut',
  'sec_out': 'secOut'
};

const canonicalizeHandle = (value: string) => value.toLowerCase().replace(/[-_\s]/g, '');

const normalizeHandle = (
  raw: string | undefined,
  allowedHandles: Set<string>
): string | undefined => {
  if (!raw) {
    return undefined;
  }

  let candidate = raw.trim();
  if (!candidate) {
    return undefined;
  }

  candidate = candidate.replace(/\s+/g, '');
  candidate = candidate.replace(/_/g, '-');

  const lowerCandidate = candidate.toLowerCase();
  if (HANDLE_ALIAS_MAP[lowerCandidate]) {
    candidate = HANDLE_ALIAS_MAP[lowerCandidate];
  }

  if (allowedHandles.size > 0) {
    const canonicalCandidate = canonicalizeHandle(candidate);
    for (const allowed of allowedHandles) {
      if (canonicalizeHandle(allowed) === canonicalCandidate) {
        return allowed;
      }
    }
  }

  return candidate;
};

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
  aspenInstructions: string;
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
          "type": "step",
          "label": "stream_name",
          "data": {"flow_rate": "value", "temperature": "value"},
          "style": {"strokeWidth": 2, "stroke": "#6B7280"},
          "markerEnd": {"type": "arrowclosed", "width": 20, "height": 20, "color": "#6B7280"}
        }
      ],
      "aspenInstructions": "Step-by-step Aspen HYSYS setup instructions",
      "description": "Brief description of the process"
    }

    Use these EXACT node types (case-sensitive):
    - distillationColumn (for distillation columns)
    - packedColumn (for packed columns)
    - absorber (for absorption columns)
    - stripper (for stripping columns)
    - flashDrum (for flash drums)
    - separator (for horizontal separators)
    - separator3p (for 3-phase separators)
    - tank (for storage tanks)
    - horizontalVessel (for horizontal vessels)
    - surgeDrum (for surge drums)
    - knockoutDrumH (for knockout drums)
    - heaterCooler (for heaters/coolers)
    - shellTubeHX (for shell & tube heat exchangers)
    - airCooler (for air coolers)
    - kettleReboiler (for kettle reboilers)
    - plateHX (for plate heat exchangers)
    - doublePipeHX (for double-pipe heat exchangers)
    - firedHeater (for fired heaters)
    - cstr (for continuous stirred tank reactors)
    - pfr (for plug flow reactors)
    - gibbsReactor (for Gibbs reactors)
    - equilibriumReactor (for equilibrium reactors)
    - conversionReactor (for conversion reactors)
    - batchReactor (for batch reactors)
    - pump (for pumps)
    - compressor (for compressors)
    - turbine (for turbines)
    - steamTurbine (for steam turbines)
    - recipPump (for reciprocating pumps)
    - recipCompressor (for reciprocating compressors)
    - valve (for valves)
    - controlValve (for control valves)
    - checkValve (for check valves)
    - prv (for pressure relief valves)
    - throttleValve (for throttle valves)
    - mixer (for mixers)
    - splitter (for splitters)
    - tee (for tee junctions)
    - filter (for filters)
    - cyclone (for cyclones)
    - adsorber (for adsorbers)
    - membrane (for membrane units)
    - boiler (for boilers)
    - condenser (for condensers)
    - label (for text labels)

    🔌 PORT CONNECTIONS - Use these EXACT handle IDs for proper PHYSICAL positioning:

    🚦 SERVER VALIDATION: Only the handle IDs listed here (and in the node data) are accepted. Any stream using an undefined handle will be rejected.
    
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
    - shellTubeHX, plateHX, doublePipeHX, heaterCooler, condenser
    - Hot side: hot-in-left (left), hot-out-right (right)
    - Cold side: cold-in-bottom (bottom), cold-out-top (top)
    - LOGICAL POSITIONING: Hot streams flow horizontally, cold streams flow vertically
    
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
    - Auto-correct wrong ports and note corrections in aspenInstructions

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
    
    When generating the flowsheet, always be detailed in the choice of equipment and unit operations, so that no major process equipment is missed. Include all unit operations that would normally appear in an Aspen HYSYS flowsheet to make the process operational (e.g., separators, pumps, compressors, heat exchangers, columns, reactors, valves, mixers, splitters).
    Only include the main process material streams that connect these units (feed streams, product streams, and intermediate streams). Do not include auxiliary or utility streams (e.g., steam, cooling water, fuel gas, flare lines, drains, vents) and do not include controller signal lines. The flowsheet should focus on the complete core process pathway as it would appear in Aspen HYSYS.
    
    🔗 CONNECTIVITY REQUIREMENTS (MANDATORY):
    - EVERY piece of equipment MUST be connected to at least one other piece of equipment via stream lines
    - NO equipment should be isolated or disconnected from the main process flow
    - Create a COMPLETE and CONTINUOUS process flow from feed to final products
    - All equipment must be part of the main process pathway - no standalone units
    - Ensure that all equipment/unit operations are properly connected with process stream lines, in the same way they would be interconnected in an Aspen HYSYS process flowsheet, so the result forms a complete and continuous process flow
    - If you create multiple equipment pieces, they MUST all be connected in a logical process sequence
    CRITICAL: Never create edges that connect a node to itself (source and target cannot be the same node). All edges must connect different equipment units.
    IMPORTANT: For separation processes, create separate equipment units for each product stream (e.g., separate pumps for gas, oil, water products from a separator).
    
    🚨 ABSOLUTE RULE: NO ISOLATED EQUIPMENT ALLOWED
    - If you create a heat exchanger, pump, compressor, separator, or any equipment, it MUST be connected
    - Every piece of equipment must have at least one inlet connection AND one outlet connection
    - Equipment without connections will cause the generation to fail
    - Either connect all equipment to the process flow or don't create it
    
    Include relevant process parameters in node data.
    Create meaningful connections between equipment.
    All edges should use type: "step" for horizontal/vertical lines like Aspen HYSYS.
    Provide detailed Aspen HYSYS setup instructions.

    ✅ VALIDATION CHECKLIST (must pass before returning JSON):
    - Every edge has sourceHandle and targetHandle
    - Handles used exist in the ports of the corresponding nodes
    - Column overhead uses overhead-top; bottoms uses bottoms-bottom; reflux uses reflux-top
    - separator3p uses gas-top, oil-right, water-bottom
    - Pumps/compressors use suction-left → discharge-right
    - Heat exchangers hot/cold sides not crossed
    - Keep main process streams only (no utilities or signal lines)
    - Streams connect at LOGICALLY CORRECT physical locations (top/bottom/sides)
    - ALL equipment is connected to at least one other equipment (NO isolated units)
    - Process flow is COMPLETE and CONTINUOUS from feed to products

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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 10000,
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
    if (!flowsheetData.nodes || !flowsheetData.edges || !flowsheetData.aspenInstructions) {
      return NextResponse.json(
        { error: 'Invalid flowsheet data structure' },
        { status: 500 }
      );
    }

    const nodeMap = new Map(flowsheetData.nodes.map(node => [node.id, node]));
    const nodeHandleInfo = new Map<string, {
      allowedSourceHandles: Set<string>;
      allowedTargetHandles: Set<string>;
      requireSourceHandle: boolean;
      requireTargetHandle: boolean;
    }>();

    flowsheetData.nodes.forEach(node => {
      const spec = getHandlesForType(node.type);
      const ports = node.data?.ports;
      const outlets = ports?.outlets;
      const inlets = ports?.inlets;
      const rawOutlets = Array.isArray(outlets) ? (outlets as Array<string | number | null | undefined>) : [];
      const rawInlets = Array.isArray(inlets) ? (inlets as Array<string | number | null | undefined>) : [];
      const outletHandles = new Set<string>(rawOutlets.map(handle => String(handle)));
      const inletHandles = new Set<string>(rawInlets.map(handle => String(handle)));

      const allowedSourceHandles = new Set<string>();
      const allowedTargetHandles = new Set<string>();

      if (spec) {
        spec.sources.forEach(handle => allowedSourceHandles.add(handle));
        spec.targets.forEach(handle => allowedTargetHandles.add(handle));
      }

      outletHandles.forEach(handle => allowedSourceHandles.add(handle));
      inletHandles.forEach(handle => allowedTargetHandles.add(handle));

      const allowAnonymousSource = Boolean(spec?.hasAnonymousSource) && outletHandles.size === 0;
      const allowAnonymousTarget = Boolean(spec?.hasAnonymousTarget) && inletHandles.size === 0;

      nodeHandleInfo.set(node.id, {
        allowedSourceHandles,
        allowedTargetHandles,
        requireSourceHandle: allowedSourceHandles.size > 0 && !allowAnonymousSource,
        requireTargetHandle: allowedTargetHandles.size > 0 && !allowAnonymousTarget
      });
    });

    const handleErrors: string[] = [];

    flowsheetData.edges.forEach(edge => {
      const sourceNode = nodeMap.get(edge.source);
      if (!sourceNode) {
        handleErrors.push(`Edge ${edge.id} references unknown source node ${edge.source}`);
        return;
      }

      const targetNode = nodeMap.get(edge.target);
      if (!targetNode) {
        handleErrors.push(`Edge ${edge.id} references unknown target node ${edge.target}`);
        return;
      }

      const sourceInfo = nodeHandleInfo.get(edge.source);
      const targetInfo = nodeHandleInfo.get(edge.target);

      if (sourceInfo) {
        const normalizedSourceHandle = normalizeHandle(edge.sourceHandle, sourceInfo.allowedSourceHandles);

        if (normalizedSourceHandle && sourceInfo.allowedSourceHandles.size > 0 && !sourceInfo.allowedSourceHandles.has(normalizedSourceHandle)) {
          handleErrors.push(
            `Edge ${edge.id} uses invalid sourceHandle "${edge.sourceHandle}" on node ${edge.source}. Allowed: ${Array.from(sourceInfo.allowedSourceHandles).join(', ')}`
          );
        }

        if (!normalizedSourceHandle && sourceInfo.requireSourceHandle) {
          handleErrors.push(
            `Edge ${edge.id} is missing sourceHandle for node ${edge.source}. Required handles: ${Array.from(sourceInfo.allowedSourceHandles).join(', ')}`
          );
        }

        if (normalizedSourceHandle && normalizedSourceHandle !== edge.sourceHandle) {
          edge.sourceHandle = normalizedSourceHandle;
        }
      }

      if (targetInfo) {
        const normalizedTargetHandle = normalizeHandle(edge.targetHandle, targetInfo.allowedTargetHandles);

        if (normalizedTargetHandle && targetInfo.allowedTargetHandles.size > 0 && !targetInfo.allowedTargetHandles.has(normalizedTargetHandle)) {
          handleErrors.push(
            `Edge ${edge.id} uses invalid targetHandle "${edge.targetHandle}" on node ${edge.target}. Allowed: ${Array.from(targetInfo.allowedTargetHandles).join(', ')}`
          );
        }

        if (!normalizedTargetHandle && targetInfo.requireTargetHandle) {
          handleErrors.push(
            `Edge ${edge.id} is missing targetHandle for node ${edge.target}. Required handles: ${Array.from(targetInfo.allowedTargetHandles).join(', ')}`
          );
        }

        if (normalizedTargetHandle && normalizedTargetHandle !== edge.targetHandle) {
          edge.targetHandle = normalizedTargetHandle;
        }
      }
    });

    if (handleErrors.length > 0) {
      return NextResponse.json(
        { error: `Invalid port connections detected:\n- ${handleErrors.join('\n- ')}` },
        { status: 500 }
      );
    }

    // Check for isolated equipment (equipment not connected to any other equipment)
    const connectedNodes = new Set<string>();
    flowsheetData.edges.forEach(edge => {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
    });
    
    const isolatedNodes = flowsheetData.nodes.filter(node => !connectedNodes.has(node.id));
    if (isolatedNodes.length > 0) {
      // If this is a retry attempt, return error immediately
      if (retryCount > 0) {
        return NextResponse.json(
          { error: `Isolated equipment found after retry: ${isolatedNodes.map(n => n.id).join(', ')}. All equipment must be connected to the main process flow.` },
          { status: 500 }
        );
      }
      
      // First attempt failed, retry with enhanced prompt
      const enhancedPrompt = `${prompt}

🚨 CRITICAL ERROR: The previous attempt created isolated equipment that is not connected to the main process flow. You MUST follow these rules EXACTLY:

🚨 ABSOLUTE RULE: ALL EQUIPMENT MUST BE CONNECTED
- Every piece of equipment MUST be connected to at least one other piece of equipment
- NO equipment can exist in isolation
- If you create equipment, you MUST connect it to the process flow
- Either connect isolated equipment to the nearest logical process path or remove it

🔧 MANDATORY CONNECTIVITY REQUIREMENTS:
- Every separator must have feed inlet and product outlets connected
- Every pump must have suction inlet and discharge outlet connected
- Every compressor must have suction inlet and discharge outlet connected
- Every heat exchanger must have both hot and cold side connections
- Every column must have feed inlet and product outlets connected
- Every tank must have inlet and outlet connections (unless it's a final product tank)

📋 EXAMPLE OF CORRECT CONNECTIVITY:
- separator3p: feed → separator → gas/oil/water → pumps/compressors
- heat exchanger: hot stream → exchanger → cooled stream
- column: feed → column → overhead/bottoms → next equipment
- pump: suction → pump → discharge → next equipment

🚨 FINAL WARNING: If you create any isolated equipment, the generation will fail. Every piece of equipment must be part of the continuous process flow.`;

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
