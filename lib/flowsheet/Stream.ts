// Stream class for process simulation
import { Stream as IStream, Material } from './types';

export class Stream implements IStream {
  id: string;
  name: string;
  temperature: number; // K
  pressure: number; // Pa
  flowRate: number; // kg/s
  composition: { [material: string]: number }; // mass fractions
  phase: 'liquid' | 'vapor' | 'solid' | 'mixed';
  enthalpy: number; // J/kg
  entropy: number; // J/kg·K

  constructor(data: Partial<IStream>) {
    this.id = data.id || '';
    this.name = data.name || '';
    this.temperature = data.temperature || 298.15; // 25°C
    this.pressure = data.pressure || 101325; // 1 atm
    this.flowRate = data.flowRate || 0;
    this.composition = data.composition || {};
    this.phase = data.phase || 'liquid';
    this.enthalpy = data.enthalpy || 0;
    this.entropy = data.entropy || 0;
  }

  // Calculate stream properties
  calculateEnthalpy(materials: { [name: string]: Material }): number {
    let enthalpy = 0;
    for (const [material, fraction] of Object.entries(this.composition)) {
      if (materials[material]) {
        const cp = materials[material].heatCapacity;
        enthalpy += fraction * cp * (this.temperature - 298.15);
      }
    }
    this.enthalpy = enthalpy;
    return enthalpy;
  }

  calculateEntropy(materials: { [name: string]: Material }): number {
    let entropy = 0;
    for (const [material, fraction] of Object.entries(this.composition)) {
      if (materials[material]) {
        const cp = materials[material].heatCapacity;
        entropy += fraction * cp * Math.log(this.temperature / 298.15);
      }
    }
    this.entropy = entropy;
    return entropy;
  }

  // Determine phase based on temperature and pressure
  determinePhase(materials: { [name: string]: Material }): 'liquid' | 'vapor' | 'solid' | 'mixed' {
    // Simplified phase determination
    let liquidFraction = 0;
    let vaporFraction = 0;

    for (const [material, fraction] of Object.entries(this.composition)) {
      if (materials[material]) {
        const mat = materials[material];
        if (this.temperature < mat.criticalTemperature && this.pressure > mat.criticalPressure * 0.1) {
          liquidFraction += fraction;
        } else {
          vaporFraction += fraction;
        }
      }
    }

    if (liquidFraction > 0.9) return 'liquid';
    if (vaporFraction > 0.9) return 'vapor';
    if (liquidFraction > 0.1 && vaporFraction > 0.1) return 'mixed';
    return 'liquid';
  }

  // Mix two streams
  static mix(stream1: Stream, stream2: Stream, materials: { [name: string]: Material }): Stream {
    const totalFlow = stream1.flowRate + stream2.flowRate;
    if (totalFlow === 0) {
      return new Stream({ id: 'mixed', name: 'Mixed Stream' });
    }

    const newComposition: { [material: string]: number } = {};
    let weightedTemp = 0;
    let weightedPressure = 0;

    // Mix compositions
    for (const material of Object.keys({ ...stream1.composition, ...stream2.composition })) {
      const mass1 = (stream1.composition[material] || 0) * stream1.flowRate;
      const mass2 = (stream2.composition[material] || 0) * stream2.flowRate;
      newComposition[material] = (mass1 + mass2) / totalFlow;
    }

    // Calculate weighted average temperature and pressure
    weightedTemp = (stream1.temperature * stream1.flowRate + stream2.temperature * stream2.flowRate) / totalFlow;
    weightedPressure = (stream1.pressure * stream1.flowRate + stream2.pressure * stream2.flowRate) / totalFlow;

    const mixedStream = new Stream({
      id: 'mixed',
      name: 'Mixed Stream',
      temperature: weightedTemp,
      pressure: weightedPressure,
      flowRate: totalFlow,
      composition: newComposition
    });

    mixedStream.phase = mixedStream.determinePhase(materials);
    mixedStream.calculateEnthalpy(materials);
    mixedStream.calculateEntropy(materials);

    return mixedStream;
  }

  // Split stream into multiple streams
  split(splitFractions: number[]): Stream[] {
    const totalFraction = splitFractions.reduce((sum, frac) => sum + frac, 0);
    if (Math.abs(totalFraction - 1.0) > 0.001) {
      throw new Error('Split fractions must sum to 1.0');
    }

    return splitFractions.map((fraction, index) => {
      return new Stream({
        id: `${this.id}_split_${index}`,
        name: `${this.name} Split ${index + 1}`,
        temperature: this.temperature,
        pressure: this.pressure,
        flowRate: this.flowRate * fraction,
        composition: { ...this.composition },
        phase: this.phase,
        enthalpy: this.enthalpy,
        entropy: this.entropy
      });
    });
  }

  // Clone stream
  clone(newId?: string): Stream {
    return new Stream({
      id: newId || `${this.id}_copy`,
      name: `${this.name} Copy`,
      temperature: this.temperature,
      pressure: this.pressure,
      flowRate: this.flowRate,
      composition: { ...this.composition },
      phase: this.phase,
      enthalpy: this.enthalpy,
      entropy: this.entropy
    });
  }

  // Get stream summary
  getSummary(): string {
    const compStr = Object.entries(this.composition)
      .filter(([_, fraction]) => fraction > 0.01)
      .map(([material, fraction]) => `${material}: ${(fraction * 100).toFixed(1)}%`)
      .join(', ');

    return `${this.name}: ${this.flowRate.toFixed(2)} kg/s, ${this.temperature.toFixed(1)}K, ${(this.pressure/1000).toFixed(1)} kPa, ${this.phase} (${compStr})`;
  }
}
