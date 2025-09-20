// Material class for process simulation
import { Material as IMaterial } from './types';

export class Material implements IMaterial {
  name: string;
  molecularWeight: number;
  density: number;
  viscosity: number;
  heatCapacity: number;
  thermalConductivity: number;
  criticalTemperature: number;
  criticalPressure: number;
  acentricFactor: number;

  constructor(data: Partial<IMaterial>) {
    this.name = data.name || '';
    this.molecularWeight = data.molecularWeight || 0;
    this.density = data.density || 0;
    this.viscosity = data.viscosity || 0;
    this.heatCapacity = data.heatCapacity || 0;
    this.thermalConductivity = data.thermalConductivity || 0;
    this.criticalTemperature = data.criticalTemperature || 0;
    this.criticalPressure = data.criticalPressure || 0;
    this.acentricFactor = data.acentricFactor || 0;
  }

  // Calculate properties at given conditions
  calculateDensity(temperature: number, pressure: number): number {
    // Simplified ideal gas law for vapor, constant for liquid
    if (temperature > this.criticalTemperature) {
      return (pressure * this.molecularWeight) / (8.314 * temperature);
    }
    return this.density;
  }

  calculateViscosity(temperature: number): number {
    // Simplified temperature dependence
    return this.viscosity * Math.exp(-0.01 * (temperature - 298));
  }

  calculateHeatCapacity(temperature: number): number {
    // Simplified temperature dependence
    return this.heatCapacity * (1 + 0.001 * (temperature - 298));
  }

  // Static method to create common materials
  static createWater(): Material {
    return new Material({
      name: 'Water',
      molecularWeight: 18.015,
      density: 1000,
      viscosity: 0.001,
      heatCapacity: 4180,
      thermalConductivity: 0.6,
      criticalTemperature: 647.1,
      criticalPressure: 22.06e6,
      acentricFactor: 0.344
    });
  }

  static createMethane(): Material {
    return new Material({
      name: 'Methane',
      molecularWeight: 16.043,
      density: 0.717,
      viscosity: 0.000011,
      heatCapacity: 2220,
      thermalConductivity: 0.034,
      criticalTemperature: 190.6,
      criticalPressure: 4.6e6,
      acentricFactor: 0.011
    });
  }

  static createEthanol(): Material {
    return new Material({
      name: 'Ethanol',
      molecularWeight: 46.069,
      density: 789,
      viscosity: 0.0012,
      heatCapacity: 2440,
      thermalConductivity: 0.17,
      criticalTemperature: 513.9,
      criticalPressure: 6.1e6,
      acentricFactor: 0.644
    });
  }

  static createBenzene(): Material {
    return new Material({
      name: 'Benzene',
      molecularWeight: 78.114,
      density: 876,
      viscosity: 0.00065,
      heatCapacity: 1750,
      thermalConductivity: 0.15,
      criticalTemperature: 562.1,
      criticalPressure: 4.9e6,
      acentricFactor: 0.212
    });
  }

  static createToluene(): Material {
    return new Material({
      name: 'Toluene',
      molecularWeight: 92.141,
      density: 867,
      viscosity: 0.00059,
      heatCapacity: 1700,
      thermalConductivity: 0.13,
      criticalTemperature: 591.8,
      criticalPressure: 4.1e6,
      acentricFactor: 0.264
    });
  }
}
