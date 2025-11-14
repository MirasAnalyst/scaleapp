from __future__ import annotations

from fastapi import FastAPI, HTTPException

from . import schemas
from .simulation_service import SimulationService

app = FastAPI(title="DWSIM Simulation API", version="0.1.0")
service = SimulationService()


@app.get("/healthz")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/simulate", response_model=schemas.SimulationResult)
def run_simulation(payload: schemas.FlowsheetPayload) -> schemas.SimulationResult:
    try:
        return service.simulate(payload)
    except Exception as exc:  # pragma: no cover - placeholder error handling
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/properties", response_model=schemas.PropertyResult)
def calculate_properties(request: schemas.PropertyRequest) -> schemas.PropertyResult:
    try:
        return service.thermo_properties(request)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/scenarios", response_model=dict)
def create_scenario(request: schemas.ScenarioCreateRequest) -> dict[str, str]:
    scenario_id = service.create_scenario(request)
    return {"scenario_id": scenario_id}


@app.post("/scenarios/{scenario_id}/run", response_model=schemas.ScenarioRunResponse)
def run_scenario(scenario_id: str) -> schemas.ScenarioRunResponse:
    try:
        result = service.run_scenario(scenario_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return schemas.ScenarioRunResponse(scenario_id=scenario_id, result=result)
