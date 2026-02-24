"""
Tests for the flowsheet solver.

Verifies that simple flowsheets converge with correct mass/energy balances.
"""

import pytest

from app import schemas
from app.thermo_engine import ThermoEngine
from app.thermo_client import ThermoClient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


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
# Simple pump test
# ---------------------------------------------------------------------------


class TestSimplePump:
    """Feed → Pump → Product"""

    def test_pump_simulation(self, client):
        payload = _make_payload(
            name="pump-test",
            components=["water"],
            units=[
                {
                    "id": "pump-1",
                    "type": "pump",
                    "parameters": {
                        "outlet_pressure_kpa": 1000.0,
                        "efficiency": 0.75,
                    },
                }
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "pump-1",
                    "properties": {
                        "temperature": 25.0,
                        "pressure": 101.325,
                        "flow_rate": 3600.0,  # 1 kg/s
                        "composition": {"water": 1.0},
                        "targetHandle": "in",
                    },
                },
                {
                    "id": "product",
                    "source": "pump-1",
                    "target": None,
                    "properties": {
                        "sourceHandle": "out",
                    },
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.status == "converged"
        assert result.converged is True

        # Find product stream
        product = next((s for s in result.streams if s.id == "product"), None)
        assert product is not None
        assert product.pressure_kpa is not None
        assert product.pressure_kpa > 500  # Should be around 1000 kPa

        # Pump duty should be positive (work input)
        pump = next((u for u in result.units if u.id == "pump-1"), None)
        assert pump is not None
        assert pump.duty_kw is not None
        assert pump.duty_kw > 0


# ---------------------------------------------------------------------------
# Heater test
# ---------------------------------------------------------------------------


class TestHeater:
    """Feed → Heater → Product"""

    def test_heater_simulation(self, client):
        payload = _make_payload(
            name="heater-test",
            components=["water"],
            units=[
                {
                    "id": "heater-1",
                    "type": "heaterCooler",
                    "parameters": {
                        "outlet_temperature_c": 80.0,
                    },
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
                        "targetHandle": "in",
                    },
                },
                {
                    "id": "product",
                    "source": "heater-1",
                    "target": None,
                    "properties": {
                        "sourceHandle": "out",
                    },
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.status == "converged"

        product = next((s for s in result.streams if s.id == "product"), None)
        assert product is not None
        assert product.temperature_c is not None
        assert abs(product.temperature_c - 80.0) < 2.0  # Within 2C

        heater = next((u for u in result.units if u.id == "heater-1"), None)
        assert heater is not None
        assert heater.duty_kw is not None
        assert heater.duty_kw > 0  # Heating = positive duty


# ---------------------------------------------------------------------------
# Flash drum test
# ---------------------------------------------------------------------------


class TestFlashDrum:
    """Feed → Flash Drum → Vapor + Liquid"""

    def test_flash_drum_separation(self, client):
        payload = _make_payload(
            name="flash-test",
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
                        "targetHandle": "in",
                    },
                },
                {
                    "id": "vapor",
                    "source": "flash-1",
                    "target": None,
                    "properties": {"sourceHandle": "vapor"},
                },
                {
                    "id": "liquid",
                    "source": "flash-1",
                    "target": None,
                    "properties": {"sourceHandle": "liquid"},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.status == "converged"

        vapor = next((s for s in result.streams if s.id == "vapor"), None)
        liquid = next((s for s in result.streams if s.id == "liquid"), None)

        assert vapor is not None
        assert liquid is not None

        # Vapor should be enriched in methane (lighter component)
        if vapor.composition and liquid.composition:
            assert vapor.composition.get("methane", 0) > liquid.composition.get(
                "methane", 0
            )


# ---------------------------------------------------------------------------
# Mixer test
# ---------------------------------------------------------------------------


class TestMixer:
    """Two feeds → Mixer → Product"""

    def test_mixer_mass_balance(self, client):
        payload = _make_payload(
            name="mixer-test",
            components=["water", "ethanol"],
            units=[
                {
                    "id": "mixer-1",
                    "type": "mixer",
                    "parameters": {},
                }
            ],
            streams=[
                {
                    "id": "feed-1",
                    "source": None,
                    "target": "mixer-1",
                    "properties": {
                        "temperature": 25.0,
                        "pressure": 101.325,
                        "flow_rate": 1800.0,  # 0.5 kg/s
                        "composition": {"water": 1.0, "ethanol": 0.0},
                        "targetHandle": "in-1",
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
                        "composition": {"water": 0.0, "ethanol": 1.0},
                        "targetHandle": "in-2",
                    },
                },
                {
                    "id": "product",
                    "source": "mixer-1",
                    "target": None,
                    "properties": {"sourceHandle": "out"},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.status == "converged"

        product = next((s for s in result.streams if s.id == "product"), None)
        assert product is not None
        # Total flow should be approximately sum of feeds
        assert product.mass_flow_kg_per_h is not None
        assert product.mass_flow_kg_per_h > 3000  # Should be ~3600


# ---------------------------------------------------------------------------
# Flash calculation endpoint test
# ---------------------------------------------------------------------------


class TestValve:
    """Feed → Valve → Product (isenthalpic expansion)"""

    def test_valve_simulation(self, client):
        payload = _make_payload(
            name="valve-test",
            components=["propane"],
            units=[
                {
                    "id": "valve-1",
                    "type": "valve",
                    "parameters": {
                        "outlet_pressure_kpa": 200.0,
                    },
                }
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "valve-1",
                    "properties": {
                        "temperature": 25.0,
                        "pressure": 1000.0,
                        "flow_rate": 3600.0,
                        "composition": {"propane": 1.0},
                        "targetHandle": "in",
                    },
                },
                {
                    "id": "product",
                    "source": "valve-1",
                    "target": None,
                    "properties": {"sourceHandle": "out"},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.status == "converged"

        product = next((s for s in result.streams if s.id == "product"), None)
        assert product is not None
        assert product.pressure_kpa is not None
        assert abs(product.pressure_kpa - 200.0) < 10.0


# ---------------------------------------------------------------------------
# Shortcut distillation test
# ---------------------------------------------------------------------------


class TestDistillation:
    """Feed → Distillation Column → Distillate + Bottoms"""

    def test_shortcut_distillation(self, client):
        payload = _make_payload(
            name="distillation-test",
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
                        "targetHandle": "in",
                    },
                },
                {
                    "id": "distillate",
                    "source": "col-1",
                    "target": None,
                    "properties": {"sourceHandle": "distillate"},
                },
                {
                    "id": "bottoms",
                    "source": "col-1",
                    "target": None,
                    "properties": {"sourceHandle": "bottoms"},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.status == "converged"

        distillate = next((s for s in result.streams if s.id == "distillate"), None)
        bottoms = next((s for s in result.streams if s.id == "bottoms"), None)
        assert distillate is not None
        assert bottoms is not None

        # Distillate should be enriched in benzene (lighter)
        if distillate.composition and bottoms.composition:
            assert distillate.composition.get("benzene", 0) > bottoms.composition.get(
                "benzene", 0
            )


# ---------------------------------------------------------------------------
# Flash calculation endpoint test
# ---------------------------------------------------------------------------


class TestFlashEndpoint:
    def test_pt_flash(self, client):
        request = schemas.FlashRequest(
            thermo=schemas.ThermoConfig(
                package="Peng-Robinson",
                components=["methane", "ethane", "propane"],
            ),
            temperature_c=25.0,
            pressure_kpa=101.325,
            composition={"methane": 0.7, "ethane": 0.2, "propane": 0.1},
            mass_flow_kg_per_h=1000.0,
            flash_type="PT",
        )
        result = client.flash_calculation(request)
        assert result.stream.temperature_c is not None
        assert abs(result.stream.temperature_c - 25.0) < 1.0
        assert result.stream.phase == "vapor"
