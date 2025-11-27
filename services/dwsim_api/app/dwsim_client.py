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
        
        warnings: List[str] = []
        
        try:
            # Step 1: Configure property package
            self._configure_property_package(flowsheet, payload.thermo, warnings)
            
            # Step 2: Add components to flowsheet
            self._add_components(flowsheet, payload.thermo.components, warnings)
            
            # Step 3: Create material streams
            stream_map = self._create_streams(flowsheet, payload.streams, warnings)
            
            # Step 4: Create unit operations
            unit_map = self._create_units(flowsheet, payload.units, warnings)
            
            # Step 5: Connect streams to units
            self._connect_streams(flowsheet, payload.streams, stream_map, unit_map, warnings)
            
            # Step 6: Configure unit parameters
            self._configure_units(flowsheet, payload.units, unit_map, warnings)
            
            # Step 7: Run simulation
            logger.info("Running DWSIM simulation for flowsheet: %s", payload.name)
            self._automation.CalculateFlowsheet(flowsheet, None)
            
            # Step 8: Extract results
            stream_results = self._extract_streams(flowsheet, payload)
            unit_results = self._extract_units(flowsheet)
            
            return schemas.SimulationResult(
                flowsheet_name=payload.name,
                status="ok" if stream_results else "empty",
                streams=stream_results,
                units=unit_results,
                warnings=warnings if warnings else [],
                diagnostics={"mode": "dwsim", "units_created": len(unit_map), "streams_created": len(stream_map)},
            )
        except Exception as exc:
            logger.exception("Error creating/running DWSIM flowsheet: %s", exc)
            warnings.append(f"DWSIM error: {str(exc)}")
            # Return partial results if available
            try:
                stream_results = self._extract_streams(flowsheet, payload)
                unit_results = self._extract_units(flowsheet)
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
                    logger.info("Set property package to: %s", dwsim_package)
                    success = True
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
            
            # Try multiple method signatures and approaches
            method_attempts = []
            if stream_enum is not None:
                method_attempts.extend([
                    ("AddObject(enum, coords)", lambda sn=stream_name, x_coord=x, y_coord=y: flowsheet.AddObject(stream_enum, sn, float(x_coord), float(y_coord))),
                    ("AddObject(enum)", lambda sn=stream_name: flowsheet.AddObject(stream_enum, sn)),
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
            
            # Prioritize the working signature observed on Windows: AddFlowsheetObject("Material Stream", name)
            method_attempts.insert(0, ("AddFlowsheetObject('Material Stream')", lambda sn=stream_name: flowsheet.AddFlowsheetObject("Material Stream", sn) if hasattr(flowsheet, 'AddFlowsheetObject') else None))
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
                    (f"AddObject('{type_name}', coords)", lambda tn=type_name, sn=stream_name, x_coord=x, y_coord=y: flowsheet.AddObject(tn, sn, x_coord, y_coord)),
                    (f"AddObject('{type_name}')", lambda tn=type_name, sn=stream_name: flowsheet.AddObject(tn, sn)),
                ])

            method_attempts.extend([
                ("CreateMaterialStream", lambda sn=stream_name, x_coord=x, y_coord=y: flowsheet.CreateMaterialStream(sn, x_coord, y_coord) if hasattr(flowsheet, 'CreateMaterialStream') else None),
                ("AddMaterialStream", lambda sn=stream_name, x_coord=x, y_coord=y: flowsheet.AddMaterialStream(sn, x_coord, y_coord) if hasattr(flowsheet, 'AddMaterialStream') else None),
                ("NewMaterialStream", lambda sn=stream_name, x_coord=x, y_coord=y: flowsheet.NewMaterialStream(sn, x_coord, y_coord) if hasattr(flowsheet, 'NewMaterialStream') else None),
                ("MaterialStreams collection fallback", lambda: self._create_stream_via_collection(flowsheet, stream_name, x, y)),
            ])
            
            for desc, method in method_attempts:
                try:
                    result = method()
                    if result is not None:
                        stream_obj = result
                        logger.debug("Created stream '%s' via %s", stream_name, desc)
                        break
                    logger.debug("Stream creation method %s returned None", desc)
                except (TypeError, AttributeError) as e:
                    logger.debug("Stream creation method %s failed: %s", desc, e)
                    continue
                except Exception as e:
                    logger.debug("Stream creation %s failed with error: %s", desc, e)
                    continue
            
            if stream_obj is None:
                logger.warning("Failed to create stream '%s' - all methods failed", stream_name)
                warnings.append(f"Failed to create stream '{stream_name}' - DWSIM API method signature issue.")
                continue
            
            try:
                # If the object we got lacks SetProp, try to resolve the real MaterialStream from collections
                stream_obj = self._resolve_stream_object(flowsheet, stream_name, stream_obj)
                stream_map[stream_spec.id] = stream_obj
                
                # Set stream properties
                props = stream_spec.properties or {}
                
                # Temperature (convert C to K if needed)
                temp = props.get("temperature")
                if temp is not None:
                    if not self._set_stream_prop(stream_obj, "temperature", "overall", None, "", "K", temp + 273.15):
                        if not self._set_stream_prop(stream_obj, "temperature", "overall", None, "", "C", temp):
                            warnings.append(f"Stream {stream_spec.id}: Could not set temperature")
                
                # Pressure (in kPa)
                pressure = props.get("pressure")
                if pressure is not None:
                    if not self._set_stream_prop(stream_obj, "pressure", "overall", None, "", "kPa", pressure):
                        warnings.append(f"Stream {stream_spec.id}: Could not set pressure")
                
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
                        for comp, frac in composition.items():
                            normalized_frac = frac / total
                            if not self._set_stream_prop(stream_obj, "molefraction", "overall", comp, "", "", normalized_frac):
                                warnings.append(f"Stream {stream_spec.id}: Could not set composition for {comp}")
                
                # Vapor fraction
                vapor_frac = props.get("vapor_fraction")
                if vapor_frac is not None:
                    self._set_stream_prop(stream_obj, "vaporfraction", "overall", None, "", "", vapor_frac)
                
                logger.debug("Created stream: %s", stream_spec.id)
            except Exception as exc:
                logger.warning("Failed to set properties for stream %s: %s", stream_spec.id, exc)
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
                    ("AddObject(enum, coords)", lambda ut=unit_enum, uid=unit_spec.id, x_coord=x, y_coord=y: flowsheet.AddObject(ut, uid, float(x_coord), float(y_coord))),
                    ("AddObject(enum)", lambda ut=unit_enum, uid=unit_spec.id: flowsheet.AddObject(ut, uid)),
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
                ("AddObject(str, coords)", lambda ut=dwsim_type, uid=unit_spec.id, x_coord=x, y_coord=y: flowsheet.AddObject(ut, uid, x_coord, y_coord)),
                ("AddObject(str)", lambda ut=dwsim_type, uid=unit_spec.id: flowsheet.AddObject(ut, uid)),
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
                unit_map[unit_spec.id] = unit_obj
                logger.debug("Created unit: %s (type: %s)", unit_spec.id, dwsim_type)
            except Exception as exc:
                logger.warning("Failed to store unit %s: %s", unit_spec.id, exc)
                warnings.append(f"Failed to store unit '{unit_spec.id}': {str(exc)}")
        
        return unit_map

    def _connect_streams(self, flowsheet, streams: List[schemas.StreamSpec], stream_map: dict, unit_map: dict, warnings: List[str]) -> None:
        """Connect material streams to unit operations."""
        for stream_spec in streams:
            if not stream_spec.source or not stream_spec.target:
                continue  # Skip streams without connections
            
            stream_obj = stream_map.get(stream_spec.id)
            if not stream_obj:
                warnings.append(f"Stream '{stream_spec.id}' not found for connection")
                continue
            
            # Connect to target unit (inlet)
            target_unit = unit_map.get(stream_spec.target)
            if target_unit:
                try:
                    # Map port handles to DWSIM port indices
                    # This is simplified - actual port mapping depends on unit type
                    port = self._map_port_to_index(stream_spec.targetHandle, stream_spec.target)
                    target_unit.SetInletStream(port, stream_obj)
                    logger.debug("Connected stream %s to unit %s (port %s)", stream_spec.id, stream_spec.target, port)
                except Exception as exc:
                    warnings.append(f"Failed to connect stream '{stream_spec.id}' to unit '{stream_spec.target}': {str(exc)}")
            
            # Connect from source unit (outlet)
            source_unit = unit_map.get(stream_spec.source)
            if source_unit:
                try:
                    port = self._map_port_to_index(stream_spec.sourceHandle, stream_spec.source)
                    source_unit.SetOutletStream(port, stream_obj)
                    logger.debug("Connected stream %s from unit %s (port %s)", stream_spec.id, stream_spec.source, port)
                except Exception as exc:
                    warnings.append(f"Failed to connect stream '{stream_spec.id}' from unit '{stream_spec.source}': {str(exc)}")

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

    def _set_stream_prop(self, stream_obj, prop_name, phase, comp, basis, unit, value) -> bool:
        """Attempt to set a property on a stream object using multiple APIs."""
        setters = []
        if hasattr(stream_obj, "SetProp"):
            setters.append(lambda: stream_obj.SetProp(prop_name, phase, comp, basis, unit, value))
        if hasattr(stream_obj, "SetPropertyValue"):
            setters.append(lambda: stream_obj.SetPropertyValue(prop_name, value))
        # Common direct attributes as fallbacks
        for attr in ["Temperature", "Pressure", "MassFlow", "MolarFlow", "TotalFlow"]:
            if attr.lower().startswith(prop_name.replace(" ", "").lower()) and hasattr(stream_obj, attr):
                setters.append(lambda a=attr: setattr(stream_obj, a, value))
        for setter in setters:
            try:
                setter()
                return True
            except Exception:
                continue
        return False

    def _resolve_stream_object(self, flowsheet, stream_name: str, stream_obj):
        """If the returned object lacks SetProp, resolve the actual MaterialStream from collections."""
        if hasattr(stream_obj, "SetProp"):
            return stream_obj
        for attr in ["MaterialStreams", "SimulationObjects"]:
            coll = getattr(flowsheet, attr, None)
            if coll is None:
                continue
            # Try direct lookup by key
            candidate = self._get_collection_item(coll, stream_name)
            if candidate and hasattr(candidate, "SetProp"):
                logger.debug("Resolved stream '%s' via %s collection to object with SetProp", stream_name, attr)
                return candidate
            # Try name/tag matching over all items
            for item in self._iterate_collection(coll):
                name = getattr(item, "Name", None)
                tag = getattr(getattr(item, "GraphicObject", None), "Tag", None)
                if name == stream_name or tag == stream_name:
                    if hasattr(item, "SetProp") or "stream" in str(type(item)).lower():
                        logger.debug("Resolved stream '%s' via %s collection (name/tag match)", stream_name, attr)
                        return item
            # Fallback: first item with SetProp
            for item in self._iterate_collection(coll):
                if hasattr(item, "SetProp"):
                    logger.debug("Resolved stream '%s' via %s collection (first SetProp)", stream_name, attr)
                    return item
            # Fallback: first item whose type looks like a stream
            for item in self._iterate_collection(coll):
                if "stream" in str(type(item)).lower():
                    logger.debug("Resolved stream '%s' via %s collection (type contains 'stream')", stream_name, attr)
                    return item
        logger.debug("Stream '%s' has no SetProp and no resolvable collection target", stream_name)
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
            if candidate and hasattr(candidate, "SetProp"):
                logger.debug("Resolved unit '%s' via %s collection to object with SetProp", unit_name, attr)
                return candidate
            for item in self._iterate_collection(coll):
                if not hasattr(item, "SetProp"):
                    continue
                name = getattr(item, "Name", None)
                tag = getattr(getattr(item, "GraphicObject", None), "Tag", None)
                if name == unit_name or tag == unit_name:
                    logger.debug("Resolved unit '%s' via %s collection (name/tag match)", unit_name, attr)
                    return item
            for item in self._iterate_collection(coll):
                if hasattr(item, "SetProp"):
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
        
        if sim_objects is None:
            logger.warning("Could not retrieve streams from flowsheet")
            return results
        
        try:
            # Handle both iterable collections and single objects
            if hasattr(sim_objects, '__iter__') and not isinstance(sim_objects, str):
                stream_list = list(sim_objects)
            else:
                stream_list = [sim_objects] if sim_objects else []
            
            for stream in stream_list:
                stream_id = getattr(stream, 'Name', getattr(stream, 'GraphicObject', {}).get('Tag', 'stream') if hasattr(stream, 'GraphicObject') else 'stream')
                try:
                    t = stream.GetProp('temperature', 'overall', None, '', 'K')[0] - 273.15
                    p = stream.GetProp('pressure', 'overall', None, '', 'kPa')[0]
                    flow = stream.GetProp('totalflow', 'overall', None, '', 'kg/s')[0] * 3600
                except Exception:
                    try:
                        # Try alternative property access
                        t = getattr(stream, 'Temperature', None)
                        if t is not None:
                            t = t - 273.15 if t > 100 else t  # Assume K if > 100, else C
                        p = getattr(stream, 'Pressure', None)
                        flow = getattr(stream, 'MassFlow', None)
                        if flow is not None:
                            flow = flow * 3600  # Convert kg/s to kg/h
                    except Exception:
                        t = p = flow = None

                results.append(
                    schemas.StreamResult(
                        id=str(stream_id),
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
        units = None
        
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
        
        if units is None:
            logger.warning("Could not retrieve units from flowsheet")
            return results
        
        try:
            # Handle both iterable collections and single objects
            if hasattr(units, '__iter__') and not isinstance(units, str):
                unit_list = list(units)
            else:
                unit_list = [units] if units else []
            
            for unit in unit_list:
                unit_id = getattr(unit, 'Name', getattr(unit, 'GraphicObject', {}).get('Tag', 'unit') if hasattr(unit, 'GraphicObject') else 'unit')
                try:
                    duty = getattr(unit, 'DeltaQ', 0)
                except Exception:
                    try:
                        duty = getattr(unit, 'HeatFlow', 0)
                    except Exception:
                        duty = 0
                
                results.append(schemas.UnitResult(id=str(unit_id), duty_kw=duty, status='ok'))
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
