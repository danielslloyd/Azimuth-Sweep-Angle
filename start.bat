@echo off
REM Project Overwatch - Start Script for Windows
REM Starts both backend server and frontend client

echo ======================================
echo       PROJECT OVERWATCH
echo   Voice-Controlled Tactical Command
echo ======================================
echo.

set USE_MOCK=
if "%1"=="--mock" (
    set USE_MOCK=--mock
    echo Running in MOCK mode (no GPU required)
)

REM Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: Node.js not found. Please install Node.js 16+
    exit /b 1
)

REM Check for Python
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: Python not found. Please install Python 3.8+
    exit /b 1
)

REM Install npm dependencies if needed
if not exist "node_modules" (
    echo Installing npm dependencies...
    call npm install
)

echo.
echo Starting services...
echo Backend:  http://localhost:8765 (WebSocket)
echo Frontend: http://localhost:3000
echo.
echo Press Ctrl+C to stop all services
echo.

REM Start both services with concurrently
call npx concurrently -n server,client -c blue,green "python server/run_server.py %USE_MOCK%" "npx http-server client/public -p 3000 -c-1 --cors -s"
