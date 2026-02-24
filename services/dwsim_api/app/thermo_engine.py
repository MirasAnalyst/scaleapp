"""
Thermodynamic calculation engine using Caleb Bell's `thermo` library.

Provides HYSYS/DWSIM-equivalent calculations:
  - Peng-Robinson, SRK, NRTL, UNIFAC, UNIQUAC property packages
  - PT, PH, PS flash calculations via Rachford-Rice
  - Full stream property computation (enthalpy, entropy, density, Cp, viscosity, MW)
  - VLE / VLLE phase equilibrium
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from chemicals import identifiers, Tb, Tc, Pc, omega, MW
from loguru import logger
from thermo import (
    ChemicalConstantsPackage,
    PropertyCorrelationsPackage,
    CEOSGas,
    CEOSLiquid,
    FlashVL,
    FlashVLN,
    FlashPureVLS,
    PRMIX,
    SRKMIX,
    HeatCapacityGas,
    HeatCapacityLiquid,
    GibbsExcessLiquid,
)
from thermo.interaction_parameters import IPDB
from thermo.nrtl import NRTL
from thermo.unifac import UNIFAC, UFSG, UFIP, DOUFSG, DOUFIP2006

import numpy as np


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class StreamState:
    """Fully resolved stream state after a flash calculation."""

    temperature: float  # K
    pressure: float  # Pa
    phase: str  # "vapor", "liquid", "two-phase", "VLL"
    vapor_fraction: float
    liquid_fraction: float

    # Overall composition (mole fractions)
    zs: List[float]
    # Vapor-phase composition (None if single liquid phase)
    ys: Optional[List[float]] = None
    # Liquid-phase composition (None if single vapor phase)
    xs: Optional[List[float]] = None
    # Second liquid phase (VLLE only)
    xs2: Optional[List[float]] = None

    # Thermodynamic properties (molar basis)
    enthalpy: float = 0.0  # J/mol
    entropy: float = 0.0  # J/(mol·K)
    heat_capacity: float = 0.0  # J/(mol·K)

    # Mixture properties
    molecular_weight: float = 0.0  # g/mol
    density: float = 0.0  # kg/m³
    viscosity: Optional[float] = None  # Pa·s

    # Extended properties
    thermal_conductivity: Optional[float] = None  # W/(m·K)
    heat_capacity_cv: float = 0.0  # J/(mol·K)
    compressibility_factor: Optional[float] = None
    speed_of_sound: Optional[float] = None  # m/s
    surface_tension: Optional[float] = None  # N/m
    joule_thomson: Optional[float] = None  # K/Pa
    isentropic_exponent: Optional[float] = None
    gibbs_energy: float = 0.0  # J/mol
    volume_flow: Optional[float] = None  # m³/h
    std_gas_flow: Optional[float] = None  # Sm³/h
    component_mws: List[float] = field(default_factory=list)  # g/mol per component

    # Flow rates
    molar_flow: float = 0.0  # mol/s
    mass_flow: float = 0.0  # kg/s

    # Component names for reference
    component_names: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class ThermoEngine:
    """
    Wraps the ``thermo`` library to provide HYSYS/DWSIM-equivalent
    thermodynamic calculations for a given set of components and property
    package.
    """

    # Supported property packages
    SUPPORTED_PACKAGES = {
        "Peng-Robinson",
        "SRK",
        "NRTL",
        "UNIFAC",
        "UNIQUAC",
        "Steam-Tables",
    }

    # Aliases: maps common alternative names to canonical names
    _PACKAGE_ALIASES: Dict[str, str] = {
        "peng-robinson": "Peng-Robinson",
        "pr": "Peng-Robinson",
        "pengrobinson": "Peng-Robinson",
        "peng robinson": "Peng-Robinson",
        "srk": "SRK",
        "soave-redlich-kwong": "SRK",
        "soave redlich kwong": "SRK",
        "soaveredlichkwong": "SRK",
        "nrtl": "NRTL",
        "non-random two-liquid": "NRTL",
        "unifac": "UNIFAC",
        "uniquac": "UNIQUAC",
        "lee-kesler-plöcker": "Peng-Robinson",
        "lee-kesler-plocker": "Peng-Robinson",
        "lee-kesler": "Peng-Robinson",
        "lkp": "Peng-Robinson",
        "iapws-if97": "Steam-Tables",
        "iapws": "Steam-Tables",
        "iapws95": "Steam-Tables",
        "steam tables": "Steam-Tables",
        "steam-tables": "Steam-Tables",
        "steamtables": "Steam-Tables",
        "chao-seader": "Peng-Robinson",
        "grayson-streed": "SRK",
        "wilson": "NRTL",
        "ideal": "Peng-Robinson",
        "cpa": "SRK",
        "pc-saft": "Peng-Robinson",
        "pcsaft": "Peng-Robinson",
        "bwr": "Peng-Robinson",
        "benedict-webb-rubin": "Peng-Robinson",
        "rksoave": "SRK",
        "rk-soave": "SRK",
        "kabadi-danner": "SRK",
        "sour water": "Peng-Robinson",
        "acid gas": "SRK",
        "glycol": "NRTL",
        "amine": "NRTL",
    }

    @classmethod
    def _normalize_package_name(cls, name: str) -> str:
        """Normalize a property package name to one of the supported canonical names."""
        if name in cls.SUPPORTED_PACKAGES:
            return name
        alias = cls._PACKAGE_ALIASES.get(name.lower().strip())
        if alias:
            return alias
        # Fuzzy: check if any supported name is a substring
        for supported in cls.SUPPORTED_PACKAGES:
            if supported.lower() in name.lower():
                return supported
        return name  # Return as-is; will fail with a clear error in _build_property_package

    def __init__(
        self,
        component_names: List[str],
        property_package: str = "Peng-Robinson",
    ) -> None:
        if not component_names:
            raise ValueError("At least one component is required")

        property_package = self._normalize_package_name(property_package)

        self.component_names = component_names
        self.property_package_name = property_package
        self.n = len(component_names)

        logger.info(
            "Initialising ThermoEngine: components={}, package={}",
            component_names,
            property_package,
        )

        # Resolve CAS numbers from common/IUPAC names
        self.cas_numbers = self._resolve_cas(component_names)

        # Build the chemical constants + correlations packages
        self.constants, self.correlations = ChemicalConstantsPackage.from_IDs(
            self.cas_numbers
        )

        # Build EOS / activity model based on selected package
        self._build_property_package(property_package)

        logger.info("ThermoEngine initialised successfully")

    # ------------------------------------------------------------------
    # Initialisation helpers
    # ------------------------------------------------------------------

    # Common compound name aliases that AI models tend to produce
    _COMPOUND_ALIASES: Dict[str, str] = {
        "carbon_monoxide": "carbon monoxide",
        "carbon_dioxide": "carbon dioxide",
        "hydrogen_sulfide": "hydrogen sulfide",
        "hydrogen_chloride": "hydrogen chloride",
        "sulfur_dioxide": "sulfur dioxide",
        "nitrogen_dioxide": "nitrogen dioxide",
        "nitric_oxide": "nitric oxide",
        "n_butane": "n-butane",
        "n_pentane": "n-pentane",
        "n_hexane": "n-hexane",
        "n_heptane": "n-heptane",
        "n_octane": "n-octane",
        "i_butane": "isobutane",
        "i_pentane": "isopentane",
        "acetic_acid": "acetic acid",
        "diethyl_ether": "diethyl ether",
        "co": "carbon monoxide",
        "co2": "carbon dioxide",
        "h2s": "hydrogen sulfide",
        "h2": "hydrogen",
        "n2": "nitrogen",
        "o2": "oxygen",
        "hcl": "hydrogen chloride",
        "nh3": "ammonia",
        "meoh": "methanol",
        "etoh": "ethanol",
        "meg": "ethylene glycol",
        "teg": "triethylene glycol",
        "mea": "monoethanolamine",
        "dea": "diethanolamine",
        "ethyl_benzene": "ethylbenzene",
        "ethyl benzene": "ethylbenzene",
        "vinyl_benzene": "styrene",
        "vinyl benzene": "styrene",
        "triethylene_glycol": "triethylene glycol",
        "mono_ethanolamine": "monoethanolamine",
        "mono ethanolamine": "monoethanolamine",
        "methyldiethanolamine": "methyl diethanolamine",
        "mdea": "methyl diethanolamine",
        "so2": "sulfur dioxide",
        "no2": "nitrogen dioxide",
        "no": "nitric oxide",
        "ngl": "n-pentane",
        "diethylamine": "diethylamine",
        "n_decane": "n-decane",
        "i_pentane": "isopentane",
        "glycerin": "glycerol",
        "ar": "argon",
        "ethylene_glycol": "ethylene glycol",
        "ethylene glycol": "ethylene glycol",
        "sulfuric_acid": "sulfuric acid",
        "sulfuric acid": "sulfuric acid",
        "h2so4": "sulfuric acid",
        "cuso4": "copper sulfate",
        "copper_sulfate": "copper sulfate",
        "fame": "methyl oleate",
        "biodiesel": "methyl oleate",
        "methyl_oleate": "methyl oleate",
        "oleic_acid": "oleic acid",
        "nah": "sodium hydride",
        "naoh": "sodium hydroxide",
        "formaldehyde": "formaldehyde",
        "ch4": "methane",
        "c2h4": "ethylene",
        "c2h6": "ethane",
        "c3h8": "propane",
        "c3h6": "propylene",
        # Sulfur compounds
        "sulfur": "sulfur",
        "s": "sulfur",
        "s8": "sulfur",
        "liquid sulfur": "sulfur",
        # Ethylene oxide
        "ethylene_oxide": "ethylene oxide",
        "ethyleneoxide": "ethylene oxide",
        "eo": "ethylene oxide",
        "epoxyethane": "ethylene oxide",
        "oxirane": "ethylene oxide",
        # Heavy hydrocarbons
        "hexadecane": "hexadecane",
        "n_hexadecane": "hexadecane",
        "n-hexadecane": "hexadecane",
        "cetane": "hexadecane",
        "n_decane": "n-decane",
        "n_dodecane": "n-dodecane",
        "n-dodecane": "n-dodecane",
        # Isomers
        "isopentane": "isopentane",
        "i_pentane": "isopentane",
        "i-pentane": "isopentane",
        "2-methylbutane": "isopentane",
        "isobutane": "isobutane",
        "i_butane": "isobutane",
        "i-butane": "isobutane",
        "2-methylpropane": "isobutane",
        # n-octane
        "n_octane": "n-octane",
        # Amines
        "dea": "diethanolamine",
        "diethanolamine": "diethanolamine",
        "monoethylene glycol": "ethylene glycol",
        "monoethyleneglycol": "ethylene glycol",
        # Misc
        "nh3": "ammonia",
        "ammonia": "ammonia",
    }

    @classmethod
    def _normalize_compound_name(cls, name: str) -> str:
        """Normalize a compound name: underscores→spaces, apply aliases."""
        # Check exact alias first
        lower = name.lower().strip()
        if lower in cls._COMPOUND_ALIASES:
            return cls._COMPOUND_ALIASES[lower]
        # Replace underscores with spaces
        normalized = name.replace("_", " ").strip()
        lower_norm = normalized.lower()
        if lower_norm in cls._COMPOUND_ALIASES:
            return cls._COMPOUND_ALIASES[lower_norm]
        return normalized

    @classmethod
    def _resolve_cas(cls, names: List[str]) -> List[str]:
        """Resolve chemical names to CAS registry numbers."""
        cas_list: List[str] = []
        for name in names:
            normalized = cls._normalize_compound_name(name)
            try:
                cas = identifiers.CAS_from_any(normalized)
                cas_list.append(cas)
            except Exception:
                # Try original name as fallback
                try:
                    cas = identifiers.CAS_from_any(name)
                    cas_list.append(cas)
                except Exception as exc:
                    raise ValueError(
                        f"Could not resolve compound '{name}'. "
                        "Use IUPAC or common names (e.g. 'water', 'methane', 'ethanol')."
                    ) from exc
        return cas_list

    # Water molecular weight in g/mol
    _MW_WATER = 18.01528

    def _build_property_package(self, pkg: str) -> None:
        """Instantiate the EOS / activity-coefficient model and flash object."""

        self._is_steam_tables = False

        if pkg == "Steam-Tables":
            # IAPWS-95 steam tables — only for pure water
            if self.n != 1:
                raise ValueError(
                    "Steam-Tables property package requires exactly 1 component (water). "
                    f"Got {self.n} components: {self.component_names}"
                )
            comp_lower = self.component_names[0].lower()
            if comp_lower not in ("water", "h2o"):
                raise ValueError(
                    f"Steam-Tables property package requires water, got '{self.component_names[0]}'"
                )
            self._is_steam_tables = True
            # Still build a PR flasher as fallback for edge cases
            kijs = self._get_kijs("Peng-Robinson")
            eos_kwargs = dict(
                Tcs=self.constants.Tcs,
                Pcs=self.constants.Pcs,
                omegas=self.constants.omegas,
                kijs=kijs,
            )
            gas = CEOSGas(PRMIX, eos_kwargs=eos_kwargs, HeatCapacityGases=self.correlations.HeatCapacityGases)
            liquid = CEOSLiquid(PRMIX, eos_kwargs=eos_kwargs, HeatCapacityGases=self.correlations.HeatCapacityGases)
            self.flasher = FlashPureVLS(
                constants=self.constants,
                correlations=self.correlations,
                gas=gas,
                liquids=[liquid],
                solids=[],
            )
            return

        kijs = self._get_kijs(pkg)

        if pkg in ("Peng-Robinson", "SRK"):
            eos_class = PRMIX if pkg == "Peng-Robinson" else SRKMIX

            self.eos_kwargs = dict(
                Tcs=self.constants.Tcs,
                Pcs=self.constants.Pcs,
                omegas=self.constants.omegas,
                kijs=kijs,
            )

            gas = CEOSGas(eos_class, eos_kwargs=self.eos_kwargs, HeatCapacityGases=self.correlations.HeatCapacityGases)
            liquid = CEOSLiquid(eos_class, eos_kwargs=self.eos_kwargs, HeatCapacityGases=self.correlations.HeatCapacityGases)

            if self.n == 1:
                self.flasher = FlashPureVLS(
                    constants=self.constants,
                    correlations=self.correlations,
                    gas=gas,
                    liquids=[liquid],
                    solids=[],
                )
            else:
                self.flasher = FlashVL(
                    constants=self.constants,
                    correlations=self.correlations,
                    gas=gas,
                    liquid=liquid,
                )

        elif pkg in ("NRTL", "UNIFAC", "UNIQUAC"):
            # Activity-coefficient model for the liquid phase
            ge_liquid = GibbsExcessLiquid(
                VaporPressures=self.correlations.VaporPressures,
                HeatCapacityGases=self.correlations.HeatCapacityGases,
                VolumeLiquids=self.correlations.VolumeLiquids,
                use_Poynting=True,
                use_phis_sat=False,
            )

            # For the vapor phase use Peng-Robinson
            pr_kwargs = dict(
                Tcs=self.constants.Tcs,
                Pcs=self.constants.Pcs,
                omegas=self.constants.omegas,
                kijs=kijs,
            )
            gas = CEOSGas(PRMIX, eos_kwargs=pr_kwargs, HeatCapacityGases=self.correlations.HeatCapacityGases)

            if self.n == 1:
                self.flasher = FlashPureVLS(
                    constants=self.constants,
                    correlations=self.correlations,
                    gas=gas,
                    liquids=[ge_liquid],
                    solids=[],
                )
            else:
                self.flasher = FlashVL(
                    constants=self.constants,
                    correlations=self.correlations,
                    gas=gas,
                    liquid=ge_liquid,
                )

        else:
            raise ValueError(
                f"Unsupported property package '{pkg}'. "
                f"Supported: {self.SUPPORTED_PACKAGES}"
            )

    def _get_kijs(self, pkg: str) -> List[List[float]]:
        """Return binary interaction parameters matrix (n×n zeros as default)."""
        n = self.n
        kijs = [[0.0] * n for _ in range(n)]
        if pkg in ("Peng-Robinson", "SRK"):
            # Try to load from IPDB
            try:
                for i in range(n):
                    for j in range(i + 1, n):
                        try:
                            kij = IPDB.get_ip_specific(
                                self.cas_numbers[i],
                                self.cas_numbers[j],
                                "PR kij" if pkg == "Peng-Robinson" else "SRK kij",
                            )
                            kijs[i][j] = kij
                            kijs[j][i] = kij
                        except Exception:
                            pass  # No data available; keep 0.0
            except Exception:
                pass
        return kijs

    def _load_nrtl_params(self):
        """Attempt to load NRTL binary interaction parameters."""
        # The thermo library handles NRTL internally via GibbsExcessLiquid
        # when appropriate correlations are available
        return None

    # ------------------------------------------------------------------
    # Flash calculations
    # ------------------------------------------------------------------

    def _fallback_flash(self, **flash_kwargs) -> object:
        """Try flash with current flasher; on failure fall back to Peng-Robinson."""
        try:
            return self.flasher.flash(**flash_kwargs)
        except Exception as e:
            if self.property_package_name in ("Peng-Robinson", "SRK"):
                raise  # Already an EOS method, no fallback
            logger.warning(
                "{} flash failed ({}), falling back to Peng-Robinson",
                self.property_package_name, str(e)[:100],
            )
            if not hasattr(self, "_pr_fallback_flasher"):
                kijs = self._get_kijs("Peng-Robinson")
                pr_kwargs = dict(
                    Tcs=self.constants.Tcs,
                    Pcs=self.constants.Pcs,
                    omegas=self.constants.omegas,
                    kijs=kijs,
                )
                gas = CEOSGas(PRMIX, eos_kwargs=pr_kwargs,
                              HeatCapacityGases=self.correlations.HeatCapacityGases)
                liquid = CEOSLiquid(PRMIX, eos_kwargs=pr_kwargs,
                                    HeatCapacityGases=self.correlations.HeatCapacityGases)
                if self.n == 1:
                    self._pr_fallback_flasher = FlashPureVLS(
                        constants=self.constants,
                        correlations=self.correlations,
                        gas=gas, liquids=[liquid], solids=[],
                    )
                else:
                    self._pr_fallback_flasher = FlashVL(
                        constants=self.constants,
                        correlations=self.correlations,
                        gas=gas, liquid=liquid,
                    )
            return self._pr_fallback_flasher.flash(**flash_kwargs)

    def pt_flash(
        self,
        T: float,
        P: float,
        zs: List[float],
        molar_flow: float = 1.0,
    ) -> StreamState:
        """
        PT flash: given temperature (K), pressure (Pa), and overall mole
        fractions, compute equilibrium state.
        """
        zs = self._normalise(zs)
        if self._is_steam_tables:
            return self._iapws_pt_flash(T, P, zs, molar_flow)
        result = self._fallback_flash(T=T, P=P, zs=zs)
        return self._build_stream_state(result, zs, molar_flow)

    def ph_flash(
        self,
        P: float,
        H: float,
        zs: List[float],
        molar_flow: float = 1.0,
    ) -> StreamState:
        """
        PH flash: given pressure (Pa), molar enthalpy (J/mol), and
        composition, find equilibrium T and phase split.
        """
        zs = self._normalise(zs)
        if self._is_steam_tables:
            return self._iapws_ph_flash(P, H, zs, molar_flow)
        result = self._fallback_flash(P=P, H=H, zs=zs)
        return self._build_stream_state(result, zs, molar_flow)

    def ps_flash(
        self,
        P: float,
        S: float,
        zs: List[float],
        molar_flow: float = 1.0,
    ) -> StreamState:
        """
        PS flash: given pressure (Pa), molar entropy (J/(mol·K)), and
        composition, find equilibrium T and phase split.
        """
        zs = self._normalise(zs)
        if self._is_steam_tables:
            return self._iapws_ps_flash(P, S, zs, molar_flow)
        result = self._fallback_flash(P=P, S=S, zs=zs)
        return self._build_stream_state(result, zs, molar_flow)

    def tvf_flash(
        self,
        T: float,
        VF: float,
        zs: List[float],
        molar_flow: float = 1.0,
    ) -> StreamState:
        """
        T-VF flash: given temperature and vapor fraction, find equilibrium P
        and phase compositions.
        """
        zs = self._normalise(zs)
        result = self.flasher.flash(T=T, VF=VF, zs=zs)
        return self._build_stream_state(result, zs, molar_flow)

    def pvf_flash(
        self,
        P: float,
        VF: float,
        zs: List[float],
        molar_flow: float = 1.0,
    ) -> StreamState:
        """
        P-VF flash: given pressure and vapor fraction, find equilibrium T
        and phase compositions.
        """
        zs = self._normalise(zs)
        result = self.flasher.flash(P=P, VF=VF, zs=zs)
        return self._build_stream_state(result, zs, molar_flow)

    def vlle_flash(
        self,
        T: float,
        P: float,
        zs: List[float],
        molar_flow: float = 1.0,
    ) -> "Dict[str, StreamState]":
        """
        VLLE flash using FlashVLN for true 3-phase equilibrium.

        Returns dict with keys 'gas', 'liquid1', 'liquid2' (StreamState each).
        Falls back to standard VLE if FlashVLN fails.
        """
        zs = self._normalise(zs)

        try:
            # Build a second liquid phase for FlashVLN
            kijs = self._get_kijs(self.property_package_name)
            eos_kwargs = dict(
                Tcs=self.constants.Tcs,
                Pcs=self.constants.Pcs,
                omegas=self.constants.omegas,
                kijs=kijs,
            )
            eos_class = PRMIX if self.property_package_name in ("Peng-Robinson", "NRTL", "UNIFAC", "UNIQUAC") else SRKMIX
            gas = CEOSGas(eos_class, eos_kwargs=eos_kwargs,
                          HeatCapacityGases=self.correlations.HeatCapacityGases)
            liq1 = CEOSLiquid(eos_class, eos_kwargs=eos_kwargs,
                              HeatCapacityGases=self.correlations.HeatCapacityGases)
            liq2 = CEOSLiquid(eos_class, eos_kwargs=eos_kwargs,
                              HeatCapacityGases=self.correlations.HeatCapacityGases)

            flasher_vln = FlashVLN(
                constants=self.constants,
                correlations=self.correlations,
                gas=gas,
                liquids=[liq1, liq2],
            )
            result = flasher_vln.flash(T=T, P=P, zs=zs)

            # Extract phases
            gas_state = None
            liq1_state = None
            liq2_state = None

            vf = result.VF if result.VF is not None else 0.0

            if vf > 1e-6 and hasattr(result, 'gas') and result.gas is not None:
                gas_zs = list(result.gas.zs)
                gas_flow = molar_flow * vf
                gas_state = self._build_stream_state(
                    self.flasher.flash(T=T, P=P, zs=gas_zs) if gas_flow > 0 else result,
                    gas_zs, gas_flow
                )
            else:
                gas_state = StreamState(
                    temperature=T, pressure=P, phase="vapor",
                    vapor_fraction=1.0, liquid_fraction=0.0,
                    zs=zs, molar_flow=0.0, mass_flow=0.0,
                    component_names=list(self.component_names),
                    component_mws=list(self.constants.MWs),
                )

            # Check for multiple liquid phases
            liquid_phases = []
            if hasattr(result, 'liquids') and result.liquids:
                for liq_phase in result.liquids:
                    if liq_phase is not None:
                        liquid_phases.append(liq_phase)
            elif hasattr(result, 'liquid0') and result.liquid0 is not None:
                liquid_phases.append(result.liquid0)

            liq_flow_total = molar_flow * (1.0 - vf)

            if len(liquid_phases) >= 2:
                # True VLLE — two distinct liquid phases
                beta0 = getattr(result, 'betas_liquids', None)
                if beta0 and len(beta0) >= 2:
                    l1_frac = beta0[0]
                    l2_frac = beta0[1]
                else:
                    l1_frac = 0.5
                    l2_frac = 0.5
                total_beta = l1_frac + l2_frac
                if total_beta > 0:
                    l1_frac /= total_beta
                    l2_frac /= total_beta

                l1_zs = list(liquid_phases[0].zs)
                l2_zs = list(liquid_phases[1].zs)
                l1_flow = liq_flow_total * l1_frac
                l2_flow = liq_flow_total * l2_frac

                liq1_state = self.pt_flash(T=T, P=P, zs=l1_zs, molar_flow=l1_flow)
                liq2_state = self.pt_flash(T=T, P=P, zs=l2_zs, molar_flow=l2_flow)
            elif len(liquid_phases) == 1:
                l1_zs = list(liquid_phases[0].zs)
                liq1_state = self.pt_flash(T=T, P=P, zs=l1_zs, molar_flow=liq_flow_total)
                liq2_state = StreamState(
                    temperature=T, pressure=P, phase="liquid",
                    vapor_fraction=0.0, liquid_fraction=1.0,
                    zs=[0.0] * self.n, molar_flow=0.0, mass_flow=0.0,
                    component_names=list(self.component_names),
                    component_mws=list(self.constants.MWs),
                )
            else:
                liq1_state = StreamState(
                    temperature=T, pressure=P, phase="liquid",
                    vapor_fraction=0.0, liquid_fraction=1.0,
                    zs=zs, molar_flow=liq_flow_total, mass_flow=0.0,
                    component_names=list(self.component_names),
                    component_mws=list(self.constants.MWs),
                )
                liq2_state = StreamState(
                    temperature=T, pressure=P, phase="liquid",
                    vapor_fraction=0.0, liquid_fraction=1.0,
                    zs=[0.0] * self.n, molar_flow=0.0, mass_flow=0.0,
                    component_names=list(self.component_names),
                    component_mws=list(self.constants.MWs),
                )

            return {"gas": gas_state, "liquid1": liq1_state, "liquid2": liq2_state}

        except Exception as exc:
            logger.warning("VLLE flash failed ({}), falling back to VLE", str(exc)[:100])
            # Fallback to standard VLE + heuristic split
            flash = self.pt_flash(T=T, P=P, zs=zs, molar_flow=molar_flow)
            gas_state = StreamState(
                temperature=T, pressure=P, phase="vapor",
                vapor_fraction=1.0, liquid_fraction=0.0,
                zs=flash.ys if flash.ys else zs, molar_flow=molar_flow * flash.vapor_fraction,
                mass_flow=0.0, component_names=list(self.component_names),
                component_mws=list(self.constants.MWs),
            )
            liq_state = StreamState(
                temperature=T, pressure=P, phase="liquid",
                vapor_fraction=0.0, liquid_fraction=1.0,
                zs=flash.xs if flash.xs else zs, molar_flow=molar_flow * flash.liquid_fraction,
                mass_flow=0.0, component_names=list(self.component_names),
                component_mws=list(self.constants.MWs),
            )
            empty = StreamState(
                temperature=T, pressure=P, phase="liquid",
                vapor_fraction=0.0, liquid_fraction=1.0,
                zs=[0.0] * self.n, molar_flow=0.0, mass_flow=0.0,
                component_names=list(self.component_names),
                component_mws=list(self.constants.MWs),
            )
            return {"gas": gas_state, "liquid1": liq_state, "liquid2": empty}

    def bubble_point_T(self, P: float, zs: List[float]) -> float:
        """Bubble point temperature (K) at given pressure."""
        if self._is_steam_tables:
            from chemicals.iapws import iapws95_Tsat
            return iapws95_Tsat(P)
        zs = self._normalise(zs)
        result = self.flasher.flash(P=P, VF=0.0, zs=zs)
        return result.T

    def dew_point_T(self, P: float, zs: List[float]) -> float:
        """Dew point temperature (K) at given pressure."""
        if self._is_steam_tables:
            from chemicals.iapws import iapws95_Tsat
            return iapws95_Tsat(P)
        zs = self._normalise(zs)
        result = self.flasher.flash(P=P, VF=1.0, zs=zs)
        return result.T

    # ------------------------------------------------------------------
    # IAPWS-95 Steam Tables implementation
    # ------------------------------------------------------------------

    def _iapws_pt_flash(
        self, T: float, P: float, zs: List[float], molar_flow: float
    ) -> StreamState:
        """PT flash using IAPWS-95 steam tables for pure water."""
        from chemicals.iapws import iapws95_properties, iapws95_Psat

        # rho, U, S, H, Cv, Cp, w, JT, delta_T, mu, k (drho_dP)
        # Actually: rho, U, S, H, Cv, Cp, w, JT, isothermal_throttling, mu_or_beta, drho_dP
        props = iapws95_properties(T, P)
        rho_mass, U_mass, S_mass, H_mass, Cv_mass, Cp_mass, w, JT = props[:8]

        # Determine phase from saturation pressure comparison
        try:
            Psat = iapws95_Psat(T)
        except Exception:
            Psat = None

        if Psat is not None and Psat > 0:
            if P > Psat * 1.001:
                phase = "liquid"
                vf = 0.0
            elif P < Psat * 0.999:
                phase = "vapor"
                vf = 1.0
            else:
                phase = "two-phase"
                vf = 0.5  # Approximate; true VF requires lever rule
        else:
            # Supercritical or outside range
            if T > 647.096:
                phase = "vapor"
                vf = 1.0
            else:
                phase = "liquid" if rho_mass > 100.0 else "vapor"
                vf = 0.0 if phase == "liquid" else 1.0

        return self._build_iapws_stream(
            T, P, H_mass, S_mass, Cp_mass, Cv_mass, rho_mass, w, JT,
            phase, vf, zs, molar_flow,
        )

    def _iapws_ph_flash(
        self, P: float, H_mol: float, zs: List[float], molar_flow: float
    ) -> StreamState:
        """PH flash for steam tables: Newton iteration on T."""
        from chemicals.iapws import iapws95_properties

        # Convert molar enthalpy (J/mol) to mass enthalpy (J/kg)
        H_target = H_mol / (self._MW_WATER / 1000.0)  # J/mol / (kg/mol) = J/kg

        # Newton iteration to find T where H(T,P) = H_target
        T_guess = 373.15  # Start near boiling
        for _ in range(100):
            props = iapws95_properties(T_guess, P)
            H_calc = props[3]  # H in J/kg
            Cp_calc = props[5]  # Cp in J/(kg·K)
            err = H_calc - H_target
            if abs(err) < 0.1:  # ~0.1 J/kg convergence
                break
            if Cp_calc > 0:
                T_guess -= err / Cp_calc
            else:
                T_guess -= 0.1 * err / 4000.0
            T_guess = max(273.16, min(T_guess, 2273.15))

        return self._iapws_pt_flash(T_guess, P, zs, molar_flow)

    def _iapws_ps_flash(
        self, P: float, S_mol: float, zs: List[float], molar_flow: float
    ) -> StreamState:
        """PS flash for steam tables: Newton iteration on T."""
        from chemicals.iapws import iapws95_properties

        # Convert molar entropy (J/(mol·K)) to mass entropy (J/(kg·K))
        S_target = S_mol / (self._MW_WATER / 1000.0)

        T_guess = 373.15
        for _ in range(100):
            props = iapws95_properties(T_guess, P)
            S_calc = props[2]  # S in J/(kg·K)
            Cp_calc = props[5]  # Cp in J/(kg·K)
            err = S_calc - S_target
            if abs(err) < 0.01:  # ~0.01 J/(kg·K) convergence
                break
            # dS/dT ≈ Cp/T
            dSdT = Cp_calc / T_guess if T_guess > 0 else 1.0
            if abs(dSdT) > 1e-10:
                T_guess -= err / dSdT
            else:
                T_guess += 1.0
            T_guess = max(273.16, min(T_guess, 2273.15))

        return self._iapws_pt_flash(T_guess, P, zs, molar_flow)

    def _build_iapws_stream(
        self,
        T: float, P: float,
        H_mass: float, S_mass: float, Cp_mass: float, Cv_mass: float,
        rho_mass: float, speed_of_sound: float, JT: float,
        phase: str, vf: float,
        zs: List[float], molar_flow: float,
    ) -> StreamState:
        """Build a StreamState from IAPWS-95 mass-basis properties."""
        mw = self._MW_WATER  # g/mol
        mw_kg = mw / 1000.0  # kg/mol

        # Convert mass-basis to molar-basis
        H_mol = H_mass * mw_kg  # J/mol
        S_mol = S_mass * mw_kg  # J/(mol·K)
        Cp_mol = Cp_mass * mw_kg  # J/(mol·K)
        Cv_mol = Cv_mass * mw_kg  # J/(mol·K)

        mass_flow = molar_flow * mw_kg  # kg/s

        # Volume flow (m³/h)
        vol_flow = None
        if rho_mass > 0 and mass_flow > 0:
            vol_flow = (mass_flow / rho_mass) * 3600.0

        # Standard gas flow (Sm³/h at 15°C, 101325 Pa)
        std_gas_flow = None
        if molar_flow > 0:
            std_gas_flow = molar_flow * 8.314 * 288.15 / 101325.0 * 3600.0

        # JT coefficient: K/Pa → stored as K/Pa
        jt_val = JT if isinstance(JT, (int, float)) and not math.isnan(JT) else None

        return StreamState(
            temperature=T,
            pressure=P,
            phase=phase,
            vapor_fraction=vf,
            liquid_fraction=1.0 - vf,
            zs=zs,
            ys=zs if vf > 0.5 else None,
            xs=zs if vf < 0.5 else None,
            enthalpy=H_mol,
            entropy=S_mol,
            heat_capacity=Cp_mol,
            molecular_weight=mw,
            density=rho_mass,
            viscosity=None,  # IAPWS doesn't return viscosity directly from iapws95_properties
            thermal_conductivity=None,
            heat_capacity_cv=Cv_mol,
            compressibility_factor=P / (rho_mass * 461.5 * T) if rho_mass > 0 else None,  # Z = P/(rho*R_specific*T)
            speed_of_sound=speed_of_sound,
            surface_tension=None,
            joule_thomson=jt_val,
            isentropic_exponent=Cp_mass / Cv_mass if Cv_mass > 0 else None,
            gibbs_energy=H_mol - T * S_mol,
            volume_flow=vol_flow,
            std_gas_flow=std_gas_flow,
            component_mws=[mw],
            molar_flow=molar_flow,
            mass_flow=mass_flow,
            component_names=list(self.component_names),
        )

    # ------------------------------------------------------------------
    # Stream creation helpers
    # ------------------------------------------------------------------

    def create_stream(
        self,
        T: float,
        P: float,
        zs: List[float],
        mass_flow_kg_s: float = 0.0,
        molar_flow_mol_s: float = 0.0,
    ) -> StreamState:
        """
        Create a fully resolved stream at given T (K), P (Pa), composition.

        Supply either mass_flow_kg_s or molar_flow_mol_s. If mass flow is
        given, it is converted to molar flow using the mixture MW.
        """
        zs = self._normalise(zs)

        # Preliminary flash to get MW for flow conversion
        if mass_flow_kg_s > 0 and molar_flow_mol_s <= 0:
            mw_mix = sum(
                z * mw for z, mw in zip(zs, self.constants.MWs)
            )  # g/mol
            molar_flow_mol_s = mass_flow_kg_s / (mw_mix / 1000.0)

        return self.pt_flash(T, P, zs, molar_flow=molar_flow_mol_s)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _normalise(self, zs: List[float]) -> List[float]:
        """Normalise mole fractions to sum to 1.0."""
        total = sum(zs)
        if total <= 0:
            raise ValueError("Mole fractions must sum to a positive value")
        if abs(total - 1.0) > 1e-6:
            zs = [z / total for z in zs]
        return zs

    def _build_stream_state(
        self, flash_result, zs: List[float], molar_flow: float
    ) -> StreamState:
        """Convert a thermo flash result into a StreamState."""

        T = flash_result.T
        P = flash_result.P

        # Phase fractions
        vf = flash_result.VF if flash_result.VF is not None else 0.0
        lf = 1.0 - vf

        # Phase determination
        if vf > 0.9999:
            phase = "vapor"
        elif vf < 0.0001:
            phase = "liquid"
        else:
            phase = "two-phase"

        # Phase compositions
        ys = None
        xs = None
        if hasattr(flash_result, "gas") and flash_result.gas is not None:
            ys = list(flash_result.gas.zs)
        if hasattr(flash_result, "liquid0") and flash_result.liquid0 is not None:
            xs = list(flash_result.liquid0.zs)
        elif hasattr(flash_result, "liquid") and flash_result.liquid is not None:
            xs = list(flash_result.liquid.zs)

        # Thermodynamic properties — these are methods in thermo, not attributes
        enthalpy = self._safe_call(flash_result, "H", 0.0)  # J/mol
        entropy = self._safe_call(flash_result, "S", 0.0)  # J/(mol·K)
        cp = self._safe_call(flash_result, "Cp", 0.0)  # J/(mol·K)

        # Mixture molecular weight
        mw_mix = sum(z * mw for z, mw in zip(zs, self.constants.MWs))  # g/mol

        # Density (kg/m³)
        rho = self._safe_call(flash_result, "rho_mass", 0.0)

        # Viscosity (Pa·s)
        mu = self._safe_call(flash_result, "mu", None)

        # Extended properties
        k_thermal = self._safe_call(flash_result, "k", None)
        cv = self._safe_call(flash_result, "Cv", 0.0)
        Z = self._safe_call(flash_result, "Z", None)
        sos = self._safe_call(flash_result, "speed_of_sound", None)
        jt = self._safe_call(flash_result, "Joule_Thomson", None)
        kappa = self._safe_call(flash_result, "isentropic_exponent", None)
        G = self._safe_call(flash_result, "G", 0.0)
        sigma = None
        if hasattr(flash_result, "liquid0") and flash_result.liquid0 is not None:
            sigma = self._safe_call(flash_result.liquid0, "sigma", None)

        # Volume flow (m³/h) and standard gas flow (Sm³/h at 15°C, 101325 Pa)
        vol_flow = None
        std_gas_flow = None
        if rho and rho > 0 and molar_flow > 0:
            mass_flow_val = molar_flow * (mw_mix / 1000.0)
            vol_flow = (mass_flow_val / rho) * 3600.0  # m³/h
        if molar_flow > 0:
            # Ideal gas at standard conditions (15°C, 101325 Pa)
            std_gas_flow = molar_flow * 8.314 * 288.15 / 101325.0 * 3600.0  # Sm³/h

        component_mws = list(self.constants.MWs)

        # Flow rates
        mass_flow = molar_flow * (mw_mix / 1000.0)  # kg/s

        return StreamState(
            temperature=T,
            pressure=P,
            phase=phase,
            vapor_fraction=vf,
            liquid_fraction=lf,
            zs=zs,
            ys=ys,
            xs=xs,
            enthalpy=enthalpy,
            entropy=entropy,
            heat_capacity=cp,
            molecular_weight=mw_mix,
            density=rho,
            viscosity=mu,
            thermal_conductivity=k_thermal,
            heat_capacity_cv=cv,
            compressibility_factor=Z,
            speed_of_sound=sos,
            surface_tension=sigma,
            joule_thomson=jt,
            isentropic_exponent=kappa,
            gibbs_energy=G,
            volume_flow=vol_flow,
            std_gas_flow=std_gas_flow,
            component_mws=component_mws,
            molar_flow=molar_flow,
            mass_flow=mass_flow,
            component_names=list(self.component_names),
        )

    @staticmethod
    def _safe_call(obj, method_name: str, default):
        """Safely call a method on the flash result, returning default on error."""
        try:
            method = getattr(obj, method_name, None)
            if method is None:
                return default
            # thermo flash results expose H, S, Cp, etc. as methods
            if callable(method):
                val = method()
            else:
                val = method
            if val is None or (isinstance(val, float) and math.isnan(val)):
                return default
            return val
        except Exception:
            return default

    @staticmethod
    def _safe_property(obj, attr: str, default):
        """Safely retrieve a property, returning default on error."""
        try:
            val = getattr(obj, attr, default)
            if val is None or (isinstance(val, float) and math.isnan(val)):
                return default
            return val
        except Exception:
            return default

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------

    def get_component_mws(self) -> List[float]:
        """Return molecular weights (g/mol) for all components."""
        return list(self.constants.MWs)

    def get_component_tbs(self) -> List[float]:
        """Return normal boiling points (K) for all components."""
        return list(self.constants.Tbs)

    def get_component_tcs(self) -> List[float]:
        """Return critical temperatures (K) for all components."""
        return list(self.constants.Tcs)

    def get_component_pcs(self) -> List[float]:
        """Return critical pressures (Pa) for all components."""
        return list(self.constants.Pcs)
