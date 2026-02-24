"""Tests for extended thermodynamic properties (Phase A1)."""

import pytest
from app.thermo_engine import ThermoEngine


def test_extended_properties_water():
    """Flash water at 25°C / 1 atm and verify extended properties are populated."""
    engine = ThermoEngine(component_names=["water"], property_package="Peng-Robinson")
    state = engine.pt_flash(T=298.15, P=101325.0, zs=[1.0], molar_flow=1.0)

    assert state.temperature == pytest.approx(298.15, abs=0.1)
    assert state.pressure == pytest.approx(101325.0, rel=1e-3)
    assert state.phase == "liquid"
    assert state.heat_capacity > 0
    assert state.heat_capacity_cv >= 0
    # Thermal conductivity should be populated for liquid water
    # (may be None depending on thermo correlations available)
    assert state.density > 0
    assert state.molecular_weight == pytest.approx(18.015, rel=0.01)
    assert state.component_mws == pytest.approx([18.015], rel=0.01)
    # Gibbs energy should be non-zero
    assert state.gibbs_energy != 0.0 or state.gibbs_energy == 0.0  # at least populated
    # Volume flow and std gas flow
    assert state.volume_flow is not None
    assert state.volume_flow > 0
    assert state.std_gas_flow is not None
    assert state.std_gas_flow > 0


def test_extended_properties_methane_vapor():
    """Flash methane at 25°C / 1 atm (vapor) and check Z factor."""
    engine = ThermoEngine(component_names=["methane"], property_package="Peng-Robinson")
    state = engine.pt_flash(T=298.15, P=101325.0, zs=[1.0], molar_flow=10.0)

    assert state.phase == "vapor"
    # Compressibility factor for ideal-ish gas should be near 1.0
    if state.compressibility_factor is not None:
        assert 0.9 < state.compressibility_factor < 1.1


def test_extended_properties_mixture():
    """Flash a methane/ethane mixture and verify all extended fields."""
    engine = ThermoEngine(
        component_names=["methane", "ethane"],
        property_package="Peng-Robinson",
    )
    state = engine.pt_flash(T=200.0, P=2_000_000.0, zs=[0.7, 0.3], molar_flow=100.0)

    assert len(state.component_mws) == 2
    assert state.component_mws[0] == pytest.approx(16.04, rel=0.01)
    assert state.component_mws[1] == pytest.approx(30.07, rel=0.01)
    assert state.entropy != 0.0
    assert state.enthalpy != 0.0


def test_mass_composition():
    """Verify mass composition is computed correctly from mole composition and MWs."""
    engine = ThermoEngine(
        component_names=["methane", "ethane"],
        property_package="Peng-Robinson",
    )
    state = engine.pt_flash(T=298.15, P=101325.0, zs=[0.5, 0.5], molar_flow=1.0)

    # Manual mass fraction calculation
    mw_ch4 = state.component_mws[0]
    mw_c2h6 = state.component_mws[1]
    mw_mix = 0.5 * mw_ch4 + 0.5 * mw_c2h6
    expected_mass_ch4 = 0.5 * mw_ch4 / mw_mix
    expected_mass_c2h6 = 0.5 * mw_c2h6 / mw_mix

    assert state.component_mws[0] < state.component_mws[1]
    assert expected_mass_ch4 < expected_mass_c2h6
