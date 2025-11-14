from __future__ import annotations

from datetime import datetime
from typing import Dict

from . import schemas
from .dwsim_client import DWSIMClient


class SimulationService:
    def __init__(self) -> None:
        self._client = DWSIMClient()
        self._scenario_store: Dict[str, schemas.FlowsheetPayload] = {}

    def simulate(self, payload: schemas.FlowsheetPayload) -> schemas.SimulationResult:
        return self._client.simulate_flowsheet(payload)

    def thermo_properties(self, request: schemas.PropertyRequest) -> schemas.PropertyResult:
        return self._client.calculate_properties(request)

    def create_scenario(self, scenario: schemas.ScenarioCreateRequest) -> str:
        scenario_id = f"scn-{int(datetime.utcnow().timestamp())}"
        self._scenario_store[scenario_id] = scenario.flowsheet
        return scenario_id

    def run_scenario(self, scenario_id: str) -> schemas.SimulationResult:
        payload = self._scenario_store.get(scenario_id)
        if not payload:
            raise KeyError(f"Scenario {scenario_id} not found")
        return self.simulate(payload)
