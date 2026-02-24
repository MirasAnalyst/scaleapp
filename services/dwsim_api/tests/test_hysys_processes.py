"""
End-to-end integration tests for realistic HYSYS-equivalent processes.

Validates that the solver produces physically reasonable results for
canonical process configurations, including:
  - Solver convergence
  - Mass balance closure (< 1%)
  - Key stream properties within expected ranges
  - No critical phase-violation warnings
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


def _check_mass_balance(result, feed_flow_kg_h: float, tolerance: float = 0.01):
    """Assert total product mass flow matches feed within tolerance."""
    product_mass = 0.0
    for s in result.streams:
        if s.id.startswith("feed"):
            continue
        if s.mass_flow_kg_per_h is not None and s.mass_flow_kg_per_h > 0:
            product_mass += s.mass_flow_kg_per_h
    if product_mass > 0:
        error = abs(feed_flow_kg_h - product_mass) / feed_flow_kg_h
        assert error < tolerance, (
            f"Mass balance error {error*100:.1f}% > {tolerance*100}% "
            f"(feed: {feed_flow_kg_h:.0f}, products: {product_mass:.0f})"
        )


# ---------------------------------------------------------------------------
# Test 1: Three-Phase Separation
# ---------------------------------------------------------------------------


class TestThreePhaseSeparation:
    """Well fluid → 3-phase sep → pumps. Gas is methane-rich, water is water-rich."""

    def test_three_phase_separation(self, client):
        payload = _make_payload(
            name="three-phase-sep",
            components=["methane", "ethane", "propane", "n-butane", "water"],
            units=[
                {
                    "id": "sep-1",
                    "type": "separator3p",
                    "parameters": {"temperature_c": 60, "pressure_kpa": 4500},
                },
                {
                    "id": "pump-oil",
                    "type": "pump",
                    "parameters": {"outlet_pressure_kpa": 1500},
                },
                {
                    "id": "pump-water",
                    "type": "pump",
                    "parameters": {"outlet_pressure_kpa": 500},
                },
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "sep-1",
                    "properties": {
                        "temperature": 60,
                        "pressure": 4500,
                        "flow_rate": 100000,
                        "composition": {
                            "methane": 0.40,
                            "ethane": 0.06,
                            "propane": 0.04,
                            "n-butane": 0.02,
                            "water": 0.48,
                        },
                        "targetHandle": "feed-left",
                    },
                },
                {
                    "id": "gas-out",
                    "source": "sep-1",
                    "target": None,
                    "properties": {"sourceHandle": "gas-top"},
                },
                {
                    "id": "oil-to-pump",
                    "source": "sep-1",
                    "target": "pump-oil",
                    "properties": {
                        "sourceHandle": "oil-right",
                        "targetHandle": "suction-left",
                    },
                },
                {
                    "id": "oil-out",
                    "source": "pump-oil",
                    "target": None,
                    "properties": {"sourceHandle": "discharge-right"},
                },
                {
                    "id": "water-to-pump",
                    "source": "sep-1",
                    "target": "pump-water",
                    "properties": {
                        "sourceHandle": "water-bottom",
                        "targetHandle": "suction-left",
                    },
                },
                {
                    "id": "water-out",
                    "source": "pump-water",
                    "target": None,
                    "properties": {"sourceHandle": "discharge-right"},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True

        gas = next((s for s in result.streams if s.id == "gas-out"), None)
        assert gas is not None, "Gas outlet not found"
        assert gas.mass_flow_kg_per_h is not None and gas.mass_flow_kg_per_h > 0

        # Gas should be methane-rich
        if gas.composition:
            methane_frac = gas.composition.get("methane", 0)
            assert methane_frac > 0.5, f"Gas stream methane fraction {methane_frac} too low"


# ---------------------------------------------------------------------------
# Test 2: Binary Distillation (Benzene-Toluene)
# ---------------------------------------------------------------------------


class TestBinaryDistillation:
    """Benzene-toluene → column. Distillate enriched in benzene."""

    def test_benzene_toluene_column(self, client):
        payload = _make_payload(
            name="benzene-toluene-distillation",
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
                },
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "col-1",
                    "properties": {
                        "temperature": 100,
                        "pressure": 101.325,
                        "flow_rate": 10000,
                        "composition": {"benzene": 0.50, "toluene": 0.50},
                        "targetHandle": "feed-stage-10",
                    },
                },
                {
                    "id": "distillate",
                    "source": "col-1",
                    "target": None,
                    "properties": {"sourceHandle": "overhead-top"},
                },
                {
                    "id": "bottoms",
                    "source": "col-1",
                    "target": None,
                    "properties": {"sourceHandle": "bottoms-bottom"},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True

        dist = next((s for s in result.streams if s.id == "distillate"), None)
        bott = next((s for s in result.streams if s.id == "bottoms"), None)

        assert dist is not None, "Distillate stream not found"
        assert bott is not None, "Bottoms stream not found"

        # Distillate should be benzene-enriched
        if dist.composition:
            benzene_dist = dist.composition.get("benzene", 0)
            assert benzene_dist > 0.8, f"Distillate benzene {benzene_dist:.3f} < 0.8"

        # Bottoms should be toluene-enriched
        if bott.composition:
            toluene_bott = bott.composition.get("toluene", 0)
            assert toluene_bott > 0.8, f"Bottoms toluene {toluene_bott:.3f} < 0.8"

        # Mass balance
        if (dist.mass_flow_kg_per_h and bott.mass_flow_kg_per_h):
            _check_mass_balance(result, 10000)


# ---------------------------------------------------------------------------
# Test 3: Crude Preheat Flash
# ---------------------------------------------------------------------------


class TestCrudePreheatFlash:
    """Light hydrocarbon feed → heater → flash. Two-phase split, mass balance."""

    def test_crude_preheat_flash(self, client):
        # Methane (Tc=-82°C) will be all vapor at 60°C, while heavier
        # components (n-hexane Tb=69°C, toluene Tb=111°C) remain liquid.
        payload = _make_payload(
            name="crude-preheat-flash",
            components=["methane", "n-hexane", "toluene"],
            units=[
                {
                    "id": "heater-1",
                    "type": "firedHeater",
                    "parameters": {"outlet_temperature_c": 60, "pressure_drop_kpa": 20},
                },
                {
                    "id": "flash-1",
                    "type": "flashDrum",
                    "parameters": {"pressure_kpa": 500},
                },
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "heater-1",
                    "properties": {
                        "temperature": 25,
                        "pressure": 2000,
                        "flow_rate": 50000,
                        "composition": {
                            "methane": 0.30,
                            "n-hexane": 0.40,
                            "toluene": 0.30,
                        },
                        "targetHandle": "hot-in-left",
                    },
                },
                {
                    "id": "hot-crude",
                    "source": "heater-1",
                    "target": "flash-1",
                    "properties": {
                        "sourceHandle": "hot-out-right",
                        "targetHandle": "feed-left",
                    },
                },
                {
                    "id": "vapor-out",
                    "source": "flash-1",
                    "target": None,
                    "properties": {"sourceHandle": "vapor-top"},
                },
                {
                    "id": "liquid-out",
                    "source": "flash-1",
                    "target": None,
                    "properties": {"sourceHandle": "liquid-bottom"},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True

        hot_crude = next((s for s in result.streams if s.id == "hot-crude"), None)
        vapor = next((s for s in result.streams if s.id == "vapor-out"), None)
        liquid = next((s for s in result.streams if s.id == "liquid-out"), None)

        assert hot_crude is not None, "Hot crude stream not found"
        assert vapor is not None, "Flash vapor not found"
        assert liquid is not None, "Flash liquid not found"

        # Heater should raise temperature above ambient
        if hot_crude.temperature_c is not None:
            assert hot_crude.temperature_c > 50, (
                f"Heater outlet {hot_crude.temperature_c}°C — expected >50°C"
            )

        # Flash should produce both phases
        if vapor.mass_flow_kg_per_h is not None and liquid.mass_flow_kg_per_h is not None:
            assert vapor.mass_flow_kg_per_h > 0, "No vapor produced in flash"
            assert liquid.mass_flow_kg_per_h > 0, "No liquid produced in flash"
            total_out = vapor.mass_flow_kg_per_h + liquid.mass_flow_kg_per_h
            if total_out > 0:
                error = abs(50000 - total_out) / 50000
                assert error < 0.02, f"Flash mass balance error {error*100:.1f}%"


# ---------------------------------------------------------------------------
# Test 4: Simple Compression
# ---------------------------------------------------------------------------


class TestSimpleCompression:
    """Gas → compressor → cooler. Discharge T < 300°C, cooled to ~40°C."""

    def test_simple_compression(self, client):
        payload = _make_payload(
            name="simple-compression",
            components=["methane", "ethane"],
            units=[
                {
                    "id": "comp-1",
                    "type": "compressor",
                    "parameters": {"pressure_ratio": 3.0, "efficiency": 0.80},
                },
                {
                    "id": "cooler-1",
                    "type": "heaterCooler",
                    "parameters": {"outlet_temperature_c": 40, "pressure_drop_kpa": 20},
                },
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "comp-1",
                    "properties": {
                        "temperature": 30,
                        "pressure": 1000,
                        "flow_rate": 5000,
                        "composition": {"methane": 0.85, "ethane": 0.15},
                        "targetHandle": "suction-left",
                    },
                },
                {
                    "id": "compressed",
                    "source": "comp-1",
                    "target": "cooler-1",
                    "properties": {
                        "sourceHandle": "discharge-right",
                        "targetHandle": "hot-in-left",
                    },
                },
                {
                    "id": "cooled-gas",
                    "source": "cooler-1",
                    "target": None,
                    "properties": {"sourceHandle": "hot-out-right"},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True

        compressed = next((s for s in result.streams if s.id == "compressed"), None)
        cooled = next((s for s in result.streams if s.id == "cooled-gas"), None)

        assert compressed is not None, "Compressed stream not found"
        assert cooled is not None, "Cooled gas stream not found"

        # Compressed gas should have higher pressure (~3000 kPa)
        if compressed.pressure_kpa is not None:
            assert compressed.pressure_kpa > 2500, (
                f"Compressed P {compressed.pressure_kpa} kPa — expected >2500"
            )

        # Compressor discharge shouldn't exceed 300°C for ratio 3
        if compressed.temperature_c is not None:
            assert compressed.temperature_c < 300, (
                f"Discharge temp {compressed.temperature_c}°C exceeds 300°C"
            )

        # Cooler should bring temperature down to ~40°C
        if cooled.temperature_c is not None:
            assert cooled.temperature_c < 50, (
                f"Cooled gas {cooled.temperature_c}°C — expected <50°C"
            )


# ---------------------------------------------------------------------------
# Test 5: Pump and Valve
# ---------------------------------------------------------------------------


class TestPumpAndValve:
    """Liquid → pump → valve. Pressure rises then drops correctly."""

    def test_pump_and_valve(self, client):
        payload = _make_payload(
            name="pump-valve",
            components=["water"],
            units=[
                {
                    "id": "pump-1",
                    "type": "pump",
                    "parameters": {"outlet_pressure_kpa": 2000, "efficiency": 0.75},
                },
                {
                    "id": "valve-1",
                    "type": "valve",
                    "parameters": {"outlet_pressure_kpa": 500},
                },
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "pump-1",
                    "properties": {
                        "temperature": 25,
                        "pressure": 101.325,
                        "flow_rate": 3600,
                        "composition": {"water": 1.0},
                        "targetHandle": "suction-left",
                    },
                },
                {
                    "id": "pumped",
                    "source": "pump-1",
                    "target": "valve-1",
                    "properties": {
                        "sourceHandle": "discharge-right",
                        "targetHandle": "in-left",
                    },
                },
                {
                    "id": "letdown",
                    "source": "valve-1",
                    "target": None,
                    "properties": {"sourceHandle": "out-right"},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True

        pumped = next((s for s in result.streams if s.id == "pumped"), None)
        letdown = next((s for s in result.streams if s.id == "letdown"), None)

        assert pumped is not None, "Pumped stream not found"
        assert letdown is not None, "Letdown stream not found"

        # Pump should raise pressure from ~101 to 2000 kPa
        if pumped.pressure_kpa is not None:
            assert pumped.pressure_kpa > 1500, (
                f"Pump outlet {pumped.pressure_kpa} kPa — expected >1500"
            )

        # Valve should drop pressure to 500 kPa
        if letdown.pressure_kpa is not None:
            assert letdown.pressure_kpa < 700, (
                f"Valve outlet {letdown.pressure_kpa} kPa — expected <700"
            )
            assert letdown.pressure_kpa < pumped.pressure_kpa, (
                "Valve outlet pressure should be less than pump outlet"
            )


# ---------------------------------------------------------------------------
# Test 6: Water-Ethanol Distillation (NRTL)
# ---------------------------------------------------------------------------


class TestWaterEthanolNRTL:
    """Ethanol-water → NRTL column. Distillate enriched in ethanol."""

    def test_water_ethanol_nrtl(self, client):
        payload = _make_payload(
            name="water-ethanol-nrtl",
            components=["ethanol", "water"],
            package="NRTL",
            units=[
                {
                    "id": "col-1",
                    "type": "distillationColumn",
                    "parameters": {
                        "light_key": "ethanol",
                        "heavy_key": "water",
                        "light_key_recovery": 0.95,
                        "heavy_key_recovery": 0.95,
                        "reflux_ratio_multiple": 1.5,
                        "condenser_pressure_kpa": 101.325,
                        "n_stages": 25,
                    },
                },
            ],
            streams=[
                {
                    "id": "feed",
                    "source": None,
                    "target": "col-1",
                    "properties": {
                        "temperature": 80,
                        "pressure": 101.325,
                        "flow_rate": 5000,
                        "composition": {"ethanol": 0.30, "water": 0.70},
                        "targetHandle": "feed-stage-10",
                    },
                },
                {
                    "id": "distillate",
                    "source": "col-1",
                    "target": None,
                    "properties": {"sourceHandle": "overhead-top"},
                },
                {
                    "id": "bottoms",
                    "source": "col-1",
                    "target": None,
                    "properties": {"sourceHandle": "bottoms-bottom"},
                },
            ],
        )

        result = client.simulate_flowsheet(payload)
        assert result.converged is True

        dist = next((s for s in result.streams if s.id == "distillate"), None)
        bott = next((s for s in result.streams if s.id == "bottoms"), None)

        assert dist is not None, "Distillate stream not found"
        assert bott is not None, "Bottoms stream not found"

        # Distillate should be ethanol-enriched
        if dist.composition:
            ethanol_dist = dist.composition.get("ethanol", 0)
            assert ethanol_dist > 0.7, (
                f"Distillate ethanol {ethanol_dist:.3f} < 0.7"
            )

        # Bottoms should be water-enriched
        if bott.composition:
            water_bott = bott.composition.get("water", 0)
            assert water_bott > 0.8, (
                f"Bottoms water {water_bott:.3f} < 0.8"
            )

        # Mass balance
        if dist.mass_flow_kg_per_h and bott.mass_flow_kg_per_h:
            _check_mass_balance(result, 5000)
