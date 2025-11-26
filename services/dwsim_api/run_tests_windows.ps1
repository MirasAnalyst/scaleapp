# PowerShell script to run DWSIM API tests on Windows
# Run this from the services/dwsim_api directory

Write-Host "=== DWSIM API Test Runner ===" -ForegroundColor Cyan

# Activate virtual environment
if (Test-Path ".venv\Scripts\Activate.ps1") {
    Write-Host "Activating virtual environment..." -ForegroundColor Yellow
    .\.venv\Scripts\Activate.ps1
} else {
    Write-Host "Warning: Virtual environment not found. Make sure you're in the services/dwsim_api directory." -ForegroundColor Yellow
}

# Set environment variables
$env:DWSIM_LIB_PATH = "C:\Program Files\DWSIM"
if (-not (Test-Path $env:DWSIM_LIB_PATH)) {
    Write-Host "Warning: DWSIM_LIB_PATH not found at $env:DWSIM_LIB_PATH" -ForegroundColor Yellow
    Write-Host "Please set DWSIM_LIB_PATH to your DWSIM installation directory" -ForegroundColor Yellow
}

# Clear DOTNET_ROOT to force .NET Framework (not CoreCLR)
if ($env:DOTNET_ROOT) {
    Write-Host "Clearing DOTNET_ROOT to use .NET Framework..." -ForegroundColor Yellow
    Remove-Item Env:\DOTNET_ROOT
}

Write-Host "`n=== Running API Discovery Test ===" -ForegroundColor Cyan
python test_api_discovery.py

Write-Host "`n=== Running Simple Flowsheet Test ===" -ForegroundColor Cyan
python test_simple_flowsheet.py

Write-Host "`n=== Tests Complete ===" -ForegroundColor Green


