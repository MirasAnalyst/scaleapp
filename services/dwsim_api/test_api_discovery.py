#!/usr/bin/env python3
"""Enhanced test script to discover DWSIM Automation API methods and correct signatures."""

import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from loguru import logger

# Set up logging
logger.remove()
logger.add(sys.stderr, level="DEBUG")

def _find_object_type_enum():
    """Locate the DWSIM ObjectType enum used by AddObject/AddFlowsheetObject."""
    candidates = [
        ("DWSIM.Interfaces.Enums.GraphicObjects", ["ObjectType", "GraphicObjectType"]),
        ("DWSIM.Interfaces.Enums", ["GraphicObjectType", "ObjectType"]),
        ("DWSIM.Enums.GraphicObjects", ["ObjectType", "GraphicObjectType"]),
    ]
    for module_path, type_names in candidates:
        try:
            module = __import__(module_path, fromlist=type_names)
        except ImportError:
            continue
        for type_name in type_names:
            enum_type = getattr(module, type_name, None)
            if enum_type:
                logger.info(f"Found ObjectType enum: {module_path}.{type_name}")
                try:
                    members = [m for m in dir(enum_type) if not m.startswith('_')]
                    logger.debug(f"  Enum members (first 20): {members[:20]}")
                except Exception:
                    pass
                return enum_type
    logger.warning("Could not find DWSIM ObjectType enum; will fall back to string-based calls")
    return None

def _get_enum_member(enum_type, *names):
    """Return the first matching enum value from a list of candidate names."""
    if not enum_type:
        return None
    for name in names:
        if hasattr(enum_type, name):
            return getattr(enum_type, name)
        # Try a variant without underscores/spaces
        compact = name.replace("_", "").replace(" ", "")
        if hasattr(enum_type, compact):
            return getattr(enum_type, compact)
    return None

def _log_overloads(obj, method_name):
    """Log the .NET overload signatures for a given method."""
    try:
        import System
        overloads = [mi for mi in type(obj).GetMethods() if mi.Name == method_name]
        if not overloads:
            logger.info(f"No overloads found for {method_name}")
            return
        logger.info(f"{method_name} overloads:")
        for mi in overloads:
            params = ", ".join(f"{p.ParameterType.Name} {p.Name}" for p in mi.GetParameters())
            logger.info(f"  {method_name}({params}) -> {mi.ReturnType.Name}")
    except Exception as e:
        logger.debug(f"Could not inspect overloads for {method_name}: {e}")

def _try_methods(methods):
    """Attempt a list of (description, callable) pairs, returning first non-None result."""
    for desc, method in methods:
        if method is None:
            continue
        try:
            result = method()
            if result is not None:
                logger.info(f"✓ {desc} works")
                return result
            logger.debug(f"✗ {desc} returned None")
        except Exception as e:
            logger.debug(f"✗ {desc} failed: {e}")
    return None

def inspect_method_signatures(obj, method_name):
    """Inspect all overloads of a method."""
    try:
        method = getattr(obj, method_name)
        # Try to get method info (works with pythonnet)
        logger.info(f"  Method '{method_name}' found")
        # Try to call with different signatures to see what works
        return True
    except AttributeError:
        return False

def test_dwsim_api():
    """Test DWSIM Automation API to discover actual method names and signatures."""
    try:
        import pythonnet
        import clr
        
        # Load DWSIM automation
        lib_path = os.getenv('DWSIM_LIB_PATH', 'C:/Program Files/DWSIM')
        if str(lib_path) not in sys.path:
            sys.path.append(str(lib_path))
        
        # Load DWSIM.Automation.dll
        clr.AddReference("DWSIM.Automation")
        from DWSIM.Automation import Automation3
        
        automation = Automation3()
        logger.info("✓ DWSIM Automation loaded successfully")
        
        # Test 1: Create new flowsheet
        logger.info("\n=== Testing Flowsheet Creation ===")
        flowsheet = None
        try:
            flowsheet = automation.CreateFlowsheet()
            logger.info("✓ CreateFlowsheet() works")
        except Exception as e:
            logger.error(f"✗ CreateFlowsheet() failed: {e}")
            try:
                flowsheet = automation.NewFlowsheet()
                logger.info("✓ NewFlowsheet() works (fallback)")
            except Exception as e2:
                logger.error(f"✗ NewFlowsheet() also failed: {e2}")
                return
        
        if not flowsheet:
            logger.error("Failed to create flowsheet")
            return
        
        # Test 2: Inspect flowsheet object
        logger.info("\n=== Inspecting Flowsheet Object ===")
        logger.info(f"Flowsheet type: {type(flowsheet)}")
        
        # Get all methods (excluding private ones)
        all_methods = [m for m in dir(flowsheet) if not m.startswith('_')]
        logger.info(f"Available methods (first 30): {all_methods[:30]}")
        
        # Look for AddObject-related methods
        add_methods = [m for m in all_methods if 'add' in m.lower() or 'create' in m.lower() or 'new' in m.lower()]
        logger.info(f"Methods with 'add/create/new': {add_methods}")

        # Inspect overloads for object-creation methods
        for name in ["AddObject", "AddFlowsheetObject", "AddSimulationObject", "AddGraphicObject"]:
            if hasattr(flowsheet, name):
                _log_overloads(flowsheet, name)
        
        # Discover the ObjectType enum (needed for AddObject signature)
        object_type_enum = _find_object_type_enum()
        ms_enum = _get_enum_member(object_type_enum, "MaterialStream", "Material_Stream", "Material")
        pump_enum = _get_enum_member(object_type_enum, "Pump")
        
        # Test 3: Property package
        logger.info("\n=== Testing Property Package ===")
        try:
            flowsheet.PropertyPackage = "Peng-Robinson"
            logger.info("✓ PropertyPackage property works")
        except Exception as e:
            logger.warning(f"✗ PropertyPackage property failed: {e}")
        
        # Test 4: Add components
        logger.info("\n=== Testing Component Addition ===")
        try:
            flowsheet.AddCompound("Water")
            logger.info("✓ AddCompound('Water') works")
        except Exception as e:
            logger.error(f"✗ AddCompound() failed: {e}")
        
        # Test 5: Create material stream - try multiple signatures
        logger.info("\n=== Testing Material Stream Creation ===")
        stream = None
        stream_methods = []
        if ms_enum:
            stream_methods.extend([
                ("AddObject(ObjectType.MaterialStream, 'test-stream', 100, 100)", lambda: flowsheet.AddObject(ms_enum, "test-stream", 100.0, 100.0)),
                ("AddObject(ObjectType.MaterialStream, 'test-stream')", lambda: flowsheet.AddObject(ms_enum, "test-stream")),
                ("AddFlowsheetObject(ObjectType.MaterialStream, ...)", lambda: flowsheet.AddFlowsheetObject(ms_enum, "test-stream", 100.0, 100.0) if hasattr(flowsheet, 'AddFlowsheetObject') else None),
                ("AddFlowsheetObject(ObjectType.MaterialStream, ...) no coords", lambda: flowsheet.AddFlowsheetObject(ms_enum, "test-stream") if hasattr(flowsheet, 'AddFlowsheetObject') else None),
                ("AddSimulationObject(ObjectType.MaterialStream, ...)", lambda: flowsheet.AddSimulationObject(ms_enum, "test-stream", 100.0, 100.0) if hasattr(flowsheet, 'AddSimulationObject') else None),
                ("AddSimulationObject(ObjectType.MaterialStream, ...) no coords", lambda: flowsheet.AddSimulationObject(ms_enum, "test-stream") if hasattr(flowsheet, 'AddSimulationObject') else None),
            ])
        
        # String/alt-name fallbacks
        for type_name in ["MaterialStream", "Material Stream"]:
            stream_methods.extend([
                (f"AddFlowsheetObject('{type_name}', ...)", lambda tn=type_name: flowsheet.AddFlowsheetObject(tn, "test-stream", 100, 100) if hasattr(flowsheet, 'AddFlowsheetObject') else None),
                (f"AddFlowsheetObject('{type_name}', ...) no coords", lambda tn=type_name: flowsheet.AddFlowsheetObject(tn, "test-stream") if hasattr(flowsheet, 'AddFlowsheetObject') else None),
                (f"AddSimulationObject('{type_name}', ...)", lambda tn=type_name: flowsheet.AddSimulationObject(tn, "test-stream", 100, 100) if hasattr(flowsheet, 'AddSimulationObject') else None),
                (f"AddSimulationObject('{type_name}', ...) no coords", lambda tn=type_name: flowsheet.AddSimulationObject(tn, "test-stream") if hasattr(flowsheet, 'AddSimulationObject') else None),
                (f"AddGraphicObject('{type_name}', ...)", lambda tn=type_name: flowsheet.AddGraphicObject(tn, "test-stream", 100, 100) if hasattr(flowsheet, 'AddGraphicObject') else None),
                (f"AddGraphicObject('{type_name}', ...) no coords", lambda tn=type_name: flowsheet.AddGraphicObject(tn, "test-stream") if hasattr(flowsheet, 'AddGraphicObject') else None),
                (f"AddObject('{type_name}', ...)", lambda tn=type_name: flowsheet.AddObject(tn, "test-stream", 100, 100)),
                (f"AddObject('{type_name}', ...) no coords", lambda tn=type_name: flowsheet.AddObject(tn, "test-stream")),
            ])
        
        stream_methods.extend([
            ("CreateMaterialStream", lambda: flowsheet.CreateMaterialStream("test-stream", 100, 100) if hasattr(flowsheet, 'CreateMaterialStream') else None),
            ("AddMaterialStream", lambda: flowsheet.AddMaterialStream("test-stream", 100, 100) if hasattr(flowsheet, 'AddMaterialStream') else None),
            ("NewMaterialStream", lambda: flowsheet.NewMaterialStream("test-stream", 100, 100) if hasattr(flowsheet, 'NewMaterialStream') else None),
        ])
        
        stream = _try_methods(stream_methods)
        
        if stream:
            logger.info(f"  Stream type: {type(stream)}")
            logger.info(f"  Stream methods: {[m for m in dir(stream) if not m.startswith('_')][:15]}")
        else:
            logger.error("✗ Could not create stream with any method")
        
        # Test 6: Set stream properties (if stream was created)
        if stream:
            logger.info("\n=== Testing Stream Property Setting ===")
            try:
                stream.SetProp("temperature", "overall", None, "", "K", 373.15)
                logger.info("✓ SetProp('temperature', ...) works")
            except Exception as e:
                logger.warning(f"✗ SetProp() failed: {e}")
        
        # Test 7: Create unit operation - try multiple signatures
        logger.info("\n=== Testing Unit Operation Creation ===")
        unit = None
        unit_methods = []
        if pump_enum:
            unit_methods.extend([
                ("AddObject(ObjectType.Pump, 'test-pump', 300, 100)", lambda: flowsheet.AddObject(pump_enum, "test-pump", 300.0, 100.0)),
                ("AddObject(ObjectType.Pump, 'test-pump')", lambda: flowsheet.AddObject(pump_enum, "test-pump")),
                ("AddFlowsheetObject(ObjectType.Pump, ...)", lambda: flowsheet.AddFlowsheetObject(pump_enum, "test-pump", 300.0, 100.0) if hasattr(flowsheet, 'AddFlowsheetObject') else None),
                ("AddFlowsheetObject(ObjectType.Pump, ...) no coords", lambda: flowsheet.AddFlowsheetObject(pump_enum, "test-pump") if hasattr(flowsheet, 'AddFlowsheetObject') else None),
                ("AddSimulationObject(ObjectType.Pump, ...)", lambda: flowsheet.AddSimulationObject(pump_enum, "test-pump", 300.0, 100.0) if hasattr(flowsheet, 'AddSimulationObject') else None),
                ("AddSimulationObject(ObjectType.Pump, ...) no coords", lambda: flowsheet.AddSimulationObject(pump_enum, "test-pump") if hasattr(flowsheet, 'AddSimulationObject') else None),
            ])
        
        for type_name in ["Pump"]:
            unit_methods.extend([
                (f"AddObject('{type_name}', ...)", lambda tn=type_name: flowsheet.AddObject(tn, "test-pump", 300, 100)),
                (f"AddObject('{type_name}', ...) no coords", lambda tn=type_name: flowsheet.AddObject(tn, "test-pump")),
                (f"AddFlowsheetObject('{type_name}', ...)", lambda tn=type_name: flowsheet.AddFlowsheetObject(tn, "test-pump", 300, 100) if hasattr(flowsheet, 'AddFlowsheetObject') else None),
                (f"AddFlowsheetObject('{type_name}', ...) no coords", lambda tn=type_name: flowsheet.AddFlowsheetObject(tn, "test-pump") if hasattr(flowsheet, 'AddFlowsheetObject') else None),
                (f"AddSimulationObject('{type_name}', ...)", lambda tn=type_name: flowsheet.AddSimulationObject(tn, "test-pump", 300, 100) if hasattr(flowsheet, 'AddSimulationObject') else None),
                (f"AddSimulationObject('{type_name}', ...) no coords", lambda tn=type_name: flowsheet.AddSimulationObject(tn, "test-pump") if hasattr(flowsheet, 'AddSimulationObject') else None),
                (f"AddGraphicObject('{type_name}', ...)", lambda tn=type_name: flowsheet.AddGraphicObject(tn, "test-pump", 300, 100) if hasattr(flowsheet, 'AddGraphicObject') else None),
                (f"AddGraphicObject('{type_name}', ...) no coords", lambda tn=type_name: flowsheet.AddGraphicObject(tn, "test-pump") if hasattr(flowsheet, 'AddGraphicObject') else None),
            ])
        
        unit_methods.extend([
            ("CreatePump", lambda: flowsheet.CreatePump("test-pump", 300, 100) if hasattr(flowsheet, 'CreatePump') else None),
            ("AddPump", lambda: flowsheet.AddPump("test-pump", 300, 100) if hasattr(flowsheet, 'AddPump') else None),
            ("NewPump", lambda: flowsheet.NewPump("test-pump", 300, 100) if hasattr(flowsheet, 'NewPump') else None),
        ])

        unit = _try_methods(unit_methods)
        
        if unit:
            logger.info(f"  Unit type: {type(unit)}")
            logger.info(f"  Unit methods: {[m for m in dir(unit) if not m.startswith('_')][:15]}")
        else:
            logger.error("✗ Could not create unit with any method")
        
        # Test 8: Try to inspect AddObject method signature using reflection
        logger.info("\n=== Inspecting AddObject Method ===")
        try:
            add_object_method = getattr(flowsheet, 'AddObject')
            logger.info(f"AddObject method found: {add_object_method}")
            logger.info(f"AddObject type: {type(add_object_method)}")
            
            # Try to get method info (this might work with pythonnet)
            try:
                import System
                method_info = add_object_method.GetType()
                logger.info(f"AddObject method type info: {method_info}")
            except:
                pass
        except Exception as e:
            logger.warning(f"Could not inspect AddObject: {e}")
        
        # Test 9: Get streams and units
        logger.info("\n=== Testing Get Methods ===")
        streams = None
        try:
            streams = flowsheet.GetMaterialStreams()
            logger.info(f"✓ GetMaterialStreams() works, returned {len(streams) if hasattr(streams, '__len__') else 'N/A'} streams")
        except Exception as e:
            logger.warning(f"✗ GetMaterialStreams() failed: {e}")
            if hasattr(flowsheet, 'MaterialStreams'):
                try:
                    streams = flowsheet.MaterialStreams
                    logger.info(f"✓ MaterialStreams property works, type: {type(streams)}")
                    if hasattr(streams, '__len__'):
                        logger.info(f"  Collection has {len(streams)} items")
                    elif hasattr(streams, 'Count'):
                        logger.info(f"  Collection has {streams.Count} items")
                except Exception as prop_e:
                    logger.warning(f"  MaterialStreams property access failed: {prop_e}")
        
        units = None
        try:
            units = flowsheet.GetUnitOperations()
            logger.info(f"✓ GetUnitOperations() works, returned {len(units) if hasattr(units, '__len__') else 'N/A'} units")
        except Exception as e:
            logger.warning(f"✗ GetUnitOperations() failed: {e}")
            if hasattr(flowsheet, 'UnitOperations'):
                try:
                    units = flowsheet.UnitOperations
                    logger.info(f"✓ UnitOperations property works, type: {type(units)}")
                    if hasattr(units, '__len__'):
                        logger.info(f"  Collection has {len(units)} items")
                    elif hasattr(units, 'Count'):
                        logger.info(f"  Collection has {units.Count} items")
                except Exception as prop_e:
                    logger.warning(f"  UnitOperations property access failed: {prop_e}")
        
        # Test 10: Calculate flowsheet
        logger.info("\n=== Testing CalculateFlowsheet ===")
        try:
            automation.CalculateFlowsheet(flowsheet, None)
            logger.info("✓ CalculateFlowsheet() works")
        except Exception as e:
            logger.warning(f"✗ CalculateFlowsheet() failed: {e}")
        
        logger.info("\n=== Test Complete ===")
        logger.info("\n=== SUMMARY ===")
        logger.info("Working methods:")
        logger.info("  - CreateFlowsheet()" if flowsheet else "  - Flowsheet creation: FAILED")
        logger.info("  - AddCompound()" if 'AddCompound' in str(dir(flowsheet)) else "  - Component addition: Check manually")
        logger.info("  - Stream creation: " + ("SUCCESS" if stream else "FAILED - need to find correct method"))
        logger.info("  - Unit creation: " + ("SUCCESS" if unit else "FAILED - need to find correct method"))
        
    except ImportError as e:
        logger.error(f"Failed to import pythonnet/clr: {e}")
        logger.error("Make sure pythonnet is installed and DWSIM is available")
    except Exception as e:
        logger.exception(f"Unexpected error: {e}")

if __name__ == "__main__":
    test_dwsim_api()
