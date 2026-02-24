"""
Equipment sizing estimates.

Provides preliminary sizing calculations for pumps, heat exchangers,
and distillation columns based on simulation results.
"""

from __future__ import annotations

import math
from typing import Dict, Optional

from loguru import logger

from .thermo_engine import StreamState


def size_pump(
    inlet: StreamState,
    outlet: StreamState,
    efficiency: float = 0.75,
) -> Dict[str, float]:
    """
    Size a centrifugal pump.

    Returns:
      - head_m: differential head (m)
      - npsh_required_m: estimated NPSH required (m)
      - power_kw: shaft power (kW)
      - hydraulic_power_kw: hydraulic power (kW)
    """
    dp = outlet.pressure - inlet.pressure  # Pa
    rho = inlet.density if inlet.density > 0 else 1000.0  # kg/m³
    g = 9.81  # m/s²

    head = dp / (rho * g)  # m
    vol_flow = inlet.mass_flow / rho if rho > 0 else 0.0  # m³/s
    hydraulic_power = vol_flow * dp  # W
    shaft_power = hydraulic_power / efficiency if efficiency > 0 else hydraulic_power

    # NPSH estimate (simplified): ~3% of head + 1m
    npsh = 0.03 * abs(head) + 1.0

    return {
        "head_m": round(head, 2),
        "npsh_required_m": round(npsh, 2),
        "hydraulic_power_kw": round(hydraulic_power / 1000.0, 4),
        "power_kw": round(shaft_power / 1000.0, 4),
        "volumetric_flow_m3_per_h": round(vol_flow * 3600.0, 4),
    }


def size_heat_exchanger(
    hot_in: StreamState,
    hot_out: StreamState,
    cold_in: StreamState,
    cold_out: StreamState,
    duty_w: float,
    U_assumed: float = 500.0,
) -> Dict[str, float]:
    """
    Size a shell-and-tube heat exchanger.

    Parameters:
      - U_assumed: assumed overall heat transfer coefficient (W/m²·K)

    Returns:
      - area_m2: required heat transfer area
      - U_assumed: assumed U value
      - lmtd_k: log-mean temperature difference
      - duty_kw: heat duty
    """
    # LMTD for counter-current flow
    dT1 = hot_in.temperature - cold_out.temperature
    dT2 = hot_out.temperature - cold_in.temperature

    if dT1 <= 0 or dT2 <= 0:
        return {
            "area_m2": None,
            "U_assumed_w_per_m2k": U_assumed,
            "lmtd_k": None,
            "duty_kw": abs(duty_w) / 1000.0,
            "warning": "Temperature cross detected",
        }

    if abs(dT1 - dT2) < 0.01:
        lmtd = (dT1 + dT2) / 2.0
    else:
        lmtd = (dT1 - dT2) / math.log(dT1 / dT2)

    Q = abs(duty_w)
    area = Q / (U_assumed * lmtd) if lmtd > 0 and U_assumed > 0 else 0.0

    return {
        "area_m2": round(area, 2),
        "U_assumed_w_per_m2k": U_assumed,
        "lmtd_k": round(lmtd, 2),
        "duty_kw": round(Q / 1000.0, 4),
    }


def size_column(
    vapor_flow_mol_per_s: float,
    vapor_mw: float,
    vapor_density: float,
    liquid_density: float,
    n_trays: int,
    tray_spacing_m: float = 0.6,
    tray_efficiency: float = 0.7,
    flooding_factor: float = 0.8,
) -> Dict[str, float]:
    """
    Size a distillation column using Fair's correlation.

    Returns:
      - diameter_m: column diameter
      - height_m: column height (tray stack + disengagement)
      - actual_trays: actual number of trays (accounting for efficiency)
    """
    rho_v = max(vapor_density, 0.1)  # kg/m³
    rho_l = max(liquid_density, 100.0)  # kg/m³

    # Fair's capacity factor
    Csb = 0.04  # m/s, simplified base capacity factor

    # Souders-Brown velocity
    u_flood = Csb * math.sqrt((rho_l - rho_v) / rho_v)
    u_design = u_flood * flooding_factor

    # Vapor volumetric flow
    vapor_mass_flow = vapor_flow_mol_per_s * (vapor_mw / 1000.0)  # kg/s
    vol_flow = vapor_mass_flow / rho_v if rho_v > 0 else 0  # m³/s

    # Column cross-sectional area and diameter
    area = vol_flow / u_design if u_design > 0 else 1.0  # m²
    diameter = math.sqrt(4.0 * area / math.pi)

    # Actual trays
    actual_trays = math.ceil(n_trays / tray_efficiency) if tray_efficiency > 0 else n_trays

    # Height: tray stack + 1.5m top disengagement + 2m bottom sump
    height = actual_trays * tray_spacing_m + 1.5 + 2.0

    return {
        "diameter_m": round(diameter, 2),
        "height_m": round(height, 2),
        "actual_trays": actual_trays,
        "theoretical_trays": n_trays,
        "tray_efficiency": tray_efficiency,
        "flooding_velocity_m_per_s": round(u_flood, 3),
        "design_velocity_m_per_s": round(u_design, 3),
    }
