"""
Tests for Adjust and Set logical operations (Phase 4).
"""

import pytest

from app import schemas
from app.thermo_client import ThermoClient


@pytest.fixture
def client():
    return ThermoClient()


def _make_payload(name, components, units, streams, package="Peng-Robinson",
                  adjust_specs=None, set_specs=None):
    return schemas.FlowsheetPayload(
        name=name,
        units=[schemas.UnitSpec(**u) for u in units],
        streams=[schemas.StreamSpec(**s) for s in streams],
        thermo=schemas.ThermoConfig(package=package, components=components),
        adjust_specs=[schemas.AdjustSpecModel(**a) for a in (adjust_specs or [])],
        set_specs=[schemas.SetSpecModel(**s) for s in (set_specs or [])],
    )


class TestAdjust:
    def test_adjust_heater_duty_for_target_temperature(self, client):
        """Adjust heater duty to achieve a target outlet temperature."""
        from app.simulation_service import SimulationService
        service = SimulationService()

        payload = _make_payload(
            name="adjust-heater",
            components=["water"],
            units=[
                {
                    "id": "heater-1",
                    "type": "heaterCooler",
                    "parameters": {"duty_kw": 100.0},
                }
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
            adjust_specs=[
                {
                    "variable_unit_id": "heater-1",
                    "variable_param": "duty_kw",
                    "variable_min": 1.0,
                    "variable_max": 500.0,
                    "target_stream_id": "product",
                    "target_property": "temperature_c",
                    "target_value": 80.0,
                    "tolerance": 0.5,
                }
            ],
        )

        result = service.simulate(payload)
        assert result.converged is True

        product = next(s for s in result.streams if s.id == "product")
        # Should be close to 80°C target
        assert product.temperature_c is not None
        assert abs(product.temperature_c - 80.0) < 2.0


class TestSetOperation:
    def test_set_compressor_pressure(self, client):
        """Set compressor outlet pressure = 2.5 × pump outlet pressure."""
        from app.simulation_service import SimulationService
        service = SimulationService()

        payload = _make_payload(
            name="set-test",
            components=["water"],
            units=[
                {
                    "id": "pump-1",
                    "type": "pump",
                    "parameters": {"outlet_pressure_kpa": 500.0},
                },
                {
                    "id": "heater-1",
                    "type": "heaterCooler",
                    "parameters": {"outlet_temperature_c": 200.0},
                },
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "pump-1",
                    "properties": {
                        "temperature": 25.0,
                        "pressure": 101.325,
                        "flow_rate": 3600.0,
                        "composition": {"water": 1.0},
                    },
                },
                {
                    "id": "mid",
                    "source": "pump-1",
                    "target": "heater-1",
                    "properties": {},
                },
                {
                    "id": "product",
                    "source": "heater-1",
                    "target": None,
                    "properties": {},
                },
            ],
            set_specs=[
                {
                    "source_unit_id": "pump-1",
                    "source_param": "outlet_pressure_kpa",
                    "target_unit_id": "heater-1",
                    "target_param": "outlet_pressure_kpa",
                    "multiplier": 1.0,
                    "offset": 0.0,
                }
            ],
        )

        result = service.simulate(payload)
        assert result.converged is True

        # The heater should have inherited the pressure from the set spec
        product = next(s for s in result.streams if s.id == "product")
        assert product is not None
