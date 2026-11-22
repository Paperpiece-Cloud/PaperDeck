# Architecture

## Overview

PaperDeck is a Windows Electron application composed of a main process, a
secondary-display renderer, a settings renderer, and a small preload API.

```text
┌─────────────────────────────────────────────────────────────┐
│ Electron main process                                       │
│  window/tray · config · metrics · media · lyrics · bluetooth│
│  actions · PowerShell bridges                               │
└───────────────┬───────────────────────────────┬─────────────┘
                │ IPC (contextBridge)           │ IPC
┌───────────────▼──────────────┐  ┌─────────────▼─────────────┐
│ Display renderer             │  │ Settings renderer         │
│ widgets · layout · lyrics    │  │ display / appearance      │
│ control center · modals      │  │ media / system / about    │
└──────────────────────────────┘  └───────────────────────────┘
```

Both renderers load plain HTML/CSS/JS. There is no frontend framework and no
bundler in the runtime path.

## Main process modules

| Module | Responsibility |
| --- | --- |
| `main.js` | BrowserWindow/Tray lifecycle, IPC router, display bounds, config application, tray tooltip, startup flags |
| `config.js` | Defaults, merge/normalize rules, JSON persistence |
| `metrics.js` | CPU/RAM sampling, typeperf energy/thermal, persistent nvidia-smi loop, network state, battery, volumes |
| `media.js` | Persistent PowerShell SMTC bridge, media metadata, artwork lifecycle, player normalization |
| `lyrics.js` | Local LRC indexing, online providers, translation merge, Enhanced LRC/YRC word timing, cache |
| `artwork.js` | iTunes/QQ/NetEase cover fallback and image downloads |
| `bluetooth.js` | Periodic PnP Bluetooth device enumeration and optional battery values |
| `actions.js` | Volume/mute, DDC/CI brightness, screenshots, lock/sleep, radio toggles, quick settings |
| `catalog.js` | Widget and quick-action metadata shared by both renderers |
| `paths.js` | Development vs packaged resource paths |

## Display renderer

The display renderer builds widgets from `config.layout.widgets` on a 12 × 8
grid. Each widget is a `<section>` with an inline `grid-column`/`grid-row`
position. Edit mode adds:

- an 8×8-direction border resize layer,
- a visible grid overlay,
- overlap validation and toast feedback.

The layout is persisted through `config:update` and re-applied when config
changes arrive over IPC.

### Lyrics

- `lyrics-roll` and `focus-roll` are absolutely positioned lists.
- The active line is anchored in the upper portion of the viewport.
- At most one previous lyric line is visible above it; older lines are
  `past-far` and hidden.
- Current/upcoming lines move upward, with only the active line rendered at
  full contrast.
- Word spans (`lyric-word`, `focus-word`) are highlighted from per-word
  timestamps when the provider supplies them.
- A global `[hidden]` rule prevents author `display` declarations from
  overriding the HTML hidden attribute.

### Media idle

When the media session has no active state for 3 seconds, the renderer hides
`media`/`lyrics` widgets and proportionally expands the remaining widgets over
the full grid. The original layout is restored on the next media session.

## Windows integration

| Feature | API / bridge |
| --- | --- |
| Media metadata, playback, thumbnail | Windows SMTC + WinRT via PowerShell |
| CPU package power / thermal | `typeperf` Energy Meter / Thermal Zone |
| GPU load, temp, power, VRAM | persistent `nvidia-smi` loop |
| Network state / Wi-Fi signal | `os.networkInterfaces` + `netsh wlan show interfaces` |
| Bluetooth devices / battery | PnP device properties |
| Wi-Fi / Bluetooth radio | `Windows.Devices.Radios` via PowerShell |
| Volume / mute | Core Audio COM bridge (`audio.ps1`) |
| Brightness | DDC/CI (`dxva2.dll`, `brightness.ps1`) |
| Lock / sleep / screenshot | Windows API and Electron desktopCapturer |

PowerShell scripts are launched with `-NoProfile -NonInteractive`, hidden
windows, UTF-8 output, and timeouts. They are copied to `resources/scripts` in
the packaged application.

## Configuration

`config.json` lives in `app.getPath('userData')`, normally:

```text
%APPDATA%\PaperDeck\config.json
```

`config.js` merges stored values over defaults and normalizes numeric ranges.
Unknown widget kinds are replaced with a clock widget. The settings renderer
saves patches through `config:update`; the main process saves synchronously and
broadcasts the merged config.

## Security model

- `contextIsolation: true`
- `nodeIntegration: false`
- Renderers receive a small API through `preload.js`; they do not get Node.js.
- Media control commands are allowlisted.
- External URLs are opened through `shell.openExternal`.
- No account, telemetry, or network service is required for core functionality.
- Lyrics providers receive only track title/artist/album as needed for lookup.

## Packaging

`electron-builder` produces an NSIS installer and an unpacked directory.
`src/**` and demo assets are packed into `app.asar`; `scripts/` and icons are
copied to `resources/`. The application uses `skipTaskbar` for the secondary
window and keeps the settings window on the primary display.

## Non-goals

- Cross-platform support.
- Replacing the Windows media session or player.
- Downloading or decrypting DRM-protected media.
- System-wide audio/video decoding changes.
