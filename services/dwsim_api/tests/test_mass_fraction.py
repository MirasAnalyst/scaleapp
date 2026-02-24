"""
Tests for mass/volume fraction stream input (Phase 3).
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


class TestMassFraction:
    def test_mass_fraction_water_ethanol(self, client):
        """Mass fractions should be converted to mole fractions correctly."""
        # 50/50 mass fraction water/ethanol
        # MW_water = 18.015, MW_ethanol = 46.07
        # Mole frac water = (0.5/18.015) / (0.5/18.015 + 0.5/46.07) ≈ 0.719
        payload = _make_payload(
            name="mass-frac-test",
            components=["water", "ethanol"],
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
                        "pressure": 101.325,
                        "flow_rate": 3600.0,
                        "composition": {"water": 0.5, "ethanol": 0.5},
                        "composition_basis": "mass",
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

        # Check that feed has the right mole fractions
        feed = next(s for s in result.streams if s.id == "feed")
        assert feed.composition is not None
        water_frac = feed.composition.get("water", 0)
        # Should be ~0.72 (water enriched on mole basis due to lower MW)
        assert 0.65 < water_frac < 0.80

    def test_mass_composition_key(self, client):
        """mass_composition key should be recognized and treated as mass fractions."""
        payload = _make_payload(
            name="mass-comp-key",
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
                        "mass_composition": {"methane": 0.7, "ethane": 0.3},
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

        feed = next(s for s in result.streams if s.id == "feed")
        # Methane MW=16, Ethane MW=30
        # Mole frac methane = (0.7/16) / (0.7/16 + 0.3/30) ≈ 0.814
        assert feed.composition["methane"] > 0.75

    def test_default_mole_basis(self, client):
        """Without composition_basis, mole fractions should be used (default)."""
        payload = _make_payload(
            name="mole-default",
            components=["water", "ethanol"],
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
                        "pressure": 101.325,
                        "flow_rate": 3600.0,
                        "composition": {"water": 0.5, "ethanol": 0.5},
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

        feed = next(s for s in result.streams if s.id == "feed")
        # Mole basis: should stay at ~0.5/0.5
        assert abs(feed.composition.get("water", 0) - 0.5) < 0.01
