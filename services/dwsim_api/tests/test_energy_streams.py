"""
Tests for energy stream integration (Phase 6).
"""

import pytest

from app import schemas
from app.thermo_client import ThermoClient


@pytest.fixture
def client():
    return ThermoClient()


def _make_payload(name, components, units, streams, package="Peng-Robinson",
                  energy_streams=None):
    return schemas.FlowsheetPayload(
        name=name,
        units=[schemas.UnitSpec(**u) for u in units],
        streams=[schemas.StreamSpec(**s) for s in streams],
        thermo=schemas.ThermoConfig(package=package, components=components),
        energy_streams=[schemas.EnergyStreamSpec(**e) for e in (energy_streams or [])],
    )


class TestEnergyStreams:
    def test_turbine_powers_heater(self, client):
        """Turbine duty should be routed to a heater via an energy stream."""
        payload = _make_payload(
            name="energy-stream-test",
            components=["water"],
            units=[
                {
                    "id": "turbine-1",
                    "type": "turbine",
                    "parameters": {
                        "outlet_pressure_kpa": 101.325,
                        "efficiency": 0.80,
                    },
                },
                {
                    "id": "heater-1",
                    "type": "heaterCooler",
                    "parameters": {},  # duty will be injected from energy stream
                },
            ],
            streams=[
                {
                    "id": "steam-in",
                    "source": None,
                    "target": "turbine-1",
                    "properties": {
                        "temperature": 400.0,
                        "pressure": 3000.0,
                        "flow_rate": 3600.0,
                        "composition": {"water": 1.0},
                    },
                },
                {
                    "id": "steam-out",
                    "source": "turbine-1",
                    "target": None,
                    "properties": {},
                },
                {
                    "id": "cold-water-in",
                    "source": None,
                    "target": "heater-1",
                    "properties": {
                        "temperature": 25.0,
                        "pressure": 101.325,
                        "flow_rate": 3600.0,
                        "composition": {"water": 1.0},
                    },
                },
                {
                    "id": "warm-water-out",
                    "source": "heater-1",
                    "target": None,
                    "properties": {},
                },
            ],
            energy_streams=[
                {
                    "id": "energy-1",
                    "source_unit": "turbine-1",
                    "target_unit": "heater-1",
                }
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True

        # Turbine should produce work (negative duty)
        turbine = next(u for u in result.units if u.id == "turbine-1")
        assert turbine.duty_kw is not None
        assert turbine.duty_kw < 0  # Turbine produces work

        # Heater should use that duty to warm water
        heater = next(u for u in result.units if u.id == "heater-1")
        assert heater.duty_kw is not None

    def test_fixed_energy_stream(self, client):
        """Energy stream with fixed duty_kw should inject that value."""
        payload = _make_payload(
            name="fixed-energy",
            components=["water"],
            units=[
                {
                    "id": "heater-1",
                    "type": "heaterCooler",
                    "parameters": {},
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
                    },
                },
                {
                    "id": "product",
                    "source": "heater-1",
                    "target": None,
                    "properties": {},
                },
            ],
            energy_streams=[
                {
                    "id": "utility-energy",
                    "duty_kw": 100.0,
                    "target_unit": "heater-1",
                }
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True

        product = next(s for s in result.streams if s.id == "product")
        # With 100 kW input to 1 kg/s water, temperature should rise
        assert product.temperature_c > 25.0
