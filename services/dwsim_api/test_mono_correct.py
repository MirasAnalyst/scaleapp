#!/usr/bin/env python3
"""Test script with correct Mono library path configuration"""

import os
import sys
from pathlib import Path

lib_path = '/Applications/DWSIM.app/Contents/MonoBundle'

os.environ['DOTNET_SYSTEM_GLOBALIZATION_INVARIANT'] = '1'
os.environ['PYTHONNET_RUNTIME'] = 'mono'

# Use the library path, not the binary path
mono_lib = '/Library/Frameworks/Mono.framework/Versions/Current/lib/libmonosgen-2.0.dylib'
if Path(mono_lib).exists():
    os.environ['PYTHONNET_LIBMONO'] = mono_lib
    print(f"Using Mono library: {mono_lib}")
else:
    print(f"ERROR: Mono library not found at {mono_lib}")
    sys.exit(1)

sys.path.append(lib_path)

print("Configuring pythonnet...")
import pythonnet
pythonnet.load("mono", libmono=mono_lib)

print("Importing clr...")
import clr

print("Adding reference to DWSIM.Automation.dll...")
clr.AddReference('DWSIM.Automation.dll')

print("✅ SUCCESS: DWSIM.Automation.dll loaded!")

