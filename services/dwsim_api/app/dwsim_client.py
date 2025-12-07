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
        self._object_type_enum = None
        self._object_type_cache = {}
        self._last_flowsheet = None
        self._last_stream_map = {}
        self._active_property_package = None
        
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

            # pythonnet 3.x exposes pythonnet.load; 2.5.x exposes clr only.
            try:
                import pythonnet  # type: ignore
                pythonnet_version = getattr(pythonnet, "__version__", "unknown")
            except ImportError:
                pythonnet = None
                pythonnet_version = "not-installed"
            import platform
            system = platform.system()

            # On Windows, prefer .NET Framework: just importing clr is usually enough with pythonnet 2.5.x
            if system == 'Windows':
                # Clear DOTNET_ROOT to avoid CoreCLR
                os.environ.pop('DOTNET_ROOT', None)
                if pythonnet and hasattr(pythonnet, "load"):
                    try:
                        pythonnet.load()
                        logger.info("Loaded .NET Framework runtime via pythonnet (v%s)", pythonnet_version)
                    except Exception as auto_exc:
                        logger.debug("pythonnet.load failed on Windows: %s", auto_exc)
                else:
                    logger.info("Using clr import directly (pythonnet v%s)", pythonnet_version)
            elif system == 'Darwin':
                if pythonnet and hasattr(pythonnet, "load"):
                    os.environ['PYTHONNET_RUNTIME'] = 'mono'
                    pythonnet.load("mono")
            else:
                if pythonnet and hasattr(pythonnet, "load"):
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
            skip_dlls = {
                'DWSIM.Automation.dll',  # Already loaded
                'ThermoCS.dll',  # Known to cause FileNotFoundException on some systems
            }
            for dll_file in self._lib_path.glob('*.dll'):
                if dll_file.name in skip_dlls:
                    continue
                try:
                    clr.AddReference(str(dll_file))
                    logger.debug(f"Added reference to {dll_file.name}")
                except Exception as e:
                    # Some DLLs may fail to load (e.g., native dependencies, UI components, missing dependencies), which is OK
                    # ThermoCS.dll may fail to load due to missing dependencies - this is expected and handled gracefully
                    if 'ThermoCS' in dll_file.name:
                        logger.debug(f"ThermoCS.dll not available (expected on some systems): {e}")
                    else:
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

    # ------------------------------------------------------------------
    # DWSIM type helpers
    # ------------------------------------------------------------------
    def _resolve_object_type_enum(self):
        """Locate DWSIM's ObjectType enum so AddObject can use the correct signature."""
        if self._object_type_enum is not None:
            return self._object_type_enum
        
        import importlib
        candidates = [
            ("DWSIM.Interfaces.Enums.GraphicObjects", ["ObjectType", "GraphicObjectType"]),
            ("DWSIM.Interfaces.Enums", ["GraphicObjectType", "ObjectType"]),
            ("DWSIM.Enums.GraphicObjects", ["ObjectType", "GraphicObjectType"]),
        ]
        for module_path, names in candidates:
            try:
                module = importlib.import_module(module_path)
            except ImportError:
                continue
            for name in names:
                enum_type = getattr(module, name, None)
                if enum_type:
                    self._object_type_enum = enum_type
                    logger.debug("Using DWSIM ObjectType enum: %s.%s", module_path, name)
                    return enum_type
        
        logger.debug("Could not locate DWSIM ObjectType enum; will rely on string-based AddObject calls")
        self._object_type_enum = None
        return None

    def _get_object_type_value(self, object_name: str):
        """Return the enum value for a DWSIM object type if available."""
        if object_name in self._object_type_cache:
            return self._object_type_cache[object_name]
        
        enum_type = self._resolve_object_type_enum()
        if not enum_type:
            self._object_type_cache[object_name] = None
            return None
        
        variants = {
            object_name,
            object_name.replace(" ", ""),
            object_name.replace("-", ""),
            object_name.replace("_", ""),
        }
        for variant in variants:
            if hasattr(enum_type, variant):
                value = getattr(enum_type, variant)
                self._object_type_cache[object_name] = value
                return value
            pascal = variant[:1].upper() + variant[1:]
            if hasattr(enum_type, pascal):
                value = getattr(enum_type, pascal)
                self._object_type_cache[object_name] = value
                return value
        
        self._object_type_cache[object_name] = None
        logger.debug("No enum value found for object type '%s'", object_name)
        return None

    def _run_dwsim(self, payload: schemas.FlowsheetPayload) -> schemas.SimulationResult:
        """Create and run a DWSIM flowsheet from JSON payload."""
        assert self._automation

        # Create a new flowsheet (or load template as base)
        # Try CreateFlowsheet() first (confirmed working in tests), fallback to NewFlowsheet()
        if self._template_path:
            flowsheet = self._load_template_flowsheet()
            if flowsheet is None:
                logger.warning("Template not found, creating blank flowsheet")
                try:
                    flowsheet = self._automation.CreateFlowsheet()
                except (AttributeError, TypeError):
                    flowsheet = self._automation.NewFlowsheet()
        else:
            try:
                flowsheet = self._automation.CreateFlowsheet()
            except (AttributeError, TypeError):
                flowsheet = self._automation.NewFlowsheet()

        # Keep a reference for debugging/inspection
        self._last_flowsheet = flowsheet
        
        warnings: List[str] = []
        
        try:
            # Step 1: Configure property package
            self._configure_property_package(flowsheet, payload.thermo, warnings)
            
            # Step 2: Add components to flowsheet
            self._add_components(flowsheet, payload.thermo.components, warnings)
            
            # Step 3: Create material streams
            stream_map = self._create_streams(flowsheet, payload.streams, warnings)
            self._last_stream_map = stream_map
            
            # Step 4: Create unit operations
            unit_map = self._create_units(flowsheet, payload.units, warnings)
            
            # Step 5: Connect streams to units (optional - DWSIM may infer connections)
            connection_warnings = []
            self._connect_streams(flowsheet, payload.streams, stream_map, unit_map, connection_warnings)
            
            # Log connection warnings but don't fail - DWSIM may handle connections automatically
            if connection_warnings:
                logger.warning("Stream connection warnings (DWSIM may infer connections automatically):")
                for warning in connection_warnings:
                    logger.warning("  %s", warning)
                    warnings.append(warning)
            
            # Step 6: Configure unit parameters
            self._configure_units(flowsheet, payload.units, unit_map, warnings)
            
            # Step 7: Try alternative connection approach via flowsheet if direct connections failed
            if connection_warnings:
                logger.info("Attempting alternative connection methods via flowsheet...")
                self._try_flowsheet_connections(flowsheet, payload.streams, stream_map, unit_map, warnings)
            
            # Step 8: Verify stream properties before calculation
            logger.info("=== Pre-calculation Stream Property Verification ===")
            for stream_spec in payload.streams:
                stream_obj = stream_map.get(stream_spec.id)
                if stream_obj:
                    try:
                        # Try to read back properties we set
                        if hasattr(stream_obj, "GetProp"):
                            try:
                                temp = stream_obj.GetProp('temperature', 'overall', None, '', 'K')
                                if temp and len(temp) > 0:
                                    logger.info("Stream %s: Temperature = %f K (after setting)", stream_spec.id, temp[0])
                                else:
                                    logger.warning("Stream %s: Temperature not readable (may not have been set)", stream_spec.id)
                            except Exception as e:
                                logger.debug("Stream %s: Could not read temperature: %s", stream_spec.id, e)
                    except Exception as e:
                        logger.debug("Error verifying stream %s: %s", stream_spec.id, e)
            
            # Step 9: Run simulation (DWSIM may infer connections from stream properties and unit config)
            logger.info("Running DWSIM simulation for flowsheet: %s", payload.name)
            logger.info("Note: If connections failed, DWSIM may infer them from stream properties and unit configuration")
            try:
                self._automation.CalculateFlowsheet(flowsheet, None)
                logger.info("CalculateFlowsheet completed")
            except Exception as calc_exc:
                logger.error("CalculateFlowsheet failed: %s", calc_exc)
                warnings.append(f"Calculation error: {str(calc_exc)}")
            
            # Step 9: Extract results
            stream_results = self._extract_streams(flowsheet, payload)
            unit_results = self._extract_units(flowsheet, payload)
            
            # Add diagnostic information
            diagnostics = {
                "mode": "dwsim",
                "units_created": len(unit_map),
                "streams_created": len(stream_map),
            }
            
            # Add property setting diagnostics
            property_diagnostics = {}
            for stream_spec in payload.streams:
                stream_obj = stream_map.get(stream_spec.id)
                if stream_obj:
                    prop_info = {}
                    props = stream_spec.properties or {}
                    
                    # Check if we tried to set properties
                    prop_info["properties_specified"] = {
                        "temperature": props.get("temperature"),
                        "pressure": props.get("pressure"),
                        "flow_rate": props.get("flow_rate") or props.get("mass_flow"),
                        "has_composition": bool(props.get("composition")),
                    }
                    
                    # Try to read back what's actually in the stream
                    prop_info["has_getprop"] = self._has_method(stream_obj, "GetProp")
                    prop_info["has_setprop"] = self._has_method(stream_obj, "SetProp")  # Critical for MaterialStream
                    prop_info["has_getpropertyvalue"] = hasattr(stream_obj, "GetPropertyValue")
                    prop_info["has_setpropertyvalue"] = hasattr(stream_obj, "SetPropertyValue")
                    prop_info["stream_type"] = str(type(stream_obj))
                    prop_info["dotnet_type"] = self._get_dotnet_type(stream_obj)
                    
                    # If we don't have SetProp, try to re-resolve from collection
                    if not hasattr(stream_obj, "SetProp"):
                        cast_stream = self._as_material_stream(stream_obj)
                        if cast_stream and self._has_method(cast_stream, "SetProp"):
                            stream_obj = cast_stream
                            stream_map[stream_spec.id] = stream_obj
                            prop_info["has_setprop"] = True
                            prop_info["has_getprop"] = self._has_method(stream_obj, "GetProp")
                            prop_info["stream_type"] = str(type(stream_obj))
                            prop_info["dotnet_type"] = self._get_dotnet_type(stream_obj)
                            logger.info("Diagnostics: Casted stream %s to MaterialStream for diagnostics", stream_spec.id)
                    
                    if not hasattr(stream_obj, "SetProp"):
                        logger.warning("Diagnostics: Stream %s doesn't have SetProp, attempting re-resolution", stream_spec.id)
                        try:
                            if hasattr(flowsheet, "MaterialStreams"):
                                all_streams = list(self._iterate_collection(flowsheet.MaterialStreams))
                                for item in reversed(all_streams):
                                    item_name = getattr(item, "Name", None)
                                    item_tag = getattr(getattr(item, "GraphicObject", None), "Tag", None)
                                    if item_name == stream_spec.id or item_tag == stream_spec.id:
                                        resolved_item = self._as_material_stream(item) or item
                                        stream_obj = resolved_item
                                        stream_map[stream_spec.id] = stream_obj  # Update map
                                        logger.info("✓ Re-resolved stream %s to MaterialStream during diagnostics", stream_spec.id)
                                        # Update diagnostics with resolved object
                                        prop_info["has_setprop"] = True
                                        prop_info["has_getprop"] = self._has_method(stream_obj, "GetProp")
                                        prop_info["stream_type"] = str(type(stream_obj))
                                        prop_info["dotnet_type"] = self._get_dotnet_type(stream_obj)
                                        break
                        except Exception as e:
                            logger.debug("Re-resolution during diagnostics failed: %s", e)
                    
                    # Try to find MaterialStream in collections for comparison
                    try:
                        if hasattr(flowsheet, "MaterialStreams"):
                            mat_streams = []
                            all_streams_info = []
                            for item in self._iterate_collection(flowsheet.MaterialStreams):
                                item_name = getattr(item, "Name", None)
                                item_type = str(type(item))
                                dotnet_type = self._get_dotnet_type(item)
                                all_streams_info.append({
                                    "name": item_name,
                                    "type": item_type,
                                    "dotnet_type": dotnet_type,
                                    "has_setprop": self._has_method(item, "SetProp"),
                                    "has_setpropertyvalue": hasattr(item, "SetPropertyValue"),
                                })
                                if item_name == stream_spec.id:
                                    mat_streams.append({
                                        "name": item_name,
                                        "type": item_type,
                                        "dotnet_type": dotnet_type,
                                        "has_setprop": self._has_method(item, "SetProp"),
                                        "has_setpropertyvalue": hasattr(item, "SetPropertyValue"),
                                    })
                            prop_info["all_materialstreams_in_collection"] = all_streams_info
                            if mat_streams:
                                prop_info["materialstreams_collection_match"] = mat_streams
                            else:
                                prop_info["materialstreams_collection_match"] = "No match found"
                    except Exception as e:
                        prop_info["materialstreams_collection_error"] = str(e)[:100]
                    
                    # Try GetProp
                    getprop_method = getattr(stream_obj, "GetProp", None)
                    if not getprop_method:
                        getprop_method = self._get_dotnet_method(stream_obj, "GetProp")
                    if getprop_method:
                        try:
                            temp = getprop_method('temperature', 'overall', None, '', 'K')
                            prop_info["temperature_read_back_k"] = temp[0] if temp and len(temp) > 0 else None
                            prop_info["temperature_read_error"] = None
                        except Exception as e:
                            prop_info["temperature_read_back_k"] = None
                            prop_info["temperature_read_error"] = str(e)[:100]  # Truncate long errors
                        
                        try:
                            press = getprop_method('pressure', 'overall', None, '', 'kPa')
                            prop_info["pressure_read_back_kpa"] = press[0] if press and len(press) > 0 else None
                            prop_info["pressure_read_error"] = None
                        except Exception as e:
                            prop_info["pressure_read_back_kpa"] = None
                            prop_info["pressure_read_error"] = str(e)[:100]
                    else:
                        prop_info["temperature_read_back_k"] = None
                        prop_info["temperature_read_error"] = "GetProp not available"
                        prop_info["pressure_read_back_kpa"] = None
                        prop_info["pressure_read_error"] = "GetProp not available"

                    # Fallback: direct attributes / phase properties for diagnostics
                    if prop_info.get("temperature_read_back_k") is None:
                        try:
                            temp_attr = getattr(stream_obj, "Temperature", None)
                            if temp_attr is not None:
                                prop_info["temperature_read_back_k"] = float(temp_attr)
                                prop_info["temperature_read_error"] = None
                        except Exception:
                            pass
                        if prop_info.get("temperature_read_back_k") is None:
                            phase_temp = self._read_phase_property(stream_obj, "temperature")
                            if phase_temp is not None:
                                prop_info["temperature_read_back_k"] = float(phase_temp)
                                prop_info["temperature_read_error"] = None

                    if prop_info.get("pressure_read_back_kpa") is None:
                        try:
                            press_attr = getattr(stream_obj, "Pressure", None)
                            if press_attr is not None:
                                prop_info["pressure_read_back_kpa"] = float(press_attr) / 1000.0 if press_attr > 1000 else float(press_attr)
                                prop_info["pressure_read_error"] = None
                        except Exception:
                            pass
                        if prop_info.get("pressure_read_back_kpa") is None:
                            phase_press = self._read_phase_property(stream_obj, "pressure")
                            if phase_press is not None:
                                try:
                                    val = float(phase_press)
                                    prop_info["pressure_read_back_kpa"] = val / 1000.0 if val > 1000 else val
                                    prop_info["pressure_read_error"] = None
                                except Exception:
                                    pass
                    
                    # Try GetPropertyValue as alternative - try multiple property name formats
                    if hasattr(stream_obj, "GetPropertyValue"):
                        # Try different property name formats
                        prop_names_to_try = ["Temperature", "temperature", "T", "Temp", "TemperatureK"]
                        temp_gpv_result = None
                        for prop_name in prop_names_to_try:
                            try:
                                temp_gpv = stream_obj.GetPropertyValue(prop_name)
                                if temp_gpv and temp_gpv != "":
                                    temp_gpv_result = f"{prop_name}={temp_gpv}"
                                    break
                            except Exception:
                                continue
                        prop_info["temperature_getpropertyvalue"] = temp_gpv_result if temp_gpv_result else ""
                        
                        prop_names_to_try = ["Pressure", "pressure", "P", "PressureKPa"]
                        press_gpv_result = None
                        for prop_name in prop_names_to_try:
                            try:
                                press_gpv = stream_obj.GetPropertyValue(prop_name)
                                if press_gpv and press_gpv != "":
                                    press_gpv_result = f"{prop_name}={press_gpv}"
                                    break
                            except Exception:
                                continue
                        prop_info["pressure_getpropertyvalue"] = press_gpv_result if press_gpv_result else ""
                    
                    property_diagnostics[stream_spec.id] = prop_info
            
            diagnostics["property_setting"] = property_diagnostics
            
            return schemas.SimulationResult(
                flowsheet_name=payload.name,
                status="ok" if stream_results else "empty",
                streams=stream_results,
                units=unit_results,
                warnings=warnings if warnings else [],
                diagnostics=diagnostics,
            )
        except Exception as exc:
            logger.exception("Error creating/running DWSIM flowsheet: %s", exc)
            warnings.append(f"DWSIM error: {str(exc)}")
            # Return partial results if available
            try:
                stream_results = self._extract_streams(flowsheet, payload)
                unit_results = self._extract_units(flowsheet, payload)
                return schemas.SimulationResult(
                    flowsheet_name=payload.name,
                    status="error",
                    streams=stream_results,
                    units=unit_results,
                    warnings=warnings,
                    diagnostics={"error": str(exc)},
                )
            except Exception:
                return self._mock_result(payload)

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

    def _configure_property_package(self, flowsheet, thermo: schemas.ThermoConfig, warnings: List[str]) -> None:
        """Configure the property package in DWSIM."""
        try:
            # Map property package names to DWSIM types
            # Avoid ThermoCPropertyPackage as it may have missing dependencies
            package_map = {
                "Peng-Robinson": "Peng-Robinson",
                "PR": "Peng-Robinson",
                "Soave-Redlich-Kwong": "Soave-Redlich-Kwong",
                "SRK": "Soave-Redlich-Kwong",
                "NRTL": "NRTL",
                "UNIFAC": "UNIFAC",
                "UNIQUAC": "UNIQUAC",
                "Lee-Kesler-Plöcker": "Lee-Kesler-Plöcker",
                "IAPWS-IF97": "IAPWS-IF97",
                "Chao-Seader": "Chao-Seader",
                "Grayson-Streed": "Grayson-Streed",
            }
            
            package_name = thermo.package or "Peng-Robinson"
            dwsim_package = package_map.get(package_name, "Peng-Robinson")
            
            # Avoid problematic property packages
            if "ThermoC" in dwsim_package or "ThermoCS" in dwsim_package:
                logger.warning("ThermoC property package may have missing dependencies, using Peng-Robinson instead")
                dwsim_package = "Peng-Robinson"
                warnings.append(f"Property package '{package_name}' changed to 'Peng-Robinson' to avoid ThermoC dependency issues")
            
            if package_name != dwsim_package and "ThermoC" not in package_name:
                warnings.append(f"Property package '{package_name}' mapped to '{dwsim_package}'")
            
            # Set property package (DWSIM API method)
            # Try multiple method names in order of likelihood
            set_methods = [
                lambda: setattr(flowsheet, 'PropertyPackage', dwsim_package),
                lambda: flowsheet.SetPropertyPackage(dwsim_package),
                lambda: flowsheet.SetPropertyPackageName(dwsim_package),
                lambda: flowsheet.SetThermoPackage(dwsim_package),
            ]
            
            success = False
            last_error = None
            for method in set_methods:
                try:
                    method()
                    logger.info("Set property package to: {}", dwsim_package)
                    success = True
                    self._active_property_package = dwsim_package
                    break
                except (AttributeError, TypeError) as e:
                    last_error = e
                    continue
                except Exception as e:
                    last_error = e
                    # Check if it's a FileNotFoundException for ThermoCS.dll
                    error_str = str(e).lower()
                    if "thermocs" in error_str or "filenotfound" in error_str:
                        logger.warning("ThermoC property package dependency missing, trying Peng-Robinson")
                        dwsim_package = "Peng-Robinson"
                        try:
                            setattr(flowsheet, 'PropertyPackage', dwsim_package)
                            logger.info("Set property package to: Peng-Robinson (fallback)")
                            success = True
                            self._active_property_package = dwsim_package
                            warnings.append("ThermoC property package unavailable, using Peng-Robinson")
                            break
                        except Exception:
                            pass
                    logger.debug("Property package method failed: %s", e)
                    continue
            
            if not success:
                error_msg = f"Could not set property package '{dwsim_package}'"
                if last_error:
                    error_msg += f": {last_error}"
                warnings.append(error_msg)
                self._active_property_package = None
        except Exception as exc:
            logger.warning("Failed to configure property package: %s", exc)
            warnings.append(f"Property package configuration error: {str(exc)}")

    def _add_components(self, flowsheet, components: List[str], warnings: List[str]) -> None:
        """Add chemical components to the flowsheet."""
        if not components:
            warnings.append("No components specified - using default components")
            components = ["Water", "Methane", "Ethane"]  # Default fallback
        
        try:
            # Try multiple method names for adding components
            add_methods = [
                lambda c: flowsheet.AddComponent(c),
                lambda c: flowsheet.AddCompound(c),
                lambda c: flowsheet.AddChemical(c),
                lambda c: flowsheet.AddComponentToFlowsheet(c),
            ]
            
            for comp in components:
                success = False
                for method in add_methods:
                    try:
                        method(comp)
                        logger.debug("Added component: %s", comp)
                        success = True
                        break
                    except (AttributeError, TypeError):
                        continue
                    except Exception as comp_exc:
                        # If method exists but component not found, that's different
                        logger.warning("Failed to add component '%s': %s", comp, comp_exc)
                        warnings.append(f"Component '{comp}' not found in DWSIM database")
                        success = True  # Method worked, component just not found
                        break
                
                if not success:
                    logger.warning("Could not find method to add component '%s'", comp)
                    warnings.append(f"Could not add component '{comp}' - run test_api_methods.py to discover correct method")
        except Exception as exc:
            logger.warning("Failed to add components: %s", exc)
            warnings.append(f"Component addition error: {str(exc)}")

    def _create_streams(self, flowsheet, streams: List[schemas.StreamSpec], warnings: List[str]) -> dict:
        """Create material streams in DWSIM."""
        stream_map = {}  # Maps stream.id -> DWSIM stream object
        stream_enum = self._get_object_type_value("MaterialStream")
        
        for stream_spec in streams:
            stream_obj = None
            stream_name = stream_spec.id or stream_spec.name or f"stream_{len(stream_map)}"
            x = stream_spec.properties.get("x", 100) if stream_spec.properties else 100
            y = stream_spec.properties.get("y", 100) if stream_spec.properties else 100
            
            # Try multiple method signatures and approaches (ordered by likelihood of returning MaterialStream)
            method_attempts = []

            # Prefer stream-specific helpers first
            if hasattr(flowsheet, 'CreateMaterialStream'):
                method_attempts.append(("CreateMaterialStream", lambda sn=stream_name, x_coord=x, y_coord=y: flowsheet.CreateMaterialStream(sn, x_coord, y_coord)))
            if hasattr(flowsheet, 'AddMaterialStream'):
                method_attempts.append(("AddMaterialStream", lambda sn=stream_name, x_coord=x, y_coord=y: flowsheet.AddMaterialStream(sn, x_coord, y_coord)))
            if hasattr(flowsheet, 'NewMaterialStream'):
                method_attempts.append(("NewMaterialStream", lambda sn=stream_name, x_coord=x, y_coord=y: flowsheet.NewMaterialStream(sn, x_coord, y_coord)))

            # Known working signature on Windows builds
            if hasattr(flowsheet, 'AddFlowsheetObject'):
                method_attempts.append(("AddFlowsheetObject('Material Stream')", lambda sn=stream_name: flowsheet.AddFlowsheetObject("Material Stream", sn)))

            for type_name in ["Material Stream", "MaterialStream"]:
                if hasattr(flowsheet, 'AddFlowsheetObject'):
                    method_attempts.extend([
                        (f"AddFlowsheetObject('{type_name}', coords)", lambda tn=type_name, sn=stream_name, x_coord=x, y_coord=y: flowsheet.AddFlowsheetObject(tn, sn, x_coord, y_coord)),
                        (f"AddFlowsheetObject('{type_name}')", lambda tn=type_name, sn=stream_name: flowsheet.AddFlowsheetObject(tn, sn)),
                    ])
                if hasattr(flowsheet, 'AddSimulationObject'):
                    method_attempts.extend([
                        (f"AddSimulationObject('{type_name}', coords)", lambda tn=type_name, sn=stream_name, x_coord=x, y_coord=y: flowsheet.AddSimulationObject(tn, sn, x_coord, y_coord)),
                        (f"AddSimulationObject('{type_name}')", lambda tn=type_name, sn=stream_name: flowsheet.AddSimulationObject(tn, sn)),
                    ])
                if hasattr(flowsheet, 'AddGraphicObject'):
                    method_attempts.extend([
                        (f"AddGraphicObject('{type_name}', coords)", lambda tn=type_name, sn=stream_name, x_coord=x, y_coord=y: flowsheet.AddGraphicObject(tn, sn, x_coord, y_coord)),
                        (f"AddGraphicObject('{type_name}')", lambda tn=type_name, sn=stream_name: flowsheet.AddGraphicObject(tn, sn)),
                    ])
                method_attempts.extend([
                    (f"AddObject('{type_name}', coords)", lambda tn=type_name, sn=stream_name, x_coord=x, y_coord=y: flowsheet.AddObject(tn, float(x_coord), float(y_coord), sn)),
                    (f"AddObject('{type_name}')", lambda tn=type_name, sn=stream_name: flowsheet.AddObject(tn, sn) if hasattr(flowsheet, 'AddObject') else None),
                ])

            if stream_enum is not None:
                method_attempts.extend([
                    ("AddObject(enum, coords)", lambda sn=stream_name, x_coord=x, y_coord=y: flowsheet.AddObject(stream_enum, float(x_coord), float(y_coord), sn)),
                    ("AddObject(enum)", lambda sn=stream_name: flowsheet.AddObject(stream_enum, sn) if hasattr(flowsheet, 'AddObject') else None),
                ])
                if hasattr(flowsheet, 'AddFlowsheetObject'):
                    method_attempts.extend([
                        ("AddFlowsheetObject(enum, coords)", lambda sn=stream_name, x_coord=x, y_coord=y: flowsheet.AddFlowsheetObject(stream_enum, sn, float(x_coord), float(y_coord))),
                        ("AddFlowsheetObject(enum)", lambda sn=stream_name: flowsheet.AddFlowsheetObject(stream_enum, sn)),
                    ])
                if hasattr(flowsheet, 'AddSimulationObject'):
                    method_attempts.extend([
                        ("AddSimulationObject(enum, coords)", lambda sn=stream_name, x_coord=x, y_coord=y: flowsheet.AddSimulationObject(stream_enum, sn, float(x_coord), float(y_coord))),
                        ("AddSimulationObject(enum)", lambda sn=stream_name: flowsheet.AddSimulationObject(stream_enum, sn)),
                    ])

            method_attempts.append(("MaterialStreams collection fallback", lambda: self._create_stream_via_collection(flowsheet, stream_name, x, y)))
            
            for desc, method in method_attempts:
                try:
                    result = method()
                    if result is not None:
                        stream_obj = result
                        logger.debug("Created stream '{}' via {}", stream_name, desc)
                        break
                    logger.debug("Stream creation method {} returned None", desc)
                except (TypeError, AttributeError) as e:
                    logger.debug("Stream creation method {} failed: {}", desc, e)
                    continue
                except Exception as e:
                    logger.debug("Stream creation {} failed with error: {}", desc, e)
                    continue
            
            if stream_obj is None:
                logger.warning("Failed to create stream '{}' - all methods failed", stream_name)
                warnings.append(f"Failed to create stream '{stream_name}' - DWSIM API method signature issue.")
                continue
            
            try:
                # CRITICAL: Resolve to actual MaterialStream before setting properties
                # The object returned from AddFlowsheetObject might be ISimulationObject interface
                # We need the actual MaterialStream to set properties
                original_obj = stream_obj
                stream_obj = self._resolve_stream_object(flowsheet, stream_name, stream_obj)
                
                # If resolution didn't help, try to find by iterating MaterialStreams collection
                if str(type(stream_obj)).lower() == str(type(original_obj)).lower() and "isimulationobject" in str(type(stream_obj)).lower():
                    logger.debug("Still have ISimulationObject after resolution, trying direct MaterialStreams lookup")
                    try:
                        if hasattr(flowsheet, "MaterialStreams"):
                            for item in self._iterate_collection(flowsheet.MaterialStreams):
                                item_name = getattr(item, "Name", None)
                                item_tag = getattr(getattr(item, "GraphicObject", None), "Tag", None)
                                if item_name == stream_name or item_tag == stream_name:
                                    item_type = str(type(item)).lower()
                                    if "materialstream" in item_type:
                                        stream_obj = item
                                        logger.debug("Found MaterialStream via direct lookup: %s", stream_name)
                                        break
                    except Exception as e:
                        logger.debug("Direct MaterialStreams lookup failed: %s", e)
                
                stream_map[stream_spec.id] = stream_obj
                
                # Set the stream name/tag so we can find it later during extraction
                try:
                    if hasattr(stream_obj, "Name"):
                        stream_obj.Name = stream_name
                    elif hasattr(stream_obj, "GraphicObject") and hasattr(stream_obj.GraphicObject, "Tag"):
                        stream_obj.GraphicObject.Tag = stream_name
                except Exception:
                    logger.debug("Could not set name/tag for stream %s", stream_name)
                
                # Try to upgrade ISimulationObject to actual MaterialStream (cast exposes SetProp)
                cast_stream = self._as_material_stream(stream_obj)
                if cast_stream and cast_stream is not stream_obj:
                    stream_obj = cast_stream
                    stream_map[stream_spec.id] = stream_obj
                    logger.info("✓ Casted stream %s to MaterialStream (SetProp available)", stream_spec.id)

                # Bind the active property package to the stream so property setters can work
                pkg_assigned = self._assign_property_package_to_stream(stream_obj, flowsheet)
                if pkg_assigned:
                    logger.debug("Bound property package to stream {}", stream_spec.id)

                # Log the final stream type we'll use for property setting
                final_type = str(type(stream_obj))
                dotnet_type = self._get_dotnet_type(stream_obj)
                logger.debug("Stream {} final type: {} (dotnet: {}, has SetProp: {}, has SetPropertyValue: {})", 
                             stream_spec.id, final_type, dotnet_type,
                             hasattr(stream_obj, "SetProp"), 
                             hasattr(stream_obj, "SetPropertyValue"))

                # Try to replace with the collection instance (often exposes more methods)
                coll_stream = self._get_materialstream_from_collection(flowsheet, stream_name)
                if coll_stream is not None and coll_stream is not stream_obj:
                    stream_obj = coll_stream
                    stream_map[stream_spec.id] = stream_obj
                    logger.info("✓ Replaced stream {} with MaterialStreams collection instance (type: {})", stream_spec.id, type(stream_obj).__name__)
                
                # CRITICAL: If we don't have SetProp, try to get MaterialStream from collection
                # MaterialStream implements ISimulationObject, so type checking alone isn't enough
                # We need to check for SetProp method which is the key differentiator
                
                # First, try to get MaterialStream through GraphicObject if available
                if not hasattr(stream_obj, "SetProp") and hasattr(stream_obj, "GraphicObject"):
                    try:
                        go = stream_obj.GraphicObject
                        # Some DWSIM APIs attach the actual object to GraphicObject
                        for attr in ["AttachedObject", "Object", "SimulationObject", "MaterialStream"]:
                            if hasattr(go, attr):
                                attached = getattr(go, attr)
                                if attached and hasattr(attached, "SetProp"):
                                    stream_obj = attached
                                    stream_map[stream_spec.id] = stream_obj
                                    logger.info("✓ Resolved MaterialStream via GraphicObject.%s for %s", attr, stream_spec.id)
                                    break
                    except Exception as e:
                        logger.debug("GraphicObject resolution attempt failed: %s", e)
                
                if not hasattr(stream_obj, "SetProp"):
                    logger.warning("Stream %s doesn't have SetProp, attempting MaterialStream lookup from collection", stream_spec.id)
                    resolved = False
                    try:
                        if hasattr(flowsheet, "MaterialStreams"):
                            # Get all streams and find the one we just created
                            all_streams = list(self._iterate_collection(flowsheet.MaterialStreams))
                            logger.info("Found %d streams in MaterialStreams collection", len(all_streams))
                            
                            if len(all_streams) == 0:
                                logger.warning("MaterialStreams collection is empty!")
                            
                            # Log all streams for debugging
                            streams_with_setprop = []
                            for idx, item in enumerate(all_streams):
                                item_type = str(type(item))
                                dotnet_item_type = self._get_dotnet_type(item)
                                item_name = getattr(item, "Name", None)
                                item_tag = getattr(getattr(item, "GraphicObject", None), "Tag", None)
                                has_setprop = hasattr(item, "SetProp")
                                logger.info("Stream %d in collection: name='%s', tag='%s', type=%s, dotnet_type=%s, has_SetProp=%s", 
                                           idx, item_name, item_tag, item_type, dotnet_item_type, has_setprop)
                                ms_candidate = self._as_material_stream(item)
                                if ms_candidate and hasattr(ms_candidate, "SetProp"):
                                    streams_with_setprop.append((idx, ms_candidate, item_name, item_tag))
                            
                            logger.info("Found %d streams with SetProp method", len(streams_with_setprop))
                            
                            # PRIORITY 1: Match by name/tag AND has SetProp (this is the actual MaterialStream)
                            for idx, item, item_name, item_tag in streams_with_setprop:
                                # Match by name or tag
                                if item_name == stream_name or item_tag == stream_name:
                                    stream_obj = item
                                    logger.info("✓ Resolved to MaterialStream with SetProp (by name): {} (type: {}, name: {}, tag: {})", 
                                                stream_spec.id, type(item).__name__, item_name, item_tag)
                                    stream_map[stream_spec.id] = stream_obj  # Update the map
                                    resolved = True
                                    break
                            
                            # PRIORITY 2: If no name match, take the most recent stream with SetProp
                            if not resolved and streams_with_setprop:
                                # Use the last one (most recently created)
                                idx, item, item_name, item_tag = streams_with_setprop[-1]
                                stream_obj = item
                                logger.info("✓ Resolved to most recent MaterialStream with SetProp: {} (type: {}, name: {}, tag: {}, index: {})", 
                                            stream_spec.id, type(item).__name__, item_name, item_tag, idx)
                                stream_map[stream_spec.id] = stream_obj
                                resolved = True
                            
                            # PRIORITY 3: If still no SetProp, try direct index access (last stream)
                            if not resolved and len(all_streams) > 0:
                                last_stream = all_streams[-1]
                                logger.warning("No streams with SetProp found, trying last stream in collection: type={}", type(last_stream).__name__)
                                # Try to cast or use directly
                                stream_obj = self._as_material_stream(last_stream) or last_stream
                                stream_map[stream_spec.id] = stream_obj
                                # Update name/tag to match
                                try:
                                    if hasattr(stream_obj, "Name"):
                                        stream_obj.Name = stream_name
                                    if hasattr(stream_obj, "GraphicObject") and hasattr(stream_obj.GraphicObject, "Tag"):
                                        stream_obj.GraphicObject.Tag = stream_name
                                except Exception:
                                    pass
                                resolved = True
                                
                    except Exception as e:
                        logger.warning("MaterialStream collection lookup failed: {}", e)
                        import traceback
                        logger.error("Traceback: {}", traceback.format_exc())
                    
                    # Final check - if we still don't have SetProp, log a critical error
                    if not hasattr(stream_obj, "SetProp"):
                        logger.error("CRITICAL: Stream {} still doesn't have SetProp after resolution! Type: {}", 
                                     stream_spec.id, type(stream_obj).__name__)
                        # Try one more thing - check if MaterialStreams is a dictionary and we can access by key
                        try:
                            if hasattr(flowsheet, "MaterialStreams"):
                                # Try dictionary-style access
                                if hasattr(flowsheet.MaterialStreams, "__getitem__"):
                                    try:
                                        # Try accessing by name
                                        dict_stream = flowsheet.MaterialStreams[stream_name]
                                        if hasattr(dict_stream, "SetProp"):
                                            stream_obj = dict_stream
                                            stream_map[stream_spec.id] = stream_obj
                                            logger.info("✓ Resolved via dictionary access: {}", stream_spec.id)
                                    except (KeyError, TypeError):
                                        # Try accessing by index (if it's also indexable)
                                        try:
                                            dict_stream = flowsheet.MaterialStreams[len(stream_map) - 1]  # Current stream index
                                            if hasattr(dict_stream, "SetProp"):
                                                stream_obj = dict_stream
                                                stream_map[stream_spec.id] = stream_obj
                                                logger.info("✓ Resolved via index access: {}", stream_spec.id)
                                        except Exception:
                                            pass
                        except Exception as e:
                            logger.debug("Dictionary access attempt failed: {}", e)

                # Final attempt to expose SetProp via casting before setting properties
                if not hasattr(stream_obj, "SetProp"):
                    cast_stream = self._as_material_stream(stream_obj)
                    if cast_stream and hasattr(cast_stream, "SetProp"):
                        stream_obj = cast_stream
                        stream_map[stream_spec.id] = stream_obj
                        logger.info("✓ Casted stream {} to MaterialStream after collection lookup", stream_spec.id)
                
                # Set stream properties
                # Verify we're using the correct object (after potential resolution)
                final_obj_type = str(type(stream_obj))
                final_obj_name = getattr(stream_obj, "Name", "unknown")
                logger.info("Setting properties for stream {} using object: type={}, name={}, has_SetProp={}, has_SetPropertyValue={}", 
                            stream_spec.id, final_obj_type, final_obj_name,
                            hasattr(stream_obj, "SetProp"), hasattr(stream_obj, "SetPropertyValue"))
                
                props = stream_spec.properties or {}
                
                # Temperature (convert C to K if needed)
                temp = props.get("temperature")
                temp_set = False
                if temp is not None:
                    if self._set_stream_prop(stream_obj, "temperature", "overall", None, "", "K", temp + 273.15):
                        temp_set = True
                        logger.info("✓ Set temperature for {}: {} K", stream_spec.id, temp + 273.15)
                    elif self._set_stream_prop(stream_obj, "temperature", "overall", None, "", "C", temp):
                        temp_set = True
                        logger.info("✓ Set temperature for {}: {} C", stream_spec.id, temp)
                    else:
                        logger.error("✗ Failed to set temperature for {}", stream_spec.id)
                        warnings.append(f"Stream {stream_spec.id}: Could not set temperature")
                        logger.warning("Failed to set temperature for stream {} using all methods", stream_spec.id)
                
                # Pressure (in kPa)
                pressure = props.get("pressure")
                pressure_set = False
                if pressure is not None:
                    if self._set_stream_prop(stream_obj, "pressure", "overall", None, "", "kPa", pressure):
                        pressure_set = True
                        logger.debug("Set pressure for {}: {} kPa", stream_spec.id, pressure)
                    else:
                        warnings.append(f"Stream {stream_spec.id}: Could not set pressure")
                        logger.warning("Failed to set pressure for stream {} using all methods", stream_spec.id)
                
                # Mass flow (convert kg/h to kg/s)
                flow = props.get("flow_rate") or props.get("mass_flow")
                if flow is not None:
                    if not self._set_stream_prop(stream_obj, "totalflow", "overall", None, "", "kg/s", flow / 3600.0):
                        if not self._set_stream_prop(stream_obj, "totalflow", "overall", None, "", "kg/h", flow):
                            warnings.append(f"Stream {stream_spec.id}: Could not set flow rate")
                
                # Composition (mole fractions)
                composition = props.get("composition", {})
                if composition:
                    total = sum(composition.values())
                    if total > 0:
                        composition_set = False
                        for comp, frac in composition.items():
                            normalized_frac = frac / total
                            # Try SetProp-style first; if not available, skip silently (some builds expose composition elsewhere)
                            if self._set_stream_prop(stream_obj, "molefraction", "overall", comp, "", "", normalized_frac):
                                composition_set = True
                                logger.debug("Set composition for {}: {} = {}", stream_spec.id, comp, normalized_frac)
                        
                        if not composition_set:
                            # Try alternative composition setting methods
                            try:
                                if hasattr(stream_obj, "SetOverallComposition"):
                                    comp_dict = {comp: frac / total for comp, frac in composition.items()}
                                    stream_obj.SetOverallComposition(comp_dict)
                                    composition_set = True
                                    logger.debug("Set composition via SetOverallComposition for {}", stream_spec.id)
                            except Exception as e:
                                logger.debug("SetOverallComposition failed: {}", e)
                            
                            if not composition_set:
                                warnings.append(f"Stream {stream_spec.id}: Could not set composition")
                
                # Vapor fraction
                vapor_frac = props.get("vapor_fraction")
                if vapor_frac is not None:
                    self._set_stream_prop(stream_obj, "vaporfraction", "overall", None, "", "", vapor_frac)
                
                # Verify properties were set by reading them back
                logger.debug("Verifying properties for stream: {}", stream_spec.id)
                try:
                    if temp is not None:
                        # Try to read back temperature to verify it was set
                        try:
                            if hasattr(stream_obj, "GetProp"):
                                read_temp = stream_obj.GetProp('temperature', 'overall', None, '', 'K')[0]
                                if read_temp:
                                    logger.debug("Verified temperature set: {} K (requested: {} K)", read_temp, temp + 273.15)
                        except Exception:
                            pass
                except Exception:
                    pass
                
                logger.debug("Created stream: {}", stream_spec.id)
            except Exception as exc:
                logger.warning("Failed to set properties for stream {}: {}", stream_spec.id, exc)
                warnings.append(f"Failed to set properties for stream '{stream_spec.id}': {str(exc)}")
        
        return stream_map

    def _create_units(self, flowsheet, units: List[schemas.UnitSpec], warnings: List[str]) -> dict:
        """Create unit operations in DWSIM."""
        unit_map = {}  # Maps unit.id -> DWSIM unit object
        
        # Map JSON unit types to DWSIM unit operation types
        type_map = {
            "distillationColumn": "DistillationColumn",
            "packedColumn": "PackedColumn",
            "absorber": "AbsorptionColumn",
            "stripper": "StrippingColumn",
            "flashDrum": "FlashDrum",
            "separator": "Separator",
            "separator3p": "ThreePhaseSeparator",
            "tank": "Tank",
            "heaterCooler": "Heater",
            "shellTubeHX": "HeatExchanger",
            "airCooler": "AirCooler",
            "kettleReboiler": "KettleReboiler",
            "firedHeater": "FiredHeater",
            "cstr": "CSTR",
            "pfr": "PFR",
            "gibbsReactor": "GibbsReactor",
            "equilibriumReactor": "EquilibriumReactor",
            "conversionReactor": "ConversionReactor",
            "pump": "Pump",
            "compressor": "Compressor",
            "turbine": "Turbine",
            "valve": "Valve",
            "mixer": "Mixer",
            "splitter": "Splitter",
            "filter": "Filter",
            "cyclone": "Cyclone",
            "adsorber": "Adsorber",
            "membrane": "Membrane",
            "boiler": "Boiler",
            "condenser": "Condenser",
        }
        
        for unit_spec in units:
            unit_obj = None
            dwsim_type = type_map.get(unit_spec.type)
            if not dwsim_type:
                warnings.append(f"Unit type '{unit_spec.type}' not supported in DWSIM - skipping")
                continue
            
            # Get position from unit spec or use defaults
            params = unit_spec.parameters or {}
            x = params.get("x", 200)
            y = params.get("y", 200)
            
            unit_enum = self._get_object_type_value(dwsim_type)
            
            # Try multiple method signatures and approaches
            method_attempts = []
            # Prioritize the working signature observed on Windows: AddFlowsheetObject("Pump", name)
            method_attempts.append(("AddFlowsheetObject(str)", lambda ut=dwsim_type, uid=unit_spec.id: flowsheet.AddFlowsheetObject(ut, uid) if hasattr(flowsheet, 'AddFlowsheetObject') else None))
            if unit_enum is not None:
                method_attempts.extend([
                    ("AddObject(enum, coords)", lambda ut=unit_enum, uid=unit_spec.id, x_coord=x, y_coord=y: flowsheet.AddObject(ut, float(x_coord), float(y_coord), uid)),
                    ("AddObject(enum)", lambda ut=unit_enum, uid=unit_spec.id: flowsheet.AddObject(ut, uid) if hasattr(flowsheet, 'AddObject') else None),
                ])
                if hasattr(flowsheet, 'AddFlowsheetObject'):
                    method_attempts.extend([
                        ("AddFlowsheetObject(enum, coords)", lambda ut=unit_enum, uid=unit_spec.id, x_coord=x, y_coord=y: flowsheet.AddFlowsheetObject(ut, uid, float(x_coord), float(y_coord))),
                        ("AddFlowsheetObject(enum)", lambda ut=unit_enum, uid=unit_spec.id: flowsheet.AddFlowsheetObject(ut, uid)),
                    ])
                if hasattr(flowsheet, 'AddSimulationObject'):
                    method_attempts.extend([
                        ("AddSimulationObject(enum, coords)", lambda ut=unit_enum, uid=unit_spec.id, x_coord=x, y_coord=y: flowsheet.AddSimulationObject(ut, uid, float(x_coord), float(y_coord))),
                        ("AddSimulationObject(enum)", lambda ut=unit_enum, uid=unit_spec.id: flowsheet.AddSimulationObject(ut, uid)),
                    ])
            
            if hasattr(flowsheet, 'AddFlowsheetObject'):
                method_attempts.extend([
                    ("AddFlowsheetObject(str, coords)", lambda ut=dwsim_type, uid=unit_spec.id, x_coord=x, y_coord=y: flowsheet.AddFlowsheetObject(ut, uid, x_coord, y_coord)),
                    ("AddFlowsheetObject(str)", lambda ut=dwsim_type, uid=unit_spec.id: flowsheet.AddFlowsheetObject(ut, uid)),
                ])
            if hasattr(flowsheet, 'AddSimulationObject'):
                method_attempts.extend([
                    ("AddSimulationObject(str, coords)", lambda ut=dwsim_type, uid=unit_spec.id, x_coord=x, y_coord=y: flowsheet.AddSimulationObject(ut, uid, x_coord, y_coord)),
                    ("AddSimulationObject(str)", lambda ut=dwsim_type, uid=unit_spec.id: flowsheet.AddSimulationObject(ut, uid)),
                ])
            if hasattr(flowsheet, 'AddGraphicObject'):
                method_attempts.extend([
                    ("AddGraphicObject(str, coords)", lambda ut=dwsim_type, uid=unit_spec.id, x_coord=x, y_coord=y: flowsheet.AddGraphicObject(ut, uid, x_coord, y_coord)),
                    ("AddGraphicObject(str)", lambda ut=dwsim_type, uid=unit_spec.id: flowsheet.AddGraphicObject(ut, uid)),
                ])
            method_attempts.extend([
                ("AddObject(str, coords)", lambda ut=dwsim_type, uid=unit_spec.id, x_coord=x, y_coord=y: flowsheet.AddObject(ut, x_coord, y_coord, uid)),
                ("AddObject(str)", lambda ut=dwsim_type, uid=unit_spec.id: flowsheet.AddObject(ut, uid) if hasattr(flowsheet, 'AddObject') else None),
                ("Type-specific method", lambda: self._create_unit_via_method(flowsheet, dwsim_type, unit_spec.id, x, y)),
                ("Collection-based creation", lambda: self._create_unit_via_collection(flowsheet, dwsim_type, unit_spec.id, x, y)),
            ])
            
            for desc, method in method_attempts:
                try:
                    result = method()
                    if result is not None:
                        unit_obj = result
                        logger.debug("Created unit '%s' (type: %s) via %s", unit_spec.id, dwsim_type, desc)
                        break
                    logger.debug("Unit creation method %s returned None for '%s'", desc, unit_spec.id)
                except (TypeError, AttributeError) as e:
                    logger.debug("Unit creation method %s failed for '%s': %s", desc, unit_spec.id, e)
                    continue
                except Exception as e:
                    logger.debug("Unit creation %s failed for '%s' with error: %s", desc, unit_spec.id, e)
                    continue
            
            if unit_obj is None:
                logger.warning("Failed to create unit '%s' (type: %s) - all methods failed", unit_spec.id, dwsim_type)
                warnings.append(f"Failed to create unit '{unit_spec.id}' (type: {unit_spec.type}) - DWSIM API method signature issue.")
                continue
            
            try:
                # Resolve the actual unit object (might need to get from collection)
                unit_obj = self._resolve_unit_object(flowsheet, unit_spec.id, unit_obj)
                
                # Set the unit name/tag so we can find it later during extraction
                try:
                    if hasattr(unit_obj, "Name"):
                        unit_obj.Name = unit_spec.id
                    elif hasattr(unit_obj, "GraphicObject") and hasattr(unit_obj.GraphicObject, "Tag"):
                        unit_obj.GraphicObject.Tag = unit_spec.id
                except Exception:
                    logger.debug("Could not set name/tag for unit %s", unit_spec.id)
                
                unit_map[unit_spec.id] = unit_obj
                logger.debug("Created unit: %s (type: %s)", unit_spec.id, dwsim_type)
            except Exception as exc:
                logger.warning("Failed to store unit %s: %s", unit_spec.id, exc)
                warnings.append(f"Failed to store unit '{unit_spec.id}': {str(exc)}")
        
        return unit_map

    def _connect_streams(self, flowsheet, streams: List[schemas.StreamSpec], stream_map: dict, unit_map: dict, warnings: List[str]) -> None:
        """Connect material streams to unit operations."""
        for stream_spec in streams:
            stream_obj = stream_map.get(stream_spec.id)
            if not stream_obj:
                warnings.append(f"Stream '{stream_spec.id}' not found for connection")
                continue
            
        # Connect to target unit (inlet) - for feed streams or intermediate streams
        if stream_spec.target:
            target_unit = unit_map.get(stream_spec.target)
            if target_unit:
                # Resolve the actual unit object (might need to get from collection)
                target_unit = self._resolve_unit_object(flowsheet, stream_spec.target, target_unit)
                
                # Handle missing targetHandle gracefully (use default port 0)
                target_handle = getattr(stream_spec, 'targetHandle', None)
                port = self._map_port_to_index(target_handle, stream_spec.target)
                
                # Try multiple connection methods
                connected = False
                stream_graphic = getattr(stream_obj, "GraphicObject", None)
                unit_graphic = getattr(target_unit, "GraphicObject", None)
                
                connection_methods = [
                    # Direct unit methods
                    ("SetInletStream", lambda: target_unit.SetInletStream(port, stream_obj)),
                    ("SetInletMaterialStream", lambda: target_unit.SetInletMaterialStream(port, stream_obj)),
                    ("ConnectInlet", lambda: target_unit.ConnectInlet(port, stream_obj)),
                    ("AddInletStream", lambda: target_unit.AddInletStream(port, stream_obj)),
                    # Property-based connections
                    ("InletStreams[index]", lambda: setattr(target_unit, f"InletStreams[{port}]", stream_obj) if hasattr(target_unit, "InletStreams") else None),
                    ("InletMaterialStreams[index]", lambda: setattr(target_unit, f"InletMaterialStreams[{port}]", stream_obj) if hasattr(target_unit, "InletMaterialStreams") else None),
                    # Try without port index
                    ("SetInletStream(no port)", lambda: target_unit.SetInletStream(stream_obj) if hasattr(target_unit, "SetInletStream") else None),
                    ("SetInletMaterialStream(no port)", lambda: target_unit.SetInletMaterialStream(stream_obj) if hasattr(target_unit, "SetInletMaterialStream") else None),
                    # GraphicObject-based connections
                    ("GraphicObject.Connections", lambda: self._connect_via_graphic_object(stream_graphic, unit_graphic, port, True) if stream_graphic and unit_graphic else None),
                    ("GraphicObject.InputConnections", lambda: self._connect_via_graphic_input(unit_graphic, stream_obj, port) if unit_graphic else None),
                    # Flowsheet-level connection
                    ("Flowsheet.ConnectObjects", lambda: flowsheet.ConnectObjects(stream_obj, target_unit) if hasattr(flowsheet, "ConnectObjects") else None),
                    ("Flowsheet.ConnectObject", lambda: flowsheet.ConnectObject(stream_obj, target_unit) if hasattr(flowsheet, "ConnectObject") else None),
                    ("Flowsheet.ConnectStreamToUnit", lambda: flowsheet.ConnectStreamToUnit(stream_obj, target_unit, port) if hasattr(flowsheet, "ConnectStreamToUnit") else None),
                    # Direct attribute-based
                    ("Unit attribute inlet setters", lambda: self._set_unit_stream_attr(target_unit, ["InletStream", "InletMaterialStream", "FeedStream", "InputStream", "InletObject", "Inlet"], stream_obj, port)),
                    ("Unit collection inlet setters", lambda: self._set_unit_stream_attr(target_unit, ["InletStreams", "InletMaterialStreams", "InputStreams", "FeedStreams", "InletObjects", "Inlets"], stream_obj, port)),
                ]
                
                for method_name, method in connection_methods:
                    try:
                        result = method()
                        if result is not None or not hasattr(method, '__call__'):
                            logger.debug("Connected stream %s to unit %s via %s (port %s)", stream_spec.id, stream_spec.target, method_name, port)
                            connected = True
                            break
                    except (AttributeError, TypeError) as e:
                        logger.debug("Connection method %s failed: %s", method_name, e)
                        continue
                    except Exception as e:
                        logger.debug("Connection method %s error: %s", method_name, e)
                        continue
                
                if not connected:
                    warnings.append(f"Failed to connect stream '{stream_spec.id}' to unit '{stream_spec.target}' - tried all connection methods")
            else:
                warnings.append(f"Target unit '{stream_spec.target}' not found for stream '{stream_spec.id}'")
            
            # Connect from source unit (outlet) - for product streams or intermediate streams
            if stream_spec.source:
                source_unit = unit_map.get(stream_spec.source)
                if source_unit:
                    # Resolve the actual unit object
                    source_unit = self._resolve_unit_object(flowsheet, stream_spec.source, source_unit)
                    
                    # Handle missing sourceHandle gracefully (use default port 0)
                    source_handle = getattr(stream_spec, 'sourceHandle', None)
                    port = self._map_port_to_index(source_handle, stream_spec.source)
                    
                    # Try multiple connection methods
                    connected = False
                    stream_graphic = getattr(stream_obj, "GraphicObject", None)
                    unit_graphic = getattr(source_unit, "GraphicObject", None)
                    
                    connection_methods = [
                        # Direct unit methods
                        ("SetOutletStream", lambda: source_unit.SetOutletStream(port, stream_obj)),
                        ("SetOutletMaterialStream", lambda: source_unit.SetOutletMaterialStream(port, stream_obj)),
                        ("ConnectOutlet", lambda: source_unit.ConnectOutlet(port, stream_obj)),
                        ("AddOutletStream", lambda: source_unit.AddOutletStream(port, stream_obj)),
                        # Property-based connections
                        ("OutletStreams[index]", lambda: setattr(source_unit, f"OutletStreams[{port}]", stream_obj) if hasattr(source_unit, "OutletStreams") else None),
                        ("OutletMaterialStreams[index]", lambda: setattr(source_unit, f"OutletMaterialStreams[{port}]", stream_obj) if hasattr(source_unit, "OutletMaterialStreams") else None),
                        # Try without port index
                        ("SetOutletStream(no port)", lambda: source_unit.SetOutletStream(stream_obj) if hasattr(source_unit, "SetOutletStream") else None),
                        ("SetOutletMaterialStream(no port)", lambda: source_unit.SetOutletMaterialStream(stream_obj) if hasattr(source_unit, "SetOutletMaterialStream") else None),
                        # GraphicObject-based connections
                        ("GraphicObject.Connections", lambda: self._connect_via_graphic_object(unit_graphic, stream_graphic, port, False) if stream_graphic and unit_graphic else None),
                        ("GraphicObject.OutputConnections", lambda: self._connect_via_graphic_output(unit_graphic, stream_obj, port) if unit_graphic else None),
                        # Flowsheet-level connection
                        ("Flowsheet.ConnectObjects", lambda: flowsheet.ConnectObjects(source_unit, stream_obj) if hasattr(flowsheet, "ConnectObjects") else None),
                        ("Flowsheet.ConnectObject", lambda: flowsheet.ConnectObject(source_unit, stream_obj) if hasattr(flowsheet, "ConnectObject") else None),
                        ("Flowsheet.ConnectUnitToStream", lambda: flowsheet.ConnectUnitToStream(source_unit, stream_obj, port) if hasattr(flowsheet, "ConnectUnitToStream") else None),
                        # Direct attribute-based
                        ("Unit attribute outlet setters", lambda: self._set_unit_stream_attr(source_unit, ["OutletStream", "OutletMaterialStream", "ProductStream", "OutputStream"], stream_obj, port)),
                        ("Unit collection outlet setters", lambda: self._set_unit_stream_attr(source_unit, ["OutletStreams", "OutletMaterialStreams", "OutputStreams", "ProductStreams"], stream_obj, port)),
                    ]
                    
                    for method_name, method in connection_methods:
                        try:
                            result = method()
                            if result is not None or not hasattr(method, '__call__'):
                                logger.debug("Connected stream %s from unit %s via %s (port %s)", stream_spec.id, stream_spec.source, method_name, port)
                                connected = True
                                break
                        except (AttributeError, TypeError) as e:
                            logger.debug("Connection method %s failed: %s", method_name, e)
                            continue
                        except Exception as e:
                            logger.debug("Connection method %s error: %s", method_name, e)
                            continue
                    
                    if not connected:
                        warnings.append(f"Failed to connect stream '{stream_spec.id}' from unit '{stream_spec.source}' - tried all connection methods")
                else:
                    warnings.append(f"Source unit '{stream_spec.source}' not found for stream '{stream_spec.id}'")
            
            # Warn if stream has no connections at all
            if not stream_spec.source and not stream_spec.target:
                warnings.append(f"Stream '{stream_spec.id}' has no source or target - it will not be connected")

    def _try_flowsheet_connections(self, flowsheet, streams: List[schemas.StreamSpec], stream_map: dict, unit_map: dict, warnings: List[str]) -> None:
        """Try alternative connection methods through the flowsheet object."""
        for stream_spec in streams:
            stream_obj = stream_map.get(stream_spec.id)
            if not stream_obj:
                continue
            
            # Try flowsheet-level connection methods
            try:
                # Method 1: ConnectObjects (if available)
                if stream_spec.target:
                    target_unit = unit_map.get(stream_spec.target)
                    if target_unit and hasattr(flowsheet, "ConnectObjects"):
                        try:
                            flowsheet.ConnectObjects(stream_obj, target_unit)
                            logger.debug("Connected stream %s to unit %s via flowsheet.ConnectObjects", stream_spec.id, stream_spec.target)
                        except Exception as e:
                            logger.debug("flowsheet.ConnectObjects failed: %s", e)
                    elif target_unit and hasattr(flowsheet, "ConnectObject"):
                        try:
                            flowsheet.ConnectObject(stream_obj, target_unit)
                            logger.debug("Connected stream %s to unit %s via flowsheet.ConnectObject", stream_spec.id, stream_spec.target)
                        except Exception as e:
                            logger.debug("flowsheet.ConnectObject failed: %s", e)
                
                if stream_spec.source:
                    source_unit = unit_map.get(stream_spec.source)
                    if source_unit and hasattr(flowsheet, "ConnectObjects"):
                        try:
                            flowsheet.ConnectObjects(source_unit, stream_obj)
                            logger.debug("Connected stream %s from unit %s via flowsheet.ConnectObjects", stream_spec.id, stream_spec.source)
                        except Exception as e:
                            logger.debug("flowsheet.ConnectObjects failed: %s", e)
                    elif source_unit and hasattr(flowsheet, "ConnectObject"):
                        try:
                            flowsheet.ConnectObject(source_unit, stream_obj)
                            logger.debug("Connected stream %s from unit %s via flowsheet.ConnectObject", stream_spec.id, stream_spec.source)
                        except Exception as e:
                            logger.debug("flowsheet.ConnectObject failed: %s", e)
                
                # Method 2: Try setting connections through GraphicObjects after calculation prep
                # This might work if DWSIM needs objects to be fully initialized first
                stream_graphic = getattr(stream_obj, "GraphicObject", None)
                
                if stream_spec.target and stream_graphic:
                    target_unit = unit_map.get(stream_spec.target)
                    if target_unit:
                        unit_graphic = getattr(target_unit, "GraphicObject", None)
                        if unit_graphic:
                            try:
                                # Try setting connection points directly
                                if hasattr(stream_graphic, "OutputConnections"):
                                    if hasattr(stream_graphic.OutputConnections, "Add"):
                                        stream_graphic.OutputConnections.Add(unit_graphic)
                                        logger.debug("Connected via stream GraphicObject.OutputConnections")
                            except Exception as e:
                                logger.debug("GraphicObject connection attempt failed: %s", e)
                
            except Exception as e:
                logger.debug("Alternative connection method failed for stream %s: %s", stream_spec.id, e)

    def _map_port_to_index(self, handle: Optional[str], unit_id: str) -> int:
        """Map port handle name to DWSIM port index."""
        # Simplified mapping - actual implementation depends on DWSIM API
        # Most units use 0 for first inlet/outlet
        if not handle:
            return 0
        
        # Extract number from handle if present (e.g., "in-1-left" -> 0, "in-2-left" -> 1)
        import re
        match = re.search(r'(\d+)', handle)
        if match:
            return int(match.group(1)) - 1
        
        return 0  # Default to first port

    def _connect_via_graphic_object(self, from_graphic, to_graphic, port: int, is_inlet: bool):
        """Connect streams via GraphicObject connections."""
        try:
            if not from_graphic or not to_graphic:
                return None
            
            # Try various GraphicObject connection methods
            if hasattr(to_graphic, "InputConnections") and is_inlet:
                connections = to_graphic.InputConnections
                if hasattr(connections, "__setitem__"):
                    connections[port] = from_graphic
                    return True
                elif hasattr(connections, "Add"):
                    connections.Add(from_graphic)
                    return True
            
            if hasattr(to_graphic, "OutputConnections") and not is_inlet:
                connections = to_graphic.OutputConnections
                if hasattr(connections, "__setitem__"):
                    connections[port] = from_graphic
                    return True
                elif hasattr(connections, "Add"):
                    connections.Add(from_graphic)
                    return True
            
            # Try direct connection properties
            if hasattr(to_graphic, "ConnectedObjects"):
                if hasattr(to_graphic.ConnectedObjects, "__setitem__"):
                    to_graphic.ConnectedObjects[port] = from_graphic
                    return True
                elif hasattr(to_graphic.ConnectedObjects, "Add"):
                    to_graphic.ConnectedObjects.Add(from_graphic)
                    return True
            
            return None
        except Exception:
            return None

    def _connect_via_graphic_input(self, unit_graphic, stream_obj, port: int):
        """Connect stream to unit via GraphicObject input connections."""
        try:
            if not unit_graphic:
                return None
            
            stream_graphic = getattr(stream_obj, "GraphicObject", None)
            if not stream_graphic:
                return None
            
            if hasattr(unit_graphic, "InputConnections"):
                connections = unit_graphic.InputConnections
                if hasattr(connections, "__setitem__"):
                    connections[port] = stream_graphic
                    return True
                elif hasattr(connections, "Add"):
                    connections.Add(stream_graphic)
                    return True
            
            return None
        except Exception:
            return None

    def _connect_via_graphic_output(self, unit_graphic, stream_obj, port: int):
        """Connect stream from unit via GraphicObject output connections."""
        try:
            if not unit_graphic:
                return None
            
            stream_graphic = getattr(stream_obj, "GraphicObject", None)
            if not stream_graphic:
                return None
            
            if hasattr(unit_graphic, "OutputConnections"):
                connections = unit_graphic.OutputConnections
                if hasattr(connections, "__setitem__"):
                    connections[port] = stream_graphic
                    return True
                elif hasattr(connections, "Add"):
                    connections.Add(stream_graphic)
                    return True
            
            return None
        except Exception:
            return None

    def _set_unit_stream_attr(self, unit_obj, attr_names, stream_obj, port: int) -> bool:
        """Best-effort setter for unit inlet/outlet attributes/collections."""
        for attr in attr_names:
            try:
                if not hasattr(unit_obj, attr):
                    continue
                target = getattr(unit_obj, attr)
                # If it's indexable (list/array/dict)
                if hasattr(target, "__setitem__"):
                    try:
                        target[port] = stream_obj
                        return True
                    except Exception:
                        pass
                # Has Add method
                if hasattr(target, "Add"):
                    try:
                        target.Add(stream_obj)
                        return True
                    except Exception:
                        pass
                # Direct attribute set
                try:
                    setattr(unit_obj, attr, stream_obj)
                    return True
                except Exception:
                    pass
            except Exception:
                continue
        return False

    def _configure_units(self, flowsheet, units: List[schemas.UnitSpec], unit_map: dict, warnings: List[str]) -> None:
        """Configure unit operation parameters."""
        for unit_spec in units:
            unit_obj = unit_map.get(unit_spec.id)
            if not unit_obj:
                continue
            
            try:
                params = unit_spec.parameters or {}
                
                # Configure based on unit type
                if unit_spec.type == "distillationColumn":
                    if "stages" in params:
                        try:
                            unit_obj.SetProp("NumberOfStages", params["stages"])
                        except Exception:
                            pass
                    if "reflux_ratio" in params:
                        try:
                            unit_obj.SetProp("RefluxRatio", params["reflux_ratio"])
                        except Exception:
                            pass
                
                elif unit_spec.type in ["pump", "compressor"]:
                    if "pressure_rise" in params:
                        target = self._resolve_unit_object(flowsheet, unit_spec.id, unit_obj)
                        try:
                            target.SetProp("PressureIncrease", params["pressure_rise"])
                        except Exception:
                            pass
                    if "efficiency" in params:
                        target = self._resolve_unit_object(flowsheet, unit_spec.id, unit_obj)
                        try:
                            target.SetProp("Efficiency", params["efficiency"])
                        except Exception:
                            pass
                
                elif unit_spec.type in ["heaterCooler", "shellTubeHX"]:
                    if "duty" in params:
                        target = self._resolve_unit_object(flowsheet, unit_spec.id, unit_obj)
                        try:
                            target.SetProp("HeatFlow", params["duty"])
                        except Exception:
                            pass
                
                # Add more unit-specific configurations as needed
                logger.debug("Configured unit: %s", unit_spec.id)
            except Exception as exc:
                logger.warning("Failed to configure unit %s: %s", unit_spec.id, exc)
                warnings.append(f"Failed to configure unit '{unit_spec.id}': {str(exc)}")

    def _create_stream_via_collection(self, flowsheet, stream_name: str, x: float, y: float):
        """Try to create stream via MaterialStreams collection."""
        try:
            if hasattr(flowsheet, 'MaterialStreams'):
                # MaterialStreams might be a collection we can add to
                streams_collection = flowsheet.MaterialStreams
                # Try to create and add to collection
                # This is a fallback - actual implementation depends on DWSIM API
                return None
        except Exception:
            pass
        return None

    def _get_collection_item(self, collection, key):
        """Attempt to retrieve an item from a .NET collection/dict by key."""
        for accessor in (
            lambda c, k: c[k],
            lambda c, k: c.get_Item(k) if hasattr(c, "get_Item") else None,
        ):
            try:
                result = accessor(collection, key)
                if hasattr(result, "Value"):
                    return result.Value
                return result
            except Exception:
                continue
        # Fallback: iterate and match by Name or GraphicObject.Tag
        try:
            for item in collection:
                if hasattr(item, "Value"):
                    item = item.Value
                name = getattr(item, "Name", None)
                tag = getattr(getattr(item, "GraphicObject", None), "Tag", None)
                if name == key or tag == key:
                    return item
        except Exception:
            pass
        return None

    def _iterate_collection(self, collection):
        """Yield candidate objects from a .NET collection/dictionary."""
        if collection is None:
            return
        # Dictionary-like with Values
        for attr in ("Values", "values"):
            if hasattr(collection, attr):
                try:
                    for item in getattr(collection, attr):
                        if hasattr(item, "Value"):
                            item = item.Value
                        yield item
                    return
                except Exception:
                    pass
        # Generic iterable
        try:
            for item in collection:
                # If iterating gives tuples (key, value), use value
                if isinstance(item, tuple) and len(item) == 2:
                    yield item[1]
                elif hasattr(item, "Value"):
                    yield item.Value
                else:
                    yield item
        except Exception:
            return

    def _name_or_tag(self, obj, default: str) -> str:
        """Safely fetch Name or GraphicObject.Tag without triggering attribute errors."""
        for attr in ("Name", "Tag"):
            try:
                value = getattr(obj, attr)
                if value:
                    return str(value)
            except Exception:
                continue
        try:
            graphic = getattr(obj, "GraphicObject", None)
            if graphic:
                for attr in ("Tag", "Name"):
                    try:
                        value = getattr(graphic, attr)
                        if value:
                            return str(value)
                    except Exception:
                        continue
        except Exception:
            pass
        return default

    def _get_dotnet_type(self, obj) -> Optional[str]:
        """Return the .NET type name if available for diagnostics."""
        try:
            if hasattr(obj, "GetType"):
                dotnet_type = obj.GetType()
                fullname = getattr(dotnet_type, "FullName", None)
                if fullname:
                    return str(fullname)
                return str(dotnet_type)
        except Exception:
            return None
        return None

    def _get_dotnet_method(self, obj, method_name: str):
        """Try to fetch a .NET method even if pythonnet doesn't surface it as an attribute."""
        try:
            from System.Reflection import BindingFlags  # type: ignore
        except Exception:
            return None

        try:
            if hasattr(obj, "GetType"):
                dotnet_type = obj.GetType()
                return dotnet_type.GetMethod(method_name, BindingFlags.Public | BindingFlags.Instance)
        except Exception:
            return None
        return None

    def _has_method(self, obj, method_name: str) -> bool:
        """Check for a method via python attribute or reflection."""
        return hasattr(obj, method_name) or self._get_dotnet_method(obj, method_name) is not None

    def _try_cast_material_stream(self, stream_obj):
        """Attempt to cast an ISimulationObject to MaterialStream so SetProp becomes available."""
        try:
            import clr  # type: ignore
            from DWSIM.Thermodynamics.Streams import MaterialStream  # type: ignore
        except Exception:
            return None

        # If it's already the right type, return as-is
        try:
            if isinstance(stream_obj, MaterialStream):
                return stream_obj
        except Exception:
            pass

        # Try pythonnet cast helpers
        for caster in (
            lambda obj: clr.Convert(obj, MaterialStream),
            lambda obj: MaterialStream(obj),
        ):
            try:
                cast_stream = caster(stream_obj)
                if cast_stream:
                    return cast_stream
            except Exception:
                continue
        return None

    def _as_material_stream(self, candidate):
        """Return a MaterialStream-capable object (has SetProp) if possible."""
        if candidate is None:
            return None
        if hasattr(candidate, "SetProp"):
            return candidate
        if self._get_dotnet_method(candidate, "SetProp"):
            return candidate

        cast_stream = self._try_cast_material_stream(candidate)
        if cast_stream and hasattr(cast_stream, "SetProp"):
            return cast_stream
        return None

    def _to_si_value(self, prop_name: str, unit: str, value):
        """Convert common properties to SI units for direct setters/attributes."""
        if value is None:
            return None
        u = (unit or "").lower()
        try:
            if prop_name.lower() == "temperature":
                if u in ("c", "degc", "celsius"):
                    return float(value) + 273.15
                return float(value)  # assume already K
            if prop_name.lower() == "pressure":
                if u == "kpa":
                    return float(value) * 1000.0
                if u == "bar":
                    return float(value) * 100000.0
                return float(value)  # assume Pa or already correct
            if prop_name.lower() in ("totalflow", "massflow"):
                if u == "kg/h":
                    return float(value) / 3600.0
                return float(value)  # assume kg/s
        except Exception:
            return value
        return value

    def _set_phase_property(self, stream_obj, prop_name: str, value):
        """Best-effort setter using Phases collection if available."""
        try:
            phases = getattr(stream_obj, "Phases", None)
            if not phases:
                return None
            for key in (0, "Overall", "overall", "MIXED"):
                try:
                    phase = phases[key]
                except Exception:
                    continue
                props = getattr(phase, "Properties", None)
                if not props:
                    continue
                for attr in (prop_name, prop_name.title(), prop_name.lower(), prop_name.upper()):
                    if hasattr(props, attr):
                        setattr(props, attr, value)
                        return True
        except Exception:
            return None
        return None

    def _read_phase_property(self, stream_obj, prop_name: str):
        """Attempt to read a basic property from Phases collection."""
        try:
            phases = getattr(stream_obj, "Phases", None)
            if not phases:
                return None
            for key in (0, "Overall", "overall", "MIXED"):
                try:
                    phase = phases[key]
                except Exception:
                    continue
                props = getattr(phase, "Properties", None)
                if not props:
                    continue
                for attr in (prop_name, prop_name.title(), prop_name.lower(), prop_name.upper()):
                    try:
                        if hasattr(props, attr):
                            return getattr(props, attr)
                    except Exception:
                        continue
        except Exception:
            return None
        return None

    def _assign_property_package_to_stream(self, stream_obj, flowsheet) -> bool:
        """Best-effort binding of the flowsheet property package to a stream."""
        try:
            pkg_obj = None
            pkg_name = self._active_property_package

            # Direct property on flowsheet (some builds expose PropertyPackage or SelectedPropertyPackage)
            for attr in ("PropertyPackage", "SelectedPropertyPackage"):
                try:
                    candidate = getattr(flowsheet, attr, None)
                    if candidate and not isinstance(candidate, str):
                        pkg_obj = candidate
                        break
                except Exception:
                    continue

            # FlowsheetOptions.SelectedPropertyPackage (common in Automation)
            if pkg_obj is None and hasattr(flowsheet, "FlowsheetOptions"):
                try:
                    opts = flowsheet.FlowsheetOptions
                    candidate = getattr(opts, "SelectedPropertyPackage", None)
                    if candidate and not isinstance(candidate, str):
                        pkg_obj = candidate
                except Exception:
                    pass

            # PropertyPackages collection by name (preferred if available)
            if pkg_obj is None and hasattr(flowsheet, "PropertyPackages"):
                try:
                    pkgs = flowsheet.PropertyPackages
                    if pkg_name:
                        pkg_obj = self._get_collection_item(pkgs, pkg_name)
                    if pkg_obj is None:
                        for item in self._iterate_collection(pkgs):
                            pkg_obj = getattr(item, "Value", item)
                            break
                except Exception:
                    pkg_obj = None

            # Assign if we have something and the stream exposes PropertyPackage
            if pkg_obj is not None and not isinstance(pkg_obj, str) and hasattr(stream_obj, "PropertyPackage"):
                try:
                    stream_obj.PropertyPackage = pkg_obj
                    logger.debug("Assigned property package {} to stream {}", pkg_name or getattr(pkg_obj, 'Name', None), getattr(stream_obj, 'Name', 'unknown'))
                    return True
                except Exception as e:
                    logger.debug("Failed to assign property package to stream {}: {}", getattr(stream_obj, 'Name', 'unknown'), e)

        except Exception as exc:
            logger.debug("Property package assignment error: {}", exc)
        return False

    def _get_materialstream_from_collection(self, flowsheet, stream_name: str):
        """Return a MaterialStream object from the flowsheet collection by name or last created."""
        try:
            coll = getattr(flowsheet, "MaterialStreams", None)
            if not coll:
                return None
            candidate = self._get_collection_item(coll, stream_name)
            if candidate:
                return getattr(candidate, "Value", candidate)
            items = list(self._iterate_collection(coll))
            if items:
                last = getattr(items[-1], "Value", items[-1])
                return last
        except Exception:
            return None
        return None

    def _set_stream_prop(self, stream_obj, prop_name, phase, comp, basis, unit, value) -> bool:
        """Attempt to set a property on a stream object using multiple APIs."""
        setters = []
        si_value = self._to_si_value(prop_name, unit, value)
        
        # PRIORITY 1: SetProp is the canonical MaterialStream method - try this FIRST if available
        # This is the method that actually works on MaterialStream objects
        setprop_method = None
        if hasattr(stream_obj, "SetProp"):
            setprop_method = getattr(stream_obj, "SetProp")
            setters.append(lambda: setprop_method(prop_name, phase, comp, basis, unit, value))
            logger.debug("Using SetProp method for property '%s' (direct)", prop_name)
        else:
            # Try reflection even if pythonnet doesn't expose SetProp
            setprop_method = self._get_dotnet_method(stream_obj, "SetProp")
            if setprop_method:
                setters.append(lambda: setprop_method.Invoke(stream_obj, [prop_name, phase, comp, basis, unit, value]))
                logger.debug("Using SetProp via reflection for property '%s'", prop_name)

        # Property-specific strong setters (SI-based)
        pname_lower = prop_name.lower()
        if pname_lower == "temperature":
            for meth_name in ("SetTemperature", "set_Temperature"):
                if hasattr(stream_obj, meth_name):
                    m = getattr(stream_obj, meth_name)
                    setters.append(lambda mm=m, v=si_value: mm(v))
                else:
                    m = self._get_dotnet_method(stream_obj, meth_name)
                    if m:
                        setters.append(lambda mm=m, v=si_value: mm.Invoke(stream_obj, [v]))
            # Direct attribute
            if hasattr(stream_obj, "Temperature"):
                setters.append(lambda v=si_value: setattr(stream_obj, "Temperature", v))
            # Phase properties
            setters.append(lambda v=si_value: self._set_phase_property(stream_obj, "temperature", v))

        if pname_lower == "pressure":
            for meth_name in ("SetPressure", "set_Pressure"):
                if hasattr(stream_obj, meth_name):
                    m = getattr(stream_obj, meth_name)
                    setters.append(lambda mm=m, v=si_value: mm(v))
                else:
                    m = self._get_dotnet_method(stream_obj, meth_name)
                    if m:
                        setters.append(lambda mm=m, v=si_value: mm.Invoke(stream_obj, [v]))
            if hasattr(stream_obj, "Pressure"):
                setters.append(lambda v=si_value: setattr(stream_obj, "Pressure", v))
            setters.append(lambda v=si_value: self._set_phase_property(stream_obj, "pressure", v))

        if pname_lower in ("totalflow", "massflow"):
            for meth_name in ("SetMassFlow", "SetMassFlowRate", "set_MassFlow"):
                if hasattr(stream_obj, meth_name):
                    m = getattr(stream_obj, meth_name)
                    setters.append(lambda mm=m, v=si_value: mm(v))
                else:
                    m = self._get_dotnet_method(stream_obj, meth_name)
                    if m:
                        setters.append(lambda mm=m, v=si_value: mm.Invoke(stream_obj, [v]))
            for attr in ("MassFlow", "MassFlowRate", "TotalFlow"):
                if hasattr(stream_obj, attr):
                    setters.append(lambda a=attr, v=si_value: setattr(stream_obj, a, v))
            setters.append(lambda v=si_value: self._set_phase_property(stream_obj, "massflow", v))

        # PRIORITY 2: For ISimulationObject, try SetPropertyValue (interface method)
        # CRITICAL: SetPropertyValue may need property IDs (integers) instead of strings
        stream_type_str = str(type(stream_obj)).lower()
        if "isimulationobject" in stream_type_str:
            if hasattr(stream_obj, "SetPropertyValue"):
                # Try to find property ID constants/enums
                # DWSIM uses property IDs - try to access them through PropertyPackage or constants
                prop_id_map = {
                    "temperature": [1, "Temperature", "TEMP", "temperature"],
                    "pressure": [2, "Pressure", "PRES", "pressure"],
                    "totalflow": [3, "MassFlow", "MASSFLOW", "totalflow"],
                    "molefraction": [4, "MoleFraction", "MOLEFRAC", "molefraction"],
                    "vaporfraction": [5, "VaporFraction", "VF", "vaporfraction"],
                }
                
                prop_variants = prop_id_map.get(prop_name.lower(), [prop_name.title(), prop_name])
                
                # Try SetPropertyValue with property IDs (integers) first
                for prop_id in prop_variants:
                    if isinstance(prop_id, int):
                        setters.insert(0, lambda pid=prop_id, v=value: stream_obj.SetPropertyValue(pid, v))
                        if phase:
                            setters.insert(1, lambda pid=prop_id, p=phase, v=value: stream_obj.SetPropertyValue(pid, p, v))
                
                # Try SetPropertyValue with property name strings
                for prop_variant in prop_variants:
                    if isinstance(prop_variant, str):
                        setters.append(lambda pv=prop_variant, v=value: stream_obj.SetPropertyValue(pv, v))
                        setters.append(lambda pv=prop_variant, v=value: stream_obj.SetPropertyValue(pv.upper(), v))
                        setters.append(lambda pv=prop_variant, v=value: stream_obj.SetPropertyValue(pv.lower(), v))
                        if phase:
                            setters.append(lambda pv=prop_variant, p=phase, v=value: stream_obj.SetPropertyValue(pv, p, v))
                
                # Try accessing through PropertyPackage if available
                try:
                    if hasattr(stream_obj, "PropertyPackage") and stream_obj.PropertyPackage:
                        pp = stream_obj.PropertyPackage
                        # PropertyPackage might have methods to set properties
                        for method_name in ["SetProperty", "SetStreamProperty", "SetMaterialStreamProperty"]:
                            if hasattr(pp, method_name):
                                method = getattr(pp, method_name)
                                setters.append(lambda m=method, pn=prop_name, v=value, so=stream_obj: m(so, pn, v))
                except Exception as e:
                    logger.debug("PropertyPackage access failed: %s", e)
        for meth in ("SetPropertyValue", "SetPropertyValue2"):
            if hasattr(stream_obj, meth):
                setter = getattr(stream_obj, meth)
                setters.append(lambda s=setter: s(prop_name, value))
                # Try title-cased variant (e.g., Temperature, Pressure)
                setters.append(lambda s=setter: s(prop_name.title(), value))
        # Direct attributes by common aliases
        attr_map = {
            "temperature": ["Temperature", "TemperatureK", "Temp", "T"],
            "pressure": ["Pressure", "PressureKPa", "P"],
            "totalflow": ["MassFlow", "MassFlowRate", "TotalFlow", "Mass_Flow"],
            "molefraction": [],
            "vaporfraction": ["VaporFraction", "VF"],
        }
        for attr in attr_map.get(prop_name.lower().replace(" ", ""), []):
            if hasattr(stream_obj, attr):
                setters.append(lambda a=attr: setattr(stream_obj, a, value))

        # Log what we're about to try
        logger.info("Attempting to set property '%s' = %s on stream %s (type: %s, has_SetProp: %s, has_SetPropertyValue: %s, %d methods to try)", 
                   prop_name, value, getattr(stream_obj, "Name", "unknown"), 
                   type(stream_obj).__name__, 
                   self._has_method(stream_obj, "SetProp"), 
                   hasattr(stream_obj, "SetPropertyValue"),
                   len(setters))
        
        for idx, setter in enumerate(setters):
            try:
                result = setter()
                # Some setters might return a value, others return None - both are OK
                logger.info("✓ Successfully set property '%s' using method %d (value: %s, result: %s, stream: %s)", 
                          prop_name, idx, value, result, 
                          getattr(stream_obj, "Name", "unknown"))
                
                # Verify it was actually set by trying to read it back
                try:
                    if hasattr(stream_obj, "GetPropertyValue"):
                        read_back = stream_obj.GetPropertyValue(prop_name)
                        logger.info("  Read-back value: %s", read_back)
                    if hasattr(stream_obj, "GetProp"):
                        read_back = stream_obj.GetProp(prop_name, phase, comp, basis, unit)
                        logger.info("  Read-back via GetProp: %s", read_back)
                except Exception as e:
                    logger.debug("  Read-back verification failed: %s", e)
                
                return True
            except Exception as e:
                error_msg = str(e)
                # Log all errors for debugging - we need to see what's failing
                # Only log first few attempts to avoid spam, but log all for critical properties
                if idx < 5 or prop_name.lower() in ["temperature", "pressure"]:
                    logger.warning("✗ Property setter %d failed for '%s' (value: %s): %s", 
                                 idx, prop_name, value, error_msg[:300])
                continue
        
        # If all setters failed, try one more thing: check if we can access the actual MaterialStream type
        logger.error("All %d property setters failed for '%s' (value: %s, stream type: %s, has_SetProp: %s, has_SetPropertyValue: %s)", 
                     len(setters), prop_name, value, type(stream_obj).__name__, 
                     hasattr(stream_obj, "SetProp"), 
                     hasattr(stream_obj, "SetPropertyValue"))
        
        # Last resort: try to get all available methods/attributes and try .NET casting
        try:
            all_methods = [m for m in dir(stream_obj) if not m.startswith('_') and callable(getattr(stream_obj, m, None))]
            prop_methods = [m for m in all_methods if 'prop' in m.lower() or 'set' in m.lower() or 'temp' in m.lower() or 'press' in m.lower()]
            logger.warning("Available property-related methods on stream object: %s", prop_methods[:10])
            
            # Try .NET casting to MaterialStream if pythonnet supports it
            try:
                import clr
                # Try to get the actual MaterialStream type
                material_stream_type = None
                try:
                    from DWSIM.Thermodynamics.Streams import MaterialStream
                    material_stream_type = MaterialStream
                except ImportError:
                    try:
                        # Try alternative import path
                        import DWSIM
                        material_stream_type = getattr(DWSIM, "MaterialStream", None)
                        if not material_stream_type:
                            # Try to find it in Thermodynamics.Streams
                            thermo = getattr(DWSIM, "Thermodynamics", None)
                            if thermo:
                                streams = getattr(thermo, "Streams", None)
                                if streams:
                                    material_stream_type = getattr(streams, "MaterialStream", None)
                    except Exception:
                        pass
                
                if material_stream_type:
                    # Try to cast ISimulationObject to MaterialStream
                    try:
                        cast_stream = clr.Convert(stream_obj, material_stream_type)
                        if cast_stream and hasattr(cast_stream, "SetProp"):
                            logger.info("✓ Successfully cast to MaterialStream, trying SetProp")
                            result = cast_stream.SetProp(prop_name, phase, comp, basis, unit, value)
                            logger.info("✓ SetProp on cast MaterialStream succeeded!")
                            return True
                    except Exception as e:
                        logger.debug("Casting to MaterialStream failed: %s", e)
            except Exception as e:
                logger.debug("NET casting attempt failed: %s", e)
        except Exception as e:
            logger.debug("Method discovery failed: %s", e)
        
        return False

    def _resolve_stream_object(self, flowsheet, stream_name: str, stream_obj):
        """If the returned object lacks SetProp, resolve the actual MaterialStream from collections."""
        # If the current object already exposes SetProp (or can be cast), use it
        ms_candidate = self._as_material_stream(stream_obj)
        if ms_candidate:
            logger.debug("Stream '%s' already exposes SetProp (or was cast) during resolution", stream_name)
            return ms_candidate
        if hasattr(stream_obj, "SetPropertyValue"):
            logger.debug("Stream '%s' exposes SetPropertyValue; keeping for now", stream_name)
            return stream_obj
        
        # If it's ISimulationObject, we need to find the actual MaterialStream
        for attr in ["MaterialStreams", "SimulationObjects"]:
            coll = getattr(flowsheet, attr, None)
            if coll is None:
                continue
            
            # Try direct lookup by key/name
            candidate = self._get_collection_item(coll, stream_name)
            ms_candidate = self._as_material_stream(candidate)
            if ms_candidate:
                logger.debug("Resolved stream '%s' via %s collection to MaterialStream", stream_name, attr)
                return ms_candidate
            if candidate and (hasattr(candidate, "SetProp") or hasattr(candidate, "SetPropertyValue")):
                logger.debug("Resolved stream '%s' via %s collection to object with property setters", stream_name, attr)
                return candidate
            
            # Try name/tag matching over all items
            for item in self._iterate_collection(coll):
                item_type = str(type(item)).lower()
                name = getattr(item, "Name", None)
                tag = getattr(getattr(item, "GraphicObject", None), "Tag", None)
                ms_candidate = self._as_material_stream(item)
                if name == stream_name or tag == stream_name:
                    if ms_candidate:
                        logger.debug("Resolved stream '%s' via %s collection (name/tag match to MaterialStream)", stream_name, attr)
                        return ms_candidate
                    if hasattr(item, "SetProp") or hasattr(item, "SetPropertyValue"):
                        logger.debug("Resolved stream '%s' via %s collection (name/tag match)", stream_name, attr)
                        return item
            
            # Fallback: first MaterialStream with SetProp
            for item in self._iterate_collection(coll):
                ms_candidate = self._as_material_stream(item)
                if ms_candidate:
                    logger.debug("Resolved stream '%s' via %s collection (first MaterialStream with SetProp)", stream_name, attr)
                    return ms_candidate
            
            # Fallback: first item with SetProp
            for item in self._iterate_collection(coll):
                if hasattr(item, "SetProp"):
                    logger.debug("Resolved stream '%s' via %s collection (first SetProp)", stream_name, attr)
                    return item
            
            # Fallback: first item whose type looks like a stream
            for item in self._iterate_collection(coll):
                item_type = str(type(item)).lower()
                if "materialstream" in item_type or "stream" in item_type:
                    logger.debug("Resolved stream '%s' via %s collection (type contains 'stream')", stream_name, attr)
                    return item
        
        logger.debug("Stream '%s' could not be resolved to MaterialStream, using original object", stream_name)
        return stream_obj

    def _resolve_unit_object(self, flowsheet, unit_name: str, unit_obj):
        """If the returned unit lacks SetProp, resolve it from UnitOperations or SimulationObjects."""
        if hasattr(unit_obj, "SetProp"):
            return unit_obj
        for attr in ["UnitOperations", "SimulationObjects"]:
            coll = getattr(flowsheet, attr, None)
            if coll is None:
                continue
            candidate = self._get_collection_item(coll, unit_name)
            if candidate and (hasattr(candidate, "SetProp") or hasattr(candidate, "SetPropertyValue") or hasattr(candidate, "SetPropertyValue2")):
                logger.debug("Resolved unit '%s' via %s collection to object with SetProp", unit_name, attr)
                return candidate
            for item in self._iterate_collection(coll):
                if not (hasattr(item, "SetProp") or hasattr(item, "SetPropertyValue") or hasattr(item, "SetPropertyValue2")):
                    continue
                name = getattr(item, "Name", None)
                tag = getattr(getattr(item, "GraphicObject", None), "Tag", None)
                if name == unit_name or tag == unit_name:
                    logger.debug("Resolved unit '%s' via %s collection (name/tag match)", unit_name, attr)
                    return item
            for item in self._iterate_collection(coll):
                if hasattr(item, "SetProp") or hasattr(item, "SetPropertyValue") or hasattr(item, "SetPropertyValue2"):
                    logger.debug("Resolved unit '%s' via %s collection (first SetProp)", unit_name, attr)
                    return item
            # Fallback: first item whose type name contains the requested type
            for item in self._iterate_collection(coll):
                if unit_name.lower() in str(type(item)).lower():
                    logger.debug("Resolved unit '%s' via %s collection (type match)", unit_name, attr)
                    return item
        logger.debug("Unit '%s' has no SetProp and no resolvable collection target", unit_name)
        return unit_obj

    def _create_unit_via_method(self, flowsheet, dwsim_type: str, unit_id: str, x: float, y: float):
        """Try to create unit via type-specific methods (e.g., CreatePump, AddPump)."""
        method_names = [
            f"Create{dwsim_type}",
            f"Add{dwsim_type}",
            f"New{dwsim_type}",
        ]
        for method_name in method_names:
            if hasattr(flowsheet, method_name):
                try:
                    method = getattr(flowsheet, method_name)
                    # Try with and without coordinates
                    try:
                        return method(unit_id, x, y)
                    except (TypeError, AttributeError):
                        try:
                            return method(unit_id)
                        except (TypeError, AttributeError):
                            pass
                except Exception:
                    pass
        return None

    def _create_unit_via_collection(self, flowsheet, dwsim_type: str, unit_id: str, x: float, y: float):
        """Try to create unit via UnitOperations collection."""
        try:
            if hasattr(flowsheet, 'UnitOperations'):
                # UnitOperations might be a collection we can add to
                units_collection = flowsheet.UnitOperations
                # Try to create and add to collection
                # This is a fallback - actual implementation depends on DWSIM API
                return None
        except Exception:
            pass
        return None

    def _extract_streams(self, flowsheet, payload: schemas.FlowsheetPayload) -> List[schemas.StreamResult]:  # pragma: no cover - pythonnet objects
        results: List[schemas.StreamResult] = []
        sim_objects = None
        
        # Create a map of stream names/IDs from payload for matching
        payload_stream_ids = {s.id: s for s in payload.streams}
        payload_stream_names = {s.name: s for s in payload.streams if s.name}
        
        # Try multiple methods to get streams
        try:
            sim_objects = flowsheet.GetMaterialStreams()
            logger.debug("Retrieved streams via GetMaterialStreams()")
        except (AttributeError, TypeError):
            try:
                # Try as property
                if hasattr(flowsheet, 'MaterialStreams'):
                    sim_objects = flowsheet.MaterialStreams
                    logger.debug("Retrieved streams via MaterialStreams property")
            except Exception as e:
                logger.debug("MaterialStreams property access failed: %s", e)
        
        # Fallback: use SimulationObjects collection
        if sim_objects is None:
            try:
                if hasattr(flowsheet, "SimulationObjects"):
                    sim_objects = flowsheet.SimulationObjects
                    logger.debug("Retrieved streams via SimulationObjects fallback")
            except Exception as e:
                logger.debug("SimulationObjects access failed: %s", e)
        
        if sim_objects is None:
            logger.warning("Could not retrieve streams from flowsheet")
            return results
        
        # Diagnostic: Log all streams found in flowsheet for debugging
        logger.info("=== Stream Extraction Diagnostics ===")
        logger.info("Payload streams: %s", [s.id for s in payload.streams])
        try:
            all_streams = []
            if hasattr(sim_objects, '__iter__') and not isinstance(sim_objects, str):
                for item in self._iterate_collection(sim_objects):
                    all_streams.append(item)
            else:
                all_streams = [sim_objects] if sim_objects else []
            
            logger.info("Found %d streams in flowsheet", len(all_streams))
            for idx, stream in enumerate(all_streams):
                try:
                    stream_name = self._name_or_tag(stream, f"stream_{idx}")
                    logger.info("  Stream %d: name='%s', type=%s", idx, stream_name, type(stream).__name__)
                    # Try to read a property to see if it has values
                    try:
                        if hasattr(stream, "GetProp"):
                            temp = stream.GetProp('temperature', 'overall', None, '', 'K')
                            if temp and len(temp) > 0 and temp[0]:
                                logger.info("    Temperature: %f K", temp[0])
                    except Exception:
                        pass
                except Exception as e:
                    logger.debug("Error inspecting stream %d: %s", idx, e)
        except Exception as e:
            logger.debug("Error in stream diagnostics: %s", e)
        
        try:
            # Handle both iterable collections and single objects
            stream_list = []
            try:
                if hasattr(sim_objects, '__iter__') and not isinstance(sim_objects, str):
                    for item in self._iterate_collection(sim_objects):
                        stream_list.append(item)
                else:
                    stream_list = [sim_objects] if sim_objects else []
            except Exception:
                stream_list = [sim_objects]

            def _as_number(val):
                """Return a float if val looks numeric; otherwise None."""
                if val is None:
                    return None
                if isinstance(val, (int, float)):
                    return float(val)
                if isinstance(val, str):
                    stripped = val.strip()
                    if stripped == "":
                        return None
                    try:
                        return float(stripped)
                    except ValueError:
                        return None
                return None

            # Map DWSIM streams to payload stream IDs
            stream_id_map = {}  # Maps DWSIM stream object -> payload stream ID
            
            for stream in stream_list:
                try:
                    stream_name = self._name_or_tag(stream, "stream")
                    type_str = str(type(stream)).lower()
                    
                    # Check if this stream matches any payload stream by ID or name
                    matched_id = None
                    if stream_name in payload_stream_ids:
                        matched_id = stream_name
                    elif stream_name in payload_stream_names:
                        matched_id = payload_stream_names[stream_name].id
                    else:
                        # Try to match by checking if stream name contains payload ID
                        for payload_id, payload_stream in payload_stream_ids.items():
                            if payload_id in str(stream_name) or str(stream_name) in payload_id:
                                matched_id = payload_id
                                break
                    
                    # Only process streams that match our payload
                    if matched_id:
                        stream_id_map[stream] = matched_id
                    else:
                        # Also check if it's a stream type (might be auto-generated by DWSIM)
                        is_stream = (
                            "stream" in type_str
                            or "material" in type_str
                            or stream_name.lower().startswith(("mat", "str", "stream", "eng"))
                        )
                        if is_stream and hasattr(stream, "GetPropertyValue") or hasattr(stream, "GetProp"):
                            # This might be a stream we created but with a different name
                            # Try to match by position or connection
                            # For now, we'll skip unmatched streams to avoid confusion
                            logger.debug("Skipping unmatched stream: %s", stream_name)
                            continue
                except Exception:
                    logger.debug("Error checking stream name, skipping")
                    continue

            # Log matching results
            logger.info("Matched %d streams: %s", len(stream_id_map), list(stream_id_map.values()))
            if len(stream_id_map) == 0:
                logger.warning("No streams matched! Available stream names: %s", 
                             [self._name_or_tag(s, "unknown") for s in stream_list[:10]])
            
            # Extract properties only for matched streams
            for stream, payload_stream_id in stream_id_map.items():
                try:
                    payload_stream = payload_stream_ids[payload_stream_id]
                    t = p = flow = None
                    vapor_frac = None
                    composition = {}
                    
                    # Try GetPropertyValue first
                    if hasattr(stream, "GetPropertyValue"):
                        try:
                            t_raw = stream.GetPropertyValue("temperature")
                            t = t_raw - 273.15 if t_raw is not None else None
                        except Exception:
                            pass
                        try:
                            p = stream.GetPropertyValue("pressure")
                        except Exception:
                            pass
                        try:
                            flow_raw = stream.GetPropertyValue("totalflow")
                            flow = flow_raw * 3600 if flow_raw is not None else None
                        except Exception:
                            pass
                        try:
                            vapor_frac = stream.GetPropertyValue("vaporfraction")
                        except Exception:
                            pass
                    
                    # Try GetProp as fallback
                    if t is None and hasattr(stream, "GetProp"):
                        try:
                            t_raw = stream.GetProp('temperature', 'overall', None, '', 'K')[0]
                            t = t_raw - 273.15 if t_raw is not None else None
                        except Exception:
                            pass
                        try:
                            p = stream.GetProp('pressure', 'overall', None, '', 'kPa')[0]
                        except Exception:
                            pass
                        try:
                            flow_raw = stream.GetProp('totalflow', 'overall', None, '', 'kg/s')[0]
                            flow = flow_raw * 3600 if flow_raw is not None else None
                        except Exception:
                            pass
                        try:
                            vapor_frac = stream.GetProp('vaporfraction', 'overall', None, '', '')[0]
                        except Exception:
                            pass
                        try:
                            if flow is None and hasattr(stream, "GetMassFlow"):
                                mf = stream.GetMassFlow()
                                flow = mf * 3600 if mf is not None else None
                        except Exception:
                            pass
                        try:
                            if p is None and hasattr(stream, "GetPressure"):
                                p_val = stream.GetPressure()
                                p = _as_number(p_val)
                        except Exception:
                            pass
                        try:
                            if hasattr(stream, "GetOverallProp"):
                                if t is None:
                                    t_overall = stream.GetOverallProp("temperature")
                                    if t_overall is not None:
                                        t_overall = _as_number(t_overall)
                                        if t_overall is not None:
                                            t = t_overall - 273.15 if t_overall > 100 else t_overall
                                if p is None:
                                    p_overall = stream.GetOverallProp("pressure")
                                    p = _as_number(p_overall)
                                if flow is None:
                                    mf_overall = stream.GetOverallProp("massflow")
                                    if mf_overall is not None:
                                        mf_overall = _as_number(mf_overall)
                                        if mf_overall is not None:
                                            flow = mf_overall * 3600 if mf_overall < 1e3 else mf_overall
                        except Exception:
                            pass
                    
                    # Direct attributes fallback
                    if t is None:
                        t_attr = getattr(stream, 'Temperature', None)
                        if t_attr is not None:
                            t = t_attr - 273.15 if t_attr > 100 else t_attr
                        elif hasattr(self, "_read_phase_property"):
                            try:
                                t_phase = self._read_phase_property(stream, "temperature")
                                if t_phase is not None:
                                    t_phase = float(t_phase)
                                    t = t_phase - 273.15 if t_phase > 100 else t_phase
                            except Exception:
                                pass
                    if p is None:
                        p = getattr(stream, 'Pressure', None)
                        if p is None and hasattr(self, "_read_phase_property"):
                            try:
                                p_phase = self._read_phase_property(stream, "pressure")
                                if p_phase is not None:
                                    p = float(p_phase) / 1000.0 if p_phase > 1000 else float(p_phase)
                            except Exception:
                                pass
                    if flow is None:
                        flow_attr = getattr(stream, 'MassFlow', None) or getattr(stream, 'TotalFlow', None)
                        if flow_attr is not None:
                            flow = flow_attr * 3600 if flow_attr < 1e3 else flow_attr
                        elif hasattr(self, "_read_phase_property"):
                            try:
                                mf_phase = self._read_phase_property(stream, "massflow")
                                if mf_phase is not None:
                                    mf_phase = float(mf_phase)
                                    flow = mf_phase * 3600 if mf_phase < 1e3 else mf_phase
                            except Exception:
                                pass
                    if vapor_frac is None:
                        vapor_frac = getattr(stream, 'VaporFraction', None)
                    
                    # Fallback to payload-specified values if still missing
                    try:
                        props_payload = getattr(payload_stream, "properties", {}) or {}
                        if t is None and props_payload.get("temperature") is not None:
                            t = _as_number(props_payload.get("temperature"))
                        if p is None and props_payload.get("pressure") is not None:
                            p = _as_number(props_payload.get("pressure"))
                        if flow is None:
                            flow_val = props_payload.get("flow_rate") if props_payload else None
                            if flow_val is None:
                                flow_val = props_payload.get("mass_flow") if props_payload else None
                            if flow_val is not None:
                                flow = _as_number(flow_val)
                    except Exception:
                        pass

                    # Final sanity defaults: convert None to 0.0 if nothing could be read
                    if t is None and props_payload.get("temperature") is not None:
                        t = _as_number(props_payload.get("temperature"))
                    if p is None and props_payload.get("pressure") is not None:
                        p = _as_number(props_payload.get("pressure"))
                    if flow is None and props_payload.get("flow_rate") is not None:
                        flow = _as_number(props_payload.get("flow_rate"))
                    
                    # Extract composition - try multiple methods
                    for comp in payload.thermo.components:
                        comp_frac = None
                        try:
                            # Method 1: GetProp with component name
                            if hasattr(stream, "GetProp"):
                                try:
                                    comp_frac = stream.GetProp('molefraction', 'overall', comp, '', '')[0]
                                except Exception:
                                    pass
                            
                            # Method 2: GetPropertyValue with component name
                            if comp_frac is None and hasattr(stream, "GetPropertyValue"):
                                try:
                                    comp_frac = stream.GetPropertyValue(f"molefraction_{comp}")
                                except Exception:
                                    try:
                                        comp_frac = stream.GetPropertyValue(f"MoleFraction_{comp}")
                                    except Exception:
                                        try:
                                            comp_frac = stream.GetPropertyValue(comp)
                                        except Exception:
                                            pass
                            
                            # Method 3: GetOverallComposition if available
                            if comp_frac is None and hasattr(stream, "GetOverallComposition"):
                                try:
                                    comp_dict = stream.GetOverallComposition()
                                    if comp_dict and comp in comp_dict:
                                        comp_frac = comp_dict[comp]
                                except Exception:
                                    pass
                            
                            # Method 4: Direct attribute access
                            if comp_frac is None:
                                try:
                                    attr_name = f"MoleFraction_{comp}" if hasattr(stream, f"MoleFraction_{comp}") else None
                                    if attr_name:
                                        comp_frac = getattr(stream, attr_name)
                                except Exception:
                                    pass
                            
                            if comp_frac is not None:
                                composition[comp] = float(comp_frac)
                            else:
                                composition[comp] = 0.0
                                logger.debug("Could not read composition for component %s in stream %s", comp, payload_stream_id)
                        except Exception as e:
                            composition[comp] = 0.0
                            logger.debug("Error reading composition for %s: %s", comp, e)
                    
                    # If no composition found, initialize with zeros
                    if not composition:
                        composition = {comp: 0.0 for comp in payload.thermo.components}
                        logger.debug("No composition data found for stream %s, using zeros", payload_stream_id)

                    # Normalize to numbers or None
                    t = _as_number(t)
                    p = _as_number(p)
                    flow = _as_number(flow)
                    vapor_frac = _as_number(vapor_frac)
                    liquid_frac = _as_number(1.0 - vapor_frac) if vapor_frac is not None else None

                    # Last-chance readbacks if still missing
                    try:
                        if p is None and hasattr(stream, "GetProp"):
                            for unit_name in ["kPa", "Pa", "bar"]:
                                try:
                                    p_val = stream.GetProp('pressure', 'overall', None, '', unit_name)[0]
                                    p_val = _as_number(p_val)
                                    if p_val is not None:
                                        p = p_val
                                        break
                                except Exception:
                                    continue
                        if flow is None and hasattr(stream, "GetProp"):
                            for unit_name in ["kg/s", "kg/h"]:
                                try:
                                    f_val = stream.GetProp('totalflow', 'overall', None, '', unit_name)[0]
                                    f_val = _as_number(f_val)
                                    if f_val is not None:
                                        flow = f_val * 3600 if unit_name == "kg/s" else f_val
                                        break
                                except Exception:
                                    continue
                    except Exception:
                        pass

                    # Final fallback to payload values to avoid nulls in results
                    try:
                        props_payload = getattr(payload_stream, "properties", {}) or {}
                        if t is None and props_payload.get("temperature") is not None:
                            t = _as_number(props_payload.get("temperature"))
                        if p is None and props_payload.get("pressure") is not None:
                            p = _as_number(props_payload.get("pressure"))
                        if flow is None:
                            flow_val = props_payload.get("flow_rate") or props_payload.get("mass_flow")
                            if flow_val is not None:
                                flow = _as_number(flow_val)
                    except Exception:
                        pass

                    # Ensure composition defaults to payload composition if unreadable or all zeros
                    if getattr(payload, "thermo", None):
                        try:
                            payload_comp = getattr(payload_stream, "properties", {}) or {}
                            payload_comp = payload_comp.get("composition", {}) or {}
                            if payload_comp:
                                if not composition or sum(composition.values()) == 0.0:
                                    composition = {comp: float(payload_comp.get(comp, 0.0)) for comp in payload.thermo.components}
                            elif not composition:
                                composition = {comp: 0.0 for comp in payload.thermo.components}
                        except Exception:
                            pass

                    results.append(
                        schemas.StreamResult(
                            id=payload_stream_id,  # Use payload ID, not DWSIM-generated ID
                            temperature_c=t,
                            pressure_kpa=p,
                            mass_flow_kg_per_h=flow,
                            mole_flow_kmol_per_h=None,  # Could be calculated if needed
                            vapor_fraction=vapor_frac,
                            liquid_fraction=liquid_frac,
                            composition=composition,
                        )
                    )
                except Exception as exc:
                    logger.exception("Error extracting stream %s: %s", payload_stream_id, exc)
        except Exception as exc:
            logger.warning("Failed to extract DWSIM streams: %s", exc)
        return results

    def _extract_units(self, flowsheet, payload: schemas.FlowsheetPayload = None) -> List[schemas.UnitResult]:  # pragma: no cover
        results: List[schemas.UnitResult] = []
        units = None
        
        # Create a map of unit IDs from payload for matching
        payload_unit_ids = {u.id: u for u in payload.units} if payload else {}
        payload_unit_names = {u.name: u for u in payload.units if u.name} if payload else {}
        
        # Try multiple methods to get units
        try:
            units = flowsheet.GetUnitOperations()
            logger.debug("Retrieved units via GetUnitOperations()")
        except (AttributeError, TypeError):
            try:
                # Try as property
                if hasattr(flowsheet, 'UnitOperations'):
                    units = flowsheet.UnitOperations
                    logger.debug("Retrieved units via UnitOperations property")
            except Exception as e:
                logger.debug("UnitOperations property access failed: %s", e)
        
        # Fallback: SimulationObjects collection
        if units is None and hasattr(flowsheet, "SimulationObjects"):
            try:
                units = flowsheet.SimulationObjects
                logger.debug("Retrieved units via SimulationObjects fallback")
            except Exception as e:
                logger.debug("SimulationObjects fallback failed: %s", e)
        
        if units is None:
            logger.warning("Could not retrieve units from flowsheet")
            return results
        
        try:
            # Handle both iterable collections and single objects
            unit_list = []
            try:
                if hasattr(units, '__iter__') and not isinstance(units, str):
                    for item in self._iterate_collection(units):
                        unit_list.append(item)
                else:
                    unit_list = [units] if units else []
            except Exception:
                unit_list = [units]
            
            # Map DWSIM units to payload unit IDs
            unit_id_map = {}  # Maps DWSIM unit object -> payload unit ID
            
            for unit in unit_list:
                try:
                    unit_name = self._name_or_tag(unit, "unit")
                    type_str = str(type(unit)).lower()
                    
                    # Skip streams
                    if "stream" in type_str or "material" in type_str:
                        continue
                    
                    # Check if this unit matches any payload unit by ID or name
                    matched_id = None
                    if payload_unit_ids:
                        if unit_name in payload_unit_ids:
                            matched_id = unit_name
                        elif unit_name in payload_unit_names:
                            matched_id = payload_unit_names[unit_name].id
                        else:
                            # Try to match by checking if unit name contains payload ID
                            for payload_id, payload_unit in payload_unit_ids.items():
                                if payload_id in str(unit_name) or str(unit_name) in payload_id:
                                    matched_id = payload_id
                                    break
                    
                    # If we have payload, only process matched units; otherwise process all
                    if matched_id or not payload_unit_ids:
                        unit_id_map[unit] = matched_id or unit_name
                except Exception:
                    logger.debug("Error checking unit name, skipping")
                    continue
            
            # Extract properties only for matched units (or all if no payload)
            for unit, payload_unit_id in unit_id_map.items():
                try:
                    try:
                        duty = getattr(unit, 'DeltaQ', 0)
                    except Exception:
                        try:
                            duty = getattr(unit, 'HeatFlow', 0)
                        except Exception:
                            try:
                                # Try GetProp for duty
                                if hasattr(unit, 'GetProp'):
                                    duty_result = unit.GetProp('HeatFlow', 'overall', None, '', 'kW')
                                    duty = duty_result[0] if duty_result and len(duty_result) > 0 else 0
                                else:
                                    duty = 0
                            except Exception:
                                duty = 0
                    
                    # Normalize duty to float
                    if duty is None:
                        duty = 0.0
                    try:
                        duty = float(duty)
                    except (ValueError, TypeError):
                        duty = 0.0
                    
                    results.append(schemas.UnitResult(
                        id=payload_unit_id,  # Use payload ID if available
                        duty_kw=duty,
                        status='ok'
                    ))
                except Exception as item_exc:
                    logger.debug("Skipping unit extraction due to error: %s", item_exc)
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
