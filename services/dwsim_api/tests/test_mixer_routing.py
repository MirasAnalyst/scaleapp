"""
Tests for mixer multi-inlet routing fix (Phase 1).
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


class TestMixerRouting:
    def test_mixer_two_feeds_same_handle(self, client):
        """Two feeds both with targetHandle 'in-left' should both arrive at mixer."""
        payload = _make_payload(
            name="mixer-collision",
            components=["water"],
            units=[
                {"id": "mixer-1", "type": "mixer", "parameters": {}}
            ],
            streams=[
                {
                    "id": "feed-1",
                    "source": None,
                    "target": "mixer-1",
                    "properties": {
                        "temperature": 25.0,
                        "pressure": 101.325,
                        "flow_rate": 1800.0,
                        "composition": {"water": 1.0},
                        "targetHandle": "in-left",
                    },
                },
                {
                    "id": "feed-2",
                    "source": None,
                    "target": "mixer-1",
                    "properties": {
                        "temperature": 25.0,
                        "pressure": 101.325,
                        "flow_rate": 1800.0,
                        "composition": {"water": 1.0},
                        "targetHandle": "in-left",
                    },
                },
                {
                    "id": "product",
                    "source": "mixer-1",
                    "target": None,
                    "properties": {},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True

        product = next(s for s in result.streams if s.id == "product")
        assert product.mass_flow_kg_per_h is not None
        # Should be sum of both feeds (~3600 kg/h), not just one (~1800)
        assert product.mass_flow_kg_per_h > 3000

    def test_mixer_three_feeds(self, client):
        """Three feeds into a mixer should all contribute to output."""
        payload = _make_payload(
            name="mixer-three",
            components=["water"],
            units=[
                {"id": "mixer-1", "type": "mixer", "parameters": {}}
            ],
            streams=[
                {
                    "id": "feed-1",
                    "source": None,
                    "target": "mixer-1",
                    "properties": {
                        "temperature": 25.0,
                        "pressure": 101.325,
                        "flow_rate": 1000.0,
                        "composition": {"water": 1.0},
                        "targetHandle": "in-left",
                    },
                },
                {
                    "id": "feed-2",
                    "source": None,
                    "target": "mixer-1",
                    "properties": {
                        "temperature": 25.0,
                        "pressure": 101.325,
                        "flow_rate": 1000.0,
                        "composition": {"water": 1.0},
                        "targetHandle": "in-left",
                    },
                },
                {
                    "id": "feed-3",
                    "source": None,
                    "target": "mixer-1",
                    "properties": {
                        "temperature": 25.0,
                        "pressure": 101.325,
                        "flow_rate": 1000.0,
                        "composition": {"water": 1.0},
                        "targetHandle": "in-left",
                    },
                },
                {
                    "id": "product",
                    "source": "mixer-1",
                    "target": None,
                    "properties": {},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True

        product = next(s for s in result.streams if s.id == "product")
        # Should be ~3000 kg/h (sum of three × 1000)
        assert product.mass_flow_kg_per_h > 2500
