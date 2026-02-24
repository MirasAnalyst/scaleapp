"""
Adjust and Set logical operations for flowsheet specification.

Adjust: Varies a parameter on a unit operation until a target stream
property reaches a desired value (uses Brent's method root-finding).

Set: Applies a linear relationship between a source and target parameter
before the solver runs.
"""

from __future__ import annotations

import copy
from typing import Any, Dict, List, Optional

from loguru import logger
from scipy.optimize import brentq

from . import schemas
from .thermo_client import ThermoClient


# ---------------------------------------------------------------------------
# Schema models
# ---------------------------------------------------------------------------


class AdjustSpec:
    """Specification for an Adjust (controller) operation."""

    def __init__(
        self,
        variable_unit_id: str,
        variable_param: str,
        variable_min: float,
        variable_max: float,
        target_stream_id: str,
        target_property: str,
        target_value: float,
        tolerance: float = 1e-4,
        max_iterations: int = 50,
    ):
        self.variable_unit_id = variable_unit_id
        self.variable_param = variable_param
        self.variable_min = variable_min
        self.variable_max = variable_max
        self.target_stream_id = target_stream_id
        self.target_property = target_property
        self.target_value = target_value
        self.tolerance = tolerance
        self.max_iterations = max_iterations


class SetSpec:
    """Specification for a Set (linear constraint) operation."""

    def __init__(
        self,
        source_unit_id: str,
        source_param: str,
        target_unit_id: str,
        target_param: str,
        multiplier: float = 1.0,
        offset: float = 0.0,
    ):
        self.source_unit_id = source_unit_id
        self.source_param = source_param
        self.target_unit_id = target_unit_id
        self.target_param = target_param
        self.multiplier = multiplier
        self.offset = offset


# ---------------------------------------------------------------------------
# Target property extraction
# ---------------------------------------------------------------------------

_PROPERTY_MAP = {
    "temperature_c": lambda s: s.temperature_c,
    "pressure_kpa": lambda s: s.pressure_kpa,
    "vapor_fraction": lambda s: s.vapor_fraction,
    "mass_flow_kg_per_h": lambda s: s.mass_flow_kg_per_h,
    "mole_flow_kmol_per_h": lambda s: s.mole_flow_kmol_per_h,
    "density_kg_per_m3": lambda s: s.density_kg_per_m3,
    "enthalpy_kj_per_kg": lambda s: s.enthalpy_kj_per_kg,
    "molecular_weight": lambda s: s.molecular_weight,
}


def _extract_target_value(
    result: schemas.SimulationResult,
    stream_id: str,
    prop: str,
) -> Optional[float]:
    """Extract a numeric property from a simulation result stream."""
    stream = next((s for s in result.streams if s.id == stream_id), None)
    if stream is None:
        return None

    # Check built-in property map first
    getter = _PROPERTY_MAP.get(prop)
    if getter:
        return getter(stream)

    # Check composition by component name (e.g. "composition.benzene")
    if prop.startswith("composition."):
        comp_name = prop.split(".", 1)[1]
        if stream.composition:
            return stream.composition.get(comp_name)
        return None

    # Try direct attribute access
    val = getattr(stream, prop, None)
    if isinstance(val, (int, float)):
        return val
    return None


# ---------------------------------------------------------------------------
# Adjust solver
# ---------------------------------------------------------------------------


def run_adjust(
    payload: schemas.FlowsheetPayload,
    adjust_spec: AdjustSpec,
    client: Optional[ThermoClient] = None,
) -> schemas.SimulationResult:
    """
    Run an Adjust operation using Brent's method.

    Varies `variable_param` on `variable_unit_id` within [min, max] until
    `target_stream_id.target_property == target_value`.
    """
    if client is None:
        client = ThermoClient()

    warnings: List[str] = []

    def _objective(param_value: float) -> float:
        """Objective function for root-finding: actual - target."""
        # Deep-copy payload and set the parameter
        p = _clone_payload_with_param(
            payload,
            adjust_spec.variable_unit_id,
            adjust_spec.variable_param,
            param_value,
        )
        result = client.simulate_flowsheet(p)

        if not result.converged:
            logger.warning(
                "Adjust: flowsheet did not converge at {}={}",
                adjust_spec.variable_param, param_value,
            )

        actual = _extract_target_value(
            result,
            adjust_spec.target_stream_id,
            adjust_spec.target_property,
        )
        if actual is None:
            raise ValueError(
                f"Could not extract '{adjust_spec.target_property}' "
                f"from stream '{adjust_spec.target_stream_id}'"
            )

        return actual - adjust_spec.target_value

    try:
        optimal_value = brentq(
            _objective,
            adjust_spec.variable_min,
            adjust_spec.variable_max,
            xtol=adjust_spec.tolerance,
            maxiter=adjust_spec.max_iterations,
        )
    except ValueError as exc:
        # Brent's method requires f(a) and f(b) to have opposite signs
        warnings.append(
            f"Adjust failed: {exc}. "
            f"Target may not be achievable within [{adjust_spec.variable_min}, {adjust_spec.variable_max}]"
        )
        # Return result at midpoint as best effort
        mid = (adjust_spec.variable_min + adjust_spec.variable_max) / 2.0
        final_payload = _clone_payload_with_param(
            payload, adjust_spec.variable_unit_id,
            adjust_spec.variable_param, mid,
        )
        result = client.simulate_flowsheet(final_payload)
        result.warnings.extend(warnings)
        return result

    # Run final simulation at the converged value
    final_payload = _clone_payload_with_param(
        payload,
        adjust_spec.variable_unit_id,
        adjust_spec.variable_param,
        optimal_value,
    )
    result = client.simulate_flowsheet(final_payload)

    result.warnings.extend(warnings)
    result.diagnostics["adjust"] = {
        "variable_unit_id": adjust_spec.variable_unit_id,
        "variable_param": adjust_spec.variable_param,
        "converged_value": optimal_value,
        "target_stream_id": adjust_spec.target_stream_id,
        "target_property": adjust_spec.target_property,
        "target_value": adjust_spec.target_value,
    }

    return result


# ---------------------------------------------------------------------------
# Set operation
# ---------------------------------------------------------------------------


def apply_set_specs(
    payload: schemas.FlowsheetPayload,
    set_specs: List[SetSpec],
) -> schemas.FlowsheetPayload:
    """
    Apply Set specifications to a payload before solving.

    For each SetSpec, reads source_param from source_unit and writes
    target_param = source_param * multiplier + offset to target_unit.
    """
    payload_dict = payload.model_dump()
    units_by_id = {u["id"]: u for u in payload_dict["units"]}

    for spec in set_specs:
        source = units_by_id.get(spec.source_unit_id)
        target = units_by_id.get(spec.target_unit_id)

        if source is None:
            logger.warning("Set: source unit '{}' not found", spec.source_unit_id)
            continue
        if target is None:
            logger.warning("Set: target unit '{}' not found", spec.target_unit_id)
            continue

        source_val = source.get("parameters", {}).get(spec.source_param)
        if source_val is None:
            logger.warning(
                "Set: source param '{}' not found on unit '{}'",
                spec.source_param, spec.source_unit_id,
            )
            continue

        new_val = float(source_val) * spec.multiplier + spec.offset
        target.setdefault("parameters", {})[spec.target_param] = new_val

        logger.info(
            "Set: {}.{} = {}.{} * {} + {} = {}",
            spec.target_unit_id, spec.target_param,
            spec.source_unit_id, spec.source_param,
            spec.multiplier, spec.offset, new_val,
        )

    return schemas.FlowsheetPayload(**payload_dict)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _clone_payload_with_param(
    payload: schemas.FlowsheetPayload,
    unit_id: str,
    param: str,
    value: float,
) -> schemas.FlowsheetPayload:
    """Deep-copy a payload and set a specific unit parameter."""
    data = payload.model_dump()
    for unit in data["units"]:
        if unit["id"] == unit_id:
            unit["parameters"][param] = value
            break
    return schemas.FlowsheetPayload(**data)
