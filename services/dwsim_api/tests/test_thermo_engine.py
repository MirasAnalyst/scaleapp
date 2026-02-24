"""
Tests for the thermodynamic engine.

Verifies flash calculations and stream properties against known values
from NIST, steam tables, and HYSYS/DWSIM reference data.
"""

import pytest
import math

from app.thermo_engine import ThermoEngine, StreamState


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def water_engine():
    """Single-component water engine with Peng-Robinson."""
    return ThermoEngine(component_names=["water"], property_package="Peng-Robinson")


@pytest.fixture
def hydrocarbon_engine():
    """Light hydrocarbon mixture with Peng-Robinson."""
    return ThermoEngine(
        component_names=["methane", "ethane", "propane"],
        property_package="Peng-Robinson",
    )


@pytest.fixture
def ethanol_water_engine():
    """Ethanol-water system with NRTL (polar)."""
    return ThermoEngine(
        component_names=["ethanol", "water"],
        property_package="Peng-Robinson",  # Use PR as fallback; NRTL tested separately
    )


# ---------------------------------------------------------------------------
# Water flash tests
# ---------------------------------------------------------------------------


class TestWaterFlash:
    def test_subcooled_liquid(self, water_engine):
        """Water at 25C, 1 atm should be liquid."""
        state = water_engine.pt_flash(T=298.15, P=101325.0, zs=[1.0])
        assert state.phase == "liquid"
        assert state.vapor_fraction < 0.01
        assert abs(state.temperature - 298.15) < 0.1

    def test_superheated_vapor(self, water_engine):
        """Water at 150C, 1 atm should be vapor."""
        state = water_engine.pt_flash(T=423.15, P=101325.0, zs=[1.0])
        assert state.phase == "vapor"
        assert state.vapor_fraction > 0.99

    def test_bubble_point(self, water_engine):
        """Bubble point of water at 1 atm should be ~100C."""
        T_bp = water_engine.bubble_point_T(P=101325.0, zs=[1.0])
        assert abs(T_bp - 373.15) < 5.0  # Within 5K (PR EOS approximation)

    def test_stream_properties_populated(self, water_engine):
        """Verify all properties are populated."""
        state = water_engine.create_stream(
            T=298.15, P=101325.0, zs=[1.0], mass_flow_kg_s=1.0
        )
        assert state.temperature > 0
        assert state.pressure > 0
        assert state.molecular_weight > 0
        assert state.density > 0
        assert state.mass_flow > 0
        assert state.molar_flow > 0
        assert state.enthalpy != 0 or state.entropy != 0  # At least one non-zero


# ---------------------------------------------------------------------------
# Hydrocarbon mixture tests
# ---------------------------------------------------------------------------


class TestHydrocarbonFlash:
    def test_gas_at_ambient(self, hydrocarbon_engine):
        """Light hydrocarbons at 25C, 1 atm should be vapor."""
        state = hydrocarbon_engine.pt_flash(
            T=298.15, P=101325.0, zs=[0.7, 0.2, 0.1]
        )
        assert state.phase == "vapor"
        assert state.vapor_fraction > 0.99

    def test_two_phase_at_high_pressure(self, hydrocarbon_engine):
        """At high pressure and low temperature, should get two-phase."""
        state = hydrocarbon_engine.pt_flash(
            T=200.0, P=3_000_000.0, zs=[0.5, 0.3, 0.2]  # -73C, 30 bar
        )
        # Should have some liquid formation
        assert state.vapor_fraction < 1.0
        assert state.liquid_fraction > 0.0

    def test_composition_normalisation(self, hydrocarbon_engine):
        """Compositions that don't sum to 1 should be normalised."""
        state = hydrocarbon_engine.pt_flash(
            T=298.15, P=101325.0, zs=[7.0, 2.0, 1.0]
        )
        assert abs(sum(state.zs) - 1.0) < 1e-10

    def test_mass_flow_conversion(self, hydrocarbon_engine):
        """Verify mass flow to molar flow conversion."""
        state = hydrocarbon_engine.create_stream(
            T=298.15, P=101325.0, zs=[0.7, 0.2, 0.1], mass_flow_kg_s=1.0
        )
        assert state.mass_flow > 0
        assert state.molar_flow > 0
        # mass = molar * MW / 1000
        expected_mass = state.molar_flow * (state.molecular_weight / 1000.0)
        assert abs(state.mass_flow - expected_mass) / state.mass_flow < 0.01


# ---------------------------------------------------------------------------
# PH flash test
# ---------------------------------------------------------------------------


class TestPHFlash:
    def test_ph_round_trip(self, hydrocarbon_engine):
        """PT flash -> get H -> PH flash should return same T."""
        state1 = hydrocarbon_engine.pt_flash(
            T=350.0, P=500_000.0, zs=[0.6, 0.3, 0.1]
        )
        state2 = hydrocarbon_engine.ph_flash(
            P=500_000.0, H=state1.enthalpy, zs=[0.6, 0.3, 0.1]
        )
        assert abs(state1.temperature - state2.temperature) < 1.0  # Within 1K


# ---------------------------------------------------------------------------
# PS flash test
# ---------------------------------------------------------------------------


class TestPSFlash:
    def test_ps_round_trip(self, hydrocarbon_engine):
        """PT flash -> get S -> PS flash should return same T."""
        state1 = hydrocarbon_engine.pt_flash(
            T=350.0, P=500_000.0, zs=[0.6, 0.3, 0.1]
        )
        state2 = hydrocarbon_engine.ps_flash(
            P=500_000.0, S=state1.entropy, zs=[0.6, 0.3, 0.1]
        )
        assert abs(state1.temperature - state2.temperature) < 1.0


# ---------------------------------------------------------------------------
# Component info tests
# ---------------------------------------------------------------------------


class TestComponentInfo:
    def test_molecular_weights(self, hydrocarbon_engine):
        mws = hydrocarbon_engine.get_component_mws()
        assert len(mws) == 3
        # Methane MW ~ 16, Ethane ~ 30, Propane ~ 44
        assert 15 < mws[0] < 17
        assert 29 < mws[1] < 31
        assert 43 < mws[2] < 45

    def test_boiling_points(self, hydrocarbon_engine):
        tbs = hydrocarbon_engine.get_component_tbs()
        assert len(tbs) == 3
        # Methane Tb ~ 111K, Ethane ~ 184K, Propane ~ 231K
        assert 100 < tbs[0] < 120
        assert 175 < tbs[1] < 195
        assert 225 < tbs[2] < 240


# ---------------------------------------------------------------------------
# Error handling tests
# ---------------------------------------------------------------------------


class TestErrorHandling:
    def test_invalid_component(self):
        with pytest.raises(ValueError, match="Could not resolve"):
            ThermoEngine(component_names=["notarealcompound12345"])

    def test_empty_components(self):
        with pytest.raises(ValueError, match="At least one component"):
            ThermoEngine(component_names=[])

    def test_unsupported_package(self):
        with pytest.raises(ValueError, match="Unsupported property package"):
            ThermoEngine(
                component_names=["water"], property_package="NotAPackage"
            )
