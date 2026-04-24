# =============================================================================
# DevControl - Installer
# Creates a Desktop shortcut (optional: Autostart + Start menu entry)
# =============================================================================

$ErrorActionPreference = 'Stop'

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Definition
$startBat   = Join-Path $scriptDir 'start.bat'
$stopBat    = Join-Path $scriptDir 'stop.bat'
$icoSource  = Join-Path $scriptDir 'devcontrol.ico'
$desktopDir = [Environment]::GetFolderPath('Desktop')
$startMenu  = [Environment]::GetFolderPath('Programs')
$startupDir = [Environment]::GetFolderPath('Startup')

function Write-Title {
    Write-Host ""
    Write-Host "===============================================" -ForegroundColor Cyan
    Write-Host "  DevControl - Installer" -ForegroundColor Cyan
    Write-Host "===============================================" -ForegroundColor Cyan
    Write-Host ""
}

function New-DevControlShortcut {
    param(
        [string]$Target,
        [string]$WorkingDir,
        [string]$Location,
        [string]$Name,
        [string]$Description
    )
    $shell = New-Object -ComObject WScript.Shell
    $lnkPath = Join-Path $Location ($Name + '.lnk')
    $shortcut = $shell.CreateShortcut($lnkPath)
    $shortcut.TargetPath = $Target
    $shortcut.WorkingDirectory = $WorkingDir
    $shortcut.Description = $Description
    $shortcut.WindowStyle = 7  # Minimized
    if (Test-Path $icoSource) {
        $shortcut.IconLocation = $icoSource
    }
    $shortcut.Save()
    Write-Host ("  OK -> " + $lnkPath) -ForegroundColor Green
}

Write-Title

if (-not (Test-Path $startBat)) {
    Write-Host ("ERROR: start.bat not found in " + $scriptDir) -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[1/4] Desktop shortcuts (Start + Stop)..." -ForegroundColor Yellow
New-DevControlShortcut -Target $startBat -WorkingDir $scriptDir -Location $desktopDir -Name 'DevControl' -Description 'DevControl Dashboard'
if (Test-Path $stopBat) {
    New-DevControlShortcut -Target $stopBat -WorkingDir $scriptDir -Location $desktopDir -Name 'DevControl - Stop' -Description 'Stop DevControl Dashboard'
}

Write-Host ""
Write-Host "[2/4] Start menu entries..." -ForegroundColor Yellow
New-DevControlShortcut -Target $startBat -WorkingDir $scriptDir -Location $startMenu -Name 'DevControl' -Description 'DevControl Dashboard'
if (Test-Path $stopBat) {
    New-DevControlShortcut -Target $stopBat -WorkingDir $scriptDir -Location $startMenu -Name 'DevControl - Stop' -Description 'Stop DevControl Dashboard'
}

Write-Host ""
Write-Host "[3/4] Autostart on Windows startup?" -ForegroundColor Yellow
$autostart = Read-Host "  Should DevControl auto-start with Windows? (y/n)"
if ($autostart -match '^(j|y|ja|yes)$') {
    New-DevControlShortcut -Target $startBat -WorkingDir $scriptDir -Location $startupDir -Name 'DevControl' -Description 'DevControl Dashboard (Autostart)'
    Write-Host ""
    Write-Host ("Autostart enabled. Remove: delete shortcut from " + $startupDir) -ForegroundColor Gray
} else {
    Write-Host "  -> skipped." -ForegroundColor Gray
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Double-click the DevControl icon on your desktop" -ForegroundColor White
Write-Host "or in the Start menu to launch the dashboard." -ForegroundColor White
Write-Host ""
Write-Host "URL: http://localhost:3030" -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter to exit"
