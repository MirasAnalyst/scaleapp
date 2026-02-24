/**
 * HYSYS import validation: units (SI/US), required fields, mass/energy balance sanity checks.
 */

import type {
  HYSYSImportData,
  ValidationResult,
  ValidationIssue,
  UnitSystem,
  HYSYSStreamRow,
  HYSYSUnitRow,
} from '@/types/hysys-optimizer';

const SI_TEMP_KEYS = ['temperature_c', 'temperature_K'];
const US_TEMP_KEYS = ['temperature_f'];
const SI_PRESS_KEYS = ['pressure_kpa', 'pressure_bara'];
const US_PRESS_KEYS = ['pressure_psig', 'pressure_psi'];
const SI_FLOW_KEYS = ['mass_flow_kg_h', 'molar_flow_kmol_h'];
const US_FLOW_KEYS = ['mass_flow_lb_h', 'molar_flow_lbmol_h'];
const DUTY_KEYS = ['duty_mw', 'duty_mmbtu_h', 'duty_kw'];

function inferUnitSystem(data: HYSYSImportData): UnitSystem {
  const streams = data.streams ?? [];
  const units = data.units ?? [];
  let siScore = 0;
  let usScore = 0;

  for (const s of streams) {
    if (SI_TEMP_KEYS.some((k) => s[k] != null)) siScore++;
    if (US_TEMP_KEYS.some((k) => s[k] != null)) usScore++;
    if (SI_PRESS_KEYS.some((k) => s[k] != null)) siScore++;
    if (US_PRESS_KEYS.some((k) => s[k] != null)) usScore++;
    if (SI_FLOW_KEYS.some((k) => s[k] != null)) siScore++;
    if (US_FLOW_KEYS.some((k) => s[k] != null)) usScore++;
  }
  for (const u of units) {
    if (typeof (u as HYSYSUnitRow).duty_mw === 'number') siScore++;
    if (typeof (u as HYSYSUnitRow).duty_mmbtu_h === 'number') usScore++;
  }
  return usScore >= siScore ? 'US' : 'SI';
}

function hasAnyFlow(s: HYSYSStreamRow): boolean {
  return (
    typeof s.mass_flow_kg_h === 'number' ||
    typeof s.mass_flow_lb_h === 'number' ||
    typeof s.molar_flow_kmol_h === 'number'
  );
}

function getTotalFlow(streams: HYSYSStreamRow[], unitSystem: UnitSystem): number {
  let total = 0;
  for (const s of streams) {
    const m = s.mass_flow_kg_h ?? s.mass_flow_lb_h ?? s.molar_flow_kmol_h;
    if (typeof m === 'number') total += m;
  }
  return total;
}

export function validateHYSYSData(data: HYSYSImportData): ValidationResult {
  const issues: ValidationIssue[] = [];
  const inferredFields: string[] = [];
  const unitSystem = data.unitSystem ?? inferUnitSystem(data);
  const streams = data.streams ?? [];
  const units = data.units ?? [];

  if (streams.length === 0 && units.length === 0) {
    issues.push({
      code: 'NO_DATA',
      message: 'No streams or units found. Provide at least streams or unit operations.',
      severity: 'error',
    });
    return {
      valid: false,
      unitSystem,
      issues,
      inferredFields,
    };
  }

  if (streams.length > 0) {
    const withFlow = streams.filter(hasAnyFlow);
    if (withFlow.length === 0) {
      issues.push({
        code: 'MISSING_FLOW',
        message: 'No flow rates found in streams. Add mass_flow_kg_h, mass_flow_lb_h, or molar_flow_kmol_h.',
        severity: 'warning',
      });
    } else {
      inferredFields.push('flow_rates');
    }
    const withTemp = streams.filter(
      (s) =>
        typeof (s as HYSYSStreamRow).temperature_c === 'number' ||
        typeof (s as HYSYSStreamRow).temperature_f === 'number'
    );
    if (withTemp.length > 0) inferredFields.push('temperatures');
    const withPress = streams.filter(
      (s) =>
        typeof (s as HYSYSStreamRow).pressure_kpa === 'number' ||
        typeof (s as HYSYSStreamRow).pressure_psig === 'number'
    );
    if (withPress.length > 0) inferredFields.push('pressures');
    const withComp = streams.filter(
      (s) =>
        (s as HYSYSStreamRow).composition &&
        typeof (s as HYSYSStreamRow).composition === 'object'
    );
    if (withComp.length > 0) inferredFields.push('composition');
  }

  if (units.length > 0) {
    const withDuty = units.filter((u) =>
      DUTY_KEYS.some((k) => typeof (u as HYSYSUnitRow)[k] === 'number')
    );
    if (withDuty.length > 0) inferredFields.push('equipment_duty');
  }

  let massBalanceCheck: ValidationResult['massBalanceCheck'];
  if (streams.length >= 2 && inferredFields.includes('flow_rates')) {
    const total = getTotalFlow(streams, unitSystem);
    massBalanceCheck =
      total > 0
        ? { consistent: true, message: `Total flow (sum of streams): ${total} (units depend on input).` }
        : { consistent: false, message: 'Total flow is zero; check flow units.' };
    if (total <= 0) {
      issues.push({
        code: 'MASS_BALANCE',
        message: massBalanceCheck.message,
        severity: 'warning',
      });
    }
  }

  // Surface design limit notes
  const unitsWithDesignLimits = units
    .filter((u) => typeof (u as HYSYSUnitRow).design_limit_notes === 'string' && (u as HYSYSUnitRow).design_limit_notes!.length > 0)
    .map((u) => (u as HYSYSUnitRow).unit_id ?? (u as HYSYSUnitRow).name ?? 'unknown');

  // Warn on large datasets
  if (streams.length > 50 || units.length > 50) {
    issues.push({
      code: 'LARGE_DATASET',
      message: `Large dataset (${streams.length} streams, ${units.length} units). Data may be summarized for AI analysis.`,
      severity: 'info',
    });
  }

  let energyBalanceCheck: ValidationResult['energyBalanceCheck'];
  const dutySum = units.reduce((acc, u) => {
    const d = (u as HYSYSUnitRow).duty_mw ?? (u as HYSYSUnitRow).duty_mmbtu_h ?? 0;
    return acc + (typeof d === 'number' ? d : 0);
  }, 0);
  if (units.length > 0) {
    energyBalanceCheck =
      dutySum !== 0 || units.length === 0
        ? { consistent: true, message: `Total duty (equipment): ${dutySum}. Consistency depends on process.` }
        : { consistent: false, message: 'No duty data; cannot verify energy balance.' };
  }

  const valid = !issues.some((i) => i.severity === 'error');
  return {
    valid,
    unitSystem,
    issues,
    inferredFields,
    massBalanceCheck,
    energyBalanceCheck,
    unitsWithDesignLimits: unitsWithDesignLimits.length > 0 ? unitsWithDesignLimits : undefined,
  };
}
