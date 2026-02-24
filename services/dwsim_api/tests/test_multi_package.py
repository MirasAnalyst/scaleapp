"""
Tests for multiple property packages per flowsheet (Phase 8).
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


class TestMultiPackage:
    def test_per_unit_property_package(self, client):
        """Unit with per-unit NRTL package should use that package."""
        payload = _make_payload(
            name="multi-pkg",
            components=["water", "ethanol"],
            units=[
                {
                    "id": "heater-pr",
                    "type": "heaterCooler",
                    "parameters": {"outlet_temperature_c": 50.0},
                },
                {
                    "id": "heater-nrtl",
                    "type": "heaterCooler",
                    "parameters": {"outlet_temperature_c": 70.0},
                    "property_package": "NRTL",
                    "components": ["water", "ethanol"],
                },
            ],
            streams=[
                {
                    "id": "feed-1",
                    "source": None,
                    "target": "heater-pr",
                    "properties": {
                        "temperature": 25.0,
                        "pressure": 101.325,
                        "flow_rate": 3600.0,
                        "composition": {"water": 0.5, "ethanol": 0.5},
                    },
                },
                {
                    "id": "mid",
                    "source": "heater-pr",
                    "target": "heater-nrtl",
                    "properties": {},
                },
                {
                    "id": "product",
                    "source": "heater-nrtl",
                    "target": None,
                    "properties": {},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True

        product = next(s for s in result.streams if s.id == "product")
        assert product.temperature_c is not None
        # NRTL heater should heat to ~70°C
        assert abs(product.temperature_c - 70.0) < 3.0

    def test_schema_accepts_per_unit_fields(self):
        """UnitSpec should accept property_package and components fields."""
        spec = schemas.UnitSpec(
            id="test-1",
            type="heaterCooler",
            parameters={"outlet_temperature_c": 50.0},
            property_package="NRTL",
            components=["water", "ethanol"],
        )
        assert spec.property_package == "NRTL"
        assert spec.components == ["water", "ethanol"]

    def test_no_per_unit_package_uses_default(self, client):
        """Units without per-unit package should use the global package."""
        payload = _make_payload(
            name="default-pkg",
            components=["methane", "ethane"],
            units=[
                {
                    "id": "heater-1",
                    "type": "heaterCooler",
                    "parameters": {"outlet_temperature_c": 50.0},
                }
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "heater-1",
                    "properties": {
                        "temperature": 25.0,
                        "pressure": 2000.0,
                        "flow_rate": 3600.0,
                        "composition": {"methane": 0.7, "ethane": 0.3},
                    },
                },
                {
                    "id": "product",
                    "source": "heater-1",
                    "target": None,
                    "properties": {},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True
        assert result.property_package == "Peng-Robinson"
