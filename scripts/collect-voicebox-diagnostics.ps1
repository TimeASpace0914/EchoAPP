<#!
.SYNOPSIS
  Collects read-only diagnostics for a local Windows Voicebox installation.

.DESCRIPTION
  This script does not stop Voicebox, delete files, download models, or change
  Cloudflare Tunnel configuration. It gathers system, API, cache, and recent
  server-log data needed to diagnose model initialization failures.
#>

[CmdletBinding()]
param(
  [string]$VoiceboxUrl = "http://127.0.0.1:17493",
  [int]$LogTailLines = 500
)

$ErrorActionPreference = "Continue"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputRoot = Join-Path ([Environment]::GetFolderPath("Desktop")) "voicebox-diagnostics-$timestamp"
$appData = Join-Path $env:APPDATA "sh.voicebox.app"
$logPath = Join-Path $appData "logs\server.log"
$modelRoot = Join-Path $env:USERPROFILE ".cache\huggingface\hub"
$qwenModelPath = Join-Path $modelRoot "models--Qwen--Qwen3-TTS-12Hz-1.7B-Base"
$serverExe = "C:\Program Files\Voicebox\voicebox-server.exe"

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

function Write-Report {
  param([string]$Name, [scriptblock]$Action)
  $target = Join-Path $outputRoot $Name
  try {
    & $Action 2>&1 | Out-File -FilePath $target -Encoding utf8
  } catch {
    "DIAGNOSTIC COLLECTION FAILED" | Out-File -FilePath $target -Encoding utf8
    $_ | Out-File -FilePath $target -Append -Encoding utf8
  }
}

function Get-ApiSnapshot {
  param([string]$Endpoint)
  try {
    $uri = "$VoiceboxUrl$Endpoint"
    $response = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 20
    "URL: $uri"
    "HTTP: $($response.StatusCode)"
    ""
    $response.Content
  } catch {
    "URL: $VoiceboxUrl$Endpoint"
    "REQUEST FAILED"
    $_ | Out-String
  }
}

Write-Report "00-summary.txt" {
  @(
    "Collected: $(Get-Date -Format o)",
    "Voicebox URL: $VoiceboxUrl",
    "Voicebox EXE: $serverExe",
    "Voicebox data: $appData",
    "Server log: $logPath",
    "Qwen cache: $qwenModelPath",
    "Read-only diagnostic collection: no models, profiles, database, or tunnel settings were changed."
  )
}

Write-Report "01-windows-system.txt" {
  Get-CimInstance Win32_OperatingSystem |
    Select-Object Caption, Version, BuildNumber, OSArchitecture, LastBootUpTime, FreePhysicalMemory, TotalVisibleMemorySize |
    Format-List
  ""
  Get-CimInstance Win32_ComputerSystem |
    Select-Object Manufacturer, Model, TotalPhysicalMemory, NumberOfLogicalProcessors |
    Format-List
  ""
  Get-CimInstance Win32_VideoController |
    Select-Object Name, DriverVersion, AdapterRAM, VideoProcessor |
    Format-List
}

Write-Report "02-voicebox-processes.txt" {
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessName -match "voicebox|cloudflared" } |
    Select-Object ProcessName, Id, StartTime, CPU, WorkingSet64, Path |
    Format-Table -AutoSize
  ""
  Get-NetTCPConnection -LocalPort 17493 -ErrorAction SilentlyContinue |
    Select-Object State, LocalAddress, LocalPort, OwningProcess |
    Format-Table -AutoSize
}

Write-Report "03-voicebox-version.txt" {
  if (Test-Path $serverExe) {
    Get-Item $serverExe | Select-Object FullName, Length, CreationTime, LastWriteTime, VersionInfo | Format-List
    ""
    & $serverExe --version 2>&1
  } else {
    "Voicebox executable was not found at: $serverExe"
  }
}

Write-Report "04-api-health.txt" { Get-ApiSnapshot "/health" }
Write-Report "05-api-models-status.txt" { Get-ApiSnapshot "/models/status" }
Write-Report "06-api-generation-settings.txt" { Get-ApiSnapshot "/settings/generation" }

Write-Report "07-qwen-cache.txt" {
  if (Test-Path $qwenModelPath) {
    Get-ChildItem -Force $qwenModelPath -Recurse |
      Select-Object FullName, Length, LastWriteTime |
      Sort-Object FullName |
      Format-Table -AutoSize
    ""
    $bytes = (Get-ChildItem -Force $qwenModelPath -Recurse -File | Measure-Object -Property Length -Sum).Sum
    "Total cache bytes: $bytes"
    "Total cache GiB: $([Math]::Round($bytes / 1GB, 3))"
  } else {
    "Qwen 1.7B cache folder was not found: $qwenModelPath"
  }
}

Write-Report "08-disk-space.txt" {
  Get-PSDrive -PSProvider FileSystem |
    Select-Object Name, Root, Used, Free |
    Format-Table -AutoSize
}

Write-Report "09-recent-server-log.txt" {
  if (Test-Path $logPath) {
    Get-Content -Path $logPath -Tail $LogTailLines
  } else {
    "Voicebox server log was not found: $logPath"
  }
}

Write-Report "10-error-extract.txt" {
  if (Test-Path $logPath) {
    Select-String -Path $logPath -Pattern "ERROR|Traceback|AssertionError|RuntimeError|NotImplementedError|meta tensor|Unexpected result type|Loading .* model|loaded successfully" -Context 2, 8 |
      ForEach-Object { $_.ToString() }
  } else {
    "Voicebox server log was not found: $logPath"
  }
}

Write-Report "11-environment.txt" {
  "USERNAME: $env:USERNAME"
  "COMPUTERNAME: $env:COMPUTERNAME"
  "APPDATA: $env:APPDATA"
  "LOCALAPPDATA: $env:LOCALAPPDATA"
  "USERPROFILE: $env:USERPROFILE"
  "HF_HOME: $env:HF_HOME"
  "HF_HUB_CACHE: $env:HF_HUB_CACHE"
  "VOICEBOX_BACKEND_VARIANT: $env:VOICEBOX_BACKEND_VARIANT"
  ""
  "Note: This report intentionally does not export tunnel tokens, API keys, or other secret values."
}

$archivePath = "$outputRoot.zip"
Compress-Archive -Path (Join-Path $outputRoot "*") -DestinationPath $archivePath -Force

Write-Host "Voicebox detailed diagnostics completed."
Write-Host "Folder:  $outputRoot"
Write-Host "Archive: $archivePath"
Write-Host "Please provide 10-error-extract.txt and 05-api-models-status.txt, or the ZIP archive if it contains no sensitive paths you need to withhold."
