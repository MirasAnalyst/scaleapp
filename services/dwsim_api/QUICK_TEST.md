# Quick Test Guide

## Windows Testing Steps

### 1. Set Environment Variables

```powershell
# In PowerShell (as Administrator if needed)
cd C:\scaleapp\services\dwsim_api
.venv\Scripts\activate

# Set DWSIM path (adjust if different)
$env:DWSIM_LIB_PATH = "C:\Program Files\DWSIM"
# Or if DWSIM is in a different location:
# $env:DWSIM_LIB_PATH = "C:\Users\YourUsername\AppData\Local\DWSIM"
```

### 2. Discover API Methods

```powershell
python test_api_methods.py
```

**What to look for:**
- ✓ marks = method works
- ✗ marks = method doesn't work
- Alternative methods listed = try these instead

**Copy the output** - you'll need it to update the code.

### 3. Test Simple Flowsheet

```powershell
python test_simple_flowsheet.py
```

**Expected:**
- If DWSIM loads: You'll see simulation results
- If methods fail: You'll see warnings listing what needs to be fixed

### 4. Update Code Based on Results

Open `app/dwsim_client.py` and update method names based on what worked in step 2.

**Common fixes:**
- If `SetPropertyPackage()` doesn't work but `PropertyPackage =` does → update `_configure_property_package()`
- If `AddComponent()` doesn't work but `AddCompound()` does → update `_add_components()`
- If `AddObject()` signature is different → update `_create_streams()` and `_create_units()`

### 5. Test via API

```powershell
# Terminal 1: Start server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8081

# Terminal 2: Test with curl
curl -X POST http://localhost:8081/simulate `
  -H "Content-Type: application/json" `
  -d @test_payload.json
```

Or use the web UI at `http://localhost:3000/builder` and generate a flowsheet.

## What Success Looks Like

✅ **API Discovery:**
```
✓ NewFlowsheet() works
✓ SetPropertyPackage() works
✓ AddComponent() works
✓ AddObject('MaterialStream', ...) works
✓ CalculateFlowsheet() works
```

✅ **Simple Flowsheet Test:**
```
Status: ok
Streams: 2
Units: 1
Warnings: []
```

✅ **API Test:**
```json
{
  "flowsheet_name": "simple-test",
  "status": "ok",
  "streams": [...],
  "units": [...],
  "warnings": []
}
```

## Troubleshooting

**"DWSIM automation not available"**
- Check `DWSIM_LIB_PATH` is set
- Verify `DWSIM.Automation.dll` exists
- Check Windows Firewall isn't blocking

**"Failed to create stream/unit"**
- Check `test_api_methods.py` output for correct `AddObject()` signature
- May need to adjust coordinates or method parameters

**"Property package setting failed"**
- Check which method worked in `test_api_methods.py`
- Update `_configure_property_package()` accordingly

**"Component addition failed"**
- Check which method worked in `test_api_methods.py`
- Update `_add_components()` accordingly

## Next Steps After Successful Test

1. ✅ Update all method names based on test results
2. ✅ Test with more complex flowsheets
3. ✅ Add error handling for edge cases
4. ✅ Document any DWSIM-specific quirks discovered

