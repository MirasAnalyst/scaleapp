import { z } from "zod";

export const BuildingSpec = z.object({
  project: z.object({
    name: z.string().min(1),
    units: z.enum(["meters", "feet"]),
    site: z.object({
      width: z.number().positive(),
      depth: z.number().positive(),
      setbacks: z.object({
        front: z.number().min(0),
        side: z.number().min(0),
        rear: z.number().min(0),
      }),
    }),
    grid: z.object({
      bayX: z.number().positive(),
      bayY: z.number().positive(),
    }),
    tower: z.object({
      floors: z.number().int().positive(),
      typicalFloorHeight: z.number().positive(),
      footprint: z.enum(["rectangle"]),
      footprintDims: z.object({ 
        x: z.number().positive(), 
        y: z.number().positive() 
      }),
      setbacksEvery: z.number().int().min(0),
      setbackDepth: z.number().min(0),
    }),
    cores: z.object({
      stairs: z.number().int().min(2),
      elevators: z.number().int().min(2),
      coreWidth: z.number().positive(),
      coreDepth: z.number().positive(),
    }),
    outputs: z.object({
      plans: z.boolean(),
      elevations: z.boolean(),
      sections: z.boolean(),
      dxf: z.boolean(),
      ifc: z.boolean(),
    }),
  }),
});

export type BuildingSpecType = z.infer<typeof BuildingSpec>;

// Helper function to validate and parse building spec
export function validateBuildingSpec(data: unknown): BuildingSpecType {
  try {
    return BuildingSpec.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation failed: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
    }
    throw error;
  }
}
