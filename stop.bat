@echo off
REM Kill whatever node process owns port 3030.
setlocal EnableDelayedExpansion
set PORT=3030
set FOUND=0
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    echo [DevControl] Killing PID %%P on port %PORT% ...
    taskkill /PID %%P /T /F >nul 2>&1
    set FOUND=1
)
if "%FOUND%"=="0" echo [DevControl] No process listening on port %PORT%.
endlocal
