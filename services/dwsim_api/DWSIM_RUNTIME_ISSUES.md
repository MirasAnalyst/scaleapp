# DWSIM Automation Runtime Issues on macOS

## Problem Summary

**DWSIM.Automation.dll CANNOT be loaded via pythonnet on macOS (Apple Silicon).**

This is a fundamental incompatibility that cannot be resolved on macOS:

1. **Mono Framework**: The official Mono framework (installed via .pkg) is Intel-only (x86_64), but the system is Apple Silicon (arm64). pythonnet cannot create a Mono runtime on ARM64 macOS - it fails with "Failed to create a .NET runtime (mono)".

2. **CoreCLR (.NET 8)**: While CoreCLR works and pythonnet can load it, DWSIM.Automation.dll requires `System.Windows.Forms` which:
   - Is not available in .NET Core/5+ by default
   - Is Windows-only in .NET 6+ (even if available as a package)
   - DWSIM was built for .NET Framework/Mono, not .NET Core

## Root Cause

DWSIM.Automation.dll was compiled for **.NET Framework** (or Mono), which includes Windows Forms. It cannot run on:
- .NET Core/5/6/7/8 (no Windows Forms on macOS/Linux)
- Mono on ARM64 macOS (pythonnet cannot create Mono runtime - architecture mismatch)
- Mono on Intel macOS (may work, but not tested)

## Possible Solutions

### Option 1: Use Rosetta 2 with Intel Mono (Untested)

Run Python under Rosetta 2 to use Intel Mono:

```bash
# Install Intel Mono (if available)
# Run Python with Rosetta 2
arch -x86_64 python3 test_dwsim_load.py
```

**Note**: This may not work as pythonnet itself might need to be compiled for the correct architecture.

### Option 2: Use Windows or Windows VM

DWSIM Automation is officially supported on Windows where:
- .NET Framework is available
- System.Windows.Forms is available
- pythonnet works reliably

### Option 3: Use Older Python + pythonnet 3.0 on Intel Mac

If you have access to an Intel Mac:
- Use Python 3.11 or 3.12
- Use pythonnet 3.0.x
- Mono framework should work on Intel architecture

### Option 4: Alternative DWSIM Integration

Consider:
- Using DWSIM's COM interface (Windows only)
- Using DWSIM's file-based API (save/load .dwxml files)
- Using a different simulation engine that supports cross-platform automation

## Current Status

- ✅ .NET 8 SDK installed and working
- ✅ pythonnet can load CoreCLR runtime
- ✅ DWSIM.Automation.dll can be referenced
- ❌ Automation3() constructor fails due to System.Windows.Forms dependency (CoreCLR)
- ❌ Mono framework is Intel-only, pythonnet cannot create Mono runtime on ARM64 macOS
- ✅ Mock backend works - API continues to function with deterministic mock results

## Recommendation

**For macOS (Apple Silicon): DWSIM automation is NOT supported.**

The code automatically detects macOS and skips automation initialization, falling back to mock results. This allows development to continue while you choose one of these alternatives:

### Option 1: Windows Machine/VM (Recommended)
- DWSIM automation is officially supported on Windows
- .NET Framework and Windows Forms are available
- pythonnet works reliably with Mono on Windows
- Can run DWSIM automation service separately and call it via API

### Option 2: Linux Server
- Mono works on Linux (x86_64/ARM64)
- pythonnet's Mono backend is known to work on Linux
- Can run DWSIM automation service on Linux and call it via API

### Option 3: File-Based Integration
- Generate .dwxml files from JSON on macOS
- Process them on Windows/Linux server with DWSIM
- Return results to the API
- Allows macOS development while using Windows/Linux for simulation

### Option 4: Alternative Simulation Engine
- Consider simulation engines with cross-platform automation support
- Examples: Aspen Plus (if available), custom Python-based thermo libraries

## Implementation Note

The `DWSIMClient` class automatically detects macOS and skips automation initialization, using mock results instead. This allows:
- ✅ API development to continue on macOS
- ✅ Frontend integration to work with mock data
- ✅ Easy switch to real DWSIM when running on Windows/Linux
- ✅ No code changes needed when deploying to supported platforms

