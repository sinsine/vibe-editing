# Dot-source at the start of a shell session in a vibe-editing project:
#
#   . tools\env.ps1
#
# Why this exists: `winget install Gyan.FFmpeg` updates the *persistent* PATH, but any
# shell that was already running keeps the old environment. The HyperFrames CLI needs
# `ffmpeg` on PATH, so a stale shell fails at the render step rather than at the start.
# Sourcing this puts the real binary on PATH for the current process only.
#
# NOTE: this file is deliberately pure ASCII. Windows PowerShell reads .ps1 as ANSI, so
# a non-ASCII character anywhere in here (a CJK path, a curly quote) corrupts parsing
# with a "missing terminator" error that points at the wrong line.
#
# Exposes: $FF (ffmpeg.exe), $FP (ffprobe.exe), $ROOT (project root), $PROJ (project)

$ffBin = $null

# 1. already on PATH?
$onPath = Get-Command ffmpeg -ErrorAction SilentlyContinue
if ($onPath) { $ffBin = Split-Path $onPath.Source -Parent }

# 2. the winget package layout (any version, any package id containing "ffmpeg")
if (-not $ffBin -and $env:LOCALAPPDATA) {
  $pkgRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
  if (Test-Path $pkgRoot) {
    foreach ($pkg in (Get-ChildItem $pkgRoot -Directory -ErrorAction SilentlyContinue)) {
      if ($pkg.Name -notmatch 'ffmpeg') { continue }
      $hit = Get-ChildItem $pkg.FullName -Recurse -Filter 'ffmpeg.exe' -ErrorAction SilentlyContinue |
        Select-Object -First 1
      if ($hit) { $ffBin = $hit.DirectoryName; break }
    }
  }
}

# 3. the usual manual install locations
if (-not $ffBin) {
  foreach ($d in @('C:\ffmpeg\bin', 'C:\Program Files\ffmpeg\bin')) {
    if (Test-Path (Join-Path $d 'ffmpeg.exe')) { $ffBin = $d; break }
  }
}

if ($ffBin) {
  if ($env:PATH -notlike "*$ffBin*") { $env:PATH = "$ffBin;$env:PATH" }
  $global:FF = Join-Path $ffBin 'ffmpeg.exe'
  $global:FP = Join-Path $ffBin 'ffprobe.exe'
  Write-Host "ffmpeg: $ffBin"
} else {
  Write-Warning "ffmpeg not found. Install it: winget install --id Gyan.FFmpeg -e"
  Write-Warning "or set HF_FFMPEG to the full path of ffmpeg.exe"
}

# project root = parent of this file's directory, so nothing machine-specific is baked in
$global:ROOT = Split-Path $PSScriptRoot -Parent
$global:PROJ = if (Test-Path (Join-Path $global:ROOT 'vibe.config.json')) {
  $cfg = Get-Content (Join-Path $global:ROOT 'vibe.config.json') -Raw -Encoding utf8 | ConvertFrom-Json
  Join-Path $global:ROOT (Join-Path 'videos' $cfg.slug)
} else { $null }
