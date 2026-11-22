# Changelog

All notable changes to PaperDeck are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-22

### Added

- 798 × 480 liquid-glass dashboard with freeform 12 × 8 widget grid.
- CPU, GPU, RAM, power, temperature, network, storage, clock, system, Bluetooth
  battery, control center, media and lyric widgets.
- Windows SMTC media integration with cover art, playback controls and progress.
- Local LRC lookup plus LRCLIB, NetEase, QQ and Kugou lyric providers.
- Translation merge, Enhanced LRC/YRC word timing, Apple Music-style lyric
  scrolling and fullscreen lyrics.
- Control center with system-synced Wi-Fi/Bluetooth/mute toggles, long-press
  and right-click settings shortcuts.
- Centered volume/brightness modal.
- Appearance controls: themes, solid/gradient/black backgrounds, glass,
  accent color, font scale and touch button scale.
- Four-edge display safe area.
- Persistent nvidia-smi loop and configurable data refresh interval.
- Dynamic tray tooltip showing the connected display and resolution.

### Changed

- Display window no longer appears in the Windows taskbar.
- Widget titles and metric values use larger typography.
- Temperature widget uses the same two-column layout as the power widget.
- Control center uses icon-only buttons.

### Fixed

- SMTC covers could fail because PowerShell 5.1 could not bind the WinRT stream;
  extraction now uses reflection and writes the thumbnail bytes directly.
- Stale artwork carried over between tracks; artwork is cleared and refreshed on
  track changes.
- Fullscreen lyrics could remain covered by the "matching lyrics" overlay.
- YRC word lyrics displayed `000000` because the parser read the timing flag
  instead of the text following each timing tuple.
- GPU data was empty when an integrated GPU was listed before the discrete GPU.
- Media idle timer never fired because it was reset by every state update.
- Lyrics could stay in matching state after content had loaded.
- General UI cleanup and copy changes.

### Known issues

- Installer is unsigned; SmartScreen may show an unknown publisher warning.
- Some sensors are unavailable depending on motherboard/driver support.
- Some players expose incomplete SMTC metadata or no thumbnail.
- Bluetooth battery depends on Windows/driver reporting.

[1.0.0]: https://github.com/Paperpiece-Cloud/PaperDeck/releases/tag/v1.0.0
