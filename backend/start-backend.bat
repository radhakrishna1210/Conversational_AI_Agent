@echo off
REM ========================================
REM Quick Start Backend Server
REM ========================================
REM This script starts the backend server with mock auth
REM No database setup needed!

echo.
echo ========================================
echo   Conversational AI Backend
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

echo [✓] Node.js detected: %PATH%
echo.

REM Check if we're in the backend directory
if not exist "package.json" (
    echo [ERROR] This script must be run from the backend directory!
    echo Usage: cd backend && start-backend.bat
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

REM Check .env file
if not exist ".env" (
    echo [!] .env file not found - creating from template...
    if exist ".env.template" (
        copy .env.template .env
        echo [✓] Created .env file from template
    ) else (
        echo [ERROR] .env.template not found
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo Starting Backend Server...
echo ========================================
echo.
echo Server will run on: http://localhost:4000
echo.
echo Mock Auth Test Credentials:
echo   Email: test@example.com
echo   Password: password123
echo.
echo   OR
echo.
echo   Email: admin@example.com
echo   Password: admin123
echo.
echo ========================================
echo Press Ctrl+C to stop the server
echo ========================================
echo.

call npm run dev
