# PaperDeck persistent master-volume helper.
# Reads commands from stdin and emits one JSON state line after every change.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace PaperDeckAudio {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  public class MMDeviceEnumeratorComObject { }

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
    int GetDevice(string id, out IMMDevice device);
    int RegisterEndpointNotificationCallback(IntPtr client);
    int UnregisterEndpointNotificationCallback(IntPtr client);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDevice {
    int Activate(ref Guid iid, uint dwClsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
    int OpenPropertyStore(uint access, out IntPtr properties);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetState(out uint state);
  }

  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr notify);
    int UnregisterControlChangeNotify(IntPtr notify);
    int GetChannelCount(out uint count);
    int SetMasterVolumeLevel(float level, ref Guid eventContext);
    int SetMasterVolumeLevelScalar(float level, ref Guid eventContext);
    int GetMasterVolumeLevel(out float level);
    int GetMasterVolumeLevelScalar(out float level);
    int SetChannelVolumeLevel(uint channel, float level, ref Guid eventContext);
    int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid eventContext);
    int GetChannelVolumeLevel(uint channel, out float level);
    int GetChannelVolumeLevelScalar(uint channel, out float level);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid eventContext);
    int GetMute(out bool mute);
  }

  public static class Control {
    private static IAudioEndpointVolume endpoint;

    private static IAudioEndpointVolume Endpoint() {
      if (endpoint != null) return endpoint;
      var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
      IMMDevice device;
      enumerator.GetDefaultAudioEndpoint(0, 0, out device);
      Guid iid = typeof(IAudioEndpointVolume).GUID;
      object obj;
      device.Activate(ref iid, 23, IntPtr.Zero, out obj);
      endpoint = (IAudioEndpointVolume)obj;
      return endpoint;
    }

    public static float GetVolume() {
      float value;
      Endpoint().GetMasterVolumeLevelScalar(out value);
      return value;
    }

    public static bool GetMuted() {
      bool value;
      Endpoint().GetMute(out value);
      return value;
    }

    public static void SetVolume(float value) {
      Guid context = Guid.Empty;
      Endpoint().SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, value)), ref context);
    }

    public static void SetMuted(bool muted) {
      Guid context = Guid.Empty;
      Endpoint().SetMute(muted, ref context);
    }
  }
}
'@ -Language CSharp

function Write-State {
  try {
    $v = [PaperDeckAudio.Control]::GetVolume()
    $m = [PaperDeckAudio.Control]::GetMuted()
    $obj = [ordered]@{ volume = [Math]::Round($v * 100); muted = $m }
    [Console]::Out.WriteLine('@@VOL@@' + ($obj | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
  } catch {
    [Console]::Out.WriteLine('@@VOLERR@@' + $_.Exception.Message.Replace("`n", " "))
    [Console]::Out.Flush()
  }
}

$last = ''
$pending = $null
Write-State
while ($true) {
  if ($null -eq $pending) {
    $pending = [Console]::In.ReadLineAsync()
  }
  if ($pending.IsCompleted) {
    $line = $pending.Result
    $pending = $null
    if (-not [string]::IsNullOrWhiteSpace($line)) {
      try {
        $parts = $line.Trim().Split(' ')
        switch ($parts[0]) {
          'set' {
            $value = [float]::Parse($parts[1], [Globalization.CultureInfo]::InvariantCulture)
            [PaperDeckAudio.Control]::SetVolume($value / 100)
          }
          'mute' {
            [PaperDeckAudio.Control]::SetMuted(($parts[1] -eq '1'))
          }
          'toggle-mute' {
            [PaperDeckAudio.Control]::SetMuted(-not [PaperDeckAudio.Control]::GetMuted())
          }
          'get' { }
        }
        Write-State
        $last = ''
      } catch {
        [Console]::Out.WriteLine('@@VOLERR@@' + $_.Exception.Message.Replace("`n", " "))
        [Console]::Out.Flush()
      }
    }
  }

  Start-Sleep -Milliseconds 180
  try {
    $snapshot = '' + [Math]::Round([PaperDeckAudio.Control]::GetVolume() * 100) + ':' + [PaperDeckAudio.Control]::GetMuted()
    if ($snapshot -ne $last) {
      $last = $snapshot
      Write-State
    }
  } catch {
    Start-Sleep -Milliseconds 800
  }
}
