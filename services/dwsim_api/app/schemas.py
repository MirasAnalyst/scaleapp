from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class UnitSpec(BaseModel):
    id: str
    type: str
    name: Optional[str] = None
    parameters: Dict[str, Any] = Field(default_factory=dict)
    property_package: Optional[str] = None
    components: Optional[List[str]] = None


class StreamSpec(BaseModel):
    id: str
    name: Optional[str] = None
    source: Optional[str] = None
    target: Optional[str] = None
    phase: Optional[str] = None
    properties: Dict[str, Any] = Field(default_factory=dict)


class ThermoConfig(BaseModel):
    package: str = Field(default="Peng-Robinson")
    components: List[str] = Field(default_factory=list)
    basis: Optional[str] = None


class FlowsheetPayload(BaseModel):
    name: str = Field(default="generated-flowsheet")
    units: List[UnitSpec]
    streams: List[StreamSpec]
    thermo: ThermoConfig = Field(default_factory=ThermoConfig)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    energy_streams: List["EnergyStreamSpec"] = Field(default_factory=list)
    adjust_specs: List["AdjustSpecModel"] = Field(default_factory=list)
    set_specs: List["SetSpecModel"] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Enhanced result schemas
# ---------------------------------------------------------------------------


class StreamResult(BaseModel):
    id: str
    temperature_c: Optional[float] = None
    pressure_kpa: Optional[float] = None
    mass_flow_kg_per_h: Optional[float] = None
    mole_flow_kmol_per_h: Optional[float] = None
    vapor_fraction: Optional[float] = None
    liquid_fraction: Optional[float] = None
    composition: Dict[str, float] = Field(default_factory=dict)
    mass_composition: Optional[Dict[str, float]] = None
    # Thermodynamic properties
    enthalpy_kj_per_kg: Optional[float] = None
    entropy_kj_per_kg_k: Optional[float] = None
    density_kg_per_m3: Optional[float] = None
    viscosity_cp: Optional[float] = None
    molecular_weight: Optional[float] = None
    heat_capacity_kj_per_kg_k: Optional[float] = None
    # Extended properties
    thermal_conductivity_w_per_mk: Optional[float] = None
    heat_capacity_cv_kj_per_kg_k: Optional[float] = None
    compressibility_factor: Optional[float] = None
    speed_of_sound_m_per_s: Optional[float] = None
    surface_tension_n_per_m: Optional[float] = None
    joule_thomson_k_per_kpa: Optional[float] = None
    isentropic_exponent: Optional[float] = None
    gibbs_energy_kj_per_kg: Optional[float] = None
    volume_flow_m3_per_h: Optional[float] = None
    std_gas_flow_sm3_per_h: Optional[float] = None
    phase: Optional[str] = None
    liquid_composition: Optional[Dict[str, float]] = None
    vapor_composition: Optional[Dict[str, float]] = None


class UnitResult(BaseModel):
    id: str
    duty_kw: Optional[float] = None
    status: str = "not-run"
    extra: Dict[str, Any] = Field(default_factory=dict)
    pressure_drop_kpa: Optional[float] = None
    efficiency: Optional[float] = None
    inlet_streams: Optional[List[str]] = None
    outlet_streams: Optional[List[str]] = None


class TrayProfileResult(BaseModel):
    """Per-tray results from rigorous distillation."""
    tray: int
    temperature_c: float
    pressure_kpa: float
    vapor_flow_kmol_per_h: Optional[float] = None
    liquid_flow_kmol_per_h: Optional[float] = None
    liquid_composition: Dict[str, float] = Field(default_factory=dict)
    vapor_composition: Dict[str, float] = Field(default_factory=dict)


class EnergyStreamSpec(BaseModel):
    """Energy stream specification."""
    id: str
    duty_kw: Optional[float] = None
    source_unit: Optional[str] = None
    target_unit: Optional[str] = None


class AdjustSpecModel(BaseModel):
    """Adjust operation: vary a parameter to meet a target."""
    variable_unit_id: str
    variable_param: str
    variable_min: float
    variable_max: float
    target_stream_id: str
    target_property: str
    target_value: float
    tolerance: float = 1e-4
    max_iterations: int = 50


class SetSpecModel(BaseModel):
    """Set operation: linear constraint between unit parameters."""
    source_unit_id: str
    source_param: str
    target_unit_id: str
    target_param: str
    multiplier: float = 1.0
    offset: float = 0.0


class SensitivityRequest(BaseModel):
    """Request for sensitivity analysis."""
    flowsheet: FlowsheetPayload
    variable_unit_id: str
    variable_param: str
    variable_min: float
    variable_max: float
    n_points: int = 10
    output_stream_id: str
    output_properties: List[str] = Field(default_factory=lambda: ["temperature_c", "vapor_fraction"])


class SensitivityResult(BaseModel):
    """Result from sensitivity analysis."""
    parameter_values: List[float]
    results: Dict[str, List[Optional[float]]]
    warnings: List[str] = Field(default_factory=list)


class PinchAnalysisRequest(BaseModel):
    """Request for pinch analysis."""
    flowsheet: FlowsheetPayload
    dt_min: float = 10.0  # Minimum approach temperature (°C)


class PinchAnalysisResult(BaseModel):
    """Result from pinch analysis."""
    pinch_temperature_c: Optional[float] = None
    min_hot_utility_kw: Optional[float] = None
    min_cold_utility_kw: Optional[float] = None
    hot_composite: List[Dict[str, float]] = Field(default_factory=list)
    cold_composite: List[Dict[str, float]] = Field(default_factory=list)
    grand_composite: List[Dict[str, float]] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class SimulationResult(BaseModel):
    flowsheet_name: str
    status: str
    streams: List[StreamResult]
    units: List[UnitResult]
    warnings: List[str] = Field(default_factory=list)
    diagnostics: Dict[str, Any] = Field(default_factory=dict)
    converged: bool = False
    iterations: int = 0
    mass_balance_error: Optional[float] = None
    energy_balance_error: Optional[float] = None
    property_package: Optional[str] = None
    components: Optional[List[str]] = None


# ---------------------------------------------------------------------------
# Flash calculation endpoint schemas
# ---------------------------------------------------------------------------


class FlashRequest(BaseModel):
    """Single stream flash calculation request."""
    thermo: ThermoConfig = Field(default_factory=ThermoConfig)
    temperature_c: Optional[float] = None
    pressure_kpa: Optional[float] = None
    enthalpy_kj_per_kg: Optional[float] = None
    entropy_kj_per_kg_k: Optional[float] = None
    vapor_fraction: Optional[float] = None
    composition: Dict[str, float]  # component_name -> mole_fraction
    mass_flow_kg_per_h: Optional[float] = None
    flash_type: str = "PT"  # PT, PH, PS, TVF, PVF


class FlashResult(BaseModel):
    stream: StreamResult
    warnings: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Compound search schemas
# ---------------------------------------------------------------------------


class CompoundInfo(BaseModel):
    name: str
    cas: str
    formula: Optional[str] = None
    molecular_weight: Optional[float] = None
    boiling_point_c: Optional[float] = None
    critical_temperature_c: Optional[float] = None
    critical_pressure_kpa: Optional[float] = None


class CompoundSearchResult(BaseModel):
    compounds: List[CompoundInfo]


# ---------------------------------------------------------------------------
# Existing schemas preserved
# ---------------------------------------------------------------------------


class PropertyRequest(BaseModel):
    thermo: ThermoConfig = Field(default_factory=ThermoConfig)
    stream: StreamSpec


class PropertyResult(BaseModel):
    properties: Dict[str, Any]
    warnings: List[str] = Field(default_factory=list)


class ScenarioCreateRequest(BaseModel):
    name: str
    flowsheet: FlowsheetPayload
    description: Optional[str] = None


class ScenarioRunResponse(BaseModel):
    scenario_id: str
    result: SimulationResult
