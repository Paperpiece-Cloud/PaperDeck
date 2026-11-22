'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const { app } = require('electron');
const { scriptPath, powershellPath } = require('./paths');
const { ArtworkService, detectMime } = require('./artwork');

const PLAYER_NAMES = [
  [/applemusic|appleinc|apple ?music/i, 'Apple Music'],
  [/cloudmusic|netease/i, '网易云音乐'],
  [/qqmusic|qq音乐/i, 'QQ 音乐'],
  [/kugou/i, '酷狗音乐'],
  [/spotify/i, 'Spotify'],
  [/zunemusic|mediaplayer/i, 'Media Player'],
  [/msedge|chrome|firefox/i, '浏览器'],
  [/foobar/i, 'foobar2000'],
];

function playerName(appId) {
  const id = String(appId || '');
  for (const [pattern, name] of PLAYER_NAMES) {
    if (pattern.test(id)) return name;
  }
  return id.split('!')[0] || '媒体';
}

function parseKugouWindowTitle(raw) {
  if (!raw) return null;
  const cleaned = String(raw)
    .trim()
    .replace(/\s*-\s*\u9177\u72D7\u97F3\u4E50\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!cleaned) return null;
  const parts = cleaned.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const artist = parts[0];
    const title = parts.slice(1).join(' - ');
    if (artist === '-' || !title || title.startsWith('-')) return null;
    return { artist, title };
  }
  if (cleaned.startsWith('-')) return null;
  return { artist: '', title: cleaned };
}

function cleanKugouMetadata(state, previous) {
  let windowTitle = state.windowTitle || '';
  if (!windowTitle) {
    const candidate = state.title || '';
    if (candidate.includes(' - ')) windowTitle = candidate;
  }
  if (windowTitle) {
    const parsed = parseKugouWindowTitle(windowTitle);
    if (parsed) return parsed;
  }
  // Kugou occasionally drops its main-window title for a poll. Keep the last
  // known metadata instead of briefly reporting "unknown track" and clearing art.
  if ((!state.title || state.title.startsWith('-')) && previous?.title && /kugou/i.test(previous.appId || '')) {
    return { title: previous.title, artist: previous.artist };
  }
  return { title: state.title || '', artist: state.artist || state.subtitle || '' };
}

class MediaService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.commandFile = options.commandFile
      || path.join(app.getPath('temp'), 'PaperDeck', 'smtc-command.txt');
    this.artwork = new ArtworkService();
    this.child = null;
    this.ready = false;
    this.quitting = false;
    this.queue = [];
    this.current = {
      hasSession: false,
      playerName: '',
      title: '',
      artist: '',
      album: '',
      status: 'Closed',
      positionMs: 0,
      endMs: 0,
      canPlayPause: false,
      canNext: false,
      canPrevious: false,
      canSeek: false,
      cover: null,
      coverPending: false,
      updatedAt: Date.now(),
    };
    this.coverForTrack = null;
    this.currentTrackKey = '';
    this.preferred = 'auto';
    this.restartTimer = null;
  }

  start() {
    if (this.child) return;
    fs.mkdirSync(path.dirname(this.commandFile), { recursive: true });
    try { fs.writeFileSync(this.commandFile, '', 'utf8'); } catch { /* noop */ }
    const args = [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath('smtc.ps1'),
      '-CommandFile', this.commandFile,
    ];
    const child = spawn(powershellPath(), args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    this.ready = false;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this.onData(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text) => {
      if (text.trim()) console.error('[smtc]', text.trim());
    });
    child.on('error', (error) => {
      console.error('[smtc] spawn failed', error);
      this.child = null;
      this.scheduleRestart();
    });
    child.on('exit', () => {
      this.child = null;
      this.ready = false;
      if (!this.quitting) this.scheduleRestart();
    });
  }

  scheduleRestart() {
    clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      if (!this.quitting) this.start();
    }, 2500);
  }

  onData(chunk) {
    this.buffer = (this.buffer || '') + chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('@@READY@@')) {
        this.ready = true;
        this.flushQueue();
        if (this.preferred && this.preferred !== 'auto') this.writeRaw(`pref ${this.preferred}`);
      } else if (line.startsWith('@@STATE@@')) {
        try {
          this.handleState(JSON.parse(line.slice(9)));
        } catch (error) {
          console.error('[smtc] bad state', error.message);
        }
      } else if (line.startsWith('@@FATAL@@')) {
        console.error('[smtc] fatal', line);
      } else if (line.trim()) {
        console.log('[smtc]', line.trim());
      }
    }
  }

  setPreferred(preferred) {
    this.preferred = preferred || 'auto';
    this.writeRaw(`pref ${this.preferred}`);
  }

  send(command) {
    if (!command) return;
    this.queue.push(command);
    this.flushQueue();
  }

  flushQueue() {
    if (!this.ready) return;
    const queued = this.queue.splice(0, this.queue.length);
    for (const command of queued) this.writeRaw(command);
  }

  writeRaw(command) {
    if (!this.ready) {
      this.queue.push(command);
      return;
    }
    try {
      fs.appendFileSync(this.commandFile, `${command}\r\n`, 'utf8');
    } catch (error) {
      console.error('[smtc] command write failed', error.message);
    }
  }

  handleState(state) {
    if (!state || state.hasSession === false) {
      this.current = {
        hasSession: false,
        playerName: '',
        title: '',
        artist: '',
        album: '',
        status: 'Closed',
        positionMs: 0,
        endMs: 0,
        canPlayPause: false,
        canNext: false,
        canPrevious: false,
        canSeek: false,
        cover: null,
        coverPending: false,
        updatedAt: state?.updatedAt || Date.now(),
      };
      this.coverForTrack = null;
      this.currentTrackKey = '';
      this.emit('update', { ...this.current });
      return;
    }

    const name = playerName(state.appId);
    let title = state.title || '';
    let artist = state.artist || state.subtitle || '';
    if (/kugou/i.test(state.appId || '')) {
      const parsed = cleanKugouMetadata(state, this.current);
      title = parsed.title || title;
      artist = parsed.artist || artist;
    }
    const trackKey = `${title}|${artist}|${state.album || ''}`.toLowerCase();
    const isNewTrack = trackKey !== this.currentTrackKey;
    if (isNewTrack) {
      this.currentTrackKey = trackKey;
      this.coverForTrack = null;
      this.coverPending = false;
    }

    const next = {
      hasSession: true,
      playerName: name,
      appId: state.appId || '',
      title: title || '未知曲目',
      artist: artist || '未知艺术家',
      album: state.album || '',
      status: state.status || 'Paused',
      positionMs: Number(state.positionMs) || 0,
      startMs: Number(state.startMs) || 0,
      endMs: Number(state.endMs) || 0,
      canPlayPause: Boolean(state.canPlayPause),
      canNext: Boolean(state.canNext),
      canPrevious: Boolean(state.canPrevious),
      canSeek: Boolean(state.canSeek),
      shuffle: Boolean(state.shuffle),
      repeat: state.repeat || 'None',
      cover: undefined,
      coverSource: undefined,
      coverPending: false,
      updatedAt: Date.now(),
    };

    if (isNewTrack) {
      next.cover = null;
      next.coverSource = null;
    }

    if (state.coverPath) {
      const dataUrl = this.readCover(state.coverPath, state.coverVersion);
      if (dataUrl && this.coverForTrack !== dataUrl) {
        this.coverForTrack = dataUrl;
        this.coverPending = false;
        next.cover = dataUrl;
        next.coverSource = '系统媒体';
        next.coverPending = false;
      }
    } else if (isNewTrack && !this.coverPending) {
      this.coverPending = true;
      next.coverPending = true;
      this.fetchFallbackCover(trackKey);
    }

    this.current = { ...this.current, ...next };
    const payload = { ...this.current };
    if (next.cover === undefined) delete payload.cover;
    this.emit('update', payload);
  }

  readCover(filePath, version = '') {
    try {
      const buffer = fs.readFileSync(filePath);
      if (!buffer.length || buffer.length > 8 * 1024 * 1024) return null;
      const mime = detectMime(buffer);
      return `data:${mime};base64,${buffer.toString('base64')}`;
    } catch {
      return null;
    }
  }

  async fetchFallbackCover(trackKey) {
    const snapshot = { ...this.current };
    try {
      const cover = await this.artwork.getFallback({
        title: snapshot.title,
        artist: snapshot.artist,
        album: snapshot.album,
      });
      if (!cover || this.currentTrackKey !== trackKey) return;
      // The system thumbnail always wins over an online fallback.
      if (this.current.coverSource && this.current.coverSource !== 'fallback') return;
      this.coverForTrack = cover.dataUrl;
      this.coverPending = false;
      this.current.cover = cover.dataUrl;
      this.current.coverPending = false;
      this.current.coverSource = cover.source;
      this.emit('update', { ...this.current });
    } catch {
      this.coverPending = false;
      if (this.currentTrackKey === trackKey) {
        this.current.coverPending = false;
        this.emit('update', { ...this.current });
      }
    }
  }

  setCover(dataUrl, source = 'custom') {
    this.coverForTrack = dataUrl;
    this.current.cover = dataUrl;
    this.current.coverSource = source;
    this.current.coverPending = false;
    this.emit('update', { ...this.current });
  }

  getState() {
    return { ...this.current };
  }

  quit() {
    this.quitting = true;
    clearTimeout(this.restartTimer);
    try { this.writeRaw('quit'); } catch { /* noop */ }
    setTimeout(() => {
      try { this.child?.kill(); } catch { /* noop */ }
      this.child = null;
    }, 400);
  }
}

module.exports = { MediaService, playerName };
