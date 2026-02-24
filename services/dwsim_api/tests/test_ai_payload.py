"""
Integration tests for AI-generated flowsheet payloads.

Validates that the solver handles common AI mistakes:
  - Missing sourceHandle on multi-outlet units (flash drums, columns)
  - Non-standard AI handle names (e.g. "overhead-top", "bottoms-bottom")
  - Multi-unit pipelines with no handle annotations
  - Specific diagnostics for missing feed stream properties
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


# ---------------------------------------------------------------------------
# Test A: Flash drum with NO sourceHandle on outlet edges
# ---------------------------------------------------------------------------


class TestFlashDrumNoHandles:
    """When AI omits sourceHandle, both outlets should still be populated."""

    def test_flash_no_source_handle(self, client):
        payload = _make_payload(
            name="flash-no-handle",
            components=["methane", "n-butane"],
            units=[
                {
                    "id": "flash-1",
                    "type": "flashDrum",
                    "parameters": {
                        "temperature_c": 25.0,
                        "pressure_kpa": 2000.0,
                    },
                }
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "flash-1",
                    "properties": {
                        "temperature": 25.0,
                        "pressure": 2000.0,
                        "flow_rate": 3600.0,
                        "composition": {"methane": 0.5, "n-butane": 0.5},
                        "targetHandle": "feed-left",
                    },
                },
                {
                    "id": "vapor-out",
                    "source": "flash-1",
                    "target": None,
                    "properties": {},  # NO sourceHandle!
                },
                {
                    "id": "liquid-out",
                    "source": "flash-1",
                    "target": None,
                    "properties": {},  # NO sourceHandle!
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.status == "converged"
        assert result.converged is True

        vapor = next((s for s in result.streams if s.id == "vapor-out"), None)
        liquid = next((s for s in result.streams if s.id == "liquid-out"), None)

        # BOTH outlets must be populated (the bug was one getting lost)
        assert vapor is not None, "Vapor outlet stream was not populated"
        assert liquid is not None, "Liquid outlet stream was not populated"

        # Both should have mass flow > 0
        assert vapor.mass_flow_kg_per_h is not None and vapor.mass_flow_kg_per_h > 0
        assert liquid.mass_flow_kg_per_h is not None and liquid.mass_flow_kg_per_h > 0

        # Mass balance: feed ≈ vapor + liquid (within 1%)
        feed_flow = 3600.0
        total_out = vapor.mass_flow_kg_per_h + liquid.mass_flow_kg_per_h
        balance_error = abs(feed_flow - total_out) / feed_flow
        assert balance_error < 0.01, f"Mass balance error {balance_error*100:.1f}% > 1%"


# ---------------------------------------------------------------------------
# Test B: Distillation column with AI-style handle names
# ---------------------------------------------------------------------------


class TestDistillationAIHandles:
    """AI uses 'overhead-top' and 'bottoms-bottom' — solver should map correctly."""

    def test_column_with_ai_handles(self, client):
        payload = _make_payload(
            name="distillation-ai-handles",
            components=["benzene", "toluene"],
            units=[
                {
                    "id": "col-1",
                    "type": "distillationColumn",
                    "parameters": {
                        "light_key": "benzene",
                        "heavy_key": "toluene",
                        "light_key_recovery": 0.95,
                        "heavy_key_recovery": 0.95,
                        "reflux_ratio_multiple": 1.3,
                        "condenser_pressure_kpa": 101.325,
                    },
                }
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "col-1",
                    "properties": {
                        "temperature": 80.0,
                        "pressure": 101.325,
                        "flow_rate": 3600.0,
                        "composition": {"benzene": 0.5, "toluene": 0.5},
                        "targetHandle": "feed-stage-10",
                    },
                },
                {
                    "id": "overhead",
                    "source": "col-1",
                    "target": None,
                    "properties": {
                        "sourceHandle": "overhead-top",
                    },
                },
                {
                    "id": "bottoms",
                    "source": "col-1",
                    "target": None,
                    "properties": {
                        "sourceHandle": "bottoms-bottom",
                    },
                },
            ],
        )

        # Verify _extract_port maps AI handles correctly
        from app.flowsheet_solver import FlowsheetSolver
        assert FlowsheetSolver._extract_port("overhead-top") == "vapor"
        assert FlowsheetSolver._extract_port("bottoms-bottom") == "liquid"

        result = client.simulate_flowsheet(payload)
        assert result.status == "converged"

        overhead = next((s for s in result.streams if s.id == "overhead"), None)
        bottoms = next((s for s in result.streams if s.id == "bottoms"), None)

        assert overhead is not None, "Overhead stream was not populated"
        assert bottoms is not None, "Bottoms stream was not populated"

        # Overhead enriched in benzene (lighter), bottoms in toluene
        if overhead.composition and bottoms.composition:
            assert overhead.composition.get("benzene", 0) > bottoms.composition.get(
                "benzene", 0
            )


# ---------------------------------------------------------------------------
# Test C: Multi-unit pipeline (separator → compressor + pump → products)
# ---------------------------------------------------------------------------


class TestMultiUnitPipeline:
    """Full pipeline: feed → separator → compressor (gas) + pump (liquid)."""

    def test_multi_unit_convergence(self, client):
        payload = _make_payload(
            name="multi-unit-pipeline",
            components=["methane", "n-butane"],
            units=[
                {
                    "id": "sep-1",
                    "type": "separator",
                    "parameters": {
                        "temperature_c": 30.0,
                        "pressure_kpa": 3000.0,
                    },
                },
                {
                    "id": "comp-1",
                    "type": "compressor",
                    "parameters": {
                        "outlet_pressure_kpa": 5000.0,
                        "efficiency": 0.80,
                    },
                },
                {
                    "id": "pump-1",
                    "type": "pump",
                    "parameters": {
                        "outlet_pressure_kpa": 5000.0,
                        "efficiency": 0.75,
                    },
                },
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "sep-1",
                    "properties": {
                        "temperature": 30.0,
                        "pressure": 3000.0,
                        "flow_rate": 10000.0,
                        "composition": {"methane": 0.6, "n-butane": 0.4},
                        "targetHandle": "feed-left",
                    },
                },
                {
                    "id": "gas-stream",
                    "source": "sep-1",
                    "target": "comp-1",
                    "properties": {
                        "sourceHandle": "vapor-top",
                        "targetHandle": "suction-left",
                    },
                },
                {
                    "id": "liquid-stream",
                    "source": "sep-1",
                    "target": "pump-1",
                    "properties": {
                        "sourceHandle": "liquid-bottom",
                        "targetHandle": "suction-left",
                    },
                },
                {
                    "id": "gas-product",
                    "source": "comp-1",
                    "target": None,
                    "properties": {"sourceHandle": "discharge-right"},
                },
                {
                    "id": "liquid-product",
                    "source": "pump-1",
                    "target": None,
                    "properties": {"sourceHandle": "discharge-right"},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.status == "converged"
        assert result.converged is True

        # All 4 outlet streams should be populated
        for sid in ["gas-stream", "liquid-stream", "gas-product", "liquid-product"]:
            s = next((s for s in result.streams if s.id == sid), None)
            assert s is not None, f"Stream '{sid}' was not populated"
            assert s.mass_flow_kg_per_h is not None and s.mass_flow_kg_per_h > 0, (
                f"Stream '{sid}' has zero mass flow"
            )

        # Manual mass balance: feed ≈ gas-product + liquid-product (final products only)
        feed_flow = 10000.0
        gas_prod = next(s for s in result.streams if s.id == "gas-product")
        liq_prod = next(s for s in result.streams if s.id == "liquid-product")
        total_product = gas_prod.mass_flow_kg_per_h + liq_prod.mass_flow_kg_per_h
        balance_error = abs(feed_flow - total_product) / feed_flow
        assert balance_error < 0.01, (
            f"Mass balance error {balance_error*100:.1f}% > 1%"
        )


# ---------------------------------------------------------------------------
# Test D: Missing feed properties — specific diagnostics
# ---------------------------------------------------------------------------


class TestMissingFeedDiagnostics:
    """Feed with temperature but NO pressure should warn specifically about pressure."""

    def test_missing_pressure_warning(self, client):
        payload = _make_payload(
            name="missing-pressure-test",
            components=["water"],
            units=[
                {
                    "id": "pump-1",
                    "type": "pump",
                    "parameters": {"outlet_pressure_kpa": 500.0},
                }
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "pump-1",
                    "properties": {
                        "temperature": 25.0,
                        # pressure intentionally omitted!
                        "flow_rate": 3600.0,
                        "composition": {"water": 1.0},
                        "targetHandle": "in",
                    },
                },
                {
                    "id": "product",
                    "source": "pump-1",
                    "target": None,
                    "properties": {"sourceHandle": "out"},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)

        # Should have a warning about stream 'feed' mentioning "pressure"
        feed_warnings = [
            w for w in result.warnings
            if "'feed'" in w and "pressure" in w.lower()
        ]
        assert len(feed_warnings) > 0, (
            f"Expected warning about feed stream missing 'pressure', got: {result.warnings}"
        )

        # The feed stream warning should NOT mention "temperature" (it was provided)
        for w in feed_warnings:
            assert "temperature" not in w.lower(), (
                f"Feed warning should not mention temperature (it was provided): {w}"
            )
