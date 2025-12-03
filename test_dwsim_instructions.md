# Testing DWSIM API with Proper Payloads

## Windows VM API Endpoint
```
http://20.14.73.190:8081
```

## Test Payloads

### 1. Simple Separator Test (`test_dwsim_payload.json`)
- Feed stream: 25°C, 101.3 kPa, 1000 kg/h, Water (100%)
- Unit: Separator
- Expected: Feed stream properties should be preserved, product stream calculated

### 2. Pump Test (`test_dwsim_payload_pump.json`)
- Feed stream: 25°C, 101.3 kPa, 1000 kg/h, Water (100%)
- Unit: Pump with 500 kPa pressure rise
- Expected: Product stream should have 601.3 kPa (101.3 + 500)

## Testing Commands

### Test 1: Health Check
```bash
curl "http://20.14.73.190:8081/healthz"
```

Expected response:
```json
{"status": "ok"}
```

### Test 2: Simple Separator
```bash
curl -X POST "http://20.14.73.190:8081/simulate" \
  -H "Content-Type: application/json" \
  -d @test_dwsim_payload.json | jq '.'
```

### Test 3: Pump Flowsheet
```bash
curl -X POST "http://20.14.73.190:8081/simulate" \
  -H "Content-Type: application/json" \
  -d @test_dwsim_payload_pump.json | jq '.'
```

## Expected Successful Response

```json
{
  "flowsheet_name": "test-pump-flowsheet",
  "status": "ok",
  "streams": [
    {
      "id": "BB-feed",
      "temperature_c": 25.0,
      "pressure_kpa": 101.3,
      "mass_flow_kg_per_h": 1000.0,
      "mole_flow_kmol_per_h": 55.5,
      "vapor_fraction": 0.0,
      "liquid_fraction": 1.0,
      "composition": {
        "Water": 1.0
      }
    },
    {
      "id": "BB-product",
      "temperature_c": 25.0,
      "pressure_kpa": 601.3,
      "mass_flow_kg_per_h": 1000.0,
      "mole_flow_kmol_per_h": 55.5,
      "vapor_fraction": 0.0,
      "liquid_fraction": 1.0,
      "composition": {
        "Water": 1.0
      }
    }
  ],
  "units": [
    {
      "id": "pump-1",
      "duty_kw": 1.36,
      "status": "ok",
      "extra": {}
    }
  ],
  "warnings": [],
  "diagnostics": {
    "mode": "dwsim",
    "units_created": 1,
    "streams_created": 2
  }
}
```

## Troubleshooting

### Connection Timeout
If you get connection timeout errors:
1. **Check if DWSIM API is running on Windows VM:**
   ```powershell
   # On Windows VM, check if service is running
   netstat -an | findstr 8081
   ```

2. **Start DWSIM API service on Windows VM:**
   
   **Option A: Use the provided PowerShell script:**
   ```powershell
   # From the scaleapp root directory
   .\start_dwsim_api_windows.ps1
   ```
   
   **Option B: Manual startup:**
   ```powershell
   cd C:\scaleapp\services\dwsim_api
   .venv\Scripts\activate
   $env:DWSIM_LIB_PATH="C:\Users\miras\AppData\Local\DWSIM"
   uvicorn app.main:app --host 0.0.0.0 --port 8081
   ```

3. **Check Windows Firewall:**
   - Ensure port 8081 is open for inbound connections
   - Add firewall rule if needed

4. **Verify Network Connectivity:**
   ```bash
   # From Mac, test basic connectivity
   ping 20.14.73.190
   telnet 20.14.73.190 8081
   ```

### Null Values in Response
If you get null values:
- Check that DWSIM is properly installed on Windows VM
- Verify `DWSIM_LIB_PATH` environment variable is set correctly
- Check API logs for errors
- Ensure components are specified in thermo config

### Mock Mode
If `diagnostics.mode` shows "mock" instead of "dwsim":
- DWSIM automation DLLs are not loading
- Check DWSIM installation path
- Verify .NET Framework is installed
- Check API logs for initialization errors

## Next Steps After Successful Test

Once you get calculated results:
1. Update `buildSimulationPayload` to extract components from AI-generated flowsheets
2. Ensure AI-generated flowsheets include proper feed stream properties
3. Test with more complex flowsheets (distillation columns, heat exchangers, etc.)

