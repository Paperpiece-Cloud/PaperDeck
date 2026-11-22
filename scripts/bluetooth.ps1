$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

# Top-level paired/connected Bluetooth endpoints only. Service children
# (AVRCP, GATT, etc.) are intentionally excluded.
$devices = Get-PnpDevice -Class Bluetooth -PresentOnly |
  Where-Object { $_.InstanceId -match '^(BTHENUM|BTHLE)\\DEV_' }

$seen = @{}
$result = @()
foreach ($device in $devices) {
  if ($device.InstanceId -notmatch 'DEV_([0-9A-Fa-f]{12})') { continue }
  $address = $Matches[1].ToUpperInvariant()
  if ($seen.ContainsKey($address)) { continue }
  $seen[$address] = $true

  $name = ($device.FriendlyName -replace '\s*Avrcp.*$', '').Trim()
  if (-not $name) { $name = $address }
  $battery = $null
  # Classic BTHENUM endpoints generally do not expose battery through PnP.
  # Querying them can block for a long time, so only BLE endpoints are probed.
  if ($device.InstanceId -like 'BTHLE*') {
    foreach ($key in @(
      '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2',
      '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 3',
      'DEVPKEY_Bluetooth_Battery'
    )) {
      $property = Get-PnpDeviceProperty -InstanceId $device.InstanceId -KeyName $key -ErrorAction SilentlyContinue
      if ($null -ne $property -and $null -ne $property.Data) {
        $number = 0
        if ([int]::TryParse([string]$property.Data, [ref]$number) -and $number -ge 0 -and $number -le 100) {
          $battery = $number
          break
        }
      }
    }
  }

  $result += [pscustomobject]@{
    name = $name
    address = $address
    battery = $battery
    connected = $true
  }
}

if ($result.Count -eq 0) { '[]' } else { $result | ConvertTo-Json -Compress }
