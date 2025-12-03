# PowerShell script to start DWSIM API on Windows VM
# Usage: .\start_dwsim_api_windows.ps1

# Navigate to DWSIM API directory
$dwsimApiPath = "C:\scaleapp\services\dwsim_api"
if (-not (Test-Path $dwsimApiPath)) {
    Write-Host "Error: DWSIM API directory not found at $dwsimApiPath" -ForegroundColor Red
    Write-Host "Please update the path in this script to match your installation." -ForegroundColor Yellow
    exit 1
}

Set-Location $dwsimApiPath

# Activate virtual environment
if (Test-Path ".venv\Scripts\Activate.ps1") {
    .\.venv\Scripts\Activate.ps1
} else {
    Write-Host "Error: Virtual environment not found. Please create it first:" -ForegroundColor Red
    Write-Host "  python -m venv .venv" -ForegroundColor Yellow
    Write-Host "  .venv\Scripts\activate" -ForegroundColor Yellow
    Write-Host "  pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}

# Set DWSIM library path
$env:DWSIM_LIB_PATH = "C:\Users\miras\AppData\Local\DWSIM"

# Verify DWSIM path exists
if (-not (Test-Path $env:DWSIM_LIB_PATH)) {
    Write-Host "Warning: DWSIM path not found: $env:DWSIM_LIB_PATH" -ForegroundColor Yellow
    Write-Host "Please verify the DWSIM installation path." -ForegroundColor Yellow
}

# Check for DWSIM.Automation.dll
$automationDll = Join-Path $env:DWSIM_LIB_PATH "DWSIM.Automation.dll"
if (-not (Test-Path $automationDll)) {
    Write-Host "Warning: DWSIM.Automation.dll not found at: $automationDll" -ForegroundColor Yellow
    Write-Host "The API will run in mock mode if DWSIM cannot be loaded." -ForegroundColor Yellow
}

Write-Host "Starting DWSIM API server..." -ForegroundColor Green
Write-Host "DWSIM_LIB_PATH: $env:DWSIM_LIB_PATH" -ForegroundColor Cyan
Write-Host "Server will be available at: http://0.0.0.0:8081" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Start the server
uvicorn app.main:app --host 0.0.0.0 --port 8081

