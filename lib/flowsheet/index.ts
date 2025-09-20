// Main export file for the JavaScript pyflowsheet equivalent

// Core classes
export { FlowsheetEngine } from './FlowsheetEngine';
export { ProcessSolver } from './ProcessSolver';
export { UnitOperation, Mixer, Splitter, HeatExchanger, Reactor, Separator } from './UnitOperation';
export { Stream } from './Stream';
export { Material } from './Material';

// Types
export type {
  Material as IMaterial,
  Stream as IStream,
  UnitOperationConfig,
  FlowsheetData,
  ProcessResult,
  SolverOptions,
  RenderOptions
} from './types';

// Utility functions
import { FlowsheetEngine } from './FlowsheetEngine';
import { Material } from './Material';
import { Stream } from './Stream';
import type { Material as IMaterial, Stream as IStream } from './types';

export const createFlowsheet = () => new FlowsheetEngine();

export const createMaterial = (data: Partial<IMaterial>) => new Material(data);

export const createStream = (data: Partial<IStream>) => new Stream(data);

// Example usage function
export const createExampleFlowsheet = () => {
  const flowsheet = new FlowsheetEngine();
  flowsheet.createExampleFlowsheet();
  return flowsheet;
};

// Version info
export const VERSION = '1.0.0';
export const DESCRIPTION = 'JavaScript equivalent of pyflowsheet for process flowsheet simulation';
