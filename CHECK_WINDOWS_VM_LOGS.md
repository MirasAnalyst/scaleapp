# How to Check Windows VM Logs for DWSIM Property Setting

## Why We Need the Logs

The diagnostics show `has_setprop: false`, which means MaterialStream objects don't expose `SetProp` through pythonnet. However, we need to see the **actual error messages** from the Windows VM to understand:

1. Which property setters are being tried
2. What specific errors occur
3. Whether property IDs work
4. What methods are actually available on the stream objects

## How to Check Logs

### Option 1: If Running with uvicorn directly
The logs should be in the terminal where you ran:
```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8081
```

Look for:
- `"Attempting to set property 'temperature' = ..."`
- `"✗ Property setter X failed for 'temperature'"`
- `"Available property-related methods on stream object: ..."`
- `"✓ Successfully set property 'temperature' using method X"`

### Option 2: If Running as a service
Check the service logs or redirect output to a file:
```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8081 > dwsim_api.log 2>&1
```

Then check `dwsim_api.log` for the same messages.

## What to Look For

### 1. Property Setter Attempts
Look for lines like:
```
✗ Property setter 0 failed for 'temperature' (value: 298.15): [ERROR MESSAGE]
✗ Property setter 1 failed for 'temperature' (value: 298.15): [ERROR MESSAGE]
```

The error messages will tell us:
- If property IDs are being tried (method 0 or 1)
- What the actual error is (wrong signature, property not found, etc.)
- Whether SetPropertyValue is being called but failing silently

### 2. Available Methods
Look for:
```
Available property-related methods on stream object: ['SetPropertyValue', 'GetPropertyValue', ...]
```

This will show what methods ARE available that we might not be using.

### 3. MaterialStream Resolution
Look for:
```
Found X streams in MaterialStreams collection
Stream 0 in collection: name='BB-feed', tag='...', type=..., has_SetProp=False
Found 0 streams with SetProp method
```

This confirms that MaterialStream objects in the collection also don't have SetProp.

### 4. Success Messages
If any method works, you'll see:
```
✓ Successfully set property 'temperature' using method X
```

## What the Logs Will Tell Us

### Scenario 1: Property IDs Work
If property IDs work, you'll see:
```
✓ Successfully set property 'temperature' using method 0
```

**Action**: Great! Property IDs are the solution.

### Scenario 2: SetPropertyValue Fails with Specific Error
If SetPropertyValue fails, the error message will tell us:
- Wrong number of parameters
- Property name not recognized
- Type mismatch
- etc.

**Action**: Fix the method signature based on the error.

### Scenario 3: No Methods Work
If all methods fail, the logs will show:
- All property setters failed
- Available methods list (which might reveal alternatives)
- .NET casting results

**Action**: We may need to use a completely different approach (file-based API, different DWSIM version, etc.)

## Next Steps

1. **Run the API request** from Mac:
   ```bash
   curl -X POST "http://20.14.73.190:8081/simulate" \
     -H "Content-Type: application/json" \
     -d @test_dwsim_payload_pump.json
   ```

2. **Check Windows VM logs** for the messages above

3. **Share the relevant log lines** - especially:
   - Property setter error messages
   - Available methods list
   - Any success messages

4. **Based on the logs**, we can:
   - Fix method signatures
   - Try different property names/IDs
   - Use alternative APIs
   - Determine if this is a fundamental limitation

## Expected Log Output

After the latest code changes, you should see:

```
INFO: Attempting to set property 'temperature' = 298.15 on stream BB-feed (type: ISimulationObject, has_SetProp: False, has_SetPropertyValue: True, X methods to try)
WARNING: ✗ Property setter 0 failed for 'temperature' (value: 298.15): [ERROR]
WARNING: ✗ Property setter 1 failed for 'temperature' (value: 298.15): [ERROR]
...
ERROR: All X property setters failed for 'temperature'...
WARNING: Available property-related methods on stream object: [...]
```

The error messages in the warnings are the key to fixing this!



