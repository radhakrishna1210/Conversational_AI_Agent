@echo off
REM ========================================
REM MASTER STARTUP SCRIPT
REM ========================================
REM This script starts BOTH backend and frontend servers
REM Usage: Run from project root directory

echo.
echo ╔════════════════════════════════════════╗
echo ║  Conversational AI - Complete Startup  ║
echo ╚════════════════════════════════════════╝
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not installed!
    echo Download from: https://nodejs.org/
    pause
    exit /b 1
)

echo [✓] Node.js detected
echo.

REM Check if we're in the project root
if not exist "backend" (
    echo [ERROR] This script must be run from the project root!
    echo Expected: backend/ and client/ directories
    pause
    exit /b 1
)

echo [*] Setting up Backend...
cd backend

if not exist "node_modules" (
    echo [*] Installing backend dependencies...
    call npm install > nul 2>&1
)

if not exist ".env" (
    if exist ".env.template" (
        copy .env.template .env > nul
        echo [✓] Created .env from template
    )
)

cd ..

echo [✓] Backend ready
echo.

echo [*] Setting up Frontend...
cd client

if not exist "node_modules" (
    echo [*] Installing frontend dependencies...
    call npm install > nul 2>&1
)

cd ..

echo [✓] Frontend ready
echo.

echo ╔════════════════════════════════════════╗
echo ║         STARTUP COMPLETE               ║
echo ╚════════════════════════════════════════╝
echo.
echo [!] IMPORTANT: You need TWO terminal windows
echo.
echo TERMINAL 1 - Start Backend:
echo   cd backend
echo   npm run dev
echo.
echo TERMINAL 2 - Start Frontend:
echo   cd client
echo   npm run dev
echo.
echo OR use the quick start scripts:
echo   backend\start-backend.bat
echo   client\start-frontend.bat
echo.
echo Then open browser: http://localhost:5173
echo.
echo Test Credentials (Mock Auth):
echo   Email: test@example.com
echo   Password: password123
echo.
pause
