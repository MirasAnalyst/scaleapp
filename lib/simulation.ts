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
  mass_composition?: Record<string, number>;
  enthalpy_kj_per_kg?: number;
  entropy_kj_per_kg_k?: number;
  density_kg_per_m3?: number;
  viscosity_cp?: number;
  molecular_weight?: number;
  heat_capacity_kj_per_kg_k?: number;
  // Extended properties
  thermal_conductivity_w_per_mk?: number;
  heat_capacity_cv_kj_per_kg_k?: number;
  compressibility_factor?: number;
  speed_of_sound_m_per_s?: number;
  surface_tension_n_per_m?: number;
  joule_thomson_k_per_kpa?: number;
  isentropic_exponent?: number;
  gibbs_energy_kj_per_kg?: number;
  volume_flow_m3_per_h?: number;
  std_gas_flow_sm3_per_h?: number;
  phase?: string;
  liquid_composition?: Record<string, number>;
  vapor_composition?: Record<string, number>;
}

export interface SimulationUnitResult {
  id: string;
  duty_kw?: number;
  status?: string;
  extra?: Record<string, unknown>;
  pressure_drop_kpa?: number;
  efficiency?: number;
  inlet_streams?: string[];
  outlet_streams?: string[];
}

export interface SimulationResult {
  flowsheet_name: string;
  status: string;
  streams: SimulationStreamResult[];
  units: SimulationUnitResult[];
  warnings?: string[];
  diagnostics?: Record<string, unknown>;
  converged?: boolean;
  iterations?: number;
  mass_balance_error?: number;
  energy_balance_error?: number;
  property_package?: string;
  components?: string[];
}

export function buildSimulationPayload(
  name: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
  components: string[] = [],
  propertyPackage: string = 'Peng-Robinson'
): SimulationPayload {
  // Filter out non-equipment nodes (labels, annotations)
  const equipmentNodes = nodes.filter(
    (n) => n.type && n.type !== 'label' && n.type !== 'annotation'
  );

  const units: SimulationUnitSpec[] = equipmentNodes.map((node) => ({
    id: node.id,
    type: node.type,
    name: node.data?.label ?? node.data?.equipment,
    parameters: node.data?.parameters ?? {},
  }));

  // Build a set of equipment node IDs to filter out label/annotation edges
  const equipmentNodeIds = new Set(equipmentNodes.map((n) => n.id));

  const streams: SimulationStreamSpec[] = edges.map((edge) => {
    const props: Record<string, unknown> = { ...(edge.data ?? {}) };
    // Ensure handle info is in properties for the solver
    if (edge.sourceHandle) props.sourceHandle = edge.sourceHandle;
    if (edge.targetHandle) props.targetHandle = edge.targetHandle;

    // Normalize feed stream property keys so the solver finds them
    // regardless of whether the AI used "temperature" or "temperature_c", etc.
    if (props.temperature != null && props.temperature_c == null) {
      props.temperature_c = props.temperature;
    } else if (props.temperature_c != null && props.temperature == null) {
      props.temperature = props.temperature_c;
    }
    if (props.pressure != null && props.pressure_kpa == null) {
      props.pressure_kpa = props.pressure;
    } else if (props.pressure_kpa != null && props.pressure == null) {
      props.pressure = props.pressure_kpa;
    }
    if (props.flow_rate != null && props.mass_flow_kg_per_h == null) {
      props.mass_flow_kg_per_h = props.flow_rate;
    } else if (props.mass_flow_kg_per_h != null && props.flow_rate == null) {
      props.flow_rate = props.mass_flow_kg_per_h;
    }

    // Nullify source/target that point to label/annotation nodes.
    // If source is a label node, treat as external feed (source = undefined).
    // If target is a label node, treat as product sink (target = undefined).
    const resolvedSource = equipmentNodeIds.has(edge.source) ? edge.source : undefined;
    const resolvedTarget = equipmentNodeIds.has(edge.target) ? edge.target : undefined;

    return {
      id: edge.id,
      name: typeof edge.label === 'string' ? edge.label : undefined,
      source: resolvedSource,
      sourceHandle: edge.sourceHandle ?? undefined,
      target: resolvedTarget,
      targetHandle: edge.targetHandle ?? undefined,
      properties: props,
    };
  });

  return {
    name,
    units,
    streams,
    thermo: {
      package: propertyPackage,
      components,
    },
    metadata: {
      generatedAt: new Date().toISOString(),
    },
  };
}
