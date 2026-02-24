"""
Kinetic reactor with Arrhenius kinetics.

Supports CSTR (continuous stirred-tank reactor) and PFR (plug flow reactor) modes.
Rate expression: r_j = A_j * exp(-Ea_j / RT) * Π(C_i^n_i)
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional

import numpy as np
from loguru import logger
from scipy.integrate import solve_ivp
from scipy.optimize import fsolve

from .thermo_engine import StreamState, ThermoEngine
from .unit_operations import UnitOpBase

R_GAS = 8.314  # J/(mol·K)


class KineticReactorOp(UnitOpBase):
    """
    Kinetic reactor with Arrhenius rate expressions.

    Supports CSTR and PFR operating modes.

    Parameters:
      - reactor_type: "CSTR" or "PFR" (default "CSTR")
      - volume_m3: reactor volume in m³
      - temperature_c: reactor temperature (°C), None for adiabatic
      - pressure_kpa: reactor pressure (kPa)
      - reactions: list of reaction dicts, each with:
          - A: pre-exponential factor (1/s or appropriate units)
          - Ea: activation energy (J/mol)
          - stoichiometry: {component_name: stoich_coeff} (negative for reactants)
          - orders: {component_name: reaction_order}
    """

    def calculate(self, inlets: Dict[str, StreamState]) -> Dict[str, StreamState]:
        inlet = self._first_inlet(inlets)

        reactor_type = self._get_param("reactor_type", "CSTR").upper()
        volume = self._get_param("volume_m3", 1.0)
        T_c = self._get_param("temperature_c") or self._get_param("outlet_temperature_c")
        P_kpa = self._get_param("pressure_kpa") or self._get_param("outlet_pressure_kpa")
        reactions = self._get_param("reactions", [])

        try:
            volume = float(volume)
        except (ValueError, TypeError):
            volume = 1.0
        try:
            T_c = float(T_c) if T_c is not None else None
        except (ValueError, TypeError):
            T_c = None
        try:
            P_kpa = float(P_kpa) if P_kpa is not None else None
        except (ValueError, TypeError):
            P_kpa = None

        T = (T_c + 273.15) if T_c is not None else inlet.temperature
        P = (P_kpa * 1000.0) if P_kpa is not None else inlet.pressure

        n_comp = self.engine.n
        comp_names = self.engine.component_names

        # Build component name -> index mapping
        comp_idx = {}
        for i, name in enumerate(comp_names):
            comp_idx[name] = i
            comp_idx[name.lower()] = i
            comp_idx[name.replace(" ", "_")] = i
            comp_idx[name.replace(" ", "_").lower()] = i

        def _resolve(name: str) -> Optional[int]:
            if name in comp_idx:
                return comp_idx[name]
            norm = name.lower().replace("_", " ").strip()
            for eng_name in comp_names:
                if eng_name.lower().replace("_", " ").strip() == norm:
                    return comp_idx[eng_name]
            return None

        if not reactions:
            self.warnings.append("No reactions specified, passing through")
            outlet = self.engine.pt_flash(T=T, P=P, zs=inlet.zs, molar_flow=inlet.molar_flow)
            self.duty_W = inlet.molar_flow * (outlet.enthalpy - inlet.enthalpy)
            return {"out": outlet}

        # Parse reactions into structured form
        parsed_rxns = []
        for rxn in reactions:
            A_val = float(rxn.get("A", 1e6))
            Ea = float(rxn.get("Ea", 50000.0))
            stoich = rxn.get("stoichiometry", {})
            orders = rxn.get("orders", {})

            # Convert to index-based
            nu = [0.0] * n_comp
            order_vec = [0.0] * n_comp
            valid = True

            for comp_name, coeff in stoich.items():
                idx = _resolve(comp_name)
                if idx is None:
                    self.warnings.append(f"Component '{comp_name}' not found, skipping reaction")
                    valid = False
                    break
                nu[idx] = float(coeff)

            if not valid:
                continue

            for comp_name, order in orders.items():
                idx = _resolve(comp_name)
                if idx is not None:
                    order_vec[idx] = float(order)

            # If no orders specified, use absolute stoich coefficients for reactants
            if not orders:
                for i in range(n_comp):
                    if nu[i] < 0:
                        order_vec[i] = abs(nu[i])

            parsed_rxns.append({"A": A_val, "Ea": Ea, "nu": nu, "orders": order_vec})

        if not parsed_rxns:
            self.warnings.append("No valid reactions, passing through")
            outlet = self.engine.pt_flash(T=T, P=P, zs=inlet.zs, molar_flow=inlet.molar_flow)
            return {"out": outlet}

        # Inlet molar flows (mol/s) and concentrations (mol/m³)
        F_in = np.array([inlet.zs[i] * inlet.molar_flow for i in range(n_comp)])

        # Estimate molar volume for concentration calculation
        if inlet.density > 0 and inlet.molecular_weight > 0:
            V_molar = (inlet.molecular_weight / 1000.0) / inlet.density  # m³/mol
        else:
            V_molar = R_GAS * T / P  # Ideal gas approximation

        total_molar_conc = 1.0 / V_molar if V_molar > 0 else P / (R_GAS * T)

        def rate_vector(C):
            """Calculate net production rate for each component (mol/(m³·s))."""
            r_net = np.zeros(n_comp)
            for rxn in parsed_rxns:
                k = rxn["A"] * math.exp(-rxn["Ea"] / (R_GAS * T))
                rate = k
                for i in range(n_comp):
                    if rxn["orders"][i] > 0 and C[i] > 0:
                        rate *= C[i] ** rxn["orders"][i]
                    elif rxn["orders"][i] > 0:
                        rate = 0.0
                        break
                for i in range(n_comp):
                    r_net[i] += rxn["nu"][i] * rate
            return r_net

        if reactor_type == "CSTR":
            F_out = self._solve_cstr(F_in, volume, total_molar_conc, rate_vector, n_comp)
        elif reactor_type == "PFR":
            F_out = self._solve_pfr(F_in, volume, total_molar_conc, rate_vector, n_comp)
        else:
            self.warnings.append(f"Unknown reactor type '{reactor_type}', using CSTR")
            F_out = self._solve_cstr(F_in, volume, total_molar_conc, rate_vector, n_comp)

        # Ensure non-negative
        F_out = np.maximum(F_out, 0.0)
        total_out = float(np.sum(F_out))

        if total_out > 0:
            zs_out = [float(F_out[i] / total_out) for i in range(n_comp)]
        else:
            zs_out = list(inlet.zs)
            total_out = inlet.molar_flow
            self.warnings.append("All components consumed in reactor")

        # Flash at outlet conditions
        if T_c is not None:
            outlet = self.engine.pt_flash(T=T, P=P, zs=zs_out, molar_flow=total_out)
            self.duty_W = total_out * outlet.enthalpy - inlet.molar_flow * inlet.enthalpy
        else:
            # Adiabatic
            outlet = self.engine.ph_flash(
                P=P, H=inlet.enthalpy, zs=zs_out, molar_flow=total_out
            )
            self.duty_W = 0.0

        return {"out": outlet}

    def _solve_cstr(self, F_in, V, C_total, rate_fn, n_comp):
        """Solve CSTR: F_out = F_in + V * r(C_out)."""
        volumetric_flow = float(np.sum(F_in)) / C_total if C_total > 0 else 1.0

        def residual(F_out):
            C_out = F_out / volumetric_flow if volumetric_flow > 0 else F_out * C_total / max(np.sum(F_out), 1e-30)
            r = rate_fn(C_out)
            return F_out - F_in - V * r

        try:
            F_out, info, ier, msg = fsolve(residual, F_in.copy(), full_output=True)
            if ier != 1:
                self.warnings.append(f"CSTR solver: {msg}")
        except Exception as exc:
            self.warnings.append(f"CSTR solver failed: {exc}")
            F_out = F_in.copy()

        return F_out

    def _solve_pfr(self, F_in, V, C_total, rate_fn, n_comp):
        """Solve PFR: dF_i/dV = Σ(ν_ij × r_j) via ODE integration."""
        volumetric_flow = float(np.sum(F_in)) / C_total if C_total > 0 else 1.0

        def ode_rhs(V_pos, F):
            F = np.maximum(F, 0.0)
            F_total = np.sum(F)
            if F_total <= 0:
                return np.zeros(n_comp)
            C = F / volumetric_flow if volumetric_flow > 0 else F * C_total / F_total
            return rate_fn(C)

        try:
            sol = solve_ivp(
                ode_rhs,
                [0.0, V],
                F_in.copy(),
                method='RK45',
                rtol=1e-8,
                atol=1e-10,
                max_step=V / 10.0,
            )
            if sol.success:
                F_out = sol.y[:, -1]
            else:
                self.warnings.append(f"PFR integration: {sol.message}")
                F_out = sol.y[:, -1] if sol.y.shape[1] > 0 else F_in.copy()
        except Exception as exc:
            self.warnings.append(f"PFR integration failed: {exc}")
            F_out = F_in.copy()

        return F_out
