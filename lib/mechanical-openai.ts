import OpenAI from "openai";
import { MechanicalSystemSpec, MechanicalSystemSpecType } from "./mechanical-spec";
import { zodToJsonSchema } from "zod-to-json-schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const mechanicalSystemSchema = zodToJsonSchema(MechanicalSystemSpec, "MechanicalSystemSpec");
const mechanicalSystemToolParameters =
  (mechanicalSystemSchema as any).definitions?.MechanicalSystemSpec ?? mechanicalSystemSchema;

const systemPrompt = `You are a senior mechanical design engineer with 20+ years of experience in detailed mechanical engineering drawings, equipment design, and AutoCAD drafting. You specialize in creating comprehensive mechanical engineering drawings that show the internal construction and component details of industrial equipment.

Generate detailed mechanical engineering specifications with comprehensive component details and internal construction information.

Your expertise includes:
- Detailed mechanical engineering drawings with component-level details
- Equipment cross-sections showing internal components and construction
- Mechanical seal details, bearing arrangements, shaft designs
- Impeller designs, casing construction, mounting details
- Heat exchanger tube arrangements, shell construction, baffle details
- Valve internals, seat designs, stem arrangements, actuator connections
- Tank construction details, nozzle arrangements, support structures
- Turbomachinery blade designs, rotor assemblies, stator details

CRITICAL REQUIREMENTS FOR MECHANICAL ENGINEERING DRAWINGS:
- All dimensions must be in millimeters (mm) with realistic engineering values
- Show INTERNAL COMPONENTS and construction details for each piece of equipment
- Include detailed mechanical specifications (materials, tolerances, surface finishes)
- Create comprehensive equipment layouts with proper clearances and access
- Add detailed component specifications (bearings, seals, fasteners, gaskets)
- Consider maintenance access, disassembly procedures, and operational requirements
- Use industry-standard mechanical engineering drawing conventions
- Include detailed connection specifications (flanges, bolts, gaskets, seals)
- Provide realistic operating parameters (pressure, temperature, flow rate, speed)

EQUIPMENT COMPONENT DETAILS TO INCLUDE (as parameters for main equipment):

CENTRIFUGAL PUMPS:
- Casing (suction/discharge volutes, split casing details)
- Impeller (blade geometry, hub, balancing holes)
- Shaft (diameter, keyways, threads, bearing journals)
- Mechanical seal (seal faces, springs, O-rings, gland plate)
- Bearings (ball bearings, housing, lubrication)
- Coupling (flexible coupling, spacer, guard)
- Baseplate (mounting holes, leveling pads, grout)

HEAT EXCHANGERS:
- Shell (cylindrical, elliptical heads, manways)
- Tube bundle (tube sheets, tubes, baffles, tie rods)
- Nozzles (inlet/outlet, drain, vent, instrument connections)
- Supports (saddles, sliding/stationary supports)
- Internals (baffles, impingement plates, seal strips)

VALVES:
- Body (cast/forged construction, pressure rating)
- Trim (seat, disc, stem, guide bushings)
- Packing (packing rings, lantern ring, gland follower)
- Actuator (pneumatic/hydraulic cylinder, spring return)
- Bonnet (bolted, welded, pressure seal)

TANKS/VESSELS:
- Shell (cylindrical, conical, elliptical heads)
- Nozzles (inlet/outlet, manway, instrument connections)
- Internals (agitators, baffles, heating coils)
- Supports (skirt, legs, saddles)
- Accessories (ladders, platforms, handrails)

For each component, specify:
- Precise dimensions (length, width, height, diameters in mm)
- Material specifications (carbon steel, stainless steel, alloys)
- Component details (bearings, seals, fasteners, gaskets)
- Operating parameters (pressure, temperature, flow rate, speed)
- Construction details (welding, machining, surface finish)

Generate professional, detailed mechanical engineering specifications that show the actual construction and internal components of each piece of equipment, suitable for manufacturing and assembly.

CRITICAL: Generate UNIQUE and SPECIFIC layouts based on the user's prompt. Each system should be completely different:
- For ROCKET systems: Include cryogenic tanks, turbopumps, preburners, engine clusters, pressurization systems
- For MARINE systems: Include diesel generators, batteries, thrusters, cooling loops, exhaust treatment
- For INDUSTRIAL systems: Include pumps, heat exchangers, filters, control systems, skid layouts
- For OFFSHORE systems: Include redundant equipment, safety systems, modular arrangements
- For HVAC systems: Include air handlers, chillers, ductwork, control valves, sensors

COMPONENT PARAMETERS:
- For every component include detailed \`parameters\` with internal component specifications, materials, dimensions, and construction details.
- Include comprehensive component information such as operating parameters, material specifications, and detailed internal component arrangements.

IMPORTANT: Each drawing must be UNIQUE and show different:
- Component arrangements and layouts
- Internal component details and cross-sections
- Dimensional specifications
- Material specifications
- Operating parameters
- Connection details
- Support structures
- Instrumentation and control elements

Generate completely different mechanical engineering drawings for each unique prompt, showing the actual construction and internal components of each piece of equipment.`;

type ComponentSpec = MechanicalSystemSpecType['components'][number];
type ComponentKind = ComponentSpec['type'];

interface DetectedComponentInfo {
  type: ComponentKind;
  baseName: string;
  parameters: Record<string, string>;
  matches: string[];
  count: number;
  maxRequested?: number;
  domains?: MechanicalSystemSpecType['project']['systemType'][];
}

interface PromptAnalysis {
  detectedComponents: DetectedComponentInfo[];
  requirementNotes: string[];
  summary: string;
}

interface ComponentPattern {
  type: ComponentKind;
  defaultName: string;
  defaultParameters: Record<string, string>;
  patterns: RegExp[];
  domains?: MechanicalSystemSpecType['project']['systemType'][];
}

interface RequirementPattern {
  regex: RegExp;
  note: string;
}

const TEXTUAL_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  dual: 2,
  twin: 2,
  double: 2,
  pair: 2
};

const DEFAULT_COMPONENT_SIZE: Record<ComponentKind | 'default', { width: number; height: number }> = {
  pump: { width: 260, height: 200 },
  compressor: { width: 220, height: 180 },
  heat_exchanger: { width: 280, height: 200 },
  valve: { width: 160, height: 120 },
  tank: { width: 260, height: 220 },
  pressure_vessel: { width: 240, height: 220 },
  turbine: { width: 260, height: 180 },
  motor: { width: 220, height: 160 },
  generator: { width: 260, height: 180 },
  filter: { width: 200, height: 150 },
  separator: { width: 220, height: 180 },
  reactor: { width: 240, height: 220 },
  instrument: { width: 200, height: 150 },
  pipe: { width: 260, height: 140 },
  default: { width: 200, height: 150 }
};

const COMPONENT_PATTERNS: ComponentPattern[] = [
  {
    type: "pump",
    defaultName: "Centrifugal Pump",
    defaultParameters: { source: "user_prompt" },
    patterns: [
      /\bcentrifugal pump(?:[^\w]|$)/gi,
      /\bprocess pump(?:[^\w]|$)/gi,
      /\bpump skid\b/gi,
      /\bbooster pump\b/gi,
      /\bapi\s*610\s+pumps?\b/gi,
      /\bpump\s+[A-Z]-\d+[A-Z]?\b/gi
    ]
  },
  {
    type: "heat_exchanger",
    defaultName: "Heat Exchanger",
    defaultParameters: { duty: "Thermal duty per prompt" },
    patterns: [
      /\bheat exchanger\b/gi,
      /\bshell[-\s]*and[-\s]*tube\b/gi,
      /\bplate heat exchanger\b/gi,
      /\bcooling exchanger\b/gi
    ]
  },
  {
    type: "valve",
    defaultName: "Control Valve",
    defaultParameters: { duty: "Flow control per prompt" },
    patterns: [
      /\bcontrol valve\b/gi,
      /\bglobe valve\b/gi,
      /\bbutterfly valve\b/gi,
      /\bball valve\b/gi
    ]
  },
  {
    type: "tank",
    defaultName: "Storage Tank",
    defaultParameters: { construction: "Tank requested in prompt" },
    patterns: [
      /\bstorage tank\b/gi,
      /\bholding tank\b/gi,
      /\binlet tank\b/gi,
      /\boutlet tank\b/gi,
      /\bballast tank\b/gi
    ]
  },
  {
    type: "separator",
    defaultName: "Separator Drum",
    defaultParameters: { service: "Phase separation per prompt" },
    patterns: [
      /\bseparator\b/gi,
      /\bknock[-\s]*out drum\b/gi,
      /\bmist eliminator\b/gi,
      /\bvent drum\b/gi
    ]
  },
  {
    type: "compressor",
    defaultName: "Compressor",
    defaultParameters: { service: "Gas compression per prompt" },
    patterns: [
      /\bcompressor\b/gi,
      /\bblower\b/gi,
      /\bsupply fan\b/gi
    ]
  },
  {
    type: "turbine",
    defaultName: "Turbine",
    defaultParameters: { duty: "Rotating machinery per prompt" },
    patterns: [
      /\bturbine\b/gi,
      /\bturbopump\b/gi,
      /\bengine cluster\b/gi,
      /\bpreburner\b/gi
    ],
    domains: ["rocket_propulsion"]
  },
  {
    type: "motor",
    defaultName: "Motor",
    defaultParameters: { power: "Per prompt" },
    patterns: [
      /\bmotor\b/gi,
      /\bdrive motor\b/gi,
      /\bazimuth thruster\b/gi
    ]
  },
  {
    type: "generator",
    defaultName: "Generator",
    defaultParameters: { rating: "Per prompt" },
    patterns: [
      /\bgenerator\b/gi,
      /\bdiesel generator\b/gi
    ]
  },
  {
    type: "pressure_vessel",
    defaultName: "Pressure Vessel",
    defaultParameters: { rating: "Pressure per prompt" },
    patterns: [
      /\bpressurization bottle\b/gi,
      /\bhelium (?:bottle|copv)\b/gi,
      /\bpressure vessel\b/gi
    ]
  },
  {
    type: "pipe",
    defaultName: "Process Manifold",
    defaultParameters: { service: "Manifold per prompt" },
    patterns: [
      /\bmanifold\b/gi,
      /\bheader\b/gi,
      /\bdistribution piping\b/gi
    ]
  },
  {
    type: "instrument",
    defaultName: "Instrumentation Panel",
    defaultParameters: { function: "Instrumentation per prompt" },
    patterns: [
      /\binstrumentation\b/gi,
      /\bcontrol panel\b/gi,
      /\bPLC\b/gi,
      /\bFADEC\b/gi
    ]
  },
  {
    type: "heat_exchanger",
    defaultName: "Cooling Coil",
    defaultParameters: { coil: "HVAC coil per prompt" },
    patterns: [
      /\bcooling coil\b/gi,
      /\bheating coil\b/gi,
      /\bcoil section\b/gi
    ],
    domains: ["hvac_system"]
  },
  {
    type: "compressor",
    defaultName: "Supply Fan",
    defaultParameters: { fan: "Requested air movement device" },
    patterns: [
      /\bsupply fan\b/gi,
      /\bair handling fan\b/gi
    ],
    domains: ["hvac_system"]
  },
  {
    type: "filter",
    defaultName: "Pre-filter",
    defaultParameters: { service: "Filtration per prompt" },
    patterns: [
      /\bpre[-\s]?filter\b/gi,
      /\bfiltration stage\b/gi
    ],
    domains: ["hvac_system", "process_plant", "pump_station"]
  },
  {
    type: "filter",
    defaultName: "Sound Attenuator",
    defaultParameters: { service: "Acoustic attenuation per prompt" },
    patterns: [
      /\bsound attenuator\b/gi,
      /\bduct silencer\b/gi
    ],
    domains: ["hvac_system"]
  }
];

const REQUIREMENT_PATTERNS: RequirementPattern[] = [
  { regex: /\bmechanical seal\b/i, note: "Include mechanical seal cartridge detail." },
  { regex: /\bimpeller\b/i, note: "Show impeller geometry with blade detail." },
  { regex: /\bshaft\b/i, note: "Dimension shaft diameters and journals." },
  { regex: /\bbearing\b/i, note: "Highlight bearing arrangement and lubrication." },
  { regex: /\bmaintenance clearance\b/i, note: "Maintain service and maintenance clearances." },
  { regex: /\bsection\s+[A-Z]-[A-Z]\b/i, note: "Label sectional views as referenced in the prompt." }
];

function toTitleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word.length === 0 ? "" : word[0].toUpperCase() + word.slice(1)))
    .join(" ")
    .trim();
}

function sanitizeMatch(match: string): string {
  const cleaned = match.replace(/[\s,:;.]+$/g, "").trim();
  const words = cleaned.split(/\s+/).map((word) => {
    if (/^[A-Z0-9\-/]+$/.test(word)) {
      return word.toUpperCase();
    }
    if (/^[A-Za-z]+\d.*$/.test(word)) {
      return word.replace(/^([A-Za-z]+)/, (_, prefix) => prefix.toUpperCase());
    }
    return toTitleCase(word);
  });
  return words.join(" ");
}

function inferCount(prompt: string, matchIndex: number): number {
  if (matchIndex <= 0) {
    return 1;
  }
  const window = prompt
    .slice(Math.max(0, matchIndex - 30), matchIndex)
    .toLowerCase();
  const numeric = window.match(/(\d+)\s*(?:x|times)?\s*$/);
  if (numeric) {
    const value = parseInt(numeric[1], 10);
    if (!Number.isNaN(value)) {
      return Math.min(Math.max(value, 1), 6);
    }
  }
  const textual = window.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|dual|twin|double|pair)\s*$/);
  if (textual) {
    const value = TEXTUAL_NUMBERS[textual[1]];
    if (value) {
      return Math.min(Math.max(value, 1), 6);
    }
  }
  return 1;
}

function analyzePrompt(prompt: string): PromptAnalysis {
  const detectedMap = new Map<string, DetectedComponentInfo>();

  for (const pattern of COMPONENT_PATTERNS) {
    for (const regex of pattern.patterns) {
      const matches = prompt.matchAll(regex);
      let index = 0;
      for (const match of matches) {
        const raw = match[0];
        const cleaned = sanitizeMatch(raw);
        const key = `${pattern.type}::${pattern.defaultName.toLowerCase()}`;
        let info = detectedMap.get(key);
        if (!info) {
          info = {
            type: pattern.type,
            baseName: cleaned.length > 2 ? cleaned : pattern.defaultName,
            parameters: { ...pattern.defaultParameters },
            matches: [],
            count: 0,
            maxRequested: 0,
            domains: pattern.domains
          };
          detectedMap.set(key, info);
        }
        if (cleaned.length > 2 && (index === 0 || cleaned.length > info.baseName.length)) {
          info.baseName = cleaned;
        }
        const occurrenceCount = Math.min(
          Math.max(inferCount(prompt, match.index ?? 0), 1),
          6
        );
        const baseLower = info.baseName.toLowerCase();
        const cleanedLower = cleaned.toLowerCase();
        const duplicateName =
          info.matches.length > 0 &&
          (
            info.matches.some((existing) => existing.toLowerCase() === cleanedLower) ||
            cleanedLower.includes(baseLower) ||
            baseLower.includes(cleanedLower)
          );
        for (let copy = 0; copy < occurrenceCount; copy++) {
          const instanceName =
            occurrenceCount > 1
              ? copy === 0
                ? cleaned
                : `${cleaned} ${copy + 1}`
              : cleaned;
          info.matches.push(instanceName);
        }
        info.maxRequested = Math.max(info.maxRequested ?? 0, occurrenceCount);
        index += 1;
      }
    }
  }

  const requirementNotes = REQUIREMENT_PATTERNS
    .filter((req) => req.regex.test(prompt.toLowerCase()))
    .map((req) => req.note);

  const summary = prompt.replace(/\s+/g, " ").trim().slice(0, 200);

  const detectedComponents = Array.from(detectedMap.values()).map((info) => {
    const uniqueCanonical = new Set(
      info.matches.map((match) => match.toLowerCase().replace(/\s+\d+$/g, ""))
    );
    const requested = info.maxRequested ?? 0;
    const baseCount = uniqueCanonical.size > 0 ? uniqueCanonical.size : 1;
    info.count = Math.max(requested, baseCount, 1);
    return info;
  });

  return {
    detectedComponents,
    requirementNotes,
    summary
  };
}

async function invokeOpenAiModel(model: string, prompt: string): Promise<MechanicalSystemSpecType> {
  console.log(`[mechanical-openai] Attempting OpenAI model: ${model}`);

  const completion = await Promise.race([
    openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "produce_mechanical_system_spec",
            description: "Generate a detailed mechanical system specification with internal component details",
            parameters: mechanicalSystemToolParameters
          }
        }
      ],
      tool_choice: { type: "function", function: { name: "produce_mechanical_system_spec" } },
      temperature: 0.65,
      max_tokens: 4000
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`OpenAI API timeout for model ${model}`)), 30000)
    )
  ]) as any;

  const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") {
    throw new Error(`Model ${model} did not return a function call`);
  }

  const args = JSON.parse(toolCall.function.arguments);
  return MechanicalSystemSpec.parse(args);
}

export async function generateMechanicalSystemSpec(
  prompt: string
): Promise<MechanicalSystemSpecType> {
  console.log("[mechanical-openai] Starting AI generation for:", prompt.slice(0, 100));

  const preferredModel = process.env.OPENAI_MECHANICAL_MODEL?.trim();
  const modelCandidates = [
    preferredModel || "gpt-4o",
    "gpt-4o-mini",
    "o4-mini"
  ].filter((model, index, arr) => model && arr.indexOf(model) === index);

  const errors: string[] = [];

  for (const model of modelCandidates) {
    try {
      const spec = await invokeOpenAiModel(model, prompt);
      console.log("[mechanical-openai] Validation successful:", spec.project.name);
      return spec;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${model}: ${message}`);
      console.error(`[mechanical-openai] Model ${model} failed:`, message);
    }
  }

  throw new Error(`AI generation failed for all models. Attempts: ${errors.join(" | ")}`);
}

type FallbackContext = {
  prompt: string;
  baseName: string;
  generatedAtIso: string;
  analysis: PromptAnalysis;
};

type FallbackBuilder = {
  match: (normalizedPrompt: string) => boolean;
  build: (context: FallbackContext) => MechanicalSystemSpecType;
};

export function generateFallbackSpec(prompt: string): MechanicalSystemSpecType {
  const normalized = prompt.toLowerCase();
  const baseName = prompt.trim().slice(0, 60) || "Mechanical System";
  const generatedAtIso = new Date().toISOString();
  const analysis = analyzePrompt(prompt);
  const context: FallbackContext = { prompt, baseName, generatedAtIso, analysis };

  for (const builder of fallbackBuilders) {
    if (builder.match(normalized)) {
      const spec = builder.build(context);
      spec.project.generatedAtIso = generatedAtIso;
      spec.project.revision = spec.project.revision ?? "FALLBACK-1";
      console.log(
        "[mechanical-openai] Using domain-specific fallback:",
        spec.project.systemType,
        "for prompt:",
        prompt.slice(0, 80)
      );
      return spec;
    }
  }

  // The last builder always matches, but return pump fallback as safety
  return buildPumpStation(context);
}

const fallbackBuilders: FallbackBuilder[] = [
  {
    match: (prompt) =>
      prompt.includes("rocket") ||
      prompt.includes("launch") ||
      prompt.includes("turbopump") ||
      prompt.includes("space"),
    build: buildRocketPropulsion
  },
  {
    match: (prompt) =>
      prompt.includes("marine") ||
      prompt.includes("ship") ||
      prompt.includes("vessel") ||
      prompt.includes("engine room") ||
      prompt.includes("thruster"),
    build: buildMarinePropulsion
  },
  {
    match: (prompt) =>
      prompt.includes("hvac") ||
      prompt.includes("air handling") ||
      prompt.includes("ahu") ||
      prompt.includes("ventilation"),
    build: buildHvacAirHandler
  },
  {
    match: (prompt) =>
      prompt.includes("heat exchanger") ||
      prompt.includes("cooling skid") ||
      prompt.includes("thermal") ||
      prompt.includes("process skid"),
    build: buildHeatExchangerSkid
  },
  {
    match: () => true,
    build: buildPumpStation
  }
];

function buildProjectMeta(
  context: FallbackContext,
  systemType: MechanicalSystemSpecType["project"]["systemType"],
  suffix: string,
  description: string
) {
  const promptSummary = context.analysis.summary || context.baseName;
  const trimmedPrompt = context.prompt.replace(/\s+/g, " ").trim();
  const promptSnippet =
    trimmedPrompt.length > 200 ? `${trimmedPrompt.slice(0, 200)}…` : trimmedPrompt;
  return {
    name: `${context.baseName} - ${suffix}`,
    systemType,
    description: `${description}. Prompt context: ${promptSnippet}`,
    units: "metric" as const,
    revision: "FALLBACK-1",
    generatedAtIso: context.generatedAtIso
  };
}

function applyPromptContext(spec: MechanicalSystemSpecType, context: FallbackContext) {
  const promptSummary = context.prompt.replace(/\s+/g, " ").trim();
  const summaryText =
    promptSummary.length > 140
      ? `Prompt excerpt: ${promptSummary.slice(0, 140)}…`
      : `Prompt excerpt: ${promptSummary}`;

  spec.annotations = spec.annotations ?? [];
  if (!spec.annotations.some((annotation) => annotation.text === summaryText)) {
    spec.annotations.push({
      text: summaryText,
      position: { x: 40, y: Math.max(40, spec.layout.height - 40) }
    });
  }

  applyDetectedComponents(spec, context);
  applyDetailOverrides(spec, context);
  appendRequirementAnnotations(spec, context);
}

function applyDetectedComponents(spec: MechanicalSystemSpecType, context: FallbackContext) {
  const detected = context.analysis.detectedComponents;
  if (!detected.length) {
    return;
  }

  const domain = spec.project.systemType;
  const typeCounts = new Map<ComponentKind, number>();
  spec.components.forEach((component) => {
    typeCounts.set(component.type, (typeCounts.get(component.type) ?? 0) + 1);
  });

  let additionIndex = 0;

  for (const info of detected) {
    if (info.domains && !info.domains.includes(domain)) {
      continue;
    }

    const existing = spec.components.filter((component) => component.type === info.type);

    if (existing.length > 0) {
      applyInfoToComponent(existing[0], info);
      const extraNeeded = info.count - existing.length;
      for (let i = 0; i < extraNeeded; i++) {
        const component = createComponentFromInfo(
          info,
          existing.length + i,
          spec.layout,
          typeCounts,
          additionIndex++,
          existing[0]
        );
        spec.components.push(component);
      }
    } else {
      for (let i = 0; i < info.count; i++) {
        const component = createComponentFromInfo(info, i, spec.layout, typeCounts, additionIndex++);
        spec.components.push(component);
      }
    }
  }
}

function applyDetailOverrides(spec: MechanicalSystemSpecType, context: FallbackContext) {
  const normalized = context.prompt.toLowerCase();

  const pumpComponents = spec.components.filter((component) => component.type === "pump");
  if (pumpComponents.length > 0) {
    for (const pump of pumpComponents) {
      pump.parameters = pump.parameters ?? {};

      const callouts = pump.parameters.additionalCallouts as Array<{ text?: string }> | undefined;

      if (normalized.includes("plan 53a")) {
        pump.parameters.mechanicalSeal = "API 682 Plan 53A mechanical seal (per prompt)";
        callouts?.forEach((callout) => {
          if (typeof callout.text === "string") {
            callout.text = callout.text.replace(/Plan 53[AB]/gi, "Plan 53A");
          }
        });
      } else if (normalized.includes("plan 53b")) {
        pump.parameters.mechanicalSeal = "API 682 Plan 53B mechanical seal (per prompt)";
      } else if (normalized.includes("plan 23")) {
        pump.parameters.mechanicalSeal = "API 682 Plan 23 mechanical seal (per prompt)";
        callouts?.forEach((callout) => {
          if (typeof callout.text === "string") {
            callout.text = callout.text.replace(/Plan 53[AB]/gi, "Plan 23");
          }
        });
      }

      if (normalized.includes("maintenance clearance")) {
        pump.parameters.maintenance = "Maintain maintenance clearances as requested in the prompt.";
      }

      if (normalized.includes("impeller")) {
        pump.parameters.impellerNotes = "Include impeller geometry detail per prompt.";
      }

      if (normalized.includes("bearing")) {
        pump.parameters.bearingNotes = "Highlight bearing arrangement and lubrication per prompt.";
      }
    }
  }

  if (normalized.includes("sound attenuator")) {
    const attenuator = spec.components.find((component) =>
      component.name.toLowerCase().includes("attenuator")
    );
    if (attenuator) {
      attenuator.parameters = attenuator.parameters ?? {};
      attenuator.parameters.service = "Acoustic attenuation per prompt";
    }
  }
}

function applyInfoToComponent(component: ComponentSpec, info: DetectedComponentInfo) {
  component.parameters = component.parameters ?? {};
  const promptNotes = info.matches.join("; ");
  component.parameters.promptNotes = component.parameters.promptNotes
    ? `${component.parameters.promptNotes}; ${promptNotes}`
    : promptNotes;

  for (const [key, value] of Object.entries(info.parameters)) {
    if (!component.parameters[key]) {
      component.parameters[key] = value;
    }
  }

  if (
    info.baseName &&
    !component.name.toLowerCase().includes(info.baseName.toLowerCase()) &&
    info.baseName.length > 3
  ) {
    component.name = `${component.name} (${info.baseName})`;
  }
}

function createComponentFromInfo(
  info: DetectedComponentInfo,
  instanceIndex: number,
  layout: MechanicalSystemSpecType["layout"],
  typeCounts: Map<ComponentKind, number>,
  additionIndex: number,
  template?: ComponentSpec
): ComponentSpec {
  const size =
    DEFAULT_COMPONENT_SIZE[info.type] ?? DEFAULT_COMPONENT_SIZE.default;
  const columns = Math.max(1, Math.floor(layout.width / 320));
  const col = additionIndex % columns;
  const row = Math.floor(additionIndex / columns);
  const marginX = 140;
  const marginY = 160;
  const usableWidth = Math.max(layout.width - marginX * 2, 200);
  const xSpacing = columns > 1 ? usableWidth / (columns - 1) : 0;
  const x = columns > 1 ? marginX + col * xSpacing : layout.width / 2;
  const y = Math.max(
    marginY,
    layout.height - marginY - row * (size.height + 80)
  );

  const id = getNextComponentId(info.type, typeCounts);
  const name =
    info.count > 1
      ? `${info.baseName} ${instanceIndex + 1}`
      : info.baseName;

  const baseParameters = template?.parameters
    ? JSON.parse(JSON.stringify(template.parameters))
    : {};
  const parameters: Record<string, any> = {
    ...baseParameters,
    ...info.parameters,
    promptNotes: info.matches[instanceIndex] ?? info.matches[0] ?? info.baseName
  };

  return {
    id,
    type: info.type,
    name,
    position: { x, y },
    size,
    parameters
  };
}

function getNextComponentId(type: ComponentKind, typeCounts: Map<ComponentKind, number>): string {
  const next = (typeCounts.get(type) ?? 0) + 1;
  typeCounts.set(type, next);
  return `${type}-${String(next).padStart(2, "0")}`;
}

function appendRequirementAnnotations(spec: MechanicalSystemSpecType, context: FallbackContext) {
  const notes = context.analysis.requirementNotes;
  if (!notes.length) {
    return;
  }

  spec.annotations = spec.annotations ?? [];
  const existingTexts = new Set(spec.annotations.map((annotation) => annotation.text));
  let offset = 0;
  const baseX = Math.max(60, spec.layout.width - 420);
  const baseY = spec.layout.height - 60;

  for (const note of notes) {
    const text = `Prompt requirement: ${note}`;
    if (existingTexts.has(text)) {
      continue;
    }
    spec.annotations.push({
      text,
      position: { x: baseX, y: baseY - offset }
    });
    offset += 24;
  }
}


function buildRocketPropulsion(context: FallbackContext): MechanicalSystemSpecType {
  const spec: MechanicalSystemSpecType = {
    project: buildProjectMeta(
      context,
      "rocket_propulsion",
      "Rocket Propulsion",
      "Reusable launch vehicle propulsion bay with cryogenic feed and turbomachinery"
    ),
    components: [
      {
        id: "lox-tank",
        type: "tank",
        name: "LOX Tank T-01",
        position: { x: 260, y: 520 },
        size: { width: 360, height: 480 },
        pressure: 6,
        temperature: -183,
        parameters: {
          construction: "Al-Li 2195 integral stiffeners, hemispherical domes",
          insulation: "MLI blankets + foam, boil-off rate 0.05%/hr",
          instrumentation: "Capacitance level probes, PT-LOX-101, vent stack",
          support: "Skirt with anti-slosh baffles spaced 450mm",
          additionalCallouts: [
            {
              label: "Common Bulkhead",
              text: "Honeycomb insulated common dome separating LOX and RP-1 volumes",
              target: { x: 0, y: -200 },
              textPosition: { x: -220, y: -320 }
            },
            {
              label: "Anti-Slosh",
              text: "Radial anti-slosh vanes welded to inner wall, 6 equally spaced",
              target: { x: -120, y: -40 },
              textPosition: { x: -340, y: -40 }
            }
          ]
        }
      },
      {
        id: "rp1-tank",
        type: "tank",
        name: "RP-1 Tank T-02",
        position: { x: 260, y: 140 },
        size: { width: 360, height: 420 },
        pressure: 3.5,
        temperature: 15,
        parameters: {
          construction: "Al 2219 stringer/frame with elliptical domes",
          internals: "Anti-vortex sump, ladder gauge, heater manifold",
          support: "Common bulkhead with LOX tank, foam insulation"
        }
      },
      {
        id: "turbopump",
        type: "turbine",
        name: "LOX/RP-1 Turbopump TP-01",
        position: { x: 720, y: 320 },
        size: { width: 260, height: 220 },
        power: 40000,
        parameters: {
          turbine: "Ox-rich staged combustion turbine, 72,000 rpm",
          pump: "Axial inducer + 5-stage centrifugal impeller, ΔP 23 MPa",
          bearings: "Dual ceramic ball bearings, film cooled",
          seal: "Helium-buffered face seals with purge",
          additionalCallouts: [
            {
              label: "Inducer",
              text: "Anti-cavitation inducer with shroud, tip clearance 0.35 mm",
              target: { x: -60, y: 40 },
              textPosition: { x: -240, y: 180 }
            },
            {
              label: "Turbine",
              text: "5-stage turbine, transpiration cooled stator vanes, Inconel 713C",
              target: { x: 80, y: 60 },
              textPosition: { x: 200, y: 220 }
            }
          ]
        }
      },
      {
        id: "preburner",
        type: "reactor",
        name: "Preburner PB-01",
        position: { x: 960, y: 160 },
        size: { width: 220, height: 200 },
        temperature: 900,
        pressure: 16,
        parameters: {
          mixRatio: "Ox-rich mixture ratio 2.3:1",
          injectors: "Shear-coaxial injector plate with baffle ring",
          cooling: "Film cooled throat liner, Inconel 718",
          ignition: "TEA/TEB torch manifold"
        }
      },
      {
        id: "engine-cluster",
        type: "turbine",
        name: "Main Engine Cluster E-01",
        position: { x: 1180, y: 540 },
        size: { width: 420, height: 520 },
        parameters: {
          chambers: "7 engine bells, regenerative cooled, gimbal ±8°",
          nozzle: "Niobium extension with ablative throat insert",
          thrust: "Total thrust 5.8 MN at sea level",
          instrumentation: "Throat thermocouples, chamber PT, vibration sensors",
          additionalCallouts: [
            {
              label: "Gimbal Joint",
              text: "Hydraulic actuators with spherical bearing, ±8° travel, dual redundancy",
              target: { x: 60, y: -180 },
              textPosition: { x: 220, y: -320 }
            },
            {
              label: "Injector Manifold",
              text: "Coaxial injector manifold, 14 panels, distributed mixture valves",
              target: { x: -40, y: 80 },
              textPosition: { x: -260, y: 220 }
            }
          ]
        }
      },
      {
        id: "helium-bottle",
        type: "pressure_vessel",
        name: "Helium COPV Bank",
        position: { x: 600, y: 640 },
        size: { width: 280, height: 180 },
        pressure: 31,
        parameters: {
          construction: "Composite overwrapped Ti liners, 30 L each",
          routing: "Redundant regulators to LOX/RP-1 ullage",
          temperature: 15
        }
      },
      {
        id: "regenerative-hx",
        type: "heat_exchanger",
        name: "Cooling Manifold HX-01",
        position: { x: 820, y: 520 },
        size: { width: 260, height: 200 },
        parameters: {
          channels: "RP-1 cooling jacket, 120 microchannels, 1.6 mm wide",
          material: "GRCop-84 liner brazed to Inconel shell",
          inlet: "Fuel pump discharge 22 MPa, 120 kg/s"
        }
      },
      {
        id: "avionics",
        type: "instrument",
        name: "Propulsion FADEC",
        position: { x: 1040, y: 360 },
        size: { width: 140, height: 140 },
        parameters: {
          controllers: "Dual-channel FADEC, redundant harness routing",
          sensors: "IMU, chamber PT, pump speed, valve positions"
        }
      }
    ],
    connections: [
      { id: "conn-lox-feed", type: "pipe", from: "lox-tank", to: "turbopump", diameter: 450, material: "Al 2219 feedline", pressure: 6 },
      { id: "conn-rp1-feed", type: "pipe", from: "rp1-tank", to: "turbopump", diameter: 380, material: "Flexible stainless joint", pressure: 4 },
      { id: "conn-preburner-oxidizer", type: "pipe", from: "turbopump", to: "preburner", diameter: 160, material: "Inconel 625", pressure: 18 },
      { id: "conn-preburner-fuel", type: "pipe", from: "regenerative-hx", to: "preburner", diameter: 140, material: "Inconel 718", pressure: 18 },
      { id: "conn-engine-feed", type: "pipe", from: "turbopump", to: "engine-cluster", diameter: 260, material: "Channel manifold", pressure: 24 },
      { id: "conn-pressurization-lox", type: "pipe", from: "helium-bottle", to: "lox-tank", diameter: 32, material: "Ti tubing", pressure: 30 },
      { id: "conn-pressurization-fuel", type: "pipe", from: "helium-bottle", to: "rp1-tank", diameter: 32, material: "Ti tubing", pressure: 28 },
      { id: "conn-fadec-control", type: "control_signal", from: "avionics", to: "turbopump" }
    ],
    layout: { width: 1600, height: 900, gridSpacing: 120 },
    annotations: [
      {
        text: "SECTION B-B reveals LOX turbopump inducer, dual bearings, and seal purge circuit.",
        position: { x: 720, y: 620 }
      },
      {
        text: "Engine cluster regenerative jacket returns 480°C fuel through HX-01 before injector manifold.",
        position: { x: 1180, y: 720 }
      },
      {
        text: "Helium COPV array isolated with redundant valves; supply PT-302 monitors ullage pressure.",
        position: { x: 600, y: 760 }
      }
    ]
  };

  applyPromptContext(spec, context);
  return spec;
}

function buildMarinePropulsion(context: FallbackContext): MechanicalSystemSpecType {
  const spec: MechanicalSystemSpecType = {
    project: buildProjectMeta(
      context,
      "ship_propulsion",
      "Marine Propulsion",
      "Diesel-electric marine propulsion system with azimuth thrusters"
    ),
    components: [
      {
        id: "diesel-gen",
        type: "generator",
        name: "Diesel Generator DG-201",
        position: { x: 360, y: 420 },
        size: { width: 360, height: 240 },
        power: 6000,
        parameters: {
          engine: "V16 medium-speed diesel, 720 rpm, IMO Tier III",
          alternator: "690V 3Ø, water-cooled stator",
          auxiliaries: "Charge air cooler, lube oil separator, start air manifold",
          additionalCallouts: [
            {
              label: "Cylinder Head",
              text: "4-valve head with indicator cocks and fuel injector access",
              target: { x: -120, y: 80 },
              textPosition: { x: -320, y: 220 }
            },
            {
              label: "Alternator",
              text: "Brushless alternator with stator water jackets and RTD sensors",
              target: { x: 120, y: -60 },
              textPosition: { x: 280, y: -220 }
            }
          ]
        }
      },
      {
        id: "switchboard",
        type: "instrument",
        name: "Main Switchboard MSB-1",
        position: { x: 720, y: 420 },
        size: { width: 220, height: 220 },
        parameters: {
          bays: "8 sections with draw-out breakers",
          control: "Power management system, redundancy bus ties",
          instrumentation: "Synchronization panels, protective relays"
        }
      },
      {
        id: "azimuth-motor",
        type: "motor",
        name: "Azimuth Thruster Motor M-301",
        position: { x: 1080, y: 420 },
        size: { width: 300, height: 220 },
        power: 4500,
        parameters: {
          cooling: "Freshwater jacket with seawater HX",
          gearbox: "Planetary reduction 18:1, integrated steering module",
          sensors: "Bearing temperature, vibration probes, pitch feedback",
          additionalCallouts: [
            {
              label: "Steering Actuator",
              text: "Electro-hydraulic steering actuator with dual feedback encoders",
              target: { x: 0, y: 100 },
              textPosition: { x: 220, y: 240 }
            }
          ]
        }
      },
      {
        id: "reduction-gear",
        type: "turbine",
        name: "Reduction Gear GR-301",
        position: { x: 1080, y: 650 },
        size: { width: 280, height: 200 },
        parameters: {
          stages: "Double helical bull gear with quill shaft",
          lubrication: "Force-fed lube system with duplex filters",
          monitoring: "Particle counter, bearing metal temp RTDs"
        }
      },
      {
        id: "sea-chest",
        type: "tank",
        name: "Sea Chest SC-101",
        position: { x: 180, y: 640 },
        size: { width: 220, height: 220 },
        parameters: {
          internals: "Duplex strainers, cross-connected isolation valves",
          instrumentation: "Differential pressure transmitters, flooding sensor",
          coating: "Glass flake epoxy with ICCP anodes"
        }
      },
      {
        id: "cooling-hx",
        type: "heat_exchanger",
        name: "Central Cooling HX-201",
        position: { x: 540, y: 640 },
        size: { width: 280, height: 200 },
        parameters: {
          configuration: "Plate HX, titanium plates, 4000 kW",
          circuits: "FW 36°C loop / SW 32°C loop, duplex arrangement",
          connections: "DN300 FW headers, DN350 SW headers"
        }
      },
      {
        id: "ballast-tank",
        type: "tank",
        name: "Ballast Tank BT-401",
        position: { x: 1080, y: 180 },
        size: { width: 260, height: 200 },
        parameters: {
          internals: "Longitudinal baffle, sounding pipe, stripping ejector",
          instrumentation: "Radar level gauge, temperature probe",
          valves: "Electro-hydraulic remote-operated valves"
        }
      },
      {
        id: "mcr",
        type: "instrument",
        name: "Machinery Control Room",
        position: { x: 720, y: 180 },
        size: { width: 240, height: 180 },
        parameters: {
          consoles: "Integrated automation system, fire detection mimic",
          redundancy: "Dual PLC racks, UPS backed HMI stations"
        }
      }
    ],
    connections: [
      { id: "conn-power-gen", type: "electrical", from: "diesel-gen", to: "switchboard" },
      { id: "conn-motor-feed", type: "electrical", from: "switchboard", to: "azimuth-motor" },
      { id: "conn-gearbox", type: "mechanical", from: "azimuth-motor", to: "reduction-gear" },
      { id: "conn-cooling-fw", type: "pipe", from: "cooling-hx", to: "diesel-gen", diameter: 250, material: "CuNi 90/10" },
      { id: "conn-cooling-sw", type: "pipe", from: "sea-chest", to: "cooling-hx", diameter: 350, material: "CuNi 70/30" },
      { id: "conn-control", type: "control_signal", from: "mcr", to: "switchboard" },
      { id: "conn-ballast", type: "pipe", from: "ballast-tank", to: "sea-chest", diameter: 250, material: "Carbon steel lined" }
    ],
    layout: { width: 1500, height: 900, gridSpacing: 100 },
    annotations: [
      {
        text: "SECTION C-C shows diesel crankcase, camshaft tunnel, charge air cooler cores.",
        position: { x: 360, y: 640 }
      },
      {
        text: "Azimuth thruster detail includes upper/lower bearings, steering actuator, pitch rods.",
        position: { x: 1080, y: 540 }
      },
      {
        text: "Central cooling module: plate pack arrangement, bypass valves, temperature control loop.",
        position: { x: 540, y: 780 }
      }
    ]
  };

  applyPromptContext(spec, context);
  return spec;
}

function buildHvacAirHandler(context: FallbackContext): MechanicalSystemSpecType {
  const spec: MechanicalSystemSpecType = {
    project: buildProjectMeta(
      context,
      "hvac_system",
      "HVAC Air Handling Unit",
      "High capacity air handling unit with coil sections and duct transitions"
    ),
    components: [
      {
        id: "ahu-casing",
        type: "tank",
        name: "Air Handling Casing",
        position: { x: 520, y: 420 },
        size: { width: 520, height: 260 },
        parameters: {
          construction: "Double wall panel 50mm PIR insulation, galvanized frame",
          sections: "Filter, cooling coil, heating coil, humidifier, fan discharge",
          access: "Service doors per section with inspection lighting"
        }
      },
      {
        id: "supply-fan",
        type: "compressor",
        name: "Centrifugal Supply Fan",
        position: { x: 320, y: 420 },
        size: { width: 220, height: 160 },
        power: 55,
        parameters: {
          impeller: "Backward-curved aluminum blades, shaft Ø60mm",
          motor: "Direct drive IE4 motor with VFD",
          vibration: "Isolation springs, accelerometers",
          additionalCallouts: [
            {
              label: "Isolation",
              text: "Spring isolators, 25mm deflection, neoprene snubbers",
              target: { x: 0, y: -80 },
              textPosition: { x: -200, y: -180 }
            }
          ]
        }
      },
      {
        id: "cooling-coil",
        type: "heat_exchanger",
        name: "Chilled Water Coil",
        position: { x: 520, y: 320 },
        size: { width: 320, height: 140 },
        parameters: {
          rows: "8-row finned coil, copper tubes, aluminum fins",
          circuits: "Face split with 2-way control valves",
          condensate: "Stainless drain pan with trap, slope 1%"
        }
      },
      {
        id: "heating-coil",
        type: "heat_exchanger",
        name: "Hot Water Coil",
        position: { x: 520, y: 520 },
        size: { width: 320, height: 140 },
        parameters: {
          rows: "4-row coil, stainless casing",
          valves: "2-way modulating valve with bypass",
          sensors: "Leaving air temperature probe"
        }
      },
      {
        id: "humidifier",
        type: "separator",
        name: "Steam Grid Humidifier",
        position: { x: 720, y: 420 },
        size: { width: 160, height: 140 },
        parameters: {
          type: "Steam grid with stainless dispersers",
          control: "Modulating valve, condensate return trap",
          sensors: "RH probes upstream/downstream"
        }
      },
      {
        id: "supply-duct",
        type: "pipe",
        name: "Supply Duct Transition",
        position: { x: 900, y: 420 },
        size: { width: 200, height: 200 },
        diameter: 800,
        parameters: {
          construction: "Galvanized duct with turning vanes",
          insulation: "25mm acoustic lining",
          accessories: "Fire damper, smoke detector, airflow station"
        }
      },
      {
        id: "control-cabinet",
        type: "instrument",
        name: "Building Automation Cabinet",
        position: { x: 320, y: 640 },
        size: { width: 200, height: 160 },
        parameters: {
          controllers: "BACnet DDC controller, redundant power supply",
          io: "16 AI, 16 AO, 24 DI/DO with terminal blocks",
          network: "Fiber backbone with local HMI"
        }
      }
    ],
    connections: [
      { id: "conn-fan-coil", type: "pipe", from: "supply-fan", to: "cooling-coil", diameter: 780, material: "Galvanized steel" },
      { id: "conn-coil-humidifier", type: "pipe", from: "cooling-coil", to: "humidifier", diameter: 760, material: "Galvanized steel" },
      { id: "conn-humidifier-duct", type: "pipe", from: "humidifier", to: "supply-duct", diameter: 740, material: "Galvanized steel" },
      { id: "conn-control", type: "control_signal", from: "control-cabinet", to: "supply-fan" }
    ],
    layout: { width: 1400, height: 900, gridSpacing: 100 },
    annotations: [
      {
        text: "Section F-F shows fan wheel, shaft sleeve, bearing blocks, and acoustic lining.",
        position: { x: 320, y: 520 }
      },
      {
        text: "Cooling coil detail: fin spacing 2.1 mm, condensate trough, access clearance 900 mm.",
        position: { x: 520, y: 260 }
      },
      {
        text: "Humidifier grid with steam separator, drip eliminators, stainless support frame.",
        position: { x: 720, y: 520 }
      }
    ]
  };

  applyPromptContext(spec, context);
  return spec;
}

function buildHeatExchangerSkid(context: FallbackContext): MechanicalSystemSpecType {
  const spec: MechanicalSystemSpecType = {
    project: buildProjectMeta(
      context,
      "heat_exchange_system",
      "Heat Exchanger Skid",
      "Shell-and-tube exchanger skid with detailed internals and support structure"
    ),
    components: [
      {
        id: "shell-exchanger",
        type: "heat_exchanger",
        name: "Shell & Tube Exchanger E-110",
        position: { x: 520, y: 400 },
        size: { width: 420, height: 240 },
        parameters: {
          shell: "Ø900mm carbon steel shell, design 16 bar, 220°C",
          tubeBundle: "3/4\" Ø U-tubes, 1200mm length, 0.7mm clearance",
          baffles: "Segmental baffles 45% cut, spacing 150mm",
          channel: "Floating head with split ring retainer, spiral wound gasket",
          additionalCallouts: [
            {
              label: "Floating Head Cover",
              text: "Floating head with packed stuffing box and 12 M24 studs",
              target: { x: 140, y: 40 },
              textPosition: { x: 320, y: 160 }
            },
            {
              label: "Tube Bundle",
              text: "Pull-out path with tie rods and spacers every third baffle",
              target: { x: -120, y: -40 },
              textPosition: { x: -320, y: -160 }
            }
          ]
        }
      },
      {
        id: "hot-inlet",
        type: "valve",
        name: "Hot Fluid Valve CV-110",
        position: { x: 200, y: 420 },
        size: { width: 140, height: 120 },
        parameters: {
          body: "ANSI 300 globe valve, CF8M body",
          trim: "Stellite seat and plug, linear trim",
          actuator: "Pneumatic diaphragm with smart positioner",
          packing: "Graphite rings + lantern ring flush"
        }
      },
      {
        id: "cold-inlet",
        type: "valve",
        name: "Cooling Water Valve CV-111",
        position: { x: 520, y: 200 },
        size: { width: 140, height: 120 },
        parameters: {
          body: "Butterfly valve DN300, stainless disc",
          actuator: "Electric actuator IP67",
          instrumentation: "Position feedback, torque switch"
        }
      },
      {
        id: "support-skid",
        type: "tank",
        name: "Structural Skid",
        position: { x: 520, y: 680 },
        size: { width: 520, height: 200 },
        parameters: {
          beams: "W14x53 longitudinal beams, cross bracing, lifting lugs",
          grout: "Grout pockets 150x150 mm, leveling screws",
          access: "Maintenance platform with ladder and handrail"
        }
      },
      {
        id: "instrument-panel",
        type: "instrument",
        name: "Instrumentation Rack",
        position: { x: 880, y: 360 },
        size: { width: 180, height: 180 },
        parameters: {
          transmitters: "TT-110A/B, PT-110A/B, flow swirl meter",
          control: "PLC panel with redundant I/O, local HMI"
        }
      },
      {
        id: "vent-drum",
        type: "separator",
        name: "Vent Drum V-110",
        position: { x: 880, y: 600 },
        size: { width: 200, height: 180 },
        parameters: {
          internals: "Cyclonic mist eliminator, level bridles",
          connections: "Vent to flare, condensate to sump"
        }
      }
    ],
    connections: [
      { id: "conn-hot-feed", type: "pipe", from: "hot-inlet", to: "shell-exchanger", diameter: 250, material: "A312 TP316L", pressure: 14 },
      { id: "conn-cold-feed", type: "pipe", from: "cold-inlet", to: "shell-exchanger", diameter: 300, material: "Carbon steel lined", pressure: 10 },
      { id: "conn-vent", type: "pipe", from: "shell-exchanger", to: "vent-drum", diameter: 80, material: "Stainless steel", pressure: 6 },
      { id: "conn-instrument", type: "control_signal", from: "instrument-panel", to: "hot-inlet" }
    ],
    layout: { width: 1400, height: 900, gridSpacing: 100 },
    annotations: [
      {
        text: "Section D-D reveals floating head, tube bundle removal path, tie rods and spacers.",
        position: { x: 520, y: 560 }
      },
      {
        text: "Skid fabrication: 10mm deck plate, drain troughs, instrument cable trays underside.",
        position: { x: 520, y: 760 }
      },
      {
        text: "Control rack includes dual PID loops, safety interlocks, manual bypass manifold.",
        position: { x: 880, y: 460 }
      }
    ]
  };

  applyPromptContext(spec, context);
  return spec;
}

function buildPumpStation(context: FallbackContext): MechanicalSystemSpecType {
  const spec: MechanicalSystemSpecType = {
    project: buildProjectMeta(
      context,
      "pump_station",
      "Pump Station",
      "API 610 pump package with mechanical seal support system"
    ),
    components: [
      {
        id: "pump-201a",
        type: "pump",
        name: "Centrifugal Pump P-201A",
        position: { x: 520, y: 360 },
        size: { width: 320, height: 240 },
        flowRate: 550,
        pressure: 720,
        parameters: {
          pumpType: "API 610 OH2 double-volute casing",
          impeller: "5-vane closed impeller Ø420mm with 17-4PH wear rings",
          shaft: "AISI 4140 shaft Ø72mm at impeller, Ø60mm at coupling with keyed sleeve",
          mechanicalSeal: "API 682 Plan 53B tandem cartridge seal with pressurized barrier",
          bearings: "DE: 7312B angular contact, NDE: 6312 deep groove, oil mist lubrication",
          coupling: "Spacer coupling 180mm with OSHA guard and alignment hub",
          baseplate: "Fabricated base 20mm plate, grout pockets, M24 anchor bolts",
          suction: "DN200 RF flange, 8x Ø22 on 279mm PCD",
          discharge: "DN150 RF flange, 8x Ø19 on 241mm PCD",
          materials: "Casing CA6NM, Impeller CF8M, Shaft sleeve Alloy 625, Fasteners A193 B7",
          additionalCallouts: [
            {
              label: "Wear Ring",
              text: "Replaceable 17-4PH wear rings, diametral clearance 0.18 mm",
              target: { x: -60, y: -10 },
              textPosition: { x: -180, y: 120 }
            },
            {
              label: "Seal Flush",
              text: "Plan 53B seal flush piping with orifice, check valve, accumulator connection",
              target: { x: 70, y: 110 },
              textPosition: { x: 210, y: 170 }
            }
          ]
        }
      },
      {
        id: "motor-201a",
        type: "motor",
        name: "Motor M-201A",
        position: { x: 840, y: 360 },
        size: { width: 220, height: 160 },
        power: 185,
        parameters: {
          enclosure: "TEFC IP55 Class F, service factor 1.15",
          rating: "400V 3Ø 50Hz, 185 kW, 1480 rpm",
          frame: "IEC 355M with regrease points"
        }
      },
      {
        id: "seal-pot-201",
        type: "tank",
        name: "Seal Support Pot",
        position: { x: 240, y: 360 },
        size: { width: 160, height: 220 },
        capacity: 18,
        parameters: {
          service: "Plan 53B bladder accumulator, ASME VIII design",
          instrumentation: "Pressure switch PS-201, level transmitter LT-201, thermometer TT-201"
        }
      },
      {
        id: "cooler-201",
        type: "heat_exchanger",
        name: "Seal Fluid Cooler E-201",
        position: { x: 1120, y: 360 },
        size: { width: 260, height: 200 },
        parameters: {
          duty: "Oil-to-water cooler 120 kW",
          tubes: "3/4\" OD Admiralty brass, 1.6 mm wall, 2-pass",
          shell: "Carbon steel, design 10 bar, 150°C",
          nozzles: "Water in/out DN80, Oil in/out DN50"
        }
      },
      {
        id: "separator-201",
        type: "separator",
        name: "Seal Gas Knock-out Drum",
        position: { x: 520, y: 640 },
        size: { width: 280, height: 180 },
        parameters: {
          duty: "Remove entrained oil mist prior to recovery",
          internals: "Stainless mesh demister, 300mm weir, level gauge LG-201"
        }
      },
      {
        id: "instrument-201",
        type: "instrument",
        name: "Instrumentation Panel IP-201",
        position: { x: 840, y: 640 },
        size: { width: 120, height: 120 },
        parameters: {
          loops: "PT-201, LT-201, TT-201, VB-201A/B vibration probes",
          notes: "Stainless steel IP54 enclosure, marshalling terminals provided"
        }
      }
    ],
    connections: [
      { id: "conn-suction", type: "pipe", from: "seal-pot-201", to: "pump-201a", diameter: 200, material: "ASTM A312 TP316L", pressure: 10 },
      { id: "conn-discharge", type: "pipe", from: "pump-201a", to: "cooler-201", diameter: 150, material: "ASTM A312 TP316L", pressure: 12 },
      { id: "conn-return", type: "pipe", from: "cooler-201", to: "seal-pot-201", diameter: 50, material: "ASTM A106 Gr.B", pressure: 8 },
      { id: "conn-seal-gas", type: "pipe", from: "pump-201a", to: "separator-201", diameter: 25, material: "SS316L tubing", pressure: 5 },
      { id: "conn-mechanical", type: "mechanical", from: "motor-201a", to: "pump-201a" },
      { id: "conn-instrument", type: "control_signal", from: "instrument-201", to: "pump-201a" }
    ],
    layout: { width: 1500, height: 900, gridSpacing: 100 },
    annotations: [
      {
        text: "SECTION A-A exposes impeller, wear rings, shaft sleeve, and mechanical seal cartridge.",
        position: { x: 520, y: 720 }
      },
      {
        text: "All dimensions in millimeters. Fabrication tolerance unless noted ±0.25 mm.",
        position: { x: 520, y: 760 }
      },
      {
        text: "Materials per API 610/API 682. Hydrotest casing at 1.5 × design pressure.",
        position: { x: 520, y: 800 }
      }
    ]
  };

  applyPromptContext(spec, context);
  return spec;
}

const mechanicalOpenAi = {
  generateMechanicalSystemSpec,
  generateFallbackSpec
};

export default mechanicalOpenAi;
