"""Tests for kinetic reactor (CSTR / PFR)."""

import pytest
from app.thermo_engine import ThermoEngine
from app.kinetic_reactor import KineticReactorOp


def test_cstr_simple_reaction():
    """Simple A → B reaction in CSTR should show conversion."""
    engine = ThermoEngine(
        component_names=["methane", "ethane"],
        property_package="Peng-Robinson",
    )

    inlet = engine.pt_flash(
        T=400 + 273.15, P=500_000.0,
        zs=[1.0, 0.0],
        molar_flow=10.0,
    )

    reactor = KineticReactorOp(
        id="cstr-1",
        name="Test CSTR",
        params={
            "reactor_type": "CSTR",
            "volume_m3": 1.0,
            "temperature_c": 400,
            "pressure_kpa": 500,
            "reactions": [
                {
                    "A": 1e4,
                    "Ea": 50000.0,
                    "stoichiometry": {"methane": -1, "ethane": 1},
                    "orders": {"methane": 1},
                }
            ],
        },
        engine=engine,
    )

    result = reactor.calculate({"in": inlet})
    outlet = result["out"]

    # Some ethane should be produced
    assert outlet.zs[1] > 0, "Ethane should be produced"
    # Temperature should be at specified value
    assert outlet.temperature == pytest.approx(400 + 273.15, abs=5)


def test_pfr_simple_reaction():
    """Simple reaction in PFR should show conversion."""
    engine = ThermoEngine(
        component_names=["methane", "ethane"],
        property_package="Peng-Robinson",
    )

    inlet = engine.pt_flash(
        T=400 + 273.15, P=500_000.0,
        zs=[1.0, 0.0],
        molar_flow=10.0,
    )

    reactor = KineticReactorOp(
        id="pfr-1",
        name="Test PFR",
        params={
            "reactor_type": "PFR",
            "volume_m3": 1.0,
            "temperature_c": 400,
            "pressure_kpa": 500,
            "reactions": [
                {
                    "A": 1e4,
                    "Ea": 50000.0,
                    "stoichiometry": {"methane": -1, "ethane": 1},
                    "orders": {"methane": 1},
                }
            ],
        },
        engine=engine,
    )

    result = reactor.calculate({"in": inlet})
    outlet = result["out"]

    assert outlet.zs[1] > 0, "Ethane should be produced in PFR"


def test_kinetic_reactor_no_reactions():
    """With no reactions, should pass through."""
    engine = ThermoEngine(
        component_names=["methane"],
        property_package="Peng-Robinson",
    )

    inlet = engine.pt_flash(T=298.15, P=101325.0, zs=[1.0], molar_flow=5.0)

    reactor = KineticReactorOp(
        id="kr-1",
        name="Empty",
        params={"reactor_type": "CSTR", "volume_m3": 1.0},
        engine=engine,
    )

    result = reactor.calculate({"in": inlet})
    outlet = result["out"]

    assert outlet.molar_flow == pytest.approx(5.0, rel=0.01)
    assert len(reactor.warnings) > 0
