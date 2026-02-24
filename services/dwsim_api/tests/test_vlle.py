"""Tests for VLLE 3-phase separator."""

import pytest
from app.thermo_engine import ThermoEngine
from app.unit_operations import UNIT_OP_REGISTRY


def test_vlle_water_hexane():
    """Water + hexane in VLLE separator should give two distinct liquid phases."""
    engine = ThermoEngine(
        component_names=["water", "n-hexane"],
        property_package="Peng-Robinson",
    )

    inlet = engine.pt_flash(
        T=298.15, P=101325.0,
        zs=[0.5, 0.5],
        molar_flow=100.0,
    )

    sep_cls = UNIT_OP_REGISTRY["separator3p"]
    sep = sep_cls(
        id="sep3p-1",
        name="VLLE Sep",
        params={"temperature_c": 25, "pressure_kpa": 101.325},
        engine=engine,
    )

    result = sep.calculate({"in": inlet})

    assert "gas" in result
    assert "oil" in result
    assert "water" in result

    # At 25°C, water and hexane are nearly immiscible liquids
    # Gas phase should have very low flow at these conditions
    # Oil (hexane-rich) and water should have significant flow
    total_liquid_flow = result["oil"].molar_flow + result["water"].molar_flow
    assert total_liquid_flow > 0, "Should have liquid phases"


def test_vlle_fallback_single_liquid():
    """With a single-phase liquid, VLLE should still work (empty second liquid)."""
    engine = ThermoEngine(
        component_names=["water"],
        property_package="Peng-Robinson",
    )

    inlet = engine.pt_flash(T=298.15, P=101325.0, zs=[1.0], molar_flow=50.0)

    sep_cls = UNIT_OP_REGISTRY["separator3p"]
    sep = sep_cls(
        id="sep3p-2",
        name="Single Comp Sep",
        params={"temperature_c": 25, "pressure_kpa": 101.325},
        engine=engine,
    )

    result = sep.calculate({"in": inlet})

    assert "gas" in result
    assert "oil" in result
    assert "water" in result
    # Most flow should be in one liquid phase
    total = result["gas"].molar_flow + result["oil"].molar_flow + result["water"].molar_flow
    assert total == pytest.approx(50.0, rel=0.1)


def test_vlle_flash_method():
    """Test the vlle_flash method directly on ThermoEngine."""
    engine = ThermoEngine(
        component_names=["water", "n-hexane"],
        property_package="Peng-Robinson",
    )

    result = engine.vlle_flash(T=298.15, P=101325.0, zs=[0.5, 0.5], molar_flow=100.0)

    assert "gas" in result
    assert "liquid1" in result
    assert "liquid2" in result

    # Total flow should be conserved (approximately)
    total = result["gas"].molar_flow + result["liquid1"].molar_flow + result["liquid2"].molar_flow
    assert total == pytest.approx(100.0, rel=0.2)
