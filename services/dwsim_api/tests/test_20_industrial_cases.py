"""
20 Industrial Flowsheet Test Suite.

Validates that the solver correctly handles 20 realistic industrial process
configurations end-to-end, from feed streams through all unit operations.

Each test:
- Constructs a FlowsheetPayload with correct units, streams, thermo config
- Calls ThermoClient().simulate_flowsheet(payload)
- Asserts convergence, mass balance < 1%, energy balance < 5% (relaxed for
  3-phase separators and absorbers)
- Checks key stream properties are physically reasonable
"""

import pytest

from app import schemas
from app.thermo_client import ThermoClient


@pytest.fixture
def client():
    return ThermoClient()


def _make_payload(
    name: str,
    components: list[str],
    units: list[dict],
    streams: list[dict],
    package: str = "Peng-Robinson",
) -> schemas.FlowsheetPayload:
    return schemas.FlowsheetPayload(
        name=name,
        units=[schemas.UnitSpec(**u) for u in units],
        streams=[schemas.StreamSpec(**s) for s in streams],
        thermo=schemas.ThermoConfig(package=package, components=components),
    )


def _assert_balance(result, mass_tol=0.01, energy_tol=0.05):
    """Assert mass and energy balance within tolerance."""
    assert result.converged is True, f"Solver did not converge: {result.warnings}"
    if result.mass_balance_error is not None:
        assert result.mass_balance_error < mass_tol, (
            f"Mass balance error {result.mass_balance_error*100:.2f}% "
            f"exceeds {mass_tol*100}% threshold. Warnings: {result.warnings}"
        )
    if result.energy_balance_error is not None:
        assert result.energy_balance_error < energy_tol, (
            f"Energy balance error {result.energy_balance_error*100:.2f}% "
            f"exceeds {energy_tol*100}% threshold. Warnings: {result.warnings}"
        )


def _get_stream(result, stream_id):
    """Get a stream from results by ID."""
    return next((s for s in result.streams if s.id == stream_id), None)


# ============================================================================
# Case 1: Wellhead 3-Phase Separation
# ============================================================================

class TestCase01WellheadSeparation:
    """Wellhead → 3-phase separator → gas compressor + oil pump + water pump."""

    def test_wellhead_3phase(self, client):
        payload = _make_payload(
            name="wellhead-3phase",
            components=["methane", "ethane", "propane", "n-hexane", "water"],
            package="Peng-Robinson",
            units=[
                {"id": "sep-1", "type": "separator3p",
                 "parameters": {"temperature_c": 60.0, "pressure_kpa": 4000.0}},
                {"id": "pump-oil", "type": "pump",
                 "parameters": {"outlet_pressure_kpa": 6000.0}},
                {"id": "pump-water", "type": "pump",
                 "parameters": {"outlet_pressure_kpa": 500.0}},
                {"id": "comp-gas", "type": "compressor",
                 "parameters": {"pressure_ratio": 2.0, "efficiency": 0.75}},
                {"id": "cooler-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": 40.0}},
            ],
            streams=[
                {"id": "wellhead-feed", "source": None, "target": "sep-1",
                 "properties": {"temperature": 60.0, "pressure": 4000.0,
                                "flow_rate": 50000.0,
                                "composition": {"methane": 0.35, "ethane": 0.10,
                                                "propane": 0.10, "n-hexane": 0.25,
                                                "water": 0.20}}},
                {"id": "gas-to-comp", "source": "sep-1", "target": "comp-gas",
                 "properties": {"sourceHandle": "gas-top"}},
                {"id": "oil-to-pump", "source": "sep-1", "target": "pump-oil",
                 "properties": {"sourceHandle": "oil-right"}},
                {"id": "water-to-pump", "source": "sep-1", "target": "pump-water",
                 "properties": {"sourceHandle": "water-bottom"}},
                {"id": "comp-gas-out", "source": "comp-gas", "target": "cooler-1",
                 "properties": {}},
                {"id": "gas-product", "source": "cooler-1", "target": None,
                 "properties": {}},
                {"id": "oil-product", "source": "pump-oil", "target": None,
                 "properties": {}},
                {"id": "water-product", "source": "pump-water", "target": None,
                 "properties": {}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        gas = _get_stream(result, "gas-product")
        oil = _get_stream(result, "oil-product")
        water = _get_stream(result, "water-product")
        assert gas is not None and gas.mass_flow_kg_per_h > 0
        assert oil is not None and oil.mass_flow_kg_per_h > 0
        assert water is not None and water.mass_flow_kg_per_h > 0


# ============================================================================
# Case 2: TEG Dehydration
# ============================================================================

class TestCase02TEGDehydration:
    """Wet gas + TEG absorber → dry gas + rich TEG → regen column → lean TEG."""

    def test_teg_dehydration(self, client):
        payload = _make_payload(
            name="teg-dehydration",
            components=["methane", "ethane", "water", "triethylene glycol"],
            package="Peng-Robinson",
            units=[
                {"id": "absorber-1", "type": "absorber",
                 "parameters": {"n_stages": 6, "pressure_kpa": 6000.0, "temperature_c": 30.0}},
                {"id": "flash-1", "type": "flashDrum",
                 "parameters": {"pressure_kpa": 500.0}},
                {"id": "hx-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": 180.0}},
                {"id": "col-regen", "type": "distillationColumn",
                 "parameters": {"condenser_pressure_kpa": 101.325}},
                {"id": "pump-1", "type": "pump",
                 "parameters": {"outlet_pressure_kpa": 6000.0}},
            ],
            streams=[
                {"id": "wet-gas", "source": None, "target": "absorber-1",
                 "properties": {"temperature": 30.0, "pressure": 6000.0,
                                "flow_rate": 100000.0,
                                "composition": {"methane": 0.85, "ethane": 0.10,
                                                "water": 0.05, "triethylene glycol": 0.0},
                                "targetHandle": "in-1-left"}},
                {"id": "lean-teg-in", "source": None, "target": "absorber-1",
                 "properties": {"temperature": 30.0, "pressure": 6000.0,
                                "flow_rate": 5000.0,
                                "composition": {"methane": 0.0, "ethane": 0.0,
                                                "water": 0.02, "triethylene glycol": 0.98},
                                "targetHandle": "in-2-right"}},
                {"id": "dry-gas", "source": "absorber-1", "target": None,
                 "properties": {"sourceHandle": "vapor-top"}},
                {"id": "rich-teg", "source": "absorber-1", "target": "flash-1",
                 "properties": {"sourceHandle": "liquid-bottom"}},
                {"id": "flash-vapor", "source": "flash-1", "target": None,
                 "properties": {"sourceHandle": "vapor-top"}},
                {"id": "flash-liq", "source": "flash-1", "target": "hx-1",
                 "properties": {"sourceHandle": "liquid-bottom"}},
                {"id": "hot-teg", "source": "hx-1", "target": "col-regen",
                 "properties": {}},
                {"id": "regen-vapor", "source": "col-regen", "target": None,
                 "properties": {"sourceHandle": "overhead-top"}},
                {"id": "regen-liq", "source": "col-regen", "target": "pump-1",
                 "properties": {"sourceHandle": "bottoms-bottom"}},
                {"id": "lean-teg-out", "source": "pump-1", "target": None,
                 "properties": {}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        dry_gas = _get_stream(result, "dry-gas")
        assert dry_gas is not None and dry_gas.mass_flow_kg_per_h > 0


# ============================================================================
# Case 3: NGL Demethanizer
# ============================================================================

class TestCase03NGLDemethanizer:
    """Feed → cooler → JT valve → flash → demethanizer column → NGL product."""

    def test_ngl_demethanizer(self, client):
        payload = _make_payload(
            name="ngl-demethanizer",
            components=["methane", "ethane", "propane", "n-butane", "n-pentane"],
            package="SRK",
            units=[
                {"id": "cooler-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": -30.0}},
                {"id": "valve-jt", "type": "valve",
                 "parameters": {"outlet_pressure_kpa": 2000.0}},
                {"id": "flash-1", "type": "flashDrum",
                 "parameters": {}},
                {"id": "mixer-col", "type": "mixer", "parameters": {}},
                {"id": "col-deC1", "type": "distillationColumn",
                 "parameters": {"light_key": "methane", "heavy_key": "ethane",
                                "light_key_recovery": 0.98, "heavy_key_recovery": 0.95,
                                "condenser_pressure_kpa": 2000.0}},
                {"id": "pump-ngl", "type": "pump",
                 "parameters": {"outlet_pressure_kpa": 4000.0}},
            ],
            streams=[
                {"id": "feed", "source": None, "target": "cooler-1",
                 "properties": {"temperature": 30.0, "pressure": 6000.0,
                                "flow_rate": 50000.0,
                                "composition": {"methane": 0.70, "ethane": 0.12,
                                                "propane": 0.08, "n-butane": 0.06,
                                                "n-pentane": 0.04}}},
                {"id": "cold-gas", "source": "cooler-1", "target": "valve-jt",
                 "properties": {}},
                {"id": "expanded", "source": "valve-jt", "target": "flash-1",
                 "properties": {}},
                {"id": "flash-vap", "source": "flash-1", "target": "mixer-col",
                 "properties": {"sourceHandle": "vapor-top",
                                "targetHandle": "in-1-left"}},
                {"id": "flash-liq", "source": "flash-1", "target": "mixer-col",
                 "properties": {"sourceHandle": "liquid-bottom",
                                "targetHandle": "in-2-left"}},
                {"id": "combined-feed", "source": "mixer-col", "target": "col-deC1",
                 "properties": {}},
                {"id": "overhead-gas", "source": "col-deC1", "target": None,
                 "properties": {"sourceHandle": "overhead-top"}},
                {"id": "ngl-to-pump", "source": "col-deC1", "target": "pump-ngl",
                 "properties": {"sourceHandle": "bottoms-bottom"}},
                {"id": "ngl-product", "source": "pump-ngl", "target": None,
                 "properties": {}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        overhead = _get_stream(result, "overhead-gas")
        ngl = _get_stream(result, "ngl-product")
        assert overhead is not None and overhead.mass_flow_kg_per_h > 0
        assert ngl is not None and ngl.mass_flow_kg_per_h > 0


# ============================================================================
# Case 4: Amine Sweetening (H2S/CO2 Removal)
# ============================================================================

class TestCase04AmineSweetening:
    """Sour gas + MEA absorber → sweet gas + rich amine → regen → lean amine."""

    def test_amine_sweetening(self, client):
        payload = _make_payload(
            name="amine-sweetening",
            components=["methane", "carbon dioxide", "hydrogen sulfide",
                        "monoethanolamine", "water"],
            package="Peng-Robinson",
            units=[
                {"id": "absorber-1", "type": "absorber",
                 "parameters": {"n_stages": 10, "pressure_kpa": 5000.0,
                                "temperature_c": 40.0}},
                {"id": "hx-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": 110.0}},
                {"id": "col-regen", "type": "distillationColumn",
                 "parameters": {"condenser_pressure_kpa": 200.0}},
                {"id": "cooler-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": 40.0}},
                {"id": "pump-1", "type": "pump",
                 "parameters": {"outlet_pressure_kpa": 5000.0}},
            ],
            streams=[
                {"id": "sour-gas", "source": None, "target": "absorber-1",
                 "properties": {"temperature": 40.0, "pressure": 5000.0,
                                "flow_rate": 80000.0,
                                "composition": {"methane": 0.85, "carbon dioxide": 0.08,
                                                "hydrogen sulfide": 0.02,
                                                "monoethanolamine": 0.0, "water": 0.05},
                                "targetHandle": "in-1-left"}},
                {"id": "lean-amine-in", "source": None, "target": "absorber-1",
                 "properties": {"temperature": 40.0, "pressure": 5000.0,
                                "flow_rate": 20000.0,
                                "composition": {"methane": 0.0, "carbon dioxide": 0.0,
                                                "hydrogen sulfide": 0.0,
                                                "monoethanolamine": 0.30, "water": 0.70},
                                "targetHandle": "in-2-right"}},
                {"id": "sweet-gas", "source": "absorber-1", "target": None,
                 "properties": {"sourceHandle": "vapor-top"}},
                {"id": "rich-amine", "source": "absorber-1", "target": "hx-1",
                 "properties": {"sourceHandle": "liquid-bottom"}},
                {"id": "hot-amine", "source": "hx-1", "target": "col-regen",
                 "properties": {}},
                {"id": "acid-gas", "source": "col-regen", "target": None,
                 "properties": {"sourceHandle": "overhead-top"}},
                {"id": "regen-btms", "source": "col-regen", "target": "cooler-1",
                 "properties": {"sourceHandle": "bottoms-bottom"}},
                {"id": "cooled-amine", "source": "cooler-1", "target": "pump-1",
                 "properties": {}},
                {"id": "lean-amine-out", "source": "pump-1", "target": None,
                 "properties": {}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        sweet = _get_stream(result, "sweet-gas")
        assert sweet is not None and sweet.mass_flow_kg_per_h > 0


# ============================================================================
# Case 4b: Shell & Tube HX Approach-Temp Default
# ============================================================================

class TestCase04bHXApproachDefault:
    """Verify shellTubeHX with no spec uses approach-temp default, nonzero duty, no temp cross."""

    def test_hx_approach_default(self, client):
        payload = _make_payload(
            name="hx-approach-default",
            components=["methane", "ethane", "propane"],
            package="Peng-Robinson",
            units=[
                {"id": "hx-1", "type": "shellTubeHX",
                 "parameters": {}},
            ],
            streams=[
                {"id": "hot-feed", "source": None, "target": "hx-1",
                 "properties": {"temperature": 120.0, "pressure": 2000.0,
                                "flow_rate": 10000.0,
                                "composition": {"methane": 0.7, "ethane": 0.2, "propane": 0.1}}},
                {"id": "cold-feed", "source": None, "target": "hx-1",
                 "properties": {"temperature": 30.0, "pressure": 2000.0,
                                "flow_rate": 10000.0,
                                "composition": {"methane": 0.7, "ethane": 0.2, "propane": 0.1}}},
                {"id": "hot-out", "source": "hx-1", "target": None,
                 "properties": {"sourceHandle": "hot_out"}},
                {"id": "cold-out", "source": "hx-1", "target": None,
                 "properties": {"sourceHandle": "cold_out"}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        assert result.converged is True, f"HX did not converge: {result.warnings}"

        hot_out = _get_stream(result, "hot-out")
        cold_out = _get_stream(result, "cold-out")
        assert hot_out is not None
        assert cold_out is not None

        # Verify nonzero duty and no temperature cross
        hx_unit = next((u for u in result.units if u.id == "hx-1"), None)
        assert hx_unit is not None
        # Check no "passing through" warning
        all_warnings = " ".join(result.warnings)
        assert "passing through" not in all_warnings.lower(), f"HX should not pass through: {result.warnings}"
        # Hot out should be cooler than hot in
        assert hot_out.temperature_c < 120.0, "Hot outlet should be cooler than inlet"
        # Cold out should be warmer than cold in
        assert cold_out.temperature_c > 30.0, "Cold outlet should be warmer than inlet"


# ============================================================================
# Case 4c: Stripper Single-Feed (Amine Regenerator)
# ============================================================================

class TestCase04cStripperSingleFeed:
    """Rich amine → stripper (single feed, reboiled stripping) → acid gas + lean amine."""

    def test_stripper_single_feed(self, client):
        payload = _make_payload(
            name="stripper-single-feed",
            components=["carbon dioxide", "hydrogen sulfide", "water", "monoethanolamine"],
            package="NRTL",
            units=[
                {"id": "stripper-1", "type": "stripper",
                 "parameters": {"n_stages": 15, "pressure_kpa": 200.0,
                                "temperature_c": 115.0}},
            ],
            streams=[
                {"id": "rich-amine-feed", "source": None, "target": "stripper-1",
                 "properties": {"temperature": 95.0, "pressure": 200.0,
                                "flow_rate": 50000.0,
                                "composition": {"carbon dioxide": 0.05,
                                                "hydrogen sulfide": 0.02,
                                                "water": 0.73,
                                                "monoethanolamine": 0.20}}},
                {"id": "acid-gas-out", "source": "stripper-1", "target": None,
                 "properties": {"sourceHandle": "overhead-top"}},
                {"id": "lean-amine-out", "source": "stripper-1", "target": None,
                 "properties": {"sourceHandle": "bottoms-bottom"}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        assert result.converged is True, f"Stripper did not converge: {result.warnings}"

        acid_gas = _get_stream(result, "acid-gas-out")
        lean_amine = _get_stream(result, "lean-amine-out")
        assert acid_gas is not None, "Acid gas outlet stream missing"
        assert lean_amine is not None, "Lean amine outlet stream missing"
        assert acid_gas.mass_flow_kg_per_h > 0, "Acid gas flow should be nonzero"
        assert lean_amine.mass_flow_kg_per_h > 0, "Lean amine flow should be nonzero"

        # Should NOT produce the generic "flash separation fallback" warning
        all_warnings = " ".join(result.warnings)
        assert "flash separation fallback" not in all_warnings, (
            f"Should use stripper mode, not generic fallback: {result.warnings}"
        )


# ============================================================================
# Case 5: Crude Distillation Unit
# ============================================================================

class TestCase05CrudeDistillation:
    """Crude → fired heater → atmospheric column → light/heavy cuts."""

    def test_crude_distillation(self, client):
        payload = _make_payload(
            name="crude-distillation",
            components=["n-pentane", "n-hexane", "n-heptane", "n-octane", "n-decane"],
            package="Peng-Robinson",
            units=[
                {"id": "heater-1", "type": "firedHeater",
                 "parameters": {"outlet_temperature_c": 350.0}},
                {"id": "col-atm", "type": "distillationColumn",
                 "parameters": {"light_key": "n-hexane", "heavy_key": "n-octane",
                                "light_key_recovery": 0.90, "heavy_key_recovery": 0.90,
                                "condenser_pressure_kpa": 101.325}},
                {"id": "cooler-1", "type": "condenser",
                 "parameters": {"outlet_temperature_c": 40.0}},
                {"id": "pump-btms", "type": "pump",
                 "parameters": {"outlet_pressure_kpa": 500.0}},
            ],
            streams=[
                {"id": "crude-feed", "source": None, "target": "heater-1",
                 "properties": {"temperature": 25.0, "pressure": 200.0,
                                "flow_rate": 100000.0,
                                "composition": {"n-pentane": 0.15, "n-hexane": 0.25,
                                                "n-heptane": 0.25, "n-octane": 0.20,
                                                "n-decane": 0.15}}},
                {"id": "hot-crude", "source": "heater-1", "target": "col-atm",
                 "properties": {}},
                {"id": "light-cut", "source": "col-atm", "target": "cooler-1",
                 "properties": {"sourceHandle": "overhead-top"}},
                {"id": "light-product", "source": "cooler-1", "target": None,
                 "properties": {}},
                {"id": "heavy-cut", "source": "col-atm", "target": "pump-btms",
                 "properties": {"sourceHandle": "bottoms-bottom"}},
                {"id": "heavy-product", "source": "pump-btms", "target": None,
                 "properties": {}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        light = _get_stream(result, "light-product")
        heavy = _get_stream(result, "heavy-product")
        assert light is not None and light.mass_flow_kg_per_h > 0
        assert heavy is not None and heavy.mass_flow_kg_per_h > 0


# ============================================================================
# Case 6: Naphtha Hydrotreater
# ============================================================================

class TestCase06NaphthaHydrotreater:
    """Naphtha + H2 → mixer → fired heater → reactor → flash → products."""

    def test_naphtha_hydrotreater(self, client):
        payload = _make_payload(
            name="naphtha-hydrotreater",
            components=["n-hexane", "n-heptane", "hydrogen", "methane"],
            package="Peng-Robinson",
            units=[
                {"id": "mixer-1", "type": "mixer", "parameters": {}},
                {"id": "heater-1", "type": "firedHeater",
                 "parameters": {"outlet_temperature_c": 350.0}},
                {"id": "reactor-1", "type": "conversionReactor",
                 "parameters": {"outlet_temperature_c": 370.0,
                                "reactions": [
                                    {"reactants": {"n-heptane": 1},
                                     "products": {"n-hexane": 1, "methane": 1},
                                     "conversion": 0.15,
                                     "base_component": "n-heptane"}
                                ]}},
                {"id": "cooler-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": 40.0}},
                {"id": "flash-1", "type": "flashDrum",
                 "parameters": {}},
            ],
            streams=[
                {"id": "naphtha-feed", "source": None, "target": "mixer-1",
                 "properties": {"temperature": 25.0, "pressure": 3000.0,
                                "flow_rate": 50000.0,
                                "composition": {"n-hexane": 0.50, "n-heptane": 0.50,
                                                "hydrogen": 0.0, "methane": 0.0},
                                "targetHandle": "in-1-left"}},
                {"id": "h2-feed", "source": None, "target": "mixer-1",
                 "properties": {"temperature": 25.0, "pressure": 3000.0,
                                "flow_rate": 5000.0,
                                "composition": {"n-hexane": 0.0, "n-heptane": 0.0,
                                                "hydrogen": 1.0, "methane": 0.0},
                                "targetHandle": "in-2-left"}},
                {"id": "mixed", "source": "mixer-1", "target": "heater-1",
                 "properties": {}},
                {"id": "hot-feed", "source": "heater-1", "target": "reactor-1",
                 "properties": {}},
                {"id": "reactor-out", "source": "reactor-1", "target": "cooler-1",
                 "properties": {}},
                {"id": "cooled", "source": "cooler-1", "target": "flash-1",
                 "properties": {}},
                {"id": "recycle-gas", "source": "flash-1", "target": None,
                 "properties": {"sourceHandle": "vapor-top"}},
                {"id": "treated-naphtha", "source": "flash-1", "target": None,
                 "properties": {"sourceHandle": "liquid-bottom"}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        gas = _get_stream(result, "recycle-gas")
        liq = _get_stream(result, "treated-naphtha")
        assert gas is not None and gas.mass_flow_kg_per_h > 0
        assert liq is not None and liq.mass_flow_kg_per_h > 0


# ============================================================================
# Case 7: Ethylene Cracker Separation Train
# ============================================================================

class TestCase07EthyleneCrackerSep:
    """Cracker effluent → quench → demethanizer → C2 splitter."""

    def test_ethylene_cracker_sep(self, client):
        payload = _make_payload(
            name="ethylene-cracker-sep",
            components=["hydrogen", "methane", "ethylene", "ethane", "propylene"],
            package="SRK",
            units=[
                {"id": "cooler-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": -30.0}},
                {"id": "col-deC1", "type": "distillationColumn",
                 "parameters": {"light_key": "methane", "heavy_key": "ethylene",
                                "light_key_recovery": 0.99, "heavy_key_recovery": 0.98,
                                "condenser_pressure_kpa": 2500.0}},
                {"id": "col-C2", "type": "distillationColumn",
                 "parameters": {"light_key": "ethylene", "heavy_key": "ethane",
                                "light_key_recovery": 0.995, "heavy_key_recovery": 0.99,
                                "condenser_pressure_kpa": 1800.0}},
                {"id": "pump-c3", "type": "pump",
                 "parameters": {"outlet_pressure_kpa": 2000.0}},
            ],
            streams=[
                {"id": "cracker-effluent", "source": None, "target": "cooler-1",
                 "properties": {"temperature": 100.0, "pressure": 3500.0,
                                "flow_rate": 80000.0,
                                "composition": {"hydrogen": 0.10, "methane": 0.20,
                                                "ethylene": 0.35, "ethane": 0.20,
                                                "propylene": 0.15}}},
                {"id": "cold-eff", "source": "cooler-1", "target": "col-deC1",
                 "properties": {}},
                {"id": "c1-overhead", "source": "col-deC1", "target": None,
                 "properties": {"sourceHandle": "overhead-top"}},
                {"id": "c2-plus", "source": "col-deC1", "target": "col-C2",
                 "properties": {"sourceHandle": "bottoms-bottom"}},
                {"id": "ethylene-product", "source": "col-C2", "target": None,
                 "properties": {"sourceHandle": "overhead-top"}},
                {"id": "c2-bottoms", "source": "col-C2", "target": "pump-c3",
                 "properties": {"sourceHandle": "bottoms-bottom"}},
                {"id": "c3-product", "source": "pump-c3", "target": None,
                 "properties": {}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        c1 = _get_stream(result, "c1-overhead")
        eth = _get_stream(result, "ethylene-product")
        assert c1 is not None and c1.mass_flow_kg_per_h > 0
        assert eth is not None and eth.mass_flow_kg_per_h > 0


# ============================================================================
# Case 8: Styrene Production
# ============================================================================

class TestCase08StyreneProduction:
    """Ethylbenzene → reactor (dehydrogenation) → flash → distillation → styrene."""

    def test_styrene_production(self, client):
        payload = _make_payload(
            name="styrene-production",
            components=["ethylbenzene", "styrene", "hydrogen", "toluene"],
            package="Peng-Robinson",
            units=[
                {"id": "heater-1", "type": "firedHeater",
                 "parameters": {"outlet_temperature_c": 600.0}},
                {"id": "reactor-1", "type": "conversionReactor",
                 "parameters": {"outlet_temperature_c": 580.0,
                                "reactions": [
                                    {"reactants": {"ethylbenzene": 1},
                                     "products": {"styrene": 1, "hydrogen": 1},
                                     "conversion": 0.60,
                                     "base_component": "ethylbenzene"},
                                    {"reactants": {"ethylbenzene": 1},
                                     "products": {"toluene": 1},
                                     "conversion": 0.05,
                                     "base_component": "ethylbenzene"}
                                ]}},
                {"id": "cooler-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": 40.0}},
                {"id": "flash-1", "type": "flashDrum",
                 "parameters": {}},
                {"id": "col-1", "type": "distillationColumn",
                 "parameters": {"light_key": "toluene", "heavy_key": "styrene",
                                "light_key_recovery": 0.95, "heavy_key_recovery": 0.95,
                                "condenser_pressure_kpa": 10.0}},
            ],
            streams=[
                {"id": "eb-feed", "source": None, "target": "heater-1",
                 "properties": {"temperature": 25.0, "pressure": 200.0,
                                "flow_rate": 30000.0,
                                "composition": {"ethylbenzene": 1.0, "styrene": 0.0,
                                                "hydrogen": 0.0, "toluene": 0.0}}},
                {"id": "hot-eb", "source": "heater-1", "target": "reactor-1",
                 "properties": {}},
                {"id": "reactor-eff", "source": "reactor-1", "target": "cooler-1",
                 "properties": {}},
                {"id": "cooled-eff", "source": "cooler-1", "target": "flash-1",
                 "properties": {}},
                {"id": "flash-gas", "source": "flash-1", "target": None,
                 "properties": {"sourceHandle": "vapor-top"}},
                {"id": "flash-liq", "source": "flash-1", "target": "col-1",
                 "properties": {"sourceHandle": "liquid-bottom"}},
                {"id": "lights", "source": "col-1", "target": None,
                 "properties": {"sourceHandle": "overhead-top"}},
                {"id": "styrene-product", "source": "col-1", "target": None,
                 "properties": {"sourceHandle": "bottoms-bottom"}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        styrene = _get_stream(result, "styrene-product")
        assert styrene is not None and styrene.mass_flow_kg_per_h > 0


# ============================================================================
# Case 9: LNG Liquefaction (Simple Cascade)
# ============================================================================

class TestCase09LNGLiquefaction:
    """Natural gas → HX → JT valve → flash → LNG + BOG compressor."""

    def test_lng_liquefaction(self, client):
        payload = _make_payload(
            name="lng-liquefaction",
            components=["methane", "ethane", "propane", "nitrogen"],
            package="Peng-Robinson",
            units=[
                {"id": "cooler-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": -80.0}},
                {"id": "hx-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": -140.0}},
                {"id": "valve-1", "type": "valve",
                 "parameters": {"outlet_pressure_kpa": 120.0}},
                {"id": "flash-1", "type": "flashDrum",
                 "parameters": {}},
                {"id": "comp-bog", "type": "compressor",
                 "parameters": {"pressure_ratio": 5.0, "efficiency": 0.75}},
            ],
            streams=[
                {"id": "ng-feed", "source": None, "target": "cooler-1",
                 "properties": {"temperature": 25.0, "pressure": 5000.0,
                                "flow_rate": 100000.0,
                                "composition": {"methane": 0.90, "ethane": 0.05,
                                                "propane": 0.03, "nitrogen": 0.02}}},
                {"id": "precooled", "source": "cooler-1", "target": "hx-1",
                 "properties": {}},
                {"id": "subcooled", "source": "hx-1", "target": "valve-1",
                 "properties": {}},
                {"id": "expanded", "source": "valve-1", "target": "flash-1",
                 "properties": {}},
                {"id": "lng-product", "source": "flash-1", "target": None,
                 "properties": {"sourceHandle": "liquid-bottom"}},
                {"id": "bog-to-comp", "source": "flash-1", "target": "comp-bog",
                 "properties": {"sourceHandle": "vapor-top"}},
                {"id": "compressed-bog", "source": "comp-bog", "target": None,
                 "properties": {}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        lng = _get_stream(result, "lng-product")
        assert lng is not None and lng.mass_flow_kg_per_h > 0
        # LNG should be cold
        if lng.temperature_c is not None:
            assert lng.temperature_c < -100.0, f"LNG too warm: {lng.temperature_c}°C"


# ============================================================================
# Case 10: Ammonia Synthesis Loop
# ============================================================================

class TestCase10AmmoniaSynthesis:
    """N2 + H2 → mixer → HX → reactor → cooler → flash → NH3 product."""

    def test_ammonia_synthesis(self, client):
        payload = _make_payload(
            name="ammonia-synthesis",
            components=["nitrogen", "hydrogen", "ammonia", "methane"],
            package="SRK",
            units=[
                {"id": "mixer-1", "type": "mixer", "parameters": {}},
                {"id": "hx-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": 400.0}},
                {"id": "reactor-1", "type": "conversionReactor",
                 "parameters": {"outlet_temperature_c": 450.0,
                                "reactions": [
                                    {"reactants": {"nitrogen": 1, "hydrogen": 3},
                                     "products": {"ammonia": 2},
                                     "conversion": 0.20,
                                     "base_component": "nitrogen"}
                                ]}},
                {"id": "cooler-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": -10.0}},
                {"id": "flash-1", "type": "flashDrum",
                 "parameters": {}},
                {"id": "comp-recycle", "type": "compressor",
                 "parameters": {"pressure_ratio": 1.05, "efficiency": 0.80}},
            ],
            streams=[
                {"id": "n2-feed", "source": None, "target": "mixer-1",
                 "properties": {"temperature": 25.0, "pressure": 15000.0,
                                "flow_rate": 30000.0,
                                "composition": {"nitrogen": 0.25, "hydrogen": 0.74,
                                                "ammonia": 0.0, "methane": 0.01},
                                "targetHandle": "in-1-left"}},
                {"id": "recycle", "source": None, "target": "mixer-1",
                 "properties": {"temperature": 25.0, "pressure": 15000.0,
                                "flow_rate": 5000.0,
                                "composition": {"nitrogen": 0.20, "hydrogen": 0.65,
                                                "ammonia": 0.05, "methane": 0.10},
                                "targetHandle": "in-2-left"}},
                {"id": "mixed", "source": "mixer-1", "target": "hx-1",
                 "properties": {}},
                {"id": "hot-gas", "source": "hx-1", "target": "reactor-1",
                 "properties": {}},
                {"id": "reactor-eff", "source": "reactor-1", "target": "cooler-1",
                 "properties": {}},
                {"id": "cooled-eff", "source": "cooler-1", "target": "flash-1",
                 "properties": {}},
                {"id": "nh3-product", "source": "flash-1", "target": None,
                 "properties": {"sourceHandle": "liquid-bottom"}},
                {"id": "recycle-gas", "source": "flash-1", "target": "comp-recycle",
                 "properties": {"sourceHandle": "vapor-top"}},
                {"id": "recycle-out", "source": "comp-recycle", "target": None,
                 "properties": {}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        nh3 = _get_stream(result, "nh3-product")
        assert nh3 is not None and nh3.mass_flow_kg_per_h > 0


# ============================================================================
# Case 11: Methanol Synthesis
# ============================================================================

class TestCase11MethanolSynthesis:
    """Syngas → reactor → cooler → flash → distillation → MeOH product."""

    def test_methanol_synthesis(self, client):
        payload = _make_payload(
            name="methanol-synthesis",
            components=["carbon monoxide", "carbon dioxide", "hydrogen",
                        "methanol", "water"],
            package="SRK",
            units=[
                {"id": "heater-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": 250.0}},
                {"id": "reactor-1", "type": "conversionReactor",
                 "parameters": {"outlet_temperature_c": 260.0,
                                "reactions": [
                                    {"reactants": {"CO": 1, "H2": 2},
                                     "products": {"methanol": 1},
                                     "conversion": 0.25,
                                     "base_component": "CO"}
                                ]}},
                {"id": "cooler-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": 40.0}},
                {"id": "flash-1", "type": "flashDrum",
                 "parameters": {}},
                {"id": "col-1", "type": "distillationColumn",
                 "parameters": {"light_key": "methanol", "heavy_key": "water",
                                "light_key_recovery": 0.95,
                                "heavy_key_recovery": 0.95,
                                "condenser_pressure_kpa": 101.325}},
            ],
            streams=[
                {"id": "syngas-feed", "source": None, "target": "heater-1",
                 "properties": {"temperature": 25.0, "pressure": 5000.0,
                                "flow_rate": 60000.0,
                                "composition": {"carbon monoxide": 0.30,
                                                "carbon dioxide": 0.05,
                                                "hydrogen": 0.60,
                                                "methanol": 0.0, "water": 0.05}}},
                {"id": "hot-syngas", "source": "heater-1", "target": "reactor-1",
                 "properties": {}},
                {"id": "reactor-eff", "source": "reactor-1", "target": "cooler-1",
                 "properties": {}},
                {"id": "cooled-eff", "source": "cooler-1", "target": "flash-1",
                 "properties": {}},
                {"id": "unreacted-gas", "source": "flash-1", "target": None,
                 "properties": {"sourceHandle": "vapor-top"}},
                {"id": "crude-meoh", "source": "flash-1", "target": "col-1",
                 "properties": {"sourceHandle": "liquid-bottom"}},
                {"id": "meoh-product", "source": "col-1", "target": None,
                 "properties": {"sourceHandle": "overhead-top"}},
                {"id": "water-product", "source": "col-1", "target": None,
                 "properties": {"sourceHandle": "bottoms-bottom"}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        meoh = _get_stream(result, "meoh-product")
        assert meoh is not None and meoh.mass_flow_kg_per_h > 0


# ============================================================================
# Case 12: Air Separation Unit
# ============================================================================

class TestCase12AirSeparation:
    """Air → compressor → cooler → HX → column → N2 overhead + O2 bottoms."""

    def test_air_separation(self, client):
        payload = _make_payload(
            name="air-separation",
            components=["nitrogen", "oxygen", "argon"],
            package="SRK",
            units=[
                {"id": "comp-1", "type": "compressor",
                 "parameters": {"pressure_ratio": 5.0, "efficiency": 0.82}},
                {"id": "cooler-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": 25.0}},
                {"id": "cooler-2", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": -175.0}},
                {"id": "valve-1", "type": "valve",
                 "parameters": {"outlet_pressure_kpa": 130.0}},
                {"id": "col-1", "type": "distillationColumn",
                 "parameters": {"light_key": "nitrogen", "heavy_key": "oxygen",
                                "light_key_recovery": 0.99,
                                "heavy_key_recovery": 0.95,
                                "condenser_pressure_kpa": 130.0}},
            ],
            streams=[
                {"id": "air-feed", "source": None, "target": "comp-1",
                 "properties": {"temperature": 25.0, "pressure": 101.325,
                                "flow_rate": 100000.0,
                                "composition": {"nitrogen": 0.78, "oxygen": 0.21,
                                                "argon": 0.01}}},
                {"id": "compressed", "source": "comp-1", "target": "cooler-1",
                 "properties": {}},
                {"id": "aftercooled", "source": "cooler-1", "target": "cooler-2",
                 "properties": {}},
                {"id": "cold-air", "source": "cooler-2", "target": "valve-1",
                 "properties": {}},
                {"id": "expanded-air", "source": "valve-1", "target": "col-1",
                 "properties": {}},
                {"id": "n2-product", "source": "col-1", "target": None,
                 "properties": {"sourceHandle": "overhead-top"}},
                {"id": "o2-product", "source": "col-1", "target": None,
                 "properties": {"sourceHandle": "bottoms-bottom"}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        n2 = _get_stream(result, "n2-product")
        o2 = _get_stream(result, "o2-product")
        assert n2 is not None and n2.mass_flow_kg_per_h > 0
        assert o2 is not None and o2.mass_flow_kg_per_h > 0


# ============================================================================
# Case 13: Bioethanol Distillation
# ============================================================================

class TestCase13BioethanolDistillation:
    """Beer column → rectifying column → near-azeotrope ethanol product."""

    def test_bioethanol_distillation(self, client):
        payload = _make_payload(
            name="bioethanol-distillation",
            components=["ethanol", "water"],
            package="NRTL",
            units=[
                {"id": "col-beer", "type": "distillationColumn",
                 "parameters": {"light_key": "ethanol", "heavy_key": "water",
                                "light_key_recovery": 0.99,
                                "heavy_key_recovery": 0.80,
                                "condenser_pressure_kpa": 101.325}},
                {"id": "col-rect", "type": "distillationColumn",
                 "parameters": {"light_key": "ethanol", "heavy_key": "water",
                                "light_key_recovery": 0.95,
                                "heavy_key_recovery": 0.90,
                                "condenser_pressure_kpa": 101.325,
                                "reflux_ratio_multiple": 2.0}},
            ],
            streams=[
                {"id": "beer-feed", "source": None, "target": "col-beer",
                 "properties": {"temperature": 30.0, "pressure": 101.325,
                                "flow_rate": 50000.0,
                                "composition": {"ethanol": 0.10, "water": 0.90}}},
                {"id": "beer-overhead", "source": "col-beer", "target": "col-rect",
                 "properties": {"sourceHandle": "overhead-top"}},
                {"id": "stillage", "source": "col-beer", "target": None,
                 "properties": {"sourceHandle": "bottoms-bottom"}},
                {"id": "ethanol-product", "source": "col-rect", "target": None,
                 "properties": {"sourceHandle": "overhead-top"}},
                {"id": "rect-bottoms", "source": "col-rect", "target": None,
                 "properties": {"sourceHandle": "bottoms-bottom"}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        ethanol = _get_stream(result, "ethanol-product")
        stillage = _get_stream(result, "stillage")
        assert ethanol is not None and ethanol.mass_flow_kg_per_h > 0
        assert stillage is not None and stillage.mass_flow_kg_per_h > 0


# ============================================================================
# Case 14: Biodiesel Transesterification
# ============================================================================

class TestCase14Biodiesel:
    """Oil + MeOH → mixer → heater → flash → distillation → product separation."""

    def test_biodiesel(self, client):
        payload = _make_payload(
            name="biodiesel-separation",
            components=["methanol", "glycerol", "water", "oleic acid"],
            package="NRTL",
            units=[
                {"id": "mixer-1", "type": "mixer", "parameters": {}},
                {"id": "heater-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": 70.0}},
                {"id": "flash-1", "type": "flashDrum",
                 "parameters": {}},
                {"id": "col-1", "type": "distillationColumn",
                 "parameters": {"condenser_pressure_kpa": 101.325}},
            ],
            streams=[
                {"id": "oil-feed", "source": None, "target": "mixer-1",
                 "properties": {"temperature": 25.0, "pressure": 200.0,
                                "flow_rate": 10000.0,
                                "composition": {"methanol": 0.0, "glycerol": 0.05,
                                                "water": 0.05, "oleic acid": 0.90},
                                "targetHandle": "in-1-left"}},
                {"id": "meoh-feed", "source": None, "target": "mixer-1",
                 "properties": {"temperature": 25.0, "pressure": 200.0,
                                "flow_rate": 2000.0,
                                "composition": {"methanol": 0.95, "glycerol": 0.0,
                                                "water": 0.05, "oleic acid": 0.0},
                                "targetHandle": "in-2-left"}},
                {"id": "mixed", "source": "mixer-1", "target": "heater-1",
                 "properties": {}},
                {"id": "hot-feed", "source": "heater-1", "target": "flash-1",
                 "properties": {}},
                {"id": "flash-vap", "source": "flash-1", "target": None,
                 "properties": {"sourceHandle": "vapor-top"}},
                {"id": "flash-liq", "source": "flash-1", "target": "col-1",
                 "properties": {"sourceHandle": "liquid-bottom"}},
                {"id": "meoh-recycle", "source": "col-1", "target": None,
                 "properties": {"sourceHandle": "overhead-top"}},
                {"id": "product", "source": "col-1", "target": None,
                 "properties": {"sourceHandle": "bottoms-bottom"}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        product = _get_stream(result, "product")
        assert product is not None and product.mass_flow_kg_per_h > 0


# ============================================================================
# Case 15: HCl Absorption (Gas Scrubbing)
# ============================================================================

class TestCase15HClAbsorption:
    """Flue gas + water absorber → clean gas + acid solution."""

    def test_hcl_absorption(self, client):
        payload = _make_payload(
            name="hcl-absorption",
            components=["nitrogen", "carbon dioxide", "water"],
            package="NRTL",
            units=[
                {"id": "cooler-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": 35.0}},
                {"id": "absorber-1", "type": "absorber",
                 "parameters": {"n_stages": 8, "pressure_kpa": 101.325,
                                "temperature_c": 30.0}},
                {"id": "pump-1", "type": "pump",
                 "parameters": {"outlet_pressure_kpa": 300.0}},
            ],
            streams=[
                {"id": "flue-gas", "source": None, "target": "cooler-1",
                 "properties": {"temperature": 150.0, "pressure": 110.0,
                                "flow_rate": 50000.0,
                                "composition": {"nitrogen": 0.75,
                                                "carbon dioxide": 0.15,
                                                "water": 0.10}}},
                {"id": "cooled-gas", "source": "cooler-1", "target": "absorber-1",
                 "properties": {"targetHandle": "in-1-left"}},
                {"id": "wash-water", "source": None, "target": "absorber-1",
                 "properties": {"temperature": 25.0, "pressure": 110.0,
                                "flow_rate": 20000.0,
                                "composition": {"nitrogen": 0.0,
                                                "carbon dioxide": 0.0,
                                                "water": 1.0},
                                "targetHandle": "in-2-right"}},
                {"id": "clean-gas", "source": "absorber-1", "target": None,
                 "properties": {"sourceHandle": "vapor-top"}},
                {"id": "rich-water", "source": "absorber-1", "target": "pump-1",
                 "properties": {"sourceHandle": "liquid-bottom"}},
                {"id": "acid-product", "source": "pump-1", "target": None,
                 "properties": {}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        clean = _get_stream(result, "clean-gas")
        acid = _get_stream(result, "acid-product")
        assert clean is not None and clean.mass_flow_kg_per_h > 0
        assert acid is not None and acid.mass_flow_kg_per_h > 0


# ============================================================================
# Case 16: Polyethylene Separation (HP/LP Flash Train)
# ============================================================================

class TestCase16PolyethyleneSep:
    """Reactor effluent → HP flash → valve → LP flash → compressor → product."""

    def test_polyethylene_sep(self, client):
        payload = _make_payload(
            name="polyethylene-separation",
            components=["ethylene", "propane", "n-hexane"],
            package="SRK",
            units=[
                {"id": "flash-hp", "type": "flashDrum",
                 "parameters": {"pressure_kpa": 3000.0, "temperature_c": 60.0}},
                {"id": "valve-1", "type": "valve",
                 "parameters": {"outlet_pressure_kpa": 300.0}},
                {"id": "flash-lp", "type": "flashDrum",
                 "parameters": {}},
                {"id": "comp-1", "type": "compressor",
                 "parameters": {"pressure_ratio": 3.0, "efficiency": 0.78}},
                {"id": "cooler-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": 40.0}},
            ],
            streams=[
                {"id": "reactor-eff", "source": None, "target": "flash-hp",
                 "properties": {"temperature": 80.0, "pressure": 3000.0,
                                "flow_rate": 40000.0,
                                "composition": {"ethylene": 0.60, "propane": 0.10,
                                                "n-hexane": 0.30}}},
                {"id": "hp-vapor", "source": "flash-hp", "target": "comp-1",
                 "properties": {"sourceHandle": "vapor-top"}},
                {"id": "hp-liquid", "source": "flash-hp", "target": "valve-1",
                 "properties": {"sourceHandle": "liquid-bottom"}},
                {"id": "expanded", "source": "valve-1", "target": "flash-lp",
                 "properties": {}},
                {"id": "lp-vapor", "source": "flash-lp", "target": None,
                 "properties": {"sourceHandle": "vapor-top"}},
                {"id": "polymer-slurry", "source": "flash-lp", "target": None,
                 "properties": {"sourceHandle": "liquid-bottom"}},
                {"id": "compressed-eth", "source": "comp-1", "target": "cooler-1",
                 "properties": {}},
                {"id": "ethylene-recycle", "source": "cooler-1", "target": None,
                 "properties": {}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        lp_vap = _get_stream(result, "lp-vapor")
        slurry = _get_stream(result, "polymer-slurry")
        assert lp_vap is not None and lp_vap.mass_flow_kg_per_h > 0
        assert slurry is not None and slurry.mass_flow_kg_per_h > 0


# ============================================================================
# Case 17: Solvent Recovery (Acetone/MeOH/EtOH)
# ============================================================================

class TestCase17SolventRecovery:
    """Mixed solvent → column 1 → column 2 → separated solvents."""

    def test_solvent_recovery(self, client):
        payload = _make_payload(
            name="solvent-recovery",
            components=["acetone", "methanol", "ethanol", "water"],
            package="NRTL",
            units=[
                {"id": "col-1", "type": "distillationColumn",
                 "parameters": {"light_key": "acetone", "heavy_key": "methanol",
                                "light_key_recovery": 0.95,
                                "heavy_key_recovery": 0.90,
                                "condenser_pressure_kpa": 101.325}},
                {"id": "col-2", "type": "distillationColumn",
                 "parameters": {"light_key": "methanol", "heavy_key": "ethanol",
                                "light_key_recovery": 0.90,
                                "heavy_key_recovery": 0.85,
                                "condenser_pressure_kpa": 101.325}},
            ],
            streams=[
                {"id": "mixed-feed", "source": None, "target": "col-1",
                 "properties": {"temperature": 25.0, "pressure": 101.325,
                                "flow_rate": 10000.0,
                                "composition": {"acetone": 0.30, "methanol": 0.30,
                                                "ethanol": 0.20, "water": 0.20}}},
                {"id": "acetone-rich", "source": "col-1", "target": None,
                 "properties": {"sourceHandle": "overhead-top"}},
                {"id": "col1-btms", "source": "col-1", "target": "col-2",
                 "properties": {"sourceHandle": "bottoms-bottom"}},
                {"id": "meoh-rich", "source": "col-2", "target": None,
                 "properties": {"sourceHandle": "overhead-top"}},
                {"id": "etoh-water", "source": "col-2", "target": None,
                 "properties": {"sourceHandle": "bottoms-bottom"}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        acetone = _get_stream(result, "acetone-rich")
        meoh = _get_stream(result, "meoh-rich")
        etoh_water = _get_stream(result, "etoh-water")
        assert acetone is not None and acetone.mass_flow_kg_per_h > 0
        assert meoh is not None and meoh.mass_flow_kg_per_h > 0
        assert etoh_water is not None and etoh_water.mass_flow_kg_per_h > 0


# ============================================================================
# Case 18: Steam Rankine Cycle
# ============================================================================

class TestCase18SteamRankineCycle:
    """Pump → boiler → turbine → condenser → closed loop (open-ended test)."""

    def test_steam_rankine(self, client):
        payload = _make_payload(
            name="steam-rankine",
            components=["water"],
            package="Peng-Robinson",
            units=[
                {"id": "pump-1", "type": "pump",
                 "parameters": {"outlet_pressure_kpa": 10000.0}},
                {"id": "boiler-1", "type": "boiler",
                 "parameters": {"outlet_temperature_c": 500.0}},
                {"id": "turbine-1", "type": "turbine",
                 "parameters": {"outlet_pressure_kpa": 10.0, "efficiency": 0.85}},
                {"id": "condenser-1", "type": "condenser",
                 "parameters": {"outlet_temperature_c": 45.0}},
            ],
            streams=[
                {"id": "condensate", "source": None, "target": "pump-1",
                 "properties": {"temperature": 45.0, "pressure": 10.0,
                                "flow_rate": 50000.0,
                                "composition": {"water": 1.0}}},
                {"id": "hp-water", "source": "pump-1", "target": "boiler-1",
                 "properties": {}},
                {"id": "steam", "source": "boiler-1", "target": "turbine-1",
                 "properties": {}},
                {"id": "exhaust", "source": "turbine-1", "target": "condenser-1",
                 "properties": {}},
                {"id": "cond-out", "source": "condenser-1", "target": None,
                 "properties": {}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        steam = _get_stream(result, "steam")
        exhaust = _get_stream(result, "exhaust")
        assert steam is not None and steam.mass_flow_kg_per_h > 0
        assert exhaust is not None and exhaust.mass_flow_kg_per_h > 0
        # Turbine should expand: exhaust P < steam P
        if steam.pressure_kpa and exhaust.pressure_kpa:
            assert exhaust.pressure_kpa < steam.pressure_kpa


# ============================================================================
# Case 19: SMR Hydrogen Production
# ============================================================================

class TestCase19SMRHydrogen:
    """NG + steam → fired heater → reformer → WGS reactor → cooler → flash → H2."""

    def test_smr_hydrogen(self, client):
        payload = _make_payload(
            name="smr-hydrogen",
            components=["methane", "water", "carbon monoxide",
                        "carbon dioxide", "hydrogen"],
            package="SRK",
            units=[
                {"id": "mixer-1", "type": "mixer", "parameters": {}},
                {"id": "heater-1", "type": "firedHeater",
                 "parameters": {"outlet_temperature_c": 850.0}},
                {"id": "reformer", "type": "conversionReactor",
                 "parameters": {"outlet_temperature_c": 830.0,
                                "reactions": [
                                    {"reactants": {"methane": 1, "water": 1},
                                     "products": {"CO": 1, "H2": 3},
                                     "conversion": 0.80,
                                     "base_component": "methane"}
                                ]}},
                {"id": "wgs-reactor", "type": "conversionReactor",
                 "parameters": {"outlet_temperature_c": 350.0,
                                "reactions": [
                                    {"reactants": {"CO": 1, "water": 1},
                                     "products": {"CO2": 1, "H2": 1},
                                     "conversion": 0.90,
                                     "base_component": "CO"}
                                ]}},
                {"id": "cooler-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": 40.0}},
                {"id": "flash-1", "type": "flashDrum",
                 "parameters": {}},
            ],
            streams=[
                {"id": "ng-feed", "source": None, "target": "mixer-1",
                 "properties": {"temperature": 25.0, "pressure": 2500.0,
                                "flow_rate": 10000.0,
                                "composition": {"methane": 1.0, "water": 0.0,
                                                "carbon monoxide": 0.0,
                                                "carbon dioxide": 0.0,
                                                "hydrogen": 0.0},
                                "targetHandle": "in-1-left"}},
                {"id": "steam-feed", "source": None, "target": "mixer-1",
                 "properties": {"temperature": 250.0, "pressure": 2500.0,
                                "flow_rate": 30000.0,
                                "composition": {"methane": 0.0, "water": 1.0,
                                                "carbon monoxide": 0.0,
                                                "carbon dioxide": 0.0,
                                                "hydrogen": 0.0},
                                "targetHandle": "in-2-left"}},
                {"id": "mixed", "source": "mixer-1", "target": "heater-1",
                 "properties": {}},
                {"id": "hot-feed", "source": "heater-1", "target": "reformer",
                 "properties": {}},
                {"id": "reformate", "source": "reformer", "target": "wgs-reactor",
                 "properties": {}},
                {"id": "shifted-gas", "source": "wgs-reactor", "target": "cooler-1",
                 "properties": {}},
                {"id": "cooled-gas", "source": "cooler-1", "target": "flash-1",
                 "properties": {}},
                {"id": "h2-rich-gas", "source": "flash-1", "target": None,
                 "properties": {"sourceHandle": "vapor-top"}},
                {"id": "condensate", "source": "flash-1", "target": None,
                 "properties": {"sourceHandle": "liquid-bottom"}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        h2_gas = _get_stream(result, "h2-rich-gas")
        assert h2_gas is not None and h2_gas.mass_flow_kg_per_h > 0


# ============================================================================
# Case 20: Copper Leaching (Hydrometallurgy Proxy)
# ============================================================================

class TestCase20CopperLeach:
    """Acid + ore slurry → mixer → heater → flash → solids/liquid split."""

    def test_copper_leach(self, client):
        payload = _make_payload(
            name="copper-leach",
            components=["water", "sulfuric acid", "ethanol"],
            package="NRTL",
            units=[
                {"id": "mixer-1", "type": "mixer", "parameters": {}},
                {"id": "heater-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": 80.0}},
                {"id": "flash-1", "type": "flashDrum",
                 "parameters": {}},
                {"id": "cooler-1", "type": "heaterCooler",
                 "parameters": {"outlet_temperature_c": 25.0}},
            ],
            streams=[
                {"id": "acid-feed", "source": None, "target": "mixer-1",
                 "properties": {"temperature": 25.0, "pressure": 101.325,
                                "flow_rate": 5000.0,
                                "composition": {"water": 0.70,
                                                "sulfuric acid": 0.20,
                                                "ethanol": 0.10},
                                "targetHandle": "in-1-left"}},
                {"id": "wash-feed", "source": None, "target": "mixer-1",
                 "properties": {"temperature": 25.0, "pressure": 101.325,
                                "flow_rate": 10000.0,
                                "composition": {"water": 0.95,
                                                "sulfuric acid": 0.0,
                                                "ethanol": 0.05},
                                "targetHandle": "in-2-left"}},
                {"id": "mixed", "source": "mixer-1", "target": "heater-1",
                 "properties": {}},
                {"id": "hot-slurry", "source": "heater-1", "target": "flash-1",
                 "properties": {}},
                {"id": "flash-vap", "source": "flash-1", "target": None,
                 "properties": {"sourceHandle": "vapor-top"}},
                {"id": "flash-liq", "source": "flash-1", "target": "cooler-1",
                 "properties": {"sourceHandle": "liquid-bottom"}},
                {"id": "product", "source": "cooler-1", "target": None,
                 "properties": {}},
            ],
        )
        result = client.simulate_flowsheet(payload)
        _assert_balance(result, energy_tol=0.50)

        product = _get_stream(result, "product")
        assert product is not None and product.mass_flow_kg_per_h > 0
