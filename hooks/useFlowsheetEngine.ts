// React hook for integrating FlowsheetEngine with React components
import { useState, useCallback, useRef, useEffect } from 'react';
import { FlowsheetEngine, ProcessResult, SolverOptions } from '../lib/flowsheet';

export interface UseFlowsheetEngineReturn {
  // Engine state
  engine: FlowsheetEngine;
  isSolving: boolean;
  lastResult: ProcessResult | null;
  
  // Engine methods
  createFlowsheet: (name: string) => void;
  addMixer: (id: string, name: string, position: { x: number; y: number }) => void;
  addSplitter: (id: string, name: string, position: { x: number; y: number }, splitFractions?: number[]) => void;
  addHeatExchanger: (id: string, name: string, position: { x: number; y: number }, heatDuty?: number) => void;
  addReactor: (id: string, name: string, position: { x: number; y: number }, conversion?: number) => void;
  addSeparator: (id: string, name: string, position: { x: number; y: number }, separationEfficiency?: number) => void;
  addStream: (id: string, name: string, streamData: any) => void;
  connectUnits: (fromUnit: string, fromPort: string, toUnit: string, toPort: string, stream: any) => void;
  solve: (options?: Partial<SolverOptions>) => Promise<ProcessResult>;
  clear: () => void;
  
  // Data access
  getFlowsheetData: () => any;
  getSummary: () => string;
  exportForVisualization: () => any;
  validateFlowsheet: () => { valid: boolean; errors: string[]; warnings: string[] };
  
  // Example flowsheet
  createExampleFlowsheet: () => void;
}

export const useFlowsheetEngine = (): UseFlowsheetEngineReturn => {
  const engineRef = useRef<FlowsheetEngine>(new FlowsheetEngine());
  const [isSolving, setIsSolving] = useState(false);
  const [lastResult, setLastResult] = useState<ProcessResult | null>(null);

  const engine = engineRef.current;

  // Create flowsheet
  const createFlowsheet = useCallback((name: string) => {
    engine.createFlowsheet(name);
  }, [engine]);

  // Add unit operations
  const addMixer = useCallback((id: string, name: string, position: { x: number; y: number }) => {
    return engine.addMixer(id, name, position);
  }, [engine]);

  const addSplitter = useCallback((id: string, name: string, position: { x: number; y: number }, splitFractions?: number[]) => {
    return engine.addSplitter(id, name, position, splitFractions);
  }, [engine]);

  const addHeatExchanger = useCallback((id: string, name: string, position: { x: number; y: number }, heatDuty?: number) => {
    return engine.addHeatExchanger(id, name, position, heatDuty);
  }, [engine]);

  const addReactor = useCallback((id: string, name: string, position: { x: number; y: number }, conversion?: number) => {
    return engine.addReactor(id, name, position, conversion);
  }, [engine]);

  const addSeparator = useCallback((id: string, name: string, position: { x: number; y: number }, separationEfficiency?: number) => {
    return engine.addSeparator(id, name, position, separationEfficiency);
  }, [engine]);

  // Add stream
  const addStream = useCallback((id: string, name: string, streamData: any) => {
    return engine.addStream(id, name, streamData);
  }, [engine]);

  // Connect units
  const connectUnits = useCallback((fromUnit: string, fromPort: string, toUnit: string, toPort: string, stream: any) => {
    engine.connectUnits(fromUnit, fromPort, toUnit, toPort, stream);
  }, [engine]);

  // Solve flowsheet
  const solve = useCallback(async (options?: Partial<SolverOptions>): Promise<ProcessResult> => {
    setIsSolving(true);
    try {
      const result = engine.solve(options);
      setLastResult(result);
      return result;
    } finally {
      setIsSolving(false);
    }
  }, [engine]);

  // Clear flowsheet
  const clear = useCallback(() => {
    engine.clear();
    setLastResult(null);
  }, [engine]);

  // Get flowsheet data
  const getFlowsheetData = useCallback(() => {
    return engine.getFlowsheetData();
  }, [engine]);

  // Get summary
  const getSummary = useCallback(() => {
    return engine.getSummary();
  }, [engine]);

  // Export for visualization
  const exportForVisualization = useCallback(() => {
    return engine.exportForVisualization();
  }, [engine]);

  // Validate flowsheet
  const validateFlowsheet = useCallback(() => {
    return engine.validateFlowsheet();
  }, [engine]);

  // Create example flowsheet
  const createExampleFlowsheet = useCallback(() => {
    engine.createExampleFlowsheet();
  }, [engine]);

  return {
    // Engine state
    engine,
    isSolving,
    lastResult,
    
    // Engine methods
    createFlowsheet,
    addMixer,
    addSplitter,
    addHeatExchanger,
    addReactor,
    addSeparator,
    addStream,
    connectUnits,
    solve,
    clear,
    
    // Data access
    getFlowsheetData,
    getSummary,
    exportForVisualization,
    validateFlowsheet,
    
    // Example flowsheet
    createExampleFlowsheet
  };
};
