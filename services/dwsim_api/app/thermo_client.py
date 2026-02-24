"""
Pure-Python thermodynamic calculation client.

Replaces the DWSIMClient (which required .NET/pythonnet) with calculations
powered by Caleb Bell's ``thermo`` library.  Produces the same results as
Aspen HYSYS and DWSIM for Peng-Robinson, SRK, NRTL, UNIFAC, and UNIQUAC
property packages.
"""

from __future__ import annotations

from typing import Dict, List

from loguru import logger

from . import schemas
from .flowsheet_solver import FlowsheetSolver
from .thermo_engine import StreamState, ThermoEngine


class ThermoClient:
    """Drop-in replacement for DWSIMClient using the thermo library."""

    # ------------------------------------------------------------------
    # Flowsheet simulation
    # ------------------------------------------------------------------

    def simulate_flowsheet(
        self, payload: schemas.FlowsheetPayload
    ) -> schemas.SimulationResult:
        """
        Run a full flowsheet simulation.

        1. Create a ThermoEngine from the payload's thermo config
        2. Build the flowsheet graph
        3. Solve iteratively
        4. Convert results to the API response schema
        """
        warnings: List[str] = []

        # Validate inputs
        components = payload.thermo.components
        if not components:
            return schemas.SimulationResult(
                flowsheet_name=payload.name,
                status="error",
                streams=[],
                units=[],
                warnings=["No components specified in thermo config"],
            )

        pkg = payload.thermo.package or "Peng-Robinson"

        try:
            engine = ThermoEngine(
                component_names=components,
                property_package=pkg,
            )
        except Exception as exc:
            return schemas.SimulationResult(
                flowsheet_name=payload.name,
                status="error",
                streams=[],
                units=[],
                warnings=[f"Failed to initialise thermo engine: {exc}"],
            )

        # Build and solve
        solver = FlowsheetSolver(engine)
        try:
            solver.build_from_payload(payload)
        except Exception as exc:
            return schemas.SimulationResult(
                flowsheet_name=payload.name,
                status="error",
                streams=[],
                units=[],
                warnings=[f"Failed to build flowsheet: {exc}"],
            )

        try:
            result = solver.solve(max_iterations=100, tolerance=1e-6)
        except Exception as exc:
            logger.exception("Solver failed")
            return schemas.SimulationResult(
                flowsheet_name=payload.name,
                status="error",
                streams=[],
                units=[],
                warnings=[f"Solver failed: {exc}"],
            )

        # Convert results
        stream_results = self._convert_streams(result.streams, components)
        unit_results = self._convert_units(result.unit_results)

        status = "converged" if result.converged else "not-converged"

        return schemas.SimulationResult(
            flowsheet_name=payload.name,
            status=status,
            streams=stream_results,
            units=unit_results,
            warnings=result.warnings + warnings,
            converged=result.converged,
            iterations=result.iterations,
            mass_balance_error=result.mass_balance_error,
            energy_balance_error=result.energy_balance_error,
            property_package=pkg,
            components=components,
            diagnostics={
                "solver": "sequential-modular",
                "engine": "thermo",
                "property_package": pkg,
            },
        )

    # ------------------------------------------------------------------
    # Single-stream property calculation
    # ------------------------------------------------------------------

    def calculate_properties(
        self, request: schemas.PropertyRequest
    ) -> schemas.PropertyResult:
        """Calculate thermodynamic properties for a single stream."""
        components = request.thermo.components
        if not components:
            return schemas.PropertyResult(
                properties={}, warnings=["No components specified"]
            )

        pkg = request.thermo.package or "Peng-Robinson"
        warnings: List[str] = []

        try:
            engine = ThermoEngine(component_names=components, property_package=pkg)
        except Exception as exc:
            return schemas.PropertyResult(
                properties={}, warnings=[f"Engine init failed: {exc}"]
            )

        props = request.stream.properties
        T_c = props.get("temperature") or props.get("temperature_c", 25.0)
        P_kpa = props.get("pressure") or props.get("pressure_kpa", 101.325)
        composition = props.get("composition", {})
        flow_kg_h = props.get("flow_rate") or props.get("mass_flow_kg_per_h", 1000.0)

        T_K = float(T_c) + 273.15
        P_Pa = float(P_kpa) * 1000.0
        mass_flow = float(flow_kg_h) / 3600.0

        zs = []
        for name in components:
            frac = composition.get(name, 0.0)
            if frac == 0.0:
                for k, v in composition.items():
                    if k.lower() == name.lower():
                        frac = v
                        break
            zs.append(float(frac))

        total = sum(zs)
        if total <= 0:
            zs = [1.0 / len(components)] * len(components)
            warnings.append("Zero composition provided, using equal fractions")
        else:
            zs = [z / total for z in zs]

        try:
            state = engine.create_stream(
                T=T_K, P=P_Pa, zs=zs, mass_flow_kg_s=mass_flow
            )
        except Exception as exc:
            return schemas.PropertyResult(
                properties={}, warnings=[f"Flash calculation failed: {exc}"]
            )

        result_props = self._state_to_property_dict(state, components)
        return schemas.PropertyResult(properties=result_props, warnings=warnings)

    # ------------------------------------------------------------------
    # Flash calculation
    # ------------------------------------------------------------------

    def flash_calculation(
        self, request: schemas.FlashRequest
    ) -> schemas.FlashResult:
        """Perform a single flash calculation."""
        components = request.thermo.components
        if not components:
            return schemas.FlashResult(
                stream=schemas.StreamResult(id="flash"),
                warnings=["No components specified"],
            )

        pkg = request.thermo.package or "Peng-Robinson"
        warnings: List[str] = []

        try:
            engine = ThermoEngine(component_names=components, property_package=pkg)
        except Exception as exc:
            return schemas.FlashResult(
                stream=schemas.StreamResult(id="flash"),
                warnings=[f"Engine init failed: {exc}"],
            )

        # Build composition vector
        zs = []
        for name in components:
            frac = request.composition.get(name, 0.0)
            if frac == 0.0:
                for k, v in request.composition.items():
                    if k.lower() == name.lower():
                        frac = v
                        break
            zs.append(float(frac))

        total = sum(zs)
        if total > 0:
            zs = [z / total for z in zs]
        else:
            return schemas.FlashResult(
                stream=schemas.StreamResult(id="flash"),
                warnings=["All composition fractions are zero"],
            )

        mass_flow = float(request.mass_flow_kg_per_h or 1000.0) / 3600.0

        # Determine flash type
        flash_type = request.flash_type.upper()
        try:
            if flash_type == "PT":
                T_K = float(request.temperature_c or 25.0) + 273.15
                P_Pa = float(request.pressure_kpa or 101.325) * 1000.0
                state = engine.create_stream(T=T_K, P=P_Pa, zs=zs, mass_flow_kg_s=mass_flow)

            elif flash_type == "PH":
                P_Pa = float(request.pressure_kpa or 101.325) * 1000.0
                H = float(request.enthalpy_kj_per_kg or 0.0) * 1000.0  # kJ/kg -> J/kg
                # Convert to J/mol using MW
                mw_mix = sum(z * mw for z, mw in zip(zs, engine.constants.MWs))
                H_mol = H * (mw_mix / 1000.0)  # J/mol
                molar_flow = mass_flow / (mw_mix / 1000.0)
                state = engine.ph_flash(P=P_Pa, H=H_mol, zs=zs, molar_flow=molar_flow)

            elif flash_type == "PS":
                P_Pa = float(request.pressure_kpa or 101.325) * 1000.0
                S = float(request.entropy_kj_per_kg_k or 0.0) * 1000.0
                mw_mix = sum(z * mw for z, mw in zip(zs, engine.constants.MWs))
                S_mol = S * (mw_mix / 1000.0)
                molar_flow = mass_flow / (mw_mix / 1000.0)
                state = engine.ps_flash(P=P_Pa, S=S_mol, zs=zs, molar_flow=molar_flow)

            elif flash_type == "TVF":
                T_K = float(request.temperature_c or 25.0) + 273.15
                VF = float(request.vapor_fraction or 0.0)
                mw_mix = sum(z * mw for z, mw in zip(zs, engine.constants.MWs))
                molar_flow = mass_flow / (mw_mix / 1000.0)
                state = engine.tvf_flash(T=T_K, VF=VF, zs=zs, molar_flow=molar_flow)

            elif flash_type == "PVF":
                P_Pa = float(request.pressure_kpa or 101.325) * 1000.0
                VF = float(request.vapor_fraction or 0.0)
                mw_mix = sum(z * mw for z, mw in zip(zs, engine.constants.MWs))
                molar_flow = mass_flow / (mw_mix / 1000.0)
                state = engine.pvf_flash(P=P_Pa, VF=VF, zs=zs, molar_flow=molar_flow)

            else:
                return schemas.FlashResult(
                    stream=schemas.StreamResult(id="flash"),
                    warnings=[f"Unknown flash type: {flash_type}"],
                )

        except Exception as exc:
            return schemas.FlashResult(
                stream=schemas.StreamResult(id="flash"),
                warnings=[f"Flash calculation failed: {exc}"],
            )

        stream_result = self._state_to_stream_result("flash", state, components)
        return schemas.FlashResult(stream=stream_result, warnings=warnings)

    # ------------------------------------------------------------------
    # Conversion helpers
    # ------------------------------------------------------------------

    def _convert_streams(
        self, streams: Dict[str, StreamState], components: List[str]
    ) -> List[schemas.StreamResult]:
        results = []
        for sid, state in streams.items():
            results.append(self._state_to_stream_result(sid, state, components))
        return results

    @staticmethod
    def _state_to_stream_result(
        sid: str, state: StreamState, components: List[str]
    ) -> schemas.StreamResult:
        T_c = state.temperature - 273.15
        P_kpa = state.pressure / 1000.0
        mass_flow_kg_h = state.mass_flow * 3600.0
        molar_flow_kmol_h = state.molar_flow * 3.6  # mol/s -> kmol/h

        # Composition dict
        comp_dict = {}
        for i, name in enumerate(components):
            if i < len(state.zs):
                comp_dict[name] = round(state.zs[i], 6)

        # Liquid composition
        liq_comp = None
        if state.xs:
            liq_comp = {}
            for i, name in enumerate(components):
                if i < len(state.xs):
                    liq_comp[name] = round(state.xs[i], 6)

        # Vapor composition
        vap_comp = None
        if state.ys:
            vap_comp = {}
            for i, name in enumerate(components):
                if i < len(state.ys):
                    vap_comp[name] = round(state.ys[i], 6)

        # Convert properties to engineering units
        mw = state.molecular_weight  # g/mol
        enthalpy_kj_kg = None
        entropy_kj_kg_k = None
        cp_kj_kg_k = None
        if mw and mw > 0:
            enthalpy_kj_kg = (state.enthalpy / (mw / 1000.0)) / 1000.0  # J/mol -> kJ/kg
            entropy_kj_kg_k = (state.entropy / (mw / 1000.0)) / 1000.0
            if state.heat_capacity:
                cp_kj_kg_k = (state.heat_capacity / (mw / 1000.0)) / 1000.0

        viscosity_cp = None
        if state.viscosity is not None:
            viscosity_cp = state.viscosity * 1000.0  # Pa·s -> cP

        # Extended properties
        cv_kj_kg_k = None
        if state.heat_capacity_cv and mw and mw > 0:
            cv_kj_kg_k = (state.heat_capacity_cv / (mw / 1000.0)) / 1000.0

        gibbs_kj_kg = None
        if state.gibbs_energy and mw and mw > 0:
            gibbs_kj_kg = (state.gibbs_energy / (mw / 1000.0)) / 1000.0

        jt_k_per_kpa = None
        if state.joule_thomson is not None:
            jt_k_per_kpa = state.joule_thomson * 1000.0  # K/Pa -> K/kPa

        # Mass composition
        mass_comp = None
        if state.component_mws and state.zs and mw and mw > 0:
            mass_comp = {}
            for i, name in enumerate(components):
                if i < len(state.zs) and i < len(state.component_mws):
                    mass_frac = state.zs[i] * state.component_mws[i] / mw
                    mass_comp[name] = round(mass_frac, 6)

        return schemas.StreamResult(
            id=sid,
            temperature_c=round(T_c, 4),
            pressure_kpa=round(P_kpa, 4),
            mass_flow_kg_per_h=round(mass_flow_kg_h, 4),
            mole_flow_kmol_per_h=round(molar_flow_kmol_h, 6),
            vapor_fraction=round(state.vapor_fraction, 6),
            liquid_fraction=round(state.liquid_fraction, 6),
            composition=comp_dict,
            mass_composition=mass_comp,
            enthalpy_kj_per_kg=round(enthalpy_kj_kg, 4) if enthalpy_kj_kg else None,
            entropy_kj_per_kg_k=round(entropy_kj_kg_k, 6) if entropy_kj_kg_k else None,
            density_kg_per_m3=round(state.density, 4) if state.density else None,
            viscosity_cp=round(viscosity_cp, 6) if viscosity_cp else None,
            molecular_weight=round(mw, 4) if mw else None,
            heat_capacity_kj_per_kg_k=round(cp_kj_kg_k, 6) if cp_kj_kg_k else None,
            thermal_conductivity_w_per_mk=round(state.thermal_conductivity, 6) if state.thermal_conductivity else None,
            heat_capacity_cv_kj_per_kg_k=round(cv_kj_kg_k, 6) if cv_kj_kg_k else None,
            compressibility_factor=round(state.compressibility_factor, 6) if state.compressibility_factor is not None else None,
            speed_of_sound_m_per_s=round(state.speed_of_sound, 2) if state.speed_of_sound and isinstance(state.speed_of_sound, (int, float)) else None,
            surface_tension_n_per_m=round(state.surface_tension, 6) if state.surface_tension else None,
            joule_thomson_k_per_kpa=round(jt_k_per_kpa, 6) if jt_k_per_kpa is not None else None,
            isentropic_exponent=round(state.isentropic_exponent, 6) if state.isentropic_exponent is not None else None,
            gibbs_energy_kj_per_kg=round(gibbs_kj_kg, 4) if gibbs_kj_kg else None,
            volume_flow_m3_per_h=round(state.volume_flow, 4) if state.volume_flow else None,
            std_gas_flow_sm3_per_h=round(state.std_gas_flow, 4) if state.std_gas_flow else None,
            phase=state.phase,
            liquid_composition=liq_comp,
            vapor_composition=vap_comp,
        )

    @staticmethod
    def _state_to_property_dict(
        state: StreamState, components: List[str]
    ) -> Dict:
        mw = state.molecular_weight or 1.0
        return {
            "temperature_c": round(state.temperature - 273.15, 4),
            "pressure_kpa": round(state.pressure / 1000.0, 4),
            "phase": state.phase,
            "vapor_fraction": round(state.vapor_fraction, 6),
            "liquid_fraction": round(state.liquid_fraction, 6),
            "enthalpy_kj_per_kg": round((state.enthalpy / (mw / 1000.0)) / 1000.0, 4),
            "entropy_kj_per_kg_k": round((state.entropy / (mw / 1000.0)) / 1000.0, 6),
            "density_kg_per_m3": round(state.density, 4) if state.density else None,
            "viscosity_cp": round(state.viscosity * 1000, 6) if state.viscosity else None,
            "molecular_weight": round(mw, 4),
            "heat_capacity_kj_per_kg_k": round(
                (state.heat_capacity / (mw / 1000.0)) / 1000.0, 6
            ) if state.heat_capacity else None,
            "mass_flow_kg_per_h": round(state.mass_flow * 3600.0, 4),
            "mole_flow_kmol_per_h": round(state.molar_flow * 3.6, 6),
            "composition": {
                name: round(state.zs[i], 6)
                for i, name in enumerate(components)
                if i < len(state.zs)
            },
        }

    @staticmethod
    def _convert_units(
        units: Dict[str, UnitOpBase],
    ) -> List[schemas.UnitResult]:
        results = []
        for uid, unit in units.items():
            duty_kw = unit.duty_W / 1000.0 if unit.duty_W else None
            dp_kpa = unit.pressure_drop_Pa / 1000.0 if unit.pressure_drop_Pa else None

            results.append(
                schemas.UnitResult(
                    id=uid,
                    duty_kw=round(duty_kw, 4) if duty_kw is not None else None,
                    status="calculated",
                    efficiency=round(unit.efficiency, 4) if unit.efficiency else None,
                    pressure_drop_kpa=round(dp_kpa, 4) if dp_kpa is not None else None,
                    extra={
                        k: v
                        for k, v in unit.params.items()
                        if isinstance(v, (int, float, str, bool))
                    },
                )
            )
        return results
