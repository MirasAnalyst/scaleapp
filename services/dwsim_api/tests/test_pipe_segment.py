"""
Tests for pipe segment / pressure drop modeling (Phase 2).
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


class TestPipeSegment:
    """Feed → Pipe → Product"""

    def test_water_pipe_pressure_drop(self, client):
        """Water flowing through a 100m pipe should lose pressure."""
        payload = _make_payload(
            name="pipe-water",
            components=["water"],
            units=[
                {
                    "id": "pipe-1",
                    "type": "pipeSegment",
                    "parameters": {
                        "length_m": 100.0,
                        "diameter_m": 0.1,
                        "roughness_m": 4.5e-5,
                    },
                }
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "pipe-1",
                    "properties": {
                        "temperature": 25.0,
                        "pressure": 500.0,
                        "flow_rate": 36000.0,  # 10 kg/s
                        "composition": {"water": 1.0},
                    },
                },
                {
                    "id": "product",
                    "source": "pipe-1",
                    "target": None,
                    "properties": {},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True

        product = next(s for s in result.streams if s.id == "product")
        assert product.pressure_kpa is not None
        # Pressure should drop from 500 kPa
        assert product.pressure_kpa < 500.0

        pipe = next(u for u in result.units if u.id == "pipe-1")
        assert pipe.pressure_drop_kpa is not None
        assert pipe.pressure_drop_kpa > 0

    def test_gas_pipe(self, client):
        """Gas pipe should also show pressure drop."""
        payload = _make_payload(
            name="pipe-gas",
            components=["methane"],
            units=[
                {
                    "id": "pipe-1",
                    "type": "pipeline",
                    "parameters": {
                        "length_m": 500.0,
                        "diameter_m": 0.2,
                    },
                }
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "pipe-1",
                    "properties": {
                        "temperature": 25.0,
                        "pressure": 5000.0,
                        "flow_rate": 3600.0,
                        "composition": {"methane": 1.0},
                    },
                },
                {
                    "id": "product",
                    "source": "pipe-1",
                    "target": None,
                    "properties": {},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True

        product = next(s for s in result.streams if s.id == "product")
        assert product.pressure_kpa < 5000.0

    def test_elevation_change(self, client):
        """Elevation change should affect pressure drop."""
        # Uphill pipe
        payload = _make_payload(
            name="pipe-uphill",
            components=["water"],
            units=[
                {
                    "id": "pipe-1",
                    "type": "pipeSegment",
                    "parameters": {
                        "length_m": 10.0,
                        "diameter_m": 0.5,  # Large diameter = minimal friction
                        "elevation_change_m": 50.0,  # 50m uphill
                    },
                }
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "pipe-1",
                    "properties": {
                        "temperature": 25.0,
                        "pressure": 1000.0,
                        "flow_rate": 3600.0,
                        "composition": {"water": 1.0},
                    },
                },
                {
                    "id": "product",
                    "source": "pipe-1",
                    "target": None,
                    "properties": {},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True

        product = next(s for s in result.streams if s.id == "product")
        # 50m elevation ~ 490 kPa hydrostatic pressure drop for water
        # So from 1000 kPa, should drop significantly
        assert product.pressure_kpa < 600.0

    def test_heat_loss(self, client):
        """Pipe with heat loss should cool the fluid."""
        payload = _make_payload(
            name="pipe-heatloss",
            components=["water"],
            units=[
                {
                    "id": "pipe-1",
                    "type": "pipeSegment",
                    "parameters": {
                        "length_m": 100.0,
                        "diameter_m": 0.5,
                        "heat_loss_kw": 50.0,  # 50 kW heat loss
                    },
                }
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "pipe-1",
                    "properties": {
                        "temperature": 80.0,
                        "pressure": 500.0,
                        "flow_rate": 3600.0,
                        "composition": {"water": 1.0},
                    },
                },
                {
                    "id": "product",
                    "source": "pipe-1",
                    "target": None,
                    "properties": {},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True

        product = next(s for s in result.streams if s.id == "product")
        # Temperature should drop due to heat loss
        assert product.temperature_c < 80.0
