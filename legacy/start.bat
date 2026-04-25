@echo off
title DevControl Dashboard
cd /d "%~dp0"

REM -----------------------------------------------------------------------------
REM DevControl — Dashboard starter
REM -----------------------------------------------------------------------------

REM Check: Node.js installed?
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: Node.js nicht gefunden im PATH.
    echo Installiere Node.js oder stelle sicher dass es erreichbar ist.
    echo.
    pause
    exit /b 1
)

REM Install dependencies on first run
if not exist "node_modules\" (
    echo.
    echo Erste Ausfuehrung — installiere Dependencies...
    echo.
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo ERROR: npm install fehlgeschlagen.
        pause
        exit /b 1
    )
)

REM Start server
echo.
echo ====================================
echo   DevControl Dashboard
echo   http://localhost:3030
echo ====================================
echo.
node server.js

REM Keep window open if crashed
pause
