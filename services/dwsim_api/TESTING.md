# Testing DWSIM API Implementation

This document describes how to test the JSON-to-DWSIM mapping implementation and discover the actual DWSIM Automation API method names.

## Prerequisites

1. DWSIM installed on Windows (or Linux with Mono)
2. Python environment with dependencies installed
3. `DWSIM_LIB_PATH` environment variable set to DWSIM installation directory

## Step 1: Discover DWSIM API Methods

Run the API discovery script to find the actual method names:

```powershell
# On Windows
cd services\dwsim_api
.venv\Scripts\activate
python test_api_methods.py
```

This script will:
- Test `NewFlowsheet()` vs `CreateFlowsheet()`
- Test property package setting methods
- Test component addition methods
- Test stream and unit creation methods
- Test property setting methods
- List available methods on flowsheet, stream, and unit objects

**Expected output:** A list of which methods work and which don't, along with alternative method names found.

## Step 2: Test Simple Flowsheet

Run the simple flowsheet test:

```powershell
python test_simple_flowsheet.py
```

This creates a simple flowsheet:
- Feed stream (Water, 25°C, 101.3 kPa, 1000 kg/h)
- Pump (pressure rise: 100 kPa, efficiency: 75%)
- Product stream

**Expected output:** Simulation results with stream properties and unit status.

## Step 3: Adjust Implementation Based on Results

Based on the test results, update `services/dwsim_api/app/dwsim_client.py`:

### Common Issues and Fixes

1. **`NewFlowsheet()` doesn't work**
   - Try: `CreateFlowsheet()` or `automation.NewFlowsheet()`

2. **`SetPropertyPackage()` doesn't work**
   - Try: `flowsheet.PropertyPackage = "Peng-Robinson"`
   - Or: `flowsheet.SetPropertyPackageName("Peng-Robinson")`

3. **`AddComponent()` doesn't work**
   - Try: `flowsheet.AddCompound("Water")`
   - Or: `flowsheet.AddChemical("Water")`

4. **`AddObject()` doesn't work**
   - Check exact signature: `flowsheet.AddObject(type, name, x, y)`
   - May need: `flowsheet.AddObject(type, name)` without coordinates

5. **`SetProp()` doesn't work**
   - Try: `stream.Temperature = 373.15`
   - Or: `stream.SetTemperature(373.15)`
   - Check property names: may be case-sensitive or different names

6. **`GetMaterialStreams()` doesn't work**
   - Try: `flowsheet.MaterialStreams` (property)
   - Or: `flowsheet.GetStreams()`

7. **`SetInletStream()` / `SetOutletStream()` don't work**
   - Check if units have different connection methods
   - May need port indices or different method names

## Step 4: Test via API Endpoint

Once the implementation is adjusted, test via the API:

```powershell
# Start the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8081

# In another terminal, test with curl
curl -X POST http://localhost:8081/simulate ^
  -H "Content-Type: application/json" ^
  -d @test_payload.json
```

Where `test_payload.json` contains:
```json
{
  "name": "simple-test",
  "units": [
    {
      "id": "pump-1",
      "type": "pump",
      "name": "Feed Pump",
      "parameters": {
        "x": 300,
        "y": 200,
        "pressure_rise": 100,
        "efficiency": 0.75
      }
    }
  ],
  "streams": [
    {
      "id": "feed-1",
      "name": "Feed Stream",
      "target": "pump-1",
      "properties": {
        "temperature": 25,
        "pressure": 101.3,
        "flow_rate": 1000,
        "composition": {"Water": 1.0}
      }
    },
    {
      "id": "product-1",
      "name": "Product Stream",
      "source": "pump-1",
      "properties": {}
    }
  ],
  "thermo": {
    "package": "Peng-Robinson",
    "components": ["Water"]
  }
}
```

## Troubleshooting

### "DWSIM automation not available"
- Check that `DWSIM_LIB_PATH` is set correctly
- Verify `DWSIM.Automation.dll` exists in that directory
- Check that .NET Framework is installed (Windows) or Mono (Linux)

### "Failed to create stream/unit"
- Check the exact method signature for `AddObject()`
- Verify unit type names match DWSIM's expected names
- Check if coordinates are required or optional

### "Failed to set property"
- Verify property names (may be case-sensitive)
- Check if units are required (K vs C, kPa vs bar)
- Try alternative property setting methods

### "Failed to connect streams"
- Verify connection method names (`SetInletStream` vs `ConnectInlet`)
- Check if port indices are required
- Verify stream and unit objects are valid

## Next Steps

After successful testing:
1. Update method names in `dwsim_client.py` based on test results
2. Add error handling for common failures
3. Expand unit type mappings as needed
4. Add more comprehensive parameter configuration
5. Test with more complex flowsheets

