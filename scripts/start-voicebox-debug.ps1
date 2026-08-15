<#!
.SYNOPSIS
  Starts the existing Windows Voicebox server with DEBUG-level logs captured to the Desktop.

.DESCRIPTION
  This script does not delete model caches, profiles, the Voicebox database, or Cloudflare
  Tunnel settings. It only stops the existing local Voicebox process, then starts the same
  installed voicebox-server.exe with detailed stderr/stdout output captured to a timestamped
  desktop log. Keep this PowerShell window open while reproducing one generation failure.
#>

[CmdletBinding()]
param(
  [int]$Port = 17493,
  [string]$DataDir = (Join-Path $env:APPDATA "sh.voicebox.app"),
  [string]$ServerExe = "C:\Program Files\Voicebox\voicebox-server.exe"
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$debugDir = Join-Path ([Environment]::GetFolderPath("Desktop")) "voicebox-debug-$timestamp"
$debugLog = Join-Path $debugDir "voicebox-server-debug.log"
$environmentLog = Join-Path $debugDir "environment.txt"

if (-not (Test-Path $ServerExe)) {
  throw "Voicebox server executable was not found: $ServerExe"
}

New-Item -ItemType Directory -Force -Path $debugDir | Out-Null

@(
  "Started: $(Get-Date -Format o)",
  "Server executable: $ServerExe",
  "Data directory: $DataDir",
  "Port: $Port",
  "PowerShell: $($PSVersionTable.PSVersion)",
  "Windows: $((Get-CimInstance Win32_OperatingSystem).Caption) $((Get-CimInstance Win32_OperatingSystem).Version)",
  ""
  "This launcher preserves model caches, profiles, database, and tunnel configuration."
) | Out-File -FilePath $environmentLog -Encoding utf8

Write-Host "Stopping the existing local Voicebox processes..." -ForegroundColor Yellow
Get-Process -Name "voicebox-server" -ErrorAction SilentlyContinue | Stop-Process -Force

# The desktop parent app relaunches its sidecar automatically while open. Closing it prevents a
# second process from binding port 17493 during this controlled diagnostic run.
Get-Process -Name "voicebox" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

if (Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }) {
  throw "Port $Port is still in use. Close Voicebox completely, wait five seconds, then run this script again."
}

$env:PYTHONFAULTHANDLER = "1"
$env:PYTHONUNBUFFERED = "1"
$env:PYTHONWARNINGS = "default"
$env:TRANSFORMERS_VERBOSITY = "debug"
$env:HF_HUB_VERBOSITY = "debug"
$env:TORCH_SHOW_CPP_STACKTRACES = "1"

Write-Host "Starting Voicebox with detailed diagnostics..." -ForegroundColor Cyan
Write-Host "Debug log: $debugLog" -ForegroundColor Cyan
Write-Host "Keep this window open. Reproduce one generation in the APP, then press Ctrl+C here." -ForegroundColor Yellow

& $ServerExe --host "0.0.0.0" --port $Port --data-dir $DataDir 2>&1 |
  Tee-Object -FilePath $debugLog

Write-Host "Voicebox exited. Diagnostic files remain at: $debugDir" -ForegroundColor Yellow
