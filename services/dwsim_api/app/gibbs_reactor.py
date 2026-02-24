"""
Gibbs free energy minimization reactor.

Finds the equilibrium composition by minimizing the total Gibbs energy
subject to elemental balance constraints. This is the rigorous approach
used by Aspen HYSYS and DWSIM for equilibrium reactors.
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional

import numpy as np
from loguru import logger
from scipy.optimize import minimize

from .thermo_engine import StreamState, ThermoEngine
from .unit_operations import UnitOpBase

# Standard reference pressure (Pa)
P_REF = 101325.0
R_GAS = 8.314  # J/(mol·K)


class GibbsReactorOp(UnitOpBase):
    """
    Gibbs free energy minimization reactor.

    Finds chemical equilibrium by minimizing Σ(nᵢ × μᵢ) subject to
    elemental balance constraints using SLSQP.

    Parameters:
      - temperature_c: reactor temperature (°C)
      - pressure_kpa: reactor pressure (kPa)
    """

    def calculate(self, inlets: Dict[str, StreamState]) -> Dict[str, StreamState]:
        inlet = self._first_inlet(inlets)

        T_c = self._get_param("temperature_c") or self._get_param("outlet_temperature_c")
        P_kpa = self._get_param("pressure_kpa") or self._get_param("outlet_pressure_kpa")

        # Defensive float conversion
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
        component_names = self.engine.component_names

        # Inlet molar flows
        F_in = [inlet.zs[i] * inlet.molar_flow for i in range(n_comp)]
        total_flow = sum(F_in)
        if total_flow <= 0:
            self.warnings.append("Zero inlet flow to Gibbs reactor")
            return {"out": inlet}

        # Build elemental balance matrix
        try:
            A, elements = self._build_elemental_matrix(component_names)
        except Exception as exc:
            self.warnings.append(f"Failed to build elemental matrix: {exc}")
            # Fall back to PT flash (phase equilibrium only)
            outlet = self.engine.pt_flash(T=T, P=P, zs=inlet.zs, molar_flow=inlet.molar_flow)
            self.duty_W = inlet.molar_flow * (outlet.enthalpy - inlet.enthalpy)
            return {"out": outlet}

        # Elemental balance RHS: b = A @ F_in
        b = A @ np.array(F_in)

        # Get thermodynamic data for Gibbs energy calculation
        try:
            Hf = list(self.engine.constants.Hfgs)  # Standard enthalpy of formation (J/mol)
            S0 = list(self.engine.constants.S0gs)  # Standard entropy (J/(mol·K))
        except Exception as exc:
            self.warnings.append(f"Missing Hf/S0 data: {exc}, using PT flash fallback")
            outlet = self.engine.pt_flash(T=T, P=P, zs=inlet.zs, molar_flow=inlet.molar_flow)
            self.duty_W = inlet.molar_flow * (outlet.enthalpy - inlet.enthalpy)
            return {"out": outlet}

        # Replace None values with 0
        Hf = [h if h is not None else 0.0 for h in Hf]
        S0 = [s if s is not None else 0.0 for s in S0]

        # Chemical potential at T, P: μᵢ = Hfᵢ - T*S0ᵢ + RT*ln(xᵢ*P/P0)
        # Objective: minimize Σ(nᵢ × μᵢ)
        def objective(n):
            n_total = sum(n)
            if n_total <= 0:
                return 1e30
            G_total = 0.0
            for i in range(n_comp):
                if n[i] <= 1e-30:
                    continue
                xi = n[i] / n_total
                # Chemical potential
                mu_i = Hf[i] - T * S0[i] + R_GAS * T * math.log(max(xi * P / P_REF, 1e-30))
                G_total += n[i] * mu_i
            return G_total

        def objective_grad(n):
            n_total = sum(n)
            if n_total <= 0:
                return np.zeros(n_comp)
            grad = np.zeros(n_comp)
            for i in range(n_comp):
                xi = n[i] / n_total if n[i] > 1e-30 else 1e-30
                mu_i = Hf[i] - T * S0[i] + R_GAS * T * math.log(max(xi * P / P_REF, 1e-30))
                grad[i] = mu_i
            return grad

        # Constraints: A @ n = b (elemental balance)
        constraints = {
            'type': 'eq',
            'fun': lambda n: A @ n - b,
            'jac': lambda n: A,
        }

        # Bounds: n_i >= 0
        bounds = [(1e-20, None) for _ in range(n_comp)]

        # Initial guess: inlet flows
        n0 = np.array(F_in, dtype=float)
        n0 = np.maximum(n0, 1e-15)

        try:
            result = minimize(
                objective,
                n0,
                method='SLSQP',
                jac=objective_grad,
                bounds=bounds,
                constraints=constraints,
                options={'maxiter': 200, 'ftol': 1e-12},
            )

            if not result.success:
                self.warnings.append(f"Gibbs minimization: {result.message}")

            n_eq = result.x
            n_eq = np.maximum(n_eq, 0.0)
        except Exception as exc:
            self.warnings.append(f"Gibbs optimization failed: {exc}")
            n_eq = np.array(F_in)

        # Build outlet stream
        total_out = sum(n_eq)
        if total_out > 0:
            zs_out = [float(n_eq[i] / total_out) for i in range(n_comp)]
        else:
            zs_out = list(inlet.zs)
            total_out = total_flow

        # PT flash at outlet conditions with equilibrium composition
        outlet = self.engine.pt_flash(T=T, P=P, zs=zs_out, molar_flow=total_out)

        # Energy balance: duty = outlet enthalpy flow - inlet enthalpy flow
        self.duty_W = total_out * outlet.enthalpy - inlet.molar_flow * inlet.enthalpy

        return {"out": outlet}

    def _build_elemental_matrix(
        self, component_names: List[str]
    ) -> "tuple[np.ndarray, List[str]]":
        """
        Build the elemental balance matrix A where A[j,i] = number of atoms
        of element j in component i.
        """
        from chemicals.elements import simple_formula_parser

        # Get molecular formulas
        formulas = []
        for i, name in enumerate(component_names):
            try:
                formula = self.engine.constants.formulas[i]
                formulas.append(simple_formula_parser(formula))
            except Exception:
                # Try CAS lookup
                try:
                    cas = self.engine.cas_numbers[i]
                    from chemicals import identifiers
                    formula_str = identifiers.formula_from_CAS(cas)
                    formulas.append(simple_formula_parser(formula_str))
                except Exception:
                    formulas.append({})
                    self.warnings.append(f"No formula for '{name}', excluding from balance")

        # Collect all elements
        all_elements = set()
        for f in formulas:
            all_elements.update(f.keys())
        elements = sorted(all_elements)

        # Build matrix
        n_elem = len(elements)
        n_comp = len(component_names)
        A = np.zeros((n_elem, n_comp))

        for j, elem in enumerate(elements):
            for i, formula in enumerate(formulas):
                A[j, i] = formula.get(elem, 0)

        return A, elements
