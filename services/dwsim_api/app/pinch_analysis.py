"""
Pinch analysis / heat integration.

Implements the Problem Table Algorithm to find the pinch temperature
and minimum utility requirements.  Generates composite curve and grand
composite curve data for plotting.
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

from loguru import logger

from . import schemas
from .thermo_client import ThermoClient


def run_pinch_analysis(
    request: schemas.PinchAnalysisRequest,
) -> schemas.PinchAnalysisResult:
    """
    Run pinch analysis on a solved flowsheet.

    1. Solve the flowsheet to get stream temperatures and duties
    2. Extract hot and cold process streams from heat exchangers / heaters / coolers
    3. Apply the Problem Table Algorithm
    4. Generate composite curves
    """
    warnings: List[str] = []
    client = ThermoClient()

    # First, solve the flowsheet
    try:
        sim_result = client.simulate_flowsheet(request.flowsheet)
    except Exception as exc:
        return schemas.PinchAnalysisResult(
            warnings=[f"Flowsheet solve failed: {exc}"]
        )

    if sim_result.status == "error":
        return schemas.PinchAnalysisResult(
            warnings=sim_result.warnings
        )

    dt_min = request.dt_min

    # Extract hot and cold streams from the simulation
    # Hot stream: needs cooling (T_in > T_out)
    # Cold stream: needs heating (T_in < T_out)
    hot_streams: List[Dict] = []
    cold_streams: List[Dict] = []

    stream_map = {s.id: s for s in sim_result.streams}

    for unit in sim_result.units:
        duty = unit.duty_kw
        if duty is None or abs(duty) < 0.01:
            continue

        # Get inlet and outlet temperatures
        inlets = unit.inlet_streams or []
        outlets = unit.outlet_streams or []

        for inlet_id in inlets:
            inlet_s = stream_map.get(inlet_id)
            if inlet_s is None or inlet_s.temperature_c is None:
                continue

            for outlet_id in outlets:
                outlet_s = stream_map.get(outlet_id)
                if outlet_s is None or outlet_s.temperature_c is None:
                    continue

                T_in = inlet_s.temperature_c
                T_out = outlet_s.temperature_c
                cp_flow = abs(duty) / abs(T_in - T_out) if abs(T_in - T_out) > 0.01 else 0

                if T_in > T_out and duty < 0:
                    # Hot stream (releases heat)
                    hot_streams.append({
                        "T_supply": T_in,
                        "T_target": T_out,
                        "CP": cp_flow,  # kW/°C
                        "duty_kw": abs(duty),
                        "unit": unit.id,
                    })
                elif T_in < T_out and duty > 0:
                    # Cold stream (absorbs heat)
                    cold_streams.append({
                        "T_supply": T_in,
                        "T_target": T_out,
                        "CP": cp_flow,
                        "duty_kw": abs(duty),
                        "unit": unit.id,
                    })
                break  # Only pair first inlet with first outlet
            break

    if not hot_streams and not cold_streams:
        return schemas.PinchAnalysisResult(
            warnings=["No hot or cold process streams found for pinch analysis"]
        )

    # Problem Table Algorithm
    # Shift hot stream temperatures down by dt_min/2, cold up by dt_min/2
    shifted_temps = set()
    for s in hot_streams:
        shifted_temps.add(s["T_supply"] - dt_min / 2)
        shifted_temps.add(s["T_target"] - dt_min / 2)
    for s in cold_streams:
        shifted_temps.add(s["T_supply"] + dt_min / 2)
        shifted_temps.add(s["T_target"] + dt_min / 2)

    intervals = sorted(shifted_temps, reverse=True)

    if len(intervals) < 2:
        return schemas.PinchAnalysisResult(
            warnings=["Not enough temperature intervals for pinch analysis"]
        )

    # Calculate heat surplus/deficit in each interval
    interval_heats = []
    for k in range(len(intervals) - 1):
        T_high = intervals[k]
        T_low = intervals[k + 1]
        dT = T_high - T_low

        sum_cp_hot = 0.0
        sum_cp_cold = 0.0

        for s in hot_streams:
            T_s_shifted = s["T_supply"] - dt_min / 2
            T_t_shifted = s["T_target"] - dt_min / 2
            if T_s_shifted >= T_high and T_t_shifted <= T_low:
                sum_cp_hot += s["CP"]

        for s in cold_streams:
            T_s_shifted = s["T_supply"] + dt_min / 2
            T_t_shifted = s["T_target"] + dt_min / 2
            if T_s_shifted <= T_low and T_t_shifted >= T_high:
                sum_cp_cold += s["CP"]

        heat = (sum_cp_hot - sum_cp_cold) * dT
        interval_heats.append({
            "T_high": T_high,
            "T_low": T_low,
            "heat_kw": heat,
        })

    # Cascade: find minimum hot utility
    cascade = [0.0]
    for ih in interval_heats:
        cascade.append(cascade[-1] + ih["heat_kw"])

    min_cascade = min(cascade)
    hot_utility = -min_cascade if min_cascade < 0 else 0.0

    # Adjusted cascade
    adjusted = [c + hot_utility for c in cascade]
    cold_utility = adjusted[-1]

    # Find pinch: where adjusted cascade = 0
    pinch_temp = None
    for k in range(len(adjusted)):
        if abs(adjusted[k]) < 0.01:
            if k < len(intervals):
                pinch_temp = intervals[k]
            break

    # Generate composite curves
    hot_composite = _build_composite(hot_streams, is_hot=True)
    cold_composite = _build_composite(cold_streams, is_hot=False)

    # Grand composite curve
    grand_composite = []
    for k in range(len(intervals)):
        grand_composite.append({
            "temperature_c": intervals[k],
            "heat_kw": adjusted[k],
        })

    return schemas.PinchAnalysisResult(
        pinch_temperature_c=round(pinch_temp + dt_min / 2, 2) if pinch_temp is not None else None,
        min_hot_utility_kw=round(hot_utility, 4),
        min_cold_utility_kw=round(cold_utility, 4),
        hot_composite=hot_composite,
        cold_composite=cold_composite,
        grand_composite=grand_composite,
        warnings=warnings,
    )


def _build_composite(
    streams: List[Dict], is_hot: bool
) -> List[Dict[str, float]]:
    """Build a composite curve (temperature vs cumulative enthalpy)."""
    if not streams:
        return []

    # Collect all temperature breakpoints
    temps = set()
    for s in streams:
        temps.add(s["T_supply"])
        temps.add(s["T_target"])

    sorted_temps = sorted(temps, reverse=is_hot)

    # Build cumulative enthalpy
    points = []
    H_cum = 0.0
    points.append({"temperature_c": sorted_temps[0], "enthalpy_kw": 0.0})

    for k in range(len(sorted_temps) - 1):
        T1 = sorted_temps[k]
        T2 = sorted_temps[k + 1]
        dT = abs(T2 - T1)

        sum_cp = 0.0
        for s in streams:
            T_max = max(s["T_supply"], s["T_target"])
            T_min = min(s["T_supply"], s["T_target"])
            if T_min <= min(T1, T2) and T_max >= max(T1, T2):
                sum_cp += s["CP"]

        H_cum += sum_cp * dT
        points.append({
            "temperature_c": round(T2, 2),
            "enthalpy_kw": round(H_cum, 4),
        })

    return points
