from __future__ import annotations

from datetime import datetime
from typing import Dict

from . import schemas
from .thermo_client import ThermoClient


class SimulationService:
    def __init__(self) -> None:
        self._client = ThermoClient()
        self._scenario_store: Dict[str, schemas.FlowsheetPayload] = {}

    def simulate(self, payload: schemas.FlowsheetPayload) -> schemas.SimulationResult:
        # Apply Set specs before solving (linear constraints)
        if payload.set_specs:
            from .adjust_operation import SetSpec, apply_set_specs
            set_specs = [
                SetSpec(
                    source_unit_id=s.source_unit_id,
                    source_param=s.source_param,
                    target_unit_id=s.target_unit_id,
                    target_param=s.target_param,
                    multiplier=s.multiplier,
                    offset=s.offset,
                )
                for s in payload.set_specs
            ]
            payload = apply_set_specs(payload, set_specs)

        # If Adjust specs present, use the iterative adjust solver
        if payload.adjust_specs:
            from .adjust_operation import AdjustSpec, run_adjust
            # Run adjusts sequentially (each builds on previous)
            result = None
            for adj in payload.adjust_specs:
                spec = AdjustSpec(
                    variable_unit_id=adj.variable_unit_id,
                    variable_param=adj.variable_param,
                    variable_min=adj.variable_min,
                    variable_max=adj.variable_max,
                    target_stream_id=adj.target_stream_id,
                    target_property=adj.target_property,
                    target_value=adj.target_value,
                    tolerance=adj.tolerance,
                    max_iterations=adj.max_iterations,
                )
                result = run_adjust(payload, spec, self._client)
            return result

        return self._client.simulate_flowsheet(payload)

    def thermo_properties(self, request: schemas.PropertyRequest) -> schemas.PropertyResult:
        return self._client.calculate_properties(request)

    def flash(self, request: schemas.FlashRequest) -> schemas.FlashResult:
        return self._client.flash_calculation(request)

    def create_scenario(self, scenario: schemas.ScenarioCreateRequest) -> str:
        scenario_id = f"scn-{int(datetime.utcnow().timestamp())}"
        self._scenario_store[scenario_id] = scenario.flowsheet
        return scenario_id

    def run_scenario(self, scenario_id: str) -> schemas.SimulationResult:
        payload = self._scenario_store.get(scenario_id)
        if not payload:
            raise KeyError(f"Scenario {scenario_id} not found")
        return self.simulate(payload)
