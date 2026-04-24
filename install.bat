@echo off
REM Installer-Wrapper — startet install.ps1 mit PowerShell
title DevControl — Installer
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
