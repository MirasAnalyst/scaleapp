"""
Tests for IAPWS Steam Tables property package (Phase 5).
"""

import pytest

from app.thermo_engine import ThermoEngine


class TestSteamTables:
    def test_saturation_100c_1atm(self):
        """Water at 100°C / 1 atm should be at saturation."""
        engine = ThermoEngine(
            component_names=["water"],
            property_package="Steam-Tables",
        )
        state = engine.pt_flash(T=373.15, P=101325.0, zs=[1.0], molar_flow=1.0)

        assert state.temperature == pytest.approx(373.15, abs=0.1)
        assert state.pressure == pytest.approx(101325.0, abs=1.0)
        # H of steam at 100°C ≈ 2675 kJ/kg → 2675*18.015/1000 ≈ 48.2 kJ/mol
        H_kj_mol = state.enthalpy / 1000.0
        assert 40.0 < H_kj_mol < 55.0

    def test_subcooled_25c(self):
        """Water at 25°C / 1 atm should be subcooled liquid."""
        engine = ThermoEngine(
            component_names=["water"],
            property_package="Steam-Tables",
        )
        state = engine.pt_flash(T=298.15, P=101325.0, zs=[1.0], molar_flow=1.0)

        assert state.phase == "liquid"
        assert state.vapor_fraction == 0.0
        # Density of water at 25°C ≈ 997 kg/m³
        assert 990 < state.density < 1005

    def test_superheated_200c(self):
        """Water at 200°C / 1 atm should be superheated vapor."""
        engine = ThermoEngine(
            component_names=["water"],
            property_package="Steam-Tables",
        )
        state = engine.pt_flash(T=473.15, P=101325.0, zs=[1.0], molar_flow=1.0)

        assert state.phase == "vapor"
        assert state.vapor_fraction == 1.0
        # Speed of sound in steam at 200°C ≈ 534 m/s
        assert state.speed_of_sound is not None
        assert 500 < state.speed_of_sound < 600

    def test_pump_cycle_steam_tables(self):
        """Pump water using Steam-Tables: ps_flash and ph_flash should work."""
        engine = ThermoEngine(
            component_names=["water"],
            property_package="iapws",
        )

        # Start at 25°C, 1 atm
        state1 = engine.pt_flash(T=298.15, P=101325.0, zs=[1.0], molar_flow=1.0)
        assert state1.phase == "liquid"

        # PS flash at higher pressure (pump)
        state2 = engine.ps_flash(P=1000000.0, S=state1.entropy, zs=[1.0], molar_flow=1.0)
        assert state2.pressure == pytest.approx(1000000.0, abs=100)
        # Temperature should barely change for liquid water compression
        assert abs(state2.temperature - state1.temperature) < 5.0

        # PH flash at same pressure with some added enthalpy (heater)
        H_heated = state2.enthalpy + 5000.0  # ~5 kJ/mol added
        state3 = engine.ph_flash(P=1000000.0, H=H_heated, zs=[1.0], molar_flow=1.0)
        assert state3.temperature > state2.temperature

    def test_bubble_point(self):
        """Bubble point via steam tables should match saturation temperature."""
        engine = ThermoEngine(
            component_names=["water"],
            property_package="Steam-Tables",
        )
        T_bub = engine.bubble_point_T(101325.0, [1.0])
        # Saturation temperature at 1 atm ≈ 373.12 K
        assert T_bub == pytest.approx(373.12, abs=0.5)

    def test_dew_point(self):
        """Dew point via steam tables should match saturation temperature."""
        engine = ThermoEngine(
            component_names=["water"],
            property_package="Steam-Tables",
        )
        T_dew = engine.dew_point_T(101325.0, [1.0])
        assert T_dew == pytest.approx(373.12, abs=0.5)

    def test_steam_tables_alias(self):
        """Various aliases should all create Steam-Tables engine."""
        for alias in ["Steam-Tables", "steam tables", "iapws", "iapws-if97", "iapws95"]:
            engine = ThermoEngine(
                component_names=["water"],
                property_package=alias,
            )
            assert engine._is_steam_tables is True

    def test_steam_tables_requires_pure_water(self):
        """Steam-Tables should reject multi-component or non-water systems."""
        with pytest.raises(ValueError, match="exactly 1 component"):
            ThermoEngine(
                component_names=["water", "methane"],
                property_package="Steam-Tables",
            )

        with pytest.raises(ValueError, match="requires water"):
            ThermoEngine(
                component_names=["methane"],
                property_package="Steam-Tables",
            )
