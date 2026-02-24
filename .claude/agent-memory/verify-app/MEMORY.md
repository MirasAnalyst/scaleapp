# Verify-App Agent Memory

## Last Verification: 2026-02-24
- Backend: 156 tests, 0 failures (4.42s)
- Frontend: Build PASS, Lint PASS (10 warnings, 0 errors)
- Integration: All checks PASS

## Test Suite Structure
- 20 test files in `services/dwsim_api/tests/`
- `test_live_flowsheet_generation.py` requires external API -- always exclude with `--ignore`
- Largest test file: `test_ai_flowsheet_integration.py` (48 tests including 29 parametrized `_extract_port` tests)
- Total: 156 tests

## Known Benign Warnings
- `jupyter_client` DeprecationWarning about `platformdirs` migration (not project code)
- Supabase `@supabase/realtime-js` Edge Runtime warning (`process.versions`) -- upstream issue
- `caniuse-lite` outdated -- cosmetic only
- `/api/compounds` route detected as dynamic (uses `request.url`) -- expected behavior

## Known ESLint Warnings (10 total, non-blocking)
- `app/builder/page.tsx:218,229` -- missing dep `runSimulation` in useCallback
- `app/layout.tsx:30` -- custom font not in `_document.js`
- `components/FlowsheetIntegration.tsx:32` -- missing dep `initializeExampleFlowsheet`
- `components/Footer.tsx:13`, `Header.tsx:32`, `LayoutHeader.tsx:22` -- `<img>` vs `<Image />`
- `components/SimpleFlowsheetBuilder.tsx:45,52,105,113` -- unstable refs in useImperativeHandle

## Schema Gap
- Python `FlowsheetPayload` has `energy_streams`, `adjust_specs`, `set_specs`
- TypeScript `SimulationPayload` does not expose these yet
- Not blocking (Python fields are optional with defaults)

## Environment
- Python 3.13.5, pytest 9.0.2
- Next.js 14.2.15
- macOS Darwin 24.6.0
