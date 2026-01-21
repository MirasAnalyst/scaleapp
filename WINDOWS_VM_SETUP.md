# Windows VM DWSIM API Setup

## DWSIM Installation Path
```
C:\Users\miras\AppData\Local\DWSIM
```

## Quick Start

### 1. Start the DWSIM API Service

**Using the PowerShell script (recommended):**
```powershell
# From scaleapp root directory
.\start_dwsim_api_windows.ps1
```

**Or manually:**
```powershell
cd C:\scaleapp\services\dwsim_api
.venv\Scripts\activate
$env:DWSIM_LIB_PATH="C:\Users\miras\AppData\Local\DWSIM"
uvicorn app.main:app --host 0.0.0.0 --port 8081
```

### 2. Verify the Service is Running

The server should start and show:
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8081
```

### 3. Test from Mac

From your Mac terminal:
```bash
# Health check
curl http://20.14.73.190:8081/healthz

# Test with pump payload
curl -X POST "http://20.14.73.190:8081/simulate" \
  -H "Content-Type: application/json" \
  -d @test_dwsim_payload_pump.json | jq '.'
```

## Troubleshooting

### Port Already in Use
If port 8081 is already in use:
```powershell
# Find process using port 8081
netstat -ano | findstr :8081

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

### Firewall Issues
Allow port 8081 through Windows Firewall:
```powershell
# Run PowerShell as Administrator
New-NetFirewallRule -DisplayName "DWSIM API" -Direction Inbound -LocalPort 8081 -Protocol TCP -Action Allow
```

### DWSIM Not Loading
If you see "DWSIM automation not available" or mock mode:
1. Verify DWSIM.Automation.dll exists:
   ```powershell
   Test-Path "C:\Users\miras\AppData\Local\DWSIM\DWSIM.Automation.dll"
   ```
2. Check .NET Framework is installed (DWSIM requires .NET Framework 4.x)
3. Review API logs for specific error messages

### Virtual Environment Not Found
If `.venv` doesn't exist:
```powershell
cd C:\scaleapp\services\dwsim_api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## API Endpoint
- **Local (on Windows VM):** http://localhost:8081
- **Remote (from Mac):** http://20.14.73.190:8081

## Expected Response Format

When the API is working correctly, you should see calculated values:

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
      "composition": {"Water": 1.0}
    },
    {
      "id": "BB-product",
      "temperature_c": 25.0,
      "pressure_kpa": 601.3,  // 101.3 + 500 (pump pressure rise)
      "mass_flow_kg_per_h": 1000.0,
      "composition": {"Water": 1.0}
    }
  ],
  "units": [
    {
      "id": "pump-1",
      "duty_kw": 1.36,
      "status": "ok"
    }
  ]
}
```

If you see `null` values, check:
- Components are specified in thermo config
- Feed streams have temperature, pressure, and composition
- DWSIM is actually running (not mock mode)




