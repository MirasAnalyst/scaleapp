# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

### Frontend (Next.js 14)
- `npm run dev` — Start dev server (port 3000)
- `npm run build` — Production build
- `npm run lint` — ESLint

### Python Backend (FastAPI)
- `cd services/dwsim_api && uvicorn app.main:app --reload --host 0.0.0.0 --port 8081` — Dev server
- `cd services/dwsim_api && python3 -m pytest tests/ -v` — Run all tests
- `cd services/dwsim_api && python3 -m pytest tests/test_flowsheet_solver.py -v` — Run single test file
- `cd services/dwsim_api && python3 -m pytest tests/test_flowsheet_solver.py::TestSimplePump -v` — Run single test class

Both servers must run simultaneously for the app to work. The Next.js `/api/simulate` route proxies to `http://localhost:8081/simulate`.

## Build & Validation Commands

**IMPORTANT: After every code change, validate the build succeeds.**

```bash
# 1. Frontend build check — catches TypeScript and Next.js errors
npm run build 2>&1 | tail -30

# 2. Frontend lint check — catches ESLint violations
npm run lint 2>&1 | tail -20

# 3. Backend unit tests — catches solver, thermo, and unit operation regressions
cd services/dwsim_api && python3 -m pytest tests/ -v --tb=short 2>&1 | tail -40

# 4. Backend quick import check — catches missing dependencies and syntax errors
cd services/dwsim_api && python3 -c "from app.main import app; print('Backend OK')"
```

## Architecture

### Two-Process System
- **Frontend**: Next.js 14 (app router) with React Flow canvas for flowsheet editing
- **Backend**: Python FastAPI microservice using the `thermo` library (by Caleb Bell) for thermodynamic calculations

### Simulation Pipeline
1. User describes a process → `/api/flowsheet` calls Anthropic Claude to generate nodes/edges/thermo config
2. Frontend renders equipment as SVG nodes on React Flow canvas
3. User clicks Simulate → `buildSimulationPayload()` in `lib/simulation.ts` maps nodes/edges to `FlowsheetPayload`
4. `/api/simulate` proxies payload to Python backend
5. `FlowsheetSolver` in `flowsheet_solver.py` runs sequential-modular solve (Tarjan SCC for recycles, Wegstein acceleration for tear streams)
6. Results returned as `SimulationResult` with stream properties, unit duties, mass/energy balance errors

### Key Backend Files
- `services/dwsim_api/app/thermo_engine.py` — Core thermo (PT/PH/PS flash, property packages: PR, SRK, NRTL, UNIFAC, UNIQUAC)
- `services/dwsim_api/app/unit_operations.py` — 14 unit operation models + `UNIT_OP_REGISTRY` mapping type strings to classes
- `services/dwsim_api/app/flowsheet_solver.py` — Sequential-modular solver with topological sort, tear stream detection, convergence checking
- `services/dwsim_api/app/schemas.py` — Pydantic models: `FlowsheetPayload`, `SimulationResult`, `StreamResult`, `UnitResult`

### Key Frontend Files
- `app/builder/page.tsx` — Main builder page orchestrating all panels
- `components/HYSYSFlowsheetEditor.tsx` — 40+ equipment SVG node types, inline stream labels
- `lib/simulation.ts` — `buildSimulationPayload()` and TypeScript types for the simulation API
- `lib/flowsheet/handleNormalization.ts` — Assigns default sourceHandles to multi-outlet units (flash, distillation, HX) when AI omits them

### Port Mapping
Multi-outlet units (flash drums, distillation columns, 3-phase separators) use port names to route outlet streams. The solver's `_extract_port()` method normalizes AI-generated handle strings (e.g., `"vapor-top"` → `"vapor"`, `"bottoms-bottom"` → `"liquid"`). If handles are missing, the solver assigns ports positionally from `_DEFAULT_OUTLET_PORTS`.

## thermo Library Gotchas
- `CEOSGas`/`CEOSLiquid` take `eos_kwargs` as a dict param, NOT unpacked kwargs
- Single-component systems need `FlashPureVLS`, not `FlashVL`
- Flash result properties (`H`, `S`, `Cp`, `rho_mass`, `mu`) are **methods** — call with `()`
- `VF` (vapor fraction) is a property — no parentheses

## Compound Alias Resolution
AI models generate formula names (CO2, H2S, NH3) but the `thermo` library needs full names. `ThermoEngine._normalize_compound_name()` resolves aliases defined in `_COMPOUND_ALIASES`. The same resolution is used in `ConversionReactorOp._resolve_comp()` for reaction species and `ShortcutDistillationOp` for light/heavy keys.

## Reactor Energy Balance
Reactor duty must account for molar flow changes due to reaction stoichiometry. The correct formula is `duty = n_out * H_out - n_in * H_in` (NOT `n * (H_out - H_in)`). For adiabatic mode, scale enthalpy: `H_target = (n_in * H_in) / n_out`.

## Supabase Auth
Uses `@supabase/ssr` with `getAll`/`setAll` cookie pattern (NOT the deprecated `get`/`set`/`remove` pattern). Never import from `@supabase/auth-helpers-nextjs`. See `.cursor/rules/supabase.mdc` for details.

## Test Patterns
Python tests use `_make_payload()` to construct `FlowsheetPayload` objects and `_assert_balance()` to verify mass balance < 1% and energy balance < 5%. See `tests/test_ai_flowsheet_integration.py` for the canonical pattern.

## Past Mistakes — Do Not Repeat
- **shellTubeHX in recycle loops**: Don't create tight 2-unit cycles (e.g., col-regen ↔ shellTubeHX) — solver convergence tolerance (1e-6) can't handle it. Use heaterCooler for recycle paths, test shellTubeHX defaults in open-loop tests only.
- **Missing HX defaults**: `validateAndFillDefaults()` originally had zero logic for shellTubeHX/plateHX/doublePipeHX — AI-generated HX with no spec caused zero-duty passthrough + temperature cross cascade. Always add defaults for new equipment types.
- **AI prompt spec ambiguity**: Presenting equipment parameters as "optional" (e.g., "hot_outlet_temperature_c OR cold_outlet_temperature_c OR duty_kw") without emphasis causes AI to omit all three. Mark mandatory specs with "MUST specify" + "FAILURE TO SPECIFY WILL CAUSE..." language.
- **ConversionReactor limiting reagent**: Must check ALL reactant species as potential limiting reagents, not just the base component. Without this, products are created from nothing when a co-reactant (e.g., O2) has zero flow, causing 28%+ mass balance errors.
- **Distillation external condenser/reboiler**: The shortcut distillation model includes condenser and reboiler internally. AI must NOT create separate condenser, reboiler, reflux drum, or splitter nodes — this creates 30-50% mass balance errors from double-counting.
- **route.ts ES5 target**: TypeScript compiles to ES5 — do NOT use `for(const [k] of map)` (use `Array.from(map.keys())`) or function declarations inside blocks (use arrow functions). These cause silent 404s on the dev server.
- **route.ts size (144KB) crashes dev server under load**: For sustained testing (live flowsheet tests), always use `npm run build && npx next start -p 3000`. The dev server hot-reload chokes on repeated recompilation of the large file.
- **OpenAI reasoning model token budget**: `gpt-5-mini` uses `max_completion_tokens` for both reasoning AND output. Set to 16384+ (not 10000) to avoid empty responses on complex prompts. Always retry 3 times with delay.
