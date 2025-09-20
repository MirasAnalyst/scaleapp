// Base UnitOperation class for process simulation
import { UnitOperationConfig, Stream, Material } from './types';
import { Stream as StreamClass } from './Stream';

export abstract class UnitOperation {
  id: string;
  name: string;
  type: string;
  position: { x: number; y: number };
  parameters: { [key: string]: any };
  inputs: string[];
  outputs: string[];
  
  // Stream connections
  inputStreams: { [port: string]: StreamClass } = {};
  outputStreams: { [port: string]: StreamClass } = {};

  constructor(config: UnitOperationConfig) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.position = config.position;
    this.parameters = config.parameters;
    this.inputs = config.inputs;
    this.outputs = config.outputs;
  }

  // Abstract methods to be implemented by specific unit operations
  abstract calculate(materials: { [name: string]: Material }): void;
  abstract validate(): boolean;
  abstract getPressureDrop(): number;
  abstract getHeatDuty(): number;

  // Connect input stream
  connectInput(port: string, stream: StreamClass): void {
    if (!this.inputs.includes(port)) {
      throw new Error(`Port ${port} is not a valid input for ${this.type}`);
    }
    this.inputStreams[port] = stream;
  }

  // Connect output stream
  connectOutput(port: string, stream: StreamClass): void {
    if (!this.outputs.includes(port)) {
      throw new Error(`Port ${port} is not a valid output for ${this.type}`);
    }
    this.outputStreams[port] = stream;
  }

  // Get all input streams
  getInputStreams(): StreamClass[] {
    return Object.values(this.inputStreams);
  }

  // Get all output streams
  getOutputStreams(): StreamClass[] {
    return Object.values(this.outputStreams);
  }

  // Check if unit is ready for calculation
  isReady(): boolean {
    return this.inputs.every(port => this.inputStreams[port] !== undefined);
  }

  // Get unit summary
  getSummary(): string {
    const inputSummary = this.getInputStreams().map(s => s.getSummary()).join('; ');
    const outputSummary = this.getOutputStreams().map(s => s.getSummary()).join('; ');
    return `${this.name} (${this.type}): Inputs: [${inputSummary}] -> Outputs: [${outputSummary}]`;
  }
}

// Mixer Unit Operation
export class Mixer extends UnitOperation {
  constructor(id: string, name: string, position: { x: number; y: number }) {
    super({
      id,
      name,
      type: 'mixer',
      position,
      parameters: {},
      inputs: ['in1', 'in2', 'in3'],
      outputs: ['out']
    });
  }

  calculate(materials: { [name: string]: Material }): void {
    if (!this.isReady()) {
      throw new Error('Mixer not ready for calculation');
    }

    const inputStreams = this.getInputStreams();
    let mixedStream = inputStreams[0];

    for (let i = 1; i < inputStreams.length; i++) {
      mixedStream = StreamClass.mix(mixedStream, inputStreams[i], materials);
    }

    mixedStream.id = `${this.id}_out`;
    mixedStream.name = `${this.name} Outlet`;
    this.outputStreams['out'] = mixedStream;
  }

  validate(): boolean {
    return this.getInputStreams().length >= 2;
  }

  getPressureDrop(): number {
    return 0; // Negligible pressure drop for mixer
  }

  getHeatDuty(): number {
    return 0; // Adiabatic mixing
  }
}

// Splitter Unit Operation
export class Splitter extends UnitOperation {
  constructor(id: string, name: string, position: { x: number; y: number }, splitFractions: number[] = [0.5, 0.5]) {
    super({
      id,
      name,
      type: 'splitter',
      position,
      parameters: { splitFractions },
      inputs: ['in'],
      outputs: ['out1', 'out2', 'out3']
    });
  }

  calculate(materials: { [name: string]: Material }): void {
    if (!this.isReady()) {
      throw new Error('Splitter not ready for calculation');
    }

    const inputStream = this.getInputStreams()[0];
    const splitFractions = this.parameters.splitFractions as number[];
    const splitStreams = inputStream.split(splitFractions);

    splitStreams.forEach((stream, index) => {
      stream.id = `${this.id}_out${index + 1}`;
      stream.name = `${this.name} Outlet ${index + 1}`;
      this.outputStreams[`out${index + 1}`] = stream;
    });
  }

  validate(): boolean {
    const splitFractions = this.parameters.splitFractions as number[];
    const total = splitFractions.reduce((sum, frac) => sum + frac, 0);
    return Math.abs(total - 1.0) < 0.001;
  }

  getPressureDrop(): number {
    return 0; // Negligible pressure drop for splitter
  }

  getHeatDuty(): number {
    return 0; // Adiabatic splitting
  }
}

// Heat Exchanger Unit Operation
export class HeatExchanger extends UnitOperation {
  constructor(id: string, name: string, position: { x: number; y: number }, heatDuty: number = 0) {
    super({
      id,
      name,
      type: 'heat_exchanger',
      position,
      parameters: { heatDuty, efficiency: 0.95 },
      inputs: ['hot_in', 'cold_in'],
      outputs: ['hot_out', 'cold_out']
    });
  }

  calculate(materials: { [name: string]: Material }): void {
    if (!this.isReady()) {
      throw new Error('Heat exchanger not ready for calculation');
    }

    const hotIn = this.inputStreams['hot_in'];
    const coldIn = this.inputStreams['cold_in'];
    const heatDuty = this.parameters.heatDuty as number;
    const efficiency = this.parameters.efficiency as number;

    // Simplified heat transfer calculation
    const effectiveHeatDuty = heatDuty * efficiency;

    // Hot stream outlet (loses heat)
    const hotOut = hotIn.clone(`${this.id}_hot_out`);
    hotOut.name = `${this.name} Hot Outlet`;
    hotOut.enthalpy -= effectiveHeatDuty / hotIn.flowRate;
    this.outputStreams['hot_out'] = hotOut;

    // Cold stream outlet (gains heat)
    const coldOut = coldIn.clone(`${this.id}_cold_out`);
    coldOut.name = `${this.name} Cold Outlet`;
    coldOut.enthalpy += effectiveHeatDuty / coldIn.flowRate;
    this.outputStreams['cold_out'] = coldOut;
  }

  validate(): boolean {
    return this.getInputStreams().length === 2;
  }

  getPressureDrop(): number {
    return 50000; // 50 kPa typical pressure drop
  }

  getHeatDuty(): number {
    return this.parameters.heatDuty as number;
  }
}

// Reactor Unit Operation
export class Reactor extends UnitOperation {
  constructor(id: string, name: string, position: { x: number; y: number }, conversion: number = 0.8) {
    super({
      id,
      name,
      type: 'reactor',
      position,
      parameters: { conversion, residenceTime: 3600, temperature: 500 },
      inputs: ['in'],
      outputs: ['out']
    });
  }

  calculate(materials: { [name: string]: Material }): void {
    if (!this.isReady()) {
      throw new Error('Reactor not ready for calculation');
    }

    const inputStream = this.getInputStreams()[0];
    const conversion = this.parameters.conversion as number;
    const temperature = this.parameters.temperature as number;

    const outputStream = inputStream.clone(`${this.id}_out`);
    outputStream.name = `${this.name} Outlet`;
    outputStream.temperature = temperature;

    // Simplified reaction calculation (example: A -> B)
    const reactant = Object.keys(inputStream.composition)[0];
    if (reactant && inputStream.composition[reactant] > 0) {
      const reactantConsumed = inputStream.composition[reactant] * conversion;
      outputStream.composition[reactant] -= reactantConsumed;
      
      // Add product (simplified)
      const product = 'Product';
      outputStream.composition[product] = (outputStream.composition[product] || 0) + reactantConsumed;
    }

    this.outputStreams['out'] = outputStream;
  }

  validate(): boolean {
    const conversion = this.parameters.conversion as number;
    return conversion >= 0 && conversion <= 1;
  }

  getPressureDrop(): number {
    return 100000; // 100 kPa typical pressure drop
  }

  getHeatDuty(): number {
    return 0; // Adiabatic reactor (could be modified for heat exchange)
  }
}

// Separator Unit Operation
export class Separator extends UnitOperation {
  constructor(id: string, name: string, position: { x: number; y: number }, separationEfficiency: number = 0.95) {
    super({
      id,
      name,
      type: 'separator',
      position,
      parameters: { separationEfficiency, temperature: 298, pressure: 101325 },
      inputs: ['in'],
      outputs: ['liquid_out', 'vapor_out']
    });
  }

  calculate(materials: { [name: string]: Material }): void {
    if (!this.isReady()) {
      throw new Error('Separator not ready for calculation');
    }

    const inputStream = this.getInputStreams()[0];
    const efficiency = this.parameters.separationEfficiency as number;
    const temperature = this.parameters.temperature as number;
    const pressure = this.parameters.pressure as number;

    // Create liquid outlet stream
    const liquidOut = inputStream.clone(`${this.id}_liquid_out`);
    liquidOut.name = `${this.name} Liquid Outlet`;
    liquidOut.temperature = temperature;
    liquidOut.pressure = pressure;
    liquidOut.phase = 'liquid';
    liquidOut.flowRate *= (1 - efficiency);
    this.outputStreams['liquid_out'] = liquidOut;

    // Create vapor outlet stream
    const vaporOut = inputStream.clone(`${this.id}_vapor_out`);
    vaporOut.name = `${this.name} Vapor Outlet`;
    vaporOut.temperature = temperature;
    vaporOut.pressure = pressure;
    vaporOut.phase = 'vapor';
    vaporOut.flowRate *= efficiency;
    this.outputStreams['vapor_out'] = vaporOut;
  }

  validate(): boolean {
    const efficiency = this.parameters.separationEfficiency as number;
    return efficiency >= 0 && efficiency <= 1;
  }

  getPressureDrop(): number {
    return 25000; // 25 kPa typical pressure drop
  }

  getHeatDuty(): number {
    return 0; // Adiabatic separation
  }
}
