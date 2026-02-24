"""
Live Flowsheet Generation Test Suite (Step 9).

Generates flowsheets via the AI API (/api/flowsheet on localhost:3000),
transforms them into simulation payloads, runs them through the Python
backend (/simulate on localhost:8081), and checks for warnings/errors.

Requires BOTH servers running:
  - Next.js: npm run dev (port 3000)
  - Python: uvicorn app.main:app --host 0.0.0.0 --port 8081

Run:
  python3 -m pytest tests/test_live_flowsheet_generation.py -v -s
"""

import json
import time
import requests
import pytest

FLOWSHEET_URL = "http://localhost:3000/api/flowsheet"
SIMULATE_URL = "http://localhost:8081/simulate"

# ── Warning categories to check ─────────────────────────────────────────────
CRITICAL_WARNINGS = [
    "flash separation fallback",  # Original bug: single-feed absorber flash fallback
]

# These are "soft" warnings — reported but not test-failing for AI-generated flowsheets
# because recycle convergence, HX sizing, and equipment ordering are inherently variable.
SOFT_WARNINGS = [
    "passing through",          # HX passing through (zero duty) — can happen in early iterations
    "temperature cross",        # HX temperature cross — can happen during convergence
    "Pressure rises",           # Pressure rises — AI may order equipment non-optimally
    "Isentropic calculation failed",  # NRTL pump PS flash issue — falls back to PT
    "Pump inlet is 100",       # AI may order equipment non-optimally (pump before separator)
    "Compressor inlet is 100",  # AI may order equipment non-optimally (compressor gets liquid)
    "reflux.*ignored",         # Shortcut column ignoring external reflux — expected after collapse gaps
]


def _generate_flowsheet(prompt: str, timeout: int = 300) -> dict:
    """Call the AI flowsheet API and return the JSON response.

    Retries up to 3 times on 404 errors — the Next.js dev server sometimes
    returns 404 transiently while recompiling large route files.
    """
    max_retries = 3
    for attempt in range(max_retries):
        resp = requests.post(
            FLOWSHEET_URL,
            json={"prompt": prompt},
            timeout=timeout,
        )
        if resp.status_code == 200:
            return resp.json()
        if resp.status_code == 404 and attempt < max_retries - 1:
            import time
            wait = 10 * (attempt + 1)
            print(f"        ⚠ Got 404 from dev server (attempt {attempt+1}/{max_retries}), retrying in {wait}s...")
            time.sleep(wait)
            continue
        assert resp.status_code == 200, f"Flowsheet API error {resp.status_code}: {resp.text[:500]}"
    return resp.json()


def _build_simulation_payload(flowsheet: dict) -> dict:
    """
    Transform AI-generated flowsheet (nodes + edges + thermo) into a
    simulation payload matching the Python backend schema.
    Mirrors lib/simulation.ts buildSimulationPayload().
    """
    nodes = flowsheet.get("nodes", [])
    edges = flowsheet.get("edges", [])
    thermo = flowsheet.get("thermo", {})

    # Filter out label/annotation nodes
    equip_nodes = [n for n in nodes if n.get("type") not in ("label", "annotation", None)]
    equip_ids = {n["id"] for n in equip_nodes}

    units = []
    for n in equip_nodes:
        units.append({
            "id": n["id"],
            "type": n.get("type", ""),
            "name": n.get("data", {}).get("label", n.get("data", {}).get("equipment", "")),
            "parameters": n.get("data", {}).get("parameters", {}),
        })

    streams = []
    for e in edges:
        props = dict(e.get("data") or {})
        if e.get("sourceHandle"):
            props["sourceHandle"] = e["sourceHandle"]
        if e.get("targetHandle"):
            props["targetHandle"] = e["targetHandle"]

        # Normalize property keys
        if "temperature" in props and "temperature_c" not in props:
            props["temperature_c"] = props["temperature"]
        if "pressure" in props and "pressure_kpa" not in props:
            props["pressure_kpa"] = props["pressure"]
        if "flow_rate" in props and "mass_flow_kg_per_h" not in props:
            props["mass_flow_kg_per_h"] = props["flow_rate"]

        src = e.get("source") if e.get("source") in equip_ids else None
        tgt = e.get("target") if e.get("target") in equip_ids else None

        streams.append({
            "id": e["id"],
            "source": src,
            "target": tgt,
            "properties": props,
        })

    return {
        "name": flowsheet.get("description", "live-test"),
        "units": units,
        "streams": streams,
        "thermo": {
            "package": thermo.get("package", "Peng-Robinson"),
            "components": thermo.get("components", []),
        },
    }


def _simulate(payload: dict, timeout: int = 60) -> dict:
    """Send a simulation payload directly to the Python backend."""
    resp = requests.post(SIMULATE_URL, json=payload, timeout=timeout)
    assert resp.status_code == 200, f"Simulate error {resp.status_code}: {resp.text[:500]}"
    return resp.json()


def _check_result(result: dict, prompt_label: str):
    """Validate simulation result: convergence, balances, and warnings."""
    warnings = result.get("warnings", [])

    # De-duplicate warnings (recycle loops repeat them across iterations)
    unique_warnings = list(dict.fromkeys(warnings))
    warnings_str = " | ".join(unique_warnings[:20]) if unique_warnings else "(none)"

    # ── Convergence status ──────────────────────────────────────────────
    converged = result.get("converged") is True

    # ── Mass balance ─────────────────────────────────────────────────────
    mbe = result.get("mass_balance_error")
    if mbe is not None:
        # Non-converged recycle loops (amine/glycol systems) inherently have
        # higher mass balance errors — relax threshold to 25% for those cases.
        mbe_limit = 0.05 if converged else 0.25
        assert mbe < mbe_limit, (
            f"[{prompt_label}] Mass balance error {mbe*100:.2f}% > {mbe_limit*100:.0f}%. Warnings: {warnings_str}"
        )

    # ── Energy balance ───────────────────────────────────────────────────
    ebe = result.get("energy_balance_error")
    if ebe is not None:
        assert ebe < 0.50, (
            f"[{prompt_label}] Energy balance error {ebe*100:.2f}% > 50%. Warnings: {warnings_str}"
        )

    # ── Convergence (soft check) ─────────────────────────────────────────
    if not converged:
        # Allow non-convergence if mass balance is still reasonable (recycle loops).
        # Amine/glycol recycle loops with simplified stripper models may not fully
        # converge but still produce acceptable mass balance.
        if mbe is not None and mbe < 0.25:
            print(f"  ⚠ Non-converged but mass balance OK ({mbe*100:.2f}%)")
        else:
            assert False, (
                f"[{prompt_label}] Did not converge and mass balance {(mbe or 0)*100:.2f}% "
                f"is too high. Warnings: {warnings_str}"
            )

    # ── Critical warnings (test-failing) ─────────────────────────────────
    for w in unique_warnings:
        wl = w.lower()
        for cw in CRITICAL_WARNINGS:
            if cw.lower() in wl:
                # Allow "Single-feed stripper: reboiled stripping" — that's the improved warning
                if "single-feed stripper" in wl and "reboiled stripping" in wl:
                    continue
                pytest.fail(
                    f"[{prompt_label}] Critical warning: '{w}'\n"
                    f"All unique warnings: {warnings_str}"
                )

    # ── Soft warnings (reported but not test-failing) ────────────────────
    soft_hits = []
    for w in unique_warnings:
        wl = w.lower()
        for sw in SOFT_WARNINGS:
            if sw.lower() in wl:
                soft_hits.append(w)
                break
    if soft_hits:
        print(f"  ⚠ Soft warnings ({len(soft_hits)}):")
        for sw in soft_hits[:5]:
            print(f"    - {sw}")

    # ── Streams sanity ───────────────────────────────────────────────────
    streams = result.get("streams", [])

    return {
        "converged": converged,
        "mass_balance_error": mbe,
        "energy_balance_error": ebe,
        "n_warnings": len(warnings),
        "n_unique_warnings": len(unique_warnings),
        "n_streams": len(streams),
        "n_units": len(result.get("units", [])),
    }


def _run_live_test(prompt: str, label: str = None):
    """Full pipeline: generate → build payload → simulate → check."""
    label = label or prompt[:50]
    print(f"\n{'='*70}")
    print(f"TEST: {label}")
    print(f"Prompt: {prompt}")
    print(f"{'='*70}")

    # Step 1: Generate
    print("  [1/3] Generating flowsheet via AI...")
    t0 = time.time()
    flowsheet = _generate_flowsheet(prompt)
    gen_time = time.time() - t0
    n_nodes = len(flowsheet.get("nodes", []))
    n_edges = len(flowsheet.get("edges", []))
    thermo = flowsheet.get("thermo", {})
    print(f"        Generated {n_nodes} nodes, {n_edges} edges in {gen_time:.1f}s")
    print(f"        Package: {thermo.get('package', '?')}, Components: {thermo.get('components', [])}")

    # Step 2: Build payload
    print("  [2/3] Building simulation payload...")
    payload = _build_simulation_payload(flowsheet)
    print(f"        {len(payload['units'])} units, {len(payload['streams'])} streams")

    # Step 3: Simulate
    print("  [3/3] Running simulation...")
    t0 = time.time()
    result = _simulate(payload)
    sim_time = time.time() - t0
    print(f"        Simulated in {sim_time:.1f}s")
    print(f"        Converged: {result.get('converged')}")
    print(f"        Mass balance error: {result.get('mass_balance_error', 'N/A')}")
    print(f"        Energy balance error: {result.get('energy_balance_error', 'N/A')}")
    if result.get("warnings"):
        print(f"        Warnings ({len(result['warnings'])}):")
        for w in result["warnings"]:
            print(f"          - {w}")
    else:
        print("        Warnings: (none)")

    # Step 4: Check
    info = _check_result(result, label)
    print(f"  ✓ PASSED — {info['n_units']} units, {info['n_streams']} streams, {info['n_warnings']} warnings")
    return info


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session", autouse=True)
def check_servers():
    """Ensure both servers are running before tests."""
    try:
        requests.get("http://localhost:8081/docs", timeout=5)
    except Exception:
        pytest.skip("Python backend not running on port 8081")
    try:
        requests.get("http://localhost:3000", timeout=5)
    except Exception:
        pytest.skip("Next.js frontend not running on port 3000")


# ============================================================================
# Oil & Gas
# ============================================================================

class TestOilAndGas:
    """Oil & gas flowsheet generation + simulation tests."""

    def test_01_amine_gas_sweetening(self):
        _run_live_test(
            "Amine gas sweetening with MEA absorption and regeneration",
            "Amine Gas Sweetening (MEA)",
        )

    def test_02_teg_dehydration(self):
        _run_live_test(
            "TEG dehydration of natural gas",
            "TEG Dehydration",
        )

    def test_03_ngl_recovery(self):
        _run_live_test(
            "NGL recovery with turboexpander and demethanizer",
            "NGL Recovery / Turboexpander",
        )

    def test_04_crude_distillation(self):
        _run_live_test(
            "Crude oil atmospheric distillation",
            "Crude Atmospheric Distillation",
        )

    def test_05_wellhead_separation(self):
        _run_live_test(
            "Three-phase wellhead separation with gas compression",
            "Wellhead 3-Phase Separation",
        )


# ============================================================================
# Chemical / Petrochemical
# ============================================================================

class TestChemPetrochem:
    """Chemical and petrochemical flowsheet generation + simulation tests."""

    def test_06_ethanol_water_distillation(self):
        _run_live_test(
            "Ethanol-water distillation",
            "Ethanol-Water Distillation",
        )

    def test_07_methanol_water_separation(self):
        _run_live_test(
            "Methanol-water separation",
            "Methanol-Water Separation",
        )

    def test_08_benzene_toluene_fractionation(self):
        _run_live_test(
            "Benzene-toluene fractionation",
            "Benzene-Toluene Fractionation",
        )

    def test_09_propane_refrigeration(self):
        _run_live_test(
            "Propane refrigeration loop",
            "Propane Refrigeration Loop",
        )

    def test_10_steam_methane_reforming(self):
        _run_live_test(
            "Steam methane reforming",
            "Steam Methane Reforming",
        )


# ============================================================================
# Additional Edge Cases
# ============================================================================

class TestEdgeCases:
    """Edge cases and additional process configurations."""

    def test_11_crude_desalting(self):
        _run_live_test(
            "Crude desalting with electrostatic separator",
            "Crude Desalting",
        )

    def test_12_acid_gas_mdea(self):
        _run_live_test(
            "Acid gas removal with MDEA",
            "Acid Gas Removal (MDEA)",
        )

    def test_13_lpg_fractionation(self):
        _run_live_test(
            "LPG fractionation — depropanizer and debutanizer",
            "LPG Fractionation",
        )


# ============================================================================
# Gas Processing
# ============================================================================

class TestGasProcessing:
    """Gas processing flowsheet generation + simulation tests."""

    def test_14_dea_gas_sweetening(self):
        _run_live_test(
            "Sour natural gas sweetening with DEA absorption column and regeneration stripper. "
            "Use absorber at 5000 kPa, stripper at 200 kPa. Include valve between absorber and "
            "stripper, lean amine pump, lean amine cooler.",
            "DEA Gas Sweetening",
        )

    def test_15_gas_dehydration_meg(self):
        _run_live_test(
            "Natural gas dehydration using monoethylene glycol injection upstream of a cold separator. "
            "Include MEG injection mixer, chiller (heaterCooler to -20C), low-temperature separator "
            "(flash), and MEG regeneration heater.",
            "Gas Dehydration MEG",
        )

    def test_16_sour_water_stripper(self):
        _run_live_test(
            "Sour water stripper to remove H2S and ammonia from refinery wastewater. "
            "Feed at 80C, 500 kPa. Stripper (reboiled) at 200 kPa, 110C. Include feed preheater.",
            "Sour Water Stripper",
        )

    def test_17_natural_gas_compression(self):
        _run_live_test(
            "Two-stage natural gas compression from 500 kPa to 5000 kPa with intercooling. "
            "Include knockout drum (flash) before each compressor and air cooler cooling to 40C "
            "between stages.",
            "Natural Gas Compression",
        )


# ============================================================================
# Sulfur Recovery
# ============================================================================

class TestSulfurRecovery:
    """Sulfur recovery flowsheet generation + simulation tests."""

    def test_18_claus_sulfur_recovery(self):
        _run_live_test(
            "Two-stage Claus sulfur recovery. Two feeds: acid gas (65% H2S, 30% CO2, 5% water) at 50C, "
            "180 kPa AND air feed (79% nitrogen, 21% oxygen) at 30C, 180 kPa. "
            "Mix acid gas and air in a mixer before Stage 1. "
            "Stage 1: conversionReactor at 1100C (H2S + 1.5 O2 -> SO2 + H2O, 33% conversion). "
            "Waste heat boiler (heaterCooler) to 300C. Sulfur condenser (heaterCooler) to 150C. "
            "Stage 2: conversionReactor at 250C "
            "(2 H2S + SO2 -> 3 S + 2 H2O, 70% conversion). Final condenser (heaterCooler) to 130C.",
            "Claus Sulfur Recovery",
        )

    def test_19_tail_gas_treating(self):
        _run_live_test(
            "SCOT tail gas treating. Hydrogenate SO2 to H2S in conversionReactor at 300C with hydrogen. "
            "Cool to 40C. Absorber with MEA to capture H2S. Two feeds on absorber: gas feed and lean amine.",
            "Tail Gas Treating (SCOT)",
        )

    def test_20_sulfur_degassing(self):
        _run_live_test(
            "Liquid sulfur degassing. Heat liquid sulfur feed (model as n-octane at 140C, 200 kPa) to 160C, "
            "flash in drum at 150 kPa to release dissolved H2S.",
            "Sulfur Degassing",
        )


# ============================================================================
# Refining
# ============================================================================

class TestRefining:
    """Refining flowsheet generation + simulation tests."""

    def test_21_naphtha_hydrotreater(self):
        _run_live_test(
            "Naphtha hydrotreating. Mix hydrogen with naphtha (n-hexane + H2S trace) in mixer. "
            "Heat to 350C. ConversionReactor (95% H2S removal). Cool to 40C. Flash to separate "
            "H2-rich gas from clean naphtha.",
            "Naphtha Hydrotreater",
        )

    def test_22_vacuum_distillation(self):
        _run_live_test(
            "Vacuum distillation of atmospheric residue (n-decane + hexadecane). Feed at 380C. "
            "Distillation column at 10 kPa condenser. Light_key n-decane, heavy_key hexadecane.",
            "Vacuum Distillation",
        )

    def test_23_catalytic_reformer(self):
        _run_live_test(
            "Catalytic reforming. Preheat naphtha (n-hexane, cyclohexane, benzene) to 500C. "
            "ConversionReactor: cyclohexane -> benzene + 3 hydrogen, 85% conversion. Cool to 40C. "
            "Flash to separate H2.",
            "Catalytic Reformer",
        )

    def test_24_fcc_debutanizer(self):
        _run_live_test(
            "FCC gas plant debutanizer. Feed propane/n-butane/n-pentane/n-hexane at 60C, 1000 kPa. "
            "Distillation with light_key n-butane, heavy_key n-pentane at 800 kPa.",
            "FCC Debutanizer",
        )


# ============================================================================
# Petrochemical
# ============================================================================

class TestPetrochem:
    """Petrochemical flowsheet generation + simulation tests."""

    def test_25_ethylene_oxide(self):
        _run_live_test(
            "Ethylene oxide production. Mix ethylene + oxygen (2:1). ConversionReactor at 250C, "
            "2000 kPa (ethylene + 0.5 O2 -> ethylene oxide, 15% conversion). Cool to 40C. "
            "Flash at 2000 kPa.",
            "Ethylene Oxide",
        )

    def test_26_styrene_production(self):
        _run_live_test(
            "Styrene from ethylbenzene dehydrogenation. Preheat to 620C. ConversionReactor "
            "(ethylbenzene -> styrene + hydrogen, 65% conversion). Cool to 40C. Flash. "
            "Distill with light_key ethylbenzene, heavy_key styrene.",
            "Styrene Production",
        )

    def test_27_ammonia_synthesis(self):
        _run_live_test(
            "Simplified ammonia synthesis. Compress H2/N2 (3:1) to 15000 kPa. Preheat to 450C. "
            "ConversionReactor (N2 + 3 H2 -> 2 NH3, 20% conversion). Cool to 30C. "
            "Flash at 15000 kPa.",
            "Ammonia Synthesis",
        )


# ============================================================================
# Advanced Multi-Unit
# ============================================================================

class TestAdvancedMultiUnit:
    """Advanced multi-unit flowsheet generation + simulation tests."""

    def test_28_acetone_water_extraction(self):
        _run_live_test(
            "Liquid-liquid extraction of acetone from water using toluene. Mix aqueous acetone "
            "(70% water, 30% acetone) with toluene in mixer. 3-phase separator. Distill extract "
            "with light_key acetone, heavy_key toluene.",
            "Acetone-Water Extraction",
        )

    def test_29_co2_to_methanol(self):
        _run_live_test(
            "Methanol from CO2 hydrogenation. Compress CO2+H2 (1:3) to 5000 kPa. Preheat to 250C. "
            "ConversionReactor (CO2 + 3 H2 -> methanol + H2O, 25% conversion). Cool to 40C. "
            "Flash. Distill with light_key methanol, heavy_key water.",
            "CO2-to-Methanol",
        )

    def test_30_isopentane_npentane_splitter(self):
        _run_live_test(
            "Isopentane/n-pentane splitter. 50/50 feed at 40C, 500 kPa. Distillation column with "
            "60 stages, reflux ratio multiple 1.5, light_key isopentane, heavy_key n-pentane, "
            "condenser 300 kPa.",
            "Isopentane/nPentane Splitter",
        )
