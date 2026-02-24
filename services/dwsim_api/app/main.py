from __future__ import annotations

from typing import List

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from chemicals import identifiers

from . import schemas
from .simulation_service import SimulationService
from .export_dwsim import export_dwsim_xml
from .export_csv import export_combined_csv

app = FastAPI(
    title="Process Simulation API",
    description="HYSYS/DWSIM-equivalent thermodynamic calculations powered by the thermo library",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

service = SimulationService()


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/healthz")
def healthcheck() -> dict[str, str]:
    return {"status": "ok", "engine": "thermo"}


# ---------------------------------------------------------------------------
# Flowsheet simulation
# ---------------------------------------------------------------------------


@app.post("/simulate", response_model=schemas.SimulationResult)
def run_simulation(payload: schemas.FlowsheetPayload) -> schemas.SimulationResult:
    try:
        return service.simulate(payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Single-stream property calculation
# ---------------------------------------------------------------------------


@app.post("/properties", response_model=schemas.PropertyResult)
def calculate_properties(request: schemas.PropertyRequest) -> schemas.PropertyResult:
    try:
        return service.thermo_properties(request)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Flash calculation
# ---------------------------------------------------------------------------


@app.post("/flash", response_model=schemas.FlashResult)
def flash_calculation(request: schemas.FlashRequest) -> schemas.FlashResult:
    try:
        return service.flash(request)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Compound search
# ---------------------------------------------------------------------------

# Common compounds for quick lookup
_COMMON_COMPOUNDS = [
    "water", "methane", "ethane", "propane", "n-butane", "isobutane",
    "n-pentane", "isopentane", "n-hexane", "n-heptane", "n-octane",
    "ethylene", "propylene", "benzene", "toluene", "xylene",
    "methanol", "ethanol", "isopropanol", "acetone",
    "hydrogen", "nitrogen", "oxygen", "carbon dioxide", "carbon monoxide",
    "hydrogen sulfide", "sulfur dioxide", "ammonia",
    "acetic acid", "formic acid", "phenol", "glycerol",
    "triethylene glycol", "diethylene glycol", "monoethylene glycol",
    "cyclohexane", "styrene", "ethylbenzene",
    "chloroform", "dichloromethane", "acetaldehyde", "formaldehyde",
    "dimethyl ether", "diethyl ether", "tetrahydrofuran",
    "n-decane", "n-dodecane", "n-hexadecane",
]


@app.get("/compounds", response_model=schemas.CompoundSearchResult)
def search_compounds(
    query: str = Query(default="", description="Search query"),
    limit: int = Query(default=20, ge=1, le=100),
) -> schemas.CompoundSearchResult:
    results: List[schemas.CompoundInfo] = []

    if not query:
        # Return common compounds
        names_to_search = _COMMON_COMPOUNDS[:limit]
    else:
        q = query.lower()
        names_to_search = [n for n in _COMMON_COMPOUNDS if q in n.lower()]
        # Also try the chemicals database search
        if len(names_to_search) < limit:
            try:
                # Try resolving the query directly as a compound name
                cas = identifiers.CAS_from_any(query)
                if cas and not any(
                    _get_cas_safe(n) == cas for n in names_to_search
                ):
                    names_to_search.insert(0, query)
            except Exception:
                pass

    for name in names_to_search[:limit]:
        info = _get_compound_info(name)
        if info:
            results.append(info)

    return schemas.CompoundSearchResult(compounds=results)


@app.get("/compounds/{name}", response_model=schemas.CompoundInfo)
def get_compound(name: str) -> schemas.CompoundInfo:
    info = _get_compound_info(name)
    if info is None:
        raise HTTPException(status_code=404, detail=f"Compound '{name}' not found")
    return info


def _get_compound_info(name: str) -> schemas.CompoundInfo | None:
    try:
        cas = identifiers.CAS_from_any(name)
        from chemicals import Tb as _Tb, Tc as _Tc, Pc as _Pc, MW as _MW
        mw = _MW(cas)
        tb = _Tb(cas)
        tc = _Tc(cas)
        pc = _Pc(cas)
        formula = identifiers.molecular_formula(cas) if hasattr(identifiers, 'molecular_formula') else None

        return schemas.CompoundInfo(
            name=name,
            cas=cas,
            formula=formula,
            molecular_weight=round(mw, 4) if mw else None,
            boiling_point_c=round(tb - 273.15, 2) if tb else None,
            critical_temperature_c=round(tc - 273.15, 2) if tc else None,
            critical_pressure_kpa=round(pc / 1000.0, 2) if pc else None,
        )
    except Exception:
        return None


def _get_cas_safe(name: str) -> str | None:
    try:
        return identifiers.CAS_from_any(name)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Property packages
# ---------------------------------------------------------------------------


@app.get("/property-packages")
def list_property_packages() -> list[dict]:
    return [
        {
            "name": "Peng-Robinson",
            "description": "Cubic EOS, best for hydrocarbons and non-polar systems. Default for oil & gas.",
            "recommended_for": ["hydrocarbons", "natural gas", "oil refining"],
        },
        {
            "name": "SRK",
            "description": "Soave-Redlich-Kwong cubic EOS. Alternative to PR for hydrocarbons.",
            "recommended_for": ["hydrocarbons", "natural gas"],
        },
        {
            "name": "NRTL",
            "description": "Non-Random Two-Liquid activity coefficient model. Best for polar and partially miscible systems.",
            "recommended_for": ["alcohols", "water mixtures", "polar compounds", "liquid-liquid equilibrium"],
        },
        {
            "name": "UNIFAC",
            "description": "Group-contribution activity coefficient model. Useful when binary interaction data is unavailable.",
            "recommended_for": ["novel mixtures", "limited experimental data", "polar compounds"],
        },
        {
            "name": "UNIQUAC",
            "description": "Universal Quasi-Chemical activity coefficient model. Good for strongly non-ideal liquid mixtures.",
            "recommended_for": ["polar compounds", "liquid-liquid equilibrium"],
        },
    ]


# ---------------------------------------------------------------------------
# Export endpoints
# ---------------------------------------------------------------------------


class ExportRequest(schemas.BaseModel):
    payload: schemas.FlowsheetPayload
    result: schemas.SimulationResult


@app.post("/export/dwsim")
def export_dwsim_file(request: ExportRequest):
    """Export flowsheet as DWSIM .dwxmz file (gzip-compressed XML)."""
    try:
        data = export_dwsim_xml(request.payload, request.result)
        filename = f"{request.payload.name or 'flowsheet'}.dwxmz"
        return Response(
            content=data,
            media_type="application/gzip",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/export/csv")
def export_csv_file(request: ExportRequest):
    """Export flowsheet results as CSV stream table."""
    try:
        csv_data = export_combined_csv(request.payload, request.result)
        filename = f"{request.payload.name or 'flowsheet'}.csv"
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Sensitivity analysis
# ---------------------------------------------------------------------------


@app.post("/sensitivity", response_model=schemas.SensitivityResult)
def run_sensitivity_analysis(request: schemas.SensitivityRequest) -> schemas.SensitivityResult:
    """Sweep a parameter across N values and collect output stream properties."""
    try:
        from .sensitivity import run_sensitivity
        return run_sensitivity(request)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Pinch analysis
# ---------------------------------------------------------------------------


@app.post("/pinch-analysis", response_model=schemas.PinchAnalysisResult)
def run_pinch(request: schemas.PinchAnalysisRequest) -> schemas.PinchAnalysisResult:
    """Run pinch analysis / heat integration on a flowsheet."""
    try:
        from .pinch_analysis import run_pinch_analysis
        return run_pinch_analysis(request)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Scenarios (preserved from original API)
# ---------------------------------------------------------------------------


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
