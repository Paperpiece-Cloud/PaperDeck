'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const { desktopCapturer, shell } = require('electron');
const { powershellPath, scriptPath } = require('./paths');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function timestampName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

class ActionService {
  constructor(options = {}) {
    this.getDisplay = options.getDisplay || (() => null);
    this.getScreenshotDir = options.getScreenshotDir || (() => path.join(appPictures(), 'PaperDeck Screenshots'));
    this.media = options.media || null;
    this.audio = {
      volume: 50,
      muted: false,
      available: false,
      updatedAt: 0,
    };
    this.audioChild = null;
    this.audioQueue = [];
    this.audioReady = false;
    this.audioRetry = null;
    this.brightness = {
      supported: false,
      value: 50,
      source: '',
      description: '',
      error: '',
      checked: false,
    };
    this.brightnessBusy = false;
    this.brightnessPending = null;
    this.quitting = false;
  }

  start() {
    this.startAudio();
    setTimeout(() => this.refreshBrightness(), 1800);
  }

  startAudio() {
    if (this.audioChild) return;
    const child = spawn(
      powershellPath(),
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath('audio.ps1')],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    this.audioChild = child;
    this.audioReady = false;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      this.audioBuffer = (this.audioBuffer || '') + chunk;
      const lines = this.audioBuffer.split(/\r?\n/);
      this.audioBuffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('@@VOL@@')) {
          try {
            const state = JSON.parse(line.slice(7));
            this.audio = {
              volume: state.volume,
              muted: Boolean(state.muted),
              available: true,
              updatedAt: Date.now(),
            };
            this.audioReady = true;
            this.flushAudio();
          } catch { /* ignore malformed line */ }
        } else if (line.startsWith('@@VOLERR@@')) {
          this.audio.available = false;
          this.audio.error = line.slice(10).trim();
        }
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', () => {});
    child.on('error', () => {
      this.audioChild = null;
      this.audio.available = false;
      this.scheduleAudioRestart();
    });
    child.on('exit', () => {
      this.audioChild = null;
      this.audio.available = false;
      this.audioReady = false;
      if (!this.quitting) this.scheduleAudioRestart();
    });
  }

  scheduleAudioRestart() {
    clearTimeout(this.audioRetry);
    this.audioRetry = setTimeout(() => {
      if (!this.quitting) this.startAudio();
    }, 2500);
  }

  flushAudio() {
    if (!this.audioReady) return;
    while (this.audioQueue.length) {
      const command = this.audioQueue.shift();
      try {
        this.audioChild?.stdin.write(`${command}\n`);
      } catch { /* helper will restart */ }
    }
  }

  setVolume(value) {
    const volume = Math.round(clamp(Number(value) || 0, 0, 100));
    this.audio.volume = volume;
    this.audio.updatedAt = Date.now();
    if (!this.audioReady) {
      if (this.audioQueue.length < 5) this.audioQueue.push(`set ${volume}`);
      return this.getAudioState();
    }
    try {
      this.audioChild?.stdin.write(`set ${volume}\n`);
    } catch { /* ignore */ }
    return this.getAudioState();
  }

  toggleMute() {
    this.audio.muted = !this.audio.muted;
    this.audio.updatedAt = Date.now();
    if (this.audioReady) {
      try { this.audioChild?.stdin.write('toggle-mute\n'); } catch { /* ignore */ }
    }
    return this.getAudioState();
  }

  getAudioState() {
    return { ...this.audio };
  }

  runRadio(command = 'state', kind = 'wifi') {
    return new Promise((resolve) => {
      execFile(
        powershellPath(),
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath('radio.ps1'), '-Command', command, '-Kind', kind],
        { timeout: 7000, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 },
        (error, stdout) => {
          if (error && !stdout) {
            resolve({ wifi: null, bluetooth: null, status: 'error' });
            return;
          }
          try {
            const parsed = JSON.parse(String(stdout).replace(/^\uFEFF/, '').trim());
            resolve({
              wifi: parsed.wifi === 'On' ? true : parsed.wifi === 'Off' ? false : null,
              bluetooth: parsed.bluetooth === 'On' ? true : parsed.bluetooth === 'Off' ? false : null,
              status: parsed.status || 'ok',
            });
          } catch {
            resolve({ wifi: null, bluetooth: null, status: 'error' });
          }
        },
      );
    });
  }

  async getQuickState() {
    const radios = await this.runRadio('state');
    return {
      wifi: radios.wifi,
      bluetooth: radios.bluetooth,
      audio: this.getAudioState(),
      brightness: { ...this.brightness },
      updatedAt: Date.now(),
    };
  }

  async toggleRadio(kind) {
    const result = await this.runRadio('toggle', kind);
    await new Promise((resolve) => setTimeout(resolve, 450));
    const radios = await this.runRadio('state');
    return {
      ...radios,
      requested: kind,
      ok: result.status === 'ok',
    };
  }

  openQuickSettings(kind) {
    const targets = {
      wifi: 'ms-settings:network-wifi',
      bluetooth: 'ms-settings:bluetooth',
      volume: 'ms-settings:sound',
      mute: 'ms-settings:sound',
      playpause: 'ms-settings:sound',
      next: 'ms-settings:sound',
      prev: 'ms-settings:sound',
      brightness: 'ms-settings:display',
      screenshot: 'ms-settings:appsfeatures',
      lock: 'ms-settings:signinoptions',
      sleep: 'ms-settings:power',
      taskmgr: 'ms-settings:appsfeatures',
      settings: 'ms-settings:',
    };
    shell.openExternal(targets[kind] || 'ms-settings:').catch(() => {});
    return { ok: true };
  }

  async refreshBrightness() {
    const display = this.getDisplay();
    if (!display) return this.getBrightness();
    const bounds = display.bounds || display;
    const x = Math.round(bounds.x + bounds.width / 2);
    const y = Math.round(bounds.y + bounds.height / 2);
    try {
      const result = await this.runPowerShell(scriptPath('brightness.ps1'), ['-Action', 'get', '-X', String(x), '-Y', String(y)]);
      const data = JSON.parse(result.trim());
      this.brightness = {
        supported: Boolean(data.supported),
        value: Number(data.value) || 0,
        source: data.source || 'ddc',
        description: data.description || '',
        error: data.error || '',
        checked: true,
        updatedAt: Date.now(),
      };
    } catch (error) {
      this.brightness = {
        supported: false,
        value: 0,
        source: '',
        description: '',
        error: error.message,
        checked: true,
        updatedAt: Date.now(),
      };
    }
    return this.getBrightness();
  }

  getBrightness() {
    return { ...this.brightness };
  }

  async setBrightness(value) {
    const target = Math.round(clamp(Number(value) || 0, 0, 100));
    this.brightness = { ...this.brightness, value: target, supported: true };
    if (this.brightnessBusy) {
      this.brightnessPending = target;
      return this.getBrightness();
    }
    this.brightnessBusy = true;
    try {
      const display = this.getDisplay();
      if (display) {
        const bounds = display.bounds || display;
        const x = Math.round(bounds.x + bounds.width / 2);
        const y = Math.round(bounds.y + bounds.height / 2);
        const result = await this.runPowerShell(
          scriptPath('brightness.ps1'),
          ['-Action', 'set', '-Value', String(target), '-X', String(x), '-Y', String(y)],
        );
        const data = JSON.parse(result.trim());
        this.brightness = {
          supported: Boolean(data.supported),
          value: data.supported ? target : this.brightness.value,
          source: data.source || this.brightness.source,
          description: data.description || this.brightness.description,
          error: data.error || '',
          checked: true,
          updatedAt: Date.now(),
        };
      }
    } catch (error) {
      this.brightness.error = error.message;
    } finally {
      this.brightnessBusy = false;
      if (this.brightnessPending !== null) {
        const pending = this.brightnessPending;
        this.brightnessPending = null;
        this.setBrightness(pending);
      }
    }
    return this.getBrightness();
  }

  runPowerShell(script, args = [], timeout = 8000) {
    return new Promise((resolve, reject) => {
      execFile(
        powershellPath(),
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args],
        { timeout, windowsHide: true, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error((stderr || stdout || error.message).trim().slice(0, 300)));
            return;
          }
          resolve(stdout);
        },
      );
    });
  }

  async screenshot() {
    const display = this.getDisplay();
    const screens = display?.screen || null;
    const bounds = display?.bounds || screens?.bounds || null;
    if (!bounds) throw new Error('No display available');
    const scale = display?.scaleFactor || 1;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(bounds.width * scale),
        height: Math.round(bounds.height * scale),
      },
    });
    let source = null;
    if (display?.id !== undefined) {
      source = sources.find((candidate) => String(candidate.display_id) === String(display.id));
    }
    if (!source && screens) {
      source = sources.find((candidate) => String(candidate.display_id) === String(screens.id));
    }
    if (!source) source = sources[0];
    if (!source) throw new Error('Screen capture unavailable');
    const image = source.thumbnail;
    if (!image || image.isEmpty()) throw new Error('Screen capture was empty');
    const dir = this.getScreenshotDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `PaperDeck-${timestampName()}.png`);
    fs.writeFileSync(file, image.toPNG());
    return { path: file, width: image.getSize().width, height: image.getSize().height };
  }

  async perform(action, payload = {}) {
    switch (action) {
      case 'volume':
        if (payload.absolute !== undefined) return this.setVolume(payload.absolute);
        if (payload.delta) return this.setVolume(this.audio.volume + Number(payload.delta));
        return this.getAudioState();
      case 'mute':
        return this.toggleMute();
      case 'brightness':
        if (payload.absolute !== undefined) return this.setBrightness(payload.absolute);
        if (payload.delta) return this.setBrightness(this.brightness.value + Number(payload.delta));
        return this.refreshBrightness();
      case 'screenshot':
        return this.screenshot();
      case 'lock':
        spawn('rundll32.exe', ['user32.dll,LockWorkStation'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        return { ok: true };
      case 'sleep':
        spawn(
          powershellPath(),
          ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend',$false,$false)"],
          { detached: true, stdio: 'ignore', windowsHide: true },
        ).unref();
        return { ok: true };
      case 'wifi':
        shell.openExternal('ms-settings:network-wifi').catch(() => {});
        return { ok: true };
      case 'bluetooth':
        shell.openExternal('ms-settings:bluetooth').catch(() => {});
        return { ok: true };
      case 'quick-state':
        return this.getQuickState();
      case 'quick-toggle':
        return this.toggleRadio(payload.kind === 'bluetooth' ? 'bluetooth' : 'wifi');
      case 'open-quick-settings':
        return this.openQuickSettings(String(payload.kind || 'settings'));
      case 'network-settings':
        shell.openExternal('ms-settings:network').catch(() => {});
        return { ok: true };
      case 'taskmgr':
        spawn('taskmgr.exe', [], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        return { ok: true };
      case 'settings':
        shell.openExternal('ms-settings:').catch(() => {});
        return { ok: true };
      case 'display-settings':
        shell.openExternal('ms-settings:display').catch(() => {});
        return { ok: true };
      case 'shutdown':
        spawn('shutdown.exe', ['/s', '/t', '0'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        return { ok: true };
      case 'restart':
        spawn('shutdown.exe', ['/r', '/t', '0'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        return { ok: true };
      case 'open-path':
        if (payload.path) await shell.openPath(payload.path);
        return { ok: true };
      case 'open-url':
        if (payload.url) await shell.openExternal(payload.url);
        return { ok: true };
      case 'launch':
        if (payload.target) {
          const args = Array.isArray(payload.args) ? payload.args : String(payload.args || '').match(/(?:[^\s"]+|"[^"]*")+/g)?.map((arg) => arg.replace(/^"|"$/g, '')) || [];
          const child = spawn(payload.target, args, {
            detached: true,
            stdio: 'ignore',
            windowsHide: false,
            shell: !payload.target.includes('\\') && !payload.target.toLowerCase().endsWith('.exe'),
          });
          child.unref();
        }
        return { ok: true };
      default:
        return { ok: false, error: `Unknown action ${action}` };
    }
  }

  quit() {
    this.quitting = true;
    clearTimeout(this.audioRetry);
    try {
      this.audioChild?.stdin.write('quit\n');
      this.audioChild?.kill();
    } catch { /* noop */ }
    this.audioChild = null;
  }
}

function appPictures() {
  try {
    const { app } = require('electron');
    return app.getPath('pictures');
  } catch {
    return path.join(os.homedir(), 'Pictures');
  }
}

module.exports = { ActionService };
