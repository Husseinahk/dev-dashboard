# DevControl V2 — installer / shortcut creator
# Creates Desktop + Start menu shortcuts for start.bat and stop.bat.

$ErrorActionPreference = 'Stop'
$root      = Split-Path -Parent $MyInvocation.MyCommand.Path
$startBat  = Join-Path $root 'start.bat'
$stopBat   = Join-Path $root 'stop.bat'
$iconPath  = Join-Path $root 'frontend\public\favicon.ico'  # optional, may not exist

if (-not (Test-Path $startBat)) { throw "start.bat not found at $startBat" }
if (-not (Test-Path $stopBat))  { throw "stop.bat not found at $stopBat"  }

$shell = New-Object -ComObject WScript.Shell

function New-Shortcut($linkPath, $target, $args, $label) {
    $sc = $shell.CreateShortcut($linkPath)
    $sc.TargetPath = $target
    $sc.Arguments  = $args
    $sc.WorkingDirectory = Split-Path $target -Parent
    $sc.Description = $label
    if (Test-Path $iconPath) { $sc.IconLocation = "$iconPath,0" }
    $sc.Save()
    Write-Host "[OK]  $linkPath" -ForegroundColor Green
}

# [1/2] Desktop
$desktop = [Environment]::GetFolderPath('Desktop')
New-Shortcut "$desktop\DevControl.lnk"      $startBat '' 'Start DevControl V2'
New-Shortcut "$desktop\DevControl Stop.lnk" $stopBat  '' 'Stop DevControl V2'

# [2/2] Start menu
$startMenu = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\DevControl"
if (-not (Test-Path $startMenu)) { New-Item -ItemType Directory -Path $startMenu | Out-Null }
New-Shortcut "$startMenu\DevControl.lnk"      $startBat '' 'Start DevControl V2'
New-Shortcut "$startMenu\DevControl Stop.lnk" $stopBat  '' 'Stop DevControl V2'

Write-Host ""
Write-Host "DevControl V2 shortcuts installed." -ForegroundColor Cyan
Write-Host "  Start:  Desktop\DevControl.lnk      (or Start menu)"
Write-Host "  Stop:   Desktop\DevControl Stop.lnk"
Write-Host ""
Write-Host "Run start.bat to launch on http://localhost:3030" -ForegroundColor Yellow
