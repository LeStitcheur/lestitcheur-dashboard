param([ValidateSet('state','play','pause','next','previous','shuffle','repeat')][string]$Action='state', [string]$Value='')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
function Await-WinRT($Operation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetGenericArguments().Count -eq 1 } | Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  if (-not $task.Wait(6000)) { throw 'Spotify ne répond pas à Windows.' }
  return $task.Result
}
$manager = Await-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$session = $manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -match '(?i)spotify' } | Select-Object -First 1
if (-not $session) {
  if ($Action -ne 'state') { throw 'Lance un morceau dans Spotify avant de le piloter.' }
  @{ connected=$true; active=$false; source='desktop'; device='Spotify sur ce PC'; supportsVolume=$false } | ConvertTo-Json -Compress
  exit 0
}
if ($Action -eq 'state') {
  $media = Await-WinRT ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $info = $session.GetPlaybackInfo()
  $time = $session.GetTimelineProperties()
  $controls = $info.Controls
  @{ connected=$true; active=$true; source='desktop'; playing=($info.PlaybackStatus.ToString() -eq 'Playing'); name=$media.Title; artists=$media.Artist; album=$media.AlbumTitle; progress=$time.Position.TotalMilliseconds; duration=$time.EndTime.TotalMilliseconds; device='Spotify sur ce PC'; supportsVolume=$false; supportsShuffle=$controls.IsShuffleEnabled; supportsRepeat=$controls.IsRepeatEnabled; canPlay=$controls.IsPlayEnabled; canPause=$controls.IsPauseEnabled; canNext=$controls.IsNextEnabled; canPrevious=$controls.IsPreviousEnabled; shuffle=[bool]$info.IsShuffleActive; repeat=(@{None='off';Track='track';List='context'}[$info.AutoRepeatMode.ToString()]) } | ConvertTo-Json -Compress
} else {
  $operation = switch ($Action) {
    'play' { $session.TryPlayAsync() }
    'pause' { $session.TryPauseAsync() }
    'next' { $session.TrySkipNextAsync() }
    'previous' { $session.TrySkipPreviousAsync() }
    'shuffle' { $session.TryChangeShuffleActiveAsync(($Value -eq 'true')) }
    'repeat' {
      $null = [Windows.Media.MediaPlaybackAutoRepeatMode, Windows.Media, ContentType=WindowsRuntime]
      $mode = switch ($Value) { 'off' {[Windows.Media.MediaPlaybackAutoRepeatMode]::None} 'track' {[Windows.Media.MediaPlaybackAutoRepeatMode]::Track} 'context' {[Windows.Media.MediaPlaybackAutoRepeatMode]::List} default {throw 'Mode invalide.'} }
      $session.TryChangeAutoRepeatModeAsync($mode)
    }
  }
  if (-not (Await-WinRT $operation ([bool]))) { throw 'Cette commande est indisponible dans la session Spotify actuelle.' }
  '{"ok":true}'
}
