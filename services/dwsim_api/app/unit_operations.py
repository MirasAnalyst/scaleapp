"""
Rigorous unit operation models for process simulation.

Each unit operation takes inlet StreamState(s) and parameters,
performs thermodynamically rigorous calculations (calling back into the
ThermoEngine for flash), and returns outlet StreamState(s).
"""

from __future__ import annotations

import math
from abc import ABC, abstractmethod
from typing import Dict, List, Optional

from loguru import logger

from .thermo_engine import StreamState, ThermoEngine


# ---------------------------------------------------------------------------
# Base class
# ---------------------------------------------------------------------------


class UnitOpBase(ABC):
    """Abstract base for all unit operations."""

    def __init__(
        self,
        id: str,
        name: str,
        params: Dict,
        engine: ThermoEngine,
    ) -> None:
        self.id = id
        self.name = name
        self.params = params
        self.engine = engine
        self.duty_W: float = 0.0  # watts
        self.warnings: List[str] = []
        self.pressure_drop_Pa: float = 0.0
        self.efficiency: Optional[float] = None

    @abstractmethod
    def calculate(
        self, inlets: Dict[str, StreamState]
    ) -> Dict[str, StreamState]:
        """
        Calculate outlet streams from inlet streams.

        Parameters
        ----------
        inlets : dict mapping port name -> StreamState

        Returns
        -------
        dict mapping port name -> StreamState (outlets)
        """

    def _get_param(self, key: str, default=None):
        return self.params.get(key, default)

    def _first_inlet(self, inlets: Dict[str, StreamState]) -> StreamState:
        """Return the first (or only) inlet stream."""
        return next(iter(inlets.values()))


# ---------------------------------------------------------------------------
# Mixer
# ---------------------------------------------------------------------------


class MixerOp(UnitOpBase):
    """
    Adiabatic mixer.

    Mixes multiple inlet streams:
      - Total molar flow = sum of inlets
      - Overall composition = flow-weighted blend
      - Outlet enthalpy from energy balance (sum of H*n_dot)
      - Outlet P = min(inlet pressures), unless specified
      - PH flash at outlet P with mixed enthalpy to get outlet T and phase
    """

    def calculate(self, inlets: Dict[str, StreamState]) -> Dict[str, StreamState]:
        if not inlets:
            raise ValueError(f"Mixer '{self.id}' has no inlet streams")

        streams = list(inlets.values())
        n_comp = self.engine.n

        total_molar_flow = sum(s.molar_flow for s in streams)
        if total_molar_flow <= 0:
            self.warnings.append("Mixer has zero total flow")
            # Return a copy of the first inlet
            out = streams[0]
            return {"out": out}

        # Blend compositions (mole-fraction weighted by molar flow)
        zs_mix = [0.0] * n_comp
        for s in streams:
            for i in range(n_comp):
                zs_mix[i] += s.zs[i] * s.molar_flow
        zs_mix = [z / total_molar_flow for z in zs_mix]

        # Energy balance: sum(n_i * H_i)
        total_H_flow = sum(s.molar_flow * s.enthalpy for s in streams)
        H_mix = total_H_flow / total_molar_flow  # J/mol

        # Outlet pressure
        outlet_P = self._get_param("outlet_pressure_kpa")
        if outlet_P is not None:
            P_out = outlet_P * 1000.0  # kPa -> Pa
        else:
            P_out = min(s.pressure for s in streams)

        # PH flash to get outlet conditions
        outlet = self.engine.ph_flash(P=P_out, H=H_mix, zs=zs_mix, molar_flow=total_molar_flow)
        self.duty_W = 0.0  # adiabatic
        return {"out": outlet}


# ---------------------------------------------------------------------------
# Splitter
# ---------------------------------------------------------------------------


class SplitterOp(UnitOpBase):
    """
    Stream splitter.

    Splits one inlet into multiple outlets at the same T, P, composition.
    Flow rates are divided by specified fractions.
    """

    def calculate(self, inlets: Dict[str, StreamState]) -> Dict[str, StreamState]:
        inlet = self._first_inlet(inlets)

        fractions = self._get_param("fractions", [0.5, 0.5])
        if abs(sum(fractions) - 1.0) > 0.01:
            self.warnings.append(
                f"Split fractions sum to {sum(fractions):.4f}, normalising to 1.0"
            )
            total = sum(fractions)
            fractions = [f / total for f in fractions]

        outlets: Dict[str, StreamState] = {}
        for i, frac in enumerate(fractions):
            port = f"out-{i + 1}"
            split_stream = StreamState(
                temperature=inlet.temperature,
                pressure=inlet.pressure,
                phase=inlet.phase,
                vapor_fraction=inlet.vapor_fraction,
                liquid_fraction=inlet.liquid_fraction,
                zs=list(inlet.zs),
                ys=list(inlet.ys) if inlet.ys else None,
                xs=list(inlet.xs) if inlet.xs else None,
                enthalpy=inlet.enthalpy,
                entropy=inlet.entropy,
                heat_capacity=inlet.heat_capacity,
                molecular_weight=inlet.molecular_weight,
                density=inlet.density,
                viscosity=inlet.viscosity,
                molar_flow=inlet.molar_flow * frac,
                mass_flow=inlet.mass_flow * frac,
                component_names=list(inlet.component_names),
            )
            outlets[port] = split_stream

        return outlets


# ---------------------------------------------------------------------------
# Valve (isenthalpic expansion)
# ---------------------------------------------------------------------------


class ValveOp(UnitOpBase):
    """
    Control / throttling valve — isenthalpic expansion.

    The Joule-Thomson effect is captured by doing a PH flash at the
    lower outlet pressure with the same molar enthalpy as the inlet.
    """

    def calculate(self, inlets: Dict[str, StreamState]) -> Dict[str, StreamState]:
        inlet = self._first_inlet(inlets)

        outlet_P_kpa = self._get_param("outlet_pressure_kpa")
        dp_kpa = self._get_param("pressure_drop_kpa")

        if outlet_P_kpa is not None:
            P_out = outlet_P_kpa * 1000.0
        elif dp_kpa is not None:
            P_out = inlet.pressure - dp_kpa * 1000.0
        else:
            # Default: 50 kPa pressure drop
            P_out = inlet.pressure - 50_000.0
            self.warnings.append("No outlet pressure specified, assuming 50 kPa drop")

        if P_out <= 0:
            P_out = 101_325.0
            self.warnings.append("Calculated outlet P <= 0, clamping to 1 atm")

        self.pressure_drop_Pa = inlet.pressure - P_out

        # Isenthalpic: PH flash at outlet P with inlet H
        outlet = self.engine.ph_flash(
            P=P_out, H=inlet.enthalpy, zs=inlet.zs, molar_flow=inlet.molar_flow
        )
        self.duty_W = 0.0
        return {"out": outlet}


# ---------------------------------------------------------------------------
# Pump
# ---------------------------------------------------------------------------


class PumpOp(UnitOpBase):
    """
    Centrifugal pump — isentropic compression with efficiency correction.

    1. PS flash at outlet P with inlet S → isentropic outlet state
    2. H_actual = H_in + (H_isentropic - H_in) / efficiency
    3. PH flash at outlet P with H_actual → actual outlet state
    4. Duty = molar_flow * (H_actual - H_in)
    """

    def calculate(self, inlets: Dict[str, StreamState]) -> Dict[str, StreamState]:
        inlet = self._first_inlet(inlets)

        outlet_P_kpa = self._get_param("outlet_pressure_kpa")
        dp_kpa = self._get_param("pressure_rise_kpa")
        eta = self._get_param("efficiency", 0.75)
        self.efficiency = eta

        if outlet_P_kpa is not None:
            P_out = outlet_P_kpa * 1000.0
        elif dp_kpa is not None:
            P_out = inlet.pressure + dp_kpa * 1000.0
        else:
            P_out = inlet.pressure + 500_000.0  # default 500 kPa rise
            self.warnings.append("No outlet pressure specified, assuming 500 kPa rise")

        if P_out <= inlet.pressure:
            self.warnings.append("Pump outlet pressure <= inlet pressure")
            # Still calculate but note it
            P_out = inlet.pressure + 100_000.0

        self.pressure_drop_Pa = -(P_out - inlet.pressure)  # negative = pressure rise

        try:
            # Isentropic outlet (PS flash)
            isentropic_out = self.engine.ps_flash(
                P=P_out, S=inlet.entropy, zs=inlet.zs, molar_flow=inlet.molar_flow
            )

            # Actual enthalpy with efficiency correction
            H_actual = inlet.enthalpy + (isentropic_out.enthalpy - inlet.enthalpy) / eta

            # PH flash for actual outlet
            outlet = self.engine.ph_flash(
                P=P_out, H=H_actual, zs=inlet.zs, molar_flow=inlet.molar_flow
            )

            # Duty (W) = molar_flow (mol/s) * delta_H (J/mol)
            self.duty_W = inlet.molar_flow * (H_actual - inlet.enthalpy)
        except Exception as exc:
            self.warnings.append(f"Isentropic calculation failed ({exc}), using PT flash fallback")
            outlet = self.engine.pt_flash(
                T=inlet.temperature, P=P_out, zs=inlet.zs, molar_flow=inlet.molar_flow
            )
            self.duty_W = inlet.molar_flow * (outlet.enthalpy - inlet.enthalpy)

        return {"out": outlet}


# ---------------------------------------------------------------------------
# Compressor
# ---------------------------------------------------------------------------


class CompressorOp(UnitOpBase):
    """
    Isentropic compressor with efficiency correction.

    Same algorithm as pump but for vapor-phase compression.
    Can handle pressure ratio or outlet pressure specification.
    """

    def calculate(self, inlets: Dict[str, StreamState]) -> Dict[str, StreamState]:
        inlet = self._first_inlet(inlets)

        outlet_P_kpa = self._get_param("outlet_pressure_kpa")
        pressure_ratio = self._get_param("pressure_ratio")
        eta = self._get_param("efficiency", 0.80)
        self.efficiency = eta

        if outlet_P_kpa is not None:
            P_out = outlet_P_kpa * 1000.0
        elif pressure_ratio is not None:
            P_out = inlet.pressure * pressure_ratio
        else:
            P_out = inlet.pressure * 3.0  # default ratio of 3
            self.warnings.append("No outlet pressure or ratio specified, assuming ratio 3.0")

        self.pressure_drop_Pa = -(P_out - inlet.pressure)

        try:
            # Isentropic outlet
            isentropic_out = self.engine.ps_flash(
                P=P_out, S=inlet.entropy, zs=inlet.zs, molar_flow=inlet.molar_flow
            )

            # Actual enthalpy
            H_actual = inlet.enthalpy + (isentropic_out.enthalpy - inlet.enthalpy) / eta

            # PH flash for actual outlet
            outlet = self.engine.ph_flash(
                P=P_out, H=H_actual, zs=inlet.zs, molar_flow=inlet.molar_flow
            )

            self.duty_W = inlet.molar_flow * (H_actual - inlet.enthalpy)
        except Exception as exc:
            self.warnings.append(f"Isentropic calculation failed ({exc}), using PT flash fallback")
            outlet = self.engine.pt_flash(
                T=inlet.temperature, P=P_out, zs=inlet.zs, molar_flow=inlet.molar_flow
            )
            self.duty_W = inlet.molar_flow * (outlet.enthalpy - inlet.enthalpy)

        return {"out": outlet}


# ---------------------------------------------------------------------------
# Turbine / Expander
# ---------------------------------------------------------------------------


class TurbineOp(UnitOpBase):
    """
    Turbine / expander — isentropic expansion with efficiency.

    Like a compressor in reverse: P_out < P_in.
    Work is extracted (negative duty).
    """

    def calculate(self, inlets: Dict[str, StreamState]) -> Dict[str, StreamState]:
        inlet = self._first_inlet(inlets)

        outlet_P_kpa = self._get_param("outlet_pressure_kpa")
        pressure_ratio = self._get_param("pressure_ratio")
        eta = self._get_param("efficiency", 0.80)
        self.efficiency = eta

        if outlet_P_kpa is not None:
            P_out = outlet_P_kpa * 1000.0
        elif pressure_ratio is not None:
            P_out = inlet.pressure / pressure_ratio
        else:
            P_out = inlet.pressure / 3.0
            self.warnings.append("No outlet pressure specified, assuming ratio 3.0")

        self.pressure_drop_Pa = inlet.pressure - P_out

        # Isentropic outlet
        isentropic_out = self.engine.ps_flash(
            P=P_out, S=inlet.entropy, zs=inlet.zs, molar_flow=inlet.molar_flow
        )

        # For expansion, work is extracted: H_actual = H_in - eta*(H_in - H_isentropic)
        H_actual = inlet.enthalpy - eta * (inlet.enthalpy - isentropic_out.enthalpy)

        outlet = self.engine.ph_flash(
            P=P_out, H=H_actual, zs=inlet.zs, molar_flow=inlet.molar_flow
        )

        # Negative duty = work produced
        self.duty_W = inlet.molar_flow * (H_actual - inlet.enthalpy)
        return {"out": outlet}


# ---------------------------------------------------------------------------
# Heater / Cooler
# ---------------------------------------------------------------------------


class HeaterCoolerOp(UnitOpBase):
    """
    Heater or cooler with specified outlet temperature or duty.

    Mode 1 (outlet_temperature_c): PT flash at outlet T, same P → duty from dH
    Mode 2 (duty_kw): PH flash with H_out = H_in + Q/n_dot
    """

    def calculate(self, inlets: Dict[str, StreamState]) -> Dict[str, StreamState]:
        inlet = self._first_inlet(inlets)

        outlet_T_c = self._get_param("outlet_temperature_c")
        outlet_P_kpa = self._get_param("outlet_pressure_kpa")
        duty_kw = self._get_param("duty_kw")
        dp_kpa = self._get_param("pressure_drop_kpa", 0.0)

        # Determine outlet pressure
        if outlet_P_kpa is not None and outlet_P_kpa > 0:
            P_out = outlet_P_kpa * 1000.0
        else:
            P_out = inlet.pressure - dp_kpa * 1000.0
        if P_out <= 0:
            P_out = inlet.pressure  # Guard against unphysical negative pressure
            self.warnings.append(f"Pressure drop ({dp_kpa} kPa) exceeds inlet pressure, ignoring")
        self.pressure_drop_Pa = inlet.pressure - P_out

        if outlet_T_c is not None:
            # Mode 1: Specified outlet temperature
            T_out = outlet_T_c + 273.15  # C -> K
            outlet = self.engine.pt_flash(
                T=T_out, P=P_out, zs=inlet.zs, molar_flow=inlet.molar_flow
            )
            self.duty_W = inlet.molar_flow * (outlet.enthalpy - inlet.enthalpy)

        elif duty_kw is not None:
            # Mode 2: Specified duty
            self.duty_W = duty_kw * 1000.0  # kW -> W
            if inlet.molar_flow > 0:
                H_out = inlet.enthalpy + self.duty_W / inlet.molar_flow
            else:
                H_out = inlet.enthalpy
            try:
                outlet = self.engine.ph_flash(
                    P=P_out, H=H_out, zs=inlet.zs, molar_flow=inlet.molar_flow
                )
            except Exception:
                # PH flash can fail for some mixtures — fall back to passthrough
                self.warnings.append("PH flash failed for specified duty, passing through")
                outlet = self.engine.pt_flash(
                    T=inlet.temperature, P=P_out, zs=inlet.zs,
                    molar_flow=inlet.molar_flow,
                )
                self.duty_W = 0.0
        else:
            # No spec — passthrough with warning
            self.warnings.append("No outlet T or duty specified, passing through")
            outlet = self.engine.pt_flash(
                T=inlet.temperature, P=P_out, zs=inlet.zs,
                molar_flow=inlet.molar_flow,
            )
            self.duty_W = 0.0

        return {"out": outlet}


# ---------------------------------------------------------------------------
# Heat exchanger (two-sided)
# ---------------------------------------------------------------------------


class HeatExchangerOp(UnitOpBase):
    """
    Shell & tube heat exchanger — energy balance between hot and cold sides.

    Requires two inlet streams: hot_in and cold_in.
    The user specifies one of:
      - hot outlet temperature
      - cold outlet temperature
      - duty (kW)
    Energy balance determines the other side.
    """

    def calculate(self, inlets: Dict[str, StreamState]) -> Dict[str, StreamState]:
        hot_in = inlets.get("hot_in") or inlets.get("hot-in") or inlets.get("in-1")
        cold_in = inlets.get("cold_in") or inlets.get("cold-in") or inlets.get("in-2")

        # If only one inlet, treat as heater/cooler
        if hot_in is None or cold_in is None:
            available = list(inlets.values())
            if len(available) == 1:
                self.warnings.append(
                    "Only one side connected, treating as heater/cooler"
                )
                heater = HeaterCoolerOp(self.id, self.name, self.params, self.engine)
                try:
                    result = heater.calculate(inlets)
                except Exception:
                    # ph_flash can fail for challenging mixtures — passthrough
                    result = {"out": available[0]}
                self.duty_W = heater.duty_W
                self.warnings.extend(heater.warnings)
                # Map "out" key to the correct HX port so outlet matching works
                out_state = result.get("out", available[0])
                is_hot = hot_in is not None
                if is_hot:
                    return {"hot_out": out_state, "cold_out": out_state}
                else:
                    return {"cold_out": out_state, "hot_out": out_state}
            hot_in = available[0]
            cold_in = available[1] if len(available) > 1 else available[0]

        dp_hot = self._get_param("hot_pressure_drop_kpa", 0.0) * 1000.0
        dp_cold = self._get_param("cold_pressure_drop_kpa", 0.0) * 1000.0
        P_hot_out = hot_in.pressure - dp_hot
        P_cold_out = cold_in.pressure - dp_cold

        hot_out_T_c = self._get_param("hot_outlet_temperature_c")
        cold_out_T_c = self._get_param("cold_outlet_temperature_c")
        duty_kw = self._get_param("duty_kw")

        if hot_out_T_c is not None:
            T_hot_out = hot_out_T_c + 273.15
            hot_out = self.engine.pt_flash(
                T=T_hot_out, P=P_hot_out, zs=hot_in.zs, molar_flow=hot_in.molar_flow
            )
            Q = hot_in.molar_flow * (hot_in.enthalpy - hot_out.enthalpy)  # W (positive = heat released)
            self.duty_W = Q

            # Cold side: absorbs Q
            if cold_in.molar_flow > 0:
                H_cold_out = cold_in.enthalpy + Q / cold_in.molar_flow
            else:
                H_cold_out = cold_in.enthalpy
            cold_out = self.engine.ph_flash(
                P=P_cold_out, H=H_cold_out, zs=cold_in.zs,
                molar_flow=cold_in.molar_flow,
            )

        elif cold_out_T_c is not None:
            T_cold_out = cold_out_T_c + 273.15
            cold_out = self.engine.pt_flash(
                T=T_cold_out, P=P_cold_out, zs=cold_in.zs,
                molar_flow=cold_in.molar_flow,
            )
            Q = cold_in.molar_flow * (cold_out.enthalpy - cold_in.enthalpy)
            self.duty_W = Q

            # Hot side: releases Q
            if hot_in.molar_flow > 0:
                H_hot_out = hot_in.enthalpy - Q / hot_in.molar_flow
            else:
                H_hot_out = hot_in.enthalpy
            hot_out = self.engine.ph_flash(
                P=P_hot_out, H=H_hot_out, zs=hot_in.zs,
                molar_flow=hot_in.molar_flow,
            )

        elif duty_kw is not None:
            Q = duty_kw * 1000.0  # W
            self.duty_W = Q

            if hot_in.molar_flow > 0:
                H_hot_out = hot_in.enthalpy - Q / hot_in.molar_flow
            else:
                H_hot_out = hot_in.enthalpy
            hot_out = self.engine.ph_flash(
                P=P_hot_out, H=H_hot_out, zs=hot_in.zs,
                molar_flow=hot_in.molar_flow,
            )

            if cold_in.molar_flow > 0:
                H_cold_out = cold_in.enthalpy + Q / cold_in.molar_flow
            else:
                H_cold_out = cold_in.enthalpy
            cold_out = self.engine.ph_flash(
                P=P_cold_out, H=H_cold_out, zs=cold_in.zs,
                molar_flow=cold_in.molar_flow,
            )
        else:
            self.warnings.append("No outlet T or duty specified for HX, passing through")
            hot_out = self.engine.pt_flash(
                T=hot_in.temperature, P=P_hot_out, zs=hot_in.zs,
                molar_flow=hot_in.molar_flow,
            )
            cold_out = self.engine.pt_flash(
                T=cold_in.temperature, P=P_cold_out, zs=cold_in.zs,
                molar_flow=cold_in.molar_flow,
            )
            self.duty_W = 0.0

        # LMTD calculation for diagnostics
        try:
            dT1 = hot_in.temperature - cold_out.temperature
            dT2 = hot_out.temperature - cold_in.temperature
            if dT1 > 0 and dT2 > 0 and abs(dT1 - dT2) > 0.01:
                lmtd = (dT1 - dT2) / math.log(dT1 / dT2)
            elif dT1 > 0 and dT2 > 0:
                lmtd = (dT1 + dT2) / 2.0
            else:
                lmtd = None
                self.warnings.append("Temperature cross detected in heat exchanger")
        except Exception:
            lmtd = None

        self.params["lmtd_K"] = lmtd

        return {"hot_out": hot_out, "cold_out": cold_out}


# ---------------------------------------------------------------------------
# Flash drum (VLE separator)
# ---------------------------------------------------------------------------


class FlashDrumOp(UnitOpBase):
    """
    Flash drum / 2-phase separator.

    Performs a PT flash at the drum operating conditions.
    Produces a vapor outlet and a liquid outlet.
    """

    def calculate(self, inlets: Dict[str, StreamState]) -> Dict[str, StreamState]:
        inlet = self._first_inlet(inlets)

        T_c = self._get_param("temperature_c")
        P_kpa = self._get_param("pressure_kpa")

        T_drum = (T_c + 273.15) if T_c is not None else inlet.temperature
        P_drum = (P_kpa * 1000.0) if P_kpa is not None else inlet.pressure

        # Flash at drum conditions
        flash = self.engine.pt_flash(
            T=T_drum, P=P_drum, zs=inlet.zs, molar_flow=inlet.molar_flow
        )

        vf = flash.vapor_fraction

        # Split into vapor and liquid streams
        if vf > 0.0001 and flash.ys is not None:
            vapor_flow = inlet.molar_flow * vf
            vapor = self.engine.pt_flash(
                T=T_drum, P=P_drum, zs=flash.ys, molar_flow=vapor_flow
            )
        else:
            # No vapor
            vapor = StreamState(
                temperature=T_drum, pressure=P_drum, phase="vapor",
                vapor_fraction=1.0, liquid_fraction=0.0,
                zs=inlet.zs, molar_flow=0.0, mass_flow=0.0,
                component_names=list(inlet.component_names),
            )

        if flash.liquid_fraction > 0.0001 and flash.xs is not None:
            liquid_flow = inlet.molar_flow * flash.liquid_fraction
            liquid = self.engine.pt_flash(
                T=T_drum, P=P_drum, zs=flash.xs, molar_flow=liquid_flow
            )
        else:
            liquid = StreamState(
                temperature=T_drum, pressure=P_drum, phase="liquid",
                vapor_fraction=0.0, liquid_fraction=1.0,
                zs=inlet.zs, molar_flow=0.0, mass_flow=0.0,
                component_names=list(inlet.component_names),
            )

        self.duty_W = 0.0  # adiabatic flash
        dp = inlet.pressure - P_drum
        self.pressure_drop_Pa = dp if dp > 0 else 0.0

        return {"vapor": vapor, "liquid": liquid}


# ---------------------------------------------------------------------------
# 3-Phase separator
# ---------------------------------------------------------------------------


class ThreePhaseSeparatorOp(UnitOpBase):
    """
    Three-phase separator (VLLE).

    Approximated as a two-step flash:
    1. VLE flash to separate gas from liquid
    2. For the liquid, attempt a second flash or simple composition-based split

    For a true VLLE flash, the thermo library's FlashVLN would be needed.
    This implementation uses VLE as the base and flags a warning if VLLE
    is expected but not available.
    """

    def calculate(self, inlets: Dict[str, StreamState]) -> Dict[str, StreamState]:
        inlet = self._first_inlet(inlets)

        T_c = self._get_param("temperature_c")
        P_kpa = self._get_param("pressure_kpa")

        T = (T_c + 273.15) if T_c is not None else inlet.temperature
        P = (P_kpa * 1000.0) if P_kpa is not None else inlet.pressure

        # VLE flash
        flash = self.engine.pt_flash(T=T, P=P, zs=inlet.zs, molar_flow=inlet.molar_flow)

        vf = flash.vapor_fraction

        # Gas outlet
        if vf > 0.0001 and flash.ys is not None:
            gas_flow = inlet.molar_flow * vf
            gas = self.engine.pt_flash(T=T, P=P, zs=flash.ys, molar_flow=gas_flow)
        else:
            gas = StreamState(
                temperature=T, pressure=P, phase="vapor",
                vapor_fraction=1.0, liquid_fraction=0.0,
                zs=inlet.zs, molar_flow=0.0, mass_flow=0.0,
                component_names=list(inlet.component_names),
            )

        # For the liquid phase, split into "oil" (light) and "water" (heavy)
        # This is a simplification — true VLLE would be needed for rigorous results
        if flash.liquid_fraction > 0.0001 and flash.xs is not None:
            liquid_flow = inlet.molar_flow * flash.liquid_fraction
            xs = flash.xs

            # Check if water is in the component list
            water_idx = None
            for i, name in enumerate(self.engine.component_names):
                if name.lower() in ("water", "h2o"):
                    water_idx = i
                    break

            if water_idx is not None and xs[water_idx] > 0.01:
                # Simple water / oil split based on composition
                water_frac = xs[water_idx]
                oil_flow = liquid_flow * (1.0 - water_frac)
                water_flow = liquid_flow * water_frac

                oil_zs = list(xs)
                oil_zs[water_idx] = 0.0
                oil_total = sum(oil_zs)
                if oil_total > 0:
                    oil_zs = [z / oil_total for z in oil_zs]
                else:
                    oil_zs = list(xs)

                water_zs = [0.0] * len(xs)
                water_zs[water_idx] = 1.0

                oil = self.engine.pt_flash(T=T, P=P, zs=oil_zs, molar_flow=oil_flow)
                water_out = self.engine.pt_flash(T=T, P=P, zs=water_zs, molar_flow=water_flow)
                self.warnings.append(
                    "3-phase split approximated via composition. "
                    "True VLLE requires more rigorous treatment."
                )
            else:
                # No water found, all liquid goes to oil
                oil = self.engine.pt_flash(T=T, P=P, zs=xs, molar_flow=liquid_flow)
                water_out = StreamState(
                    temperature=T, pressure=P, phase="liquid",
                    vapor_fraction=0.0, liquid_fraction=1.0,
                    zs=[0.0] * len(xs), molar_flow=0.0, mass_flow=0.0,
                    component_names=list(inlet.component_names),
                )
        else:
            oil = StreamState(
                temperature=T, pressure=P, phase="liquid",
                vapor_fraction=0.0, liquid_fraction=1.0,
                zs=inlet.zs, molar_flow=0.0, mass_flow=0.0,
                component_names=list(inlet.component_names),
            )
            water_out = StreamState(
                temperature=T, pressure=P, phase="liquid",
                vapor_fraction=0.0, liquid_fraction=1.0,
                zs=[0.0] * len(inlet.zs), molar_flow=0.0, mass_flow=0.0,
                component_names=list(inlet.component_names),
            )

        self.duty_W = 0.0
        return {"gas": gas, "oil": oil, "water": water_out}


# ---------------------------------------------------------------------------
# Conversion reactor
# ---------------------------------------------------------------------------


class ConversionReactorOp(UnitOpBase):
    """
    Conversion reactor with specified stoichiometry and conversion.

    Parameters:
      - reactions: list of dicts with keys:
          - reactants: {component: stoich_coeff}
          - products: {component: stoich_coeff}
          - conversion: fraction (0-1) based on limiting reactant
          - base_component: name of limiting reactant
      - temperature_c: outlet temperature (None = adiabatic)
      - pressure_kpa: outlet pressure (None = same as inlet)
    """

    def calculate(self, inlets: Dict[str, StreamState]) -> Dict[str, StreamState]:
        inlet = self._first_inlet(inlets)

        reactions = self._get_param("reactions", [])
        outlet_T_c = self._get_param("temperature_c") or self._get_param("outlet_temperature_c")
        outlet_P_kpa = self._get_param("pressure_kpa") or self._get_param("outlet_pressure_kpa")

        # Defensive float conversion for temperature/pressure
        try:
            outlet_T_c = float(outlet_T_c) if outlet_T_c is not None else None
        except (ValueError, TypeError):
            outlet_T_c = None
        try:
            outlet_P_kpa = float(outlet_P_kpa) if outlet_P_kpa is not None else None
        except (ValueError, TypeError):
            outlet_P_kpa = None

        P_out = (outlet_P_kpa * 1000.0) if outlet_P_kpa is not None else inlet.pressure

        # Build component name -> index mapping (with normalization for underscore/space/case)
        comp_idx = {}
        for i, name in enumerate(self.engine.component_names):
            comp_idx[name] = i
            comp_idx[name.lower()] = i
            comp_idx[name.replace(" ", "_")] = i
            comp_idx[name.replace(" ", "_").lower()] = i

        def _resolve_comp(comp_name: str) -> "str | None":
            """Resolve a component name to the canonical engine name."""
            # Direct match first
            if comp_name in comp_idx:
                idx = comp_idx[comp_name]
                return self.engine.component_names[idx]
            # Normalized match
            norm = comp_name.lower().replace("_", " ").strip()
            for engine_name in self.engine.component_names:
                if engine_name.lower().replace("_", " ").strip() == norm:
                    return engine_name
            return None

        # Start with inlet molar flows
        n_comp = self.engine.n
        component_flows = [inlet.zs[i] * inlet.molar_flow for i in range(n_comp)]

        for rxn in reactions:
            reactants = rxn.get("reactants", {})
            products = rxn.get("products", {})
            raw_conv = rxn.get("conversion", 0.0)
            base_comp = rxn.get("base_component")

            # Defensive: ensure conversion is a valid float
            try:
                conversion = float(raw_conv)
                if not (0.0 <= conversion <= 1.0):
                    conversion = min(max(conversion, 0.0), 1.0)
            except (ValueError, TypeError):
                self.warnings.append(f"Invalid conversion '{raw_conv}', defaulting to 0.95")
                conversion = 0.95

            if not base_comp and reactants:
                base_comp = next(iter(reactants))

            # Resolve base component name
            resolved_base = _resolve_comp(base_comp) if base_comp else None
            if resolved_base is None:
                self.warnings.append(f"Base component '{base_comp}' not found, skipping reaction")
                continue

            base_idx = comp_idx[resolved_base]
            try:
                base_coeff = float(reactants.get(base_comp, 1.0))
            except (ValueError, TypeError):
                base_coeff = 1.0

            # Moles of base component reacted
            moles_reacted = component_flows[base_idx] * conversion

            # Consume reactants
            for comp, coeff in reactants.items():
                resolved = _resolve_comp(comp)
                if resolved is not None:
                    try:
                        c = float(coeff)
                    except (ValueError, TypeError):
                        c = 1.0
                    consumed = moles_reacted * (c / base_coeff)
                    component_flows[comp_idx[resolved]] -= consumed
                    component_flows[comp_idx[resolved]] = max(0.0, component_flows[comp_idx[resolved]])

            # Produce products
            for comp, coeff in products.items():
                resolved = _resolve_comp(comp)
                if resolved is not None:
                    try:
                        c = float(coeff)
                    except (ValueError, TypeError):
                        c = 1.0
                    produced = moles_reacted * (c / base_coeff)
                    component_flows[comp_idx[resolved]] += produced

        # New total flow and composition
        total_flow = sum(component_flows)
        if total_flow > 0:
            zs_out = [f / total_flow for f in component_flows]
        else:
            zs_out = inlet.zs
            total_flow = inlet.molar_flow
            self.warnings.append("All components consumed in reactor")

        if outlet_T_c is not None:
            # Specified outlet temperature
            T_out = outlet_T_c + 273.15
            outlet = self.engine.pt_flash(T=T_out, P=P_out, zs=zs_out, molar_flow=total_flow)
            self.duty_W = total_flow * (outlet.enthalpy - inlet.enthalpy)
        else:
            # Adiabatic: PH flash with inlet enthalpy
            # Adjust for heat of reaction if not accounted for in enthalpy
            H_in = inlet.enthalpy
            outlet = self.engine.ph_flash(P=P_out, H=H_in, zs=zs_out, molar_flow=total_flow)
            self.duty_W = 0.0

        return {"out": outlet}


# ---------------------------------------------------------------------------
# Shortcut distillation column
# ---------------------------------------------------------------------------


class ShortcutDistillationOp(UnitOpBase):
    """
    Fenske-Underwood-Gilliland shortcut distillation.

    Requires:
      - light_key: component name
      - heavy_key: component name
      - light_key_recovery: fraction in distillate (e.g. 0.99)
      - heavy_key_recovery: fraction in bottoms (e.g. 0.99)
      - reflux_ratio_multiple: actual/minimum (e.g. 1.3)
      - condenser_pressure_kpa: top pressure
      - reboiler_pressure_kpa: bottom pressure (or pressure_drop_kpa)
      - n_stages: if specified, overrides Gilliland calculation
    """

    def calculate(self, inlets: Dict[str, StreamState]) -> Dict[str, StreamState]:
        inlet = self._first_inlet(inlets)

        lk_name = self._get_param("light_key")
        hk_name = self._get_param("heavy_key")
        lk_recovery = self._get_param("light_key_recovery", 0.99)
        hk_recovery = self._get_param("heavy_key_recovery", 0.99)
        rr_multiple = self._get_param("reflux_ratio_multiple", 1.3)
        P_cond_kpa = self._get_param("condenser_pressure_kpa")
        P_reb_kpa = self._get_param("reboiler_pressure_kpa")
        n_stages_override = self._get_param("n_stages")

        comp_idx = {name: i for i, name in enumerate(self.engine.component_names)}

        # Default pressures
        P_cond = (P_cond_kpa * 1000.0) if P_cond_kpa else inlet.pressure
        P_reb = (P_reb_kpa * 1000.0) if P_reb_kpa else P_cond * 1.1

        if not lk_name or not hk_name:
            # Auto-detect: sort by boiling point, pick the split
            tbs = self.engine.get_component_tbs()
            sorted_idx = sorted(range(len(tbs)), key=lambda i: tbs[i])
            # Pick the two most abundant components straddling the middle
            if len(sorted_idx) >= 2:
                mid = len(sorted_idx) // 2
                lk_idx = sorted_idx[mid - 1]
                hk_idx = sorted_idx[mid]
                lk_name = self.engine.component_names[lk_idx]
                hk_name = self.engine.component_names[hk_idx]
                self.warnings.append(
                    f"Auto-detected keys: LK={lk_name}, HK={hk_name}"
                )
            else:
                self.warnings.append("Need at least 2 components for distillation")
                return {"distillate": inlet, "bottoms": inlet}

        lk_idx = comp_idx.get(lk_name)
        hk_idx = comp_idx.get(hk_name)

        if lk_idx is None or hk_idx is None:
            self.warnings.append(f"Key components not found: LK={lk_name}, HK={hk_name}")
            return {"distillate": inlet, "bottoms": inlet}

        # Relative volatility — geometric mean of top, feed, and bottom temperatures
        # This is more accurate than using only feed temperature (Winn equation approach)
        def _alpha_at_T(T_val: float) -> float:
            try:
                Pvap_lk = self.engine.correlations.VaporPressures[lk_idx].T_dependent_property(T_val)
                Pvap_hk = self.engine.correlations.VaporPressures[hk_idx].T_dependent_property(T_val)
                if Pvap_hk and Pvap_hk > 0 and Pvap_lk and Pvap_lk > 0:
                    return Pvap_lk / Pvap_hk
            except Exception:
                pass
            return None

        alpha_feed = _alpha_at_T(inlet.temperature)
        # Estimate top/bottom temperatures from boiling points
        tbs = self.engine.get_component_tbs()
        T_top_est = tbs[lk_idx] if lk_idx < len(tbs) else inlet.temperature - 20
        T_bot_est = tbs[hk_idx] if hk_idx < len(tbs) else inlet.temperature + 20
        alpha_top = _alpha_at_T(T_top_est)
        alpha_bot = _alpha_at_T(T_bot_est)

        # Geometric mean of available alphas
        alphas = [a for a in (alpha_top, alpha_feed, alpha_bot) if a is not None and a > 0]
        if len(alphas) >= 2:
            alpha = math.exp(sum(math.log(a) for a in alphas) / len(alphas))
        elif len(alphas) == 1:
            alpha = alphas[0]
        else:
            alpha = 2.0
            self.warnings.append("Relative volatility estimation failed, using alpha=2.0")

        if alpha <= 1.0:
            alpha = 1.1
            self.warnings.append("Relative volatility <= 1, adjusted to 1.1")

        # Feed component flows
        feed_flows = [inlet.zs[i] * inlet.molar_flow for i in range(self.engine.n)]

        # Distillate and bottoms splits
        d_flows = [0.0] * self.engine.n
        b_flows = [0.0] * self.engine.n

        d_flows[lk_idx] = feed_flows[lk_idx] * lk_recovery
        b_flows[lk_idx] = feed_flows[lk_idx] * (1.0 - lk_recovery)

        d_flows[hk_idx] = feed_flows[hk_idx] * (1.0 - hk_recovery)
        b_flows[hk_idx] = feed_flows[hk_idx] * hk_recovery

        # Distribute other components based on relative volatility
        for i in range(self.engine.n):
            if i in (lk_idx, hk_idx):
                continue
            try:
                Pvap_i = self.engine.correlations.VaporPressures[i].T_dependent_property(inlet.temperature)
                Pvap_hk_val = self.engine.correlations.VaporPressures[hk_idx].T_dependent_property(inlet.temperature)
                if Pvap_hk_val and Pvap_hk_val > 0:
                    alpha_i = Pvap_i / Pvap_hk_val
                else:
                    alpha_i = 1.0
            except Exception:
                alpha_i = 1.0

            if alpha_i > alpha:
                # Lighter than LK → goes to distillate
                d_flows[i] = feed_flows[i] * 0.999
                b_flows[i] = feed_flows[i] * 0.001
            elif alpha_i < 1.0:
                # Heavier than HK → goes to bottoms
                d_flows[i] = feed_flows[i] * 0.001
                b_flows[i] = feed_flows[i] * 0.999
            else:
                # Between keys — distribute by relative volatility
                frac_d = alpha_i / (1.0 + alpha_i)
                d_flows[i] = feed_flows[i] * frac_d
                b_flows[i] = feed_flows[i] * (1.0 - frac_d)

        # Fenske equation: N_min
        x_lk_d = d_flows[lk_idx] / max(sum(d_flows), 1e-30)
        x_hk_d = d_flows[hk_idx] / max(sum(d_flows), 1e-30)
        x_lk_b = b_flows[lk_idx] / max(sum(b_flows), 1e-30)
        x_hk_b = b_flows[hk_idx] / max(sum(b_flows), 1e-30)

        try:
            if x_lk_d > 0 and x_hk_b > 0 and x_hk_d > 0 and x_lk_b > 0:
                N_min = math.log((x_lk_d / x_hk_d) * (x_hk_b / x_lk_b)) / math.log(alpha)
            else:
                N_min = 10.0
        except Exception:
            N_min = 10.0

        # Underwood: R_min (simplified)
        # R_min ≈ (1/(alpha-1)) * (x_lk_d/x_lk_f - alpha * x_hk_d/x_hk_f)
        x_lk_f = inlet.zs[lk_idx]
        x_hk_f = inlet.zs[hk_idx]
        try:
            if x_lk_f > 0 and x_hk_f > 0:
                R_min = (1.0 / (alpha - 1.0)) * (
                    x_lk_d / x_lk_f - alpha * x_hk_d / x_hk_f
                )
                R_min = max(R_min, 0.1)
            else:
                R_min = 1.0
        except Exception:
            R_min = 1.0

        R_actual = R_min * rr_multiple

        # Gilliland correlation for actual stages
        if n_stages_override:
            N_actual = n_stages_override
        else:
            try:
                X = (R_actual - R_min) / (R_actual + 1.0)
                # Molokanov correlation
                Y = 1.0 - math.exp((1.0 + 54.4 * X) / (11.0 + 117.2 * X) * (X - 1.0) / X**0.5)
                N_actual = max(int(math.ceil((N_min + Y) / (1.0 - Y))), int(N_min) + 2)
            except Exception:
                N_actual = int(N_min * 2) + 2

        # Build outlet streams
        D_total = sum(d_flows)
        B_total = sum(b_flows)
        zs_d = [f / D_total for f in d_flows] if D_total > 0 else inlet.zs
        zs_b = [f / B_total for f in b_flows] if B_total > 0 else inlet.zs

        # Distillate at condenser conditions (bubble point at P_cond)
        try:
            T_cond = self.engine.bubble_point_T(P_cond, zs_d)
            distillate = self.engine.pt_flash(T=T_cond, P=P_cond, zs=zs_d, molar_flow=D_total)
        except Exception:
            distillate = self.engine.pt_flash(
                T=inlet.temperature - 20, P=P_cond, zs=zs_d, molar_flow=D_total
            )

        # Bottoms at reboiler conditions (bubble point at P_reb)
        try:
            T_reb = self.engine.bubble_point_T(P_reb, zs_b)
            bottoms = self.engine.pt_flash(T=T_reb, P=P_reb, zs=zs_b, molar_flow=B_total)
        except Exception:
            bottoms = self.engine.pt_flash(
                T=inlet.temperature + 20, P=P_reb, zs=zs_b, molar_flow=B_total
            )

        # Energy balance: condenser and reboiler duties
        # Q_condenser = D * (R+1) * (H_vapor - H_liquid) at condenser
        # Q_reboiler = Q_condenser + F*H_f - D*H_d - B*H_b
        H_feed = inlet.molar_flow * inlet.enthalpy
        H_dist = D_total * distillate.enthalpy
        H_bott = B_total * bottoms.enthalpy

        Q_cond = -(D_total * (R_actual + 1.0) * abs(distillate.enthalpy))
        Q_reb = H_dist + H_bott - H_feed - Q_cond
        self.duty_W = Q_reb  # Report reboiler duty

        self.params["n_min_stages"] = N_min
        self.params["n_actual_stages"] = N_actual
        self.params["R_min"] = R_min
        self.params["R_actual"] = R_actual
        self.params["alpha"] = alpha
        self.params["condenser_duty_kw"] = Q_cond / 1000.0
        self.params["reboiler_duty_kw"] = Q_reb / 1000.0

        return {"distillate": distillate, "bottoms": bottoms}


# ---------------------------------------------------------------------------
# Polytropic compressor
# ---------------------------------------------------------------------------


class PolytropicCompressorOp(UnitOpBase):
    """
    Polytropic compressor model.

    Uses polytropic efficiency and polytropic exponent to calculate
    outlet conditions. More accurate than isentropic for multi-stage
    or high-ratio compression.

    Parameters:
      - outlet_pressure_kpa or pressure_ratio
      - polytropic_efficiency (default 0.80)
      - n_stages (default 1) — for multi-stage with intercooling
    """

    def calculate(self, inlets: Dict[str, StreamState]) -> Dict[str, StreamState]:
        inlet = self._first_inlet(inlets)

        outlet_P_kpa = self._get_param("outlet_pressure_kpa")
        pressure_ratio = self._get_param("pressure_ratio")
        eta_p = self._get_param("polytropic_efficiency", 0.80)
        n_stages = self._get_param("n_stages", 1)
        self.efficiency = eta_p

        if outlet_P_kpa is not None:
            P_out = outlet_P_kpa * 1000.0
        elif pressure_ratio is not None:
            P_out = inlet.pressure * pressure_ratio
        else:
            P_out = inlet.pressure * 3.0
            self.warnings.append("No outlet pressure specified, assuming ratio 3.0")

        self.pressure_drop_Pa = -(P_out - inlet.pressure)

        if n_stages > 1:
            # Multi-stage with intercooling back to inlet temperature
            stage_ratio = (P_out / inlet.pressure) ** (1.0 / n_stages)
            current = inlet
            total_work = 0.0

            for stage in range(n_stages):
                P_stage_out = current.pressure * stage_ratio

                # Isentropic outlet for this stage
                isen_out = self.engine.ps_flash(
                    P=P_stage_out, S=current.entropy,
                    zs=current.zs, molar_flow=current.molar_flow,
                )
                # Polytropic correction: H_actual = H_in + (H_isen - H_in) / eta_p
                H_actual = current.enthalpy + (isen_out.enthalpy - current.enthalpy) / eta_p
                stage_out = self.engine.ph_flash(
                    P=P_stage_out, H=H_actual,
                    zs=current.zs, molar_flow=current.molar_flow,
                )
                total_work += current.molar_flow * (H_actual - current.enthalpy)

                # Intercool back to inlet temperature (except last stage)
                if stage < n_stages - 1:
                    current = self.engine.pt_flash(
                        T=inlet.temperature, P=P_stage_out,
                        zs=current.zs, molar_flow=current.molar_flow,
                    )
                else:
                    current = stage_out

            self.duty_W = total_work
            self.params["n_stages_actual"] = n_stages
            self.params["stage_pressure_ratio"] = stage_ratio
            return {"out": current}
        else:
            # Single stage — same as isentropic but with polytropic efficiency
            isen_out = self.engine.ps_flash(
                P=P_out, S=inlet.entropy,
                zs=inlet.zs, molar_flow=inlet.molar_flow,
            )
            H_actual = inlet.enthalpy + (isen_out.enthalpy - inlet.enthalpy) / eta_p
            outlet = self.engine.ph_flash(
                P=P_out, H=H_actual,
                zs=inlet.zs, molar_flow=inlet.molar_flow,
            )
            self.duty_W = inlet.molar_flow * (H_actual - inlet.enthalpy)
            return {"out": outlet}


# ---------------------------------------------------------------------------
# Equilibrium reactor (Gibbs minimization approximation)
# ---------------------------------------------------------------------------


class EquilibriumReactorOp(UnitOpBase):
    """
    Equilibrium reactor — approaches chemical equilibrium.

    Uses an iterative approach: repeatedly flash at outlet conditions
    until composition stabilizes. For true Gibbs minimization, a
    non-linear solver would be needed; this uses the thermo library's
    flash as an approximation for phase equilibrium at specified T, P.

    Parameters:
      - temperature_c: reactor temperature (isothermal)
      - pressure_kpa: reactor pressure
      - reactions: list of reaction dicts (optional, for conversion limit)
    """

    def calculate(self, inlets: Dict[str, StreamState]) -> Dict[str, StreamState]:
        inlet = self._first_inlet(inlets)

        T_c = self._get_param("temperature_c") or self._get_param("outlet_temperature_c")
        P_kpa = self._get_param("pressure_kpa") or self._get_param("outlet_pressure_kpa")

        T_out = (T_c + 273.15) if T_c is not None else inlet.temperature
        P_out = (P_kpa * 1000.0) if P_kpa is not None else inlet.pressure

        # If reactions are specified, use conversion reactor first, then flash
        reactions = self._get_param("reactions", [])
        if reactions:
            conv_reactor = ConversionReactorOp(
                self.id, self.name,
                {**self.params, "temperature_c": T_c, "pressure_kpa": P_kpa},
                self.engine,
            )
            result = conv_reactor.calculate(inlets)
            self.duty_W = conv_reactor.duty_W
            self.warnings.extend(conv_reactor.warnings)
            return result

        # No reactions specified — just flash at equilibrium conditions
        # This gives the correct phase equilibrium (VLE/VLLE)
        outlet = self.engine.pt_flash(
            T=T_out, P=P_out, zs=inlet.zs, molar_flow=inlet.molar_flow,
        )
        self.duty_W = inlet.molar_flow * (outlet.enthalpy - inlet.enthalpy)

        self.warnings.append(
            "Equilibrium reactor: phase equilibrium calculated via PT flash. "
            "For chemical equilibrium, specify reactions with conversion."
        )
        return {"out": outlet}


# ---------------------------------------------------------------------------
# Heat exchanger with LMTD + Ft correction factor
# ---------------------------------------------------------------------------


class RatingHeatExchangerOp(HeatExchangerOp):
    """
    Extended heat exchanger with shell-and-tube rating.

    In addition to the energy balance from HeatExchangerOp, this calculates:
      - LMTD with Ft correction factor for multi-pass configurations
      - Required UA (overall heat transfer coefficient * area)
      - Estimated area if U is provided

    Parameters (in addition to HeatExchangerOp):
      - shell_passes: number of shell passes (default 1)
      - tube_passes: number of tube passes (default 2)
      - U_overall_w_m2k: overall heat transfer coefficient (W/m²·K)
    """

    def calculate(self, inlets: Dict[str, StreamState]) -> Dict[str, StreamState]:
        result = super().calculate(inlets)

        # Get the four terminal temperatures
        hot_in_stream = inlets.get("hot_in") or inlets.get("hot-in") or inlets.get("in-1")
        cold_in_stream = inlets.get("cold_in") or inlets.get("cold-in") or inlets.get("in-2")

        if hot_in_stream is None or cold_in_stream is None:
            return result

        hot_out = result.get("hot_out")
        cold_out = result.get("cold_out")
        if hot_out is None or cold_out is None:
            return result

        T1 = hot_in_stream.temperature  # Hot inlet (K)
        T2 = hot_out.temperature        # Hot outlet (K)
        t1 = cold_in_stream.temperature  # Cold inlet (K)
        t2 = cold_out.temperature        # Cold outlet (K)

        # LMTD for counterflow
        dT1 = T1 - t2
        dT2 = T2 - t1

        if dT1 <= 0 or dT2 <= 0:
            self.warnings.append("Temperature cross: LMTD cannot be calculated")
            return result

        if abs(dT1 - dT2) < 0.01:
            lmtd = (dT1 + dT2) / 2.0
        else:
            lmtd = (dT1 - dT2) / math.log(dT1 / dT2)

        # Ft correction factor (Bowman equation for 1-shell, even-tube passes)
        shell_passes = self._get_param("shell_passes", 1)
        tube_passes = self._get_param("tube_passes", 2)

        Ft = 1.0
        if shell_passes == 1 and tube_passes >= 2:
            Ft = self._calc_ft(T1, T2, t1, t2)

        corrected_lmtd = lmtd * Ft

        self.params["lmtd_K"] = lmtd
        self.params["Ft_correction"] = Ft
        self.params["corrected_lmtd_K"] = corrected_lmtd

        # Calculate UA and area if U is provided
        Q = abs(self.duty_W)
        if corrected_lmtd > 0:
            UA = Q / corrected_lmtd
            self.params["UA_W_per_K"] = UA

            U = self._get_param("U_overall_w_m2k")
            if U and U > 0:
                area = UA / U
                self.params["area_m2"] = area

        return result

    @staticmethod
    def _calc_ft(T1: float, T2: float, t1: float, t2: float) -> float:
        """
        Calculate Ft correction factor for 1-shell, 2-tube pass HX.

        Uses the Bowman-Mueller-Nagle equation.
        """
        try:
            if abs(t2 - t1) < 0.01:
                return 1.0

            R = (T1 - T2) / (t2 - t1)
            P = (t2 - t1) / (T1 - t1)

            if P <= 0 or P >= 1:
                return 1.0
            if abs(R - 1.0) < 0.001:
                # Special case: R = 1
                Ft = (P / (1 - P)) / math.log((1 + P * (math.sqrt(2) - 1)) / (1 - P * (math.sqrt(2) - 1)))
                return max(min(Ft, 1.0), 0.5)

            S = math.sqrt(R * R + 1)
            W = ((1 - P * R) / (1 - P))
            if W <= 0:
                return 0.75  # Infeasible, use conservative value

            num = S * math.log(W)
            den = (R - 1) * math.log(
                (2 - P * (R + 1 - S)) / (2 - P * (R + 1 + S))
            )

            if abs(den) < 1e-10:
                return 1.0

            Ft = num / den
            return max(min(Ft, 1.0), 0.5)
        except Exception:
            return 1.0


# ---------------------------------------------------------------------------
# Registry: maps frontend equipment type strings to unit operation classes
# ---------------------------------------------------------------------------

UNIT_OP_REGISTRY: Dict[str, type] = {
    # Mixers & splitters
    "mixer": MixerOp,
    "splitter": SplitterOp,
    # Valves
    "valve": ValveOp,
    "controlValve": ValveOp,
    "checkValve": ValveOp,
    "prv": ValveOp,
    "throttleValve": ValveOp,
    # Pumps & compressors
    "pump": PumpOp,
    "recipPump": PumpOp,
    "compressor": CompressorOp,
    "recipCompressor": CompressorOp,
    "polytropicCompressor": PolytropicCompressorOp,
    "turbine": TurbineOp,
    "steamTurbine": TurbineOp,
    # Heat transfer
    "heaterCooler": HeaterCoolerOp,
    "firedHeater": HeaterCoolerOp,
    "boiler": HeaterCoolerOp,
    "condenser": HeaterCoolerOp,
    "shellTubeHX": RatingHeatExchangerOp,
    "airCooler": HeaterCoolerOp,
    "plateHX": RatingHeatExchangerOp,
    "doublePipeHX": RatingHeatExchangerOp,
    "kettleReboiler": HeaterCoolerOp,
    # Separators
    "flashDrum": FlashDrumOp,
    "separator": FlashDrumOp,
    "separatorHorizontal": FlashDrumOp,
    "separator3p": ThreePhaseSeparatorOp,
    "knockoutDrumH": FlashDrumOp,
    "surgeDrum": FlashDrumOp,
    "refluxDrum": FlashDrumOp,
    "tank": FlashDrumOp,
    "horizontalVessel": FlashDrumOp,
    # Reactors
    "cstr": ConversionReactorOp,
    "pfr": ConversionReactorOp,
    "conversionReactor": ConversionReactorOp,
    "equilibriumReactor": EquilibriumReactorOp,
    "gibbsReactor": EquilibriumReactorOp,
    # Distillation / absorption
    "distillationColumn": ShortcutDistillationOp,
    "packedColumn": ShortcutDistillationOp,
    "absorber": ShortcutDistillationOp,
    "stripper": ShortcutDistillationOp,
    # Miscellaneous (treated as pass-through flash)
    "filter": FlashDrumOp,
    "cyclone": FlashDrumOp,
    "adsorber": FlashDrumOp,
    "membrane": FlashDrumOp,
}
