# PaperDeck SMTC bridge.
# Uses the Windows System Media Transport Controls session manager so Apple Music,
# NetEase Cloud Music, QQ Music, Kugou and any other SMTC-aware player work alike.
param(
  [string]$CommandFile = (Join-Path $env:TEMP 'PaperDeck\smtc-command.txt')
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
# PowerShell 5.1 cannot bind the projected COM stream directly to this
# extension method; invoke it through reflection so SMTC thumbnails can be
# copied to disk.
$asStreamForRead = ([System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.FullName -eq 'Windows.Storage.Streams.IInputStream'
})[0]

function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  return $netTask.Result
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime] | Out-Null

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public class PaperDeckWindowText {
  [DllImport("user32.dll")]
  private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  public static string FindKugouTitle() {
    string found = null;
    string suffix = " - " + "\u9177\u72D7\u97F3\u4E50";
    EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
      var text = new StringBuilder(512);
      GetWindowText(hWnd, text, 512);
      string title = text.ToString().Trim();
      if (title.Length > suffix.Length && title.EndsWith(suffix) && !title.StartsWith("\u684C\u9762\u6B4C\u8BCD")) {
        found = title;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@ -Language CSharp

function Get-KugouWindowTitle {
  try { return [PaperDeckWindowText]::FindKugouTitle() } catch { return $null }
}

function Write-State($state) {
  try {
    [Console]::Out.WriteLine('@@STATE@@' + ($state | ConvertTo-Json -Compress -Depth 6))
    [Console]::Out.Flush()
  } catch { }
}

$manager = $null
try {
  $manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
} catch {
  [Console]::Error.WriteLine('SMTC manager unavailable: ' + $_.Exception.Message)
  [Console]::Out.WriteLine('@@FATAL@@smtc-unavailable')
  exit 1
}

$cacheDir = Join-Path $env:LOCALAPPDATA 'PaperDeck\cache'
New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
$commandDir = Split-Path -Parent $CommandFile
New-Item -ItemType Directory -Force -Path $commandDir | Out-Null
Set-Content -Path $CommandFile -Value @() -Encoding UTF8

$preferred = 'auto'
$lastCoverKey = ''
$lastCoverPath = $null
$lastCoverVersion = $null
$coverWaitUntil = 0
$coverRefreshUntil = 0
$lastEmit = 0
$lastCommandCount = 0
$started = [DateTime]::UtcNow
[Console]::Out.WriteLine('@@READY@@')
[Console]::Out.Flush()

function Get-BestSession {
  $sessions = @($manager.GetSessions())
  if ($sessions.Count -eq 0) { return $null }
  if ($preferred -and $preferred -ne 'auto') {
    $matched = $sessions | Where-Object { $_.SourceAppUserModelId.ToLower().Contains($preferred.ToLower()) } | Select-Object -First 1
    if ($null -ne $matched) { return $matched }
  }
  $current = $manager.GetCurrentSession()
  if ($null -ne $current) {
    try {
      if ($current.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing') { return $current }
    } catch { }
  }
  foreach ($session in $sessions) {
    try {
      if ($session.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing') { return $session }
    } catch { }
  }
  if ($null -ne $current) { return $current }
  return $sessions[0]
}

function Test-ImageFile($path) {
  try {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    if ($bytes.Length -lt 12) { return $false }
    if ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8) { return $true } # JPEG
    if ($bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50 -and $bytes[2] -eq 0x4E -and $bytes[3] -eq 0x47) { return $true } # PNG
    if ($bytes[0] -eq 0x47 -and $bytes[1] -eq 0x49 -and $bytes[2] -eq 0x46) { return $true } # GIF
    if ($bytes[0] -eq 0x42 -and $bytes[1] -eq 0x4D) { return $true } # BMP
    if ($bytes[0] -eq 0x52 -and $bytes[1] -eq 0x49 -and $bytes[8] -eq 0x57) { return $true } # WebP
    return $false
  } catch {
    return $false
  }
}

function Get-CoverPath($props, [bool]$Force = $false) {
  if ($null -eq $props.Thumbnail) { return $null }
  $sha = [System.Security.Cryptography.SHA1]::Create()
  $key = ($props.Title + '|' + $props.Artist + '|' + $props.AlbumTitle)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($key)
  $hash = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').Substring(0, 16).ToLower()
  $sha.Dispose()
  $file = Join-Path $cacheDir ('cover-' + $hash + '.img')
  if (Test-Path $file) {
    if ((Test-ImageFile $file) -and -not $Force) { return $file }
    if (-not (Test-ImageFile $file)) { Remove-Item $file -Force -ErrorAction SilentlyContinue }
  }
  $temp = $file + '.tmp'
  try {
    $stream = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    $netStream = $asStreamForRead.Invoke($null, [object[]]@($stream))
    $fileStream = [System.IO.File]::Create($temp)
    $netStream.CopyTo($fileStream)
    $fileStream.Dispose()
    $netStream.Dispose()
    if (Test-ImageFile $temp) {
      if ($Force -and (Test-Path $file)) {
        $oldHash = (Get-FileHash $file -Algorithm SHA256).Hash
        $newHash = (Get-FileHash $temp -Algorithm SHA256).Hash
        if ($oldHash -eq $newHash) {
          Remove-Item $temp -Force -ErrorAction SilentlyContinue
          return $file
        }
      }
      Move-Item $temp $file -Force
      return $file
    }
    Remove-Item $temp -Force -ErrorAction SilentlyContinue
    return $null
  } catch {
    Remove-Item $temp -Force -ErrorAction SilentlyContinue
    return $null
  }
}

function Invoke-SessionCommand($activeSession, $line) {
  if ($null -eq $activeSession) { return }
  try {
    $parts = $line.Trim().Split(' ', 2)
    switch ($parts[0]) {
      'playpause' { [void](Await ($activeSession.TryTogglePlayPauseAsync()) ([bool])) }
      'play' {
        if ($activeSession.GetPlaybackInfo().PlaybackStatus.ToString() -ne 'Playing') {
          [void](Await ($activeSession.TryTogglePlayPauseAsync()) ([bool]))
        }
      }
      'pause' {
        if ($activeSession.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing') {
          [void](Await ($activeSession.TryTogglePlayPauseAsync()) ([bool]))
        }
      }
      'next' { [void](Await ($activeSession.TrySkipNextAsync()) ([bool])) }
      'previous' { [void](Await ($activeSession.TrySkipPreviousAsync()) ([bool])) }
      'seek' {
        if ($parts.Count -gt 1) {
          $ms = [int64]$parts[1]
          [void](Await ($activeSession.TryChangePlaybackPositionAsync($ms * 10000)) ([bool]))
        }
      }
      'pref' { $script:preferred = $parts[1] }
    }
  } catch {
    [Console]::Error.WriteLine('Command failed: ' + $_.Exception.Message)
  }
}

while ($true) {
  try {
    if (Test-Path $CommandFile) {
      $commands = @(Get-Content -Path $CommandFile -ErrorAction SilentlyContinue)
      if ($commands.Count -lt $lastCommandCount) { $lastCommandCount = 0 }
      if ($commands.Count -gt $lastCommandCount) {
        for ($i = $lastCommandCount; $i -lt $commands.Count; $i++) {
          $line = $commands[$i]
          if ([string]::IsNullOrWhiteSpace($line)) { continue }
          if ($line.Trim() -eq 'quit') { exit 0 }
          $active = Get-BestSession
          Invoke-SessionCommand $active $line
        }
        $lastCommandCount = $commands.Count
        Start-Sleep -Milliseconds 60
      }
    }
  } catch { }

  $now = [DateTime]::UtcNow
  if (($now - $started).TotalMilliseconds -ge $lastEmit + 650) {
    $lastEmit = ($now - $started).TotalMilliseconds
    try {
      $session = Get-BestSession
      if ($null -eq $session) {
        Write-State ([ordered]@{ hasSession = $false; updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() })
      } else {
        $info = $session.GetPlaybackInfo()
        $timeline = $session.GetTimelineProperties()
        try {
          $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
          $appId = $session.SourceAppUserModelId
          $title = $props.Title
          $artist = $props.Artist
          $album = $props.AlbumTitle
          $subtitle = $props.Subtitle
          $trackNumber = $props.TrackNumber

          # Kugou's SMTC implementation exposes playback state, cover and controls
          # but not the current title/artist. Pass its main-window title through
          # to the Node side, where it can be parsed and cached reliably.
          $windowTitle = $null
          if ($appId.ToLower().Contains('kugou')) {
            $windowTitle = Get-KugouWindowTitle
            if ($windowTitle) {
              $title = $windowTitle.Trim()
              $artist = ''
            }
          }

          $coverKey = ($title + '|' + $artist + '|' + $album)
          $coverNow = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
          if ($coverKey -ne $lastCoverKey) {
            $lastCoverKey = $coverKey
            $lastCoverPath = $null
            $lastCoverVersion = $null
            # Do not reuse artwork from the previous track.
            Get-ChildItem $cacheDir -Filter 'cover-*.img' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
            # Give the player a moment to publish the matching thumbnail; then
            # force-refresh for a few seconds so a late image replaces an old one.
            $coverWaitUntil = $coverNow + 700
            $coverRefreshUntil = $coverNow + 8000
          }
          $forceCover = $coverNow -lt $coverRefreshUntil
          if ($coverNow -ge $coverWaitUntil -and ($null -eq $lastCoverPath -or $forceCover) -and $null -ne $props.Thumbnail) {
            $nextCover = Get-CoverPath $props $forceCover
            if ($nextCover) { $lastCoverPath = $nextCover }
          }
          $coverVersion = $null
          if ($lastCoverPath) {
            try {
              $coverFile = Get-Item $lastCoverPath
              $coverVersion = "$($coverFile.LastWriteTimeUtc.Ticks)-$($coverFile.Length)"
            } catch { }
          }
          $controls = $info.Controls
          $repeatMode = 'None'
          if ($null -ne $info.AutoRepeatMode) {
            $repeatMode = $info.AutoRepeatMode.ToString()
          }
          $playbackStatus = 'Closed'
          if ($null -ne $info.PlaybackStatus) {
            $playbackStatus = $info.PlaybackStatus.ToString()
          }
          $positionMs = 0
          $startMs = 0
          $endMs = 0
          $minSeekMs = 0
          $maxSeekMs = 0
          if ($null -ne $timeline) {
            $positionMs = [math]::Round($timeline.Position.TotalMilliseconds)
            $startMs = [math]::Round($timeline.StartTime.TotalMilliseconds)
            $endMs = [math]::Round($timeline.EndTime.TotalMilliseconds)
            $minSeekMs = [math]::Round($timeline.MinSeekTime.TotalMilliseconds)
            $maxSeekMs = [math]::Round($timeline.MaxSeekTime.TotalMilliseconds)
          }
          $state = [ordered]@{
            hasSession = $true
            appId = $appId
            title = $title
            artist = $artist
            album = $album
            subtitle = $subtitle
            trackNumber = $trackNumber
            status = $playbackStatus
            positionMs = $positionMs
            startMs = $startMs
            endMs = $endMs
            minSeekMs = $minSeekMs
            maxSeekMs = $maxSeekMs
            canPlayPause = $controls.IsPlayPauseToggleEnabled
            canNext = $controls.IsNextEnabled
            canPrevious = $controls.IsPreviousEnabled
            canSeek = $controls.IsPlaybackPositionEnabled
            shuffle = $info.IsShuffleActive
            repeat = $repeatMode
            coverPath = $lastCoverPath
            coverVersion = $coverVersion
            windowTitle = $windowTitle
            updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
          }
          Write-State $state
        } catch {
          Write-State ([ordered]@{
            hasSession = $true
            appId = $session.SourceAppUserModelId
            title = ''
            artist = ''
            album = ''
            status = $info.PlaybackStatus.ToString()
            positionMs = 0
            endMs = 0
            coverPath = $null
            updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
          })
        }
      }
    } catch {
      Write-State ([ordered]@{ hasSession = $false; updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); error = $_.Exception.Message })
    }
  }

  Start-Sleep -Milliseconds 700
}
