"""
Regression tests for mass/energy balance errors.

Covers:
1. AI-generated thermo data on internal edges (double-counting bug)
2. AI-generated thermo data with WRONG flow rates on non-feed streams (stale estimate bug)
3. Passthrough heater/cooler with pressure drop (duty=0 bug)
4. Heat exchanger with only one side connected (mass doubling bug)
"""

import pytest

from app import schemas
from app.thermo_client import ThermoClient


@pytest.fixture
def client():
    return ThermoClient()


def _make_payload(name, components, units, streams, package="Peng-Robinson"):
    return schemas.FlowsheetPayload(
        name=name,
        units=[schemas.UnitSpec(**u) for u in units],
        streams=[schemas.StreamSpec(**s) for s in streams],
        thermo=schemas.ThermoConfig(package=package, components=components),
    )


class TestBalanceRegression:
    """Heater → Cooler with thermo data on the internal edge.

    Previously, the internal stream (heater→cooler) was double-counted
    as a feed because it carried temperature + composition data from the
    AI flowsheet generator, inflating mass balance error to ~79% and
    energy balance error to ~643%.
    """

    def test_internal_stream_not_counted_as_feed(self, client):
        payload = _make_payload(
            name="balance-regression",
            components=["water"],
            units=[
                {
                    "id": "heater-1",
                    "type": "heaterCooler",
                    "parameters": {"outlet_temperature_c": 80.0},
                },
                {
                    "id": "cooler-1",
                    "type": "heaterCooler",
                    "parameters": {"outlet_temperature_c": 30.0},
                },
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "heater-1",
                    "properties": {
                        "temperature": 25.0,
                        "pressure": 101.325,
                        "flow_rate": 3600.0,
                        "composition": {"water": 1.0},
                        "targetHandle": "in",
                    },
                },
                {
                    "id": "internal",
                    "source": "heater-1",
                    "target": "cooler-1",
                    "properties": {
                        # AI-generated flowsheets set thermo data on ALL edges
                        "temperature": 80.0,
                        "pressure": 101.325,
                        "flow_rate": 3600.0,
                        "composition": {"water": 1.0},
                        "sourceHandle": "out",
                        "targetHandle": "in",
                    },
                },
                {
                    "id": "product",
                    "source": "cooler-1",
                    "target": None,
                    "properties": {
                        "sourceHandle": "out",
                    },
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True

        # Mass balance error must be < 1%
        assert result.mass_balance_error < 0.01, (
            f"Mass balance error {result.mass_balance_error:.4f} exceeds 1% threshold"
        )

        # Energy balance error must be < 5%
        assert result.energy_balance_error < 0.05, (
            f"Energy balance error {result.energy_balance_error:.4f} exceeds 5% threshold"
        )


class TestStaleAIEstimates:
    """AI flowsheets set WRONG flow rates on internal/product edges.

    If the solver pre-populates non-feed streams with AI data, a wrong
    flow rate on the product stream creates a stale estimate that the
    balance check compares against, producing ~19% mass error.
    """

    def test_ai_thermo_on_all_edges_different_flow(self, client):
        """Internal + product edges have wrong flow rates from AI — balance must still close."""
        payload = _make_payload(
            name="stale-estimate-regression",
            components=["water"],
            units=[
                {
                    "id": "heater-1",
                    "type": "heaterCooler",
                    "parameters": {"outlet_temperature_c": 80.0},
                },
                {
                    "id": "cooler-1",
                    "type": "heaterCooler",
                    "parameters": {"outlet_temperature_c": 30.0},
                },
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "heater-1",
                    "properties": {
                        "temperature": 25.0,
                        "pressure": 101.325,
                        "flow_rate": 3600.0,
                        "composition": {"water": 1.0},
                        "targetHandle": "in",
                    },
                },
                {
                    "id": "internal",
                    "source": "heater-1",
                    "target": "cooler-1",
                    "properties": {
                        # AI puts WRONG flow rate here (double the feed)
                        "temperature": 80.0,
                        "pressure": 101.325,
                        "flow_rate": 7200.0,
                        "composition": {"water": 1.0},
                        "sourceHandle": "out",
                        "targetHandle": "in",
                    },
                },
                {
                    "id": "product",
                    "source": "cooler-1",
                    "target": None,
                    "properties": {
                        # AI puts WRONG flow rate here too (half the feed)
                        "temperature": 30.0,
                        "pressure": 101.325,
                        "flow_rate": 1800.0,
                        "composition": {"water": 1.0},
                        "sourceHandle": "out",
                    },
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True

        # Mass balance error must be < 1% despite wrong AI flow rates
        assert result.mass_balance_error < 0.01, (
            f"Mass balance error {result.mass_balance_error:.4f} exceeds 1% — "
            "stale AI estimate on non-feed stream likely persisted"
        )

        assert result.energy_balance_error < 0.05, (
            f"Energy balance error {result.energy_balance_error:.4f} exceeds 5%"
        )


class TestPassthroughDuty:
    """Passthrough heater/cooler with pressure drop.

    When no outlet T or duty is specified but pressure_drop_kpa is set,
    the enthalpy changes due to pressure. duty_W must reflect that,
    otherwise the energy balance formula (feed_energy + duty ≠ product_energy)
    produces a large error.
    """

    def test_passthrough_heater_with_pressure_drop(self, client):
        payload = _make_payload(
            name="passthrough-duty-regression",
            components=["water"],
            units=[
                {
                    "id": "chiller-1",
                    "type": "heaterCooler",
                    "parameters": {"pressure_drop_kpa": 50.0},
                    # No outlet_temperature_c or duty_kw — triggers passthrough
                },
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "chiller-1",
                    "properties": {
                        "temperature": 60.0,
                        "pressure": 200.0,
                        "flow_rate": 3600.0,
                        "composition": {"water": 1.0},
                        "targetHandle": "in",
                    },
                },
                {
                    "id": "product",
                    "source": "chiller-1",
                    "target": None,
                    "properties": {"sourceHandle": "out"},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True

        assert result.energy_balance_error < 0.05, (
            f"Energy balance error {result.energy_balance_error:.4f} exceeds 5% — "
            "passthrough duty likely reported as 0 despite pressure drop"
        )


class TestHXOneSideMass:
    """Heat exchanger with only hot_in connected.

    Previously returned both hot_out AND cold_out with the same state,
    effectively doubling the mass on the product side.
    """

    def test_hx_one_side_mass_preserved(self, client):
        payload = _make_payload(
            name="hx-one-side-regression",
            components=["water"],
            units=[
                {
                    "id": "hx-1",
                    "type": "shellTubeHX",
                    "parameters": {"hot_outlet_temperature_c": 40.0},
                },
            ],
            streams=[
                {
                    "id": "hot-feed",
                    "source": None,
                    "target": "hx-1",
                    "properties": {
                        "temperature": 90.0,
                        "pressure": 200.0,
                        "flow_rate": 3600.0,
                        "composition": {"water": 1.0},
                        "targetHandle": "hot_in",
                    },
                },
                {
                    "id": "hot-product",
                    "source": "hx-1",
                    "target": None,
                    "properties": {"sourceHandle": "hot_out"},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True

        assert result.mass_balance_error < 0.01, (
            f"Mass balance error {result.mass_balance_error:.4f} exceeds 1% — "
            "HX one-side likely returned both ports, doubling mass"
        )

        assert result.energy_balance_error < 0.05, (
            f"Energy balance error {result.energy_balance_error:.4f} exceeds 5%"
        )
