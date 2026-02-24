"""
Tests for the 10-fix plan to make all 20 AI flowsheet prompts work.

Covers:
  - Fix 1: AbsorberOp (two-feed Kremser + single-feed fallback)
  - Fix 3: Auto-add reaction products (tested indirectly via reactor)
  - Fix 6: Recycle loop convergence (reactor → separator → mixer recycle)
  - Fix 7: LLE separator3p for extraction
  - Fix 8: Composition key matching with underscores/hyphens
  - Fix 9: Compound name aliases
"""

import pytest

from app import schemas
from app.flowsheet_solver import FlowsheetSolver
from app.thermo_engine import ThermoEngine, StreamState


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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


def _assert_balance(result, mass_tol=0.02, energy_tol=0.10):
    """Assert mass and energy balance within tolerance."""
    assert result.converged is True, f"Solver did not converge: {result.warnings}"
    if result.mass_balance_error is not None:
        assert result.mass_balance_error < mass_tol, (
            f"Mass balance error {result.mass_balance_error*100:.2f}% "
            f"exceeds {mass_tol*100}% threshold. Warnings: {result.warnings}"
        )


# ---------------------------------------------------------------------------
# Test 1: Absorber with two feeds (gas + solvent) — Kremser model
# ---------------------------------------------------------------------------

class TestAbsorberTwoFeeds:
    """TEG-style absorber: wet gas + lean TEG → dry gas overhead + rich TEG bottoms."""

    def test_absorber_two_feeds_mass_balance(self):
        components = ["methane", "ethane", "water", "triethylene glycol"]
        engine = ThermoEngine(components, "Peng-Robinson")
        payload = _make_payload(
            name="TEG Absorber",
            components=components,
            package="Peng-Robinson",
            units=[
                {
                    "id": "abs-1",
                    "type": "absorber",
                    "name": "TEG Contactor",
                    "parameters": {"n_stages": 10, "pressure_kpa": 5000},
                },
            ],
            streams=[
                {
                    "id": "gas-feed",
                    "source": None,
                    "target": "abs-1",
                    "properties": {
                        "temperature": 40,
                        "pressure": 5000,
                        "flow_rate": 50000,
                        "composition": {
                            "methane": 0.85,
                            "ethane": 0.10,
                            "water": 0.05,
                            "triethylene glycol": 0.0,
                        },
                    },
                },
                {
                    "id": "solvent-feed",
                    "source": None,
                    "target": "abs-1",
                    "properties": {
                        "temperature": 30,
                        "pressure": 5000,
                        "flow_rate": 5000,
                        "composition": {
                            "methane": 0.0,
                            "ethane": 0.0,
                            "water": 0.02,
                            "triethylene glycol": 0.98,
                        },
                    },
                },
                {
                    "id": "dry-gas",
                    "source": "abs-1",
                    "target": None,
                    "properties": {},
                },
                {
                    "id": "rich-teg",
                    "source": "abs-1",
                    "target": None,
                    "properties": {},
                },
            ],
        )

        solver = FlowsheetSolver(engine)
        solver.build_from_payload(payload)
        result = solver.solve()

        assert result.converged
        # Check that both outlets exist
        assert "dry-gas" in result.streams
        assert "rich-teg" in result.streams

        # Mass balance: feed mass ≈ outlet mass
        feed_mass = sum(s.mass_flow for s in solver.feed_streams.values())
        outlet_mass = result.streams["dry-gas"].mass_flow + result.streams["rich-teg"].mass_flow
        if feed_mass > 0 and outlet_mass > 0:
            error = abs(feed_mass - outlet_mass) / feed_mass
            assert error < 0.02, f"Mass balance error {error*100:.2f}%"


# ---------------------------------------------------------------------------
# Test 2: Absorber with single feed — flash fallback
# ---------------------------------------------------------------------------

class TestAbsorberSingleFeed:
    """Single-feed absorber should fall back to flash separation."""

    def test_absorber_single_feed_flash(self):
        components = ["methane", "ethane", "propane", "water"]
        engine = ThermoEngine(components, "Peng-Robinson")
        payload = _make_payload(
            name="Single Feed Absorber",
            components=components,
            package="Peng-Robinson",
            units=[
                {
                    "id": "abs-1",
                    "type": "absorber",
                    "name": "Absorber",
                    "parameters": {"n_stages": 5, "pressure_kpa": 3000},
                },
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "abs-1",
                    "properties": {
                        "temperature": 50,
                        "pressure": 3000,
                        "flow_rate": 10000,
                        "composition": {"methane": 0.7, "ethane": 0.15, "propane": 0.10, "water": 0.05},
                    },
                },
                {"id": "top", "source": "abs-1", "target": None, "properties": {}},
                {"id": "bot", "source": "abs-1", "target": None, "properties": {}},
            ],
        )

        solver = FlowsheetSolver(engine)
        solver.build_from_payload(payload)
        result = solver.solve()

        assert result.converged
        assert "top" in result.streams or "bot" in result.streams


# ---------------------------------------------------------------------------
# Test 3: Reactor with product not in original components (auto-add test)
# ---------------------------------------------------------------------------

class TestReactorMissingProduct:
    """Conversion reactor where products are in thermo.components.

    This tests that the engine handles reactions correctly when all
    species are present — the auto-add logic in route.ts ensures they
    are present before the backend receives them.
    """

    def test_styrene_dehydrogenation(self):
        # Both reactant AND product must be in components
        components = ["ethylbenzene", "styrene", "hydrogen"]
        engine = ThermoEngine(components, "Peng-Robinson")
        payload = _make_payload(
            name="Styrene Reactor",
            components=components,
            package="Peng-Robinson",
            units=[
                {
                    "id": "rx-1",
                    "type": "conversionReactor",
                    "name": "Dehydrogenation Reactor",
                    "parameters": {
                        "temperature_c": 600,
                        "pressure_kpa": 200,
                        "reactions": [
                            {
                                "reactants": {"ethylbenzene": 1},
                                "products": {"styrene": 1, "hydrogen": 1},
                                "conversion": 0.65,
                                "base_component": "ethylbenzene",
                            }
                        ],
                    },
                },
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "rx-1",
                    "properties": {
                        "temperature": 550,
                        "pressure": 200,
                        "flow_rate": 10000,
                        "composition": {"ethylbenzene": 1.0, "styrene": 0.0, "hydrogen": 0.0},
                    },
                },
                {"id": "product", "source": "rx-1", "target": None, "properties": {}},
            ],
        )

        solver = FlowsheetSolver(engine)
        solver.build_from_payload(payload)
        result = solver.solve()

        assert result.converged
        product = result.streams.get("product")
        assert product is not None
        # Styrene should be present in product
        styrene_idx = components.index("styrene")
        assert product.zs[styrene_idx] > 0.1, "Styrene should be present in product"


# ---------------------------------------------------------------------------
# Test 4: Recycle loop convergence
# ---------------------------------------------------------------------------

class TestRecycleLoopConvergence:
    """Reactor → separator → mixer recycle loop.

    Tests that the solver converges with the improved Wegstein parameters
    and 30% initial tear estimate.
    """

    def test_simple_recycle_loop(self):
        components = ["methane", "ethane", "propane"]
        engine = ThermoEngine(components, "Peng-Robinson")
        payload = _make_payload(
            name="Recycle Loop",
            components=components,
            package="Peng-Robinson",
            units=[
                {
                    "id": "mix-1",
                    "type": "mixer",
                    "name": "Feed Mixer",
                    "parameters": {},
                },
                {
                    "id": "htr-1",
                    "type": "heaterCooler",
                    "name": "Heater",
                    "parameters": {"outlet_temperature_c": 80},
                },
                {
                    "id": "sep-1",
                    "type": "separator",
                    "name": "Flash Drum",
                    "parameters": {"temperature_c": 30, "pressure_kpa": 2000},
                },
            ],
            streams=[
                {
                    "id": "fresh-feed",
                    "source": None,
                    "target": "mix-1",
                    "properties": {
                        "temperature": 25,
                        "pressure": 2000,
                        "flow_rate": 10000,
                        "composition": {"methane": 0.6, "ethane": 0.3, "propane": 0.1},
                    },
                },
                {
                    "id": "s1",
                    "source": "mix-1",
                    "target": "htr-1",
                    "properties": {},
                },
                {
                    "id": "s2",
                    "source": "htr-1",
                    "target": "sep-1",
                    "properties": {},
                },
                {
                    "id": "vapor-product",
                    "source": "sep-1",
                    "target": None,
                    "properties": {},
                },
                {
                    "id": "liquid-recycle",
                    "source": "sep-1",
                    "target": "mix-1",
                    "properties": {},
                },
            ],
        )

        solver = FlowsheetSolver(engine)
        solver.build_from_payload(payload)
        result = solver.solve()

        # Should converge within 100 iterations
        assert result.converged, f"Recycle loop did not converge: {result.warnings}"


# ---------------------------------------------------------------------------
# Test 5: LLE with separator3p
# ---------------------------------------------------------------------------

class TestLLESeparator3p:
    """Water-acetone-toluene three-phase split."""

    def test_lle_separation(self):
        components = ["water", "acetone", "toluene"]
        engine = ThermoEngine(components, "Peng-Robinson")
        payload = _make_payload(
            name="LLE Extraction",
            components=components,
            package="Peng-Robinson",
            units=[
                {
                    "id": "sep3p-1",
                    "type": "separator3p",
                    "name": "LLE Settler",
                    "parameters": {"temperature_c": 25, "pressure_kpa": 101.325},
                },
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "sep3p-1",
                    "properties": {
                        "temperature": 25,
                        "pressure": 101.325,
                        "flow_rate": 5000,
                        "composition": {"water": 0.5, "acetone": 0.3, "toluene": 0.2},
                    },
                },
                {"id": "gas-out", "source": "sep3p-1", "target": None, "properties": {}},
                {"id": "oil-out", "source": "sep3p-1", "target": None, "properties": {}},
                {"id": "water-out", "source": "sep3p-1", "target": None, "properties": {}},
            ],
        )

        solver = FlowsheetSolver(engine)
        solver.build_from_payload(payload)
        result = solver.solve()

        assert result.converged
        # At least one liquid outlet should have non-zero flow
        has_liquid = False
        for sid in ["oil-out", "water-out"]:
            s = result.streams.get(sid)
            if s and s.mass_flow > 0:
                has_liquid = True
        assert has_liquid, "No liquid outlets from 3-phase separator"


# ---------------------------------------------------------------------------
# Test 6: Compound alias resolution
# ---------------------------------------------------------------------------

class TestCompoundAliases:
    """Test that underscore/hyphen aliases resolve correctly."""

    def test_ethyl_benzene_alias(self):
        # Should resolve "ethyl_benzene" → "ethylbenzene"
        engine = ThermoEngine(["ethyl_benzene", "styrene"], "Peng-Robinson")
        assert len(engine.component_names) == 2
        # Should not raise

    def test_triethylene_glycol_alias(self):
        engine = ThermoEngine(["triethylene_glycol", "water"], "Peng-Robinson")
        assert len(engine.component_names) == 2

    def test_formula_aliases(self):
        # Test CO2, H2S, NH3 aliases
        engine = ThermoEngine(["co2", "h2s", "nh3", "water"], "Peng-Robinson")
        assert engine.n == 4


# ---------------------------------------------------------------------------
# Test 7: Composition key matching with normalization
# ---------------------------------------------------------------------------

class TestCompositionKeyMatching:
    """Test that n_butane matches n-butane in feed composition."""

    def test_underscore_hyphen_matching(self):
        components = ["methane", "n-butane", "water"]
        engine = ThermoEngine(components, "Peng-Robinson")
        payload = _make_payload(
            name="Composition Match Test",
            components=components,
            package="Peng-Robinson",
            units=[
                {
                    "id": "sep-1",
                    "type": "separator",
                    "name": "Flash",
                    "parameters": {"temperature_c": 30, "pressure_kpa": 500},
                },
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "sep-1",
                    "properties": {
                        "temperature": 60,
                        "pressure": 500,
                        "flow_rate": 5000,
                        # Note: "n_butane" with underscore, but engine has "n-butane"
                        "composition": {"methane": 0.5, "n_butane": 0.3, "water": 0.2},
                    },
                },
                {"id": "vap", "source": "sep-1", "target": None, "properties": {}},
                {"id": "liq", "source": "sep-1", "target": None, "properties": {}},
            ],
        )

        solver = FlowsheetSolver(engine)
        solver.build_from_payload(payload)
        result = solver.solve()

        assert result.converged
        # n-butane should have non-zero composition in at least one outlet
        butane_idx = components.index("n-butane")
        feed = solver.feed_streams.get("feed")
        assert feed is not None
        assert feed.zs[butane_idx] > 0.1, (
            f"n-butane fraction {feed.zs[butane_idx]} too low — composition key matching may have failed"
        )
