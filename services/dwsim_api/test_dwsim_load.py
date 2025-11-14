#!/usr/bin/env python3
"""Test script to verify pythonnet can load DWSIM.Automation.dll"""

import os
import sys
from pathlib import Path

# Set environment variables before importing clr
os.environ['DWSIM_LIB_PATH'] = os.getenv('DWSIM_LIB_PATH', '/Applications/DWSIM.app/Contents/MonoBundle')
os.environ.setdefault('DOTNET_SYSTEM_GLOBALIZATION_INVARIANT', '1')

lib_path = Path(os.environ['DWSIM_LIB_PATH'])

if not lib_path.exists():
    print(f"ERROR: DWSIM library path does not exist: {lib_path}")
    sys.exit(1)

if str(lib_path) not in sys.path:
    sys.path.append(str(lib_path))

print(f"Testing DWSIM load from: {lib_path}")
print()

try:
    # Configure pythonnet to use Mono before importing clr
    import pythonnet
    from pathlib import Path
    
    # Prefer official Mono framework, fallback to Homebrew
    official_mono = '/Library/Frameworks/Mono.framework/Versions/Current/lib/libmonosgen-2.0.dylib'
    homebrew_mono = '/opt/homebrew/lib/libmono-2.0.dylib'
    
    libmono_path = os.getenv('PYTHONNET_LIBMONO')
    if not libmono_path:
        if Path(official_mono).exists():
            libmono_path = official_mono
            print(f"Found official Mono framework at: {libmono_path}")
        elif Path(homebrew_mono).exists():
            libmono_path = homebrew_mono
            print(f"Using Homebrew Mono at: {libmono_path} (official framework not found)")
        else:
            print("Warning: No Mono library found. Trying auto-discovery...")
    
    if libmono_path:
        print(f"Configuring pythonnet to use Mono library at: {libmono_path}")
        pythonnet.load("mono", libmono=libmono_path)
    else:
        print("Configuring pythonnet to use Mono (auto-discovery)...")
        pythonnet.load("mono")
    
    import clr
    print("✓ Successfully imported clr (pythonnet)")
    
    automation_dll = lib_path / 'DWSIM.Automation.dll'
    interfaces_dll = lib_path / 'DWSIM.Interfaces.dll'
    capeopen_dll = lib_path / 'CapeOpen.dll'
    
    if not automation_dll.exists():
        print(f"ERROR: DWSIM.Automation.dll not found at {automation_dll}")
        sys.exit(1)
    
    print(f"✓ Found DWSIM.Automation.dll at {automation_dll}")
    
    clr.AddReference(str(automation_dll))
    print("✓ Added reference to DWSIM.Automation.dll")
    
    if interfaces_dll.exists():
        clr.AddReference(str(interfaces_dll))
        print("✓ Added reference to DWSIM.Interfaces.dll")
    
    if capeopen_dll.exists():
        clr.AddReference(str(capeopen_dll))
        print("✓ Added reference to CapeOpen.dll")
    
    from DWSIM.Automation import Automation3
    print("✓ Successfully imported Automation3 from DWSIM.Automation")
    
    automation = Automation3()
    print("✓ Successfully instantiated Automation3()")
    
    print("\n✅ SUCCESS: DWSIM automation can be loaded!")
    print("   You can now proceed with the JSON→DWSIM mapping implementation.")
    
except Exception as e:
    print(f"\n❌ FAILED: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

