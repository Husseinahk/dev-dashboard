@echo off
setlocal EnableDelayedExpansion
title DevControl V2

REM ---------------------------------------------------------------
REM  DevControl single-command launcher
REM   - Ensures Node 20 (NVM-Windows)
REM   - Installs deps if missing
REM   - Builds frontend if dist missing or stale
REM   - Starts backend on port 3030 (serves built frontend too)
REM   - Opens browser
REM ---------------------------------------------------------------

cd /d "%~dp0"

REM ---- Locate Node 20 via NVM ----
set "NODE20DIR="
if exist "%APPDATA%\nvm\v20.20.1\node.exe" set "NODE20DIR=%APPDATA%\nvm\v20.20.1"
if not defined NODE20DIR (
    for /d %%D in ("%APPDATA%\nvm\v20*") do (
        if exist "%%D\node.exe" set "NODE20DIR=%%D"
    )
)
if not defined NODE20DIR (
    echo [DevControl] Node 20 not found in %APPDATA%\nvm.
    echo Install Node 20 via NVM-Windows: nvm install 20.20.1
    pause
    exit /b 1
)

set "PATH=%NODE20DIR%;%APPDATA%\npm;%PATH%"
echo [DevControl] Using Node:
node --version

REM ---- Install root + workspaces if node_modules missing ----
if not exist "node_modules" (
    echo [DevControl] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [DevControl] npm install failed.
        pause
        exit /b 1
    )
)

REM ---- Build frontend if dist missing ----
if not exist "frontend\dist\index.html" (
    echo [DevControl] Building frontend...
    call npm --prefix frontend run build
    if errorlevel 1 (
        echo [DevControl] Frontend build failed.
        pause
        exit /b 1
    )
)

REM ---- Build backend if dist missing ----
if not exist "backend\dist\index.js" (
    echo [DevControl] Building backend...
    call npm --prefix backend run build
    if errorlevel 1 (
        echo [DevControl] Backend build failed.
        pause
        exit /b 1
    )
)

REM ---- Open browser shortly after backend boots ----
start "" cmd /c "ping 127.0.0.1 -n 2 >nul & start http://localhost:3030"

REM ---- Run backend (foreground, Ctrl+C to stop) ----
echo [DevControl] Starting on http://localhost:3030
node backend\dist\index.js
