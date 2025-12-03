# DWSIM Property Setting - Root Cause Analysis

## Current Status
- `has_setprop: false` - MaterialStream objects don't expose `SetProp` through pythonnet
- `has_setpropertyvalue: true` - `SetPropertyValue` exists but returns empty strings
- `stream_type: ISimulationObject` - We're getting interface objects, not concrete MaterialStream

## Root Cause

**MaterialStream objects in this DWSIM version don't expose `SetProp` through pythonnet.**

This is a fundamental limitation of how DWSIM's .NET objects are exposed through pythonnet. The `SetProp` method exists in the .NET code, but it's not accessible through the Python interface.

### Evidence:
1. **Diagnostics show `has_setprop: false`** - Even after extensive resolution attempts
2. **MaterialStreams collection objects also don't have SetProp** - `all_materialstreams_in_collection` would show this if populated
3. **SetPropertyValue exists but doesn't work** - Returns empty strings, indicating the method exists but isn't functional

## Why SetPropertyValue Doesn't Work

`SetPropertyValue` on `ISimulationObject` interface:
- Exists (method is callable)
- Doesn't throw errors
- But returns empty strings when reading back
- This suggests it's a stub/interface method that doesn't actually set properties

## Potential Solutions

### Solution 1: Use Property IDs Instead of Names
`SetPropertyValue` might require property IDs (integers) instead of property name strings:
```python
stream_obj.SetPropertyValue(1, 298.15)  # Temperature property ID = 1
stream_obj.SetPropertyValue(2, 101.3)   # Pressure property ID = 2
```

**Status**: Added to code - will try property IDs first

### Solution 2: Access Through PropertyPackage
Properties might need to be set through the PropertyPackage:
```python
pp = stream_obj.PropertyPackage
pp.SetProperty(stream_obj, "temperature", 298.15)
```

**Status**: Added to code - will try PropertyPackage methods

### Solution 3: Use Direct Property Assignment
Some DWSIM versions expose properties as direct attributes:
```python
stream_obj.Temperature = 298.15
stream_obj.Pressure = 101.3
```

**Status**: Already in code - tries direct attributes

### Solution 4: Use Flowsheet Calculation Methods
Properties might need to be set through flowsheet-level methods:
```python
flowsheet.SetStreamProperty(stream_obj, "temperature", 298.15)
```

**Status**: Not yet implemented - could be added

### Solution 5: Use DWSIM's Internal Property System
DWSIM might use a different property system that requires:
- Property constants/enums
- Phase-specific property setting
- Component-specific property setting

**Status**: Partially implemented - tries various property name formats

## Next Steps

1. **Check Windows VM Logs** - Look for:
   - Which property setters are being tried
   - Specific error messages
   - Whether property IDs work
   - Whether PropertyPackage methods exist

2. **Test Property IDs** - The updated code now tries property IDs first (1, 2, 3, etc.)

3. **Test PropertyPackage** - The updated code now tries PropertyPackage methods

4. **If Still Not Working** - Consider:
   - Using DWSIM's file-based API (save/load flowsheet files)
   - Using DWSIM's scripting interface
   - Using a different DWSIM API version
   - Contacting DWSIM developers for pythonnet compatibility

## Verification

After deploying the updated code with property ID support:
- Check logs for "✓ Successfully set property" messages
- Check if property IDs work (method 0 or 1 should succeed)
- Check if PropertyPackage methods work
- Verify properties are set (non-null in response)

If property IDs don't work, the issue is likely a fundamental pythonnet limitation with this DWSIM version.

