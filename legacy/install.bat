@echo off
REM Installer wrapper - runs install.ps1 with PowerShell
title DevControl - Installer
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 (
    echo.
    echo Installer finished with error code %errorlevel%.
)
pause
