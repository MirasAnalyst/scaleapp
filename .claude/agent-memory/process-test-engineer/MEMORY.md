# Process Test Engineer Memory

## AI Flowsheet Pipeline Debugging (2026-02-22)

### Root Cause Analysis Summary
- **Stale server was the #1 cause of mass balance errors**: A backend started without `--reload` can mask all code fixes. Always kill and restart with `--reload`.
- **Shortcut distillation + reflux loops**: The FUG model handles reflux internally. When AI generates an external reflux loop (column->condenser->drum->splitter->reflux), the recycle loop converges correctly because the column treats the reflux return as a second feed. No need to ignore the reflux inlet.
- **Multi-cycle SCCs need multiple tear streams**: The solver's `_select_tear_streams` originally picked only 1 tear per SCC. Complex topologies (e.g., TEG dehydration with absorber+HX+stripper+pump loop) need 2+ tears. Fixed with iterative tearing until the subgraph is acyclic.

### Critical Fix: Tear Stream Selection
- File: `/services/dwsim_api/app/flowsheet_solver.py`, method `_select_tear_streams`
- Old behavior: `break` after first tear per SCC
- New behavior: Iteratively tears edges and checks cycle detection (DFS) until SCC subgraph is DAG
- Impact: TEG dehydration mass balance improved from 77.76% to 0.46%

### Critical Fix: Reflux Loop Collapse (Frontend)
- File: `/app/api/flowsheet/route.ts`, function `collapseShortcutColumnRefluxLoops`
- Detects pattern: shortcut column -> condenser -> drum -> splitter -> reflux
- Collapses redundant nodes and rewires distillate directly to product
- Called early in post-processing chain (before handle validation)

### Port Alias Gotchas
- `_PORT_ALIASES["reflux"]` = `"feed"` -- reflux ports get aliased to feed
- Port collision guard in `build_from_payload` redirects duplicates to default ports
- `_extract_port("bottoms-bottom")` strips `-bottom` -> `"bottoms"` -> alias `"liquid"`
- `_extract_port("feed-stage-10")` special-cased to `"feed"`

### Test Patterns
- Clean distillation test: `TestShortcutDistillationClean` in `test_ai_flowsheet_integration.py`
- Recycle distillation test: `TestShortcutDistillationWithRecycle` -- verifies tear stream convergence
- Payload construction: wrap `components`/`property_package` into `thermo: ThermoConfig` (not top-level)

### API Testing
- `/api/flowsheet` uses `gpt-5-mini` model (valid as of 2026-02)
- `/api/simulate` proxies to `localhost:8081/simulate`
- Backend payload uses `thermo.package` and `thermo.components` (nested, not top-level)
- `heaterCooler` works with HX-style handles (hot-in-left, cold-in-bottom) via fuzzy port matching

## Test Suite
- 153 tests, all passing (as of 2026-02-22)
- 20 industrial cases in `test_20_industrial_cases.py` cover TEG, ammonia, LNG, ethylene, etc.
