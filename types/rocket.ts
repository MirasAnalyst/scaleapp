import { z } from "zod";

const mmDimension = (field: string, opts?: { min?: number; max?: number }) => {
  const minVal = opts?.min ?? 0;
  const maxVal = opts?.max ?? 200_000;
  return z
    .number({
      invalid_type_error: `${field} must be a number expressed in millimeters`,
      required_error: `${field} is required`,
    })
    .finite(`${field} must be a finite number`)
    .nonnegative(`${field} cannot be negative`)
    .min(minVal, `${field} must be at least ${minVal} mm`)
    .max(maxVal, `${field} must be less than ${maxVal} mm`);
};

const materialIdRegex = /^[A-Z0-9_\-]{3,32}$/;
const identifierRegex = /^[a-z0-9][a-z0-9_\-]{2,48}$/;

const MaterialSchema = z.object({
  materialId: z
    .string()
    .regex(materialIdRegex, "materialId must be 3-32 characters (A-Z, 0-9, underscore, hyphen)"),
  name: z.string().min(3).max(80),
  type: z.enum([
    "aluminum",
    "titanium",
    "stainless_steel",
    "maraging_steel",
    "inconel",
    "composite",
    "carbon_carbon",
    "elastomer",
    "ceramic",
    "other",
  ]),
  specification: z
    .string()
    .min(2, "specification must reference an aerospace or ASTM standard (e.g. AMS-QQ-A-250/4)"),
  temperOrGrade: z.string().min(1).max(40),
  densityKgPerM3: z.number().min(500).max(20_000),
  yieldStrengthMpa: z.number().min(150).max(2_500),
  ultimateStrengthMpa: z.number().min(200).max(3_000),
  maxServiceTempC: z.number().min(-200).max(1_000),
  notes: z.string().max(500).optional(),
});

const DatumSchema = z.object({
  datumId: z.string().regex(identifierRegex, "datumId must be lowercase and 3-49 characters"),
  description: z.string().min(3).max(200),
  reference: z.enum(["A", "B", "C", "D"]).default("A"),
});

const ToleranceSchema = z.object({
  system: z.enum(["ISO_2768_mK", "ASME_Y14_5M", "ISO_1101"]),
  generalProfileMm: z.number().min(0.05).max(1.0),
  holeToleranceMm: z.number().min(0.01).max(0.5),
  shaftToleranceMm: z.number().min(0.01).max(0.5),
  flatnessMm: z.number().min(0.01).max(0.5),
  perpendicularityMmPer100: z.number().min(0.02).max(0.8),
  concentricityMm: z.number().min(0.02).max(0.6),
});

const SurfaceTreatmentSchema = z.object({
  process: z.enum([
    "anodize_type_II",
    "anodize_type_III",
    "conversion_coating",
    "passivation",
    "shot_peen",
    "thermal_barrier_coating",
    "primer_paint",
    "none",
  ]),
  standard: z.string().min(2).max(100),
  thicknessMicrons: z.number().min(5).max(500),
});

const FASTENER_EDGE_DISTANCE_MESSAGE = "Edge distance must be ≥ 2× fastener diameter";

const FastenerFeatureBaseSchema = z.object({
  featureId: z.string().regex(identifierRegex),
  type: z.literal("fastener"),
  fastenerStandard: z.enum([
    "NAS1351",
    "MS24694",
      "NAS1149",
      "NAS660",
      "NAS1101",
      "NAS1193",
      "custom",
  ]),
  diameterMm: mmDimension("fastener diameter", { min: 1, max: 50 }),
  gripLengthMm: mmDimension("fastener grip length", { min: 1 }),
  edgeDistanceMm: mmDimension("fastener edge distance", { min: 2 }),
  spacingPattern: z.enum(["single", "double", "circular", "matrix"]),
  quantity: z.number().int().min(1).max(500),
  locationNote: z.string().min(3).max(200),
});

const FastenerFeatureSchema = FastenerFeatureBaseSchema.superRefine((feature, ctx) => {
  if (feature.edgeDistanceMm < 2 * feature.diameterMm) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["edgeDistanceMm"],
      message: FASTENER_EDGE_DISTANCE_MESSAGE,
    });
  }
});

const WeldFeatureSchema = z.object({
  featureId: z.string().regex(identifierRegex),
  type: z.literal("weld"),
  weldType: z.enum(["butt", "lap", "fillet", "t_joint", "circumferential"]),
  process: z.enum(["tig", "mig", "friction_stir", "laser", "electron_beam"]),
  thicknessMm: mmDimension("weld thickness", { min: 1 }),
  lengthMm: mmDimension("weld length", { min: 5 }),
  standard: z.enum(["AWS_D17.1", "AWS_D1.2", "ISO_13919"]),
  inspection: z.enum(["visual", "radiographic", "ultrasonic", "dye_penetrant"]),
});

const InterfaceFeatureSchema = z.object({
  featureId: z.string().regex(identifierRegex),
  type: z.literal("interface"),
  matesWithPartId: z.string().regex(identifierRegex),
  datumReference: z.array(z.enum(["A", "B", "C", "D"])).min(1),
  flatnessMm: z.number().min(0.01).max(0.5),
  parallelismMmPer100: z.number().min(0.02).max(0.6),
  sealingMethod: z.enum(["metal_gasket", "o_ring", "bondline", "none"]),
});

const FeatureSchema = z
  .discriminatedUnion("type", [
    FastenerFeatureBaseSchema,
    WeldFeatureSchema,
    InterfaceFeatureSchema,
    z.object({
      featureId: z.string().regex(identifierRegex),
      type: z.literal("penetration"),
      shape: z.enum(["circular", "oval", "rectangular"]),
      sizeMm: mmDimension("penetration size", { min: 5 }),
      reinforcement: z.enum(["doubler", "boss", "none"]),
      pressureSeal: z.boolean(),
    }),
  ])
  .superRefine((feature, ctx) => {
    if (feature.type === "fastener" && feature.edgeDistanceMm < 2 * feature.diameterMm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["edgeDistanceMm"],
        message: FASTENER_EDGE_DISTANCE_MESSAGE,
      });
    }
  });

const GeometrySchema = z
  .object({
    boundingBoxMm: z.object({
      length: mmDimension("bounding box length", { min: 10, max: 200_000 }),
      width: mmDimension("bounding box width", { min: 10, max: 200_000 }),
      height: mmDimension("bounding box height", { min: 10, max: 200_000 }),
    }),
    wallThicknessMm: mmDimension("wall thickness", { min: 1, max: 120 }),
    minGaugeThicknessMm: mmDimension("minimum gauge thickness", { min: 1, max: 50 }),
    massBudgetKg: z.number().min(0.05).max(40_000),
    cgFromBaseMm: mmDimension("cgFromBase", { min: 0 }),
    principalInertiasKgMm2: z.object({
      ixx: z.number().min(0),
      iyy: z.number().min(0),
      izz: z.number().min(0),
    }),
    datum: z.array(DatumSchema).min(1),
    envelopeClearanceMm: mmDimension("envelope clearance", { min: 5 }),
  })
  .superRefine((geometry, ctx) => {
    if (geometry.wallThicknessMm < geometry.minGaugeThicknessMm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["wallThicknessMm"],
        message: "wallThicknessMm must be ≥ minGaugeThicknessMm",
      });
    }
    if (geometry.wallThicknessMm < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["wallThicknessMm"],
        message: "Minimum structural thickness must be ≥ 2 mm",
      });
    }
  });

const LoadsSchema = z.object({
  axialLoadKn: z.number().min(0),
  radialLoadKn: z.number().min(0),
  torsionKnm: z.number().min(0),
  pressureKpa: z.number().min(0),
  temperatureRangeC: z
    .array(z.number())
    .min(2, "temperature range must include [min, max]")
    .max(2, "temperature range must include [min, max]")
    .superRefine((range, ctx) => {
      if (range.length === 2) {
        const [min, max] = range;
        if (!(min < max)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "temperature range must be ordered [min, max]",
          });
        }
      }
    }),
});

const PartSchema = z
  .object({
    partId: z.string().regex(identifierRegex),
    name: z.string().min(3).max(100),
    category: z.enum([
      "tank",
      "bulkhead",
      "valve",
      "feedline",
      "thrust_structure",
      "avionics_deck",
      "interstage",
      "fairing",
      "engine",
      "pressurant_bottle",
      "other",
    ]),
    stageRef: z.string().regex(identifierRegex),
    materialId: z.string().regex(materialIdRegex),
    manufacturingProcess: z.enum([
      "additive",
      "machined_forging",
      "spun_forming",
      "filament_wound",
      "sheet_metal",
      "composite_layup",
      "welded_subassembly",
      "other",
    ]),
    geometry: GeometrySchema,
    tolerances: ToleranceSchema,
    surfaceTreatments: z.array(SurfaceTreatmentSchema).min(0).max(5),
    features: z.array(FeatureSchema).max(50),
    primaryLoads: LoadsSchema,
    secondaryLoads: LoadsSchema.optional(),
    notes: z.string().max(500).optional(),
  })
  .superRefine((part, ctx) => {
    const fastenerFeatures = part.features.filter(
      (feature): feature is z.infer<typeof FastenerFeatureSchema> & { type: "fastener" } =>
        feature.type === "fastener",
    );
    for (const fastener of fastenerFeatures) {
      if (fastener.edgeDistanceMm < 2 * fastener.diameterMm) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["features", fastener.featureId, "edgeDistanceMm"],
          message: FASTENER_EDGE_DISTANCE_MESSAGE,
        });
      }
    }
    if (part.geometry.wallThicknessMm < part.geometry.minGaugeThicknessMm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["geometry", "wallThicknessMm"],
        message: "wallThicknessMm must be ≥ minGaugeThicknessMm",
      });
    }
  });

const StageSchema = z.object({
  stageId: z.string().regex(identifierRegex),
  type: z.enum(["booster", "sustainer", "upper", "payload_fairing"]),
  propellants: z.object({
    fuel: z.enum(["RP-1", "LH2", "CH4", "UDMH", "HTPB", "other"]),
    oxidizer: z.enum(["LOX", "N2O", "N2O4", "H2O2", "other"]),
    pressurant: z.enum(["helium", "nitrogen", "hydrazine", "autogenous"]),
  }),
  lengthMm: mmDimension("stage length", { min: 2_000, max: 70_000 }),
  maxDiameterMm: mmDimension("stage diameter", { min: 500, max: 12_000 }),
  dryMassKg: z.number().min(100).max(200_000),
  propellantMassKg: z.number().min(500).max(800_000),
  maxOperatingPressureKpa: z.number().min(100).max(10_000),
  designFactorSafety: z.number().min(1.25).max(2.5),
  avionicsBay: z.boolean(),
  environment: z.array(z.enum(["sea_level", "vacuum", "reentry"])).min(1),
  structuralMargins: z.object({
    hoopStressMargin: z.number().min(0.05).max(1.0),
    axialStressMargin: z.number().min(0.05).max(1.0),
    bucklingMargin: z.number().min(0.05).max(1.0),
  }),
  notes: z.string().max(500).optional(),
});

const AnalysisCheckSchema = z.object({
  checkId: z.string().regex(identifierRegex),
  type: z.enum([
    "interference",
    "min_thickness",
    "edge_distance",
    "hoop_stress",
    "cg_margin",
    "clearance",
    "pressure",
  ]),
  status: z.enum(["pass", "fail", "warning"]),
  summary: z.string().min(5).max(300),
  relatedPartIds: z.array(z.string().regex(identifierRegex)).min(0),
  details: z
    .object({
      measuredValue: z.number().optional(),
      limitValue: z.number().optional(),
      units: z.enum(["mm", "mm^2", "kPa", "kg", "dimensionless"]).optional(),
    })
    .optional(),
  recommendation: z.string().max(300).optional(),
});

export const RocketSpec = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    units: z.literal("mm"),
    project: z.object({
      name: z.string().min(3).max(120),
      missionProfile: z.enum(["orbital", "suborbital", "point_to_point", "test_article"]),
      customer: z.string().min(2).max(120),
      revision: z.string().min(1).max(20),
      designRulesDoc: z.string().min(3).max(200),
    }),
    standards: z.object({
      structural: z.enum(["NASA-STD-5001B", "MIL-STD-1530D", "ECSS-E-ST-32-10C"]),
      drafting: z.enum(["ASME_Y14.100", "ASME_Y14.5M", "ISO_5457"]),
      materials: z.enum(["NASA_HDBK_5", "MMPDS", "CMH-17"]),
    }),
    globalTolerances: ToleranceSchema,
    materials: z.array(MaterialSchema).min(1).max(100),
    stages: z.array(StageSchema).min(1).max(5),
    parts: z.array(PartSchema).min(1).max(500),
    analysisChecks: z.array(AnalysisCheckSchema).min(1),
    generatedAtIso: z.string().datetime(),
  })
  .superRefine((spec, ctx) => {
    const stageIds = new Set(spec.stages.map((stage) => stage.stageId));
    for (const part of spec.parts) {
      if (!stageIds.has(part.stageRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["parts", part.partId, "stageRef"],
          message: `stageRef "${part.stageRef}" must reference an existing stageId`,
        });
      }
      const materialExists = spec.materials.some(
        (material) => material.materialId === part.materialId,
      );
      if (!materialExists) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["parts", part.partId, "materialId"],
          message: `materialId "${part.materialId}" must reference a defined material`,
        });
      }
    }
  });

export type RocketSpecType = z.infer<typeof RocketSpec>;

export function validateRocketSpec(input: unknown): RocketSpecType {
  try {
    return RocketSpec.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.errors
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; ");
      throw new Error(`Rocket spec validation failed: ${message}`);
    }
    throw error;
  }
}
