#!/usr/bin/env python3
"""Test script to verify pythonnet can load DWSIM with CoreCLR (.NET)"""

import os
import sys
from pathlib import Path

lib_path = '/Applications/DWSIM.app/Contents/MonoBundle'

# Set .NET root if not already set
dotnet_root = os.getenv('DOTNET_ROOT', os.path.expanduser('~/.dotnet'))
if not Path(dotnet_root).exists():
    print(f"ERROR: .NET SDK not found at {dotnet_root}")
    print("Please install .NET 8 SDK and set DOTNET_ROOT environment variable")
    sys.exit(1)

os.environ['DOTNET_ROOT'] = dotnet_root
# Don't set DOTNET_SYSTEM_GLOBALIZATION_INVARIANT - DWSIM needs culture support
# os.environ['DOTNET_SYSTEM_GLOBALIZATION_INVARIANT'] = '1'
os.environ['PYTHONNET_RUNTIME'] = 'coreclr'
os.environ['LC_ALL'] = 'en_US.UTF-8'  # Set locale for culture support

sys.path.append(lib_path)

print(f"Testing DWSIM load with CoreCLR (.NET)")
print(f"DOTNET_ROOT: {dotnet_root}")
print()

try:
    print("Configuring pythonnet for CoreCLR...")
    import pythonnet
    pythonnet.load("coreclr")
    
    print("✓ Successfully configured pythonnet for CoreCLR")
    
    print("Importing clr...")
    import clr
    
    print("Adding reference to DWSIM.Automation.dll...")
    automation_dll = Path(lib_path) / 'DWSIM.Automation.dll'
    if not automation_dll.exists():
        print(f"ERROR: DWSIM.Automation.dll not found at {automation_dll}")
        sys.exit(1)
    
    clr.AddReference(str(automation_dll))
    print("✓ Added reference to DWSIM.Automation.dll")
    
    print("Importing Automation3...")
    from DWSIM.Automation import Automation3
    print("✓ Successfully imported Automation3 from DWSIM.Automation")
    
    print("Instantiating Automation3()...")
    automation = Automation3()
    print("✓ Successfully instantiated Automation3()")
    
    print("\n✅ SUCCESS: DWSIM automation can be loaded with CoreCLR!")
    print("   You can now proceed with the JSON→DWSIM mapping implementation.")
    
except Exception as e:
    print(f"\n❌ FAILED: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

