// TypeScript types for the JavaScript pyflowsheet equivalent

export interface Material {
  name: string;
  molecularWeight: number;
  density: number;
  viscosity: number;
  heatCapacity: number;
  thermalConductivity: number;
  criticalTemperature: number;
  criticalPressure: number;
  acentricFactor: number;
}

export interface Stream {
  id: string;
  name: string;
  temperature: number; // K
  pressure: number; // Pa
  flowRate: number; // kg/s
  composition: { [material: string]: number }; // mass fractions
  phase: 'liquid' | 'vapor' | 'solid' | 'mixed';
  enthalpy: number; // J/kg
  entropy: number; // J/kg·K
}

export interface UnitOperationConfig {
  id: string;
  name: string;
  type: string;
  position: { x: number; y: number };
  parameters: { [key: string]: any };
  inputs: string[];
  outputs: string[];
}

export interface FlowsheetData {
  streams: { [id: string]: Stream };
  units: { [id: string]: UnitOperationConfig };
  connections: { from: string; to: string; stream: string }[];
  materials: { [name: string]: Material };
}

export interface ProcessResult {
  converged: boolean;
  iterations: number;
  residuals: number[];
  streams: { [id: string]: Stream };
  units: { [id: string]: any };
  warnings: string[];
  errors: string[];
}

export interface SolverOptions {
  maxIterations: number;
  tolerance: number;
  method: 'newton' | 'secant' | 'broyden';
  damping: number;
  stepSize: number;
}

export interface RenderOptions {
  width: number;
  height: number;
  showStreams: boolean;
  showLabels: boolean;
  showValues: boolean;
  theme: 'light' | 'dark';
  format: 'svg' | 'png' | 'pdf';
}
