"""
Sensitivity analysis — parameter sweep runner.

Sweeps a single parameter across N values, re-solves the flowsheet at each
point, and collects output stream properties for charting.
"""

from __future__ import annotations

import copy
from typing import Dict, List, Optional

from loguru import logger

from . import schemas
from .thermo_client import ThermoClient


def run_sensitivity(
    request: schemas.SensitivityRequest,
) -> schemas.SensitivityResult:
    """
    Sweep a parameter and collect output properties.

    The variable is applied to `variable_unit_id`.parameters[`variable_param`]
    across `n_points` linearly spaced values between `variable_min` and
    `variable_max`.  At each point the flowsheet is re-solved and
    `output_properties` are read from `output_stream_id`.
    """
    warnings: List[str] = []
    client = ThermoClient()

    n = max(request.n_points, 2)
    param_values = [
        request.variable_min + i * (request.variable_max - request.variable_min) / (n - 1)
        for i in range(n)
    ]

    # Prepare results dict: property_name -> list of values
    results: Dict[str, List[Optional[float]]] = {
        prop: [] for prop in request.output_properties
    }

    for idx, val in enumerate(param_values):
        # Deep-copy the flowsheet so mutations don't accumulate
        payload = copy.deepcopy(request.flowsheet)

        # Apply the swept parameter
        applied = False
        for unit in payload.units:
            if unit.id == request.variable_unit_id:
                unit.parameters[request.variable_param] = val
                applied = True
                break

        if not applied:
            # Maybe the variable is on a stream
            for stream in payload.streams:
                if stream.id == request.variable_unit_id:
                    stream.properties[request.variable_param] = val
                    applied = True
                    break

        if not applied:
            warnings.append(
                f"Unit/stream '{request.variable_unit_id}' not found in flowsheet"
            )
            for prop in request.output_properties:
                results[prop].append(None)
            continue

        # Solve
        try:
            sim_result = client.simulate_flowsheet(payload)
        except Exception as exc:
            warnings.append(f"Point {idx} (val={val:.4g}) failed: {exc}")
            for prop in request.output_properties:
                results[prop].append(None)
            continue

        # Extract output stream
        target_stream = None
        for s in sim_result.streams:
            if s.id == request.output_stream_id:
                target_stream = s
                break

        if target_stream is None:
            warnings.append(f"Output stream '{request.output_stream_id}' not found at point {idx}")
            for prop in request.output_properties:
                results[prop].append(None)
            continue

        # Read properties
        for prop in request.output_properties:
            val_out = getattr(target_stream, prop, None)
            if val_out is None and target_stream.composition:
                # Check if it's a component name in composition
                val_out = target_stream.composition.get(prop)
            results[prop].append(val_out)

    return schemas.SensitivityResult(
        parameter_values=param_values,
        results=results,
        warnings=warnings,
    )
