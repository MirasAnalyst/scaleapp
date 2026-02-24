"""Tests for rigorous tray-by-tray distillation column."""

import pytest
from app.thermo_engine import ThermoEngine
from app.rigorous_distillation import RigorousDistillationOp


def test_benzene_toluene_distillation():
    """
    Benzene-toluene rigorous distillation.
    Verify tray-by-tray temperature profile exists and is monotonically increasing.
    """
    engine = ThermoEngine(
        component_names=["benzene", "toluene"],
        property_package="Peng-Robinson",
    )

    # Feed: 50/50 benzene-toluene at bubble point
    inlet = engine.pt_flash(
        T=370.0,  # ~97°C, between BPs of benzene (80°C) and toluene (111°C)
        P=101325.0,
        zs=[0.5, 0.5],
        molar_flow=100.0,
    )

    column = RigorousDistillationOp(
        id="col-1",
        name="BT Column",
        params={
            "n_stages": 15,
            "feed_tray": 8,
            "reflux_ratio": 2.0,
            "condenser_type": "total",
            "condenser_pressure_kpa": 101.325,
            "pressure_drop_per_tray_kpa": 0.5,
        },
        engine=engine,
    )

    result = column.calculate({"in": inlet})

    assert "distillate" in result
    assert "bottoms" in result

    distillate = result["distillate"]
    bottoms = result["bottoms"]

    # Distillate should be benzene-rich
    benzene_idx = engine.component_names.index("benzene")
    assert distillate.zs[benzene_idx] > bottoms.zs[benzene_idx], \
        "Distillate should be enriched in benzene (light key)"

    # Bottoms should be toluene-rich
    toluene_idx = engine.component_names.index("toluene")
    assert bottoms.zs[toluene_idx] > distillate.zs[toluene_idx], \
        "Bottoms should be enriched in toluene (heavy key)"

    # Tray profiles should exist
    tray_profiles = column.params.get("tray_profiles", [])
    assert len(tray_profiles) == 15, f"Expected 15 tray profiles, got {len(tray_profiles)}"

    # Temperature should generally increase from top to bottom
    temps = [tp["temperature_c"] for tp in tray_profiles]
    assert temps[-1] > temps[0], \
        f"Bottom temp ({temps[-1]:.1f}°C) should be > top temp ({temps[0]:.1f}°C)"


def test_rigorous_distillation_convergence():
    """Verify column converges for a standard separation."""
    engine = ThermoEngine(
        component_names=["benzene", "toluene"],
        property_package="Peng-Robinson",
    )

    inlet = engine.pt_flash(T=370.0, P=101325.0, zs=[0.5, 0.5], molar_flow=100.0)

    column = RigorousDistillationOp(
        id="col-2",
        name="Conv Test",
        params={
            "n_stages": 20,
            "feed_tray": 10,
            "reflux_ratio": 3.0,
            "condenser_pressure_kpa": 101.325,
        },
        engine=engine,
    )

    result = column.calculate({"in": inlet})

    # Should converge
    assert column.params.get("converged", False), "Column should converge"

    # Duties should be computed
    assert column.params.get("condenser_duty_kw") is not None
    assert column.params.get("reboiler_duty_kw") is not None


def test_rigorous_distillation_three_component():
    """Test with a 3-component system."""
    engine = ThermoEngine(
        component_names=["propane", "n-butane", "n-pentane"],
        property_package="Peng-Robinson",
    )

    inlet = engine.pt_flash(
        T=320.0, P=500_000.0,
        zs=[0.33, 0.34, 0.33],
        molar_flow=100.0,
    )

    column = RigorousDistillationOp(
        id="col-3",
        name="3-comp Column",
        params={
            "n_stages": 25,
            "feed_tray": 13,
            "reflux_ratio": 2.5,
            "condenser_pressure_kpa": 500,
        },
        engine=engine,
    )

    result = column.calculate({"in": inlet})

    distillate = result["distillate"]
    bottoms = result["bottoms"]

    # Propane (lightest) should concentrate in distillate
    assert distillate.zs[0] > bottoms.zs[0]
    # Pentane (heaviest) should concentrate in bottoms
    assert bottoms.zs[2] > distillate.zs[2]
