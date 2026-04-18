# ========================================
# MASTER STARTUP SCRIPT (PowerShell)
# ========================================
# Run this from the project root directory
# Usage: .\STARTUP.ps1

Write-Host "`n" -ForegroundColor Gray
Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Conversational AI - Complete Startup  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "`n" -ForegroundColor Gray

# Check if Node.js is installed
$nodeExists = $null -ne (Get-Command node -ErrorAction SilentlyContinue)
if (-not $nodeExists) {
    Write-Host "[ERROR] Node.js is not installed!" -ForegroundColor Red
    Write-Host "Download from: https://nodejs.org/`n" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[✓] Node.js detected`n" -ForegroundColor Green

# Check if we're in the project root
if (-not (Test-Path "backend")) {
    Write-Host "[ERROR] This script must be run from the project root!`n" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[*] Setting up Backend...`n" -ForegroundColor Yellow

Push-Location backend

if (-not (Test-Path "node_modules")) {
    Write-Host "[*] Installing backend dependencies..." -ForegroundColor Yellow
    & npm install 2>&1 | Out-Null
}

if (-not (Test-Path ".env")) {
    if (Test-Path ".env.template") {
        Copy-Item ".env.template" ".env" -Force
        Write-Host "[✓] Created .env from template`n" -ForegroundColor Green
    }
}

Pop-Location

Write-Host "[✓] Backend ready`n" -ForegroundColor Green

Write-Host "[*] Setting up Frontend...`n" -ForegroundColor Yellow

Push-Location client

if (-not (Test-Path "node_modules")) {
    Write-Host "[*] Installing frontend dependencies..." -ForegroundColor Yellow
    & npm install 2>&1 | Out-Null
}

Pop-Location

Write-Host "[✓] Frontend ready`n" -ForegroundColor Green

Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         STARTUP COMPLETE               ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "`n" -ForegroundColor Gray

Write-Host "[!] IMPORTANT: You need TWO PowerShell windows`n" -ForegroundColor Yellow

Write-Host "WINDOW 1 - Start Backend:` `n" -ForegroundColor Cyan
Write-Host "  cd backend`n  npm run dev`n" -ForegroundColor Gray

Write-Host "WINDOW 2 - Start Frontend:` `n" -ForegroundColor Cyan
Write-Host "  cd client`n  npm run dev`n" -ForegroundColor Gray

Write-Host "OR use the quick start scripts:` `n" -ForegroundColor Cyan
Write-Host "  .\backend\start-backend.bat`n  .\client\start-frontend.bat`n" -ForegroundColor Gray

Write-Host "Then open browser: " -ForegroundColor Cyan -NoNewline
Write-Host "http://localhost:5173`n" -ForegroundColor Green

Write-Host "Test Credentials (Mock Auth):` " -ForegroundColor Yellow
Write-Host "  Email: test@example.com`n  Password: password123`n" -ForegroundColor Gray

Read-Host "Press Enter when ready"
