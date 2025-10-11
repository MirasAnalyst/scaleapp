import { z } from "zod";

// Component types for mechanical systems
export const ComponentType = z.enum([
  "pump",
  "compressor",
  "heat_exchanger",
  "valve",
  "tank",
  "pressure_vessel",
  "turbine",
  "motor",
  "generator",
  "filter",
  "separator",
  "reactor",
  "pipe",
  "instrument"
]);

// Connection types
export const ConnectionType = z.enum([
  "pipe",
  "electrical",
  "control_signal",
  "mechanical"
]);

// Position in 2D layout
const Position2D = z.object({
  x: z.number(),
  y: z.number()
});

// Component specification
const Component = z.object({
  id: z.string().min(1),
  type: ComponentType,
  name: z.string().min(1),
  position: Position2D,
  size: z.object({
    width: z.number().positive(),
    height: z.number().positive()
  }),
  // Optional specifications
  capacity: z.number().positive().optional(),
  flowRate: z.number().positive().optional(),
  pressure: z.number().optional(),
  temperature: z.number().optional(),
  power: z.number().positive().optional(),
  diameter: z.number().positive().optional(),
  length: z.number().positive().optional(),
  material: z.string().optional(),
  specifications: z.string().optional(),
  parameters: z.record(z.string(), z.any()).optional()
});

// Connection between components
const Connection = z.object({
  id: z.string().min(1),
  type: ConnectionType,
  from: z.string().min(1), // Component ID
  to: z.string().min(1),   // Component ID
  // Optional connection specs
  diameter: z.number().positive().optional(),
  material: z.string().optional(),
  flowRate: z.number().optional(),
  pressure: z.number().optional()
});

// System type
export const SystemType = z.enum([
  "pump_station",
  "compressor_station",
  "heat_exchange_system",
  "power_generation",
  "rocket_propulsion",
  "ship_propulsion",
  "hvac_system",
  "process_plant",
  "cooling_system",
  "fuel_system",
  "hydraulic_system"
]);

// Main mechanical system specification
export const MechanicalSystemSpec = z.object({
  project: z.object({
    name: z.string().min(1),
    systemType: SystemType,
    description: z.string().optional(),
    units: z.enum(["metric", "imperial"]),
    revision: z.string().optional(),
    generatedAtIso: z.string().optional()
  }),
  components: z.array(Component).min(1),
  connections: z.array(Connection),
  layout: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    gridSpacing: z.number().positive().default(100)
  }),
  annotations: z.array(z.object({
    text: z.string(),
    position: Position2D
  })).optional()
});

export type MechanicalSystemSpecType = z.infer<typeof MechanicalSystemSpec>;
export type ComponentType = z.infer<typeof Component>;
export type ConnectionType = z.infer<typeof Connection>;

