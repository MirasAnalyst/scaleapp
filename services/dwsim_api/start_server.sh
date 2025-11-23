#!/bin/bash
# Startup script for DWSIM API service with proper Mono/pythonnet configuration

set -e

# Activate virtual environment
if [ ! -d ".venv" ]; then
    echo "Error: Virtual environment not found. Run: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

source .venv/bin/activate

# Set DWSIM environment variables
export DWSIM_LIB_PATH="${DWSIM_LIB_PATH:-/Applications/DWSIM.app/Contents/MonoBundle}"
export PYTHONNET_RUNTIME="${PYTHONNET_RUNTIME:-mono}"

# Prefer official Mono framework, fallback to Homebrew if not set
if [ -z "$PYTHONNET_LIBMONO" ]; then
    if [ -f "/Library/Frameworks/Mono.framework/Versions/Current/lib/libmonosgen-2.0.dylib" ]; then
        export PYTHONNET_LIBMONO="/Library/Frameworks/Mono.framework/Versions/Current/lib/libmonosgen-2.0.dylib"
    elif [ -f "/opt/homebrew/lib/libmono-2.0.dylib" ]; then
        export PYTHONNET_LIBMONO="/opt/homebrew/lib/libmono-2.0.dylib"
    fi
fi

export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

# Optional: Set template path if you have a base flowsheet
# export DWSIM_TEMPLATE_PATH="/path/to/blank-or-base.dwxml"

echo "Starting DWSIM API service..."
echo "  DWSIM_LIB_PATH: $DWSIM_LIB_PATH"
echo "  PYTHONNET_RUNTIME: $PYTHONNET_RUNTIME"
echo "  PYTHONNET_LIBMONO: $PYTHONNET_LIBMONO"
echo ""

# Start the server
# Bind to 0.0.0.0 to allow access from other machines on the network
uvicorn app.main:app --reload --host 0.0.0.0 --port 8081

