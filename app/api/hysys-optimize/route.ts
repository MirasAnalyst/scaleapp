import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { validateHYSYSData } from '@/lib/hysys-validator';
import { DEFAULT_SCENARIO } from '@/lib/constants/hysys-optimizer';
import type {
  HYSYSImportData,
  ScenarioParams,
  ValidationResult,
  OptimizationSuggestion,
  OptimizerRunResult,
  ProcessType,
  OptimizationGoal,
  GoalCategory,
  ResultSummaryMetrics,
} from '@/types/hysys-optimizer';

const VALID_PROCESS_TYPES: ProcessType[] = ['oil_and_gas', 'refining', 'chemicals', 'petrochemicals', 'pharma', 'utilities', 'general'];
const VALID_GOALS: OptimizationGoal[] = ['production', 'energy', 'carbon', 'cost'];

const PROCESS_BENCHMARKS: Record<ProcessType, string> = {
  oil_and_gas: `Industry benchmarks for Oil & Gas Processing:
- Gas compression specific power: 0.10–0.15 kW/(Sm3/h); >0.18 indicates inefficiency
- 3-phase separator efficiency: liquid carryover <0.1 vol% in gas stream
- Stabilizer reflux ratio: typically 0.8–1.5; higher suggests over-reflux
- Flare/vent losses: target <0.5% of feed; >1% is significant lost revenue
- Gas dehydration: TEG circulation 15–25 L/kg water; excess = wasted reboiler duty
- Wellhead choke dP optimization: balance reservoir drawdown vs separator capacity`,

  refining: `Industry benchmarks for Refining:
- CDU reflux ratio: 1.0–2.5 typical; >3.0 wastes condenser + reboiler duty
- FCC regenerator temperature: 680–720°C optimal; >740°C excess coke burn
- Reformer severity (RON): 92–98 typical; each RON point costs ~1% yield
- Hydrogen network: target >95% purity at consumer; purge optimization saves compressor power
- Crude preheat train: LMTD <20°C at hot end indicates fouling; clean = 2–5% fuel savings
- Vacuum column overflash: target 2–5%; >8% wastes energy`,

  chemicals: `Industry benchmarks for Chemical Processes:
- Reactor conversion: compare actual vs thermodynamic equilibrium; >5% gap = optimization potential
- Distillation reflux ratio: R/Rmin of 1.1–1.3 is optimal; >1.5 wastes energy
- Heat integration potential: pinch analysis target >70% recovery; <50% = significant opportunity
- Reactor heat removal: approach temperature <10°C may limit throughput
- Recycle ratio: high recycle increases separation cost; optimize per-pass conversion`,

  petrochemicals: `Industry benchmarks for Petrochemicals:
- Ethylene cracker coil outlet temperature: 820–870°C; 10°C increase = ~1% ethylene yield
- C2 splitter reflux ratio: 3–5 typical; >6 indicates optimization opportunity
- Quench system: target quench water <40°C; each 5°C above adds compressor load
- Propylene splitter: 150–200 trays; pressure optimization saves 5–15% condenser duty
- Pyrolysis furnace efficiency: >90% target; decoking frequency affects average efficiency`,

  pharma: `Industry benchmarks for Pharmaceutical Processes:
- Batch cycle time: identify rate-limiting step; 10% reduction can increase annual output proportionally
- Vacuum distillation: operating at minimum pressure saves 10–20% energy vs higher pressure
- Solvent recovery: target >95% recovery; <90% is both cost and environmental concern
- HVAC energy: cleanroom HVAC is 40–60% of site energy; air change reduction during non-production saves 15–25%
- CIP/SIP optimization: reduce water and steam 15–30% with optimized sequences`,

  utilities: `Industry benchmarks for Utility Systems:
- Boiler efficiency: >85% on HHV basis; stack temperature >200°C indicates poor economizer
- Cooling tower approach: 3–5°C optimal; >8°C indicates fill degradation or fan issues
- Steam trap failures: >5% failure rate costs $500–$2000/trap/year in steam losses
- Compressed air: specific power 5–7 kW/(m3/min); >8 indicates leaks or poor staging
- BFW deaerator: O2 target <7 ppb; higher causes corrosion and tube failures`,

  general: `General process benchmarks:
- Heat exchanger fouling: UA degradation >15% from clean = cleaning justified
- Pump BEP: operating <70% or >110% of BEP wastes 5–15% energy
- Control valve sizing: Cv at normal operation should be 60–80% of max; <30% = oversized, poor control
- VFD potential: any throttled flow with >50% runtime = VFD candidate (typical 20–40% energy savings)
- Insulation: bare surface >60°C = insulation opportunity (rule of thumb: $3–8/GJ savings)`,
};

const GOAL_GUIDANCE: Record<OptimizationGoal, string> = {
  production: `PRODUCTION OPTIMIZATION (HIGH PRIORITY):
Focus on throughput increases, debottlenecking, and yield improvements.
- Identify the bottleneck equipment (highest % of design capacity)
- Suggest operating point changes that increase main product output
- Quantify production gain as % increase and additional tonnes/year
- Consider capacity vs quality trade-offs`,

  energy: `ENERGY OPTIMIZATION (HIGH PRIORITY):
Focus on reducing energy consumption per unit of product.
- Identify highest energy consumers and compare to benchmarks
- Suggest reflux reduction, heat integration, compressor efficiency improvements
- Quantify energy savings in MWh/yr and $/yr using scenario energy prices
- Consider pinch analysis opportunities for heat exchanger networks`,

  carbon: `CARBON REDUCTION (HIGH PRIORITY):
Focus on CO2 emission reductions.
- Identify largest emission sources (fired heaters, flares, steam generation)
- Suggest fuel switching, electrification, flare minimization, process efficiency gains
- Quantify CO2 reduction in tonnes/yr and $/yr using carbon price
- Consider scope 1 and scope 2 emissions separately`,

  cost: `COST OPTIMIZATION (HIGH PRIORITY):
Focus on highest $/yr savings with shortest payback.
- Prioritize quick wins (operating changes, no capex) first
- Identify highest utility cost items and optimization potential
- Suggest utility rate optimization (time-of-use, demand management)
- Include maintenance cost avoidance (fouling, corrosion prevention)`,
};

function summarizeData(data: HYSYSImportData): string {
  const streams = data.streams ?? [];
  const units = data.units ?? [];
  const streamCount = streams.length;
  const unitCount = units.length;

  if (streamCount <= 40 && unitCount <= 40) {
    // Small: send everything
    return JSON.stringify(
      { unitSystem: data.unitSystem, streamCount, unitCount, streams, units },
      null,
      2,
    );
  }

  if (streamCount <= 80 && unitCount <= 80) {
    // Medium: compress to key fields only
    const compressedStreams = streams.map((s) => ({
      stream_id: s.stream_id,
      name: s.name,
      temperature_c: s.temperature_c,
      temperature_f: s.temperature_f,
      pressure_kpa: s.pressure_kpa,
      pressure_psig: s.pressure_psig,
      mass_flow_kg_h: s.mass_flow_kg_h,
      mass_flow_lb_h: s.mass_flow_lb_h,
      vapor_fraction: s.vapor_fraction,
    }));
    const compressedUnits = units.map((u) => ({
      unit_id: u.unit_id,
      name: u.name,
      type: u.type,
      duty_mw: u.duty_mw,
      reflux_ratio: u.reflux_ratio,
      design_limit_notes: u.design_limit_notes,
    }));
    return JSON.stringify(
      { unitSystem: data.unitSystem, streamCount, unitCount, streams: compressedStreams, units: compressedUnits },
      null,
      2,
    );
  }

  // Large: send first 30 with note
  const topStreams = streams.slice(0, 30);
  const topUnits = units.slice(0, 30);
  const omittedStreams = streamCount - topStreams.length;
  const omittedUnits = unitCount - topUnits.length;
  return JSON.stringify(
    {
      unitSystem: data.unitSystem,
      streamCount,
      unitCount,
      streams: topStreams,
      units: topUnits,
      note: `Showing first 30 of each. ${omittedStreams} additional streams and ${omittedUnits} additional units omitted for brevity.`,
    },
    null,
    2,
  );
}

function buildSuggestionsPrompt(
  data: HYSYSImportData,
  validation: ValidationResult,
  scenario: ScenarioParams,
  processType: ProcessType,
  goals: OptimizationGoal[],
  processDescription?: string,
): string {
  const scenarioStr = JSON.stringify(scenario, null, 2);
  const dataStr = summarizeData(data);

  const benchmarkSection = PROCESS_BENCHMARKS[processType];
  const goalSections = goals
    .map((g, i) => `Priority ${i + 1}:\n${GOAL_GUIDANCE[g]}`)
    .join('\n\n');

  const processDescSection = processDescription
    ? `\nPROCESS DESCRIPTION (provided by user):\n${processDescription}\n`
    : '';

  // Collect design limit notes
  const designLimits = (data.units ?? [])
    .filter((u) => u.design_limit_notes)
    .map((u) => `- ${u.unit_id ?? u.name}: ${u.design_limit_notes}`)
    .join('\n');
  const designLimitsSection = designLimits
    ? `\nEQUIPMENT DESIGN LIMITS (do NOT exceed these):\n${designLimits}`
    : '';

  return `You are a chemical process optimization expert. Analyze the following Aspen HYSYS export data and scenario parameters. Return ONLY a valid JSON object (no markdown, no code fence).
${processDescSection}
INPUT DATA (HYSYS export summary):
${dataStr}

VALIDATION SUMMARY:
- Unit system: ${validation.unitSystem}
- Inferred fields: ${validation.inferredFields.join(', ') || 'none'}
- Mass balance: ${validation.massBalanceCheck?.message ?? 'not checked'}
- Energy balance: ${validation.energyBalanceCheck?.message ?? 'not checked'}
- Issues: ${validation.issues.map((i) => i.message).join('; ') || 'none'}
${designLimitsSection}

PROCESS TYPE: ${processType.replace(/_/g, ' ')}

${benchmarkSection}

OPTIMIZATION GOALS (in priority order):
${goalSections}

SCENARIO PARAMETERS (use for $/year calculations):
${scenarioStr}

TASKS:
1. Detect bottlenecks and high-energy steps from streams and units. Compare against the process-type benchmarks above.
2. Propose 6–12 specific actions: operating-point tweaks (reflux ratio, column pressure, compressor IGV, etc.), heat-integration ideas, debottleneck options. Be conservative; stay within equipment design limits; do not suggest unsafe changes.
3. Spread suggestions across goal categories based on the priority order above. Ensure at least one suggestion per goal category requested.
4. For each suggestion provide ALL of the following fields:
   - id: "opt-N"
   - action: short title
   - category: "operating_point" | "heat_integration" | "debottleneck" | "utility" | "other"
   - goalCategory: "production" | "energy" | "carbon" | "cost"
   - expectedEffect: one sentence
   - beforeValue: current operating value as string (e.g. "Reflux ratio 1.8", "Compressor 4.2 MW")
   - afterValue: recommended operating value as string (e.g. "Reflux ratio 1.3", "Compressor 3.6 MW")
   - improvementPct: numeric percent improvement (e.g. 15.5)
   - productionGainPct (if applicable, else null)
   - energySavingsPct or energySavingsMMBtuPerYear or energySavingsMWhPerYear
   - carbonReductionTonnePerYear (if applicable, else null)
   - revenueOrSavingsUSDPerYear (use scenario prices and operatingHoursPerYear)
   - constraintsOrAssumptions
   - capexOpexNote
   - paybackYears (if capex involved, else null)
   - uncertainty: "low" | "medium" | "high"
   - dataQualityFlag (if data is missing for a metric, else null)
5. Rank by net economic benefit (revenueOrSavingsUSDPerYear). Flag data quality gaps in a separate list.

OUTPUT FORMAT (return ONLY this JSON):
{
  "dataQualityGaps": ["string list of missing or uncertain inputs"],
  "suggestions": [
    {
      "id": "opt-1",
      "action": "string",
      "category": "operating_point" | "heat_integration" | "debottleneck" | "utility" | "other",
      "goalCategory": "production" | "energy" | "carbon" | "cost",
      "expectedEffect": "string",
      "beforeValue": "string or null",
      "afterValue": "string or null",
      "improvementPct": number or null,
      "productionGainPct": number or null,
      "energySavingsPct": number or null,
      "energySavingsMMBtuPerYear": number or null,
      "energySavingsMWhPerYear": number or null,
      "carbonReductionTonnePerYear": number or null,
      "revenueOrSavingsUSDPerYear": number,
      "constraintsOrAssumptions": "string",
      "capexOpexNote": "string",
      "paybackYears": number or null,
      "uncertainty": "low" | "medium" | "high",
      "dataQualityFlag": "string or null"
    }
  ]
}

Return only the JSON object.`;
}

function parseSuggestions(json: {
  suggestions?: unknown[];
  dataQualityGaps?: string[];
}): { suggestions: OptimizationSuggestion[]; dataQualityGaps: string[] } {
  const suggestions: OptimizationSuggestion[] = [];
  const raw = Array.isArray(json.suggestions) ? json.suggestions : [];
  raw.forEach((s: Record<string, unknown>, i) => {
    const goalCat = String(s.goalCategory ?? 'cost');
    suggestions.push({
      id: typeof s.id === 'string' ? s.id : `opt-${i + 1}`,
      action: String(s.action ?? ''),
      category:
        ['operating_point', 'heat_integration', 'debottleneck', 'utility', 'other'].includes(
          String(s.category),
        )
          ? (s.category as OptimizationSuggestion['category'])
          : 'other',
      goalCategory: (['production', 'energy', 'carbon', 'cost'].includes(goalCat)
        ? goalCat
        : 'cost') as GoalCategory,
      expectedEffect: String(s.expectedEffect ?? ''),
      beforeValue: typeof s.beforeValue === 'string' ? s.beforeValue : undefined,
      afterValue: typeof s.afterValue === 'string' ? s.afterValue : undefined,
      improvementPct: typeof s.improvementPct === 'number' ? s.improvementPct : undefined,
      productionGainPct: typeof s.productionGainPct === 'number' ? s.productionGainPct : undefined,
      energySavingsPct: typeof s.energySavingsPct === 'number' ? s.energySavingsPct : undefined,
      energySavingsMMBtuPerYear:
        typeof s.energySavingsMMBtuPerYear === 'number' ? s.energySavingsMMBtuPerYear : undefined,
      energySavingsMWhPerYear:
        typeof s.energySavingsMWhPerYear === 'number' ? s.energySavingsMWhPerYear : undefined,
      carbonReductionTonnePerYear:
        typeof s.carbonReductionTonnePerYear === 'number'
          ? s.carbonReductionTonnePerYear
          : undefined,
      revenueOrSavingsUSDPerYear:
        typeof s.revenueOrSavingsUSDPerYear === 'number' ? s.revenueOrSavingsUSDPerYear : 0,
      constraintsOrAssumptions: String(s.constraintsOrAssumptions ?? ''),
      capexOpexNote: String(s.capexOpexNote ?? ''),
      paybackYears: typeof s.paybackYears === 'number' ? s.paybackYears : undefined,
      uncertainty: ['low', 'medium', 'high'].includes(String(s.uncertainty))
        ? (s.uncertainty as OptimizationSuggestion['uncertainty'])
        : 'medium',
      dataQualityFlag: typeof s.dataQualityFlag === 'string' ? s.dataQualityFlag : undefined,
    });
  });
  const dataQualityGaps = Array.isArray(json.dataQualityGaps)
    ? json.dataQualityGaps.map(String)
    : [];
  return { suggestions, dataQualityGaps };
}

function computeSummaryMetrics(suggestions: OptimizationSuggestion[]): ResultSummaryMetrics {
  let totalSavingsUSDPerYear = 0;
  let totalProductionGainPct = 0;
  let totalEnergySavingsMWhPerYear = 0;
  let totalCarbonReductionTonnePerYear = 0;
  const suggestionsByGoal: Record<GoalCategory, number> = {
    production: 0,
    energy: 0,
    carbon: 0,
    cost: 0,
  };

  for (const s of suggestions) {
    totalSavingsUSDPerYear += s.revenueOrSavingsUSDPerYear ?? 0;
    if (s.productionGainPct != null && s.productionGainPct > totalProductionGainPct) {
      totalProductionGainPct = s.productionGainPct;
    }
    totalEnergySavingsMWhPerYear += s.energySavingsMWhPerYear ?? 0;
    totalCarbonReductionTonnePerYear += s.carbonReductionTonnePerYear ?? 0;
    const goal = s.goalCategory ?? 'cost';
    suggestionsByGoal[goal] = (suggestionsByGoal[goal] ?? 0) + 1;
  }

  return {
    totalSavingsUSDPerYear,
    totalProductionGainPct,
    totalEnergySavingsMWhPerYear,
    totalCarbonReductionTonnePerYear,
    suggestionsByGoal,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data: HYSYSImportData = body.data ?? {};
    const scenario: ScenarioParams = { ...DEFAULT_SCENARIO, ...body.scenario };
    const userNotes: string | undefined = body.userNotes;

    // Extract process type and goals with defaults
    const rawProcessType = String(body.processType ?? data.processType ?? 'general');
    const processType: ProcessType = VALID_PROCESS_TYPES.includes(rawProcessType as ProcessType)
      ? (rawProcessType as ProcessType)
      : 'general';

    const rawGoals = Array.isArray(body.optimizationGoals) ? body.optimizationGoals : [];
    const optimizationGoals: OptimizationGoal[] = rawGoals.length > 0
      ? rawGoals.filter((g: string) => VALID_GOALS.includes(g as OptimizationGoal)) as OptimizationGoal[]
      : ['cost', 'energy', 'production', 'carbon'];

    const processDescription: string | undefined =
      typeof body.processDescription === 'string' && body.processDescription.trim()
        ? body.processDescription.trim()
        : undefined;

    const validation = validateHYSYSData(data);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          validation,
          suggestions: [],
          dataQualityGaps: validation.issues.map((i) => i.message),
        },
        { status: 400 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured.' },
        { status: 500 },
      );
    }

    const prompt = buildSuggestionsPrompt(data, validation, scenario, processType, optimizationGoals, processDescription);
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 12000,
      messages: [
        {
          role: 'system',
          content: 'You output only valid JSON. No markdown, no code blocks, no explanation. Be conservative with process recommendations; respect equipment limits.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    });

    const rawContent = response.choices?.[0]?.message?.content ?? '';
    if (!rawContent) {
      return NextResponse.json(
        { error: 'No response from optimization model.' },
        { status: 500 },
      );
    }

    let parsed: { suggestions?: unknown[]; dataQualityGaps?: string[] };
    try {
      const text = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const match = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : text);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON from optimization model.' },
        { status: 500 },
      );
    }

    const { suggestions, dataQualityGaps } = parseSuggestions(parsed);
    const sorted = [...suggestions].sort(
      (a, b) => b.revenueOrSavingsUSDPerYear - a.revenueOrSavingsUSDPerYear,
    );
    const topSuggestions = sorted.slice(0, 3);
    const summaryMetrics = computeSummaryMetrics(sorted);

    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const result: OptimizerRunResult = {
      runId,
      timestamp: new Date().toISOString(),
      topSuggestions,
      allSuggestions: sorted,
      dataQualityGaps,
      validationSummary: validation,
      scenarioUsed: scenario,
      userNotes,
      summaryMetrics,
      processType,
      optimizationGoals,
    };

    return NextResponse.json(result);
  } catch (e) {
    console.error('hysys-optimize error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Optimization request failed.' },
      { status: 500 },
    );
  }
}
