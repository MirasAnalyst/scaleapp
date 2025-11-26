# DWSIM API Fixes Applied

## Issues Identified from Windows Test Output

1. **AddObject() method failing** - `AddObject('MaterialStream', ...)` and `AddObject('Pump', ...)` were failing with "No method matches given arguments"
2. **GetMaterialStreams() and GetUnitOperations() failing** - Methods not found, but properties `MaterialStreams` and `UnitOperations` might exist
3. **ThermoCPropertyPackage error** - `System.IO.FileNotFoundException` for "ThermoCS.dll" indicating missing DWSIM internal dependency

## Fixes Applied

### 1. Enhanced Stream Creation (`_create_streams`)

**Problem**: `AddObject("MaterialStream", ...)` was failing with all tested signatures.

**Solution**: 
- Added multiple fallback methods:
  - Different `AddObject` signatures (with/without coordinates, float casting)
  - Alternative method names: `CreateMaterialStream`, `AddMaterialStream`, `NewMaterialStream`
  - Collection-based creation via `_create_stream_via_collection` (placeholder for future implementation)
- Fixed lambda closure issues by using default arguments in helper functions

**Location**: `services/dwsim_api/app/dwsim_client.py`, lines 474-545

### 2. Enhanced Unit Creation (`_create_units`)

**Problem**: `AddObject("Pump", ...)` was failing with all tested signatures.

**Solution**:
- Added multiple fallback methods:
  - Different `AddObject` signatures (with/without coordinates, float casting)
  - Type-specific methods via `_create_unit_via_method` (e.g., `CreatePump`, `AddPump`, `NewPump`)
  - Collection-based creation via `_create_unit_via_collection` (placeholder for future implementation)
- Fixed lambda closure issues by using default arguments in helper functions

**Location**: `services/dwsim_api/app/dwsim_client.py`, lines 547-628

### 3. Fixed Stream/Unit Retrieval (`_extract_streams` and `_extract_units`)

**Problem**: `GetMaterialStreams()` and `GetUnitOperations()` were failing with `AttributeError`.

**Solution**:
- Added fallback to use properties instead of methods:
  - Try `flowsheet.GetMaterialStreams()` first
  - Fallback to `flowsheet.MaterialStreams` property if method fails
  - Try `flowsheet.GetUnitOperations()` first
  - Fallback to `flowsheet.UnitOperations` property if method fails
- Enhanced error handling to work with both iterable collections and single objects
- Added support for alternative property access patterns (e.g., `GraphicObject.Tag` for names)

**Location**: `services/dwsim_api/app/dwsim_client.py`, lines 726-810

### 4. ThermoCPropertyPackage Error Handling

**Problem**: `ThermoCPropertyPackage` instantiation was failing due to missing "ThermoCS.dll" dependency.

**Solution**:
- Added detection and avoidance of ThermoC-related property packages
- Automatic fallback to "Peng-Robinson" if ThermoC package is requested or fails
- Enhanced error detection to catch `FileNotFoundException` for ThermoCS.dll
- Added warning messages to inform users of the fallback

**Location**: `services/dwsim_api/app/dwsim_client.py`, lines 357-409

### 5. Enhanced Test Script (`test_api_discovery.py`)

**Improvements**:
- Better detection of `MaterialStreams` and `UnitOperations` properties
- Reports collection types and item counts
- More detailed error messages

**Location**: `services/dwsim_api/test_api_discovery.py`, lines 206-223

## Testing Recommendations

1. **Run `test_api_discovery.py`** on Windows to verify which methods actually work:
   ```powershell
   cd services/dwsim_api
   python test_api_discovery.py
   ```

2. **Run `test_simple_flowsheet.py`** to test end-to-end:
   ```powershell
   python test_simple_flowsheet.py
   ```

3. **Check the output** for:
   - Successful stream creation (should show which method worked)
   - Successful unit creation (should show which method worked)
   - Successful stream/unit retrieval (should show whether methods or properties were used)
   - No ThermoCPropertyPackage errors

## Expected Behavior After Fixes

- **Stream Creation**: Will try multiple methods and report which one works (or all fail with detailed warnings)
- **Unit Creation**: Will try multiple methods and report which one works (or all fail with detailed warnings)
- **Stream/Unit Retrieval**: Will use methods if available, otherwise fall back to properties
- **Property Package**: Will avoid ThermoC packages and use Peng-Robinson as fallback

## Next Steps if Issues Persist

If `AddObject` still fails after all these attempts, the DWSIM Automation API on your specific installation may use a completely different approach. In that case:

1. Check the `test_api_discovery.py` output for any methods that successfully created streams/units
2. Look for collection-based APIs (e.g., `flowsheet.MaterialStreams.Add(...)`)
3. Check DWSIM documentation for the specific API version you're using
4. Consider using DWSIM's GUI automation instead of direct API calls

## Notes

- The fixes are backward-compatible - they try the original methods first before falling back
- All errors are caught and logged with detailed warnings
- The code will continue to work even if some methods fail (partial results will be returned)
- ThermoCPropertyPackage errors are handled gracefully with automatic fallback

