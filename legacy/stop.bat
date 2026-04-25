@echo off
REM Stops DevControl dashboard - kills node process on port 3030
title DevControl - Stop

echo.
echo Stopping DevControl...
echo.

REM Find PID listening on port 3030
set "PID="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3030" ^| findstr "LISTENING"') do (
    set "PID=%%a"
)

if "%PID%"=="" (
    echo DevControl is not running ^(no process on port 3030^).
    echo.
    timeout /t 2 >nul
    exit /b 0
)

echo Killing PID %PID%...
taskkill /PID %PID% /T /F >nul 2>&1

if errorlevel 1 (
    echo Failed to stop DevControl. You may need to close the window manually.
    pause
    exit /b 1
)

echo DevControl stopped.
echo.
timeout /t 2 >nul
exit /b 0
