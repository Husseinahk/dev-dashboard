# =============================================================================
# DevControl — Installer
# Legt einen Desktop-Shortcut an (optional: Autostart + Startmenü-Eintrag)
# =============================================================================

$ErrorActionPreference = 'Stop'

$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$startBat    = Join-Path $scriptDir 'start.bat'
$icoSource   = Join-Path $scriptDir 'devcontrol.ico'
$desktopDir  = [Environment]::GetFolderPath('Desktop')
$startMenu   = [Environment]::GetFolderPath('Programs')
$startupDir  = [Environment]::GetFolderPath('Startup')

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  DevControl — Installer" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# ----- Prüfung -----
if (-not (Test-Path $startBat)) {
    Write-Host "ERROR: start.bat nicht gefunden in $scriptDir" -ForegroundColor Red
    exit 1
}

# ----- Shortcut-Creator-Helper -----
function New-Shortcut {
    param($target, $workingDir, $location, $name, $description)
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut((Join-Path $location "$name.lnk"))
    $shortcut.TargetPath = $target
    $shortcut.WorkingDirectory = $workingDir
    $shortcut.Description = $description
    $shortcut.WindowStyle = 7  # Minimized
    if (Test-Path $icoSource) { $shortcut.IconLocation = $icoSource }
    $shortcut.Save()
    Write-Host "  ✓ $location\$name.lnk" -ForegroundColor Green
}

# ----- Desktop-Shortcut (immer) -----
Write-Host "[1/3] Desktop-Shortcut..." -ForegroundColor Yellow
New-Shortcut -target $startBat -workingDir $scriptDir -location $desktopDir -name 'DevControl' -description 'DevControl Dashboard — Manage dev projects'

# ----- Startmenü (immer) -----
Write-Host ""
Write-Host "[2/3] Startmenü-Eintrag..." -ForegroundColor Yellow
New-Shortcut -target $startBat -workingDir $scriptDir -location $startMenu -name 'DevControl' -description 'DevControl Dashboard'

# ----- Autostart (optional) -----
Write-Host ""
Write-Host "[3/3] Autostart beim Windows-Start?" -ForegroundColor Yellow
$autostart = Read-Host "  Soll DevControl automatisch mit Windows starten? (j/n)"
if ($autostart -match '^(j|y|ja|yes)$') {
    New-Shortcut -target $startBat -workingDir $scriptDir -location $startupDir -name 'DevControl' -description 'DevControl Dashboard (Autostart)'
    Write-Host ""
    Write-Host "Autostart aktiviert. Entfernen: Shortcut aus '$startupDir' löschen." -ForegroundColor Gray
} else {
    Write-Host "  → übersprungen." -ForegroundColor Gray
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  Installation abgeschlossen!" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Doppelklick auf das DevControl-Icon auf dem Desktop" -ForegroundColor White
Write-Host "oder Start-Menü um das Dashboard zu starten." -ForegroundColor White
Write-Host ""
Write-Host "URL: http://localhost:3030" -ForegroundColor Cyan
Write-Host ""
pause
