#!/usr/bin/env python3
"""Test script to discover DWSIM Automation API methods and test with a simple flowsheet."""

import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from loguru import logger

# Set up logging
logger.remove()
logger.add(sys.stderr, level="DEBUG")

def test_dwsim_api():
    """Test DWSIM Automation API to discover actual method names."""
    try:
        import pythonnet
        import clr

        # Load DWSIM automation
        lib_path = os.getenv('DWSIM_LIB_PATH', 'C:/Program Files/DWSIM')
        if str(lib_path) not in sys.path:
            sys.path.append(str(lib_path))

        # Load DWSIM.Automation.dll
        clr.AddReference("DWSIM.Automation")
        clr.AddReference("DWSIM.Interfaces")
        from DWSIM.Automation import Automation3
        from DWSIM.Interfaces.Enums import GraphicObjects as GO
        
        automation = Automation3()
        logger.info("✓ DWSIM Automation loaded successfully")
        
        # Test 1: Create new flowsheet
        logger.info("\n=== Testing Flowsheet Creation ===")
        try:
            flowsheet = automation.NewFlowsheet()
            logger.info("✓ NewFlowsheet() works")
        except Exception as e:
            logger.error(f"✗ NewFlowsheet() failed: {e}")
            # Try alternative
            try:
                flowsheet = automation.CreateFlowsheet()
                logger.info("✓ CreateFlowsheet() works (alternative)")
            except Exception as e2:
                logger.error(f"✗ CreateFlowsheet() also failed: {e2}")
                return
        
        # Test 2: Inspect flowsheet object
        logger.info("\n=== Inspecting Flowsheet Object ===")
        logger.info(f"Flowsheet type: {type(flowsheet)}")
        logger.info(f"Flowsheet methods: {[m for m in dir(flowsheet) if not m.startswith('_')][:20]}")
        
        # Test 3: Property package
        logger.info("\n=== Testing Property Package ===")
        try:
            flowsheet.SetPropertyPackage("Peng-Robinson")
            logger.info("✓ SetPropertyPackage() works")
        except AttributeError:
            try:
                flowsheet.PropertyPackage = "Peng-Robinson"
                logger.info("✓ PropertyPackage property works")
            except Exception as e:
                logger.warning(f"✗ Property package setting failed: {e}")
                # Try other methods
                for method in ['SetPropertyPackageName', 'SetThermoPackage', 'PropertyPackageName']:
                    if hasattr(flowsheet, method):
                        logger.info(f"  Found method: {method}")
        
        # Test 4: Add components
        logger.info("\n=== Testing Component Addition ===")
        try:
            flowsheet.AddComponent("Water")
            logger.info("✓ AddComponent() works")
        except AttributeError:
            # Try alternatives
            for method in ['AddCompound', 'AddChemical', 'AddComponentToFlowsheet']:
                if hasattr(flowsheet, method):
                    logger.info(f"  Found method: {method}")
                    try:
                        getattr(flowsheet, method)("Water")
                        logger.info(f"✓ {method}() works")
                        break
                    except Exception as e:
                        logger.warning(f"  {method}() failed: {e}")
        
        # Test 5: Create material stream
        logger.info("\n=== Testing Material Stream Creation ===")
        def _enum_value(enum_cls, name):
            """Return enum value by loose name matching."""
            for attr in dir(enum_cls):
                if attr.lower() == name.lower() or attr.replace("_", "").lower() == name.replace(" ", "").lower():
                    return getattr(enum_cls, attr)
            return None

        def _find_go_enum(name: str):
            """Try multiple GO enums to resolve a type name."""
            for enum_attr in ["ObjectType", "GraphicObjectType"]:
                enum_cls = getattr(GO, enum_attr, None)
                if enum_cls:
                    val = _enum_value(enum_cls, name)
                    if val:
                        logger.info(f"Using GO.{enum_attr}.{name} for AddObject")
                        return val
            logger.warning(f"Could not resolve enum value for {name}; falling back to string overloads")
            return None

        ms_enum = _find_go_enum("MaterialStream")
        try:
            stream = None
            if ms_enum:
                stream = flowsheet.AddObject(ms_enum, 100, 100, "test-stream")
                logger.info("✓ AddObject(ObjectType.MaterialStream, ...) works")
            else:
                stream = flowsheet.AddObject("MaterialStream", "test-stream", 100, 100)
                logger.info("✓ AddObject('MaterialStream', ...) works (string overload)")
            logger.info(f"  Stream type: {type(stream)}")
            logger.info(f"  Stream methods: {[m for m in dir(stream) if not m.startswith('_')][:15]}")
        except Exception as e:
            logger.error(f"✗ AddObject() failed: {e}")
            # Try alternatives
            for method in ['CreateMaterialStream', 'AddMaterialStream', 'NewMaterialStream']:
                if hasattr(flowsheet, method):
                    logger.info(f"  Found method: {method}")

        # Test 6: Set stream properties
        logger.info("\n=== Testing Stream Property Setting ===")
        try:
            stream = None
            if ms_enum:
                stream = flowsheet.AddObject(ms_enum, 200, 100, "test-stream-2")
            else:
                stream = flowsheet.AddObject("MaterialStream", "test-stream-2", 200, 100)
            stream.SetProp("temperature", "overall", None, "", "K", 373.15)
            logger.info("✓ SetProp('temperature', ...) works")
        except Exception as e:
            logger.warning(f"✗ SetProp() failed: {e}")
            # Check for alternatives
            if stream is not None and hasattr(stream, 'Temperature'):
                logger.info("  Found property: Temperature")
            if stream is not None and hasattr(stream, 'SetTemperature'):
                logger.info("  Found method: SetTemperature")
        
        # Test 7: Create unit operation
        logger.info("\n=== Testing Unit Operation Creation ===")
        try:
            pump_enum = _find_go_enum("Pump") if 'GO' in locals() else None
            if pump_enum:
                unit = flowsheet.AddObject(pump_enum, 300, 100, "test-pump")
                logger.info("✓ AddObject(ObjectType.Pump, ...) works")
            else:
                unit = flowsheet.AddObject("Pump", "test-pump", 300, 100)
                logger.info("✓ AddObject('Pump', ...) works (string overload)")
            logger.info(f"  Unit type: {type(unit)}")
            logger.info(f"  Unit methods: {[m for m in dir(unit) if not m.startswith('_')][:15]}")
        except Exception as e:
            logger.error(f"✗ AddObject('Pump', ...) failed: {e}")
        
        # Test 8: Get streams and units
        logger.info("\n=== Testing Get Methods ===")
        try:
            streams = flowsheet.GetMaterialStreams()
            logger.info(f"✓ GetMaterialStreams() works, returned {len(streams)} streams")
        except Exception as e:
            logger.warning(f"✗ GetMaterialStreams() failed: {e}")
            if hasattr(flowsheet, 'MaterialStreams'):
                logger.info("  Found property: MaterialStreams")
        
        try:
            units = flowsheet.GetUnitOperations()
            logger.info(f"✓ GetUnitOperations() works, returned {len(units)} units")
        except Exception as e:
            logger.warning(f"✗ GetUnitOperations() failed: {e}")
            if hasattr(flowsheet, 'UnitOperations'):
                logger.info("  Found property: UnitOperations")
        
        # Test 9: Calculate flowsheet
        logger.info("\n=== Testing CalculateFlowsheet ===")
        try:
            automation.CalculateFlowsheet(flowsheet, None)
            logger.info("✓ CalculateFlowsheet() works")
        except Exception as e:
            logger.warning(f"✗ CalculateFlowsheet() failed: {e}")
            logger.info(f"  Error type: {type(e).__name__}")
            logger.info(f"  Error message: {str(e)}")
        
        logger.info("\n=== Test Complete ===")
        
    except ImportError as e:
        logger.error(f"Failed to import pythonnet/clr: {e}")
        logger.error("Make sure pythonnet is installed and DWSIM is available")
    except Exception as e:
        logger.exception(f"Unexpected error: {e}")

if __name__ == "__main__":
    test_dwsim_api()
