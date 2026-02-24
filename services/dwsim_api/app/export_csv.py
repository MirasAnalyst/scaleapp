"""
CSV exporter for HYSYS spreadsheet import.

Generates stream data tables in CSV format. The format is compatible
with HYSYS "Import from Spreadsheet" and general-purpose tools.
"""

from __future__ import annotations

import csv
import io
from typing import List

from . import schemas


def export_stream_table_csv(
    payload: schemas.FlowsheetPayload,
    result: schemas.SimulationResult,
) -> str:
    """
    Generate a HYSYS-style stream summary table in CSV format.

    Columns = streams, rows = properties (like the HYSYS workbook).
    """
    streams = result.streams
    if not streams:
        return ""

    # Collect all component names across all streams
    all_components: list[str] = []
    seen = set()
    for s in streams:
        if s.composition:
            for comp in s.composition:
                if comp not in seen:
                    seen.add(comp)
                    all_components.append(comp)

    output = io.StringIO()
    writer = csv.writer(output)

    # Header row: Property | stream1 | stream2 | ...
    stream_ids = [s.id for s in streams]
    writer.writerow(["Property", "Unit"] + stream_ids)

    # Property rows
    _write_row(writer, "Temperature", "C", streams, lambda s: s.temperature_c)
    _write_row(writer, "Pressure", "kPa", streams, lambda s: s.pressure_kpa)
    _write_row(writer, "Mass Flow", "kg/h", streams, lambda s: s.mass_flow_kg_per_h)
    _write_row(writer, "Molar Flow", "kmol/h", streams, lambda s: s.mole_flow_kmol_per_h)
    _write_row(writer, "Vapor Fraction", "", streams, lambda s: s.vapor_fraction)
    _write_row(writer, "Liquid Fraction", "", streams, lambda s: s.liquid_fraction)
    _write_row(writer, "Phase", "", streams, lambda s: s.phase, is_text=True)
    _write_row(writer, "Enthalpy", "kJ/kg", streams, lambda s: s.enthalpy_kj_per_kg)
    _write_row(writer, "Entropy", "kJ/(kg.K)", streams, lambda s: s.entropy_kj_per_kg_k)
    _write_row(writer, "Heat Capacity", "kJ/(kg.K)", streams, lambda s: s.heat_capacity_kj_per_kg_k)
    _write_row(writer, "Density", "kg/m3", streams, lambda s: s.density_kg_per_m3)
    _write_row(writer, "Viscosity", "cP", streams, lambda s: s.viscosity_cp)
    _write_row(writer, "Molecular Weight", "g/mol", streams, lambda s: s.molecular_weight)
    _write_row(writer, "Thermal Conductivity", "W/(m.K)", streams, lambda s: s.thermal_conductivity_w_per_mk)
    _write_row(writer, "Cv", "kJ/(kg.K)", streams, lambda s: s.heat_capacity_cv_kj_per_kg_k)
    _write_row(writer, "Compressibility Z", "", streams, lambda s: s.compressibility_factor)
    _write_row(writer, "Speed of Sound", "m/s", streams, lambda s: s.speed_of_sound_m_per_s)
    _write_row(writer, "Surface Tension", "N/m", streams, lambda s: s.surface_tension_n_per_m)
    _write_row(writer, "Joule-Thomson", "K/kPa", streams, lambda s: s.joule_thomson_k_per_kpa)
    _write_row(writer, "Isentropic Exponent", "", streams, lambda s: s.isentropic_exponent)
    _write_row(writer, "Gibbs Energy", "kJ/kg", streams, lambda s: s.gibbs_energy_kj_per_kg)
    _write_row(writer, "Volume Flow", "m3/h", streams, lambda s: s.volume_flow_m3_per_h)
    _write_row(writer, "Std Gas Flow", "Sm3/h", streams, lambda s: s.std_gas_flow_sm3_per_h)

    # Blank separator row
    writer.writerow([])
    writer.writerow(["--- Overall Composition (mole frac) ---"])

    # Composition rows
    for comp in all_components:
        writer.writerow(
            [comp, "mol frac"]
            + [_fmt(s.composition.get(comp) if s.composition else None) for s in streams]
        )

    # Vapor composition
    has_vapor_comp = any(s.vapor_composition for s in streams)
    if has_vapor_comp:
        writer.writerow([])
        writer.writerow(["--- Vapor Composition (mole frac) ---"])
        for comp in all_components:
            writer.writerow(
                [f"{comp} (vapor)", "mol frac"]
                + [
                    _fmt(s.vapor_composition.get(comp) if s.vapor_composition else None)
                    for s in streams
                ]
            )

    # Liquid composition
    has_liquid_comp = any(s.liquid_composition for s in streams)
    if has_liquid_comp:
        writer.writerow([])
        writer.writerow(["--- Liquid Composition (mole frac) ---"])
        for comp in all_components:
            writer.writerow(
                [f"{comp} (liquid)", "mol frac"]
                + [
                    _fmt(s.liquid_composition.get(comp) if s.liquid_composition else None)
                    for s in streams
                ]
            )

    return output.getvalue()


def export_unit_operations_csv(
    result: schemas.SimulationResult,
) -> str:
    """
    Generate a unit operations summary in CSV format.
    """
    units = result.units
    if not units:
        return ""

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Unit ID", "Duty (kW)", "Pressure Drop (kPa)",
        "Efficiency", "Status", "Inlet Streams", "Outlet Streams",
    ])

    for u in units:
        writer.writerow([
            u.id,
            _fmt(u.duty_kw),
            _fmt(u.pressure_drop_kpa),
            _fmt(u.efficiency),
            u.status or "",
            "; ".join(u.inlet_streams) if u.inlet_streams else "",
            "; ".join(u.outlet_streams) if u.outlet_streams else "",
        ])

    return output.getvalue()


def export_combined_csv(
    payload: schemas.FlowsheetPayload,
    result: schemas.SimulationResult,
) -> str:
    """
    Generate a combined CSV with stream table + unit operations.
    """
    parts = []

    parts.append(f"Flowsheet: {result.flowsheet_name}")
    parts.append(f"Status: {result.status}")
    parts.append(f"Property Package: {result.property_package or payload.thermo.package}")
    parts.append(f"Components: {', '.join(result.components or payload.thermo.components)}")
    if result.converged is not None:
        parts.append(f"Converged: {result.converged}")
    if result.iterations is not None:
        parts.append(f"Iterations: {result.iterations}")
    parts.append("")

    # Stream table
    parts.append("=== STREAM SUMMARY ===")
    parts.append(export_stream_table_csv(payload, result))

    # Unit operations
    parts.append("=== UNIT OPERATIONS ===")
    parts.append(export_unit_operations_csv(result))

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fmt(v, decimals: int = 6) -> str:
    if v is None:
        return ""
    if isinstance(v, float):
        return f"{v:.{decimals}f}"
    return str(v)


def _write_row(writer, label, unit, streams, getter, is_text=False):
    if is_text:
        values = [getter(s) or "" for s in streams]
    else:
        values = [_fmt(getter(s)) for s in streams]
    writer.writerow([label, unit] + values)
