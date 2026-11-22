param(
  [ValidateSet('get', 'set')]
  [string]$Action = 'get',
  [int]$Value = 50,
  [int]$X = 0,
  [int]$Y = 0
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace PaperDeckDisplay {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  public struct MONITORINFO {
    public int cbSize;
    public RECT rcMonitor;
    public RECT rcWork;
    public uint dwFlags;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  public struct PHYSICAL_MONITOR {
    public IntPtr hPhysicalMonitor;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
    public string szPhysicalMonitorDescription;
  }

  public delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdc, ref RECT rect, IntPtr data);

  [StructLayout(LayoutKind.Sequential)]
  public class MonitorEntry {
    public IntPtr Handle;
    public RECT Rect;
  }

  public static class Ddc {
    [DllImport("user32.dll")]
    private static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorEnumProc callback, IntPtr data);
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
    [DllImport("dxva2.dll", SetLastError = true)]
    private static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr monitor, out uint count);
    [DllImport("dxva2.dll", SetLastError = true)]
    private static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr monitor, uint count, [Out] PHYSICAL_MONITOR[] monitors);
    [DllImport("dxva2.dll", SetLastError = true)]
    private static extern bool SetVCPFeature(IntPtr monitor, byte code, uint value);
    [DllImport("dxva2.dll", SetLastError = true)]
    private static extern bool GetVCPFeatureAndVCPFeatureReply(IntPtr monitor, byte code, out uint type, out uint current, out uint max);
    [DllImport("dxva2.dll", SetLastError = true)]
    private static extern bool DestroyPhysicalMonitor(IntPtr monitor);

    public static List<MonitorEntry> Monitors() {
      var result = new List<MonitorEntry>();
      EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, delegate(IntPtr h, IntPtr hdc, ref RECT rect, IntPtr data) {
        result.Add(new MonitorEntry { Handle = h, Rect = rect });
        return true;
      }, IntPtr.Zero);
      return result;
    }

    private static IntPtr PickMonitor(int x, int y) {
      foreach (var monitor in Monitors()) {
        if (x >= monitor.Rect.Left && x < monitor.Rect.Right && y >= monitor.Rect.Top && y < monitor.Rect.Bottom) return monitor.Handle;
      }
      return IntPtr.Zero;
    }

    private static PHYSICAL_MONITOR? Physical(IntPtr monitor) {
      uint count;
      if (!GetNumberOfPhysicalMonitorsFromHMONITOR(monitor, out count) || count == 0) return null;
      var monitors = new PHYSICAL_MONITOR[count];
      if (!GetPhysicalMonitorsFromHMONITOR(monitor, count, monitors)) return null;
      for (int i = 1; i < monitors.Length; i++) DestroyPhysicalMonitor(monitors[i].hPhysicalMonitor);
      return monitors[0];
    }

    public static string GetBrightness(int x, int y) {
      var handle = PickMonitor(x, y);
      if (handle == IntPtr.Zero) return "{\"supported\":false,\"error\":\"Monitor not found\"}";
      var physical = Physical(handle);
      if (physical == null) return "{\"supported\":false,\"error\":\"DDC/CI not supported\"}";
      uint type, current, max;
      bool ok = GetVCPFeatureAndVCPFeatureReply(physical.Value.hPhysicalMonitor, 0x10, out type, out current, out max);
      DestroyPhysicalMonitor(physical.Value.hPhysicalMonitor);
      if (!ok || max == 0) return "{\"supported\":false,\"error\":\"Brightness not available\"}";
      int percent = (int)Math.Round(current * 100.0 / max);
      return "{\"supported\":true,\"value\":" + percent + ",\"max\":" + max + ",\"description\":\"" + physical.Value.szPhysicalMonitorDescription.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"}";
    }

    public static string SetBrightness(int x, int y, int percent) {
      var handle = PickMonitor(x, y);
      if (handle == IntPtr.Zero) return "{\"supported\":false,\"error\":\"Monitor not found\"}";
      var physical = Physical(handle);
      if (physical == null) return "{\"supported\":false,\"error\":\"DDC/CI not supported\"}";
      uint type, current, max;
      bool ok = GetVCPFeatureAndVCPFeatureReply(physical.Value.hPhysicalMonitor, 0x10, out type, out current, out max);
      if (ok && max > 0) {
        uint target = (uint)Math.Round(Math.Max(0, Math.Min(100, percent)) * max / 100.0);
        ok = SetVCPFeature(physical.Value.hPhysicalMonitor, 0x10, target);
        DestroyPhysicalMonitor(physical.Value.hPhysicalMonitor);
        if (ok) return "{\"supported\":true,\"value\":" + percent + ",\"max\":" + max + ",\"description\":\"" + physical.Value.szPhysicalMonitorDescription.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"}";
        return "{\"supported\":false,\"error\":\"Failed to set brightness\"}";
      }
      DestroyPhysicalMonitor(physical.Value.hPhysicalMonitor);
      return "{\"supported\":false,\"error\":\"Brightness not available\"}";
    }
  }
}
'@ -Language CSharp

function Get-InternalBrightness {
  try {
    $b = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1
    if ($null -ne $b) { return [int]$b.CurrentBrightness }
  } catch { }
  return $null
}

function Set-InternalBrightness([int]$percent) {
  try {
    $methods = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop
    foreach ($m in $methods) {
      Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = $percent } | Out-Null
    }
    return $true
  } catch { return $false }
}

try {
  if ($Action -eq 'get') {
    $result = [PaperDeckDisplay.Ddc]::GetBrightness($X, $Y)
    $obj = $result | ConvertFrom-Json
    if (-not $obj.supported) {
      $internal = Get-InternalBrightness
      if ($null -ne $internal) {
        $obj = [pscustomobject]@{ supported = $true; value = $internal; source = 'internal'; description = 'Internal display' }
      }
    } else {
      $obj | Add-Member -NotePropertyName source -NotePropertyValue 'ddc' -Force
    }
    $obj | ConvertTo-Json -Compress
  } else {
    $result = [PaperDeckDisplay.Ddc]::SetBrightness($X, $Y, $Value)
    $obj = $result | ConvertFrom-Json
    if (-not $obj.supported) {
      if (Set-InternalBrightness -percent $Value) {
        $obj = [pscustomobject]@{ supported = $true; value = $Value; source = 'internal'; description = 'Internal display' }
      }
    } else {
      $obj | Add-Member -NotePropertyName source -NotePropertyValue 'ddc' -Force
    }
    $obj | ConvertTo-Json -Compress
  }
} catch {
  [pscustomobject]@{ supported = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
