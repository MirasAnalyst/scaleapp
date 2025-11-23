# Running Tests on Windows

## ⚠️ Important: Tests Must Run on Windows

These tests **cannot run on macOS** because:
- DWSIM automation requires .NET Framework/Mono
- Mono on macOS is Intel-only (x86_64), not ARM64
- DWSIM.Automation.dll requires System.Windows.Forms (not available on macOS)

**You must run these tests on your Windows machine where DWSIM is installed.**

## Quick Start (Windows PowerShell)

### Step 1: Navigate to Directory

```powershell
cd C:\scaleapp\services\dwsim_api
```

### Step 2: Activate Virtual Environment

```powershell
.venv\Scripts\activate
```

### Step 3: Set DWSIM Path

```powershell
# Adjust path if your DWSIM is installed elsewhere
$env:DWSIM_LIB_PATH = "C:\Program Files\DWSIM"

# Verify the path exists
Test-Path $env:DWSIM_LIB_PATH
# Should return: True
```

### Step 4: Run API Discovery Test

```powershell
python test_api_methods.py
```

**Expected Output:**
- ✓ marks for methods that work
- ✗ marks for methods that don't work
- Alternative method names if found
- List of available methods on objects

**Copy the output** - you'll need it to update the code!

### Step 5: Run Simple Flowsheet Test

```powershell
python test_simple_flowsheet.py
```

**Expected Output:**
- Simulation results if successful
- Warnings listing any issues
- Stream and unit results

### Step 6: Update Code Based on Results

Open `app/dwsim_client.py` and update method names based on what worked:

**Example fixes:**
- If `SetPropertyPackage()` doesn't work but `PropertyPackage =` does:
  ```python
  # Change from:
  flowsheet.SetPropertyPackage(dwsim_package)
  # To:
  flowsheet.PropertyPackage = dwsim_package
  ```

- If `AddComponent()` doesn't work but `AddCompound()` does:
  ```python
  # Change from:
  flowsheet.AddComponent(comp)
  # To:
  flowsheet.AddCompound(comp)
  ```

### Step 7: Test via API

```powershell
# Terminal 1: Start server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8081

# Terminal 2: Test with curl
curl -X POST http://localhost:8081/simulate `
  -H "Content-Type: application/json" `
  -d @test_payload.json
```

Or test via the web UI at `http://localhost:3000/builder`.

## What Success Looks Like

### API Discovery Test Success:
```
✓ DWSIM Automation loaded successfully
✓ NewFlowsheet() works
✓ SetPropertyPackage() works (or PropertyPackage = works)
✓ AddComponent() works (or AddCompound() works)
✓ AddObject('MaterialStream', ...) works
✓ CalculateFlowsheet() works
```

### Simple Flowsheet Test Success:
```
Status: ok
Streams: 2
Units: 1
Warnings: [] (or minimal warnings)
```

### API Test Success:
```json
{
  "flowsheet_name": "simple-test",
  "status": "ok",
  "streams": [
    {
      "id": "feed-1",
      "temperature_c": 25.0,
      "pressure_kpa": 101.3,
      ...
    }
  ],
  "units": [
    {
      "id": "pump-1",
      "duty_kw": ...,
      "status": "ok"
    }
  ],
  "warnings": []
}
```

## Troubleshooting

### "DWSIM automation not available"
- Check `DWSIM_LIB_PATH` is set correctly
- Verify `DWSIM.Automation.dll` exists in that directory
- Ensure .NET Framework 4.x is installed

### "Failed to create stream/unit"
- Check `test_api_methods.py` output for correct `AddObject()` signature
- May need different parameters or method name

### "Property package setting failed"
- Check which method worked in `test_api_methods.py`
- Update `_configure_property_package()` in `dwsim_client.py`

### "Component addition failed"
- Check which method worked in `test_api_methods.py`
- Update `_add_components()` in `dwsim_client.py`

## Next Steps

After successful testing:
1. ✅ Update all method names based on test results
2. ✅ Test with more complex flowsheets
3. ✅ Add error handling for edge cases
4. ✅ Document any DWSIM-specific quirks discovered

## Sharing Results

If you encounter issues, share:
1. Output from `test_api_methods.py`
2. Output from `test_simple_flowsheet.py`
3. Any error messages
4. DWSIM version (if known)

This will help adjust the implementation to match your DWSIM version's API.

