import { FlowEdge, FlowNode } from '../app/api/flowsheet/route';

export interface SimulationUnitSpec {
  id: string;
  type: string;
  name?: string;
  parameters?: Record<string, unknown>;
}

export interface SimulationStreamSpec {
  id: string;
  name?: string;
  source?: string;
  target?: string;
  sourceHandle?: string;
  targetHandle?: string;
  properties?: Record<string, unknown>;
}

export interface SimulationThermoConfig {
  package: string;
  components: string[];
}

export interface SimulationPayload {
  name: string;
  units: SimulationUnitSpec[];
  streams: SimulationStreamSpec[];
  thermo: SimulationThermoConfig;
  metadata?: Record<string, unknown>;
}

export interface SimulationStreamResult {
  id: string;
  temperature_c?: number;
  pressure_kpa?: number;
  mass_flow_kg_per_h?: number;
  mole_flow_kmol_per_h?: number;
  vapor_fraction?: number;
  liquid_fraction?: number;
  composition?: Record<string, number>;
}

export interface SimulationUnitResult {
  id: string;
  duty_kw?: number;
  status?: string;
  extra?: Record<string, unknown>;
}

export interface SimulationResult {
  flowsheet_name: string;
  status: string;
  streams: SimulationStreamResult[];
  units: SimulationUnitResult[];
  warnings?: string[];
  diagnostics?: Record<string, unknown>;
}

export function buildSimulationPayload(
  name: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
  components: string[] = []
): SimulationPayload {
  const units: SimulationUnitSpec[] = nodes.map((node) => ({
    id: node.id,
    type: node.type,
    name: node.data?.label ?? node.data?.equipment,
    parameters: node.data?.parameters ?? {},
  }));

  const streams: SimulationStreamSpec[] = edges.map((edge) => ({
    id: edge.id,
    name: edge.label,
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle,
    properties: edge.data ?? {},
  }));

  return {
    name,
    units,
    streams,
    thermo: {
      package: 'Peng-Robinson',
      components,
    },
    metadata: {
      generatedAt: new Date().toISOString(),
    },
  };
}
