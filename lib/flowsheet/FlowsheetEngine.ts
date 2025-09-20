// Main FlowsheetEngine class - JavaScript equivalent of pyflowsheet
import { FlowsheetData, ProcessResult, SolverOptions, RenderOptions } from './types';
import { ProcessSolver } from './ProcessSolver';
import { UnitOperation, Mixer, Splitter, HeatExchanger, Reactor, Separator } from './UnitOperation';
import { Stream } from './Stream';
import { Material } from './Material';

export class FlowsheetEngine {
  private solver: ProcessSolver;
  private flowsheetData: FlowsheetData;

  constructor() {
    this.solver = new ProcessSolver();
    this.flowsheetData = {
      streams: {},
      units: {},
      connections: [],
      materials: {}
    };
  }

  // Create a new flowsheet
  createFlowsheet(name: string): void {
    console.log(`Creating flowsheet: ${name}`);
    this.solver.clear();
    this.flowsheetData = {
      streams: {},
      units: {},
      connections: [],
      materials: {}
    };
  }

  // Add unit operations
  addMixer(id: string, name: string, position: { x: number; y: number }): UnitOperation {
    const mixer = new Mixer(id, name, position);
    this.solver.addUnit(mixer);
    this.flowsheetData.units[id] = {
      id,
      name,
      type: 'mixer',
      position,
      parameters: {},
      inputs: ['in1', 'in2', 'in3'],
      outputs: ['out']
    };
    return mixer;
  }

  addSplitter(id: string, name: string, position: { x: number; y: number }, splitFractions: number[] = [0.5, 0.5]): UnitOperation {
    const splitter = new Splitter(id, name, position, splitFractions);
    this.solver.addUnit(splitter);
    this.flowsheetData.units[id] = {
      id,
      name,
      type: 'splitter',
      position,
      parameters: { splitFractions },
      inputs: ['in'],
      outputs: ['out1', 'out2', 'out3']
    };
    return splitter;
  }

  addHeatExchanger(id: string, name: string, position: { x: number; y: number }, heatDuty: number = 0): UnitOperation {
    const heatExchanger = new HeatExchanger(id, name, position, heatDuty);
    this.solver.addUnit(heatExchanger);
    this.flowsheetData.units[id] = {
      id,
      name,
      type: 'heat_exchanger',
      position,
      parameters: { heatDuty, efficiency: 0.95 },
      inputs: ['hot_in', 'cold_in'],
      outputs: ['hot_out', 'cold_out']
    };
    return heatExchanger;
  }

  addReactor(id: string, name: string, position: { x: number; y: number }, conversion: number = 0.8): UnitOperation {
    const reactor = new Reactor(id, name, position, conversion);
    this.solver.addUnit(reactor);
    this.flowsheetData.units[id] = {
      id,
      name,
      type: 'reactor',
      position,
      parameters: { conversion, residenceTime: 3600, temperature: 500 },
      inputs: ['in'],
      outputs: ['out']
    };
    return reactor;
  }

  addSeparator(id: string, name: string, position: { x: number; y: number }, separationEfficiency: number = 0.95): UnitOperation {
    const separator = new Separator(id, name, position, separationEfficiency);
    this.solver.addUnit(separator);
    this.flowsheetData.units[id] = {
      id,
      name,
      type: 'separator',
      position,
      parameters: { separationEfficiency, temperature: 298, pressure: 101325 },
      inputs: ['in'],
      outputs: ['liquid_out', 'vapor_out']
    };
    return separator;
  }

  // Add streams
  addStream(id: string, name: string, streamData: Partial<Stream>): Stream {
    const stream = new Stream({
      id,
      name,
      temperature: streamData.temperature || 298.15,
      pressure: streamData.pressure || 101325,
      flowRate: streamData.flowRate || 0,
      composition: streamData.composition || {},
      phase: streamData.phase || 'liquid',
      enthalpy: streamData.enthalpy || 0,
      entropy: streamData.entropy || 0
    });

    this.solver.addStream(stream);
    this.flowsheetData.streams[id] = {
      id: stream.id,
      name: stream.name,
      temperature: stream.temperature,
      pressure: stream.pressure,
      flowRate: stream.flowRate,
      composition: stream.composition,
      phase: stream.phase,
      enthalpy: stream.enthalpy,
      entropy: stream.entropy
    };

    return stream;
  }

  // Connect units
  connectUnits(fromUnit: string, fromPort: string, toUnit: string, toPort: string, stream: Stream): void {
    this.solver.connectUnits(fromUnit, fromPort, toUnit, toPort, stream);
    this.flowsheetData.connections.push({ from: fromUnit, to: toUnit, stream: stream.id });
  }

  // Solve the flowsheet
  solve(options: Partial<SolverOptions> = {}): ProcessResult {
    console.log('Solving flowsheet...');
    const result = this.solver.solve(options);
    
    if (result.converged) {
      console.log(`Solution converged after ${result.iterations} iterations`);
    } else {
      console.warn(`Solution did not converge after ${result.iterations} iterations`);
    }

    if (result.warnings.length > 0) {
      console.warn('Warnings:', result.warnings);
    }

    if (result.errors.length > 0) {
      console.error('Errors:', result.errors);
    }

    return result;
  }

  // Get flowsheet data
  getFlowsheetData(): FlowsheetData {
    return { ...this.flowsheetData };
  }

  // Get solver summary
  getSummary(): string {
    return this.solver.getSummary();
  }

  // Export flowsheet for visualization
  exportForVisualization(): any {
    const data = this.getFlowsheetData();
    return {
      nodes: Object.values(data.units).map(unit => ({
        id: unit.id,
        type: unit.type,
        position: unit.position,
        data: {
          label: unit.name,
          type: unit.type,
          parameters: unit.parameters
        }
      })),
      edges: data.connections.map(conn => ({
        id: `${conn.from}-${conn.to}`,
        source: conn.from,
        target: conn.to,
        data: {
          stream: conn.stream
        }
      })),
      streams: data.streams,
      materials: data.materials
    };
  }

  // Create example flowsheet
  createExampleFlowsheet(): void {
    console.log('Creating example flowsheet...');
    
    // Create materials
    const water = Material.createWater();
    const ethanol = Material.createEthanol();
    
    // Create streams
    const feed1 = this.addStream('feed1', 'Water Feed', {
      temperature: 298,
      pressure: 101325,
      flowRate: 10,
      composition: { 'Water': 1.0 }
    });

    const feed2 = this.addStream('feed2', 'Ethanol Feed', {
      temperature: 298,
      pressure: 101325,
      flowRate: 5,
      composition: { 'Ethanol': 1.0 }
    });

    // Create units
    const mixer = this.addMixer('mixer1', 'Feed Mixer', { x: 100, y: 100 });
    const reactor = this.addReactor('reactor1', 'Ethanol Reactor', { x: 300, y: 100 }, 0.8);
    const separator = this.addSeparator('separator1', 'Product Separator', { x: 500, y: 100 }, 0.9);

    // Connect units
    this.connectUnits('mixer1', 'out', 'reactor1', 'in', feed1);
    this.connectUnits('reactor1', 'out', 'separator1', 'in', feed2);

    console.log('Example flowsheet created successfully');
  }

  // Validate flowsheet
  validateFlowsheet(): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for units without connections
    for (const [unitId, unit] of Object.entries(this.flowsheetData.units)) {
      const hasInputs = this.flowsheetData.connections.some(conn => conn.to === unitId);
      const hasOutputs = this.flowsheetData.connections.some(conn => conn.from === unitId);
      
      if (!hasInputs && unit.type !== 'feed') {
        warnings.push(`Unit ${unitId} has no input connections`);
      }
      if (!hasOutputs && unit.type !== 'product') {
        warnings.push(`Unit ${unitId} has no output connections`);
      }
    }

    // Check for streams without connections
    for (const streamId of Object.keys(this.flowsheetData.streams)) {
      const isConnected = this.flowsheetData.connections.some(conn => conn.stream === streamId);
      if (!isConnected) {
        warnings.push(`Stream ${streamId} is not connected to any units`);
      }
    }

    // Check for circular dependencies
    try {
      // This would be implemented in the solver's topological sort
      // For now, just a placeholder
    } catch (error) {
      errors.push(`Circular dependency detected: ${error}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Clear flowsheet
  clear(): void {
    this.solver.clear();
    this.flowsheetData = {
      streams: {},
      units: {},
      connections: [],
      materials: {}
    };
    console.log('Flowsheet cleared');
  }
}
