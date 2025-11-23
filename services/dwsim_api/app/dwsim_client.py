"""DWSIM automation client using pythonnet.

The implementation prefers the real DWSIM Automation API. If the required DLLs
cannot be loaded (e.g. pythonnet missing or the simulator isn't installed), it
falls back to a deterministic mock so the rest of the app still works.
"""

from __future__ import annotations

import os
import random
import sys
import tempfile
from pathlib import Path
from typing import List, Optional

from loguru import logger

from . import schemas


class DWSIMClient:
    def __init__(self) -> None:
        self._rng = random.Random(42)
        self._automation = None
        
        # Detect platform and set appropriate default path
        import platform
        system = platform.system()
        if system == 'Windows':
            # Common Windows DWSIM installation paths
            default_paths = [
                Path('C:/Program Files/DWSIM'),
                Path('C:/Program Files (x86)/DWSIM'),
                Path(os.path.expanduser('~/DWSIM')),
            ]
            default_path = next((p for p in default_paths if p.exists()), Path('C:/Program Files/DWSIM'))
        elif system == 'Darwin':  # macOS
            default_path = Path('/Applications/DWSIM.app/Contents/MonoBundle')
        else:  # Linux
            default_path = Path('/usr/lib/dwsim')  # Common Linux path
        
        self._lib_path = Path(os.getenv('DWSIM_LIB_PATH', str(default_path)))
        self._template_path = os.getenv('DWSIM_TEMPLATE_PATH')
        self._try_initialize_automation()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def simulate_flowsheet(self, payload: schemas.FlowsheetPayload) -> schemas.SimulationResult:
        if self._automation:
            try:
                return self._run_dwsim(payload)
            except Exception as exc:  # pragma: no cover - diagnostics only
                logger.exception("DWSIM automation error, falling back to mock: %s", exc)

        return self._mock_result(payload)

    def calculate_properties(self, request: schemas.PropertyRequest) -> schemas.PropertyResult:
        if self._automation:
            try:
                props = self._simple_property_flash(request)
                return schemas.PropertyResult(properties=props, warnings=[])
            except Exception as exc:  # pragma: no cover
                logger.exception("DWSIM property flash failed, returning mock values: %s", exc)

        properties = {
            "temperature_c": request.stream.properties.get("temperature", 150),
            "pressure_kpa": request.stream.properties.get("pressure", 101.3),
            "enthalpy_kj_per_kg": self._rng.uniform(-500, 2000),
            "density_kg_per_m3": self._rng.uniform(200, 900),
        }
        return schemas.PropertyResult(properties=properties, warnings=["DWSIM automation unavailable"])

    # ------------------------------------------------------------------
    # DWSIM hooks
    # ------------------------------------------------------------------
    def _try_initialize_automation(self) -> None:
        """
        Attempt to initialize DWSIM automation via pythonnet.
        
        IMPORTANT: DWSIM.Automation.dll requires .NET Framework/Mono with System.Windows.Forms.
        On macOS (especially Apple Silicon), this WILL NOT WORK due to:
        - Mono framework being Intel-only (x86_64) on ARM64 systems - pythonnet cannot load it
        - CoreCLR not having System.Windows.Forms support on macOS - DWSIM requires it
        
        This method will gracefully fail and fall back to mock results.
        For production DWSIM automation, use Windows or Linux where pythonnet's Mono backend works.
        
        See DWSIM_RUNTIME_ISSUES.md for details and alternatives.
        """
        # Check if we're on macOS - if so, skip automation attempt (known to not work)
        import platform
        if platform.system() == 'Darwin':
            logger.info(
                "Skipping DWSIM automation initialization on macOS - not supported. "
                "DWSIM automation requires .NET Framework/Mono with System.Windows.Forms, "
                "which is not available on macOS. Using mock backend. "
                "For real DWSIM automation, use Windows or Linux. See DWSIM_RUNTIME_ISSUES.md"
            )
            self._automation = None
            return
        
        try:
            if not self._lib_path.exists():
                logger.warning(
                    "DWSIM library path %s not found; keeping mock backend.\n"
                    "On Windows, set DWSIM_LIB_PATH to your DWSIM installation directory "
                    "(e.g., 'C:\\Program Files\\DWSIM' or wherever DWSIM.Automation.dll is located).",
                    self._lib_path
                )
                return
            
            # Check if DWSIM.Automation.dll exists
            automation_dll = self._lib_path / 'DWSIM.Automation.dll'
            if not automation_dll.exists():
                logger.warning(
                    "DWSIM.Automation.dll not found in %s; keeping mock backend.\n"
                    "Please set DWSIM_LIB_PATH to the directory containing DWSIM.Automation.dll.",
                    self._lib_path
                )
                return

            # Don't set DOTNET_SYSTEM_GLOBALIZATION_INVARIANT - DWSIM needs culture support
            if str(self._lib_path) not in sys.path:
                sys.path.append(str(self._lib_path))

            import pythonnet
            from pathlib import Path
            import platform
            
            system = platform.system()
            
            # On Windows, use .NET Framework (not CoreCLR) - DWSIM requires System.Windows.Forms
            if system == 'Windows':
                # Clear DOTNET_ROOT to prevent CoreCLR from being used
                # DWSIM requires .NET Framework which has System.Windows.Forms
                old_dotnet_root = os.environ.pop('DOTNET_ROOT', None)
                if old_dotnet_root:
                    logger.debug("Cleared DOTNET_ROOT to force .NET Framework instead of CoreCLR")
                
                # On Windows, pythonnet should use .NET Framework (which includes System.Windows.Forms)
                # Don't set PYTHONNET_RUNTIME - let pythonnet auto-detect .NET Framework
                try:
                    # Try without setting runtime - pythonnet should auto-detect .NET Framework
                    pythonnet.load()
                    logger.info("Loaded .NET Framework runtime (auto-detected)")
                except Exception as auto_exc:
                    logger.debug("Auto-detection failed, trying Mono: %s", auto_exc)
                    try:
                        os.environ['PYTHONNET_RUNTIME'] = 'mono'
                        pythonnet.load("mono")
                        logger.info("Loaded Mono runtime on Windows")
                    except Exception as mono_exc:
                        logger.error("Failed to initialize .NET runtime on Windows. Auto-detection failed: %s, Mono failed: %s", auto_exc, mono_exc)
                        raise RuntimeError(
                            f"Failed to initialize .NET runtime on Windows. "
                            f"Auto-detection: {auto_exc}, Mono: {mono_exc}. "
                            f"DWSIM requires .NET Framework 4.x (not CoreCLR). "
                            f"Please install .NET Framework 4.x from Microsoft."
                        ) from mono_exc
            elif system == 'Darwin':  # macOS
                # macOS-specific Mono paths (but won't work on Apple Silicon)
                official_mono = '/Library/Frameworks/Mono.framework/Versions/Current/lib/libmonosgen-2.0.dylib'
                homebrew_mono = '/opt/homebrew/lib/libmono-2.0.dylib'
                
                libmono_path = os.getenv('PYTHONNET_LIBMONO')
                if not libmono_path:
                    # Try official Mono framework first, then Homebrew
                    if Path(official_mono).exists():
                        libmono_path = official_mono
                    elif Path(homebrew_mono).exists():
                        libmono_path = homebrew_mono
                
                if libmono_path:
                    os.environ['PYTHONNET_RUNTIME'] = 'mono'
                    try:
                        pythonnet.load("mono", libmono=libmono_path)
                    except Exception as mono_exc:
                        logger.debug("Failed to load Mono with explicit path: %s", mono_exc)
                        # Try auto-discovery
                        try:
                            pythonnet.load("mono")
                        except Exception:
                            raise RuntimeError(f"Failed to initialize .NET runtime. Mono path: {libmono_path}, Error: {mono_exc}") from mono_exc
                else:
                    # Try auto-discovery
                    os.environ['PYTHONNET_RUNTIME'] = 'mono'
                    pythonnet.load("mono")
            else:  # Linux
                # On Linux, try auto-discovery (Mono should be in PATH)
                os.environ['PYTHONNET_RUNTIME'] = 'mono'
                pythonnet.load("mono")

            import clr  # type: ignore

            # Add all DLLs in the DWSIM directory to resolve dependencies
            # DWSIM has many interdependent DLLs (e.g., ThermoCS.dll, property packages, etc.)
            # Loading all DLLs ensures all dependencies are available
            # Load DWSIM.Automation.dll first, then other DLLs
            automation_dll = self._lib_path / 'DWSIM.Automation.dll'
            if automation_dll.exists():
                try:
                    clr.AddReference(str(automation_dll))
                    logger.debug(f"Added reference to {automation_dll.name}")
                except Exception as e:
                    logger.warning(f"Failed to add reference to {automation_dll.name}: {e}")
                    raise
            
            # Load other DLLs (but skip ones that are known to cause issues)
            skip_dlls = {'DWSIM.Automation.dll'}  # Already loaded
            for dll_file in self._lib_path.glob('*.dll'):
                if dll_file.name in skip_dlls:
                    continue
                try:
                    clr.AddReference(str(dll_file))
                    logger.debug(f"Added reference to {dll_file.name}")
                except Exception as e:
                    # Some DLLs may fail to load (e.g., native dependencies, UI components), which is OK
                    logger.debug(f"Could not add reference to {dll_file.name}: {e}")

            from DWSIM.Automation import Automation3  # type: ignore

            # Attempt to instantiate - this may fail on macOS due to System.Windows.Forms dependency
            try:
                self._automation = Automation3()
                logger.info("Loaded DWSIM automation from %s", self._lib_path)
            except Exception as inst_exc:
                logger.error("Failed to instantiate Automation3: %s", inst_exc, exc_info=True)
                raise
        except Exception as exc:  # pragma: no cover - env-specific failures
            import platform
            system = platform.system()
            
            # Log the full exception details first
            logger.exception("Exception during DWSIM automation initialization:")
            
            if system == 'Windows':
                logger.warning(
                    "Failed to load DWSIM automation on Windows.\n"
                    f"Full error: {exc}\n"
                    "Troubleshooting:\n"
                    "1. Ensure DWSIM_LIB_PATH points to your DWSIM installation directory\n"
                    "2. Verify DWSIM.Automation.dll exists in that directory\n"
                    "3. Ensure .NET Framework 4.x is installed (DWSIM requires it)\n"
                    "4. Check that all DWSIM DLL dependencies are in the same directory\n"
                    "5. Try running as Administrator if permission issues occur\n"
                    "6. Make sure you're NOT using CoreCLR - DWSIM needs .NET Framework\n"
                    "Example: set DWSIM_LIB_PATH='C:\\Program Files\\DWSIM'",
                    exc_info=True
                )
            elif system == 'Darwin':
                logger.warning(
                    f"Failed to load DWSIM automation on macOS: {exc}\n"
                    "Note: DWSIM automation may not work on macOS due to System.Windows.Forms dependency. "
                    "See DWSIM_RUNTIME_ISSUES.md for alternatives.",
                    exc_info=True
                )
            else:
                logger.warning(
                    f"Failed to load DWSIM automation on Linux: {exc}\n"
                    "Ensure Mono is installed and DWSIM_LIB_PATH is set correctly.",
                    exc_info=True
                )
            self._automation = None

    def _run_dwsim(self, payload: schemas.FlowsheetPayload) -> schemas.SimulationResult:
        assert self._automation

        flowsheet = self._load_template_flowsheet()
        if flowsheet is None:
            logger.warning("DWSIM template not configured; returning mock results")
            return self._mock_result(payload)

        # At this stage we simply run the template; mapping AI JSON -> DWSIM
        # objects will be implemented in a follow-up iteration.
        self._automation.CalculateFlowsheet(flowsheet, None)

        stream_results = self._extract_streams(flowsheet, payload)
        unit_results = self._extract_units(flowsheet)

        return schemas.SimulationResult(
            flowsheet_name=payload.name,
            status="ok" if stream_results else "empty",
            streams=stream_results,
            units=unit_results,
            warnings=[
                "DWSIM template executed. JSON-to-DWSIM mapping not yet implemented",
                "Set DWSIM_TEMPLATE_PATH to a .dwxml flowsheet to customize",
            ],
            diagnostics={"template": self._template_path},
        )

    def _load_template_flowsheet(self):
        if not self._template_path:
            return None
        template = Path(self._template_path)
        if not template.exists():
            logger.warning("Configured DWSIM template %s does not exist", template)
            return None

        # Copy to a temp file to avoid mutating the original flowsheet.
        tmp_dir = Path(tempfile.mkdtemp(prefix='dwsim-run-'))
        tmp_file = tmp_dir / template.name
        tmp_file.write_bytes(template.read_bytes())
        logger.info("Running DWSIM template %s", tmp_file)
        return self._automation.LoadFlowsheet(str(tmp_file))

    def _extract_streams(self, flowsheet, payload: schemas.FlowsheetPayload) -> List[schemas.StreamResult]:  # pragma: no cover - pythonnet objects
        results: List[schemas.StreamResult] = []
        try:
            sim_objects = flowsheet.GetMaterialStreams()
            for stream in sim_objects:
                stream_id = getattr(stream, 'Name', 'stream')
                try:
                    t = stream.GetProp('temperature', 'overall', None, '', 'K')[0] - 273.15
                    p = stream.GetProp('pressure', 'overall', None, '', 'kPa')[0]
                    flow = stream.GetProp('totalflow', 'overall', None, '', 'kg/s')[0] * 3600
                except Exception:
                    t = p = flow = None

                results.append(
                    schemas.StreamResult(
                        id=stream_id,
                        temperature_c=t,
                        pressure_kpa=p,
                        mass_flow_kg_per_h=flow,
                        composition={comp: 0 for comp in payload.thermo.components},
                    )
                )
        except Exception as exc:
            logger.warning("Failed to extract DWSIM streams: %s", exc)
        return results

    def _extract_units(self, flowsheet) -> List[schemas.UnitResult]:  # pragma: no cover
        results: List[schemas.UnitResult] = []
        try:
            units = flowsheet.GetUnitOperations()
            for unit in units:
                unit_id = getattr(unit, 'Name', 'unit')
                duty = getattr(unit, 'DeltaQ', 0)
                results.append(schemas.UnitResult(id=unit_id, duty_kw=duty, status='ok'))
        except Exception as exc:
            logger.warning("Failed to extract DWSIM unit results: %s", exc)
        return results

    def _simple_property_flash(self, request: schemas.PropertyRequest) -> dict:  # pragma: no cover
        # TODO: map PropertyRequest to a standalone thermo calculation.
        raise NotImplementedError("Standalone property flash not implemented yet")

    # ------------------------------------------------------------------
    # Mock fallback
    # ------------------------------------------------------------------
    def _mock_result(self, payload: schemas.FlowsheetPayload) -> schemas.SimulationResult:
        stream_results: List[schemas.StreamResult] = []
        for idx, stream in enumerate(payload.streams):
            base = 100 + idx * 10
            stream_results.append(
                schemas.StreamResult(
                    id=stream.id,
                    temperature_c=200 - idx * 5,
                    pressure_kpa=300 + idx * 15,
                    mass_flow_kg_per_h=base * 1.5,
                    mole_flow_kmol_per_h=base * 0.01,
                    vapor_fraction=self._rng.uniform(0, 1),
                    liquid_fraction=self._rng.uniform(0, 1),
                    composition={comp: round(self._rng.random(), 3) for comp in payload.thermo.components or ["C1", "C2"]},
                )
            )

        unit_results: List[schemas.UnitResult] = []
        for unit in payload.units:
            unit_results.append(
                schemas.UnitResult(
                    id=unit.id,
                    duty_kw=self._rng.uniform(-5000, 5000),
                    status="ok",
                    extra={"type": unit.type, "note": "Mock result"},
                )
            )

        warnings = ["DWSIM automation not available"] if not self._automation else []

        return schemas.SimulationResult(
            flowsheet_name=payload.name,
            status="ok",
            streams=stream_results,
            units=unit_results,
            warnings=warnings,
            diagnostics={"mode": "mock"},
        )
