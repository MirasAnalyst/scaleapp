# DWSIM API Debugging Summary

## Current Status

### What's Working ✅
- DWSIM API service is running and accessible
- Streams are being created (2 streams created)
- Units are being created (1 unit created)
- Stream and unit extraction is working (correct IDs returned)
- DWSIM is running (not mock mode)

### What's Not Working ❌
- **Stream connections**: All connection methods fail
- **Property setting**: Properties are specified but not being set
- **Property reading**: All properties return null/empty

## Key Findings from Diagnostics

### Stream Object Type
- Stream objects are `ISimulationObject` interface, not `MaterialStream`
- `SetPropertyValue` exists but returns empty strings
- `GetPropertyValue` exists but returns empty strings
- `GetProp` is not available on `ISimulationObject`

### Property Setting Attempts
- Properties are correctly specified in payload:
  - Temperature: 25°C
  - Pressure: 101.3 kPa
  - Flow rate: 1000 kg/h
  - Composition: Water (1.0)
- But `GetPropertyValue` returns empty strings `""`
- This means `SetPropertyValue` is being called but not working

### Connection Attempts
- All connection methods fail:
  - `SetInletStream` / `SetOutletStream` - don't exist
  - `SetInletMaterialStream` / `SetOutletMaterialStream` - don't exist
  - `ConnectInlet` / `ConnectOutlet` - don't exist
  - GraphicObject connections - don't work
  - Flowsheet-level connections - don't exist

## Root Cause Analysis

The core issue is that we're getting `ISimulationObject` interface objects instead of actual `MaterialStream` objects. The interface has `SetPropertyValue` and `GetPropertyValue` methods, but they don't seem to work for setting properties.

## Possible Solutions

### Option 1: Resolve to Actual MaterialStream
- Find the actual `MaterialStream` object from `MaterialStreams` collection
- Use `SetProp` method (which should exist on MaterialStream)
- This is what the code is trying to do, but resolution isn't working

### Option 2: Use Different Property Setting API
- `SetPropertyValue` might need different parameters
- Might need to use `SetPropertyValue2` or other variants
- Might need phase/component parameters

### Option 3: Use Direct Property Assignment
- Try setting properties as attributes: `stream.Temperature = value`
- Try using property setters if available

### Option 4: Check DWSIM API Documentation
- Need to verify the correct method signatures
- May need to use a different API approach entirely

## Next Steps

1. **Check Windows VM API Logs** - Look for:
   - Which property setters are being tried
   - Specific error messages from SetPropertyValue
   - Whether MaterialStream resolution is working
   - Any exceptions during property setting

2. **Test Direct MaterialStream Access** - Try:
   - Getting MaterialStream directly from collection by index
   - Using the last created stream (most recent)
   - Checking if streams have different names than expected

3. **Try Alternative Property Setting** - Test:
   - Direct attribute assignment: `stream.Temperature = 298.15`
   - Property setters: `stream.SetTemperature(298.15)`
   - Different SetPropertyValue signatures

4. **Verify Stream Creation** - Check:
   - What object type is returned from `AddFlowsheetObject`
   - Whether we need to cast ISimulationObject to MaterialStream
   - If there's a conversion method available

## Test Payload

The test payload is correctly formatted:
```json
{
  "name": "test-pump-flowsheet",
  "units": [{"id": "pump-1", "type": "pump", ...}],
  "streams": [
    {
      "id": "BB-feed",
      "target": "pump-1",
      "properties": {
        "temperature": 25,
        "pressure": 101.3,
        "flow_rate": 1000,
        "composition": {"Water": 1.0}
      }
    }
  ],
  "thermo": {"package": "Peng-Robinson", "components": ["Water"]}
}
```

## Windows VM API Logs Needed

To debug further, we need to see the Windows VM API service logs showing:
- Stream creation messages
- Property setting attempts and results
- MaterialStream collection lookup results
- Any error messages or exceptions

