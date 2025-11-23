# DWSIM Simulation API (Scaffold)

This FastAPI microservice is the bridge between the AI-generated flowsheet JSON and the
DWSIM thermodynamic engine. It currently exposes stub endpoints and is ready for the
actual DWSIM bindings to be wired in.

## Features

- `POST /simulate` – accepts the flowsheet JSON (units, streams, thermo options) and
  returns placeholder material/energy results. This is where DWSIM will be invoked.
- `POST /properties` – lightweight thermo calculations for single streams.
- `POST /scenarios` & `POST /scenarios/{id}/run` – scaffolding for future scenario
  management.
- Structured logging and dependency injection ready for plugging-in the actual DWSIM
  COM/.NET or Python APIs.

## Running locally

### Python 3.13 Compatibility

If you're using Python 3.13, you have two options:

**Option 1: Use Python 3.12 or 3.11 (Recommended)**
```bash
cd services/dwsim_api
python3.12 -m venv .venv  # or python3.11
source .venv/bin/activate
pip install -r requirements.txt
```

**Option 2: Use Python 3.13 with compatibility flag**
```bash
cd services/dwsim_api
python3 -m venv .venv
source .venv/bin/activate
export PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1
pip install --upgrade pip
pip install -r requirements.txt
```

**Note:** The requirements.txt uses `pydantic>=2.10.0` which includes pre-built wheels for Python 3.13 (pydantic-core 2.41.5+), so the installation should work. However, if you encounter build errors, the `PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1` flag ensures PyO3 builds against the stable ABI as a fallback.

### Platform Support

**⚠️ IMPORTANT: DWSIM automation is NOT supported on macOS (Apple Silicon).**

The service automatically detects macOS and uses a mock backend. For real DWSIM automation, use **Windows or Linux** where pythonnet's Mono backend works.

See `DWSIM_RUNTIME_ISSUES.md` for details and alternatives.

**Supported Platforms:**
- ✅ **Windows**: Full DWSIM automation support via .NET Framework/Mono
- ✅ **Linux**: Full DWSIM automation support via Mono
- ⚠️ **macOS**: Mock backend only (automation not supported)

### Runtime Configuration (Windows/Linux Only)

DWSIM requires .NET Framework (Windows) or Mono (Linux) and pythonnet to load the DWSIM.Automation.dll.

**Windows Setup:**

1. **Install DWSIM** (if not already installed):
   - Download and install DWSIM from the official website
   - Note the installation directory (typically `C:\Program Files\DWSIM` or `C:\Program Files (x86)\DWSIM`)

2. **Install .NET Framework** (usually pre-installed on Windows):
   - DWSIM requires .NET Framework 4.x
   - If missing, download from Microsoft

3. **Starting the server on Windows:**
```powershell
cd services\dwsim_api
# Activate virtual environment
.venv\Scripts\activate

# Set DWSIM library path (adjust to your installation)
$env:DWSIM_LIB_PATH="C:\Program Files\DWSIM"
# OR if DWSIM is in a different location:
# $env:DWSIM_LIB_PATH="C:\Program Files (x86)\DWSIM"

# Optional: point to a base flowsheet template
# $env:DWSIM_TEMPLATE_PATH="C:\path\to\blank-or-base.dwxml"

# Start the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8081
```

**Linux Setup:**

1. **Install Mono:**
```bash
# Debian/Ubuntu
sudo apt-get install mono-complete
```

2. **Starting the server on Linux:**
```bash
cd services/dwsim_api
source .venv/bin/activate

# Required: DWSIM library path (adjust to your installation)
export DWSIM_LIB_PATH="/usr/lib/dwsim"  # or wherever DWSIM is installed

# Required: pythonnet/Mono configuration
export PYTHONNET_RUNTIME=mono

# Optional: point to a base flowsheet template
export DWSIM_TEMPLATE_PATH="/path/to/blank-or-base.dwxml"

uvicorn app.main:app --reload --host 0.0.0.0 --port 8081
```

**macOS Setup (Mock Backend Only):**

On macOS, the service automatically uses a mock backend. The automation DLLs cannot be loaded due to platform limitations.

**Finding Your DWSIM Installation Path:**

- **Windows**: Check `C:\Program Files\DWSIM` or `C:\Program Files (x86)\DWSIM`. Look for `DWSIM.Automation.dll` in that directory.
- **Linux**: Typically `/usr/lib/dwsim` or `/opt/dwsim`. Use `find /usr -name "DWSIM.Automation.dll" 2>/dev/null` to locate it.

**Important:** pythonnet requires the **official Mono framework** (installed via .pkg from mono-project.com), not the Homebrew version. The official framework installs to `/Library/Frameworks/Mono.framework/...` which pythonnet can find automatically.

If you only have Homebrew Mono installed, see `INSTALL_MONO.md` for instructions on installing the official Mono framework.

**Note:** If Mono is installed in a different location, find the library file and set `PYTHONNET_LIBMONO` accordingly:
```bash
# Find official Mono framework library
find /Library/Frameworks -name "libmonosgen-2.0.dylib" 2>/dev/null

# OR find Homebrew Mono library
find /opt/homebrew /usr/local -name "libmono-2.0.dylib" 2>/dev/null
```

**On Windows/Linux:** If the automation DLLs can be loaded (via pythonnet) and `DWSIM_TEMPLATE_PATH`
points at a `.dwxml` flowsheet, the service runs that template via DWSIM and
returns the material/unit results.

**On macOS:** The service automatically uses a deterministic mock backend. The API continues to function
normally, returning mock simulation results that match the expected schema.

**Verifying DWSIM Load (Windows/Linux only):**
To test that DWSIM can be loaded successfully on supported platforms, run:
```bash
cd services/dwsim_api
source .venv/bin/activate
export DWSIM_LIB_PATH="/path/to/DWSIM/MonoBundle"  # Adjust for your platform
export PYTHONNET_LIBMONO="/path/to/libmonosgen-2.0.dylib"  # Adjust for your platform
python test_dwsim_load.py
```

If successful, you should see: `✅ SUCCESS: DWSIM automation can be loaded!`

**Note:** On macOS, the test will show that automation is skipped and mock backend is used.

## Integrating with ScaleApp

1. After the AI step generates flowsheet JSON, POST it to `/simulate`.
2. Display the returned `streams`, `units`, and `warnings` tables in the UI.
3. When the real DWSIM client is implemented, no frontend changes are necessary.

## Next steps

- Expand the JSON→DWSIM mapping so the AI output is translated into a native
  flowsheet instead of executing a static template.
- Add persistence (PostgreSQL/SQLite) for scenario logging and analytics.
- Expand the schema to support optimization objectives/constraints.
