@echo off
REM ========================================
REM Quick Start Frontend Server
REM ========================================
REM This script starts the frontend development server

echo.
echo ========================================
echo   Conversational AI Frontend
echo   Quick Start Script
echo ========================================
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

REM Check if we're in the frontend directory
if not exist "package.json" (
    echo [ERROR] This script must be run from the client directory!
    echo Usage: cd client && start-frontend.bat
    pause
    exit /b 1
)

REM Install dependencies if needed
if not exist "node_modules" (
    echo [*] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
)

echo [✓] Dependencies ready
echo.

echo ========================================
echo Starting Frontend Server...
echo ========================================
echo.
echo Frontend will run on: http://localhost:5173
echo Backend should be running on: http://localhost:4000
echo.
echo ========================================
echo Press Ctrl+C to stop the server
echo ========================================
echo.

call npm run dev
