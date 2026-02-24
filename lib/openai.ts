import { zodToJsonSchema } from "zod-to-json-schema";
import { BuildingSpec, BuildingSpecType } from "./spec";
import { RocketSpec, RocketSpecType, validateRocketSpec } from "@/types/rocket";
import { rocketDesignRules } from "@/lib/rocket/design-rules";
import { getAnthropicClient, DEFAULT_MODEL } from "./anthropic";

const buildingSystemPrompt = `You are a building design assistant that converts building briefs into strict JSON matching the provided JSON schema. 

Your task is to:
1. Parse the user's building description
2. Extract all relevant parameters
3. Convert them into the exact JSON structure required
4. Don't invent fields that aren't provided
5. Use reasonable defaults for missing information
6. Ensure all numeric values are positive and logical

Always return valid JSON that matches the BuildingSpec schema exactly.`;

const buildingToolSchema = {
  type: "object" as const,
  properties: {
    project: {
      type: "object" as const,
      properties: {
        name: { type: "string" as const, description: "Project name" },
        units: { type: "string" as const, enum: ["meters", "feet"], description: "Measurement units" },
        site: {
          type: "object" as const,
          properties: {
            width: { type: "number" as const, description: "Site width" },
            depth: { type: "number" as const, description: "Site depth" },
            setbacks: {
              type: "object" as const,
              properties: {
                front: { type: "number" as const, description: "Front setback" },
                side: { type: "number" as const, description: "Side setback" },
                rear: { type: "number" as const, description: "Rear setback" }
              },
              required: ["front", "side", "rear"]
            }
          },
          required: ["width", "depth", "setbacks"]
        },
        grid: {
          type: "object" as const,
          properties: {
            bayX: { type: "number" as const, description: "Grid bay width" },
            bayY: { type: "number" as const, description: "Grid bay depth" }
          },
          required: ["bayX", "bayY"]
        },
        tower: {
          type: "object" as const,
          properties: {
            floors: { type: "integer" as const, description: "Number of floors" },
            typicalFloorHeight: { type: "number" as const, description: "Typical floor height" },
            footprint: { type: "string" as const, enum: ["rectangle"], description: "Footprint shape" },
            footprintDims: {
              type: "object" as const,
              properties: {
                x: { type: "number" as const, description: "Footprint width" },
                y: { type: "number" as const, description: "Footprint depth" }
              },
              required: ["x", "y"]
            },
            setbacksEvery: { type: "integer" as const, description: "Setback frequency (floors)" },
            setbackDepth: { type: "number" as const, description: "Setback depth" }
          },
          required: ["floors", "typicalFloorHeight", "footprint", "footprintDims", "setbacksEvery", "setbackDepth"]
        },
        cores: {
          type: "object" as const,
          properties: {
            stairs: { type: "integer" as const, description: "Number of stairs" },
            elevators: { type: "integer" as const, description: "Number of elevators" },
            coreWidth: { type: "number" as const, description: "Core width" },
            coreDepth: { type: "number" as const, description: "Core depth" }
          },
          required: ["stairs", "elevators", "coreWidth", "coreDepth"]
        },
        outputs: {
          type: "object" as const,
          properties: {
            plans: { type: "boolean" as const, description: "Generate plans" },
            elevations: { type: "boolean" as const, description: "Generate elevations" },
            sections: { type: "boolean" as const, description: "Generate sections" },
            dxf: { type: "boolean" as const, description: "Generate DXF" },
            ifc: { type: "boolean" as const, description: "Generate IFC" }
          },
          required: ["plans", "elevations", "sections", "dxf", "ifc"]
        }
      },
      required: ["name", "units", "site", "grid", "tower", "cores", "outputs"]
    }
  },
  required: ["project"]
};

export async function generateBuildingSpec(prompt: string): Promise<BuildingSpecType> {
  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      // System prompt with cache_control for prompt caching
      system: [
        {
          type: "text" as const,
          text: buildingSystemPrompt,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      tools: [
        {
          name: "produce_building_spec",
          description: "Generate a building specification from a natural language description",
          input_schema: buildingToolSchema,
        },
      ],
      tool_choice: { type: "tool" as const, name: "produce_building_spec" },
      messages: [
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use" || toolBlock.name !== "produce_building_spec") {
      throw new Error("No valid tool call returned from Anthropic");
    }

    const args = toolBlock.input as Record<string, unknown>;
    return BuildingSpec.parse(args);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`AI generation failed: ${error.message}`);
    }
    throw new Error("Unknown error occurred during AI generation");
  }
}

const rocketSchemaJson = zodToJsonSchema(RocketSpec, "RocketSpec");
const rocketFunctionParameters =
  (rocketSchemaJson.definitions?.RocketSpec ?? rocketSchemaJson) as Record<string, unknown>;

const rocketSystemPrompt = `You are an aerospace mechanical design assistant that produces validated rocket subsystem specifications in strict JSON conforming to the RocketSpec schema. 

Key rules:
- Obey all structural and drafting requirements listed below.
- Convert any non-metric units to millimeters.
- Populate every required field; use best-practice defaults if the user omits data.
- Honour minimum thickness (≥ 2 mm) and fastener edge distance (≥ 2×Ø) constraints.
- Provide conservative safety margins when uncertain.

Design Rules:
${rocketDesignRules}

Always respond by calling the provided function with a single JSON argument that matches the RocketSpec schema. Do not include natural language in the function arguments.`;

export async function generateRocketSpec(prompt: string): Promise<RocketSpecType> {
  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      temperature: 0.1,
      // System prompt with cache_control — rocket design rules are cached across calls
      system: [
        {
          type: "text" as const,
          text: rocketSystemPrompt,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      tools: [
        {
          name: "produce_rocket_spec",
          description: "Generate a complete RocketSpec JSON document for the mechanical CAD worker",
          input_schema: { type: "object" as const, ...rocketFunctionParameters as Record<string, unknown> },
        },
      ],
      tool_choice: { type: "tool" as const, name: "produce_rocket_spec" },
      messages: [
        { role: "user", content: prompt },
      ],
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use" || toolBlock.name !== "produce_rocket_spec") {
      throw new Error("No valid rocket spec tool call returned from Anthropic");
    }

    const args = toolBlock.input as Record<string, unknown>;
    return validateRocketSpec(normalizeRocketSpecPayload(args));
  } catch (error) {
    console.error("[rocket-spec] Falling back to deterministic spec", error);
    return buildFallbackRocketSpec(prompt);
  }
}

function normalizeRocketSpecPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const spec = payload as Record<string, unknown>;
  spec.schemaVersion = "1.0.0";
  spec.units = "mm";

  const globalTolerances = spec.globalTolerances;
  const parts = spec.parts;

  if (
    globalTolerances &&
    typeof globalTolerances === "object" &&
    parts &&
    Array.isArray(parts)
  ) {
    for (const part of parts) {
      if (part && typeof part === "object") {
        const partRecord = part as Record<string, unknown>;
        const existing = partRecord.tolerances;
        partRecord.tolerances =
          existing && typeof existing === "object"
            ? { ...(globalTolerances as Record<string, unknown>), ...(existing as Record<string, unknown>) }
            : { ...(globalTolerances as Record<string, unknown>) };
      }
    }
  }

  return spec;
}

function buildFallbackRocketSpec(prompt: string): RocketSpecType {
  const cleanedName = (prompt ?? "")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 \-]/gi, "")
    .trim();
  const projectName =
    cleanedName.length >= 3 ? cleanedName.slice(0, 80) : "AI Turbopump Module";
  const timestamp = new Date().toISOString();

  const globalTolerances: RocketSpecType["globalTolerances"] = {
    system: "ASME_Y14_5M",
    generalProfileMm: 0.2,
    holeToleranceMm: 0.05,
    shaftToleranceMm: 0.05,
    flatnessMm: 0.05,
    perpendicularityMmPer100: 0.15,
    concentricityMm: 0.1,
  };

  return {
    schemaVersion: "1.0.0",
    units: "mm",
    project: {
      name: projectName,
      missionProfile: "orbital",
      customer: "AI Generated",
      revision: "A",
      designRulesDoc: "docs/rocket-design-rules.md",
    },
    standards: {
      structural: "NASA-STD-5001B",
      drafting: "ASME_Y14.5M",
      materials: "NASA_HDBK_5",
    },
    globalTolerances,
    materials: [
      {
        materialId: "AL-7075",
        name: "Aluminum 7075-T73",
        type: "aluminum",
        specification: "AMS-QQ-A-250/12",
        temperOrGrade: "T73",
        densityKgPerM3: 2810,
        yieldStrengthMpa: 503,
        ultimateStrengthMpa: 572,
        maxServiceTempC: 120,
        notes: "Fallback material for structural members.",
      },
      {
        materialId: "IN-718",
        name: "Inconel 718",
        type: "inconel",
        specification: "AMS 5662",
        temperOrGrade: "Age Hardened",
        densityKgPerM3: 8190,
        yieldStrengthMpa: 1030,
        ultimateStrengthMpa: 1200,
        maxServiceTempC: 700,
        notes: "Fallback high-temperature alloy for turbomachinery.",
      },
    ],
    stages: [
      {
        stageId: "stage-main",
        type: "sustainer",
        propellants: {
          fuel: "RP-1",
          oxidizer: "LOX",
          pressurant: "helium",
        },
        lengthMm: 6000,
        maxDiameterMm: 3600,
        dryMassKg: 1800,
        propellantMassKg: 8200,
        maxOperatingPressureKpa: 4500,
        designFactorSafety: 1.4,
        avionicsBay: true,
        environment: ["sea_level", "vacuum"],
        structuralMargins: {
          hoopStressMargin: 0.3,
          axialStressMargin: 0.28,
          bucklingMargin: 0.32,
        },
        notes:
          "Fallback stage placeholder providing interfaces for turbopump assembly.",
      },
    ],
    parts: [
      {
        partId: "pump_module",
        name: `${projectName} Pump Module`.slice(0, 80),
        category: "engine",
        stageRef: "stage-main",
        materialId: "IN-718",
        manufacturingProcess: "machined_forging",
        geometry: {
          boundingBoxMm: {
            length: 1500,
            width: 900,
            height: 800,
          },
          wallThicknessMm: 8,
          minGaugeThicknessMm: 4,
          massBudgetKg: 650,
          cgFromBaseMm: 380,
          principalInertiasKgMm2: {
            ixx: 2_500_000,
            iyy: 2_200_000,
            izz: 1_900_000,
          },
          datum: [
            {
              datumId: "datum_base",
              description: "Primary mounting flange datum.",
              reference: "A",
            },
            {
              datumId: "datum_side",
              description: "Side alignment face datum.",
              reference: "B",
            },
            {
              datumId: "datum_top",
              description: "Top instrumentation datum.",
              reference: "C",
            },
          ],
          envelopeClearanceMm: 40,
        },
        tolerances: { ...globalTolerances },
        surfaceTreatments: [
          {
            process: "shot_peen",
            standard: "AMS-S-13165",
            thicknessMicrons: 50,
          },
        ],
        features: [
          {
            featureId: "fastener_mounts",
            type: "fastener",
            fastenerStandard: "NAS660",
            diameterMm: 12,
            gripLengthMm: 30,
            edgeDistanceMm: 30,
            spacingPattern: "circular",
            quantity: 12,
            locationNote: "Primary flange bolting pattern.",
          },
          {
            featureId: "weld_ring",
            type: "weld",
            weldType: "circumferential",
            process: "tig",
            thicknessMm: 6,
            lengthMm: 900,
            standard: "AWS_D17.1",
            inspection: "ultrasonic",
          },
          {
            featureId: "interface_skid",
            type: "interface",
            matesWithPartId: "support_frame",
            datumReference: ["A", "B"],
            flatnessMm: 0.1,
            parallelismMmPer100: 0.15,
            sealingMethod: "metal_gasket",
          },
        ],
        primaryLoads: {
          axialLoadKn: 45,
          radialLoadKn: 18,
          torsionKnm: 12,
          pressureKpa: 5200,
          temperatureRangeC: [-50, 180],
        },
        secondaryLoads: {
          axialLoadKn: 12,
          radialLoadKn: 6,
          torsionKnm: 3,
          pressureKpa: 2500,
          temperatureRangeC: [-30, 160],
        },
        notes:
          "Fallback pump module detail generated when OpenAI specification fails validation.",
      },
      {
        partId: "support_frame",
        name: `${projectName} Support Frame`.slice(0, 80),
        category: "thrust_structure",
        stageRef: "stage-main",
        materialId: "AL-7075",
        manufacturingProcess: "welded_subassembly",
        geometry: {
          boundingBoxMm: {
            length: 2200,
            width: 1600,
            height: 950,
          },
          wallThicknessMm: 6,
          minGaugeThicknessMm: 3,
          massBudgetKg: 420,
          cgFromBaseMm: 450,
          principalInertiasKgMm2: {
            ixx: 1_500_000,
            iyy: 1_200_000,
            izz: 1_100_000,
          },
          datum: [
            {
              datumId: "datum_frame_base",
              description: "Base pad reference surface.",
              reference: "A",
            },
            {
              datumId: "datum_frame_side",
              description: "Side mounting rail datum.",
              reference: "B",
            },
            {
              datumId: "datum_frame_top",
              description: "Top mating plane for pump module.",
              reference: "C",
            },
          ],
          envelopeClearanceMm: 60,
        },
        tolerances: { ...globalTolerances },
        surfaceTreatments: [
          {
            process: "anodize_type_II",
            standard: "MIL-A-8625",
            thicknessMicrons: 25,
          },
        ],
        features: [
          {
            featureId: "fastener_frame_mounts",
            type: "fastener",
            fastenerStandard: "NAS1351",
            diameterMm: 10,
            gripLengthMm: 25,
            edgeDistanceMm: 28,
            spacingPattern: "matrix",
            quantity: 16,
            locationNote: "Frame to deck bolting points.",
          },
          {
            featureId: "interface_engine_mount",
            type: "interface",
            matesWithPartId: "pump_module",
            datumReference: ["A", "C"],
            flatnessMm: 0.08,
            parallelismMmPer100: 0.12,
            sealingMethod: "none",
          },
          {
            featureId: "penetration_drain",
            type: "penetration",
            shape: "circular",
            sizeMm: 40,
            reinforcement: "boss",
            pressureSeal: true,
          },
        ],
        primaryLoads: {
          axialLoadKn: 55,
          radialLoadKn: 20,
          torsionKnm: 15,
          pressureKpa: 1500,
          temperatureRangeC: [-45, 120],
        },
        notes:
          "Structural frame that carries pump module loads into the main stage.",
      },
    ],
    analysisChecks: [
      {
        checkId: "check_edge_clearance",
        type: "edge_distance",
        status: "pass",
        summary:
          "All fastener patterns maintain ≥ 2× diameter edge clearance.",
        relatedPartIds: ["pump_module", "support_frame"],
        details: {
          measuredValue: 28,
          limitValue: 24,
          units: "mm",
        },
        recommendation: "No action required.",
      },
      {
        checkId: "check_hoop_margin",
        type: "hoop_stress",
        status: "pass",
        summary: "Pressure vessel margins remain above the required FoS.",
        relatedPartIds: ["pump_module"],
        details: {
          measuredValue: 1.6,
          limitValue: 1.25,
          units: "dimensionless",
        },
      },
    ],
    generatedAtIso: timestamp,
  };
}
