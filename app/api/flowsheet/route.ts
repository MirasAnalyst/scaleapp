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
      * Hydrocarbons: "methane", "ethane", "propane", "n-butane", "i-butane", "n-pentane", "isopentane", "n-hexane", "n-octane", "n-decane", "hexadecane", "benzene", "toluene", "cyclohexane", "ethylbenzene"
      * Gases: "hydrogen", "nitrogen", "oxygen", "carbon dioxide", "carbon monoxide", "hydrogen sulfide", "sulfur dioxide"
      * Polar: "water", "methanol", "ethanol", "acetone", "acetic acid", "ammonia"
      * Amines: "monoethanolamine", "diethanolamine", "methyl diethanolamine", "ethylene glycol", "triethylene glycol"
      * Others: "diethyl ether", "styrene", "phenol", "ethylene", "ethylene oxide", "sulfur"

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
      pressure_rise_kpa (number) — PREFERRED: pressure rise in kPa (ALWAYS use this for pumps after separators/columns)
      OR outlet_pressure_kpa (number) — only when you know the exact inlet pressure
      efficiency (number, 0.70-0.85, default 0.75)
      TYPICAL VALUES: Reflux pump: 200-500 kPa rise; Pipeline: 500-2000 kPa rise; Boiler feedwater: 5000-15000 kPa rise
      RULE: Feed MUST be liquid (VF ≈ 0). Add upstream separator if two-phase.
      RULE: ALWAYS use pressure_rise_kpa (not outlet_pressure_kpa) when the pump is downstream of a separator, column, or heat exchanger.

    Compressor:
      outlet_pressure_kpa (number) — discharge pressure in kPa
      OR pressure_ratio (number, 2-5 per stage)
      efficiency (number, 0.72-0.82, default 0.80)
      TYPICAL VALUES: Gas gathering: ratio 2-3; Refrigeration: ratio 3-5; Pipeline: ratio 1.5-2.5
      RULE: Feed MUST be vapor (VF ≈ 1). Add upstream knockout drum if liquid possible.
      RULE: Discharge temp max ~300°C per stage; use intercooling for higher ratios.

    Turbine / Expander:
      outlet_pressure_kpa (number) — exhaust pressure
      OR pressure_ratio (number) — expansion ratio
      efficiency (number, 0.75-0.85, default 0.80)

    Valve:
      MUST specify outlet_pressure_kpa (number) — downstream pressure
      OR pressure_drop_kpa (number) — pressure drop across valve
      FAILURE TO SPECIFY WILL CAUSE A DEFAULT 30% PRESSURE DROP.
      TYPICAL VALUES: Control valve: 50-200 kPa drop; JT valve: 30-70% of inlet P drop; Letdown: 50-80% drop
      RULE: Outlet P MUST be less than inlet P. Isenthalpic (no heat added/removed).

    Heater / Cooler (heaterCooler, firedHeater, boiler, condenser, airCooler, kettleReboiler):
      MUST specify outlet_temperature_c (number) — outlet temperature in Celsius
      OR duty_kw (number) — heat duty in kW (positive = heating)
      FAILURE TO SPECIFY outlet_temperature_c WILL CAUSE INCORRECT SIMULATION RESULTS.
      TYPICAL VALUES: Cooler → 35-40°C; Waste heat boiler → 300°C; Sulfur condenser → 130-150°C;
        Feed preheater → inlet+50°C; Intercooler → 40°C; Chiller → -20°C to -40°C
      pressure_drop_kpa (number, default 0, typically 10-50)

    Shell & Tube Heat Exchanger (shellTubeHX):
      MANDATORY — you MUST specify exactly ONE of these three parameters:
        hot_outlet_temperature_c (number) — hot side outlet temperature in °C
        cold_outlet_temperature_c (number) — cold side outlet temperature in °C
        duty_kw (number) — heat duty in kW
      FAILURE TO SPECIFY WILL CAUSE THE HX TO USE A DEFAULT 10°C APPROACH AND MAY PRODUCE UNEXPECTED RESULTS.
      hot_pressure_drop_kpa (default 0)
      cold_pressure_drop_kpa (default 0)
      IMPORTANT: shellTubeHX requires BOTH hot and cold streams connected (2 inlets, 2 outlets).
      For a simple gas cooler, product cooler, or any single-stream cooler/heater, use "heaterCooler" or "airCooler".
      Only use shellTubeHX when exchanging heat BETWEEN two process streams.
      PROCESS-SPECIFIC GUIDANCE:
        - Lean/rich amine HX: hot_outlet_temperature_c = cold_inlet + 10-15°C (typically 50-55°C)
        - Gas/gas HX in NGL: hot_outlet_temperature_c = cold_inlet + 10-20°C
        - Feed/effluent reactor HX: hot_outlet_temperature_c based on 10-15°C approach

    Flash Drum / Separator (flashDrum, separator, separator3p, knockoutDrumH, surgeDrum):
      temperature_c (number) — flash temperature
      pressure_kpa (number) — flash pressure
      LIQUID-LIQUID EXTRACTION: Use separator3p (not separator) for LLE / extraction / decanting.
      The separator3p performs VLLE flash: "gas" outlet = vapor, "oil" outlet = organic phase, "water" outlet = aqueous phase.
      Use NRTL or UNIQUAC property package for accurate LLE predictions.

    Mixer:
      outlet_pressure_kpa (number, optional — defaults to min of inlet pressures)

    Splitter:
      fractions (array of numbers summing to 1.0, e.g. [0.5, 0.5])

    Distillation Column (distillationColumn, packedColumn):
      light_key (string) — light key component name (MANDATORY — must match a thermo component)
      heavy_key (string) — heavy key component name (MANDATORY — must match a thermo component)
      light_key_recovery (number, 0.95-0.995, default 0.99)
      heavy_key_recovery (number, 0.95-0.995, default 0.99)
      reflux_ratio_multiple (number, 1.2-1.5 of minimum, default 1.3)
      condenser_pressure_kpa (number — column top pressure)
      reboiler_pressure_kpa (number — column bottom pressure)
      n_stages (number, optional — overrides Fenske calculation)
      TYPICAL VALUES: Atmospheric: 20-50 stages, reflux 1.2-1.5× R_min; Vacuum: 5-15 stages
      RULE: Reboiler P must exceed condenser P (typically P_reb = P_cond × 1.05-1.15)
      RULE: reflux_ratio_multiple 1.2-1.5 (never < 1.0, that's below minimum reflux)
      RULE: light_key boiling point MUST be lower than heavy_key boiling point.
      CRITICAL: The shortcut model includes condenser and reboiler INTERNALLY.
      DO NOT create separate condenser, reboiler, reflux drum, or splitter nodes.
      The overhead-top port produces net distillate product directly.
      The bottoms-bottom port produces net bottoms product directly.
      FAILURE TO FOLLOW THIS RULE CREATES MASS BALANCE ERRORS OF 30-50%.
      MULTI-COLUMN KEY SELECTION: When a flowsheet has 2+ columns in series, EACH column MUST have DIFFERENT keys:
        Example: Demethanizer: light_key="methane", heavy_key="ethylene"
                 C2 Splitter: light_key="ethylene", heavy_key="ethane"

    Absorber (absorber) — gas-liquid contacting column:
      n_stages (number, 10-25, default 10)
      temperature_c (number, optional)
      pressure_kpa (number) — MUST match gas feed pressure
      NOTE: Absorbers do NOT use light_key/heavy_key or reflux_ratio.
      CRITICAL: Absorbers MUST have TWO feed streams: gas feed (bottom) and lean solvent (top).
      FAILURE TO PROVIDE TWO FEEDS WILL CAUSE THE ABSORBER TO USE FLASH SEPARATION FALLBACK.
      Create TWO incoming edges to the absorber:
        - Gas feed edge with targetHandle "in-1-left" (enters at bottom)
        - Lean solvent edge with targetHandle "in-2-right" (enters at top)
      Outlets: overhead-top (treated gas), bottoms-bottom (rich solvent)
      Example wiring for TEG dehydration: wet gas edge → absorber (in-1-left), lean TEG edge → absorber (in-2-right), overhead gas ← absorber (overhead-top), rich TEG ← absorber (bottoms-bottom).

    Stripper / Regenerator (stripper) — reboiled stripping column:
      n_stages (number, 10-20, default 15)
      temperature_c (number) — reboiler temperature (MANDATORY for amine regen: 110-120°C)
      pressure_kpa (number) — MUST be low pressure (150-200 kPa for amine regeneration)
      NOTE: Strippers need only ONE feed stream (rich solvent). Reboiler is modeled internally.
      FAILURE TO SPECIFY temperature_c AND pressure_kpa WILL CAUSE incorrect flash separation.
      Create ONE incoming edge to the stripper (feed-left or in-left).
      Outlets: overhead-top (acid gas / steam), bottoms-bottom (lean solvent)
      CRITICAL: Stripper pressure must be MUCH LOWER than absorber pressure. You MUST include
      a valve between the absorber bottoms and the stripper feed to let down pressure.

    Gibbs Reactor (gibbsReactor):
      temperature_c (number) — reactor temperature in °C (MANDATORY)
      pressure_kpa (number) — reactor pressure in kPa (MANDATORY)
      NOTE: No reactions needed — finds chemical equilibrium by Gibbs energy minimization.
      All possible products must be included in thermo.components.

    Kinetic Reactor (kineticReactor):
      reactor_type ("CSTR" or "PFR", default "CSTR")
      volume_m3 (number) — reactor volume in m³
      temperature_c (number) — temperature in °C (omit for adiabatic)
      pressure_kpa (number) — pressure in kPa
      reactions (array of kinetic reaction objects):
        e.g. [{"A": 1e6, "Ea": 60000, "stoichiometry": {"ethanol": -1, "ethylene": 1, "water": 1}, "orders": {"ethanol": 1}}]
        - "A": pre-exponential factor (1/s)
        - "Ea": activation energy (J/mol)
        - "stoichiometry": {component: coeff} — negative for reactants, positive for products
        - "orders": {component: order} — reaction orders

    Rigorous Distillation Column (rigorousDistillationColumn):
      n_stages (number, 10-50) — number of theoretical stages including condenser & reboiler
      feed_tray (number) — feed stage number (1-indexed from top)
      reflux_ratio (number, 1.5-5.0) — external reflux ratio L/D
      condenser_type ("total" or "partial", default "total")
      condenser_pressure_kpa (number) — pressure at condenser
      pressure_drop_per_tray_kpa (number, default 0.5) — pressure drop per tray

    Conversion Reactor (conversionReactor, cstr, pfr):
      reactions (array of stoichiometric reaction objects):
        e.g. [{"reactants": {"ethanol": 1}, "products": {"ethylene": 1, "water": 1}, "conversion": 0.95, "base_component": "ethanol"}]
        - "reactants": object mapping component name → stoichiometric coefficient
        - "products": object mapping component name → stoichiometric coefficient
        - "conversion": fractional conversion (0–1) of the base component
        - "base_component": the reactant whose conversion is specified
      temperature_c OR outlet_temperature_c (number)
      pressure_kpa OR outlet_pressure_kpa (number)

    CRITICAL REACTION RULES:
    - ALL reactant and product component names in reactions MUST exactly match names in thermo.components
    - Do NOT invent product names like "desulfurized-naphtha" or "treated-gas"
    - If a reaction produces a component, that component MUST be listed in thermo.components
    - Example: If methane reacts with steam to produce CO + H2, then thermo.components MUST include
      "methane", "water", "carbon monoxide", AND "hydrogen"
    - WRONG: {"products": {"clean-gas": 1}} — "clean-gas" is not a real chemical
    - RIGHT: {"products": {"methane": 0.95, "ethane": 0.05}} — real components from thermo list
    - FAILURE TO MATCH NAMES WILL CAUSE THE REACTION TO BE SKIPPED AND MASS BALANCE ERRORS
    - When producing sulfur, use "sulfur" in both thermo.components and reaction products
    - When producing ethylene oxide, use "ethylene oxide" in thermo.components and reactions

    CRITICAL for distillation: light_key and heavy_key MUST be set to actual component
    names from the thermo.components list. Pick the two adjacent-boiling components
    that define the desired separation split.

    🧪 DWSIM-SUPPORTED UNIT OPERATIONS (use these EXACT types):
    - distillationColumn (DistillationColumn - shortcut Fenske-Underwood-Gilliland)
    - rigorousDistillationColumn (RigorousDistillation - tray-by-tray MESH solver, use for detailed column design)
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
    - shellTubeHX (HeatExchanger - shell & tube HX, REQUIRES both hot AND cold streams)
    - airCooler (AirCooler - air-cooled exchanger)
    NOTE: For simple coolers (Gas Cooler, Product Cooler, Trim Cooler), use heaterCooler or airCooler — NOT shellTubeHX.
    - kettleReboiler (KettleReboiler - kettle reboiler)
    - firedHeater (FiredHeater - fired heater/furnace)
    - cstr (CSTR - continuous stirred tank reactor)
    - pfr (PFR - plug flow reactor)
    - gibbsReactor (GibbsReactor - Gibbs free energy minimization, finds chemical equilibrium)
    - kineticReactor (KineticReactor - CSTR/PFR with Arrhenius kinetics)
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

    🔬 PROPERTY PACKAGES (use EXACTLY these strings in thermo.package):
    - "Peng-Robinson" (default, recommended for hydrocarbons, natural gas, refinery)
    - "SRK" (similar to PR, good for H₂-rich systems and gas processing)
    - "NRTL" (polar/non-ideal liquids: water-alcohol, water-acid, amine treating)
    - "UNIFAC" (when binary interaction data is unavailable, group-contribution)
    - "UNIQUAC" (strongly non-ideal liquid mixtures, LLE problems)
    IMPORTANT: Use ONLY the exact strings above. Do NOT use "Soave-Redlich-Kwong", "Lee-Kesler-Plöcker", etc.

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
    12. Every flowsheet MUST have at least one feed-source label node: {"id": "feed-source-1", "type": "label", "position": {"x": 0, "y": 300}, "data": {"label": "Feed Name"}}
    13. Feed edges (label → first equipment) MUST have complete data: {"temperature": <°C>, "pressure": <kPa>, "flow_rate": <kg/h>, "composition": {<comp>: <frac>, ...}}
    14. Composition in feed data MUST include ALL thermo.components, summing to 1.0
    15. Every process endpoint SHOULD have a product-sink label node

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

    🏗️ PROCESS TEMPLATES — Use these as reference when building flowsheets:

    1. GAS SWEETENING (AMINE TREATING):
       Equipment chain (in order): absorber → rich amine valve → rich amine heater → stripper (regenerator) → lean amine pump → lean amine cooler
       Absorber: type "absorber", 15-25 stages, 40-50°C, 3000-7000 kPa, NRTL package, needs TWO feeds (sour gas + lean amine)
       Rich amine valve: type "valve" — CRITICAL: lets down pressure from absorber P (~3000-7000 kPa) to regenerator P (~200 kPa). MUST include this valve.
       Rich amine heater: type "heaterCooler", outlet_temperature_c = 90-95 (heats rich amine before stripper, represents cold side of lean/rich HX)
       IMPORTANT: Do NOT use shellTubeHX in the amine recycle loop — the solver cannot converge shellTubeHX in recycle paths. Use heaterCooler instead.
       Regenerator: type "stripper" (NOT absorber, NOT distillationColumn), 15-20 stages, temperature_c = 115, pressure_kpa = 200, ONE feed only (rich solvent)
       Lean amine pump: type "pump", from regenerator P (~200 kPa) to absorber P (~3000-7000 kPa)
       Lean amine cooler: type "heaterCooler", outlet_temperature_c = 40-45°C (cools lean amine, represents hot side of lean/rich HX + trim cooler)
       CRITICAL: MUST include valve between absorber and regenerator for pressure letdown
       CRITICAL: MUST include pump between regenerator and absorber for pressure boost
       CRITICAL: Regenerator MUST be type "stripper" with pressure_kpa = 150-200 and temperature_c = 110-120

    2. NGL RECOVERY / TURBOEXPANDER:
       Equipment: inlet sep + gas/gas HX + turboexpander + cold sep + demethanizer + recompressor
       Gas/Gas HX: cool to -30 to -50°C using cold residue gas
       Turboexpander: expand to 2500-3500 kPa
       Cold separator: -80 to -100°C, Peng-Robinson

    3. CRUDE ATMOSPHERIC DISTILLATION:
       Equipment: desalter + fired heater + atm column + overhead condenser + reflux drum + product coolers + pumps
       Fired heater: 350-370°C
       Column: 30-50 stages, top 110-120°C/150 kPa, bottom 350-370°C/200 kPa

    4. SIMPLE REFRIGERATION LOOP:
       Equipment: evaporator + compressor + condenser + expansion valve
       Propane: evaporator -30 to -40°C, condenser 40-50°C, 1200-1500 kPa

    5. WATER-ETHANOL DISTILLATION:
       Equipment: preheater + column + condenser + reboiler
       Column: 20-40 stages, feed stage 15-20, reflux 2-4, NRTL package

    6. STEAM METHANE REFORMING:
       Equipment: preheater + reformer (gibbsReactor) + waste heat boiler + shift reactor
       Reformer: 800-900°C, 2000-3000 kPa, S/C ratio 2.5-3.5
       Components MUST include: methane, water, hydrogen, carbon monoxide, carbon dioxide

    ⚙️ ENGINEERING RULES (MANDATORY):

    PRESSURE CONSISTENCY (CRITICAL — follow these rules exactly):
    - Pressure MUST decrease through the flowsheet from feed to product, except at pumps/compressors
    - Every heat exchanger MUST have "pressure_drop_kpa" parameter (10-50 kPa shell side, 20-70 kPa tube side; use 20 kPa as default)
    - Valve outlet P MUST be < inlet P always; set "outlet_pressure_kpa" or "pressure_drop_kpa"
    - If a downstream unit needs HIGHER pressure than the upstream unit provides, you MUST insert a pump (for liquid) or compressor (for vapor) between them
    - Typical equipment pressure drops: HX 20-50 kPa, valve 50-200 kPa, filter/strainer 10-30 kPa, fired heater 20-50 kPa
    - Column tray ΔP: 0.3-1.0 kPa per tray
    - Outlet stream pressures must match the operating pressure of the equipment producing them
    - After separators/columns, use pump with "pressure_rise_kpa" to boost liquid product pressure if needed downstream
    - Never have pressure increase through passive equipment (HX, separator, filter, mixer, splitter) — this is physically impossible

    PHASE APPROPRIATENESS:
    - Pumps: LIQUID only — add separator upstream if two-phase possible
    - Compressors: VAPOR only — add knockout drum upstream if liquid possible

    TEMPERATURE LIMITS:
    - Carbon steel max: ~425°C
    - Compressor discharge: max ~300°C per stage; add intercooling if higher
    - Cooling water return: max 40-45°C
    - Min approach temperature: 10°C shell-tube HX, 5°C plate HX

    MASS/ENERGY CONSISTENCY:
    - Splitter fractions MUST sum to 1.0
    - Mixer outlet P ≤ min(inlet pressures)
    - Reaction products MUST be real chemical species in thermo.components

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
    22. At least one feed-source label node exists (type "label") as the origin of the process
    23. At least one edge has complete feed data (temperature, pressure, flow_rate, composition)
    24. Feed edge composition includes ALL thermo.components and sums to 1.0

    🔍 FINAL CONNECTIVITY VERIFICATION (DO THIS BEFORE RETURNING JSON):
    - List all node IDs from nodes[]
    - List all source and target IDs from edges[]
    - Every node ID must appear in the edge list (as source OR target)
    - If any node ID is missing from edges[], either add an edge for it or remove that node

    📋 EXAMPLE (three-phase separation with feed source, product sinks, and thermo):
    {
      "nodes": [
        {
          "id": "feed-source-1",
          "type": "label",
          "position": {"x": 0, "y": 300},
          "data": {"label": "Well Fluid Feed"}
        },
        {
          "id": "sep-1",
          "type": "separator3p",
          "position": {"x": 250, "y": 300},
          "data": {
            "label": "Three-Phase Separator",
            "equipment": "separator3p",
            "parameters": {"temperature_c": 60, "pressure_kpa": 4500},
            "ports": {
              "inlets": ["feed-left"],
              "outlets": ["gas-top", "oil-right", "water-bottom"]
            }
          }
        },
        {
          "id": "pump-gas-1",
          "type": "compressor",
          "position": {"x": 550, "y": 100},
          "data": {
            "label": "Gas Compressor",
            "equipment": "compressor",
            "parameters": {"outlet_pressure_kpa": 7000},
            "ports": {
              "inlets": ["suction-left"],
              "outlets": ["discharge-right"]
            }
          }
        },
        {
          "id": "pump-oil-1",
          "type": "pump",
          "position": {"x": 550, "y": 400},
          "data": {
            "label": "Oil Pump",
            "equipment": "pump",
            "parameters": {"outlet_pressure_kpa": 1500},
            "ports": {
              "inlets": ["suction-left"],
              "outlets": ["discharge-right"]
            }
          }
        },
        {
          "id": "pump-water-1",
          "type": "pump",
          "position": {"x": 550, "y": 700},
          "data": {
            "label": "Water Pump",
            "equipment": "pump",
            "parameters": {"outlet_pressure_kpa": 500},
            "ports": {
              "inlets": ["suction-left"],
              "outlets": ["discharge-right"]
            }
          }
        },
        {
          "id": "product-gas",
          "type": "label",
          "position": {"x": 850, "y": 100},
          "data": {"label": "Sales Gas"}
        },
        {
          "id": "product-oil",
          "type": "label",
          "position": {"x": 850, "y": 400},
          "data": {"label": "Crude Oil Product"}
        },
        {
          "id": "product-water",
          "type": "label",
          "position": {"x": 850, "y": 700},
          "data": {"label": "Produced Water"}
        }
      ],
      "edges": [
        {
          "id": "feed-01",
          "source": "feed-source-1",
          "sourceHandle": "out-right",
          "target": "sep-1",
          "targetHandle": "feed-left",
          "type": "step",
          "label": "Well Fluid Feed",
          "data": {
            "temperature": 65,
            "pressure": 4500,
            "flow_rate": 150000,
            "composition": {"methane": 0.40, "ethane": 0.06, "propane": 0.04, "n-butane": 0.02, "n-hexane": 0.08, "water": 0.40}
          }
        },
        {
          "id": "gas-stream",
          "source": "sep-1",
          "sourceHandle": "gas-top",
          "target": "pump-gas-1",
          "targetHandle": "suction-left",
          "type": "step",
          "label": "Gas Stream",
          "data": {}
        },
        {
          "id": "oil-stream",
          "source": "sep-1",
          "sourceHandle": "oil-right",
          "target": "pump-oil-1",
          "targetHandle": "suction-left",
          "type": "step",
          "label": "Oil Stream",
          "data": {}
        },
        {
          "id": "water-stream",
          "source": "sep-1",
          "sourceHandle": "water-bottom",
          "target": "pump-water-1",
          "targetHandle": "suction-left",
          "type": "step",
          "label": "Water Stream",
          "data": {}
        },
        {
          "id": "gas-product",
          "source": "pump-gas-1",
          "sourceHandle": "discharge-right",
          "target": "product-gas",
          "targetHandle": "in-left",
          "type": "step",
          "label": "Sales Gas",
          "data": {}
        },
        {
          "id": "oil-product",
          "source": "pump-oil-1",
          "sourceHandle": "discharge-right",
          "target": "product-oil",
          "targetHandle": "in-left",
          "type": "step",
          "label": "Crude Oil",
          "data": {}
        },
        {
          "id": "water-product",
          "source": "pump-water-1",
          "sourceHandle": "discharge-right",
          "target": "product-water",
          "targetHandle": "in-left",
          "type": "step",
          "label": "Produced Water",
          "data": {}
        }
      ],
      "thermo": {
        "package": "Peng-Robinson",
        "components": ["methane", "ethane", "propane", "n-butane", "n-hexane", "water"]
      },
      "dwsimInstructions": "1. Create Peng-Robinson property package with methane, ethane, propane, n-butane, n-hexane, water. 2. Add three-phase separator at 60°C, 4500 kPa. 3. Connect gas to compressor (7000 kPa outlet). 4. Connect oil to pump (1500 kPa). 5. Connect water to pump (500 kPa).",
      "description": "Three-phase well fluid separation with gas compression and liquid pumping"
    }`;

// ---------------------------------------------------------------------------
// Port registry — valid inlet/outlet handles per equipment type
// Must stay in sync with the AI system prompt port definitions (lines 282-319)
// ---------------------------------------------------------------------------

const PORT_REGISTRY: Record<string, { inlets: string[]; outlets: string[] }> = {
  // Distillation columns & towers
  distillationColumn: { inlets: ['reflux-top', 'feed-stage-6', 'feed-stage-8', 'feed-stage-10', 'feed-stage-12', 'feed-stage-18', 'feed-left', 'in-left'], outlets: ['overhead-top', 'bottoms-bottom'] },
  packedColumn:       { inlets: ['reflux-top', 'feed-stage-6', 'feed-stage-8', 'feed-stage-10', 'feed-stage-12', 'feed-stage-18', 'feed-left', 'in-left'], outlets: ['overhead-top', 'bottoms-bottom'] },
  absorber:           { inlets: ['reflux-top', 'feed-stage-6', 'feed-stage-8', 'feed-stage-10', 'feed-stage-12', 'feed-stage-18', 'feed-left', 'in-left', 'in-1-left', 'in-2-right'], outlets: ['overhead-top', 'bottoms-bottom'] },
  stripper:           { inlets: ['feed-left', 'in-left'], outlets: ['overhead-top', 'bottoms-bottom'] },
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
  turbine:            { inlets: ['in-left'], outlets: ['out-right'] },
  steamTurbine:       { inlets: ['in-left'], outlets: ['out-right'] },
  recipPump:          { inlets: ['in-left'], outlets: ['out-right'] },
  recipCompressor:    { inlets: ['in-left'], outlets: ['out-right'] },
  // Heat exchangers
  shellTubeHX:        { inlets: ['hot-in-left', 'cold-in-bottom'], outlets: ['hot-out-right', 'cold-out-top'] },
  plateHX:            { inlets: ['hot-in-left', 'cold-in-bottom'], outlets: ['hot-out-right', 'cold-out-top'] },
  doublePipeHX:       { inlets: ['hot-in-left', 'cold-in-bottom'], outlets: ['hot-out-right', 'cold-out-top'] },
  heaterCooler:       { inlets: ['hot-in-left', 'cold-in-bottom'], outlets: ['hot-out-right', 'cold-out-top'] },
  condenser:          { inlets: ['hot-in-left', 'cold-in-bottom'], outlets: ['hot-out-right', 'cold-out-top'] },
  airCooler:          { inlets: ['hot-in-left', 'cold-in-bottom'], outlets: ['hot-out-right', 'cold-out-top'] },
  firedHeater:        { inlets: ['in-left'], outlets: ['out-right'] },
  kettleReboiler:     { inlets: ['hot-in-left', 'cold-in-bottom'], outlets: ['hot-out-right', 'cold-out-top'] },
  boiler:             { inlets: ['in-left'], outlets: ['out-right'] },
  // Valves
  valve:              { inlets: ['in-left'], outlets: ['out-right'] },
  controlValve:       { inlets: ['in-left'], outlets: ['out-right'] },
  checkValve:         { inlets: ['in-left'], outlets: ['out-right'] },
  throttleValve:      { inlets: ['in-left'], outlets: ['out-right'] },
  prv:                { inlets: ['in-left'], outlets: ['out-right'] },
  // Tanks
  tank:               { inlets: ['in-top'], outlets: ['out-bottom'] },
  // Mixer / Splitter
  mixer:              { inlets: ['in-1-left', 'in-2-left', 'in-3-left'], outlets: ['out-right'] },
  splitter:           { inlets: ['in-left'], outlets: ['out-1-right', 'out-2-right', 'out-3-right'] },
  tee:                { inlets: ['in-left'], outlets: ['out-1-right', 'out-2-right', 'out-3-right'] },
  // Reactors
  cstr:               { inlets: ['in-left'], outlets: ['out-right'] },
  pfr:                { inlets: ['in-left'], outlets: ['out-right'] },
  conversionReactor:  { inlets: ['in-left'], outlets: ['out-right'] },
  gibbsReactor:       { inlets: ['in-left'], outlets: ['out-right'] },
  kineticReactor:     { inlets: ['in-left'], outlets: ['out-right'] },
  batchReactor:       { inlets: ['in-left'], outlets: ['out-right'] },
  equilibriumReactor: { inlets: ['in-left'], outlets: ['out-right'] },
  // Separation equipment
  filter:             { inlets: ['in-left'], outlets: ['out-right'] },
  cyclone:            { inlets: ['feed-left'], outlets: ['vapor-top', 'liquid-bottom'] },
  pipeSegment:        { inlets: ['in-left'], outlets: ['out-right'] },
  pipeline:           { inlets: ['in-left'], outlets: ['out-right'] },
  pipe:               { inlets: ['in-left'], outlets: ['out-right'] },
  adsorber:           { inlets: ['in-left'], outlets: ['out-right'] },
  membrane:           { inlets: ['in-left'], outlets: ['out-right'] },
  horizontalVessel:   { inlets: ['in-left'], outlets: ['out-right'] },
  // Common AI alias types
  reactor:            { inlets: ['in-left', 'feed-left'], outlets: ['out-right'] },
  cooler:             { inlets: ['hot-in-left', 'cold-in-bottom'], outlets: ['hot-out-right', 'cold-out-top'] },
  heater:             { inlets: ['hot-in-left', 'cold-in-bottom'], outlets: ['hot-out-right', 'cold-out-top'] },
  reboiler:           { inlets: ['hot-in-left', 'cold-in-bottom'], outlets: ['hot-out-right', 'cold-out-top'] },
  furnace:            { inlets: ['in-left'], outlets: ['out-right'] },
  expander:           { inlets: ['in-left'], outlets: ['out-right'] },
  fan:                { inlets: ['suction-left'], outlets: ['discharge-right'] },
  blower:             { inlets: ['suction-left'], outlets: ['discharge-right'] },
  scrubber:           { inlets: ['reflux-top', 'feed-stage-6', 'feed-stage-8', 'feed-stage-10', 'feed-stage-12', 'feed-stage-18', 'feed-left', 'in-left'], outlets: ['overhead-top', 'bottoms-bottom'] },
  rigorousDistillationColumn: { inlets: ['reflux-top', 'feed-stage-6', 'feed-stage-8', 'feed-stage-10', 'feed-stage-12', 'feed-stage-18', 'feed-left', 'in-left'], outlets: ['overhead-top', 'bottoms-bottom'] },
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
  tee:                { count: 2, handles: ['out-1-right', 'out-2-right'],       labels: ['Split 1', 'Split 2'] },
  rigorousDistillationColumn: { count: 2, handles: ['overhead-top', 'bottoms-bottom'], labels: ['Overhead', 'Bottoms'] },
  refluxDrum:         { count: 2, handles: ['vapor-top', 'liquid-bottom'],       labels: ['Vapor Product', 'Liquid Product'] },
  cyclone:            { count: 2, handles: ['vapor-top', 'liquid-bottom'],       labels: ['Gas Product', 'Solids Product'] },
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

  for (const node of nodes) {
    const spec = MIN_OUTLETS[node.type];
    if (!spec) continue;

    const currentOutlets = outletEdgesPerNode.get(node.id) ?? 0;
    if (currentOutlets >= spec.count) continue;

    const used = usedSourceHandles.get(node.id) ?? new Set();
    let addedCount = 0;

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
    // Shell & tube / plate / double-pipe HX
    hot_outlet_temp: 'hot_outlet_temperature_c',
    hot_outlet_temperature: 'hot_outlet_temperature_c',
    hot_out_temp: 'hot_outlet_temperature_c',
    cold_outlet_temp: 'cold_outlet_temperature_c',
    cold_outlet_temperature: 'cold_outlet_temperature_c',
    cold_out_temp: 'cold_outlet_temperature_c',
    hot_dp: 'hot_pressure_drop_kpa',
    cold_dp: 'cold_pressure_drop_kpa',
    // Rigorous distillation
    feed_stage: 'feed_tray',
    feed_tray_number: 'feed_tray',
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
 * Remove reactions that reference compounds not in the thermo component list.
 *
 * AI sometimes invents product names like "desulfurized-naphtha" or "treated-gas"
 * that don't exist. The reactor can't resolve them → mass destruction.
 * This strips those reactions before they reach the backend.
 */
/**
 * Auto-add missing reaction products/reactants to thermo components.
 *
 * When the AI generates a conversion reactor whose products include compounds
 * not in thermo.components (e.g. hydrogen produced in a dehydrogenation),
 * validateReactionCompounds would strip the entire reaction, making the reactor
 * a pass-through.  This function scans all reactor nodes and adds any missing
 * reaction species to the component list BEFORE validation runs.
 */
function autoAddReactionProducts(
  nodes: FlowNode[],
  thermoComponents: string[],
): string[] {
  const REACTOR_TYPES = new Set([
    'conversionReactor', 'cstr', 'pfr', 'equilibriumReactor', 'gibbsReactor', 'kineticReactor',
  ]);
  const normalizedExisting = new Set(
    thermoComponents.map(c => c.toLowerCase().replace(/[_-]/g, ' ').trim()),
  );
  const toAdd: string[] = [];

  for (const node of nodes) {
    if (!REACTOR_TYPES.has(node.type)) continue;
    const reactions = node.data?.parameters?.reactions as any[] | undefined;
    if (!reactions) continue;
    for (const rxn of reactions) {
      const allComps = [
        ...Object.keys(rxn.reactants || {}),
        ...Object.keys(rxn.products || {}),
      ];
      for (const comp of allComps) {
        const norm = comp.toLowerCase().replace(/[_-]/g, ' ').trim();
        if (!normalizedExisting.has(norm)) {
          // Add the space-normalized name
          const cleanName = comp.replace(/_/g, ' ').trim();
          thermoComponents.push(cleanName);
          normalizedExisting.add(norm);
          toAdd.push(cleanName);
          console.log(`[auto-add-rxn] Added missing reaction component: "${cleanName}"`);
        }
      }
    }
  }
  return thermoComponents;
}

function validateReactionCompounds(nodes: FlowNode[], thermoComponents: string[]): FlowNode[] {
  if (!thermoComponents || thermoComponents.length === 0) return nodes;

  const normalizedComps = new Set(
    thermoComponents.map(c => c.toLowerCase().replace(/[_-]/g, ' ').trim())
  );

  return nodes.map(node => {
    const params = node.data?.parameters;
    if (!params?.reactions) return node;

    const reactions = params.reactions as any[];
    const validReactions = reactions.filter((rxn: any) => {
      const allComps = [
        ...Object.keys(rxn.reactants || {}),
        ...Object.keys(rxn.products || {}),
      ];
      for (const comp of allComps) {
        const norm = comp.toLowerCase().replace(/[_-]/g, ' ').trim();
        if (!normalizedComps.has(norm)) {
          console.warn(`[validate-rxn] Removing reaction: '${comp}' not in thermo components`);
          return false;
        }
      }
      return true;
    });

    if (validReactions.length < reactions.length) {
      return {
        ...node,
        data: {
          ...node.data,
          parameters: { ...params, reactions: validReactions },
        },
      };
    }
    return node;
  });
}

/**
 * Collapse external reflux loops around shortcut distillation columns.
 *
 * The Fenske-Underwood-Gilliland shortcut model handles reflux internally
 * (it computes R_actual and outputs net distillate D + bottoms B where D+B=F).
 * When the AI generates an explicit external reflux loop:
 *   column → condenser → drum → splitter → reflux back to column + product out
 * the distillate gets further split, causing ~35% mass balance error (double-
 * counting reflux).
 *
 * This function detects the pattern and removes the redundant condenser, drum,
 * and splitter, rewiring the column's distillate directly to the product stream.
 */
function collapseShortcutColumnRefluxLoops(
  nodes: FlowNode[],
  edges: FlowEdge[],
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const SHORTCUT_COLUMN_TYPES = new Set(['distillationColumn', 'packedColumn', 'rigorousDistillationColumn']);
  const CONDENSER_TYPES = new Set(['condenser', 'heaterCooler', 'airCooler', 'shellTubeHX']);
  const DRUM_TYPES = new Set(['flashDrum', 'separator', 'refluxDrum', 'surgeDrum', 'knockoutDrumH']);
  const SPLITTER_TYPES = new Set(['splitter', 'tee']);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Build adjacency: source → [{target, edge}]
  const outgoing = new Map<string, { target: string; edge: FlowEdge; handle?: string }[]>();
  const incoming = new Map<string, { source: string; edge: FlowEdge; handle?: string }[]>();
  for (const edge of edges) {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source)!.push({ target: edge.target, edge, handle: edge.sourceHandle });
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target)!.push({ source: edge.source, edge, handle: edge.targetHandle });
  }

  const nodesToRemove = new Set<string>();
  const edgesToRemove = new Set<string>();
  const edgesToAdd: FlowEdge[] = [];

  for (const colNode of nodes) {
    if (!SHORTCUT_COLUMN_TYPES.has(colNode.type)) continue;

    // Try ALL output edges from the column — the AI may omit sourceHandle,
    // so we can't rely on handle names alone to identify the overhead edge.
    const colOutEdges = outgoing.get(colNode.id) ?? [];

    // Prefer edges whose handle looks like overhead, but try all edges
    const sortedEdges = [...colOutEdges].sort((a, b) => {
      const aH = (a.handle ?? '').toLowerCase();
      const bH = (b.handle ?? '').toLowerCase();
      const aOverhead = aH.includes('overhead') || aH.includes('vapor') || aH.includes('distillate') || aH.includes('top') ? 0 : 1;
      const bOverhead = bH.includes('overhead') || bH.includes('vapor') || bH.includes('distillate') || bH.includes('top') ? 0 : 1;
      return aOverhead - bOverhead;
    });

    let overheadEdge: typeof colOutEdges[0] | undefined;
    let condenserNode: FlowNode | undefined;

    // Find first output edge that leads to a CONDENSER_TYPE node
    for (const candidate of sortedEdges) {
      const target = nodeMap.get(candidate.target);
      if (target && CONDENSER_TYPES.has(target.type)) {
        overheadEdge = candidate;
        condenserNode = target;
        break;
      }
    }
    if (!overheadEdge || !condenserNode) continue;

    // Step 2: Condenser → next unit (should be drum)
    const condenserOuts = outgoing.get(condenserNode.id) ?? [];
    if (condenserOuts.length === 0) continue;

    // The condenser might go directly to splitter (no drum) or to drum first
    let drumNode: FlowNode | undefined;
    let splitterNode: FlowNode | undefined;
    let drumOutEdge: { target: string; edge: FlowEdge; handle?: string } | undefined;
    let condenserToDrumEdge: { target: string; edge: FlowEdge; handle?: string } | undefined;
    let condenserToSplitterEdge: { target: string; edge: FlowEdge; handle?: string } | undefined;
    let drumToSplitterEdge: { target: string; edge: FlowEdge; handle?: string } | undefined;

    // Check if condenser goes to drum or directly to splitter
    for (const cOut of condenserOuts) {
      const nextNode = nodeMap.get(cOut.target);
      if (!nextNode) continue;
      if (DRUM_TYPES.has(nextNode.type)) {
        drumNode = nextNode;
        condenserToDrumEdge = cOut;
      } else if (SPLITTER_TYPES.has(nextNode.type)) {
        splitterNode = nextNode;
        condenserToSplitterEdge = cOut;
      }
    }

    // Step 3: If we have a drum, find drum → splitter
    if (drumNode) {
      const drumOuts = outgoing.get(drumNode.id) ?? [];
      // Find liquid outlet from drum going to splitter
      for (const dOut of drumOuts) {
        const nextNode = nodeMap.get(dOut.target);
        if (nextNode && SPLITTER_TYPES.has(nextNode.type)) {
          splitterNode = nextNode;
          drumToSplitterEdge = dOut;
          break;
        }
      }
    }

    // Handle case: condenser feeds directly back to column (no splitter, no drum)
    // Pattern: column → condenser → column (simple reflux without splitter)
    if (!splitterNode) {
      // Check if any condenser output goes directly back to the column
      let directRefluxEdge: typeof condenserOuts[0] | undefined;
      const directProductEdges: typeof condenserOuts = [];
      for (const cOut of condenserOuts) {
        if (cOut.target === colNode.id) {
          directRefluxEdge = cOut;
        } else {
          directProductEdges.push(cOut);
        }
      }
      if (directRefluxEdge) {
        console.log(
          `[reflux-collapse] Detected direct condenser reflux on shortcut column '${colNode.id}': ` +
          `${condenserNode!.id} → column (no splitter). Collapsing.`
        );
        // Remove condenser and reflux edge
        nodesToRemove.add(condenserNode!.id);
        edgesToRemove.add(overheadEdge.edge.id);       // column → condenser
        edgesToRemove.add(directRefluxEdge.edge.id);   // condenser → column (reflux)
        for (const cOut of condenserOuts) {
          edgesToRemove.add(cOut.edge.id);
        }
        // Rewire product edges from condenser to column overhead
        for (const prodEdge of directProductEdges) {
          edgesToAdd.push({
            id: `collapsed-distillate-${colNode.id}-${prodEdge.target}`,
            source: colNode.id,
            target: prodEdge.target,
            sourceHandle: overheadEdge.handle ?? 'overhead-top',
            targetHandle: prodEdge.edge.targetHandle,
            label: prodEdge.edge.label,
            data: prodEdge.edge.data,
          });
        }
      }
      continue;
    }

    // Step 4: Check if splitter has an output going back to the column (reflux)
    const splitterOuts = outgoing.get(splitterNode.id) ?? [];
    let refluxEdge: { target: string; edge: FlowEdge; handle?: string } | undefined;
    const productEdges: { target: string; edge: FlowEdge; handle?: string }[] = [];

    for (const sOut of splitterOuts) {
      if (sOut.target === colNode.id) {
        refluxEdge = sOut;
      } else {
        productEdges.push(sOut);
      }
    }

    // Pattern not matched: no reflux return to column
    if (!refluxEdge) continue;

    console.log(
      `[reflux-collapse] Detected external reflux loop on shortcut column '${colNode.id}': ` +
      `${condenserNode.id} → ${drumNode?.id ?? '(no drum)'} → ${splitterNode.id} → reflux back. Collapsing.`
    );

    // Mark intermediate nodes for removal
    nodesToRemove.add(condenserNode.id);
    if (drumNode) nodesToRemove.add(drumNode.id);
    nodesToRemove.add(splitterNode.id);

    // Mark all edges involving these nodes for removal
    edgesToRemove.add(overheadEdge.edge.id);                           // column → condenser
    if (condenserToDrumEdge) edgesToRemove.add(condenserToDrumEdge.edge.id);   // condenser → drum
    if (drumToSplitterEdge) edgesToRemove.add(drumToSplitterEdge.edge.id);     // drum → splitter
    if (condenserToSplitterEdge) edgesToRemove.add(condenserToSplitterEdge.edge.id); // condenser → splitter (no drum)
    edgesToRemove.add(refluxEdge.edge.id);                             // splitter → column (reflux)

    // Also remove any other edges involving the drum (e.g. drum vapor outlet)
    if (drumNode) {
      for (const dOut of (outgoing.get(drumNode.id) ?? [])) {
        edgesToRemove.add(dOut.edge.id);
      }
      for (const dIn of (incoming.get(drumNode.id) ?? [])) {
        edgesToRemove.add(dIn.edge.id);
      }
    }

    // Remove all edges into/out of condenser and splitter
    for (const cOut of condenserOuts) {
      edgesToRemove.add(cOut.edge.id);
    }
    for (const sOut of splitterOuts) {
      edgesToRemove.add(sOut.edge.id);
    }

    // Rewire: column overhead → product destinations (where splitter was sending product)
    for (const prodEdge of productEdges) {
      edgesToAdd.push({
        id: `collapsed-distillate-${colNode.id}-${prodEdge.target}`,
        source: colNode.id,
        target: prodEdge.target,
        sourceHandle: overheadEdge.handle ?? 'overhead-top',
        targetHandle: prodEdge.edge.targetHandle,
        label: prodEdge.edge.label,
        data: prodEdge.edge.data,
      });
    }

    // If no product destinations existed (everything went to reflux), create a
    // product label node so the distillate has somewhere to go
    if (productEdges.length === 0) {
      const labelId = `distillate-product-${colNode.id}`;
      nodes.push({
        id: labelId,
        type: 'label',
        position: {
          x: (colNode.position?.x ?? 300) + 300,
          y: (colNode.position?.y ?? 300) - 100,
        },
        data: { label: 'Distillate Product' },
      });
      edgesToAdd.push({
        id: `collapsed-distillate-${colNode.id}-product`,
        source: colNode.id,
        target: labelId,
        sourceHandle: overheadEdge.handle ?? 'overhead-top',
        targetHandle: 'in-left',
      });
    }
  }

  if (nodesToRemove.size === 0) {
    return { nodes, edges };
  }

  const filteredNodes = nodes.filter(n => !nodesToRemove.has(n.id));
  const filteredEdges = edges
    .filter(e => !edgesToRemove.has(e.id))
    // Also remove any edges referencing removed nodes
    .filter(e => !nodesToRemove.has(e.source) && !nodesToRemove.has(e.target))
    .concat(edgesToAdd);

  console.log(
    `[reflux-collapse] Removed ${nodesToRemove.size} nodes and ${edgesToRemove.size} edges, ` +
    `added ${edgesToAdd.length} rewired edges`
  );

  return { nodes: filteredNodes, edges: filteredEdges };
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
    'pump', 'recipPump', 'compressor', 'recipCompressor', 'turbine', 'steamTurbine',
    'valve', 'controlValve', 'checkValve', 'prv', 'throttleValve',
    'flashDrum', 'separator', 'separator3p', 'knockoutDrumH', 'surgeDrum', 'refluxDrum',
    'distillationColumn', 'packedColumn', 'absorber', 'stripper', 'rigorousDistillationColumn',
    'shellTubeHX', 'airCooler', 'plateHX', 'doublePipeHX', 'condenser', 'kettleReboiler', 'boiler',
    'splitter', 'tee', 'membrane', 'filter', 'cyclone', 'adsorber',
    'gibbsReactor', 'kineticReactor', 'equilibriumReactor', 'batchReactor',
    'tank', 'horizontalVessel', 'pipeSegment',
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

  // Second pass: backfill feed data on edges entering root units (units whose only
  // incoming edges come from label nodes) when the edge data is empty/incomplete
  const equipmentNodeIds = new Set(
    nodes.filter(n => n.type !== 'label' && n.type !== 'annotation').map(n => n.id)
  );
  const hasIncomingFromEquipment = new Set<string>();
  for (const edge of newEdges) {
    if (equipmentNodeIds.has(edge.source) && equipmentNodeIds.has(edge.target)) {
      hasIncomingFromEquipment.add(edge.target);
    }
  }

  const compsForBackfill = thermo?.components ?? [];
  if (compsForBackfill.length > 0) {
    for (const edge of newEdges) {
      // Only process edges entering root equipment from label nodes
      if (!equipmentNodeIds.has(edge.target)) continue;
      if (hasIncomingFromEquipment.has(edge.target)) continue;
      const sourceNode = nodeMap.get(edge.source);
      if (!sourceNode || sourceNode.type !== 'label') continue;

      // Check if this edge is missing feed data
      const hasCompleteData = edge.data?.temperature != null
        && edge.data?.pressure != null
        && edge.data?.composition != null;
      if (hasCompleteData) continue;

      // Backfill missing fields
      if (!edge.data) edge.data = {};
      if (edge.data.temperature == null) edge.data.temperature = 25;
      if (edge.data.pressure == null) edge.data.pressure = 101.325;
      if (edge.data.flow_rate == null) edge.data.flow_rate = 10000;
      if (edge.data.composition == null) {
        const composition: Record<string, number> = {};
        compsForBackfill.forEach((c: string) => composition[c] = 1.0 / compsForBackfill.length);
        edge.data.composition = composition;
      }
      console.log(`[ensureInlets] Backfilled feed data on edge ${edge.id} → ${edge.target}`);
    }
  }

  return newEdges;
}

/**
 * Ensure at least one edge in the flowsheet has complete feed data (T, P, composition).
 *
 * If no edge carries feed data, find topological root equipment (no incoming edges
 * from other equipment) and create synthetic feed-source label nodes with default
 * conditions derived from the thermo config.
 */
function ensureFeedDataExists(
  nodes: FlowNode[],
  edges: FlowEdge[],
  thermo?: { package: string; components: string[] },
): void {
  // Check if ANY edge already has complete feed data
  const hasFeedData = edges.some(e =>
    e.data?.temperature != null && e.data?.pressure != null && e.data?.composition != null
  );
  if (hasFeedData) return;

  console.log('[ensureFeedData] No edges have complete feed data — creating synthetic feeds');

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const equipmentNodeIds = new Set(
    nodes.filter(n => n.type !== 'label' && n.type !== 'annotation').map(n => n.id)
  );

  // Find equipment nodes with no incoming edges from other equipment
  const hasIncomingFromEquipment = new Set<string>();
  for (const edge of edges) {
    if (equipmentNodeIds.has(edge.source) && equipmentNodeIds.has(edge.target)) {
      hasIncomingFromEquipment.add(edge.target);
    }
  }

  const rootEquipment = nodes.filter(n =>
    equipmentNodeIds.has(n.id) && !hasIncomingFromEquipment.has(n.id)
  );

  if (rootEquipment.length === 0) return;

  const comps = thermo?.components ?? [];
  if (comps.length === 0) return;

  const composition: Record<string, number> = {};
  comps.forEach((c: string) => composition[c] = 1.0 / comps.length);

  for (const root of rootEquipment) {
    // Check if this root already has an incoming edge from a label node
    const existingFeedEdge = edges.find(e =>
      e.target === root.id && nodeMap.has(e.source) && nodeMap.get(e.source)!.type === 'label'
    );

    if (existingFeedEdge) {
      // Backfill data on the existing feed edge
      if (!existingFeedEdge.data) existingFeedEdge.data = {};
      if (existingFeedEdge.data.temperature == null) existingFeedEdge.data.temperature = 25;
      if (existingFeedEdge.data.pressure == null) existingFeedEdge.data.pressure = 101.325;
      if (existingFeedEdge.data.flow_rate == null) existingFeedEdge.data.flow_rate = 10000;
      if (existingFeedEdge.data.composition == null) existingFeedEdge.data.composition = { ...composition };
      console.log(`[ensureFeedData] Backfilled feed data on existing edge to ${root.id}`);
    } else {
      // Create a new feed-source label node + edge
      const feedNodeId = `auto-feed-${root.id}`;
      nodes.push({
        id: feedNodeId, type: 'label',
        position: { x: (root.position?.x ?? 300) - 200, y: root.position?.y ?? 300 },
        data: { label: 'Feed' },
      });
      const registry = PORT_REGISTRY[root.type];
      const inletHandle = registry?.inlets?.[0] ?? 'in-left';
      edges.push({
        id: `auto-feed-edge-${root.id}`,
        source: feedNodeId, target: root.id,
        sourceHandle: 'out-right', targetHandle: inletHandle,
        data: { temperature: 25, pressure: 101.325, flow_rate: 10000, composition: { ...composition } },
      });
      console.log(`[ensureFeedData] Created synthetic feed source for root unit ${root.id}`);
    }
  }
}

/**
 * Normalize feed edge compositions:
 * 1. Ensure all thermo.components appear in each composition (case-insensitive, add missing as 0.0)
 * 2. Normalize values to sum to 1.0
 * Called after ensureFeedDataExists() in the POST handler.
 */
function normalizeCompositions(
  edges: FlowEdge[],
  thermo?: { package: string; components: string[] },
): void {
  if (!thermo?.components?.length) return;

  for (const edge of edges) {
    if (!edge.data?.composition || typeof edge.data.composition !== 'object') continue;
    const comp = edge.data.composition as Record<string, number>;

    // Add missing thermo components (case-insensitive match)
    for (const c of thermo.components) {
      if (!(c in comp)) {
        const lowerMatch = Object.keys(comp).find(k => k.toLowerCase() === c.toLowerCase());
        if (!lowerMatch) {
          comp[c] = 0.0;
        }
      }
    }

    // Normalize to sum = 1.0
    const total = Object.values(comp).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
    if (total > 0 && Math.abs(total - 1.0) > 0.001) {
      for (const k of Object.keys(comp)) {
        comp[k] = (typeof comp[k] === 'number' ? comp[k] : 0) / total;
      }
      console.log(`[normalizeCompositions] Normalized composition on edge ${edge.id} (was sum=${total.toFixed(4)})`);
    }
  }
}

/**
 * Walk the flowsheet graph forward from feed nodes and verify that pressure
 * does not increase through passive (non-pressure-raising) equipment.
 *
 * Auto-corrects outlet pressures that exceed inlet pressure by applying a
 * default pressure drop. Also adds missing pressure_drop_kpa to HX-type nodes.
 * Call between propagatePressureEstimates() and validateAndFillDefaults().
 */
function validateAndFixPressureCascade(nodes: FlowNode[], edges: FlowEdge[]): void {
  const PRESSURE_RAISING = new Set([
    'pump', 'recipPump', 'compressor', 'recipCompressor', 'polytropicCompressor', 'turbine',
  ]);
  const HX_TYPES = new Set([
    'shellTubeHX', 'plateHX', 'doublePipeHX', 'heaterCooler', 'firedHeater',
    'boiler', 'condenser', 'airCooler', 'kettleReboiler',
  ]);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Build adjacency: source → outgoing edges
  const outEdges = new Map<string, FlowEdge[]>();
  const inEdges = new Map<string, FlowEdge[]>();
  for (const edge of edges) {
    if (!outEdges.has(edge.source)) outEdges.set(edge.source, []);
    outEdges.get(edge.source)!.push(edge);
    if (!inEdges.has(edge.target)) inEdges.set(edge.target, []);
    inEdges.get(edge.target)!.push(edge);
  }

  // Step 1: Ensure HX-type nodes have pressure_drop_kpa
  for (const node of nodes) {
    if (HX_TYPES.has(node.type)) {
      if (!node.data?.parameters) continue;
      if (node.data.parameters.pressure_drop_kpa == null) {
        node.data.parameters.pressure_drop_kpa = 20;
        console.log(`[pressure-cascade] Added default pressure_drop_kpa=20 to ${node.type} '${node.id}'`);
      }
    }
  }

  // Step 2: Walk forward from feed nodes (nodes with no incoming edges from
  // equipment, or with feed data on incoming edges)
  const inletPressure = new Map<string, number>();

  // Seed from edges that have pressure data
  for (const edge of edges) {
    const rawP = edge.data?.pressure ?? edge.data?.__estimatedPressure;
    if (rawP != null) {
      const existing = inletPressure.get(edge.target);
      if (existing == null) {
        inletPressure.set(edge.target, Number(rawP));
      }
    }
  }

  // BFS walk
  const visited = new Set<string>();
  const queue: string[] = [];

  // Start with all nodes that have known inlet pressure
  for (const nodeId of Array.from(inletPressure.keys())) {
    queue.push(nodeId);
  }

  let iterations = 0;
  const maxIterations = nodes.length * 3;

  while (queue.length > 0 && iterations < maxIterations) {
    iterations++;
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (!node) continue;

    const pIn = inletPressure.get(nodeId);
    if (pIn == null) continue;

    // Skip pressure-raising equipment — they intentionally increase pressure
    if (PRESSURE_RAISING.has(node.type)) {
      // Propagate outlet pressure downstream
      const outgoing = outEdges.get(nodeId) ?? [];
      for (const edge of outgoing) {
        const outP = edge.data?.pressure ?? edge.data?.__estimatedPressure;
        if (outP != null && !inletPressure.has(edge.target)) {
          inletPressure.set(edge.target, Number(outP));
          queue.push(edge.target);
        }
      }
      continue;
    }

    // For passive equipment, check that outlet pressure doesn't exceed inlet
    const params = node.data?.parameters ?? {};
    const outgoing = outEdges.get(nodeId) ?? [];

    for (const edge of outgoing) {
      const rawOutP = edge.data?.pressure ?? edge.data?.__estimatedPressure;
      if (rawOutP != null) {
        const outP = Number(rawOutP);
        // If outlet P > inlet P for passive equipment, fix it
        if (outP > pIn + 1) { // 1 kPa tolerance
          const dp = params.pressure_drop_kpa != null ? Number(params.pressure_drop_kpa) : 20;
          const correctedP = Math.max(pIn - dp, 10); // don't go below 10 kPa
          console.log(
            `[pressure-cascade] Correcting pressure rise through passive '${node.id}' (${node.type}): ` +
            `${outP.toFixed(1)} kPa → ${correctedP.toFixed(1)} kPa (inlet: ${pIn.toFixed(1)} kPa)`
          );
          if (edge.data) {
            if (edge.data.pressure != null) edge.data.pressure = correctedP;
            edge.data.__estimatedPressure = correctedP;
          }
          if (!inletPressure.has(edge.target)) {
            inletPressure.set(edge.target, correctedP);
            queue.push(edge.target);
          }
        } else {
          if (!inletPressure.has(edge.target)) {
            inletPressure.set(edge.target, outP);
            queue.push(edge.target);
          }
        }
      } else {
        // No pressure data on this edge — estimate from inlet minus drop
        const dp = params.pressure_drop_kpa != null ? Number(params.pressure_drop_kpa) : 0;
        const estimatedP = pIn - dp;
        if (!inletPressure.has(edge.target)) {
          inletPressure.set(edge.target, estimatedP);
          queue.push(edge.target);
        }
      }
    }
  }
}

/**
 * Propagate pressure estimates through the flowsheet graph.
 *
 * Feed edges have explicit pressure data, but internal edges (between equipment)
 * do not — the solver computes them. This function walks the graph and estimates
 * outlet pressures based on equipment type and parameters, storing them as
 * `edge.data.__estimatedPressure` so downstream validation can use them.
 */
function propagatePressureEstimates(nodes: FlowNode[], edges: FlowEdge[]): void {
  // Build adjacency: source → outgoing edges
  const outEdges = new Map<string, FlowEdge[]>();
  // Build adjacency: target → incoming edges
  const inEdges = new Map<string, FlowEdge[]>();
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  for (const edge of edges) {
    if (!outEdges.has(edge.source)) outEdges.set(edge.source, []);
    outEdges.get(edge.source)!.push(edge);
    if (!inEdges.has(edge.target)) inEdges.set(edge.target, []);
    inEdges.get(edge.target)!.push(edge);
  }

  // Known pressures at each node's outlet
  const outletPressure = new Map<string, number>();

  // Seed from feed edges that already have pressure data
  const queue: string[] = [];
  for (const edge of edges) {
    const rawP = edge.data?.pressure;
    if (rawP != null) {
      const target = edge.target;
      if (!outletPressure.has(target + '__inlet')) {
        outletPressure.set(target + '__inlet', Number(rawP));
        queue.push(target);
      }
    }
  }

  const visited = new Set<string>();
  let iterations = 0;
  const maxIterations = nodes.length * 2; // safety bound

  while (queue.length > 0 && iterations < maxIterations) {
    iterations++;
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;

    const inletP = outletPressure.get(nodeId + '__inlet');
    if (inletP == null) continue;
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (!node) continue;

    const t = node.type;
    const params = node.data?.parameters ?? {};
    let estimatedOutletP: number;

    // Estimate outlet pressure based on equipment type
    if (['separator', 'flashDrum', 'separator3p', 'knockoutDrumH', 'surgeDrum', 'tank'].includes(t)) {
      estimatedOutletP = params.pressure_kpa != null ? Number(params.pressure_kpa) : inletP;
    } else if (t === 'valve') {
      if (params.outlet_pressure_kpa != null) {
        estimatedOutletP = Number(params.outlet_pressure_kpa);
      } else if (params.pressure_drop_kpa != null) {
        estimatedOutletP = inletP - Number(params.pressure_drop_kpa);
      } else {
        estimatedOutletP = inletP * 0.7;
      }
    } else if (t === 'pump') {
      if (params.pressure_rise_kpa != null) {
        estimatedOutletP = inletP + Number(params.pressure_rise_kpa);
      } else if (params.outlet_pressure_kpa != null) {
        estimatedOutletP = Number(params.outlet_pressure_kpa);
      } else {
        estimatedOutletP = inletP * 1.5;
      }
    } else if (t === 'compressor') {
      if (params.outlet_pressure_kpa != null) {
        estimatedOutletP = Number(params.outlet_pressure_kpa);
      } else if (params.pressure_ratio != null) {
        estimatedOutletP = inletP * Number(params.pressure_ratio);
      } else {
        estimatedOutletP = inletP * 3.0;
      }
    } else if (t === 'turbine') {
      if (params.outlet_pressure_kpa != null) {
        estimatedOutletP = Number(params.outlet_pressure_kpa);
      } else if (params.pressure_ratio != null) {
        estimatedOutletP = inletP / Number(params.pressure_ratio);
      } else {
        estimatedOutletP = inletP / 3.0;
      }
    } else if (['heaterCooler', 'firedHeater', 'boiler', 'condenser', 'airCooler', 'kettleReboiler'].includes(t)) {
      const dp = params.pressure_drop_kpa != null ? Number(params.pressure_drop_kpa) : 0;
      estimatedOutletP = inletP - dp;
    } else if (['distillationColumn', 'packedColumn', 'rigorousDistillationColumn'].includes(t)) {
      // Columns have two outlets — condenser and reboiler pressure
      // Use condenser pressure as a rough estimate for all outlets
      estimatedOutletP = params.condenser_pressure_kpa != null ? Number(params.condenser_pressure_kpa) : inletP;
    } else if (['absorber', 'stripper'].includes(t)) {
      // Absorber/stripper: use specified pressure_kpa if available, else inlet P
      // This is critical for strippers which operate at much lower P than their upstream absorber
      estimatedOutletP = params.pressure_kpa != null ? Number(params.pressure_kpa) : inletP;
    } else {
      // mixer, splitter, reactor, etc. — approximate as same pressure
      estimatedOutletP = inletP;
    }

    if (estimatedOutletP <= 0) estimatedOutletP = inletP;

    // Store estimated pressure on outgoing edges
    const outgoing = outEdges.get(nodeId) ?? [];
    for (const edge of outgoing) {
      // Only set if the edge doesn't already have explicit pressure data
      if (edge.data?.pressure == null) {
        if (!edge.data) edge.data = {};
        edge.data.__estimatedPressure = estimatedOutletP;
      }

      // Queue the downstream node with this estimated pressure as its inlet
      const downstreamId = edge.target;
      if (!visited.has(downstreamId) && !outletPressure.has(downstreamId + '__inlet')) {
        const edgeP = edge.data?.pressure ?? edge.data?.__estimatedPressure;
        if (edgeP != null) {
          outletPressure.set(downstreamId + '__inlet', Number(edgeP));
          queue.push(downstreamId);
        }
      }
    }
  }
}

/** Fill process-aware default parameters so the solver doesn't fail on missing specs */
function validateAndFillDefaults(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  // Build a map: nodeId → feed pressure from the first incoming edge that has pressure data
  const feedPressureMap = new Map<string, number>();
  // Build a map: nodeId → feed temperature from the first incoming edge that has temperature data
  const feedTempMap = new Map<string, number>();
  for (const edge of edges) {
    const rawP = edge.data?.pressure ?? edge.data?.__estimatedPressure;
    if (rawP != null && !feedPressureMap.has(edge.target)) {
      feedPressureMap.set(edge.target, Number(rawP));
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
        // Context-aware pump default: 50% of feed P or at least 200 kPa rise
        params.pressure_rise_kpa = Math.max((feedP ?? 1000) * 0.5, 200);
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
        // Default to 30% of feed pressure drop (more realistic than 20%)
        params.pressure_drop_kpa = Math.max((feedP ?? 500) * 0.3, 50);
      }
    } else if (['distillationColumn', 'packedColumn'].includes(t)) {
      if (params.condenser_pressure_kpa == null) {
        params.condenser_pressure_kpa = feedP ?? 101.325;
      }
      if (params.reboiler_pressure_kpa == null) {
        params.reboiler_pressure_kpa = Number(params.condenser_pressure_kpa) * 1.1;
      }
    } else if (t === 'absorber') {
      // Absorber operates at gas feed pressure
      if (params.pressure_kpa == null) {
        params.pressure_kpa = feedP ?? 3000;
      }
    } else if (t === 'stripper') {
      // Stripper / regenerator — detect amine regen context and set low pressure
      const label = (node.data?.label ?? '').toLowerCase();
      const isAmineRegen = /regen|strip|desorb|amine/.test(label);
      if (params.pressure_kpa == null) {
        // If feed pressure is high (>500 kPa) and this looks like a regenerator, default to 200 kPa
        if (isAmineRegen && (feedP ?? 0) > 500) {
          params.pressure_kpa = 200;
        } else {
          params.pressure_kpa = feedP ?? 200;
        }
      }
      if (params.temperature_c == null && isAmineRegen) {
        params.temperature_c = 115;
      }
    } else if (t === 'splitter') {
      if (params.fractions == null) {
        const outCount = outletCountMap.get(node.id) ?? 2;
        params.fractions = Array(outCount).fill(1 / outCount);
      }
    }

    // Two-sided HX defaults — shellTubeHX / plateHX / doublePipeHX
    const TWO_SIDED_HX_TYPES = new Set(['shellTubeHX', 'plateHX', 'doublePipeHX']);
    if (TWO_SIDED_HX_TYPES.has(t)) {
      if (params.hot_outlet_temperature_c == null && params.cold_outlet_temperature_c == null && params.duty_kw == null) {
        // Gather temperatures from both incoming edges to this HX node
        const incomingTemps: number[] = [];
        for (const edge of edges) {
          if (edge.target === node.id && edge.data?.temperature != null) {
            incomingTemps.push(Number(edge.data.temperature));
          }
        }
        if (incomingTemps.length >= 2) {
          // Two feed temps: use 10°C approach on hot side
          const hotT = Math.max(...incomingTemps);
          const coldT = Math.min(...incomingTemps);
          params.hot_outlet_temperature_c = coldT + 10;
          console.log(`[defaults] Set ${node.id} (${t}) hot_outlet_temperature_c = ${params.hot_outlet_temperature_c} (approach from ${coldT}°C cold inlet)`);
        } else if (incomingTemps.length === 1) {
          const feedT = incomingTemps[0];
          const label = (node.data.label || node.id).toLowerCase();
          if (label.includes('preheat') || label.includes('warm')) {
            params.cold_outlet_temperature_c = feedT + 30;
            console.log(`[defaults] Set ${node.id} (${t}) cold_outlet_temperature_c = ${params.cold_outlet_temperature_c}`);
          } else {
            params.hot_outlet_temperature_c = feedT - 30;
            console.log(`[defaults] Set ${node.id} (${t}) hot_outlet_temperature_c = ${params.hot_outlet_temperature_c}`);
          }
        } else {
          // No feed temps available — use conservative default
          params.hot_outlet_temperature_c = 60;
          console.log(`[defaults] Set ${node.id} (${t}) hot_outlet_temperature_c = 60 (no feed temps available)`);
        }
      }
    }

    // Heater/cooler defaults — assign outlet_temperature_c when nothing is specified
    if (HEATER_COOLER_TYPES.has(t)) {
      if (params.outlet_temperature_c == null && params.duty_kw == null) {
        const label = (node.data.label || node.id).toLowerCase();
        const feedT = feedTempMap.get(node.id);
        if (label.includes('cooler') || label.includes('condenser') || t === 'condenser' || t === 'airCooler') {
          params.outlet_temperature_c = 35;  // Cooling water or ambient
        } else if (label.includes('waste heat') || label.includes('whb')) {
          params.outlet_temperature_c = 300;  // Waste heat boiler
        } else if (label.includes('sulfur') && label.includes('condenser')) {
          params.outlet_temperature_c = 150;  // Sulfur condenser
        } else if (label.includes('chiller') || label.includes('chill') || label.includes('refriger')) {
          params.outlet_temperature_c = feedT != null ? Math.min(feedT, -20) : -20;
        } else if (label.includes('heater') || label.includes('fired') || label.includes('boiler')
                   || t === 'firedHeater' || t === 'boiler' || t === 'kettleReboiler') {
          params.outlet_temperature_c = feedT != null ? feedT + 100 : 200;
        } else if (label.includes('preheat') || label.includes('warm') || label.includes('reheat')) {
          params.outlet_temperature_c = feedT != null ? feedT + 50 : 150;
        } else if (label.includes('intercool') || label.includes('aftercool')) {
          params.outlet_temperature_c = 40;
        } else {
          // Generic heaterCooler — default to cooling (more common in process plants)
          params.outlet_temperature_c = 35;
        }
        console.log(`[defaults] Set ${node.id} outlet_temperature_c = ${params.outlet_temperature_c}`);
      }
    }

    return { ...node, data: { ...node.data, parameters: params } };
  });
}

/**
 * Validate engineering feasibility of AI-generated flowsheet.
 *
 * Checks physical constraints, auto-corrects where safe, and collects warnings.
 * Called after validateAndFillDefaults() in the POST handler.
 */
function validateEngineeringFeasibility(
  nodes: FlowNode[],
  edges: FlowEdge[],
  thermo?: { package: string; components: string[] },
): string[] {
  const warnings: string[] = [];

  // Build pressure/temperature maps from feed edges (including propagated estimates)
  const feedPressureMap = new Map<string, number>();
  const feedTempMap = new Map<string, number>();
  for (const edge of edges) {
    const rawP = edge.data?.pressure ?? edge.data?.__estimatedPressure;
    if (rawP != null && !feedPressureMap.has(edge.target)) {
      feedPressureMap.set(edge.target, Number(rawP));
    }
    if (edge.data?.temperature != null && !feedTempMap.has(edge.target)) {
      feedTempMap.set(edge.target, Number(edge.data.temperature));
    }
  }

  // Build adjacency for downstream lookups
  const downstreamMap = new Map<string, string[]>();
  for (const edge of edges) {
    if (!downstreamMap.has(edge.source)) downstreamMap.set(edge.source, []);
    downstreamMap.get(edge.source)!.push(edge.target);
  }

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  for (const node of nodes) {
    if (!node.data?.parameters) continue;
    const params = node.data.parameters;
    const t = node.type;
    const feedP = feedPressureMap.get(node.id);
    const feedT = feedTempMap.get(node.id);

    // --- Valve: outlet P must be less than inlet P ---
    if (t === 'valve' && feedP != null) {
      const outP = params.outlet_pressure_kpa ?? (feedP - (params.pressure_drop_kpa ?? 0));
      if (outP >= feedP) {
        // Auto-correct: set to 70% of feed pressure
        params.outlet_pressure_kpa = feedP * 0.7;
        delete params.pressure_drop_kpa;
        warnings.push(`[${node.id}] Valve outlet P ≥ inlet P (physically impossible). Auto-corrected to ${params.outlet_pressure_kpa.toFixed(0)} kPa.`);
      }
    }

    // --- Pump: outlet P must be greater than inlet P ---
    if (t === 'pump' && feedP != null) {
      const outP = params.outlet_pressure_kpa ?? (feedP + (params.pressure_rise_kpa ?? 0));
      if (outP <= feedP) {
        // Auto-correct: set pressure rise to 50% of feed pressure
        params.pressure_rise_kpa = Math.max(feedP * 0.5, 200);
        delete params.outlet_pressure_kpa;
        warnings.push(`[${node.id}] Pump outlet P ≤ inlet P. Auto-corrected to +${params.pressure_rise_kpa.toFixed(0)} kPa rise.`);
      }
    }

    // --- Pump with outlet_pressure_kpa but unknown upstream — convert to safe rise ---
    if (t === 'pump' && feedP == null && params.outlet_pressure_kpa != null) {
      // We don't know inlet P, so absolute outlet P is risky — convert to rise
      params.pressure_rise_kpa = Math.max(Number(params.outlet_pressure_kpa) * 0.2, 200);
      delete params.outlet_pressure_kpa;
      warnings.push(`[${node.id}] Pump outlet_pressure_kpa converted to pressure_rise_kpa (upstream P unknown).`);
    }

    // --- Compressor: check ratio > 5 ---
    if (t === 'compressor' && feedP != null) {
      const ratio = params.pressure_ratio ?? ((params.outlet_pressure_kpa ?? (feedP * 3)) / feedP);
      if (ratio > 5) {
        warnings.push(`[${node.id}] Compressor ratio ${ratio.toFixed(1)} > 5. Consider multi-stage compression with intercooling.`);
      }
    }

    // --- Distillation: reboiler P must exceed condenser P ---
    if (['distillationColumn', 'packedColumn', 'absorber', 'stripper'].includes(t)) {
      const pCond = params.condenser_pressure_kpa;
      const pReb = params.reboiler_pressure_kpa;
      if (pCond != null && pReb != null && pReb < pCond) {
        params.reboiler_pressure_kpa = pCond * 1.1;
        warnings.push(`[${node.id}] Reboiler P < condenser P. Auto-corrected to ${params.reboiler_pressure_kpa.toFixed(0)} kPa.`);
      }
    }

    // --- Reactor: temperature > 1000°C ---
    if (['gibbsReactor', 'kineticReactor', 'cstr', 'pfr', 'conversionReactor', 'equilibriumReactor'].includes(t)) {
      const reactorT = params.temperature_c ?? params.outlet_temperature_c;
      if (reactorT != null && reactorT > 1000) {
        warnings.push(`[${node.id}] Reactor temperature ${reactorT}°C exceeds typical limits (>1000°C).`);
      }
    }

    // --- Heater/cooler: check for unreasonable temperature ---
    if (['heaterCooler', 'firedHeater', 'boiler', 'condenser', 'airCooler', 'kettleReboiler'].includes(t)) {
      const outT = params.outlet_temperature_c;
      if (outT != null && outT > 500) {
        warnings.push(`[${node.id}] Outlet temperature ${outT}°C > 500°C — verify material limits.`);
      }
    }

    // --- Two-sided HX: validate outlet temperatures are feasible ---
    if (['shellTubeHX', 'plateHX', 'doublePipeHX'].includes(t)) {
      // Gather both feed temperatures from incoming edges
      const hxFeedTemps: number[] = [];
      for (const edge of edges) {
        if (edge.target === node.id && edge.data?.temperature != null) {
          hxFeedTemps.push(Number(edge.data.temperature));
        }
      }
      if (hxFeedTemps.length >= 2) {
        const hotInT = Math.max(...hxFeedTemps);
        const coldInT = Math.min(...hxFeedTemps);
        // Validate hot_outlet_temperature_c is between cold_inlet and hot_inlet
        if (params.hot_outlet_temperature_c != null) {
          if (params.hot_outlet_temperature_c < coldInT) {
            params.hot_outlet_temperature_c = coldInT + 10;
            warnings.push(`[${node.id}] Hot outlet T < cold inlet T — auto-corrected to ${params.hot_outlet_temperature_c.toFixed(0)}°C (10°C approach).`);
          } else if (params.hot_outlet_temperature_c > hotInT) {
            params.hot_outlet_temperature_c = coldInT + 10;
            warnings.push(`[${node.id}] Hot outlet T > hot inlet T — auto-corrected to ${params.hot_outlet_temperature_c.toFixed(0)}°C.`);
          }
        }
        // Validate cold_outlet_temperature_c is between cold_inlet and hot_inlet
        if (params.cold_outlet_temperature_c != null) {
          if (params.cold_outlet_temperature_c > hotInT) {
            params.cold_outlet_temperature_c = hotInT - 10;
            warnings.push(`[${node.id}] Cold outlet T > hot inlet T — auto-corrected to ${params.cold_outlet_temperature_c.toFixed(0)}°C.`);
          } else if (params.cold_outlet_temperature_c < coldInT) {
            params.cold_outlet_temperature_c = hotInT - 10;
            warnings.push(`[${node.id}] Cold outlet T < cold inlet T — auto-corrected to ${params.cold_outlet_temperature_c.toFixed(0)}°C.`);
          }
        }
      }
      // Final guard: if no spec exists after all validation, emit warning
      if (params.hot_outlet_temperature_c == null && params.cold_outlet_temperature_c == null && params.duty_kw == null) {
        warnings.push(`[${node.id}] Two-sided HX has no outlet T or duty spec — backend will use 10 K approach default.`);
      }
    }

    // --- Absorber/Stripper: validate two feeds ---
    if (['absorber', 'stripper'].includes(t)) {
      const incomingEdgeCount = edges.filter(e => e.target === node.id).length;
      if (incomingEdgeCount < 2) {
        warnings.push(`[${node.id}] ${t} needs 2 feeds (gas + lean solvent), only has ${incomingEdgeCount} — will fall back to flash separation.`);
      }
      if (params.pressure_kpa == null) {
        params.pressure_kpa = feedP ?? 101.325;
        console.log(`[defaults] Set ${node.id} pressure_kpa = ${params.pressure_kpa}`);
      }
    }
  }

  // --- Property package check: polar system with PR ---
  if (thermo?.package === 'Peng-Robinson' && thermo?.components) {
    const POLAR_COMPS = new Set(['water', 'methanol', 'ethanol', 'acetic acid', 'ammonia', 'acetone', 'phenol']);
    const polarCount = thermo.components.filter(c => POLAR_COMPS.has(c.toLowerCase())).length;
    const hcCount = thermo.components.length - polarCount;
    if (polarCount >= 2 && polarCount > hcCount) {
      warnings.push(`Polar-dominated system (${polarCount} polar components) using Peng-Robinson. Consider NRTL or UNIQUAC for better accuracy.`);
    }
  }

  return warnings;
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

    // Extract text from OpenAI response — reasoning models may put content in different fields
    const extractText = (choice: any): string => {
      const msg = choice?.message;
      return msg?.content ?? msg?.reasoning_content ?? msg?.output_text ?? '';
    };

    const callOpenAI = async (attempt: number): Promise<string> => {
      console.log(`[flowsheet] OpenAI call attempt ${attempt}...`);
      const resp = await client.chat.completions.create({
        model: 'gpt-5-mini',
        max_completion_tokens: 16384,
        messages: [
          { role: 'system', content: FLOWSHEET_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
      });

      const choice = resp.choices?.[0];
      const finishReason = choice?.finish_reason;
      const text = extractText(choice);

      if (!text) {
        console.error(`[flowsheet] Empty response (attempt ${attempt}). finish_reason=${finishReason}, usage=${JSON.stringify((resp as any).usage)}`);
        console.error(`[flowsheet] Full choice:`, JSON.stringify(choice, null, 2));
      } else {
        console.log(`[flowsheet] Got ${text.length} chars (attempt ${attempt}), finish_reason=${finishReason}`);
      }
      return text;
    };

    // Try up to 3 times — reasoning models occasionally return empty content
    let responseText = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      responseText = await callOpenAI(attempt);
      if (responseText) break;
      if (attempt < 3) {
        console.log(`[flowsheet] Retrying in 2s...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!responseText) {
      throw new Error('No response from OpenAI after 3 attempts. The model may be overloaded — please try again.');
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
        body: JSON.stringify({ prompt: jsonRetryPrompt, retryCount: 1, components, propertyPackage })
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
      'extractor': 'separator3p',
      'decanter': 'separator3p',
      'settler': 'separator3p',
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
      'extraction': 'separator3p',
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
      'fractionation': 'distillationColumn',
      // Common AI-generated aliases (LNG, naphtha, Rankine, etc.)
      'jt_valve': 'valve',
      'joule_thomson_valve': 'valve',
      'expansion_valve': 'valve',
      'letdown_valve': 'valve',
      'pressure_relief_valve': 'valve',
      'turbo_expander': 'turbine',
      'turboexpander': 'turbine',
      'gas_gas_hx': 'shellTubeHX',
      'gas_gas_heat_exchanger': 'shellTubeHX',
      'flash_separator': 'flashDrum',
      'flash_vessel': 'flashDrum',
      'flash_tank': 'flashDrum',
      'vapor_liquid_separator': 'flashDrum',
      'condenser_drum': 'flashDrum',
      'feed_drum': 'flashDrum',
      'steam_drum': 'flashDrum',
      'deaerator': 'flashDrum',
      'bog_compressor': 'compressor',
      'boil_off_compressor': 'compressor',
      'refrigerant_compressor': 'compressor',
      'feed_compressor': 'compressor',
      'recycle_compressor': 'compressor',
      'fired_heater': 'firedHeater',
      'furnace': 'firedHeater',
      'feed_heater': 'heaterCooler',
      'trim_cooler': 'heaterCooler',
      'water_cooler': 'heaterCooler',
      'gas_cooler': 'heaterCooler',
      'product_cooler': 'heaterCooler',
      'steam_generator': 'boiler',
      'waste_heat_boiler': 'boiler',
    };

    // Set of all valid types recognized by the backend UNIT_OP_REGISTRY
    const VALID_BACKEND_TYPES = new Set([
      'mixer', 'splitter', 'valve', 'controlValve', 'checkValve', 'prv', 'throttleValve',
      'pump', 'recipPump', 'compressor', 'recipCompressor', 'polytropicCompressor',
      'turbine', 'steamTurbine', 'heaterCooler', 'firedHeater', 'boiler', 'condenser',
      'shellTubeHX', 'airCooler', 'plateHX', 'doublePipeHX', 'kettleReboiler',
      'flashDrum', 'separator', 'separatorHorizontal', 'separator3p',
      'knockoutDrumH', 'surgeDrum', 'refluxDrum', 'tank', 'horizontalVessel',
      'cstr', 'pfr', 'conversionReactor', 'equilibriumReactor', 'gibbsReactor',
      'kineticReactor', 'batchReactor', 'rigorousDistillationColumn',
      'distillationColumn', 'packedColumn', 'absorber', 'stripper',
      'filter', 'cyclone', 'adsorber', 'membrane', 'label',
    ]);

    // Apply node type mapping + fuzzy fallback for unrecognized types
    if (flowsheetData.nodes) {
      flowsheetData.nodes = flowsheetData.nodes.map(node => {
        let mappedType = nodeTypeMapping[node.type] || node.type;

        // Fuzzy fallback: if type still isn't recognized, match by keyword
        if (!VALID_BACKEND_TYPES.has(mappedType)) {
          const lower = mappedType.toLowerCase().replace(/[_-]/g, '');
          if (lower.includes('valve')) mappedType = 'valve';
          else if (lower.includes('compressor')) mappedType = 'compressor';
          else if (lower.includes('pump')) mappedType = 'pump';
          else if (lower.includes('turbine') || lower.includes('expander')) mappedType = 'turbine';
          else if (lower.includes('flash') || lower.includes('drum') || lower.includes('separator')) mappedType = 'flashDrum';
          else if (lower.includes('heater') || lower.includes('cooler') || lower.includes('furnace')) mappedType = 'heaterCooler';
          else if (lower.includes('hx') || lower.includes('exchanger')) mappedType = 'shellTubeHX';
          else if (lower.includes('column') || lower.includes('distill')) mappedType = 'distillationColumn';
          else if (lower.includes('reactor')) mappedType = 'cstr';
          else if (lower.includes('mixer') || lower.includes('mix')) mappedType = 'mixer';
          else if (lower.includes('splitter') || lower.includes('split') || lower.includes('tee')) mappedType = 'splitter';
          else if (lower.includes('boiler') || lower.includes('steam')) mappedType = 'boiler';
          else if (lower.includes('tank') || lower.includes('vessel')) mappedType = 'tank';

          if (mappedType !== node.type) {
            console.log(`[fuzzyType] Mapped unrecognized type '${node.type}' → '${mappedType}'`);
          }
        }

        return { ...node, type: mappedType };
      });
    }

    // Convert single-sided heat exchangers to heaterCooler
    if (flowsheetData.nodes && flowsheetData.edges) {
      const incomingCountForHX = new Map<string, number>();
      for (const edge of flowsheetData.edges) {
        incomingCountForHX.set(edge.target, (incomingCountForHX.get(edge.target) ?? 0) + 1);
      }
      const TWO_SIDED_HX_TYPES = new Set(['shellTubeHX', 'plateHX', 'doublePipeHX']);
      flowsheetData.nodes = flowsheetData.nodes.map((node: FlowNode) => {
        if (TWO_SIDED_HX_TYPES.has(node.type) && (incomingCountForHX.get(node.id) ?? 0) < 2) {
          console.log(`[type-fix] Converting single-sided ${node.type} '${node.id}' to heaterCooler`);
          const params = { ...(node.data?.parameters ?? {}) };
          if (params.hot_outlet_temperature_c != null && params.outlet_temperature_c == null) {
            params.outlet_temperature_c = params.hot_outlet_temperature_c;
          } else if (params.cold_outlet_temperature_c != null && params.outlet_temperature_c == null) {
            params.outlet_temperature_c = params.cold_outlet_temperature_c;
          }
          return { ...node, type: 'heaterCooler', data: { ...node.data, parameters: params } };
        }
        return node;
      });
    }

    // Collapse external reflux loops around shortcut distillation columns.
    // The FUG shortcut model handles reflux internally (via R_actual), so an
    // explicit external loop (column → condenser → drum → splitter → back to
    // column) double-counts reflux and breaks mass balance by ~35%.
    if (flowsheetData.nodes && flowsheetData.edges) {
      const result = collapseShortcutColumnRefluxLoops(flowsheetData.nodes, flowsheetData.edges);
      flowsheetData.nodes = result.nodes;
      flowsheetData.edges = result.edges;
    }

    // Normalize equipment parameter names (safety net for AI variations)
    if (flowsheetData.nodes) {
      flowsheetData.nodes = sanitizeParameters(flowsheetData.nodes);
      flowsheetData.nodes = normalizeEquipmentParameters(flowsheetData.nodes);
      flowsheetData.nodes = normalizeReactions(flowsheetData.nodes);
      // Auto-add missing reaction products to thermo.components BEFORE validation
      if (flowsheetData.thermo?.components) {
        flowsheetData.thermo.components = autoAddReactionProducts(flowsheetData.nodes, flowsheetData.thermo.components);
      }
      flowsheetData.nodes = validateReactionCompounds(flowsheetData.nodes, flowsheetData.thermo?.components ?? []);
      // Propagate pressure estimates through internal edges before validation
      propagatePressureEstimates(flowsheetData.nodes, flowsheetData.edges);
      validateAndFixPressureCascade(flowsheetData.nodes, flowsheetData.edges);
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

    // Safety net: ensure at least one edge carries complete feed data
    if (flowsheetData.nodes && flowsheetData.edges) {
      ensureFeedDataExists(flowsheetData.nodes, flowsheetData.edges, flowsheetData.thermo);
    }

    // Normalize feed compositions: add missing components, normalize to sum=1.0
    if (flowsheetData.edges) {
      normalizeCompositions(flowsheetData.edges, flowsheetData.thermo);
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

    // Normalize property package name — AI may generate HYSYS-style names
    if (flowsheetData.thermo?.package) {
      const PKG_ALIASES: Record<string, string> = {
        'soave-redlich-kwong': 'SRK',
        'soave redlich kwong': 'SRK',
        'pr': 'Peng-Robinson',
        'peng robinson': 'Peng-Robinson',
        'lee-kesler-plöcker': 'Peng-Robinson',
        'lee-kesler-plocker': 'Peng-Robinson',
        'lee-kesler': 'Peng-Robinson',
        'lkp': 'Peng-Robinson',
        'iapws-if97': 'Steam-Tables',
        'iapws': 'Steam-Tables',
        'steam tables': 'Steam-Tables',
        'steam-tables': 'Steam-Tables',
        'chao-seader': 'Peng-Robinson',
        'grayson-streed': 'SRK',
        'wilson': 'NRTL',
        'ideal': 'Peng-Robinson',
        'cpa': 'SRK',
        'pc-saft': 'Peng-Robinson',
        'pcsaft': 'Peng-Robinson',
        'bwr': 'Peng-Robinson',
        'benedict-webb-rubin': 'Peng-Robinson',
        'rksoave': 'SRK',
        'rk-soave': 'SRK',
        'kabadi-danner': 'SRK',
        'sour water': 'Peng-Robinson',
        'acid gas': 'SRK',
        'glycol': 'NRTL',
        'amine': 'NRTL',
      };
      const pkgLower = flowsheetData.thermo.package.toLowerCase().trim();
      if (PKG_ALIASES[pkgLower]) {
        console.log(`[thermo] Normalizing property package: "${flowsheetData.thermo.package}" → "${PKG_ALIASES[pkgLower]}"`);
        flowsheetData.thermo.package = PKG_ALIASES[pkgLower];
      }
    }

    // Auto-correct property package: NRTL/UNIFAC/UNIQUAC can't handle gas-dominated mixtures
    // with non-condensable components (H2, N2, O2, CO, CH4) — fall back to SRK
    // EXCEPTION: amine/glycol systems need NRTL for accurate liquid-phase activity coefficients
    if (flowsheetData.thermo?.package && ['NRTL', 'UNIFAC', 'UNIQUAC'].includes(flowsheetData.thermo.package)) {
      const NON_CONDENSABLES = new Set([
        'hydrogen', 'nitrogen', 'oxygen', 'carbon monoxide', 'methane',
        'ethane', 'argon', 'helium', 'carbon dioxide', 'ethylene',
      ]);
      const AMINE_GLYCOL = new Set([
        'monoethanolamine', 'diethanolamine', 'triethylene glycol',
        'ethylene glycol', 'diethylene glycol', 'methyldiethanolamine',
      ]);
      const comps = flowsheetData.thermo.components ?? [];
      const gasCount = comps.filter((c: string) => NON_CONDENSABLES.has(c.toLowerCase())).length;
      const hasAmineGlycol = comps.some((c: string) => AMINE_GLYCOL.has(c.toLowerCase()));
      if (comps.length > 0 && gasCount / comps.length > 0.5 && !hasAmineGlycol) {
        console.log(`[thermo] Auto-correcting ${flowsheetData.thermo.package} → SRK (${gasCount}/${comps.length} non-condensable components)`);
        flowsheetData.thermo.package = 'SRK';
      } else if (hasAmineGlycol) {
        console.log(`[thermo] Preserving ${flowsheetData.thermo.package} — amine/glycol system detected`);
      }
    }

    // Validate and fix feed stream thermodynamic data
    const thermoComponents = flowsheetData.thermo?.components ?? components;

    // Auto-inject light_key / heavy_key for distillation columns if missing
    // NOTE: absorber/stripper do NOT use light_key/heavy_key (they use Kremser equation)
    const COLUMN_TYPES_NEEDING_KEYS = new Set(['distillationColumn', 'packedColumn']);

    // Boiling points (°C) for common compounds — used to sort components for key selection
    const BOILING_POINTS: Record<string, number> = {
      'hydrogen': -253, 'helium': -269, 'nitrogen': -196, 'carbon monoxide': -191,
      'oxygen': -183, 'argon': -186, 'methane': -161, 'ethylene': -104, 'ethane': -89,
      'carbon dioxide': -78, 'hydrogen sulfide': -60, 'propylene': -47, 'propane': -42,
      'ammonia': -33, 'isobutane': -12, 'n-butane': -1, 'isopentane': 28, 'n-pentane': 36,
      'acetone': 56, 'methanol': 65, 'n-hexane': 69, 'ethanol': 78, 'benzene': 80,
      'cyclohexane': 81, 'water': 100, 'n-heptane': 98, 'toluene': 111, 'acetic acid': 118,
      'n-octane': 126, 'ethylbenzene': 136, 'styrene': 145, 'phenol': 182,
      'ethylene glycol': 197, 'diethylene glycol': 245, 'triethylene glycol': 285,
      'monoethanolamine': 170, 'diethanolamine': 269, 'n-decane': 174,
    };

    for (const node of flowsheetData.nodes) {
      if (COLUMN_TYPES_NEEDING_KEYS.has(node.type) && thermoComponents.length >= 2) {
        if (!node.data.parameters) node.data.parameters = {};
        if (!node.data.parameters.light_key && !node.data.parameters.heavy_key) {
          // Sort components by boiling point, then pick the middle split
          const sorted = [...thermoComponents].sort((a: string, b: string) => {
            const tbA = BOILING_POINTS[a.toLowerCase()] ?? 50;  // default 50°C for unknowns
            const tbB = BOILING_POINTS[b.toLowerCase()] ?? 50;
            return tbA - tbB;
          });
          const mid = Math.floor(sorted.length / 2);
          node.data.parameters.light_key = sorted[mid - 1];
          node.data.parameters.heavy_key = sorted[mid];
          console.log(`[column-keys] Auto-injected LK="${sorted[mid - 1]}", HK="${sorted[mid]}" for ${node.id} (sorted by Tb)`);
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
        body: JSON.stringify({ prompt: enhancedPrompt, retryCount: 1, components, propertyPackage })
      });

      return POST(retryRequest);
    }

    // Engineering feasibility validation — auto-corrects where safe, warns otherwise
    const engineeringWarnings = validateEngineeringFeasibility(
      flowsheetData.nodes,
      flowsheetData.edges,
      flowsheetData.thermo,
    );
    if (engineeringWarnings.length > 0) {
      console.log('[engineering] Warnings:', engineeringWarnings);
      (flowsheetData as any).engineeringWarnings = engineeringWarnings;
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
