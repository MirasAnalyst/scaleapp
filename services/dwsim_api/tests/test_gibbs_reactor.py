"""Tests for Gibbs free energy minimization reactor."""

import pytest
from app.thermo_engine import ThermoEngine
from app.gibbs_reactor import GibbsReactorOp


def test_gibbs_reactor_steam_methane_reforming():
    """
    Feed CH4 + H2O to Gibbs reactor at 900°C → verify CO + H2 in outlet.

    Steam methane reforming: CH4 + H2O → CO + 3H2
    At high temperature, equilibrium strongly favors products.
    """
    engine = ThermoEngine(
        component_names=["methane", "water", "carbon monoxide", "hydrogen"],
        property_package="Peng-Robinson",
    )

    # Create inlet stream: equimolar CH4 + H2O
    inlet = engine.pt_flash(
        T=500 + 273.15,  # 500°C preheat
        P=2_000_000.0,   # 20 bar
        zs=[0.5, 0.5, 0.0, 0.0],
        molar_flow=100.0,
    )

    reactor = GibbsReactorOp(
        id="gibbs-1",
        name="SMR Reactor",
        params={"temperature_c": 900, "pressure_kpa": 2000},
        engine=engine,
    )

    result = reactor.calculate({"in": inlet})
    outlet = result["out"]

    # At 900°C and 20 bar, we expect significant conversion
    # CO and H2 should be present in outlet
    co_idx = engine.component_names.index("carbon monoxide")
    h2_idx = engine.component_names.index("hydrogen")
    ch4_idx = engine.component_names.index("methane")

    # H2 should be the dominant product
    assert outlet.zs[h2_idx] > 0.1, f"Expected H2 > 10%, got {outlet.zs[h2_idx]*100:.1f}%"
    # CO should be present
    assert outlet.zs[co_idx] > 0.01, f"Expected CO > 1%, got {outlet.zs[co_idx]*100:.1f}%"
    # CH4 should be partially consumed
    assert outlet.zs[ch4_idx] < 0.5, f"Expected CH4 < 50%, got {outlet.zs[ch4_idx]*100:.1f}%"


def test_gibbs_reactor_low_temperature():
    """At low temperature, equilibrium should favor reactants (no conversion)."""
    engine = ThermoEngine(
        component_names=["methane", "water", "carbon monoxide", "hydrogen"],
        property_package="Peng-Robinson",
    )

    inlet = engine.pt_flash(
        T=298.15, P=101325.0,
        zs=[0.5, 0.5, 0.0, 0.0],
        molar_flow=100.0,
    )

    reactor = GibbsReactorOp(
        id="gibbs-2",
        name="Low T Reactor",
        params={"temperature_c": 25, "pressure_kpa": 101.325},
        engine=engine,
    )

    result = reactor.calculate({"in": inlet})
    outlet = result["out"]

    # At 25°C, methane should remain mostly unconverted
    ch4_idx = engine.component_names.index("methane")
    assert outlet.zs[ch4_idx] > 0.3, "CH4 should remain at low temperature"


def test_gibbs_reactor_passthrough_no_formula():
    """If elemental matrix cannot be built, should fall back to PT flash."""
    engine = ThermoEngine(
        component_names=["water"],
        property_package="Peng-Robinson",
    )

    inlet = engine.pt_flash(T=373.15, P=101325.0, zs=[1.0], molar_flow=10.0)

    reactor = GibbsReactorOp(
        id="gibbs-3",
        name="Single Component",
        params={"temperature_c": 200, "pressure_kpa": 101.325},
        engine=engine,
    )

    result = reactor.calculate({"in": inlet})
    outlet = result["out"]

    # Should still produce valid output
    assert outlet.temperature == pytest.approx(473.15, abs=1.0)
    assert outlet.molar_flow == pytest.approx(10.0, rel=0.01)
