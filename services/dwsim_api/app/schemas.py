from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class UnitSpec(BaseModel):
    id: str
    type: str
    name: Optional[str] = None
    parameters: Dict[str, Any] = Field(default_factory=dict)


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


class StreamResult(BaseModel):
    id: str
    temperature_c: Optional[float] = None
    pressure_kpa: Optional[float] = None
    mass_flow_kg_per_h: Optional[float] = None
    mole_flow_kmol_per_h: Optional[float] = None
    vapor_fraction: Optional[float] = None
    liquid_fraction: Optional[float] = None
    composition: Dict[str, float] = Field(default_factory=dict)


class UnitResult(BaseModel):
    id: str
    duty_kw: Optional[float] = None
    status: str = "not-run"
    extra: Dict[str, Any] = Field(default_factory=dict)


class SimulationResult(BaseModel):
    flowsheet_name: str
    status: str
    streams: List[StreamResult]
    units: List[UnitResult]
    warnings: List[str] = Field(default_factory=list)
    diagnostics: Dict[str, Any] = Field(default_factory=dict)


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
