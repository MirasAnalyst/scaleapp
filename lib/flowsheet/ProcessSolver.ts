// Process solver for flowsheet calculations
import { ProcessResult, SolverOptions, Stream, Material } from './types';
import { UnitOperation } from './UnitOperation';
import { Stream as StreamClass } from './Stream';
import { Material as MaterialClass } from './Material';

export class ProcessSolver {
  private units: { [id: string]: UnitOperation } = {};
  private streams: { [id: string]: StreamClass } = {};
  private materials: { [name: string]: Material } = {};
  private connections: { from: string; to: string; stream: string }[] = [];

  constructor() {
    // Initialize with common materials
    this.addMaterial(MaterialClass.createWater());
    this.addMaterial(MaterialClass.createMethane());
    this.addMaterial(MaterialClass.createEthanol());
    this.addMaterial(MaterialClass.createBenzene());
    this.addMaterial(MaterialClass.createToluene());
  }

  // Add material to the system
  addMaterial(material: Material): void {
    this.materials[material.name] = material;
  }

  // Add unit operation
  addUnit(unit: UnitOperation): void {
    this.units[unit.id] = unit;
  }

  // Add stream
  addStream(stream: StreamClass): void {
    this.streams[stream.id] = stream;
  }

  // Connect units with streams
  connectUnits(fromUnit: string, fromPort: string, toUnit: string, toPort: string, stream: StreamClass): void {
    this.addStream(stream);
    this.connections.push({ from: fromUnit, to: toUnit, stream: stream.id });
    
    if (this.units[fromUnit]) {
      this.units[fromUnit].connectOutput(fromPort, stream);
    }
    if (this.units[toUnit]) {
      this.units[toUnit].connectInput(toPort, stream);
    }
  }

  // Solve the flowsheet
  solve(options: Partial<SolverOptions> = {}): ProcessResult {
    const solverOptions: SolverOptions = {
      maxIterations: 100,
      tolerance: 1e-6,
      method: 'newton',
      damping: 0.5,
      stepSize: 0.1,
      ...options
    };

    const result: ProcessResult = {
      converged: false,
      iterations: 0,
      residuals: [],
      streams: {},
      units: {},
      warnings: [],
      errors: []
    };

    try {
      // Topological sort to determine calculation order
      const calculationOrder = this.topologicalSort();
      
      // Iterative solution
      for (let iteration = 0; iteration < solverOptions.maxIterations; iteration++) {
        result.iterations = iteration + 1;
        
        // Calculate all units in order
        for (const unitId of calculationOrder) {
          const unit = this.units[unitId];
          if (unit && unit.isReady()) {
            try {
              unit.calculate(this.materials);
            } catch (error) {
              result.errors.push(`Error in unit ${unitId}: ${error}`);
            }
          }
        }

        // Check convergence
        const residuals = this.calculateResiduals();
        result.residuals = residuals;
        
        if (this.checkConvergence(residuals, solverOptions.tolerance)) {
          result.converged = true;
          break;
        }

        // Update streams
        this.updateStreams();
      }

      // Collect final results
      result.streams = this.collectStreamResults();
      result.units = this.collectUnitResults();

      if (!result.converged) {
        result.warnings.push(`Solution did not converge after ${result.iterations} iterations`);
      }

    } catch (error) {
      result.errors.push(`Solver error: ${error}`);
    }

    return result;
  }

  // Topological sort for calculation order
  private topologicalSort(): string[] {
    const visited = new Set<string>();
    const tempVisited = new Set<string>();
    const result: string[] = [];

    const visit = (unitId: string) => {
      if (tempVisited.has(unitId)) {
        throw new Error('Circular dependency detected in flowsheet');
      }
      if (visited.has(unitId)) {
        return;
      }

      tempVisited.add(unitId);
      
      // Visit dependencies first
      const dependencies = this.getDependencies(unitId);
      for (const dep of dependencies) {
        visit(dep);
      }

      tempVisited.delete(unitId);
      visited.add(unitId);
      result.push(unitId);
    };

    for (const unitId of Object.keys(this.units)) {
      if (!visited.has(unitId)) {
        visit(unitId);
      }
    }

    return result;
  }

  // Get dependencies for a unit
  private getDependencies(unitId: string): string[] {
    const dependencies: string[] = [];
    const unit = this.units[unitId];
    
    if (unit) {
      for (const inputStream of unit.getInputStreams()) {
        // Find which unit produces this stream
        for (const connection of this.connections) {
          if (connection.stream === inputStream.id) {
            dependencies.push(connection.from);
          }
        }
      }
    }

    return dependencies;
  }

  // Calculate residuals for convergence check
  private calculateResiduals(): number[] {
    const residuals: number[] = [];
    
    for (const unit of Object.values(this.units)) {
      if (unit.isReady()) {
        // Calculate mass balance residual
        const inputMass = unit.getInputStreams().reduce((sum, stream) => sum + stream.flowRate, 0);
        const outputMass = unit.getOutputStreams().reduce((sum, stream) => sum + stream.flowRate, 0);
        residuals.push(Math.abs(inputMass - outputMass));
      }
    }

    return residuals;
  }

  // Check convergence
  private checkConvergence(residuals: number[], tolerance: number): boolean {
    return residuals.every(residual => residual < tolerance);
  }

  // Update streams after calculation
  private updateStreams(): void {
    for (const unit of Object.values(this.units)) {
      for (const [port, stream] of Object.entries(unit.outputStreams)) {
        this.streams[stream.id] = stream;
      }
    }
  }

  // Collect stream results
  private collectStreamResults(): { [id: string]: Stream } {
    const results: { [id: string]: Stream } = {};
    for (const [id, stream] of Object.entries(this.streams)) {
      results[id] = {
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
    }
    return results;
  }

  // Collect unit results
  private collectUnitResults(): { [id: string]: any } {
    const results: { [id: string]: any } = {};
    for (const [id, unit] of Object.entries(this.units)) {
      results[id] = {
        id: unit.id,
        name: unit.name,
        type: unit.type,
        position: unit.position,
        parameters: unit.parameters,
        pressureDrop: unit.getPressureDrop(),
        heatDuty: unit.getHeatDuty(),
        summary: unit.getSummary()
      };
    }
    return results;
  }

  // Get flowsheet summary
  getSummary(): string {
    const unitCount = Object.keys(this.units).length;
    const streamCount = Object.keys(this.streams).length;
    const materialCount = Object.keys(this.materials).length;
    
    return `Flowsheet Summary: ${unitCount} units, ${streamCount} streams, ${materialCount} materials`;
  }

  // Clear all data
  clear(): void {
    this.units = {};
    this.streams = {};
    this.materials = {};
    this.connections = [];
  }

  // Export flowsheet data
  export(): any {
    return {
      units: Object.keys(this.units),
      streams: Object.keys(this.streams),
      materials: Object.keys(this.materials),
      connections: this.connections,
      summary: this.getSummary()
    };
  }
}
