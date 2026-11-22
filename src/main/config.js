'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const DEFAULT_WIDGETS = [
  { id: 'cpu', kind: 'cpu', enabled: true, x: 0, y: 0, w: 3, h: 2 },
  { id: 'gpu', kind: 'gpu', enabled: true, x: 3, y: 0, w: 3, h: 2 },
  { id: 'ram', kind: 'ram', enabled: true, x: 0, y: 2, w: 3, h: 2 },
  { id: 'power', kind: 'power', enabled: true, x: 3, y: 2, w: 3, h: 2 },
  { id: 'media', kind: 'media', enabled: true, x: 6, y: 0, w: 6, h: 4 },
  { id: 'lyrics', kind: 'lyrics', enabled: true, x: 6, y: 4, w: 6, h: 4 },
  { id: 'quick', kind: 'quick', enabled: true, x: 0, y: 4, w: 2, h: 4 },
  { id: 'network', kind: 'network', enabled: true, x: 2, y: 4, w: 2, h: 2 },
  { id: 'storage', kind: 'storage', enabled: true, x: 2, y: 6, w: 2, h: 2 },
  { id: 'clock', kind: 'clock', enabled: true, x: 4, y: 4, w: 2, h: 2 },
  { id: 'system', kind: 'system', enabled: true, x: 4, y: 6, w: 2, h: 2 },
];

const DEFAULT_CONFIG = {
  version: 1,
  setupComplete: false,
  display: {
    targetId: null,
    mode: 'fullscreen',
    alwaysOnTop: false,
    preventSleep: true,
    hideCursor: true,
    launchAtLogin: false,
    refreshMs: 1000,
    autoScale: true,
  },
  appearance: {
    theme: 'light',
    background: 'aurora',
    backgroundSolid: '#eaf3ff',
    gradientFrom: '#e8f4ff',
    gradientTo: '#f7ecff',
    gradientAngle: 135,
    accent: '#1687ff',
    accent2: '#7c5cff',
    blur: 26,
    opacity: 0.58,
    radius: 22,
    padding: 12,
    gap: 8,
    fontScale: 1,
    touchScale: 1.12,
    safeTop: 0,
    safeRight: 0,
    safeBottom: 0,
    safeLeft: 0,
    albumTint: true,
    animations: true,
    noise: true,
    showHeader: true,
    editorGrid: true,
  },
  layout: {
    cols: 12,
    rows: 8,
    widgets: DEFAULT_WIDGETS,
  },
  media: {
    preferredPlayer: 'auto',
    lyricsEnabled: true,
    providers: ['lrclib', 'netease', 'qq', 'kugou'],
    preferLocalLyrics: true,
    localLyricsDir: '',
    autoHide: true,
    offsetMs: 0,
    showTranslation: true,
    showCover: true,
    autoFocus: false,
    lyricFontScale: 1,
  },
  quick: {
    actions: ['wifi', 'bluetooth', 'volume', 'brightness', 'mute', 'screenshot', 'lock', 'settings'],
  },
  shortcuts: [
    { id: 'explorer', label: '资源管理器', icon: 'folder', target: 'explorer.exe', args: '' },
    { id: 'edge', label: '浏览器', icon: 'globe', target: 'msedge.exe', args: '' },
    { id: 'taskmgr', label: '任务管理器', icon: 'activity', target: 'taskmgr.exe', args: '' },
    { id: 'terminal', label: '终端', icon: 'terminal', target: 'wt.exe', args: '' },
  ],
  system: {
    temperatureUnit: 'C',
    firstDayOfWeek: 1,
    showSeconds: false,
    screenshotDir: '',
    hardwareAcceleration: true,
  },
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function merge(base, patch) {
  if (Array.isArray(patch)) return deepClone(patch);
  if (patch === null || typeof patch !== 'object') return patch;
  const out = Array.isArray(base) ? [] : { ...(base || {}) };
  for (const [key, value] of Object.entries(patch)) {
    const current = base && typeof base === 'object' ? base[key] : undefined;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = merge(current || {}, value);
    } else {
      out[key] = deepClone(value);
    }
  }
  return out;
}

function sanitizeWidget(widget, index) {
  const allowed = new Set([
    'cpu', 'gpu', 'ram', 'power', 'temps', 'media', 'lyrics', 'quick', 'network',
    'storage', 'clock', 'system', 'bluetooth', 'shortcuts',
  ]);
  const kind = allowed.has(widget.kind) ? widget.kind : 'clock';
  const cols = 12;
  const rows = 8;
  const min = {
    media: [4, 3], lyrics: [4, 2], quick: [2, 2], cpu: [2, 1], gpu: [2, 1], ram: [2, 1],
    power: [2, 1], temps: [2, 2], bluetooth: [2, 2],
  };
  const [minW, minH] = min[kind] || [2, 1];
  const w = Math.max(minW, Math.min(12, Number(widget.w) || minW));
  const h = Math.max(minH, Math.min(8, Number(widget.h) || minH));
  const x = Math.max(0, Math.min(cols - w, Number(widget.x) || 0));
  const y = Math.max(0, Math.min(rows - h, Number(widget.y) || 0));
  return {
    id: String(widget.id || `${kind}-${index}`),
    kind,
    enabled: widget.enabled !== false,
    x, y, w, h,
    ...(widget.variant ? { variant: String(widget.variant) } : {}),
  };
}

function normalize(config) {
  const next = merge(DEFAULT_CONFIG, config || {});
  next.layout.widgets = (next.layout.widgets || DEFAULT_WIDGETS)
    .filter((w) => w && typeof w === 'object')
    .map(sanitizeWidget);
  next.layout.widgets = next.layout.widgets.filter(
    (w, i, arr) => arr.findIndex((o) => o.id === w.id) === i,
  );
  next.appearance.opacity = Math.min(0.92, Math.max(0.2, Number(next.appearance.opacity) || 0.58));
  next.appearance.blur = Math.min(44, Math.max(8, Number(next.appearance.blur) || 26));
  next.appearance.radius = Math.min(34, Math.max(8, Number(next.appearance.radius) || 22));
  next.appearance.gradientAngle = Math.min(360, Math.max(0, Number(next.appearance.gradientAngle) || 135));
  next.appearance.fontScale = Math.min(1.6, Math.max(0.8, Number(next.appearance.fontScale) || 1));
  next.appearance.touchScale = Math.min(1.5, Math.max(1, Number(next.appearance.touchScale) || 1.12));
  for (const edge of ['safeTop', 'safeRight', 'safeBottom', 'safeLeft']) {
    next.appearance[edge] = Math.min(40, Math.max(0, Number(next.appearance[edge]) || 0));
  }
  next.display.refreshMs = Math.min(10000, Math.max(500, Number(next.display.refreshMs) || 1000));
  next.display.autoScale = next.display.autoScale !== false;
  next.media.offsetMs = Math.min(15000, Math.max(-15000, Number(next.media.offsetMs) || 0));
  next.media.lyricFontScale = Math.min(3, Math.max(0.8, Number(next.media.lyricFontScale) || 1));
  return next;
}

class ConfigStore {
  constructor(filePath) {
    this.filePath = filePath || path.join(app.getPath('userData'), 'config.json');
    this.data = normalize(deepClone(DEFAULT_CONFIG));
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      this.data = normalize(JSON.parse(raw));
      return this.data;
    } catch {
      this.data = normalize(deepClone(DEFAULT_CONFIG));
      return this.data;
    }
  }

  get() {
    return this.data;
  }

  snapshot() {
    return deepClone(this.data);
  }

  update(patch) {
    this.data = normalize(merge(this.data, patch || {}));
    this.save();
    return this.data;
  }

  replace(next) {
    this.data = normalize(next);
    this.save();
    return this.data;
  }

  reset() {
    this.data = normalize(deepClone(DEFAULT_CONFIG));
    this.save();
    return this.data;
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.filePath);
    } catch (error) {
      console.error('[config] save failed:', error);
    }
  }
}

module.exports = { DEFAULT_CONFIG, ConfigStore, normalize, merge };
