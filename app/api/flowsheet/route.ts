import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

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
  thermo?: {
    package: string;
    components: string[];
  };
}

// Static system prompt — cached via Anthropic prompt caching to save tokens
const FLOWSHEET_SYSTEM_PROMPT = `You are a chemical engineering expert specializing in process flowsheets and DWSIM simulation.
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
      "thermo": {
        "package": "Peng-Robinson",
        "components": ["water", "methane", "ethane"]
      },
      "dwsimInstructions": "Step-by-step DWSIM setup instructions",
      "description": "Brief description of the process"
    }

    🧪 THERMODYNAMIC CONFIGURATION (MANDATORY):
    The "thermo" object MUST be included in every response. It tells the simulation engine which
    thermodynamic model and chemical components to use.

    - "package": Choose the RIGHT property package for the chemistry:
      * "Peng-Robinson" — hydrocarbons, natural gas, refinery, gas processing (DEFAULT)
      * "SRK" — similar to PR, good for H2-rich systems and gas processing
      * "NRTL" — polar/non-ideal liquids: water-alcohol, water-acid, amine treating
      * "UNIFAC" — when binary interaction data is unavailable, group-contribution estimation
      * "UNIQUAC" — strongly non-ideal liquid mixtures, LLE problems

    - "components": List ALL chemical species present in the process using common names.
      Use IUPAC or common names the chemicals database recognizes:
      * Hydrocarbons: "methane", "ethane", "propane", "n-butane", "i-butane", "n-pentane", "n-hexane", "benzene", "toluene"
      * Gases: "hydrogen", "nitrogen", "oxygen", "carbon dioxide", "carbon monoxide", "hydrogen sulfide"
      * Polar: "water", "methanol", "ethanol", "acetone", "acetic acid", "ammonia"
      * Others: "diethyl ether", "cyclohexane", "styrene", "phenol"

    📊 FEED STREAM DATA (MANDATORY for simulation):
    Every feed stream (the FIRST edge entering the process, i.e. the edge going into the first
    piece of equipment) MUST have complete thermodynamic data in edge.data:
    - "temperature": temperature in °C (e.g., 25.0)
    - "pressure": pressure in kPa (e.g., 101.325 for atmospheric, 2000.0 for high pressure)
    - "flow_rate": mass flow in kg/h (e.g., 3600.0)
    - "composition": mole fractions as object, MUST sum to 1.0 (e.g., {"methane": 0.7, "ethane": 0.2, "propane": 0.1})
    - All components listed in thermo.components MUST appear in the composition (use 0.0 for absent components)

    EXAMPLE feed edge with proper data:
    {
      "id": "feed-01",
      "source": "feed-source-1",
      "sourceHandle": "out-right",
      "target": "sep-1",
      "targetHandle": "feed-left",
      "type": "step",
      "label": "Well Fluid Feed",
      "data": {
        "temperature": 85,
        "pressure": 4500,
        "flow_rate": 125000,
        "composition": {"methane": 0.42, "ethane": 0.08, "propane": 0.06, "n-butane": 0.04, "water": 0.40}
      }
    }

    IMPORTANT: The "data" field on feed edges is what drives the simulation.
    Without temperature, pressure, and composition, the simulation engine cannot calculate anything.
    Internal streams between equipment do NOT need data — they will be calculated by the solver.

    PROCESS-SPECIFIC FEED STREAMS (use these as starting points):

    Natural Gas Well Fluid:
      temperature: 60-80, pressure: 5000-8000, flow_rate: 50000-200000
      composition: methane 0.70-0.85, ethane 0.05-0.10, propane 0.03-0.05,
      n-butane 0.01-0.03, carbon dioxide 0.01-0.05, hydrogen sulfide 0.00-0.02, water 0.02-0.05

    Crude Oil (light):
      temperature: 60-80, pressure: 1000-3000, flow_rate: 100000-500000
      composition: Use pseudo-components or representative cuts

    Refinery Naphtha:
      temperature: 80-120, pressure: 500-1500, flow_rate: 50000-200000
      composition: n-pentane 0.15, n-hexane 0.30, benzene 0.10, toluene 0.20, cyclohexane 0.25

    Water-Alcohol (distillation):
      temperature: 25-30, pressure: 101.325, flow_rate: 5000-20000
      composition: ethanol 0.10-0.40, water 0.60-0.90

    Amine Treating (sour gas):
      temperature: 40-50, pressure: 3000-7000, flow_rate: 100000-300000
      composition: methane 0.80, carbon dioxide 0.05-0.15, hydrogen sulfide 0.01-0.05, water 0.02

    🔧 EQUIPMENT PARAMETERS — use these EXACT keys in node.data.parameters:

    Pump:
      outlet_pressure_kpa (number) — discharge pressure in kPa
      OR pressure_rise_kpa (number) — differential pressure in kPa
      efficiency (number, 0.70-0.85, default 0.75)

    Compressor:
      outlet_pressure_kpa (number) — discharge pressure in kPa
      OR pressure_ratio (number, 2-5 per stage)
      efficiency (number, 0.72-0.82, default 0.80)

    Turbine / Expander:
      outlet_pressure_kpa (number) — exhaust pressure
      OR pressure_ratio (number) — expansion ratio
      efficiency (number, 0.75-0.85, default 0.80)

    Valve:
      outlet_pressure_kpa (number) — downstream pressure
      OR pressure_drop_kpa (number) — pressure drop across valve

    Heater / Cooler (heaterCooler, firedHeater, boiler, condenser, airCooler, kettleReboiler):
      outlet_temperature_c (number) — outlet temperature in Celsius
      OR duty_kw (number) — heat duty in kW (positive = heating)
      pressure_drop_kpa (number, default 0, typically 10-50)

    Shell & Tube Heat Exchanger (shellTubeHX):
      hot_outlet_temperature_c OR cold_outlet_temperature_c OR duty_kw
      hot_pressure_drop_kpa (default 0)
      cold_pressure_drop_kpa (default 0)

    Flash Drum / Separator (flashDrum, separator, separator3p, knockoutDrumH, surgeDrum):
      temperature_c (number) — flash temperature
      pressure_kpa (number) — flash pressure

    Mixer:
      outlet_pressure_kpa (number, optional — defaults to min of inlet pressures)

    Splitter:
      fractions (array of numbers summing to 1.0, e.g. [0.5, 0.5])

    Distillation Column (distillationColumn, packedColumn, absorber, stripper):
      light_key (string) — light key component name (MANDATORY — must match a thermo component)
      heavy_key (string) — heavy key component name (MANDATORY — must match a thermo component)
      light_key_recovery (number, 0.95-0.995, default 0.99)
      heavy_key_recovery (number, 0.95-0.995, default 0.99)
      reflux_ratio_multiple (number, 1.2-1.5 of minimum, default 1.3)
      condenser_pressure_kpa (number — column top pressure)
      reboiler_pressure_kpa (number — column bottom pressure)
      n_stages (number, optional — overrides Fenske calculation)

    Conversion Reactor (conversionReactor, cstr, pfr):
      reactions (array of stoichiometric reaction objects):
        e.g. [{"reactants": {"ethanol": 1}, "products": {"ethylene": 1, "water": 1}, "conversion": 0.95, "base_component": "ethanol"}]
        - "reactants": object mapping component name → stoichiometric coefficient
        - "products": object mapping component name → stoichiometric coefficient
        - "conversion": fractional conversion (0–1) of the base component
        - "base_component": the reactant whose conversion is specified
      temperature_c OR outlet_temperature_c (number)
      pressure_kpa OR outlet_pressure_kpa (number)

    CRITICAL for distillation: light_key and heavy_key MUST be set to actual component
    names from the thermo.components list. Pick the two adjacent-boiling components
    that define the desired separation split.

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

    CRITICAL TOPOLOGY RULES:
    6. Every unit MUST have at least one INCOMING edge (except label/source nodes)
    7. Mixers MUST have TWO or MORE incoming edges from upstream equipment or feed sources
    8. For a mixer: create separate feed label nodes, then create edges FROM each feed label TO the mixer
    9. Feed data (T, P, composition, flow_rate) MUST be on edges ENTERING the first equipment unit
    10. Internal edges between equipment MUST have empty data:{} — the solver computes them
    11. Do NOT put feed data on edges LEAVING a mixer — put it on edges ENTERING the mixer

    WRONG (mixer has no incoming edges):
      mixer → heater  [data: {T: 320, P: 3000, composition: {...}}]

    RIGHT (feed edges go INTO mixer):
      feed-naphtha → mixer  [data: {T: 80, P: 3000, composition: {...}}]
      feed-hydrogen → mixer  [data: {T: 25, P: 3000, composition: {...}}]
      mixer → heater         [data: {}]

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

    📏 REFERENCE OPERATING CONDITIONS (use these as guides for realistic HYSYS-equivalent values):
    - Atmospheric crude distillation: feed 350-370°C, 150-200 kPa, reflux ratio 1.5-3.0
    - Vacuum distillation: feed 350-400°C, 5-15 kPa, 5-10 stages
    - Amine treating (MEA/DEA): absorber 40-50°C, 3000-7000 kPa; regenerator 110-120°C, 150-200 kPa
    - Natural gas dehydration (TEG): absorber 30-40°C, 5000-8000 kPa
    - NGL recovery / demethanizer: -80 to -100°C, 2500-3500 kPa
    - Propane refrigeration: evaporator -30 to -40°C, condenser 40-50°C
    - LNG liquefaction: -160°C, 101.325 kPa
    - Steam methane reformer: 800-900°C, 2000-3000 kPa
    - Water-ethanol distillation: feed 80-95°C, 101.325 kPa, 20-40 stages, reflux 2-4
    - Benzene-toluene distillation: feed 100-110°C, 101.325 kPa, 20-30 stages
    - Flash separation: pressure drop to 50-70% of upstream pressure
    - Compressor intercooling: cool to 40-50°C between stages, max ratio 3-4 per stage
    - Centrifugal pumps: efficiency 0.70-0.80, max head 200m per stage
    - Heat exchanger approach temperature: 10-20°C (shell & tube), 5-10°C (plate)

    CRITICAL: These values MUST match what an engineer would enter in Aspen HYSYS or DWSIM.
    The simulation results must be replicable — use standard textbook conditions, not approximations.

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
    - BEFORE returning JSON, verify: Every node.id in nodes[] appears in at least one edge in edges[] (as either source or target)
    - MANDATORY CHECK: Count nodes in nodes[], then count how many unique node IDs appear in edges[]. These numbers must match (every node must be in an edge)

    🔥 HEAT EXCHANGER CONNECTIVITY (CRITICAL - READ THIS CAREFULLY):
    - Every heat exchanger (shellTubeHX, heaterCooler, condenser, airCooler) MUST be connected
    - If you create a heat exchanger node, you MUST IMMEDIATELY create edges for it in the same response
    - For coolers/condensers: Connect the hot process stream through the exchanger
    - Create TWO edges for a cooler: one TO the cooler (hot-in-left) and one FROM the cooler (hot-out-right)
    - Example: If you create "hx-cooler-1", you MUST create these edges:
      * Edge TO cooler: {"source": "upstream-equipment-id", "sourceHandle": "outlet-handle", "target": "hx-cooler-1", "targetHandle": "hot-in-left", "type": "step"}
      * Edge FROM cooler: {"source": "hx-cooler-1", "sourceHandle": "hot-out-right", "target": "downstream-equipment-id", "targetHandle": "inlet-handle", "type": "step"}
    - NEVER create a heat exchanger node without creating edges that connect it to the process flow
    - If you cannot logically connect a heat exchanger, DO NOT create it in the nodes array
    - MANDATORY RULE: For every heat exchanger in nodes[], there MUST be at least one edge in edges[] that has that heat exchanger as source OR target
    - CRITICAL: Every heat exchanger in nodes[] must appear in at least one edge in edges[]

    🏭 COLUMN CONNECTIVITY (CRITICAL):
    - ALL columns (distillation, vacuum, packed, absorber, stripper) MUST have connections
    - Every column MUST have at least one feed inlet connected (feed-stage-10, feed-left, etc.)
    - Every column MUST have at least one product outlet connected (overhead-top, bottoms-bottom, etc.)
    - Vacuum columns are process equipment and MUST be connected to feed streams and product streams
    - If you create a vacuum column, you MUST create edges connecting:
      * Feed stream TO the column (edge from source equipment to column with targetHandle like "feed-stage-10")
      * Product streams FROM the column (edges from column with sourceHandle like "overhead-top" or "bottoms-bottom" to destination equipment)
    - Never create a column without creating the corresponding edges that connect it to the process flow

    Include relevant process parameters using the EXACT parameter keys listed in the
    EQUIPMENT PARAMETERS section above. Do NOT use alternative names like "stages",
    "reflux_ratio", "pressure_rise", "duty", or "temperature" — use n_stages,
    reflux_ratio_multiple, pressure_rise_kpa, duty_kw, outlet_temperature_c, etc.

    Create meaningful connections between equipment.
    All edges should use type: "step" for horizontal/vertical lines.
    Provide detailed DWSIM setup instructions (not Aspen HYSYS).

    🔍 BEFORE RETURNING JSON - MANDATORY CONNECTIVITY VERIFICATION:
    1. List every node.id from nodes[]
    2. List every "source" and "target" from edges[]
    3. Verify: Every node.id appears in the edge list (as source OR target)
    4. If ANY node.id is missing from edges[], you have two options:
       a) Add an edge connecting that node to another node, OR
       b) Remove that node from nodes[] entirely
    5. DO NOT return JSON until every node is connected via at least one edge
    6. This check is MANDATORY - isolated equipment will cause the generation to fail

    ✅ VALIDATION CHECKLIST (must pass before returning JSON - CHECK EACH ITEM):
    1. Every edge has sourceHandle and targetHandle
    2. Handles used exist in the ports of the corresponding nodes
    3. Column overhead uses overhead-top; bottoms uses bottoms-bottom; reflux uses reflux-top
    4. separator3p uses gas-top, oil-right, water-bottom
    5. Pumps/compressors use suction-left → discharge-right
    6. Heat exchangers hot/cold sides not crossed
    7. Keep main process streams only (no utilities or signal lines)
    8. Streams connect at LOGICALLY CORRECT physical locations (top/bottom/sides)
    9. ALL equipment has at least one connection (NO completely isolated units)
    10. ALL columns (distillation, vacuum, packed, absorber, stripper) have feed and product edges
    11. Process flow is COMPLETE and CONTINUOUS from feed to products
    12. Feed equipment can have only outgoing connections (VALID)
    13. Product equipment can have only incoming connections (VALID)
    14. Process equipment should have both incoming and outgoing connections (VALID)
    15. CRITICAL: Every node in the "nodes" array must appear in at least one edge in the "edges" array
    16. MANDATORY CONNECTIVITY CHECK: For each node in nodes[], verify it appears as "source" or "target" in at least one edge in edges[]
    17. MANDATORY HEAT EXCHANGER CHECK: If nodes[] contains any heat exchanger (shellTubeHX, heaterCooler, condenser, airCooler), verify edges[] contains edges connecting it
    18. All unit operation types are DWSIM-supported (see list above)
    19. Property package is DWSIM-supported (Peng-Robinson, NRTL, UNIFAC, etc.)
    20. Feed streams have temperature, pressure, and composition specified in stream.data.properties
    21. No unsupported unit types (recipPump, controlValve, etc.) are used - use alternatives instead

    🔍 FINAL CONNECTIVITY VERIFICATION (DO THIS BEFORE RETURNING JSON):
    - List all node IDs from nodes[]
    - List all source and target IDs from edges[]
    - Every node ID must appear in the edge list (as source OR target)
    - If any node ID is missing from edges[], either add an edge for it or remove that node

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

// ---------------------------------------------------------------------------
// Port registry — valid inlet/outlet handles per equipment type
// Must stay in sync with the AI system prompt port definitions (lines 282-319)
// ---------------------------------------------------------------------------

const PORT_REGISTRY: Record<string, { inlets: string[]; outlets: string[] }> = {
  // Distillation columns & towers
  distillationColumn: { inlets: ['reflux-top', 'feed-stage-6', 'feed-stage-8', 'feed-stage-10', 'feed-stage-12', 'feed-stage-18', 'feed-left', 'in-left'], outlets: ['overhead-top', 'bottoms-bottom'] },
  packedColumn:       { inlets: ['reflux-top', 'feed-stage-6', 'feed-stage-8', 'feed-stage-10', 'feed-stage-12', 'feed-stage-18', 'feed-left', 'in-left'], outlets: ['overhead-top', 'bottoms-bottom'] },
  absorber:           { inlets: ['reflux-top', 'feed-stage-6', 'feed-stage-8', 'feed-stage-10', 'feed-stage-12', 'feed-stage-18', 'feed-left', 'in-left'], outlets: ['overhead-top', 'bottoms-bottom'] },
  stripper:           { inlets: ['reflux-top', 'feed-stage-6', 'feed-stage-8', 'feed-stage-10', 'feed-stage-12', 'feed-stage-18', 'feed-left', 'in-left'], outlets: ['overhead-top', 'bottoms-bottom'] },
  // 3-phase separator
  separator3p:        { inlets: ['feed-left'], outlets: ['gas-top', 'oil-right', 'water-bottom'] },
  // 2-phase separators
  separator:          { inlets: ['feed-left'], outlets: ['vapor-top', 'liquid-bottom'] },
  flashDrum:          { inlets: ['feed-left'], outlets: ['vapor-top', 'liquid-bottom'] },
  surgeDrum:          { inlets: ['feed-left'], outlets: ['vapor-top', 'liquid-bottom'] },
  knockoutDrumH:      { inlets: ['feed-left'], outlets: ['vapor-top', 'liquid-bottom'] },
  refluxDrum:         { inlets: ['feed-left'], outlets: ['vapor-top', 'liquid-bottom'] },
  // Rotating equipment
  pump:               { inlets: ['suction-left'], outlets: ['discharge-right'] },
  compressor:         { inlets: ['suction-left'], outlets: ['discharge-right'] },
  turbine:            { inlets: ['suction-left'], outlets: ['discharge-right'] },
  // Heat exchangers
  shellTubeHX:        { inlets: ['hot-in-left', 'cold-in-bottom'], outlets: ['hot-out-right', 'cold-out-top'] },
  plateHX:            { inlets: ['hot-in-left', 'cold-in-bottom'], outlets: ['hot-out-right', 'cold-out-top'] },
  doublePipeHX:       { inlets: ['hot-in-left', 'cold-in-bottom'], outlets: ['hot-out-right', 'cold-out-top'] },
  heaterCooler:       { inlets: ['hot-in-left', 'cold-in-bottom'], outlets: ['hot-out-right', 'cold-out-top'] },
  condenser:          { inlets: ['hot-in-left', 'cold-in-bottom'], outlets: ['hot-out-right', 'cold-out-top'] },
  airCooler:          { inlets: ['hot-in-left', 'cold-in-bottom'], outlets: ['hot-out-right', 'cold-out-top'] },
  firedHeater:        { inlets: ['hot-in-left', 'cold-in-bottom'], outlets: ['hot-out-right', 'cold-out-top'] },
  kettleReboiler:     { inlets: ['hot-in-left', 'cold-in-bottom'], outlets: ['hot-out-right', 'cold-out-top'] },
  boiler:             { inlets: ['hot-in-left', 'cold-in-bottom'], outlets: ['hot-out-right', 'cold-out-top'] },
  // Valves
  valve:              { inlets: ['in-left'], outlets: ['out-right'] },
  // Tanks
  tank:               { inlets: ['in-top'], outlets: ['out-bottom'] },
  // Mixer / Splitter
  mixer:              { inlets: ['in-1-left', 'in-2-left', 'in-3-left'], outlets: ['out-right'] },
  splitter:           { inlets: ['in-left'], outlets: ['out-1-right', 'out-2-right', 'out-3-right'] },
  // Reactors
  cstr:               { inlets: ['in-left', 'feed-left'], outlets: ['out-right'] },
  pfr:                { inlets: ['in-left', 'feed-left'], outlets: ['out-right'] },
  conversionReactor:  { inlets: ['in-left', 'feed-left'], outlets: ['out-right'] },
  gibbsReactor:       { inlets: ['in-left', 'feed-left'], outlets: ['out-right'] },
  equilibriumReactor: { inlets: ['in-left', 'feed-left'], outlets: ['out-right'] },
  // Separation equipment
  filter:             { inlets: ['in-left'], outlets: ['out-right'] },
  cyclone:            { inlets: ['in-left'], outlets: ['out-right'] },
  adsorber:           { inlets: ['in-left'], outlets: ['out-right'] },
  membrane:           { inlets: ['in-left'], outlets: ['out-right'] },
};

/**
 * Validate and fix sourceHandle/targetHandle on edges.
 *
 * When the AI omits handles or uses invalid ones, this assigns the next
 * available port from PORT_REGISTRY, preventing dict key collisions in
 * the solver (e.g. two flash drum outlets both mapping to "out").
 */
function validateAndFixHandles(nodes: FlowNode[], edges: FlowEdge[]): FlowEdge[] {
  const nodeTypeMap = new Map<string, string>();
  for (const node of nodes) {
    nodeTypeMap.set(node.id, node.type);
  }

  // Track which outlet/inlet ports have already been assigned per node
  const usedOutlets = new Map<string, Set<string>>();
  const usedInlets = new Map<string, Set<string>>();

  const fixedEdges = edges.map(edge => {
    const fixed = { ...edge };
    let corrected = false;

    // --- Fix sourceHandle ---
    const srcType = nodeTypeMap.get(edge.source);
    if (srcType) {
      const registry = PORT_REGISTRY[srcType];
      if (registry) {
        const validOutlets = registry.outlets;
        if (!usedOutlets.has(edge.source)) usedOutlets.set(edge.source, new Set());
        const used = usedOutlets.get(edge.source)!;

        const currentHandle = edge.sourceHandle;
        const isValid = currentHandle && validOutlets.some(v => v === currentHandle || currentHandle.includes(v.split('-')[0]));

        if (!isValid) {
          // Assign next unused outlet
          const nextPort = validOutlets.find(p => !used.has(p));
          if (nextPort) {
            fixed.sourceHandle = nextPort;
            corrected = true;
          }
        }

        // Mark the (possibly corrected) handle as used
        if (fixed.sourceHandle) used.add(fixed.sourceHandle);
      }
    }

    // --- Fix targetHandle ---
    const tgtType = nodeTypeMap.get(edge.target);
    if (tgtType) {
      const registry = PORT_REGISTRY[tgtType];
      if (registry) {
        const validInlets = registry.inlets;
        if (!usedInlets.has(edge.target)) usedInlets.set(edge.target, new Set());
        const used = usedInlets.get(edge.target)!;

        const currentHandle = edge.targetHandle;
        const isValid = currentHandle && validInlets.some(v => v === currentHandle || currentHandle.includes(v.split('-')[0]));

        if (!isValid) {
          // Assign next unused inlet
          const nextPort = validInlets.find(p => !used.has(p));
          if (nextPort) {
            fixed.targetHandle = nextPort;
            corrected = true;
          }
        }

        if (fixed.targetHandle) used.add(fixed.targetHandle);
      }
    }

    if (corrected) {
      console.log(`[handleFix] Edge '${edge.id}': sourceHandle ${edge.sourceHandle ?? '(none)'} → ${fixed.sourceHandle}, targetHandle ${edge.targetHandle ?? '(none)'} → ${fixed.targetHandle}`);
    }

    return fixed;
  });

  return fixedEdges;
}

/**
 * Minimum required outlets per multi-outlet equipment type.
 * If the AI generates fewer outlet edges than this, we add product stream edges.
 */
const MIN_OUTLETS: Record<string, { count: number; handles: string[]; labels: string[] }> = {
  flashDrum:          { count: 2, handles: ['vapor-top', 'liquid-bottom'],       labels: ['Vapor Product', 'Liquid Product'] },
  separator:          { count: 2, handles: ['vapor-top', 'liquid-bottom'],       labels: ['Vapor Product', 'Liquid Product'] },
  knockoutDrumH:      { count: 2, handles: ['vapor-top', 'liquid-bottom'],       labels: ['Vapor Product', 'Liquid Product'] },
  surgeDrum:          { count: 2, handles: ['vapor-top', 'liquid-bottom'],       labels: ['Vapor Product', 'Liquid Product'] },
  separator3p:        { count: 3, handles: ['gas-top', 'oil-right', 'water-bottom'], labels: ['Gas Product', 'Oil Product', 'Water Product'] },
  distillationColumn: { count: 2, handles: ['overhead-top', 'bottoms-bottom'],   labels: ['Overhead', 'Bottoms'] },
  packedColumn:       { count: 2, handles: ['overhead-top', 'bottoms-bottom'],   labels: ['Overhead', 'Bottoms'] },
  absorber:           { count: 2, handles: ['overhead-top', 'bottoms-bottom'],   labels: ['Overhead', 'Bottoms'] },
  stripper:           { count: 2, handles: ['overhead-top', 'bottoms-bottom'],   labels: ['Overhead', 'Bottoms'] },
  splitter:           { count: 2, handles: ['out-1-right', 'out-2-right'],       labels: ['Split 1', 'Split 2'] },
};

/**
 * Add missing outlet product stream edges for multi-outlet units.
 *
 * When the AI forgets to create outlet edges for a flash drum or column,
 * the solver can't store the calculated results. This adds placeholder
 * product-stream edges so the solver can populate all outlets.
 */
function addMissingOutletEdges(nodes: FlowNode[], edges: FlowEdge[]): FlowEdge[] {
  // Count existing outlet edges per node
  const outletEdgesPerNode = new Map<string, number>();
  const usedSourceHandles = new Map<string, Set<string>>();
  for (const edge of edges) {
    outletEdgesPerNode.set(edge.source, (outletEdgesPerNode.get(edge.source) ?? 0) + 1);
    if (!usedSourceHandles.has(edge.source)) usedSourceHandles.set(edge.source, new Set());
    if (edge.sourceHandle) usedSourceHandles.get(edge.source)!.add(edge.sourceHandle);
  }

  const newEdges = [...edges];
  let addedCount = 0;

  for (const node of nodes) {
    const spec = MIN_OUTLETS[node.type];
    if (!spec) continue;

    const currentOutlets = outletEdgesPerNode.get(node.id) ?? 0;
    if (currentOutlets >= spec.count) continue;

    const used = usedSourceHandles.get(node.id) ?? new Set();

    // Add missing outlet edges as product streams
    for (let i = 0; i < spec.handles.length; i++) {
      if (used.has(spec.handles[i])) continue;
      if (currentOutlets + addedCount >= spec.count) break;

      const edgeId = `auto-${node.id}-${spec.handles[i]}`;
      // Create a product-label node for the product stream endpoint
      const productNodeId = `product-${node.id}-${i}`;
      nodes.push({
        id: productNodeId,
        type: 'label',
        position: { x: (node.position?.x ?? 500) + 250, y: (node.position?.y ?? 300) + (i * 200 - 100) },
        data: { label: spec.labels[i] },
      });

      newEdges.push({
        id: edgeId,
        source: node.id,
        target: productNodeId,
        sourceHandle: spec.handles[i],
        label: spec.labels[i],
        data: {},
      });

      addedCount++;
      console.log(`[autoOutlet] Added missing outlet edge: ${node.id}[${spec.handles[i]}] → ${productNodeId}`);
    }
  }

  return newEdges;
}

/**
 * Strip non-numeric parameter values that the AI sometimes generates
 * (e.g. {"outlet_pressure_kpa": "value"} or {"efficiency": "high"}).
 */
function sanitizeParameters(nodes: FlowNode[]): FlowNode[] {
  return nodes.map(node => {
    if (!node.data?.parameters) return node;
    const params = { ...node.data.parameters };
    for (const [key, val] of Object.entries(params)) {
      if (typeof val === 'string' && key !== 'light_key' && key !== 'heavy_key' && key !== 'base_component') {
        const num = Number(val);
        if (!isNaN(num)) {
          params[key] = num;
        } else {
          // Non-numeric string like "value", "high", "auto" — remove it
          console.log(`[sanitize] Removing non-numeric param '${key}': '${val}' from ${node.id}`);
          delete params[key];
        }
      }
    }
    return { ...node, data: { ...node.data, parameters: params } };
  });
}

/** Map common AI parameter name variations to the exact keys expected by unit_operations.py */
function normalizeEquipmentParameters(nodes: FlowNode[]): FlowNode[] {
  const PARAM_ALIASES: Record<string, string> = {
    // Distillation
    stages: 'n_stages',
    number_of_stages: 'n_stages',
    num_stages: 'n_stages',
    reflux_ratio: 'reflux_ratio_multiple',
    rr_multiple: 'reflux_ratio_multiple',
    condenser_pressure: 'condenser_pressure_kpa',
    reboiler_pressure: 'reboiler_pressure_kpa',
    lightKey: 'light_key',
    heavyKey: 'heavy_key',
    // Pumps / compressors
    pressure_rise: 'pressure_rise_kpa',
    outlet_pressure: 'outlet_pressure_kpa',
    discharge_pressure: 'outlet_pressure_kpa',
    // Heater / cooler
    outlet_temperature: 'outlet_temperature_c',
    outlet_temp: 'outlet_temperature_c',
    duty: 'duty_kw',
    pressure_drop: 'pressure_drop_kpa',
    // Flash
    temperature: 'temperature_c',
    pressure: 'pressure_kpa',
    // Reactor
    outlet_temp_c: 'outlet_temperature_c',
  };

  return nodes.map(node => {
    if (!node.data?.parameters) return node;
    const params = { ...node.data.parameters };
    for (const [alias, canonical] of Object.entries(PARAM_ALIASES)) {
      if (alias in params && !(canonical in params)) {
        params[canonical] = params[alias];
        delete params[alias];
      }
    }
    return { ...node, data: { ...node.data, parameters: params } };
  });
}

/** Ensure a reaction value is a valid number; return fallback otherwise */
function sanitizeReactionNumber(val: any, fallback: number): number {
  if (typeof val === 'number' && isFinite(val)) return val;
  if (typeof val === 'string') {
    const n = Number(val);
    if (isFinite(n)) return n;
  }
  return fallback;
}

/** Sanitize stoichiometric coefficient maps — strip non-numeric values */
function sanitizeStoichMap(map: Record<string, any>): Record<string, number> {
  const clean: Record<string, number> = {};
  for (const [comp, coeff] of Object.entries(map)) {
    clean[comp] = sanitizeReactionNumber(coeff, 1.0);
  }
  return clean;
}

/** Convert simplified AI reaction format to solver-expected stoichiometric format */
function normalizeReactions(nodes: FlowNode[]): FlowNode[] {
  const REACTOR_TYPES = new Set([
    'conversionReactor', 'cstr', 'pfr', 'gibbsReactor', 'equilibriumReactor',
  ]);
  return nodes.map(node => {
    if (!REACTOR_TYPES.has(node.type) || !node.data?.parameters?.reactions) return node;
    const params = { ...node.data.parameters };
    const reactions = params.reactions as any[];
    params.reactions = reactions.map((r: any) => {
      // Already in correct format — sanitize numeric values
      if (r.reactants && r.products) {
        return {
          ...r,
          reactants: sanitizeStoichMap(r.reactants),
          products: sanitizeStoichMap(r.products),
          conversion: sanitizeReactionNumber(r.conversion, 0.95),
        };
      }
      // Simplified format: { reactant, product, conversion }
      if (r.reactant && r.product) {
        const products: Record<string, number> = {};
        if (Array.isArray(r.product)) {
          for (const p of r.product) products[p] = 1;
        } else {
          products[r.product] = 1;
        }
        return {
          reactants: { [r.reactant]: 1 },
          products,
          conversion: sanitizeReactionNumber(r.conversion, 0.95),
          base_component: r.reactant,
        };
      }
      return r; // Unknown format, pass through
    });
    return { ...node, data: { ...node.data, parameters: params } };
  });
}

/**
 * Ensure every process unit has at least one incoming edge.
 *
 * When the AI generates a mixer (or heater, etc.) with 0 incoming edges,
 * the solver skips it (no inlets) and everything downstream cascades.
 * This function detects orphaned units and either:
 *   a) Moves feed data from outgoing edges to new incoming feed edges, or
 *   b) Creates a synthetic feed from the thermo config.
 */
function ensureUnitInlets(
  nodes: FlowNode[],
  edges: FlowEdge[],
  thermo?: { package: string; components: string[] },
): FlowEdge[] {
  const NEEDS_INLET = new Set([
    'mixer', 'heaterCooler', 'firedHeater', 'conversionReactor', 'cstr', 'pfr',
    'pump', 'compressor', 'turbine', 'valve', 'flashDrum', 'separator',
    'distillationColumn', 'packedColumn', 'absorber', 'stripper',
    'shellTubeHX', 'airCooler', 'condenser', 'kettleReboiler', 'boiler',
    'splitter', 'membrane', 'filter', 'cyclone',
  ]);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const incomingCount = new Map<string, number>();
  for (const edge of edges) {
    if (nodeMap.has(edge.target)) {
      incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
    }
  }

  const newEdges = [...edges];

  for (const node of nodes) {
    const incoming = incomingCount.get(node.id) ?? 0;
    if (incoming > 0 || !NEEDS_INLET.has(node.type)) continue;

    // This unit has NO incoming edges — check if any outgoing edge has feed data
    const outgoingWithData = edges.filter(e =>
      e.source === node.id && e.data?.temperature != null && e.data?.composition
    );

    if (outgoingWithData.length > 0) {
      // Move feed data from outgoing edges to new incoming feed edges
      for (let i = 0; i < outgoingWithData.length; i++) {
        const feedNodeId = `feed-source-${node.id}-${i}`;
        nodes.push({
          id: feedNodeId, type: 'label',
          position: { x: (node.position?.x ?? 300) - 200, y: (node.position?.y ?? 300) + i * 100 },
          data: { label: `Feed ${i + 1}` },
        });
        const inletHandle = node.type === 'mixer' ? `in-${i + 1}-left` : 'in-left';
        newEdges.push({
          id: `feed-${node.id}-${i}`,
          source: feedNodeId, target: node.id,
          sourceHandle: 'out-right', targetHandle: inletHandle,
          data: { ...outgoingWithData[i].data },
        });
        // Clear feed data from original outgoing edge (solver will compute it)
        outgoingWithData[i].data = {};
        console.log(`[ensureInlets] Moved feed data from outgoing edge to new inlet for ${node.id}`);
      }
    } else {
      // No outgoing edges with data either — create a synthetic feed from thermo config
      const comps = thermo?.components ?? [];
      if (comps.length > 0) {
        const feedNodeId = `feed-source-${node.id}`;
        nodes.push({
          id: feedNodeId, type: 'label',
          position: { x: (node.position?.x ?? 300) - 200, y: node.position?.y ?? 300 },
          data: { label: 'Feed' },
        });
        const composition: Record<string, number> = {};
        comps.forEach((c: string) => composition[c] = 1.0 / comps.length);
        const inletHandle = node.type === 'mixer' ? 'in-1-left' : 'in-left';
        newEdges.push({
          id: `feed-${node.id}`,
          source: feedNodeId, target: node.id,
          sourceHandle: 'out-right', targetHandle: inletHandle,
          data: { temperature: 25, pressure: 101.325, flow_rate: 10000, composition },
        });
        console.log(`[ensureInlets] Created synthetic feed for orphaned unit ${node.id}`);
      }
    }
  }
  return newEdges;
}

/** Fill process-aware default parameters so the solver doesn't fail on missing specs */
function validateAndFillDefaults(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  // Build a map: nodeId → feed pressure from the first incoming edge that has pressure data
  const feedPressureMap = new Map<string, number>();
  // Build a map: nodeId → feed temperature from the first incoming edge that has temperature data
  const feedTempMap = new Map<string, number>();
  for (const edge of edges) {
    if (edge.data?.pressure != null && !feedPressureMap.has(edge.target)) {
      feedPressureMap.set(edge.target, Number(edge.data.pressure));
    }
    if (edge.data?.temperature != null && !feedTempMap.has(edge.target)) {
      feedTempMap.set(edge.target, Number(edge.data.temperature));
    }
  }

  // Count outlet edges per node (for splitter fraction defaults)
  const outletCountMap = new Map<string, number>();
  for (const edge of edges) {
    outletCountMap.set(edge.source, (outletCountMap.get(edge.source) ?? 0) + 1);
  }

  const HEATER_COOLER_TYPES = new Set([
    'heaterCooler', 'firedHeater', 'condenser', 'airCooler', 'boiler', 'kettleReboiler',
  ]);

  return nodes.map(node => {
    if (!node.data) return node;
    const params = { ...(node.data.parameters ?? {}) };
    const feedP = feedPressureMap.get(node.id);
    const t = node.type;

    if (t === 'pump') {
      if (params.outlet_pressure_kpa == null && params.pressure_rise_kpa == null) {
        params.pressure_rise_kpa = Math.max((feedP ?? 1000) * 0.1, 100);
      }
    } else if (t === 'compressor') {
      if (params.outlet_pressure_kpa == null && params.pressure_ratio == null) {
        params.pressure_ratio = 3.0;
      }
    } else if (t === 'turbine') {
      if (params.outlet_pressure_kpa == null && params.pressure_ratio == null) {
        params.pressure_ratio = 3.0;
      }
    } else if (t === 'valve') {
      if (params.outlet_pressure_kpa == null && params.pressure_drop_kpa == null) {
        params.pressure_drop_kpa = Math.max((feedP ?? 500) * 0.2, 50);
      }
    } else if (['distillationColumn', 'packedColumn', 'absorber', 'stripper'].includes(t)) {
      if (params.condenser_pressure_kpa == null) {
        params.condenser_pressure_kpa = feedP ?? 101.325;
      }
      if (params.reboiler_pressure_kpa == null) {
        params.reboiler_pressure_kpa = Number(params.condenser_pressure_kpa) * 1.1;
      }
    } else if (t === 'splitter') {
      if (params.fractions == null) {
        const outCount = outletCountMap.get(node.id) ?? 2;
        params.fractions = Array(outCount).fill(1 / outCount);
      }
    }

    // Heater/cooler defaults — assign outlet_temperature_c when nothing is specified
    if (HEATER_COOLER_TYPES.has(t)) {
      if (params.outlet_temperature_c == null && params.duty_kw == null) {
        const label = (node.data.label || node.id).toLowerCase();
        if (label.includes('cooler') || label.includes('condenser') || t === 'condenser' || t === 'airCooler') {
          params.outlet_temperature_c = 35;  // Cooling water or ambient
        } else if (label.includes('heater') || label.includes('fired') || label.includes('boiler')
                   || t === 'firedHeater' || t === 'boiler' || t === 'kettleReboiler') {
          const feedT = feedTempMap.get(node.id);
          params.outlet_temperature_c = feedT != null ? feedT + 100 : 200;
        } else {
          // Generic heaterCooler — try to infer from label
          const feedT = feedTempMap.get(node.id);
          if (label.includes('preheat') || label.includes('warm') || label.includes('reheat')) {
            params.outlet_temperature_c = feedT != null ? feedT + 50 : 150;
          } else {
            // Default to cooling (more common in process plants)
            params.outlet_temperature_c = 35;
          }
        }
        console.log(`[defaults] Set ${node.id} outlet_temperature_c = ${params.outlet_temperature_c}`);
      }
    }

    return { ...node, data: { ...node.data, parameters: params } };
  });
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, retryCount = 0, components = [], propertyPackage = '' } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable.' },
        { status: 500 }
      );
    }

    // Build user message with optional component/package context
    let userMessage = prompt;
    if (components.length > 0 || propertyPackage) {
      const thermoContext: string[] = [];
      if (components.length > 0) {
        thermoContext.push(`Chemical components to use: ${components.join(', ')}`);
      }
      if (propertyPackage) {
        thermoContext.push(`Property package: ${propertyPackage}`);
      }
      userMessage = `${prompt}\n\nThermodynamic configuration provided by user:\n${thermoContext.join('\n')}\nUse these in the "thermo" object of the response.`;
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 10000,
      messages: [
        { role: 'system', content: FLOWSHEET_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    // Extract text from OpenAI response
    const responseText = response.choices[0]?.message?.content ?? '';

    if (!responseText) {
      throw new Error('No response from OpenAI');
    }

    // Extract JSON from response (handle markdown code blocks and extra text)
    let jsonText = responseText.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\s*/i, '');
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
      console.error('Failed to parse AI response:', {
        originalLength: responseText.length,
        extractedLength: jsonText.length,
        firstChars: jsonText.substring(0, 200),
        lastChars: jsonText.substring(Math.max(0, jsonText.length - 200)),
        parseError: parseError instanceof Error ? parseError.message : String(parseError)
      });

      if (retryCount > 0) {
        return NextResponse.json(
          {
            error: 'Invalid JSON response from AI after retry',
            details: 'The AI returned malformed JSON. Please try again with a simpler prompt.'
          },
          { status: 500 }
        );
      }

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

    // Normalize equipment parameter names (safety net for AI variations)
    if (flowsheetData.nodes) {
      flowsheetData.nodes = sanitizeParameters(flowsheetData.nodes);
      flowsheetData.nodes = normalizeEquipmentParameters(flowsheetData.nodes);
      flowsheetData.nodes = normalizeReactions(flowsheetData.nodes);
      flowsheetData.nodes = validateAndFillDefaults(flowsheetData.nodes, flowsheetData.edges);
    }

    // Sanitize edge data — strip non-numeric strings like "value" from stream properties
    if (flowsheetData.edges) {
      flowsheetData.edges = flowsheetData.edges.map((edge: FlowEdge) => {
        if (!edge.data) return edge;
        const data = { ...edge.data };
        for (const [key, val] of Object.entries(data)) {
          if (key === 'composition' && typeof val === 'object' && val !== null) {
            // Sanitize composition values too
            const comp = { ...val as Record<string, any> };
            for (const [ck, cv] of Object.entries(comp)) {
              if (typeof cv === 'string') {
                const n = Number(cv);
                if (isFinite(n)) { comp[ck] = n; } else { delete comp[ck]; }
              }
            }
            data[key] = comp;
          } else if (typeof val === 'string') {
            const n = Number(val);
            if (isFinite(n)) { data[key] = n; } else {
              console.log(`[sanitize-edge] Removing non-numeric '${key}': '${val}' from edge ${edge.id}`);
              delete data[key];
            }
          }
        }
        return { ...edge, data };
      });
    }

    // Fix missing/invalid sourceHandle and targetHandle on edges
    if (flowsheetData.edges) {
      flowsheetData.edges = validateAndFixHandles(flowsheetData.nodes, flowsheetData.edges);
    }

    // Auto-add missing outlet edges for multi-outlet units (flash drums, columns, etc.)
    // When AI omits product stream edges, add them so the solver can populate outlets.
    if (flowsheetData.nodes && flowsheetData.edges) {
      flowsheetData.edges = addMissingOutletEdges(flowsheetData.nodes, flowsheetData.edges);
    }

    // Topology repair: ensure every process unit has at least one incoming edge
    if (flowsheetData.nodes && flowsheetData.edges) {
      flowsheetData.edges = ensureUnitInlets(flowsheetData.nodes, flowsheetData.edges, flowsheetData.thermo);
    }

    // Validate required fields
    if (!flowsheetData.nodes || !flowsheetData.edges || !flowsheetData.dwsimInstructions) {
      return NextResponse.json(
        { error: 'Invalid flowsheet data structure' },
        { status: 500 }
      );
    }

    // Normalize compound names (underscores→spaces, common abbreviations)
    if (flowsheetData.thermo?.components) {
      flowsheetData.thermo.components = flowsheetData.thermo.components.map((c: string) =>
        c.replace(/_/g, ' ').trim()
      );
    }

    // Auto-correct property package: NRTL/UNIFAC/UNIQUAC can't handle gas-dominated mixtures
    // with non-condensable components (H2, N2, O2, CO, CH4) — fall back to SRK
    if (flowsheetData.thermo?.package && ['NRTL', 'UNIFAC', 'UNIQUAC'].includes(flowsheetData.thermo.package)) {
      const NON_CONDENSABLES = new Set([
        'hydrogen', 'nitrogen', 'oxygen', 'carbon monoxide', 'methane',
        'ethane', 'argon', 'helium', 'carbon dioxide', 'ethylene',
      ]);
      const comps = flowsheetData.thermo.components ?? [];
      const gasCount = comps.filter((c: string) => NON_CONDENSABLES.has(c.toLowerCase())).length;
      if (comps.length > 0 && gasCount / comps.length > 0.5) {
        console.log(`[thermo] Auto-correcting ${flowsheetData.thermo.package} → SRK (${gasCount}/${comps.length} non-condensable components)`);
        flowsheetData.thermo.package = 'SRK';
      }
    }

    // Validate and fix feed stream thermodynamic data
    const thermoComponents = flowsheetData.thermo?.components ?? components;

    // Auto-inject light_key / heavy_key for distillation columns if missing
    const COLUMN_TYPES = new Set(['distillationColumn', 'packedColumn', 'absorber', 'stripper']);
    for (const node of flowsheetData.nodes) {
      if (COLUMN_TYPES.has(node.type) && thermoComponents.length >= 2) {
        if (!node.data.parameters) node.data.parameters = {};
        if (!node.data.parameters.light_key && !node.data.parameters.heavy_key) {
          // Pick middle split — same logic as Python auto-detection
          const mid = Math.floor(thermoComponents.length / 2);
          node.data.parameters.light_key = thermoComponents[mid - 1];
          node.data.parameters.heavy_key = thermoComponents[mid];
        }
      }
    }

    const edgeTargets = new Set(flowsheetData.edges.map(e => e.target));

    for (const edge of flowsheetData.edges) {
      const sourceHasNoIncoming = edge.source && !edgeTargets.has(edge.source);
      const hasData = edge.data && edge.data.temperature != null;

      if (sourceHasNoIncoming || hasData) {
        if (!edge.data) edge.data = {};

        if (edge.data.composition && thermoComponents.length > 0) {
          const comp = edge.data.composition as Record<string, number>;
          for (const c of thermoComponents) {
            if (!(c in comp)) {
              const lowerMatch = Object.keys(comp).find(k => k.toLowerCase() === c.toLowerCase());
              if (!lowerMatch) comp[c] = 0.0;
            }
          }
          const total = Object.values(comp).reduce((s: number, v: number) => s + v, 0);
          if (total > 0 && Math.abs(total - 1.0) > 0.01) {
            for (const k of Object.keys(comp)) {
              comp[k] = comp[k] / total;
            }
          }
        }

        // Create default composition from thermoComponents when AI omitted it
        if (!edge.data.composition && thermoComponents.length > 0) {
          const comp: Record<string, number> = {};
          const frac = 1.0 / thermoComponents.length;
          for (const c of thermoComponents) {
            comp[c] = frac;
          }
          edge.data.composition = comp;
        }

        if (edge.data.temperature == null) {
          edge.data.temperature = 25.0;  // ambient default
        }
        if (edge.data.pressure == null) {
          edge.data.pressure = 101.325;  // atmospheric default
        }
        if (edge.data.flow_rate == null) edge.data.flow_rate = 1000.0;
      }
    }

    // Check for isolated equipment
    const connectedNodes = new Set<string>();
    const nodesWithIncomingConnections = new Set<string>();
    const nodesWithOutgoingConnections = new Set<string>();

    flowsheetData.edges.forEach(edge => {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
      nodesWithOutgoingConnections.add(edge.source);
      nodesWithIncomingConnections.add(edge.target);
    });

    const trulyIsolatedNodes = flowsheetData.nodes.filter(node => !connectedNodes.has(node.id));

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

    console.log('Connectivity Analysis:', {
      totalNodes: flowsheetData.nodes.length,
      totalEdges: flowsheetData.edges.length,
      trulyIsolatedNodes: trulyIsolatedNodes.map(n => n.id),
      potentialFeedNodes: potentialFeedNodes.map(n => n.id),
      potentialProductNodes: potentialProductNodes.map(n => n.id),
      connectedNodes: Array.from(connectedNodes)
    });

    if (trulyIsolatedNodes.length > 0) {
      if (retryCount > 0) {
        const isolatedDetails = trulyIsolatedNodes.map(n => {
          const type = n.type || 'unknown';
          const label = n.data?.label || n.id;
          return `${n.id} (${type}, "${label}")`;
        }).join('; ');

        return NextResponse.json(
          {
            error: `Isolated equipment found after retry: ${trulyIsolatedNodes.map(n => n.id).join(', ')}. All equipment must be connected to the main process flow.`,
            details: {
              isolatedEquipment: trulyIsolatedNodes.map(n => ({
                id: n.id,
                type: n.type,
                label: n.data?.label
              })),
              totalNodes: flowsheetData.nodes.length,
              totalEdges: flowsheetData.edges.length,
              connectedNodes: Array.from(connectedNodes),
              message: `The following equipment has no connections: ${isolatedDetails}. Each piece of equipment must appear in at least one edge (as source or target).`
            }
          },
          { status: 500 }
        );
      }

      const isolatedEquipmentDetails = trulyIsolatedNodes.map(n => {
        const nodeType = n.type || 'unknown';
        const nodeLabel = n.data?.label || n.id;
        return `- ${n.id} (${nodeType}, "${nodeLabel}")`;
      }).join('\n');

      const isolatedHeatExchangers = trulyIsolatedNodes.filter(n =>
        ['shellTubeHX', 'heaterCooler', 'condenser', 'airCooler', 'kettleReboiler'].includes(n.type)
      );

      let heatExchangerGuidance = '';
      if (isolatedHeatExchangers.length > 0) {
        const hxList = isolatedHeatExchangers.map(n => n.id).join(', ');
        const exampleHx = isolatedHeatExchangers[0].id;
        const hxType = isolatedHeatExchangers[0].type || 'heaterCooler';
        const isCooler = ['heaterCooler', 'condenser', 'airCooler'].includes(hxType);

        const allConnectedNodes = Array.from(connectedNodes);
        const upstreamExample = allConnectedNodes.length > 0 ? allConnectedNodes[0] : 'upstream-equipment-id';
        const downstreamExample = allConnectedNodes.length > 1 ? allConnectedNodes[1] : 'downstream-equipment-id';

        heatExchangerGuidance = `
CRITICAL ERROR: HEAT EXCHANGER CONNECTIVITY ISSUE
The following heat exchangers are COMPLETELY ISOLATED: ${hxList}

MANDATORY FIX: For EACH isolated heat exchanger, either ADD EDGES or REMOVE it from nodes[].

${isCooler ? `For coolers/condensers, connect the HOT process stream through hot-in-left and hot-out-right.` : `For heaters, connect the COLD process stream through cold-in-bottom and cold-out-top.`}

Example edges for "${exampleHx}":
{"source": "${upstreamExample}", "target": "${exampleHx}", "targetHandle": "${isCooler ? 'hot-in-left' : 'cold-in-bottom'}", "type": "step"}
{"source": "${exampleHx}", "sourceHandle": "${isCooler ? 'hot-out-right' : 'cold-out-top'}", "target": "${downstreamExample}", "type": "step"}`;
      }

      const enhancedPrompt = `${prompt}

🚨 CRITICAL ERROR: The previous attempt created isolated equipment not connected to the process flow.

ISOLATED EQUIPMENT DETECTED:
${isolatedEquipmentDetails}${heatExchangerGuidance}

ABSOLUTE RULE: ALL EQUIPMENT MUST BE CONNECTED via edges. Either connect them or remove them.

MANDATORY PRE-RETURN CHECKLIST:
1. Count nodes in nodes[]: N nodes
2. Extract all unique node IDs from edges[]: M unique IDs
3. Verify N == M
4. Specifically check: Does "${trulyIsolatedNodes.map(n => n.id).join('", "')}" appear in any edge? If NO, fix it.

ONLY return JSON when ALL nodes are connected via edges.`;

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
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Internal server error: ${message}` },
      { status: 500 }
    );
  }
}
