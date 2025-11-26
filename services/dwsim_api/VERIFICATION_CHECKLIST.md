# DWSIM Integration Verification Checklist

## Pre-Push Verification Steps

Before pushing changes, verify the following on **Windows** (DWSIM automation doesn't work on macOS):

### 1. Environment Setup ✅
- [ ] Virtual environment activated
- [ ] `DWSIM_LIB_PATH` set to correct DWSIM installation directory
- [ ] `DOTNET_ROOT` cleared (to force .NET Framework, not CoreCLR)
- [ ] DWSIM.Automation.dll exists in `DWSIM_LIB_PATH`

### 2. Run API Discovery Test ✅
```powershell
cd C:\scaleapp\services\dwsim_api
.venv\Scripts\activate
$env:DWSIM_LIB_PATH = "C:\Program Files\DWSIM"
python test_api_discovery.py
```

**Expected Results:**
- [ ] ✓ DWSIM Automation loaded successfully
- [ ] ✓ CreateFlowsheet() works (or NewFlowsheet() as fallback)
- [ ] ✓ AddCompound() works for adding components
- [ ] ✓ PropertyPackage property works for setting property package
- [ ] ✓ AddObject() works with at least one signature (for streams)
- [ ] ✓ AddObject() works with at least one signature (for units)
- [ ] ✓ GetMaterialStreams() works
- [ ] ✓ GetUnitOperations() works
- [ ] ✓ CalculateFlowsheet() works

**If AddObject() fails:**
- [ ] Note which signature worked (if any)
- [ ] Check for alternative methods (CreateMaterialStream, AddMaterialStream, etc.)
- [ ] Update `dwsim_client.py` with correct method/signature

### 3. Run Simple Flowsheet Test ✅
```powershell
python test_simple_flowsheet.py
```

**Expected Results:**
- [ ] Status: "ok" (not "error" or "empty")
- [ ] At least 2 streams created (feed-1, product-1)
- [ ] At least 1 unit created (pump-1)
- [ ] Warnings list is empty or minimal (no critical errors)
- [ ] Stream results show calculated values (temperature, pressure, flow)
- [ ] Unit results show calculated values (duty, status)

**If test fails:**
- [ ] Check warnings for specific error messages
- [ ] Verify which step failed (stream creation, unit creation, connection, calculation)
- [ ] Review `test_api_discovery.py` output for correct method signatures

### 4. Test via API Endpoint ✅
```powershell
# Terminal 1: Start server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8081

# Terminal 2: Test with curl
curl -X POST http://localhost:8081/simulate `
  -H "Content-Type: application/json" `
  -d @test_payload.json
```

**Expected Results:**
- [ ] HTTP 200 response
- [ ] JSON response with `status: "ok"`
- [ ] Streams array contains results
- [ ] Units array contains results
- [ ] Warnings array is empty or minimal

### 5. Code Review Checklist ✅

**dwsim_client.py:**
- [ ] Uses `CreateFlowsheet()` with fallback to `NewFlowsheet()`
- [ ] `_create_streams()` tries multiple `AddObject()` signatures
- [ ] `_create_units()` tries multiple `AddObject()` signatures
- [ ] Error handling catches and logs all exceptions
- [ ] Warnings are collected and returned in results
- [ ] All DWSIM API calls are wrapped in try/except

**Test Scripts:**
- [ ] `test_api_discovery.py` tests all method signatures
- [ ] `test_simple_flowsheet.py` uses valid test payload
- [ ] Both scripts have proper error handling
- [ ] Both scripts provide clear output

**Documentation:**
- [ ] `RUN_TESTS_ON_WINDOWS.md` has correct instructions
- [ ] `VERIFICATION_CHECKLIST.md` (this file) is complete
- [ ] All test scripts are documented

### 6. Known Issues & Workarounds ✅

**Issue: AddObject() method signature mismatch**
- **Status:** Code tries multiple signatures automatically
- **Workaround:** Run `test_api_discovery.py` to find correct signature
- [ ] If found, update `dwsim_client.py` with correct signature

**Issue: CreateFlowsheet() vs NewFlowsheet()**
- **Status:** Code tries `CreateFlowsheet()` first, falls back to `NewFlowsheet()`
- **Workaround:** Already handled in code

**Issue: Property package setting**
- **Status:** Code tries multiple methods (property, SetPropertyPackage, etc.)
- **Workaround:** Already handled in code

### 7. Final Verification ✅

Before pushing:
- [ ] All tests pass on Windows
- [ ] No critical errors in warnings
- [ ] Code handles errors gracefully (returns partial results, not crashes)
- [ ] Logging provides useful diagnostic information
- [ ] Test scripts are executable and documented

## Success Criteria

✅ **Ready to push if:**
1. `test_api_discovery.py` shows all critical methods work
2. `test_simple_flowsheet.py` completes with status "ok"
3. API endpoint returns valid results
4. No critical errors or crashes
5. Warnings are minimal and non-blocking

❌ **Do NOT push if:**
1. DWSIM automation fails to load
2. Stream/unit creation fails with all method signatures
3. Simulation calculation fails
4. API endpoint returns errors
5. Critical exceptions are not handled

## Next Steps After Verification

1. **If all tests pass:**
   - Push changes
   - Monitor production logs for any runtime issues
   - Document any DWSIM-specific quirks discovered

2. **If tests fail:**
   - Review `test_api_discovery.py` output
   - Update `dwsim_client.py` with correct method signatures
   - Re-run tests until all pass
   - Document any workarounds needed

3. **If DWSIM API differs:**
   - Note the differences in code comments
   - Update test scripts to cover the differences
   - Consider version-specific handling if needed


