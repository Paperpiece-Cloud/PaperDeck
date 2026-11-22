param(
  [ValidateSet('state', 'toggle')][string]$Command = 'state',
  [ValidateSet('wifi', 'bluetooth')][string]$Kind = 'wifi'
)
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(5000) | Out-Null
  if (-not $netTask.IsCompleted) { return $null }
  return $netTask.Result
}

[Windows.Devices.Radios.Radio, Windows.Devices.Radios, ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Radios.RadioState, Windows.Devices.Radios, ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Radios.RadioAccessStatus, Windows.Devices.Radios, ContentType=WindowsRuntime] | Out-Null

$radios = Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
$wifiRadio = $null
$bluetoothRadio = $null
foreach ($radio in $radios) {
  if ($radio.Kind.ToString() -eq 'WiFi') { $wifiRadio = $radio }
  if ($radio.Kind.ToString() -eq 'Bluetooth') { $bluetoothRadio = $radio }
}
$target = if ($Kind -eq 'wifi') { $wifiRadio } else { $bluetoothRadio }
$status = 'ok'
if ($Command -eq 'toggle' -and $null -ne $target) {
  $next = if ($target.State.ToString() -eq 'On') { [Windows.Devices.Radios.RadioState]::Off } else { [Windows.Devices.Radios.RadioState]::On }
  $access = Await ($target.SetStateAsync($next)) ([Windows.Devices.Radios.RadioAccessStatus])
  if ($null -eq $access) { $status = 'timeout' }
  elseif ($access.ToString() -notin @('Allowed', 'Success')) { $status = $access.ToString() }
}
[pscustomobject]@{
  wifi = if ($null -ne $wifiRadio) { $wifiRadio.State.ToString() } else { 'Unavailable' }
  bluetooth = if ($null -ne $bluetoothRadio) { $bluetoothRadio.State.ToString() } else { 'Unavailable' }
  status = $status
} | ConvertTo-Json -Compress
