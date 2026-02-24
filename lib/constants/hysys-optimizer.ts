import type { ScenarioParams } from '@/types/hysys-optimizer';

export const DEFAULT_SCENARIO: ScenarioParams = {
  energyPriceUSDPerMWh: 80,
  steamPriceUSDPerMMBtu: 8,
  carbonPriceUSDPerTonne: 50,
  productValueUSDPerTon: 500,
  operatingHoursPerYear: 8400,
};
