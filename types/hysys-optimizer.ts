/** HYSYS optimizer: types for upload, validation, scenario, and AI suggestions */

export type UnitSystem = 'SI' | 'US';
export type ProcessType = 'oil_and_gas' | 'refining' | 'chemicals' | 'petrochemicals' | 'pharma' | 'utilities' | 'general';
export type OptimizationGoal = 'production' | 'energy' | 'carbon' | 'cost';
export type GoalCategory = 'production' | 'energy' | 'carbon' | 'cost';

export interface ResultSummaryMetrics {
  totalSavingsUSDPerYear: number;
  totalProductionGainPct: number;
  totalEnergySavingsMWhPerYear: number;
  totalCarbonReductionTonnePerYear: number;
  suggestionsByGoal: Record<GoalCategory, number>;
}

export interface HYSYSStreamRow {
  stream_id?: string;
  name?: string;
  temperature_c?: number;
  temperature_f?: number;
  pressure_kpa?: number;
  pressure_psig?: number;
  mass_flow_kg_h?: number;
  mass_flow_lb_h?: number;
  molar_flow_kmol_h?: number;
  composition?: Record<string, number>;
  vapor_fraction?: number;
  enthalpy_mw?: number;
  [key: string]: unknown;
}

export interface HYSYSUnitRow {
  unit_id?: string;
  name?: string;
  type?: string;
  duty_mw?: number;
  duty_mmbtu_h?: number;
  reflux_ratio?: number;
  pressure_kpa?: number;
  pressure_psig?: number;
  design_limit_notes?: string;
  [key: string]: unknown;
}

export interface HYSYSImportData {
  unitSystem: UnitSystem;
  streams?: HYSYSStreamRow[];
  units?: HYSYSUnitRow[];
  raw?: Record<string, unknown>;
  sourceFile?: string;
  processType?: ProcessType;
  processDescription?: string;
}

export interface ScenarioParams {
  energyPriceUSDPerMWh?: number;
  steamPriceUSDPerMMBtu?: number;
  carbonPriceUSDPerTonne?: number;
  productValueUSDPerTon?: number;
  operatingHoursPerYear?: number;
}

export interface ValidationIssue {
  code: string;
  message: string;
  field?: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationResult {
  valid: boolean;
  unitSystem: UnitSystem;
  issues: ValidationIssue[];
  inferredFields: string[];
  massBalanceCheck?: { consistent: boolean; message?: string };
  energyBalanceCheck?: { consistent: boolean; message?: string };
  unitsWithDesignLimits?: string[];
}

export interface OptimizationSuggestion {
  id: string;
  action: string;
  category: 'operating_point' | 'heat_integration' | 'debottleneck' | 'utility' | 'other';
  expectedEffect: string;
  productionGainPct?: number;
  energySavingsPct?: number;
  energySavingsMMBtuPerYear?: number;
  energySavingsMWhPerYear?: number;
  carbonReductionTonnePerYear?: number;
  revenueOrSavingsUSDPerYear: number;
  constraintsOrAssumptions: string;
  capexOpexNote: string;
  paybackYears?: number;
  uncertainty: 'low' | 'medium' | 'high';
  dataQualityFlag?: string;
  goalCategory?: GoalCategory;
  beforeValue?: string;
  afterValue?: string;
  improvementPct?: number;
}

export interface OptimizerRunResult {
  runId: string;
  timestamp: string;
  topSuggestions: OptimizationSuggestion[];
  allSuggestions: OptimizationSuggestion[];
  dataQualityGaps: string[];
  validationSummary: ValidationResult;
  scenarioUsed: ScenarioParams;
  userNotes?: string;
  summaryMetrics?: ResultSummaryMetrics;
  processType?: ProcessType;
  optimizationGoals?: OptimizationGoal[];
}

export interface OptimizerRunLog {
  runId: string;
  timestamp: string;
  userNotes?: string;
  scenarioSnapshot: ScenarioParams;
  suggestionCount: number;
  topBenefitUSD?: number;
}
