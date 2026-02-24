"""
DWSIM XML exporter.

Generates .dwxmz (gzip-compressed XML) files that can be opened in DWSIM desktop.
Uses the DWSIM_Simulation_Data XML schema with SimulationObjects, GraphicObjects,
PropertyPackages, and Compounds sections.
"""

from __future__ import annotations

import gzip
import io
import uuid
import xml.etree.ElementTree as ET
from typing import List, Optional

from chemicals import identifiers, Tc, Pc, omega, MW as chem_MW, Tb

from . import schemas


# ---------------------------------------------------------------------------
# DWSIM type mappings
# ---------------------------------------------------------------------------

UNIT_TYPE_MAP = {
    "pump": ("Pump", "NodeIn_Pump"),
    "compressor": ("Compressor", "NodeIn_Compressor"),
    "turbine": ("Expander", "NodeIn_Expander"),
    "valve": ("Valve", "NodeIn_Valve"),
    "heaterCooler": ("Heater", "NodeIn_Heater"),
    "shellTubeHX": ("HeatExchanger", "NodeIn_HeatExchanger"),
    "mixer": ("Mixer", "NodeIn_Mixer"),
    "splitter": ("Splitter", "NodeIn_Splitter"),
    "flashDrum": ("Flash", "NodeIn_Flash"),
    "separator": ("Flash", "NodeIn_Flash"),
    "separator3p": ("Flash3", "NodeIn_Flash"),
    "distillationColumn": ("DistillationColumn", "NodeIn_DistColumn"),
    "cstr": ("CSTR", "NodeIn_CSTR"),
    "conversionReactor": ("ConversionReactor", "NodeIn_ConversionReactor"),
}

PP_TYPE_MAP = {
    "Peng-Robinson": "PengRobinsonPropertyPackage",
    "SRK": "SRKPropertyPackage",
    "NRTL": "NRTLPropertyPackage",
    "UNIFAC": "UNIFACPropertyPackage",
    "UNIQUAC": "UNIQUACPropertyPackage",
}


def _uid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def export_dwsim_xml(
    payload: schemas.FlowsheetPayload,
    result: schemas.SimulationResult,
) -> bytes:
    """
    Generate a DWSIM .dwxmz file (gzip-compressed XML) from a flowsheet
    payload and its simulation results.

    Returns gzip-compressed bytes.
    """
    root = ET.Element("DWSIM_Simulation_Data")

    # General info
    _add_general_info(root)

    # Settings
    _add_settings(root)

    # Property packages
    pp_id = _uid()
    pp_name = payload.thermo.package
    _add_property_packages(root, pp_name, pp_id)

    # Compounds
    component_names = payload.thermo.components
    _add_compounds(root, component_names)

    # Build stream/unit result lookups
    stream_map = {s.id: s for s in result.streams}
    unit_map = {u.id: u for u in result.units}

    # Simulation objects
    sim_objects = ET.SubElement(root, "SimulationObjects")

    # -- Material streams
    for stream_spec in payload.streams:
        sr = stream_map.get(stream_spec.id)
        _add_material_stream(sim_objects, stream_spec, sr, component_names, pp_id)

    # -- Unit operations
    for unit_spec in payload.units:
        ur = unit_map.get(unit_spec.id)
        _add_unit_operation(sim_objects, unit_spec, ur, pp_id)

    # Graphic objects (layout + connections)
    gfx_objects = ET.SubElement(root, "GraphicObjects")
    _add_graphic_objects(gfx_objects, payload)

    # Serialize to XML string
    tree = ET.ElementTree(root)
    xml_buffer = io.BytesIO()
    tree.write(xml_buffer, encoding="utf-8", xml_declaration=True)
    xml_bytes = xml_buffer.getvalue()

    # Gzip compress
    gz_buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=gz_buffer, mode="wb") as gz:
        gz.write(xml_bytes)

    return gz_buffer.getvalue()


def export_dwsim_xml_string(
    payload: schemas.FlowsheetPayload,
    result: schemas.SimulationResult,
) -> str:
    """Generate uncompressed DWSIM XML string (for debugging)."""
    root = ET.Element("DWSIM_Simulation_Data")
    _add_general_info(root)
    _add_settings(root)

    pp_id = _uid()
    _add_property_packages(root, payload.thermo.package, pp_id)
    _add_compounds(root, payload.thermo.components)

    stream_map = {s.id: s for s in result.streams}
    unit_map = {u.id: u for u in result.units}

    sim_objects = ET.SubElement(root, "SimulationObjects")
    for stream_spec in payload.streams:
        sr = stream_map.get(stream_spec.id)
        _add_material_stream(sim_objects, stream_spec, sr, payload.thermo.components, pp_id)
    for unit_spec in payload.units:
        ur = unit_map.get(unit_spec.id)
        _add_unit_operation(sim_objects, unit_spec, ur, pp_id)

    gfx_objects = ET.SubElement(root, "GraphicObjects")
    _add_graphic_objects(gfx_objects, payload)

    return ET.tostring(root, encoding="unicode", xml_declaration=True)


# ---------------------------------------------------------------------------
# Internal builders
# ---------------------------------------------------------------------------


def _add_general_info(root: ET.Element) -> None:
    info = ET.SubElement(root, "GeneralInfo")
    ET.SubElement(info, "BuildVersion").text = "ScaleApp Export 1.0"
    ET.SubElement(info, "BuildDate").text = "2026-01-01"
    ET.SubElement(info, "OSInfo").text = "ScaleApp Process Flowsheet Builder"
    ET.SubElement(info, "SavedFrom").text = "ScaleApp"


def _add_settings(root: ET.Element) -> None:
    settings = ET.SubElement(root, "Settings")
    ET.SubElement(settings, "FlowsheetQuickConnect").text = "true"
    ET.SubElement(settings, "CalculationMode").text = "SteadyState"

    # Unit system (SI)
    units = ET.SubElement(settings, "Units")
    ET.SubElement(units, "Temperature").text = "C"
    ET.SubElement(units, "Pressure").text = "kPa"
    ET.SubElement(units, "MassFlow").text = "kg/h"
    ET.SubElement(units, "MolarFlow").text = "kmol/h"
    ET.SubElement(units, "Enthalpy").text = "kJ/kg"
    ET.SubElement(units, "Entropy").text = "kJ/[kg.K]"
    ET.SubElement(units, "Density").text = "kg/m3"
    ET.SubElement(units, "Viscosity").text = "cP"


def _add_property_packages(root: ET.Element, pkg_name: str, pp_id: str) -> None:
    pps = ET.SubElement(root, "PropertyPackages")
    pp_type = PP_TYPE_MAP.get(pkg_name, "PengRobinsonPropertyPackage")
    pp = ET.SubElement(pps, "PropertyPackage")
    pp.set("Type", f"DWSIM.Thermodynamics.PropertyPackages.{pp_type}")
    ET.SubElement(pp, "ComponentName").text = pkg_name
    ET.SubElement(pp, "Name").text = pp_id
    ET.SubElement(pp, "ComponentDescription").text = f"{pkg_name} Property Package"


def _add_compounds(root: ET.Element, component_names: List[str]) -> None:
    compounds = ET.SubElement(root, "Compounds")
    for name in component_names:
        comp = ET.SubElement(compounds, "Compound")
        ET.SubElement(comp, "Name").text = name

        try:
            cas = identifiers.CAS_from_any(name)
            ET.SubElement(comp, "CAS_Number").text = cas

            props = ET.SubElement(comp, "ConstantProperties")
            try:
                ET.SubElement(props, "Molar_Weight").text = str(chem_MW(cas))
            except Exception:
                pass
            try:
                ET.SubElement(props, "Critical_Temperature").text = str(Tc(cas))
            except Exception:
                pass
            try:
                ET.SubElement(props, "Critical_Pressure").text = str(Pc(cas))
            except Exception:
                pass
            try:
                ET.SubElement(props, "Normal_Boiling_Point").text = str(Tb(cas))
            except Exception:
                pass
            try:
                ET.SubElement(props, "Acentric_Factor").text = str(omega(cas))
            except Exception:
                pass
        except Exception:
            ET.SubElement(comp, "CAS_Number").text = ""


def _add_material_stream(
    parent: ET.Element,
    spec: schemas.StreamSpec,
    result: Optional[schemas.StreamResult],
    component_names: List[str],
    pp_id: str,
) -> None:
    obj = ET.SubElement(parent, "SimulationObject")
    obj.set("Type", "DWSIM.Thermodynamics.Streams.MaterialStream")
    ET.SubElement(obj, "Name").text = spec.id
    ET.SubElement(obj, "ObjectType").text = "MaterialStream"
    ET.SubElement(obj, "PropertyPackage").text = pp_id
    ET.SubElement(obj, "CompositionBasis").text = "Molar_Fractions"

    # Properties from result or spec
    temp_c = None
    press_kpa = None
    mass_flow = None
    mole_flow = None
    vf = None
    composition = {}

    if result:
        temp_c = result.temperature_c
        press_kpa = result.pressure_kpa
        mass_flow = result.mass_flow_kg_per_h
        mole_flow = result.mole_flow_kmol_per_h
        vf = result.vapor_fraction
        composition = result.composition or {}
    elif spec.properties:
        temp_c = spec.properties.get("temperature")
        press_kpa = spec.properties.get("pressure")
        mass_flow = spec.properties.get("flow_rate")
        comp = spec.properties.get("composition", {})
        if isinstance(comp, dict):
            composition = comp

    if temp_c is not None:
        ET.SubElement(obj, "Temperature").text = str(temp_c + 273.15)  # Convert to K
    if press_kpa is not None:
        ET.SubElement(obj, "Pressure").text = str(press_kpa * 1000)  # Convert to Pa
    if mass_flow is not None:
        ET.SubElement(obj, "MassFlow").text = str(mass_flow / 3600)  # kg/h -> kg/s
    if mole_flow is not None:
        ET.SubElement(obj, "MolarFlow").text = str(mole_flow * 1000 / 3600)  # kmol/h -> mol/s
    if vf is not None:
        ET.SubElement(obj, "VaporFraction").text = str(vf)

    # Phases
    phases = ET.SubElement(obj, "Phases")

    # Phase 0: Mixture (overall)
    phase0 = ET.SubElement(phases, "Phase")
    ET.SubElement(phase0, "ID").text = "0"
    ET.SubElement(phase0, "Name").text = "Mixture"
    comps0 = ET.SubElement(phase0, "Compounds")
    for comp_name in component_names:
        c = ET.SubElement(comps0, "Compound")
        ET.SubElement(c, "Name").text = comp_name
        frac = composition.get(comp_name, 0.0)
        ET.SubElement(c, "FracaoMolar").text = str(frac)

    if result:
        spm = ET.SubElement(phase0, "SPMProperties")
        if result.density_kg_per_m3 is not None:
            ET.SubElement(spm, "density").text = str(result.density_kg_per_m3)
        if result.enthalpy_kj_per_kg is not None:
            ET.SubElement(spm, "enthalpy").text = str(result.enthalpy_kj_per_kg * 1000)  # kJ/kg -> J/kg
        if result.entropy_kj_per_kg_k is not None:
            ET.SubElement(spm, "entropy").text = str(result.entropy_kj_per_kg_k * 1000)
        if result.viscosity_cp is not None:
            ET.SubElement(spm, "viscosity").text = str(result.viscosity_cp / 1000)  # cP -> Pa.s
        if result.heat_capacity_kj_per_kg_k is not None:
            ET.SubElement(spm, "heatCapacityCp").text = str(result.heat_capacity_kj_per_kg_k * 1000)

    # Phase 1: Vapor
    if result and result.vapor_composition:
        phase1 = ET.SubElement(phases, "Phase")
        ET.SubElement(phase1, "ID").text = "1"
        ET.SubElement(phase1, "Name").text = "Vapor"
        comps1 = ET.SubElement(phase1, "Compounds")
        for comp_name in component_names:
            c = ET.SubElement(comps1, "Compound")
            ET.SubElement(c, "Name").text = comp_name
            ET.SubElement(c, "FracaoMolar").text = str(result.vapor_composition.get(comp_name, 0.0))

    # Phase 2: Liquid
    if result and result.liquid_composition:
        phase2 = ET.SubElement(phases, "Phase")
        ET.SubElement(phase2, "ID").text = "2"
        ET.SubElement(phase2, "Name").text = "Liquid1"
        comps2 = ET.SubElement(phase2, "Compounds")
        for comp_name in component_names:
            c = ET.SubElement(comps2, "Compound")
            ET.SubElement(c, "Name").text = comp_name
            ET.SubElement(c, "FracaoMolar").text = str(result.liquid_composition.get(comp_name, 0.0))


def _add_unit_operation(
    parent: ET.Element,
    spec: schemas.UnitSpec,
    result: Optional[schemas.UnitResult],
    pp_id: str,
) -> None:
    dwsim_type, _ = UNIT_TYPE_MAP.get(spec.type, ("Mixer", "NodeIn_Mixer"))

    obj = ET.SubElement(parent, "SimulationObject")
    obj.set("Type", f"DWSIM.UnitOperations.UnitOps.{dwsim_type}")
    ET.SubElement(obj, "Name").text = spec.id
    ET.SubElement(obj, "ObjectType").text = dwsim_type
    ET.SubElement(obj, "PropertyPackage").text = pp_id

    # Parameters
    if spec.parameters:
        for key, val in spec.parameters.items():
            if val is not None:
                ET.SubElement(obj, key).text = str(val)

    # Results
    if result:
        if result.duty_kw is not None:
            ET.SubElement(obj, "DutyKW").text = str(result.duty_kw)
        if result.status is not None:
            ET.SubElement(obj, "Status").text = result.status


def _add_graphic_objects(parent: ET.Element, payload: schemas.FlowsheetPayload) -> None:
    # Build connection maps
    # For each stream: which unit is source, which is target
    for stream in payload.streams:
        gfx = ET.SubElement(parent, "GraphicObject")
        gfx.set("Type", "MaterialStreamGraphic")
        ET.SubElement(gfx, "Name").text = stream.id
        ET.SubElement(gfx, "Owner").text = stream.id
        ET.SubElement(gfx, "X").text = "0"
        ET.SubElement(gfx, "Y").text = "0"

        inp = ET.SubElement(gfx, "InputConnectors")
        conn_in = ET.SubElement(inp, "Connector")
        if stream.source:
            ET.SubElement(conn_in, "IsAttached").text = "true"
            ET.SubElement(conn_in, "AttachedFromObjID").text = stream.source
        else:
            ET.SubElement(conn_in, "IsAttached").text = "false"

        outp = ET.SubElement(gfx, "OutputConnectors")
        conn_out = ET.SubElement(outp, "Connector")
        if stream.target:
            ET.SubElement(conn_out, "IsAttached").text = "true"
            ET.SubElement(conn_out, "AttachedToObjID").text = stream.target
        else:
            ET.SubElement(conn_out, "IsAttached").text = "false"

    for unit in payload.units:
        dwsim_type, gfx_type = UNIT_TYPE_MAP.get(unit.type, ("Mixer", "NodeIn_Mixer"))
        gfx = ET.SubElement(parent, "GraphicObject")
        gfx.set("Type", f"{dwsim_type}Graphic")
        ET.SubElement(gfx, "Name").text = unit.id
        ET.SubElement(gfx, "Owner").text = unit.id
        ET.SubElement(gfx, "X").text = "100"
        ET.SubElement(gfx, "Y").text = "100"

        # Find connected streams
        inlets = [s for s in payload.streams if s.target == unit.id]
        outlets = [s for s in payload.streams if s.source == unit.id]

        inp = ET.SubElement(gfx, "InputConnectors")
        for s in inlets:
            conn = ET.SubElement(inp, "Connector")
            ET.SubElement(conn, "IsAttached").text = "true"
            ET.SubElement(conn, "AttachedFromObjID").text = s.id

        outp = ET.SubElement(gfx, "OutputConnectors")
        for s in outlets:
            conn = ET.SubElement(outp, "Connector")
            ET.SubElement(conn, "IsAttached").text = "true"
            ET.SubElement(conn, "AttachedToObjID").text = s.id
