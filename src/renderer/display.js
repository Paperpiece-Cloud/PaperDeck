'use strict';

(() => {
  const { icon } = window.GlassIcons;
  const api = window.paperdeck || null;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const ui = {
    app: null,
    topbar: null,
    grid: null,
    albumWash: null,
    toolbar: null,
    popoverRoot: null,
    focusRoot: null,
    modalRoot: null,
    toastRoot: null,
    volumePill: null,
    networkPill: null,
    bluetoothPill: null,
    volumeIcon: null,
    volumeText: null,
    networkIcon: null,
    networkText: null,
    bluetoothIcon: null,
    bluetoothText: null,
    batteryIcon: null,
    batteryText: null,
    batteryPill: null,
    brandLive: null,
    editButton: null,
    settingsButton: null,
  };

  const S = {
    api,
    isDemo: !api,
    boot: null,
    config: null,
    catalog: [],
    quickCatalog: [],
    providers: [],
    metrics: null,
    media: null,
    lyrics: null,
    audio: { volume: 40, muted: false, available: true },
    brightness: { supported: false, value: 50, checked: false, source: '', error: '' },
    display: null,
    widgetNodes: new Map(),
    layoutSignature: '',
    playback: { track: '', base: 0, at: Date.now(), playing: false, status: 'Paused', start: 0, end: 0 },
    cover: null,
    mediaReceivedAt: 0,
    activeLyricIndex: -2,
    mediaIdle: false,
    mediaIdleTimer: null,
    editMode: false,
    focusOpen: false,
    popover: null,
    popoverType: '',
    controlModal: null,
    cursorTimer: null,
    toastCount: 0,
    autoThemeMedia: null,
    demo: null,
  };

  const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

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

  const DEMO_QUICK = [
    { id: 'wifi', label: '网络', icon: 'wifi', description: '网络设置' },
    { id: 'bluetooth', label: '蓝牙', icon: 'bluetooth', description: '蓝牙设置' },
    { id: 'volume', label: '音量', icon: 'volume', description: '调节音量' },
    { id: 'brightness', label: '亮度', icon: 'sun', description: '调节亮度' },
    { id: 'mute', label: '静音', icon: 'mute', description: '系统静音' },
    { id: 'screenshot', label: '截图', icon: 'camera', description: '保存截图' },
    { id: 'lock', label: '锁定', icon: 'lock', description: '锁定 Windows' },
    { id: 'settings', label: '设置', icon: 'gear', description: '打开设置' },
  ];

  const DEMO_LYRICS = {
    synced: true,
    source: 'LRCLIB',
    pending: false,
    lines: [
      { time: 24.04, text: 'Doing like 95 on the interstate' },
      { time: 28.24, text: 'Looking for a dinner plate' },
      { time: 30.39, text: "I'm hungry, you called me" },
      { time: 33.19, text: "To say you got something, and it's all me" },
      { time: 36.15, text: 'Can you hold me down for one night, like I got three strikes?' },
      { time: 42.04, text: "I need you to free me, it's a prison inside my mind" },
      { time: 48.01, text: 'Break me, taste me' },
      { time: 51.33, text: 'Roll me up like the northern lights' },
      { time: 54.06, text: 'Can you hold me down for one night, like I got three strikes?' },
      { time: 59.55, text: "Don me (ain't) -don me (yeah) -don me" },
      { time: 62.66, text: 'Don me, called on me, called on me' },
    ],
  };

  function init() {
    ui.app = $('#app');
    ui.topbar = $('#topbar');
    ui.grid = $('#grid');
    ui.albumWash = $('#albumWash');
    ui.toolbar = $('#editToolbar');
    ui.popoverRoot = $('#popoverRoot');
    ui.focusRoot = $('#focusRoot');
    ui.modalRoot = $('#modalRoot');
    ui.toastRoot = $('#toastRoot');
    ui.volumePill = $('#volumePill');
    ui.networkPill = $('#networkPill');
    ui.bluetoothPill = $('#bluetoothPill');
    ui.volumeIcon = $('#volumeIcon');
    ui.volumeText = $('#volumeText');
    ui.networkIcon = $('#networkIcon');
    ui.networkText = $('#networkText');
    ui.bluetoothIcon = $('#bluetoothIcon');
    ui.bluetoothText = $('#bluetoothText');
    ui.batteryIcon = $('#batteryIcon');
    ui.batteryText = $('#batteryText');
    ui.batteryPill = $('#batteryPill');
    ui.brandLive = $('#brandLive');
    ui.editButton = $('#editButton');
    ui.settingsButton = $('#settingsButton');

    bindStaticEvents();
    boot().catch((error) => {
      console.error(error);
      const demo = buildDemo();
      start(demo);
      toast(`启动数据读取失败：${error.message}`, { icon: 'info', type: 'error', duration: 5000 });
    });
  }

  async function boot() {
    const data = api ? await api.bootstrap() : buildDemo();
    start(data);
  }

  function start(data) {
    S.boot = data;
    S.config = data.config;
    S.catalog = data.catalog || [];
    S.quickCatalog = data.quickActions || [];
    S.providers = data.providers || [];
    S.metrics = data.metrics || emptyMetrics();
    S.media = data.media || { hasSession: false };
    S.bluetooth = data.bluetooth || [];
    S.quickState = data.quickState || {};
    S.lyrics = data.lyrics || null;
    S.audio = data.audio || { volume: 40, muted: false, available: false };
    S.brightness = data.brightness || { supported: false, checked: false, value: 50 };
    S.display = data.displays || null;
    if (S.media.hasSession) {
      syncPlayback(S.media, true);
      if (S.media.cover) applyCover(S.media.cover);
    }
    buildTopbar();
    applyConfig(S.config, true);
    bindApiEvents();
    updateAllWidgets();
    updateClock();
    updateLyricsContent();
    updateMediaWidgets();
    updateTopbar();
    startTickers();
    if (S.isDemo) startDemoAnimation();
    scheduleMediaIdle();
    if (api) {
      api.systemAction('quick-state').then((response) => {
        if (response?.ok && response.result) {
          S.quickState = response.result;
          updateQuickState();
        }
      }).catch(() => {});
    }
    document.body.classList.add('ready');
    pokeCursor();
  }

  function bindStaticEvents() {
    ui.volumePill?.addEventListener('click', (event) => {
      event.stopPropagation();
      openControlModal('volume');
    });
    ui.networkPill?.addEventListener('click', (event) => {
      event.stopPropagation();
      openNetworkPopover(ui.networkPill);
    });
    ui.bluetoothPill?.addEventListener('click', (event) => {
      event.stopPropagation();
      api?.systemAction('open-quick-settings', { kind: 'bluetooth' });
    });
    ui.editButton?.addEventListener('click', () => setEditMode(!S.editMode));
    ui.settingsButton?.addEventListener('click', () => openSettings());
    $('#finishEditing')?.addEventListener('click', () => setEditMode(false));
    $('#resetLayout')?.addEventListener('click', resetLayout);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointermove', pokeCursor, { passive: true });
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    window.addEventListener('resize', () => updateProgress());
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (S.config?.appearance.theme === 'auto') applyTheme();
    });
    if (new URLSearchParams(location.search).has('embedded')) {
      window.addEventListener('message', (event) => {
        if (event.source !== window.parent) return;
        const message = event.data;
        if (!message || message.type !== 'paperdeck-preview-config' || !message.config) return;
        S.config = message.config;
        applyConfig(S.config, false);
        updateAllWidgets();
        updateTopbar();
        updateLyricsContent();
        if (S.focusOpen) renderFocus();
      });
    }
  }

  function bindApiEvents() {
    if (!api) return;
    api.onMetrics((metrics) => {
      S.metrics = metrics;
      updateAllWidgets();
      updateTopbar();
    });
    api.onBluetooth?.((devices) => {
      S.bluetooth = devices || [];
      updateAllWidgets();
      updateTopbar();
    });
    api.onQuickState?.((state) => {
      S.quickState = state || {};
      updateQuickState();
    });
    api.onMedia((incoming) => {
      const hadCover = Object.prototype.hasOwnProperty.call(incoming, 'cover');
      const cover = hadCover ? incoming.cover : undefined;
      const next = { ...(S.media || {}), ...incoming };
      syncPlayback(next);
      if (hadCover) applyCover(cover);
      S.media = next;
      S.mediaReceivedAt = Date.now();
      scheduleMediaIdle();
      updateMediaWidgets();
      updateTopbar();
      updateLyricsContent();
      if (S.focusOpen) renderFocus();
    });
    api.onLyrics((lyrics) => {
      if (lyrics?.pending && S.lyrics?.pending === false && S.lyrics?.trackKey === lyrics.trackKey && S.lyrics?.lines?.length) {
        return;
      }
      const previousTrack = S.lyrics?.trackKey || '';
      S.lyrics = lyrics;
      if ((lyrics?.trackKey || '') !== previousTrack) S.activeLyricIndex = -2;
      updateLyricsContent();
      if (S.focusOpen) renderFocus();
    });
    api.onConfig((config) => {
      S.config = config;
      applyConfig(config, false);
      updateAllWidgets();
      updateTopbar();
      if (S.focusOpen) renderFocus();
    });
    api.onDisplay((display) => {
      S.display = display;
    });
    api.onLayoutEdit(() => setEditMode(true));
    api.onSettingsTab(() => {});
  }

  function startTickers() {
    setInterval(updateClock, 1000);
    setInterval(updateProgress, 240);
    setInterval(async () => {
      if (!api) return;
      try {
        const audio = await api.getAudio();
        if (audio && (audio.volume !== S.audio.volume || audio.muted !== S.audio.muted)) {
          updateAudio(audio, false);
        }
      } catch { /* ignore transient helper errors */ }
    }, 2600);
  }

  function emptyMetrics() {
    return {
      cpu: { load: 0, temp: null, power: null, name: 'CPU', cores: 0 },
      gpu: { load: null, temp: null, power: null, name: 'GPU', available: false },
      ram: { used: 0, total: 0, percent: 0 },
      power: { cpu: null, gpu: null, total: null },
      network: { rxSec: 0, txSec: 0, iface: '网络', ip: '', ssid: '', type: 'unknown', signal: null, connected: false },
      disk: { readSec: 0, writeSec: 0, volumes: [] },
      battery: { hasBattery: false, percent: null, charging: false, ac: true },
      system: { uptime: 0, hostname: '', os: 'Windows' },
      history: { cpu: [], gpu: [], ram: [], rx: [], tx: [], power: [] },
    };
  }

  /* ------------------------------------------------------------------ */
  /* config + top bar                                                    */
  /* ------------------------------------------------------------------ */

  function buildTopbar() {
    if (!ui.topbar) return;
    ui.editButton.innerHTML = icon('layout');
    ui.settingsButton.innerHTML = icon('gear');
    ui.volumeIcon.innerHTML = icon('volume');
    ui.networkIcon.innerHTML = icon('wifi');
    ui.bluetoothIcon.innerHTML = icon('bluetooth');
    ui.batteryIcon.innerHTML = icon('battery');
  }

  function applyConfig(config, initial) {
    const appearance = config.appearance;
    applyTheme(appearance.theme);
    document.documentElement.dataset.background = appearance.background;
    document.documentElement.dataset.animations = appearance.animations ? 'on' : 'off';
    document.documentElement.dataset.noise = appearance.noise ? 'on' : 'off';
    const style = document.documentElement.style;
    style.setProperty('--accent', appearance.accent);
    style.setProperty('--accent-2', appearance.accent2);
    style.setProperty('--accent-rgb', hexToRgb(appearance.accent));
    style.setProperty('--blur', `${appearance.blur}px`);
    style.setProperty('--radius', `${appearance.radius}px`);
    style.setProperty('--glass-opacity', String(appearance.opacity));
    style.setProperty('--pad', `${appearance.padding}px`);
    style.setProperty('--gap', `${appearance.gap}px`);
    style.setProperty('--font-scale', String(appearance.fontScale || 1));
    style.setProperty('--touch-scale', String(appearance.touchScale || 1.12));
    style.setProperty('--lyric-scale', String(S.config.media?.lyricFontScale || 1));
    style.setProperty('--safe-top', `${Number(appearance.safeTop) || 0}px`);
    style.setProperty('--safe-right', `${Number(appearance.safeRight) || 0}px`);
    style.setProperty('--safe-bottom', `${Number(appearance.safeBottom) || 0}px`);
    style.setProperty('--safe-left', `${Number(appearance.safeLeft) || 0}px`);
    style.setProperty('--solid-bg', appearance.backgroundSolid || '#eaf3ff');
    style.setProperty(
      '--gradient-bg',
      `linear-gradient(${Number(appearance.gradientAngle) || 135}deg, ${appearance.gradientFrom || '#e8f4ff'}, ${appearance.gradientTo || '#f7ecff'})`,
    );
    ui.app.classList.toggle('header-hidden', !appearance.showHeader);
    updateAlbumWash();
    const signature = JSON.stringify({
      widgets: config.layout.widgets,
      quick: config.quick.actions,
      shortcuts: config.shortcuts,
      translation: config.media.showTranslation,
      lyricsEnabled: config.media.lyricsEnabled,
      autoHide: config.media.autoHide,
      font: config.media.lyricFontScale,
      header: appearance.showHeader,
      animations: appearance.animations,
    });
    if (!config.media.autoHide && S.mediaIdle) {
      S.mediaIdle = false;
      clearTimeout(S.mediaIdleTimer);
      S.mediaIdleTimer = null;
    }
    if (initial || signature !== S.layoutSignature) {
      S.layoutSignature = signature;
      renderWidgets();
    } else {
      updateLyricsContent();
      updateAllWidgets();
    }
    scheduleMediaIdle();
    if (initial) {
      ui.toolbar.hidden = !S.editMode;
    }
  }

  function applyTheme(theme) {
    let resolved = theme || 'light';
    if (resolved === 'auto') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    // A pure black canvas needs the dark glass palette for readable contrast.
    if (S.config?.appearance?.background === 'black') resolved = 'dark';
    document.documentElement.dataset.theme = resolved;
  }

  function hexToRgb(hex) {
    const normalized = String(hex || '').replace('#', '').trim();
    if (normalized.length === 3) {
      return normalized.split('').map((char) => parseInt(char + char, 16)).join(', ');
    }
    const value = Number.parseInt(normalized.slice(0, 6), 16);
    if (!Number.isFinite(value)) return '22, 135, 255';
    return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
  }

  function updateTopbar() {
    updateVolumeUI();
    const network = S.metrics?.network || {};
    const wifi = isWifi(network);
    const signal = Number(network.signal);
    const connected = network.connected !== false && Boolean(network.ip || network.ssid);
    if (!connected) {
      ui.networkText.textContent = '离线';
      ui.networkIcon.innerHTML = icon('globe');
      ui.networkPill.classList.add('is-off');
    } else {
      ui.networkText.textContent = wifi
        ? `Wi-Fi ${Number.isFinite(signal) ? `${Math.round(signal)}%` : ''}`.trim()
        : '有线';
      ui.networkIcon.innerHTML = icon(wifi ? 'wifi' : 'ethernet');
      ui.networkPill.classList.remove('is-off');
    }
    ui.networkPill.title = wifi
      ? `Wi-Fi${network.ssid ? ` · ${network.ssid}` : ''}${Number.isFinite(signal) ? ` · ${Math.round(signal)}%` : ''}`
      : (connected ? '有线网络' : '网络未连接');

    const bluetoothDevices = S.bluetooth || [];
    ui.bluetoothText.textContent = String(bluetoothDevices.length);
    ui.bluetoothPill.classList.toggle('is-off', !bluetoothDevices.length);
    ui.bluetoothPill.title = bluetoothDevices.length
      ? `蓝牙：${bluetoothDevices.map((device) => device.name).filter(Boolean).join('、')}`
      : '没有已连接的蓝牙设备';

    const battery = S.metrics?.battery || {};
    if (battery.hasBattery && battery.percent !== null) {
      const percent = clamp(Number(battery.percent) || 0, 0, 100);
      ui.batteryText.textContent = `${Math.round(percent)}%`;
      ui.batteryIcon.innerHTML = batteryGlyph(percent, battery.charging);
      ui.batteryPill.classList.toggle('battery-low', percent <= 20 && !battery.charging);
      ui.batteryPill.classList.toggle('battery-charging', Boolean(battery.charging));
    } else {
      ui.batteryText.textContent = 'AC';
      ui.batteryIcon.innerHTML = icon('power');
      ui.batteryPill.classList.remove('battery-low', 'battery-charging');
    }
    const playing = S.media?.status === 'Playing';
    ui.brandLive.classList.toggle('is-playing', Boolean(playing));
    ui.editButton.classList.toggle('active', S.editMode);
    ui.editButton.title = S.editMode ? '结束布局编辑' : '编辑小组件布局';
  }

  function batteryGlyph(percent, charging) {
    const width = Math.max(0, Math.min(12, (12 * percent) / 100));
    return `<svg class="ico battery-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="2.5" y="7" width="17" height="10" rx="3"/>
      <path d="M22 10v4"/>
      <rect x="5" y="9.5" width="${width}" height="5" rx="1.2" fill="currentColor" stroke="none"/>
      ${charging ? '<path d="M12.7 8.8 9.8 13h2.1l-.4 3 3.1-4.5h-2.1z" fill="currentColor" stroke="none"/>' : ''}
    </svg>`;
  }

  function updateVolumeUI() {
    const muted = S.audio?.muted;
    const volume = Number(S.audio?.volume ?? 0);
    ui.volumeIcon.innerHTML = icon(muted || volume === 0 ? 'mute' : 'volume');
    ui.volumeText.textContent = muted ? '静音' : `${Math.round(volume)}%`;
    $$('.system-volume').forEach((node) => {
      node.textContent = muted ? '静音' : `${Math.round(volume)}%`;
    });
    $$('.quick-btn[data-quick="mute"]').forEach((node) => {
      node.classList.toggle('is-muted', Boolean(muted));
    });
  }

  function updateQuickState() {
    const state = S.quickState || {};
    const apply = (kind, enabled) => {
      const definition = S.quickCatalog.find((item) => item.id === kind) || DEMO_QUICK.find((item) => item.id === kind);
      const label = definition?.label || kind;
      $$(`.quick-btn[data-quick="${kind}"]`).forEach((node) => {
        node.classList.toggle('is-on', enabled === true);
        node.classList.toggle('is-off', enabled === false);
        node.setAttribute('aria-pressed', enabled === true ? 'true' : 'false');
        node.title = `${label} · ${enabled === true ? '已开启' : enabled === false ? '已关闭' : '状态未知'}（长按打开系统设置）`;
      });
    };
    apply('wifi', state.wifi);
    apply('bluetooth', state.bluetooth);
    apply('mute', state.audio ? Boolean(state.audio.muted) : undefined);
  }

  function isWifi(network) {
    if (network.type === 'wifi') return true;
    if (network.type === 'ethernet') return false;
    return /wlan|wi-?fi|无线/i.test(`${network.iface || ''} ${network.ssid || ''}`);
  }

  function networkLabel(network) {
    if (network.ssid) return network.ssid;
    if (isWifi(network)) return 'Wi-Fi';
    if (/ethernet|以太网/i.test(network.iface || '')) return '有线网络';
    return network.iface || '网络';
  }

  function openSettings(tab = 'welcome') {
    if (api) api.openSettings(tab);
    else toast('预览模式下无法打开设置窗口', { icon: 'info' });
  }

  /* ------------------------------------------------------------------ */
  /* widgets                                                             */
  /* ------------------------------------------------------------------ */

  function expandIdleLayout(widgets) {
    if (!widgets.length) return widgets;
    const cols = S.config.layout.cols || 12;
    const rows = S.config.layout.rows || 8;
    const minX = Math.min(...widgets.map((widget) => widget.x));
    const minY = Math.min(...widgets.map((widget) => widget.y));
    const maxX = Math.max(...widgets.map((widget) => widget.x + widget.w));
    const maxY = Math.max(...widgets.map((widget) => widget.y + widget.h));
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scaleX = cols / spanX;
    const scaleY = rows / spanY;
    const expanded = widgets.map((widget) => {
      const x = Math.round((widget.x - minX) * scaleX);
      const y = Math.round((widget.y - minY) * scaleY);
      const w = Math.max(1, Math.round(widget.w * scaleX));
      const h = Math.max(1, Math.round(widget.h * scaleY));
      return {
        ...widget,
        x: Math.max(0, Math.min(cols - 1, x)),
        y: Math.max(0, Math.min(rows - 1, y)),
        w: Math.min(w, cols - x),
        h: Math.min(h, rows - y),
      };
    });
    const overlap = expanded.some((a, index) => expanded.slice(index + 1).some((b) => (
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
    )));
    return overlap ? widgets : expanded;
  }

  function hasActiveMedia() {
    return Boolean(
      S.media?.hasSession
      && S.media.status !== 'Closed'
      && S.media.status !== 'Stopped',
    );
  }

  function scheduleMediaIdle() {
    if (!S.config) return;
    if (!S.config.media.autoHide) {
      clearTimeout(S.mediaIdleTimer);
      S.mediaIdleTimer = null;
      if (S.mediaIdle) {
        S.mediaIdle = false;
        renderWidgets();
      }
      return;
    }
    if (hasActiveMedia()) {
      clearTimeout(S.mediaIdleTimer);
      S.mediaIdleTimer = null;
      if (S.mediaIdle) {
        S.mediaIdle = false;
        renderWidgets();
      }
      return;
    }
    if (S.mediaIdle || S.mediaIdleTimer) return;
    S.mediaIdleTimer = setTimeout(() => {
      S.mediaIdleTimer = null;
      if (!hasActiveMedia() && !S.editMode && S.config.media.autoHide) {
        S.mediaIdle = true;
        renderWidgets();
      }
    }, 3000);
  }

  function renderWidgets() {
    if (!ui.grid) return;
    ui.grid.innerHTML = '';
    S.widgetNodes.clear();
    let widgets = (S.config.layout.widgets || []).filter((widget) => widget.enabled);
    if (S.mediaIdle && S.config.media.autoHide && !S.editMode) {
      widgets = expandIdleLayout(widgets.filter((widget) => widget.kind !== 'media' && widget.kind !== 'lyrics'));
    }
    const cols = S.config.layout.cols || 12;
    if (!widgets.length) {
      ui.grid.classList.add('is-empty');
      return;
    }
    ui.grid.classList.remove('is-empty');
    if (S.editMode) {
      const overlay = document.createElement('div');
      overlay.className = 'edit-grid-overlay';
      ui.grid.appendChild(overlay);
    }
    const sorted = [...widgets].sort((a, b) => (a.y - b.y) || (a.x - b.x));
    sorted.forEach((widget, index) => {
      const node = document.createElement('section');
      node.className = `widget widget-${widget.kind}`;
      node.dataset.id = widget.id;
      node.dataset.kind = widget.kind;
      node.style.gridColumn = `${widget.x + 1} / span ${Math.min(widget.w, cols - widget.x)}`;
      node.style.gridRow = `${widget.y + 1} / span ${Math.min(widget.h, 8 - widget.y)}`;
      node.style.setProperty('--index', String(index));
      const builder = BUILDERS[widget.kind];
      node.innerHTML = builder ? builder(widget) : `<div class="w-head"><div class="w-title">${icon('grid')}<span>${escapeHtml(widget.kind)}</span></div></div>`;
      ui.grid.appendChild(node);
      S.widgetNodes.set(widget.id, { node, widget });
      if (S.editMode) attachEditLayer(node, widget);
      bindWidgetEvents(node, widget);
    });
    requestAnimationFrame(() => {
      updateAllWidgets();
      updateLyricsContent(true);
      updateMediaWidgets();
      updateProgress();
    });
  }

  const BUILDERS = {
    cpu: () => `
      ${widgetHead('cpu', 'CPU', '<span class="w-chip" data-f="temp">--°</span>')}
      <div class="metric"><span class="metric-number" data-f="load">--</span><span class="metric-unit">%</span></div>
      <div class="metric-foot"><span class="name" data-f="name">处理器</span><span class="value"><span data-f="power">--</span><span> W</span></span></div>
      <div class="spark" data-f="spark"></div>
    `,
    gpu: () => `
      ${widgetHead('gpu', 'GPU', '<span class="w-chip" data-f="temp">--°</span>')}
      <div class="metric"><span class="metric-number" data-f="load">--</span><span class="metric-unit">%</span></div>
      <div class="metric-foot"><span class="name" data-f="name">显卡</span><span class="value"><span data-f="power">--</span><span> W</span></span></div>
      <div class="spark" data-f="spark"></div>
    `,
    ram: () => `
      ${widgetHead('ram', '内存', '<span class="w-chip" data-f="total">--</span>')}
      <div class="metric"><span class="metric-number" data-f="load">--</span><span class="metric-unit">%</span></div>
      <div class="metric-foot"><span class="name" data-f="used">--</span><span class="value" data-f="free">-- 可用</span></div>
      <div class="ram-track"><i data-f="bar"></i></div>
      <div class="spark" data-f="spark"></div>
    `,
    power: () => `
      ${widgetHead('bolt', '功率', '<span class="w-chip">CPU / GPU</span>')}
      <div class="power-split-main">
        <div class="power-unit cpu">
          <span>CPU</span>
          <div><b data-f="cpu">--</b><em>W</em></div>
        </div>
        <div class="power-unit gpu">
          <span>GPU</span>
          <div><b data-f="gpu">--</b><em>W</em></div>
        </div>
      </div>
      <div class="power-bars">
        <i class="cpu" data-f="cpubar"></i>
        <i class="gpu" data-f="gpubar"></i>
      </div>
    `,
    temps: () => `
      ${widgetHead('thermometer', '温度', '<span class="w-chip">CPU / GPU</span>')}
      <div class="power-split-main temp-split-main">
        <div class="power-unit cpu">
          <span>CPU</span>
          <div><b data-f="cpu">--</b><em data-f="cpuunit">°C</em></div>
        </div>
        <div class="power-unit gpu">
          <span>GPU</span>
          <div><b data-f="gpu">--</b><em data-f="gpuunit">°C</em></div>
        </div>
      </div>
      <div class="power-bars temp-bars">
        <i class="cpu" data-f="cpubar"></i>
        <i class="gpu" data-f="gpubar"></i>
      </div>
    `,
    bluetooth: () => `
      ${widgetHead('bluetooth', '蓝牙电量', '<span class="w-chip" data-f="count">--</span>')}
      <div class="bt-list" data-f="list"><div class="bt-empty">正在读取设备…</div></div>
    `,
    media: () => `
      <div class="media-bg" data-f="bg"></div>
      <div class="media-inner">
        <div class="media-top">
          <div class="media-cover" data-action="focus" title="沉浸歌词">
            <div class="cover-placeholder">${icon('music')}</div>
            <img data-f="cover" alt="">
          </div>
          <div class="media-meta">
            <div class="media-kicker">
              <span class="source-chip" data-f="source">系统媒体</span>
            </div>
            <h1 class="media-title" data-f="title">暂无正在播放</h1>
            <div class="media-artist" data-f="artist">在播放器中开始播放</div>
            <div class="media-album" data-f="album"></div>
          </div>
          <button class="media-expand" data-action="focus" title="打开沉浸歌词" aria-label="打开沉浸歌词">${icon('expand')}</button>
        </div>
        <div class="media-progress">
          <span class="time" data-f="pos">0:00</span>
          <div class="progress-track" data-progress>
            <span class="progress-fill" data-f="fill"></span>
            <span class="progress-knob" data-f="knob"></span>
          </div>
          <span class="time" data-f="dur">0:00</span>
        </div>
        <div class="media-controls">
          <div class="controls">
            <button class="media-btn" data-control="previous" title="上一首" aria-label="上一首">${icon('prev')}</button>
            <button class="media-btn play" data-control="playpause" title="播放/暂停" aria-label="播放/暂停">${icon('play')}</button>
            <button class="media-btn" data-control="next" title="下一首" aria-label="下一首">${icon('next')}</button>
          </div>
          <span class="media-hint">系统媒体控制</span>
        </div>
      </div>
    `,
    lyrics: () => `
      <div class="lyrics-head">
        <div class="w-title">${icon('lyrics')}<span>LYRICS</span></div>
        <span class="lyric-source" data-f="source">等待播放</span>
        <span class="spacer"></span>
        <button class="lyrics-expand" data-action="focus" title="打开沉浸歌词" aria-label="打开沉浸歌词">${icon('expand')}</button>
      </div>
      <div class="lyrics-viewport">
        <div class="lyrics-roll" data-f="roll" hidden></div>
        <div class="lyrics-loading" data-f="loading" hidden><i></i><i></i><i></i></div>
        <div class="lyrics-empty" data-f="empty">
          <span class="empty-icon">${icon('music')}</span>
          <strong data-f="empty-title">等待音乐</strong>
          <span data-f="empty-copy">播放后自动匹配歌词</span>
        </div>
      </div>
    `,
    quick: () => {
      const actions = (S.config.quick.actions || [])
        .map((id) => (S.quickCatalog.length ? S.quickCatalog : DEMO_QUICK).find((action) => action.id === id))
        .filter(Boolean);
      const buttons = actions.map((action) => `
        <button class="quick-btn" data-quick="${escapeHtml(action.id)}" title="${escapeHtml(action.description || action.label)}" aria-label="${escapeHtml(action.label)}">
          <span class="quick-icon">${icon(action.icon || 'sparkles')}</span>
        </button>
      `).join('');
      return `<div class="quick-grid">${buttons || `<div class="lyrics-empty"><span>未添加快捷操作</span></div>`}</div>`;
    },
    network: () => `
      ${widgetHead('wifi', '网络', '<span class="w-chip" data-f="iface">网络</span>')}
      <div class="net-status-main">
        <span class="net-type" data-f="type">网络</span>
        <b class="net-signal" data-f="signal">--</b>
      </div>
      <div class="net-ssid" data-f="ssid">未连接</div>
      <div class="net-ip" data-f="ip">--</div>
    `,
    storage: () => `
      ${widgetHead('drive', '存储', '<span class="w-chip" data-f="free">--</span>')}
      <div class="volume-list" data-f="volumes"></div>
      <div class="storage-foot" data-f="foot">--</div>
    `,
    clock: () => `
      <div class="clock-kicker"><span>LOCAL TIME</span>${icon('clock')}</div>
      <div class="clock-time" data-f="time">--:--</div>
      <div class="clock-date" data-f="date">--</div>
    `,
    system: () => `
      ${widgetHead('battery', '系统', '<span class="w-chip" data-f="state">--</span>')}
      <div class="sys-battery">
        <span class="battery-shell"><i class="battery-fill" data-f="battfill"></i></span>
        <b data-f="battpct">--%</b>
      </div>
      <div class="sys-uptime">
        <span>运行时间</span><b data-f="uptime">--</b>
      </div>
    `,
    shortcuts: () => {
      const shortcuts = (S.config.shortcuts || []).slice(0, 6);
      const buttons = shortcuts.map((shortcut) => `
        <button class="shortcut-btn" data-shortcut="${escapeHtml(shortcut.id)}" title="${escapeHtml(shortcut.label)}">
          ${icon(shortcut.icon || 'grid')}<span>${escapeHtml(shortcut.label)}</span>
        </button>
      `).join('');
      return `${widgetHead('grid', '捷径')}<div class="shortcut-grid">${buttons || '<span class="storage-foot">在设置中添加应用捷径</span>'}</div>`;
    },
  };

  function widgetHead(iconName, label, right = '') {
    return `<div class="w-head"><div class="w-title">${icon(iconName)}<span>${label}</span></div><span class="spacer"></span>${right}</div>`;
  }

  function bindWidgetEvents(node, widget) {
    if (widget.kind === 'media') {
      node.querySelectorAll('[data-control]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          sendMedia(button.dataset.control);
        });
      });
      node.querySelectorAll('[data-action="focus"]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          openFocus();
        });
      });
      const progress = node.querySelector('[data-progress]');
      progress?.addEventListener('click', (event) => {
        event.stopPropagation();
        seekFromEvent(event, progress);
      });
    }
    if (widget.kind === 'lyrics') {
      node.querySelectorAll('[data-action="focus"]').forEach((button) => {
        button.addEventListener('click', openFocus);
      });
      node.addEventListener('click', (event) => {
        const line = event.target.closest('.lyric-line');
        if (line && line.dataset.time) {
          const seconds = Number(line.dataset.time);
          if (Number.isFinite(seconds)) seekTo(seconds * 1000);
        }
      });
    }
    if (widget.kind === 'quick') {
      node.querySelectorAll('[data-quick]').forEach((button) => {
        const action = button.dataset.quick;
        let holdTimer = null;
        let longPressed = false;
        const cancelHold = () => {
          clearTimeout(holdTimer);
          holdTimer = null;
        };
        button.addEventListener('pointerdown', (event) => {
          if (event.button !== 0) return;
          longPressed = false;
          cancelHold();
          holdTimer = setTimeout(() => {
            longPressed = true;
            openQuickSettings(action);
          }, 620);
        });
        button.addEventListener('pointerup', cancelHold);
        button.addEventListener('pointerleave', cancelHold);
        button.addEventListener('pointercancel', cancelHold);
        button.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          event.stopPropagation();
          cancelHold();
          openQuickSettings(action);
        });
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          cancelHold();
          if (longPressed) {
            longPressed = false;
            return;
          }
          runQuickAction(action, button);
        });
      });
    }
    if (widget.kind === 'shortcuts') {
      node.querySelectorAll('[data-shortcut]').forEach((button) => {
        button.addEventListener('click', () => launchShortcut(button.dataset.shortcut));
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* widget updates                                                      */
  /* ------------------------------------------------------------------ */

  function updateAllWidgets() {
    if (!S.metrics) return;
    for (const { node, widget } of S.widgetNodes.values()) {
      switch (widget.kind) {
        case 'cpu': updateCpu(node); break;
        case 'gpu': updateGpu(node); break;
        case 'ram': updateRam(node); break;
        case 'power': updatePower(node); break;
        case 'temps': updateTemps(node); break;
        case 'bluetooth': updateBluetooth(node); break;
        case 'network': updateNetwork(node); break;
        case 'storage': updateStorage(node); break;
        case 'system': updateSystem(node); break;
        case 'clock': updateClock(); break;
        default: break;
      }
    }
    updateVolumeUI();
    updateQuickState();
    updateTopbar();
  }

  function updateCpu(node) {
    const cpu = S.metrics.cpu || {};
    setText(node, '[data-f="load"]', formatPercent(cpu.load));
    setText(node, '[data-f="name"]', cpu.name || '处理器');
    setText(node, '[data-f="power"]', cpu.power !== null && cpu.power !== undefined ? formatNumber(cpu.power, 1) : '--');
    const temp = node.querySelector('[data-f="temp"]');
    if (temp) {
      const formatted = formatTemp(cpu.temp);
      temp.textContent = formatted || '--°';
      temp.style.display = formatted ? '' : 'none';
    }
    const spark = node.querySelector('[data-f="spark"]');
    if (spark) spark.innerHTML = sparkline(S.metrics.history?.cpu || [], { max: 100, min: 0 });
  }

  function updateGpu(node) {
    const gpu = S.metrics.gpu || {};
    setText(node, '[data-f="load"]', gpu.load === null || gpu.load === undefined ? '--' : formatPercent(gpu.load));
    setText(node, '[data-f="name"]', gpu.name || '显卡');
    setText(node, '[data-f="power"]', gpu.power !== null && gpu.power !== undefined ? formatNumber(gpu.power, 1) : '--');
    const temp = node.querySelector('[data-f="temp"]');
    if (temp) {
      const formatted = formatTemp(gpu.temp);
      temp.textContent = formatted || '--°';
      temp.style.display = formatted ? '' : 'none';
    }
    const spark = node.querySelector('[data-f="spark"]');
    if (spark) spark.innerHTML = sparkline(S.metrics.history?.gpu || [], { max: 100, min: 0 });
  }

  function updateRam(node) {
    const ram = S.metrics.ram || {};
    setText(node, '[data-f="load"]', formatPercent(ram.percent));
    setText(node, '[data-f="total"]', ram.total ? formatBytes(ram.total) : '--');
    setText(node, '[data-f="used"]', ram.total ? `${formatBytes(ram.used)} / ${formatBytes(ram.total)}` : '--');
    setText(node, '[data-f="free"]', ram.total ? `${formatBytes(ram.total - ram.used)} 可用` : '--');
    const bar = node.querySelector('[data-f="bar"]');
    if (bar) bar.style.width = `${clamp(Number(ram.percent) || 0, 0, 100)}%`;
    const spark = node.querySelector('[data-f="spark"]');
    if (spark) spark.innerHTML = sparkline(S.metrics.history?.ram || [], { max: 100, min: 0 });
  }

  function updatePower(node) {
    const power = S.metrics.power || {};
    setText(node, '[data-f="cpu"]', power.cpu !== null && power.cpu !== undefined ? formatNumber(power.cpu, 1) : '--');
    setText(node, '[data-f="gpu"]', power.gpu !== null && power.gpu !== undefined ? formatNumber(power.gpu, 1) : '--');
    const cpuBar = node.querySelector('[data-f="cpubar"]');
    const gpuBar = node.querySelector('[data-f="gpubar"]');
    if (cpuBar) cpuBar.style.width = `${clamp(((Number(power.cpu) || 0) / 120) * 100, 2, 100)}%`;
    if (gpuBar) gpuBar.style.width = `${clamp(((Number(power.gpu) || 0) / 120) * 100, 2, 100)}%`;
  }

  function updateTemps(node) {
    const cpu = S.metrics.cpu || {};
    const gpu = S.metrics.gpu || {};
    const unit = S.config.system?.temperatureUnit || 'C';
    const convert = (value) => (unit === 'F' ? (Number(value) * 9) / 5 + 32 : Number(value));
    const cpuTemp = Number(cpu.temp);
    const gpuTemp = Number(gpu.temp);
    setText(node, '[data-f="cpu"]', Number.isFinite(cpuTemp) && cpuTemp > 0 ? Math.round(convert(cpuTemp)) : '--');
    setText(node, '[data-f="gpu"]', Number.isFinite(gpuTemp) && gpuTemp > 0 ? Math.round(convert(gpuTemp)) : '--');
    setText(node, '[data-f="cpuunit"]', `°${unit}`);
    setText(node, '[data-f="gpuunit"]', `°${unit}`);
    const cpuBar = node.querySelector('[data-f="cpubar"]');
    const gpuBar = node.querySelector('[data-f="gpubar"]');
    if (cpuBar) cpuBar.style.width = `${clamp(Number.isFinite(cpuTemp) ? (cpuTemp / 100) * 100 : 0, 0, 100)}%`;
    if (gpuBar) gpuBar.style.width = `${clamp(Number.isFinite(gpuTemp) ? (gpuTemp / 100) * 100 : 0, 0, 100)}%`;
  }

  function updateBluetooth(node) {
    const list = node.querySelector('[data-f="list"]');
    const count = node.querySelector('[data-f="count"]');
    const devices = S.bluetooth || [];
    if (count) count.textContent = devices.length ? `${devices.length} 台` : '未连接';
    if (!list) return;
    if (!devices.length) {
      list.innerHTML = '<div class="bt-empty">未发现已连接设备</div>';
      return;
    }
    list.innerHTML = devices.map((device) => {
      const battery = Number.isFinite(Number(device.battery)) ? Number(device.battery) : null;
      return `<div class="bt-device">
        <span class="bt-ic">${icon('bluetooth')}</span>
        <div class="bt-copy"><b>${escapeHtml(device.name || '蓝牙设备')}</b><span>${battery === null ? 'Windows 未上报电量' : '已连接'}</span></div>
        <div class="bt-batt ${battery !== null && battery <= 20 ? 'low' : ''}">${battery === null ? '<em>--</em>' : `<b>${Math.round(battery)}</b><em>%</em>`}</div>
      </div>`;
    }).join('');
  }

  function updateNetwork(node) {
    const network = S.metrics.network || {};
    const wifi = isWifi(network);
    const signal = Number(network.signal);
    const connected = network.connected !== false && Boolean(network.ip || network.ssid);
    const typeLabel = connected ? (wifi ? 'Wi-Fi' : '有线网络') : '未连接';
    setText(node, '[data-f="iface"]', typeLabel);
    setText(node, '[data-f="type"]', typeLabel);
    setText(node, '[data-f="signal"]', connected
      ? (wifi && Number.isFinite(signal) ? `${Math.round(signal)}%` : '已连接')
      : '--');
    setText(node, '[data-f="ssid"]', connected ? (network.ssid || (wifi ? '无线网络' : '以太网')) : '网络已断开');
    setText(node, '[data-f="ip"]', network.ip || '无 IP 地址');
  }

  function updateStorage(node) {
    const volumes = S.metrics.disk?.volumes || [];
    const list = node.querySelector('[data-f="volumes"]');
    if (list) {
      const signature = JSON.stringify(volumes.map((volume) => [volume.mount, Math.round(volume.used), Math.round(volume.total)]));
      if (list.dataset.signature !== signature) {
        list.dataset.signature = signature;
        list.innerHTML = volumes.slice(0, 3).map((volume) => `
          <div class="volume-row">
            <span class="vol-name">${escapeHtml(volume.mount.replace(':', ''))}</span>
            <span class="vol-bar"><i style="width:${clamp(volume.percent, 0, 100)}%"></i></span>
            <span class="vol-pct">${Math.round(volume.percent)}%</span>
          </div>
        `).join('') || '<div class="storage-foot">未发现磁盘</div>';
      }
    }
    const totalFree = volumes.reduce((sum, volume) => sum + (volume.free || 0), 0);
    setText(node, '[data-f="free"]', volumes.length ? `${formatBytes(totalFree)} 可用` : '--');
    setText(node, '[data-f="foot"]', volumes.length ? volumes.map((volume) => `${volume.mount} 剩余 ${formatBytes(volume.free)}`).join(' · ') : '--');
  }

  function updateSystem(node) {
    const battery = S.metrics.battery || {};
    const batteryFill = node.querySelector('[data-f="battfill"]');
    const batteryShell = node.querySelector('.battery-shell');
    if (battery.hasBattery && battery.percent !== null) {
      const percent = clamp(Number(battery.percent) || 0, 0, 100);
      setText(node, '[data-f="battpct"]', `${Math.round(percent)}%`);
      setText(node, '[data-f="battnote"]', battery.charging ? '充电中' : battery.ac ? '外接电源' : '电池供电');
      setText(node, '[data-f="state"]', battery.ac ? 'AC' : 'BAT');
      if (batteryShell) batteryShell.hidden = false;
      if (batteryFill) {
        // The shell has a 1px inset on both sides; subtract that from 100%.
        const inset = (percent / 100) * 2;
        batteryFill.style.width = `calc(${percent}% - ${inset.toFixed(2)}px)`;
        batteryFill.classList.toggle('low', percent < 20);
        batteryFill.classList.toggle('charging', Boolean(battery.charging));
      }
    } else {
      setText(node, '[data-f="battpct"]', 'AC');
      setText(node, '[data-f="battnote"]', '交流供电');
      setText(node, '[data-f="state"]', 'AC');
      if (batteryShell) batteryShell.hidden = true;
      if (batteryFill) {
        batteryFill.style.width = '0%';
        batteryFill.classList.remove('low', 'charging');
      }
    }
    setText(node, '[data-f="uptime"]', formatUptime(S.metrics.system?.uptime || 0));
    setText(node, '[data-f="volume"]', S.audio.muted ? '静音' : `${Math.round(S.audio.volume)}%`);
    setText(node, '[data-f="link"]', networkLabel(S.metrics.network || {}));
  }

  function updateClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const showSeconds = Boolean(S.config.system?.showSeconds);
    $$('.widget-clock').forEach((node) => {
      const timeNode = node.querySelector('[data-f="time"]');
      if (timeNode) {
        timeNode.classList.toggle('has-seconds', showSeconds);
        if (timeNode.dataset.seconds !== String(showSeconds)) {
          timeNode.dataset.seconds = String(showSeconds);
          timeNode.innerHTML = showSeconds
            ? `${hh}:${mm}<span class="clock-seconds">:${ss}</span>`
            : `${hh}:${mm}`;
        } else {
          const secondsNode = timeNode.querySelector('.clock-seconds');
          if (secondsNode) secondsNode.textContent = `:${ss}`;
          else if (!showSeconds) {
            const parts = timeNode.textContent.split(':');
            if (parts[0] !== hh || parts[1] !== mm) timeNode.textContent = `${hh}:${mm}`;
          }
        }
      }
      setText(node, '[data-f="date"]', `${MONTHS[now.getMonth()]}${now.getDate()}日 <span class="clock-week">${WEEKDAYS[now.getDay()]}</span>`);
      const dateNode = node.querySelector('[data-f="date"]');
      if (dateNode) dateNode.innerHTML = `${MONTHS[now.getMonth()]}${now.getDate()}日 <span class="clock-week">${WEEKDAYS[now.getDay()]}</span>`;
    });
  }

  function setText(root, selector, value) {
    const node = root.querySelector(selector);
    if (node && node.textContent !== String(value)) node.textContent = value;
  }

  function formatPercent(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    return String(Math.round(Number(value)));
  }

  function formatNumber(value, digits = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '--';
    return number.toFixed(digits).replace(/\.0$/, '');
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1024 ** 4) return `${(value / 1024 ** 4).toFixed(1)} TB`;
    if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(value >= 100 * 1024 ** 3 ? 0 : 1)} GB`;
    if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
    return `${Math.round(value)} B`;
  }

  function formatRate(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value >= 1024 ** 2) {
      const number = value / 1024 ** 2;
      return { value: number >= 10 ? number.toFixed(0) : number.toFixed(1), unit: 'MB/s' };
    }
    if (value >= 1024) {
      const number = value / 1024;
      return { value: number >= 100 ? number.toFixed(0) : number.toFixed(1), unit: 'KB/s' };
    }
    return { value: value.toFixed(0), unit: 'B/s' };
  }

  function formatTemp(celsius) {
    if (celsius === null || celsius === undefined || Number.isNaN(Number(celsius))) return '';
    const unit = S.config.system?.temperatureUnit || 'C';
    const value = unit === 'F' ? (Number(celsius) * 9) / 5 + 32 : Number(celsius);
    return `${Math.round(value)}°${unit}`;
  }

  function formatUptime(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (days > 0) return `${days}天 ${hours}时`;
    if (hours > 0) return `${hours}时 ${minutes}分`;
    return `${minutes}分`;
  }

  function formatTime(ms, forceHours = false) {
    const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    if (minutes >= 60 || forceHours) {
      const hours = Math.floor(minutes / 60);
      return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  let sparkCounter = 0;

  function sparkline(values, options = {}) {
    const width = 200;
    const height = 40;
    const pad = 2;
    const list = (values || []).map(Number).filter((value) => Number.isFinite(value));
    if (list.length < 2) list.push(0, 0);
    while (list.length < 8) list.unshift(list[0] || 0);
    const max = options.max === null || options.max === undefined
      ? Math.max(...list, 1)
      : Math.max(Number(options.max) || 1, 1);
    const min = Number(options.min) || 0;
    const span = Math.max(max - min, 0.0001);
    const step = (width - pad * 2) / (list.length - 1);
    const points = list.map((value, index) => ({
      x: pad + index * step,
      y: height - pad - ((clamp(value, min, max) - min) / span) * (height - pad * 2),
    }));
    const line = smoothLine(points);
    const area = `${line} L ${width - pad},${height} L ${pad},${height} Z`;
    const id = `spark-grad-${sparkCounter++}`;
    return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="currentColor" stop-opacity="0.24"/>
          <stop offset="1" stop-color="currentColor" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#${id})"/>
      <path d="${line}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </svg>`;
  }

  function smoothLine(points) {
    if (!points.length) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const midX = (previous.x + current.x) / 2;
      const midY = (previous.y + current.y) / 2;
      path += ` Q ${previous.x} ${previous.y} ${midX} ${midY}`;
    }
    const last = points[points.length - 1];
    path += ` L ${last.x} ${last.y}`;
    return path;
  }

  /* ------------------------------------------------------------------ */
  /* media / playback / lyrics                                           */
  /* ------------------------------------------------------------------ */

  function syncPlayback(media, force = false) {
    if (!media || !media.hasSession) {
      S.playback = { track: '', base: 0, at: Date.now(), playing: false, status: 'Closed', start: 0, end: 0 };
      return;
    }
    const track = `${media.title || ''}|${media.artist || ''}|${media.album || ''}`.toLowerCase();
    const incoming = Number(media.positionMs) || 0;
    const end = Math.max(0, (Number(media.endMs) || 0) - (Number(media.startMs) || 0));
    const newTrack = track !== S.playback.track;
    const statusChanged = media.status !== S.playback.status;
    if (force || newTrack) {
      S.playback.base = incoming;
      S.playback.at = Date.now();
    } else if (statusChanged) {
      const estimated = currentPosition();
      S.playback.base = (end === 0 && incoming === 0) ? estimated : incoming;
      S.playback.at = Date.now();
    } else if (end > 0 || incoming > 0) {
      const estimated = currentPosition();
      if (Math.abs(incoming - estimated) > 2400) {
        S.playback.base = incoming;
        S.playback.at = Date.now();
      }
    }
    S.playback.track = track;
    S.playback.playing = media.status === 'Playing';
    S.playback.status = media.status;
    S.playback.start = Number(media.startMs) || 0;
    S.playback.end = end;
  }

  function effectiveDuration() {
    const declared = Math.max(0, (Number(S.media?.endMs) || 0) - (Number(S.media?.startMs) || 0));
    if (declared > 0) return declared;
    // Kugou's SMTC session exposes controls and artwork but not its timeline.
    // Use the last timed lyric as a graceful estimated duration so the progress
    // rail and lyric animation still work.
    const lines = S.lyrics?.lines;
    if (lines?.length) {
      const last = Number(lines[lines.length - 1].time) || 0;
      return Math.max((last + 15) * 1000, 30000);
    }
    return 0;
  }

  function currentPosition() {
    if (!S.media?.hasSession) return 0;
    let position = Number(S.playback.base) || 0;
    if (S.playback.playing) position += Date.now() - S.playback.at;
    if (S.playback.end > 0) position = Math.min(position, S.playback.end);
    return Math.max(0, position);
  }

  function applyCover(cover) {
    S.cover = cover || null;
    const root = document.documentElement;
    if (cover) {
      root.style.setProperty('--media-image', `url("${cover}")`);
    } else {
      root.style.setProperty('--media-image', 'none');
    }
    updateAlbumWash();
    $$('.media-cover').forEach((node) => {
      const image = node.querySelector('[data-f="cover"]');
      if (!image) return;
      if (cover && image.src !== cover) image.src = cover;
      if (!cover) image.removeAttribute('src');
      node.classList.toggle('has-image', Boolean(cover));
    });
    $$('.media-bg').forEach((node) => {
      node.style.backgroundImage = cover ? `url("${cover}")` : 'none';
    });
    if (S.focusOpen) {
      const focus = $('.focus');
      if (focus) focus.style.setProperty('--focus-image', cover ? `url("${cover}")` : 'none');
      const image = $('.focus-cover img');
      if (image) {
        if (cover) image.src = cover;
        else image.removeAttribute('src');
        image.style.opacity = cover ? '1' : '0';
      }
    }
  }

  function updateAlbumWash() {
    const mode = S.config?.appearance?.background;
    const custom = mode === 'solid' || mode === 'gradient' || mode === 'black';
    const enabled = Boolean(S.config?.appearance.albumTint && S.cover && !custom);
    ui.albumWash?.classList.toggle('active', enabled);
  }

  function updateMediaWidgets() {
    const media = S.media || { hasSession: false };
    $$('.widget-media').forEach((node) => {
      const hasSession = Boolean(media.hasSession);
      node.classList.toggle('is-empty', !hasSession);
      setText(node, '[data-f="source"]', hasSession ? (media.playerName || '媒体') : '系统媒体');
      setText(node, '[data-f="title"]', hasSession ? (media.title || '未知曲目') : '暂无正在播放');
      setText(node, '[data-f="artist"]', hasSession ? (media.artist || '未知艺术家') : '在 Apple Music、网易云、QQ 或酷狗中播放');
      setText(node, '[data-f="album"]', hasSession ? (media.album || '') : '');
      const bars = node.querySelector('[data-f="bars"]');
      bars?.classList.toggle('is-on', media.status === 'Playing');
      const cover = node.querySelector('.media-cover');
      cover?.classList.toggle('is-playing', media.status === 'Playing' && hasSession);
      const coverImage = node.querySelector('[data-f="cover"]');
      if (coverImage) {
        if (S.cover) {
          if (coverImage.getAttribute('src') !== S.cover) coverImage.src = S.cover;
          cover?.classList.add('has-image');
        } else {
          coverImage.removeAttribute('src');
          cover?.classList.remove('has-image');
        }
      }
      const mediaBg = node.querySelector('[data-f="bg"]');
      if (mediaBg) mediaBg.style.backgroundImage = S.cover ? `url("${S.cover}")` : 'none';
      const play = node.querySelector('[data-control="playpause"]');
      if (play) play.innerHTML = icon(media.status === 'Playing' ? 'pause' : 'play');
      const previous = node.querySelector('[data-control="previous"]');
      const next = node.querySelector('[data-control="next"]');
      if (previous) previous.disabled = !hasSession || !media.canPrevious;
      if (next) next.disabled = !hasSession || !media.canNext;
      if (play) play.disabled = !hasSession;
      node.querySelectorAll('[data-action="focus"]').forEach((button) => {
        button.disabled = !hasSession;
      });
    });
    updateProgress();
  }

  function updateProgress() {
    const media = S.media || { hasSession: false };
    const hasSession = Boolean(media.hasSession);
    const end = effectiveDuration();
    const position = hasSession ? currentPosition() : 0;
    const ratio = end > 0 ? clamp(position / end, 0, 1) : 0;
    $$('.media-progress').forEach((node) => {
      setText(node, '[data-f="pos"]', formatTime(position));
      setText(node, '[data-f="dur"]', end > 0 ? formatTime(end) : '--:--');
      const fill = node.querySelector('[data-f="fill"]');
      const knob = node.querySelector('[data-f="knob"]');
      if (fill) fill.style.width = `${ratio * 100}%`;
      if (knob) knob.style.left = `${ratio * 100}%`;
    });
    $$('.focus-progress').forEach((node) => {
      setText(node, '[data-f="pos"]', formatTime(position));
      setText(node, '[data-f="dur"]', end > 0 ? formatTime(end) : '--:--');
      const fill = node.querySelector('[data-f="fill"]');
      const knob = node.querySelector('[data-f="knob"]');
      if (fill) fill.style.width = `${ratio * 100}%`;
      if (knob) knob.style.left = `${ratio * 100}%`;
    });
    updateLyricsActive(false);
    updateFocusLyricsActive(false);
    updateKaraoke();
  }

  function sendMedia(command) {
    if (!S.media?.hasSession && command !== 'playpause') return;
    if (S.isDemo) {
      if (command === 'playpause') {
        S.media.status = S.media.status === 'Playing' ? 'Paused' : 'Playing';
        syncPlayback(S.media, false);
        updateMediaWidgets();
        updateTopbar();
      }
      return;
    }
    if (api) api.mediaCommand(command);
    if (command === 'playpause') {
      const position = currentPosition();
      S.playback.base = position;
      S.playback.at = Date.now();
      S.playback.playing = !S.playback.playing;
      S.media.status = S.playback.playing ? 'Playing' : 'Paused';
      updateMediaWidgets();
      updateTopbar();
    }
  }

  function seekFromEvent(event, track) {
    const rect = track.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const end = effectiveDuration();
    if (!end) return;
    const target = ratio * end;
    seekTo(target);
  }

  function seekTo(targetMs) {
    if (!S.media?.hasSession) return;
    const end = effectiveDuration();
    const clamped = clamp(targetMs, 0, end || targetMs);
    S.playback.base = clamped;
    S.playback.at = Date.now();
    if (!S.isDemo && api) api.mediaCommand(`seek ${Math.round(clamped + (Number(S.media.startMs) || 0))}`);
    updateProgress();
  }

  function updateLyricsContent(force = false) {
    const media = S.media || { hasSession: false };
    const lyrics = S.lyrics;
    const hasSynced = Boolean(lyrics?.lines?.length);
    const hasPlain = Boolean(lyrics?.plainLines?.length);
    const hasContent = hasSynced || hasPlain;
    // Never flash "matching" over lyrics that are already displayed. Some
    // providers can emit a late pending state while a newer result is present.
    const source = hasContent ? (lyrics?.source || '') : (lyrics?.pending ? '正在匹配' : (lyrics?.source || ''));
    $$('.widget-lyrics').forEach((node) => {
      setText(node, '[data-f="source"]', source || (media.hasSession ? '等待歌词' : '等待播放'));
      const roll = node.querySelector('[data-f="roll"]');
      const empty = node.querySelector('[data-f="empty"]');
      const loading = node.querySelector('[data-f="loading"]');
      if (!roll || !empty || !loading) return;

      if (!media.hasSession) {
        roll.hidden = true;
        loading.hidden = true;
        empty.hidden = false;
        setText(node, '[data-f="empty-title"]', '等待音乐');
        setText(node, '[data-f="empty-copy"]', '播放后自动匹配歌词');
        return;
      }
      if (!S.config.media.lyricsEnabled) {
        roll.hidden = true;
        loading.hidden = true;
        empty.hidden = false;
        setText(node, '[data-f="empty-title"]', '歌词已关闭');
        setText(node, '[data-f="empty-copy"]', '可在主屏设置的「媒体与歌词」中重新开启');
        return;
      }
      if (!hasContent && lyrics?.pending) {
        roll.hidden = true;
        empty.hidden = true;
        loading.hidden = false;
        return;
      }
      if (lyrics?.instrumental) {
        roll.hidden = true;
        loading.hidden = true;
        empty.hidden = false;
        setText(node, '[data-f="empty-title"]', '纯音乐');
        setText(node, '[data-f="empty-copy"]', '请慢慢欣赏');
        return;
      }
      if (!hasSynced && !hasPlain) {
        roll.hidden = true;
        loading.hidden = true;
        empty.hidden = false;
        setText(node, '[data-f="empty-title"]', lyrics ? '未找到歌词' : '等待歌词');
        setText(node, '[data-f="empty-copy"]', lyrics ? (lyrics.providers?.length ? '可以尝试切换歌词源' : '播放后自动匹配歌词') : '正在等待媒体信息');
        return;
      }
      loading.hidden = true;
      empty.hidden = true;
      roll.hidden = false;
      const signature = JSON.stringify({
        track: lyrics?.trackKey,
        lines: hasSynced ? lyrics.lines.length : lyrics.plainLines.length,
        source: lyrics?.source,
        translation: S.config.media.showTranslation,
        translations: hasSynced ? lyrics.lines.reduce((count, line) => count + (line.translation ? 1 : 0), 0) : 0,
        words: hasSynced ? lyrics.lines.reduce((count, line) => count + (line.words?.length || 0), 0) : 0,
      });
      if (!force && roll.dataset.signature === signature) {
        updateLyricsActive(true);
        return;
      }
      roll.dataset.signature = signature;
      roll.classList.toggle('plain', !hasSynced);
      if (hasSynced) {
        roll.innerHTML = lyrics.lines.map((line, index) => {
          const translation = S.config.media.showTranslation && line.translation
            ? `<div class="lyric-trans">${escapeHtml(line.translation)}</div>`
            : '';
          const text = line.words?.length
            ? line.words.map((word) => `<span class="lyric-word" data-time="${word.time}">${escapeHtml(word.text)}</span>`).join('')
            : escapeHtml(line.text);
          return `<div class="lyric-line" data-time="${line.time}" data-index="${index}"><div class="lyric-text">${text}</div>${translation}</div>`;
        }).join('');
      } else {
        roll.innerHTML = lyrics.plainLines.slice(0, 80).map((line) => (
          `<div class="lyric-line"><div class="lyric-text">${escapeHtml(line)}</div></div>`
        )).join('');
      }
      S.activeLyricIndex = -2;
      requestAnimationFrame(() => updateLyricsActive(true));
    });
  }

  function findActiveLyric(localOffsetSeconds) {
    const lyrics = S.lyrics;
    if (!lyrics?.lines?.length) return -1;
    const lines = lyrics.lines;
    let low = 0;
    let high = lines.length - 1;
    let result = -1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (lines[mid].time <= localOffsetSeconds + 0.04) {
        result = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return result;
  }

  function getLyricTimeSeconds() {
    const offset = (Number(S.config.media.offsetMs) || 0) / 1000;
    return (currentPosition() - (Number(S.media?.startMs) || 0)) / 1000 + offset;
  }

  function updateLyricsActive(force = false) {
    const lyrics = S.lyrics;
    if (!lyrics?.lines?.length) return;
    const seconds = getLyricTimeSeconds();
    const active = findActiveLyric(seconds);
    if (!force && active === S.activeLyricIndex) {
      updateKaraoke(seconds);
      return;
    }
    S.activeLyricIndex = active;
    $$('.widget-lyrics').forEach((node) => {
      const roll = node.querySelector('[data-f="roll"]');
      const viewport = node.querySelector('.lyrics-viewport');
      if (!roll || !viewport || roll.hidden || roll.classList.contains('plain')) return;
      const lines = [...roll.querySelectorAll('.lyric-line')];
      lines.forEach((line, index) => {
        line.classList.toggle('active', index === active);
        line.classList.toggle('past', index === active - 1);
        line.classList.toggle('past-far', index < active - 1);
        line.classList.toggle('future', index > active);
        line.classList.toggle('upcoming', active < 0 ? index === 0 : index === active + 1);
      });
      const centerOn = () => {
        if (!roll.isConnected) return;
        const viewportHeight = viewport.clientHeight;
        const anchor = viewportHeight * 0.4;
        if (active < 0) {
          const first = lines[0];
          const center = first ? first.offsetTop + first.offsetHeight / 2 : 0;
          roll.style.transform = `translateY(${Math.round(anchor - center)}px)`;
          return;
        }
        const target = lines[active];
        if (!target) return;
        const center = target.offsetTop + target.offsetHeight / 2;
        roll.style.transform = `translateY(${Math.round(anchor - center)}px)`;
      };
      requestAnimationFrame(centerOn);
    });
    updateKaraoke(seconds);
  }

  function updateKaraoke(seconds = getLyricTimeSeconds()) {
    $$('.widget-lyrics .lyric-line.active .lyric-word').forEach((word) => {
      word.classList.toggle('sung', Number(word.dataset.time) <= seconds + 0.04);
    });
    $$('.focus .focus-line.active .focus-word').forEach((word) => {
      word.classList.toggle('sung', Number(word.dataset.time) <= seconds + 0.04);
    });
  }

  /* ------------------------------------------------------------------ */
  /* popovers                                                            */
  /* ------------------------------------------------------------------ */

  function closePopover() {
    if (S.popover) {
      S.popover.remove();
      S.popover = null;
      S.popoverType = '';
      pokeCursor();
    }
  }

  function closeControlModal() {
    if (S.controlModalKeyHandler) {
      document.removeEventListener('keydown', S.controlModalKeyHandler);
      S.controlModalKeyHandler = null;
    }
    S.controlModal?.root?.remove();
    S.controlModal = null;
    pokeCursor();
  }

  function positionPopover(popover, anchor, above = false) {
    const rect = anchor.getBoundingClientRect();
    const width = 264;
    const gap = 7;
    let left = above ? rect.left + rect.width / 2 - width / 2 : rect.right - width;
    left = clamp(left, 10, window.innerWidth - width - 10);
    popover.style.left = `${left}px`;
    if (above) {
      popover.style.bottom = `${window.innerHeight - rect.top + gap}px`;
      popover.style.top = 'auto';
    } else {
      popover.style.top = `${rect.bottom + gap}px`;
      popover.style.bottom = 'auto';
    }
  }

  function openControlModal(type) {
    closePopover();
    closeControlModal();
    const isVolume = type === 'volume';
    const value = isVolume ? Number(S.audio?.volume || 0) : Number(S.brightness?.value || 0);
    const root = document.createElement('div');
    root.className = 'control-modal-backdrop';
    root.innerHTML = `
      <div class="control-modal" role="dialog" aria-modal="true" aria-label="${isVolume ? '音量' : '亮度'}">
        <div class="control-modal-head">
          <span class="control-modal-icon">${icon(isVolume ? 'volume' : 'sun')}</span>
          <b>${isVolume ? '系统音量' : '屏幕亮度'}</b>
          <button class="control-modal-close" data-role="close" aria-label="关闭">${icon('x')}</button>
        </div>
        <div class="control-modal-value"><b data-f="value">${Math.round(value)}</b><span>%</span></div>
        <div class="control-modal-slider">
          <button class="control-step" data-step="-10" aria-label="降低">−</button>
          <input class="control-modal-range" type="range" min="0" max="100" value="${Math.round(value)}" style="--value:${Math.round(value)}%" data-role="range" ${!isVolume && S.brightness?.checked && !S.brightness?.supported ? 'disabled' : ''}>
          <button class="control-step" data-step="10" aria-label="提高">+</button>
        </div>
        <div class="control-modal-foot">
          ${isVolume
            ? `<button class="ghost-button ${S.audio?.muted ? 'on' : ''}" data-role="mute">${icon('mute')}<span>${S.audio?.muted ? '已静音' : '静音'}</span></button><span>系统默认输出</span>`
            : `<span>${escapeHtml(brightnessNote())}</span><button class="ghost-button" data-role="display-settings">显示设置</button>`}
        </div>
      </div>
    `;
    document.body.appendChild(root);
    S.controlModal = { type, root };
    const range = root.querySelector('[data-role="range"]');
    const valueNode = root.querySelector('[data-f="value"]');
    let lastSent = 0;
    const paint = (next) => {
      const normalized = clamp(Number(next) || 0, 0, 100);
      if (valueNode) valueNode.textContent = String(Math.round(normalized));
      if (range) {
        range.value = String(Math.round(normalized));
        range.style.setProperty('--value', `${Math.round(normalized)}%`);
      }
      S.controlModalValue = normalized;
      return normalized;
    };
    const apply = async (next, force = false) => {
      const normalized = paint(next);
      if (S.isDemo) {
        if (isVolume) updateAudio({ ...S.audio, volume: normalized, muted: false }, false);
        else S.brightness = { ...S.brightness, supported: true, checked: true, value: normalized };
        return;
      }
      const now = Date.now();
      if (!force && now - lastSent < 70) return;
      lastSent = now;
      try {
        if (isVolume) {
          const response = await api.systemAction('volume', { absolute: normalized });
          if (response?.ok && response.result) updateAudio(response.result, false);
        } else {
          const response = await api.systemAction('brightness', { absolute: normalized });
          if (response?.ok && response.result) {
            S.brightness = response.result;
            updateControlModal();
          }
        }
      } catch { /* keep slider value; errors are reflected by the system */ }
    };
    paint(value);
    range?.addEventListener('input', () => apply(range.value, false));
    range?.addEventListener('change', () => apply(range.value, true));
    root.querySelectorAll('[data-step]').forEach((button) => {
      button.addEventListener('click', () => apply(Number(range?.value || 0) + Number(button.dataset.step), true));
    });
    root.querySelector('[data-role="close"]')?.addEventListener('click', closeControlModal);
    root.addEventListener('pointerdown', (event) => {
      if (event.target === root) closeControlModal();
    });
    root.querySelector('[data-role="mute"]')?.addEventListener('click', async () => {
      if (S.isDemo) {
        updateAudio({ ...S.audio, muted: !S.audio.muted }, true);
        updateControlModal();
        return;
      }
      const response = await api.systemAction('mute');
      if (response?.ok && response.result) {
        updateAudio(response.result, true);
        updateControlModal();
      }
    });
    root.querySelector('[data-role="display-settings"]')?.addEventListener('click', () => {
      callSystem('display-settings');
      closeControlModal();
    });
    const onKey = (event) => {
      if (event.key === 'Escape') {
        closeControlModal();
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);
    S.controlModalKeyHandler = onKey;
    pokeCursor();
  }

  function updateControlModal() {
    if (!S.controlModal) return;
    const { type, root } = S.controlModal;
    if (type === 'volume') {
      const value = Math.round(Number(S.audio?.volume || 0));
      const valueNode = root.querySelector('[data-f="value"]');
      const range = root.querySelector('[data-role="range"]');
      if (valueNode) valueNode.textContent = String(value);
      if (range && document.activeElement !== range) {
        range.value = String(value);
        range.style.setProperty('--value', `${value}%`);
      }
      const mute = root.querySelector('[data-role="mute"]');
      if (mute) {
        mute.classList.toggle('on', Boolean(S.audio?.muted));
        const label = mute.querySelector('span');
        if (label) label.textContent = S.audio?.muted ? '已静音' : '静音';
      }
    } else {
      const value = Math.round(Number(S.brightness?.value || 0));
      const valueNode = root.querySelector('[data-f="value"]');
      const range = root.querySelector('[data-role="range"]');
      if (valueNode) valueNode.textContent = S.brightness?.supported === false ? '--' : String(value);
      if (range) {
        range.value = String(value);
        range.style.setProperty('--value', `${value}%`);
        range.disabled = !S.brightness?.supported && Boolean(S.brightness?.checked);
      }
      const foot = root.querySelector('.control-modal-foot span');
      if (foot) foot.textContent = brightnessNote();
    }
  }

  function openVolumePopover(anchor) {
    closePopover();
    const popover = document.createElement('div');
    popover.className = 'popover';
    popover.innerHTML = `
      <div class="popover-head">
        <div class="popover-title">${icon('volume')}<span>系统音量</span></div>
        <span class="popover-value" data-f="value">${Math.round(S.audio.volume)}%</span>
      </div>
      <div class="popover-slider">
        <span class="slider-icon">${icon('volume')}</span>
        <input class="range" type="range" min="0" max="100" value="${Math.round(S.audio.volume)}" style="--value:${Math.round(S.audio.volume)}%" data-role="range">
        <span class="slider-icon">${icon('volume')}</span>
      </div>
      <div class="popover-foot">
        <button class="ghost-button ${S.audio.muted ? 'on' : ''}" data-role="mute">${icon('mute')}<span>${S.audio.muted ? '已静音' : '静音'}</span></button>
        <span class="popover-sub" style="margin:0">系统默认输出</span>
      </div>
    `;
    ui.popoverRoot.appendChild(popover);
    S.popover = popover;
    S.popoverType = 'volume';
    positionPopover(popover, anchor, anchor.id !== 'volumePill');
    const range = popover.querySelector('[data-role="range"]');
    const value = popover.querySelector('[data-f="value"]');
    let lastSent = 0;
    const applyVolume = async (next) => {
      const normalized = clamp(Number(next) || 0, 0, 100);
      value.textContent = `${Math.round(normalized)}%`;
      range.style.setProperty('--value', `${Math.round(normalized)}%`);
      updateAudio({ ...S.audio, volume: normalized, muted: false }, false);
      if (S.isDemo) return;
      const now = Date.now();
      if (now - lastSent < 55) return;
      lastSent = now;
      try {
        const response = await api.systemAction('volume', { absolute: normalized });
        if (response?.ok && response.result) updateAudio(response.result, false);
      } catch { /* ignore */ }
    };
    range.addEventListener('input', () => applyVolume(range.value));
    range.addEventListener('change', () => applyVolume(range.value));
    popover.querySelector('[data-role="mute"]').addEventListener('click', async () => {
      if (S.isDemo) {
        updateAudio({ ...S.audio, muted: !S.audio.muted }, true);
      } else {
        const response = await api.systemAction('mute');
        if (response?.ok && response.result) updateAudio(response.result, true);
      }
      const button = popover.querySelector('[data-role="mute"]');
      button.classList.toggle('on', S.audio.muted);
      button.querySelector('span').textContent = S.audio.muted ? '已静音' : '静音';
    });
  }

  function openBrightnessPopover(anchor) {
    closePopover();
    const popover = document.createElement('div');
    popover.className = 'popover';
    popover.innerHTML = `
      <div class="popover-head">
        <div class="popover-title">${icon('sun')}<span>屏幕亮度</span></div>
        <span class="popover-value" data-f="value">${S.brightness.checked ? `${Math.round(S.brightness.value)}%` : '--'}</span>
      </div>
      <div class="popover-slider">
        <span class="slider-icon">${icon('sun')}</span>
        <input class="range" type="range" min="0" max="100" value="${Math.round(S.brightness.value || 0)}" style="--value:${Math.round(S.brightness.value || 0)}%" data-role="range" ${S.brightness.supported ? '' : 'disabled'}>
        <span class="slider-icon">${icon('sun')}</span>
      </div>
      <div class="popover-foot">
        <span class="popover-sub" data-f="note" style="margin:0">${brightnessNote()}</span>
        <button class="ghost-button" data-role="display-settings">显示设置</button>
      </div>
      ${S.brightness.supported ? '' : '<div class="popover-error" data-f="error">当前显示器可能不支持 DDC/CI 亮度控制，仍可尝试滑块。</div>'}
    `;
    ui.popoverRoot.appendChild(popover);
    S.popover = popover;
    S.popoverType = 'brightness';
    positionPopover(popover, anchor, anchor.dataset.quick === 'brightness');
    const range = popover.querySelector('[data-role="range"]');
    const value = popover.querySelector('[data-f="value"]');
    range.addEventListener('input', () => {
      value.textContent = `${Math.round(range.value)}%`;
      range.style.setProperty('--value', `${Math.round(range.value)}%`);
    });
    range.addEventListener('change', async () => {
      const next = Number(range.value);
      S.brightness = { ...S.brightness, value: next };
      if (S.isDemo) {
        S.brightness = { ...S.brightness, supported: true, checked: true };
        toast(`亮度已调整为 ${next}%`, { icon: 'sun' });
        return;
      }
      try {
        const response = await api.systemAction('brightness', { absolute: next });
        if (response?.ok && response.result) {
          S.brightness = response.result;
          updateBrightnessPopover(popover);
        } else if (!response?.ok) {
          throw new Error(response?.error || '设置失败');
        }
      } catch (error) {
        toast(`亮度调整失败：${error.message}`, { icon: 'sun', type: 'error' });
      }
    });
    popover.querySelector('[data-role="display-settings"]').addEventListener('click', () => {
      callSystem('display-settings');
      closePopover();
    });
    if (!S.brightness.checked) refreshBrightness(popover);
  }

  async function refreshBrightness(popover) {
    if (S.isDemo) {
      S.brightness = { supported: true, checked: true, value: 68, source: 'ddc' };
      updateBrightnessPopover(popover);
      return;
    }
    try {
      const response = await api.systemAction('brightness');
      if (response?.ok && response.result) {
        S.brightness = response.result;
        updateBrightnessPopover(popover);
      }
    } catch {
      S.brightness = { ...S.brightness, checked: true, supported: false };
      updateBrightnessPopover(popover);
    }
  }

  function updateBrightnessPopover(popover) {
    if (!popover || !popover.isConnected) return;
    const value = popover.querySelector('[data-f="value"]');
    const range = popover.querySelector('[data-role="range"]');
    const note = popover.querySelector('[data-f="note"]');
    const error = popover.querySelector('[data-f="error"]');
    if (value) value.textContent = S.brightness.supported ? `${Math.round(S.brightness.value)}%` : '--';
    if (range) {
      range.disabled = !S.brightness.supported;
      range.value = Math.round(S.brightness.value || 0);
      range.style.setProperty('--value', `${Math.round(S.brightness.value || 0)}%`);
    }
    if (note) note.textContent = brightnessNote();
    if (error) {
      error.textContent = S.brightness.error || '当前显示器不支持 DDC/CI 亮度控制';
      error.hidden = Boolean(S.brightness.supported);
    }
  }

  function brightnessNote() {
    if (!S.brightness.checked) return '正在检测…';
    if (!S.brightness.supported) return 'DDC/CI 不可用';
    if (S.brightness.source === 'internal') return '内置显示器';
    return S.brightness.description || '外接显示器 · DDC/CI';
  }

  function openNetworkPopover(anchor) {
    closePopover();
    const network = S.metrics?.network || {};
    const rx = formatRate(network.rxSec || 0);
    const tx = formatRate(network.txSec || 0);
    const popover = document.createElement('div');
    popover.className = 'popover';
    popover.innerHTML = `
      <div class="popover-head">
        <div class="popover-title">${icon(isWifi(network) ? 'wifi' : 'globe')}<span>${escapeHtml(networkLabel(network))}</span></div>
        <span class="popover-value" style="font-size:12px">${network.ip ? escapeHtml(network.ip) : '未连接'}</span>
      </div>
      <div class="net-rates" style="gap:6px">
        <div class="net-row"><span class="net-arrow">${icon('arrowDown')}</span><span class="net-number" style="font-size:19px">${rx.value}</span><span class="net-unit">${rx.unit}</span><span style="flex:1"></span><span class="popover-sub" style="margin:0">下载</span></div>
        <div class="net-row"><span class="net-arrow">${icon('arrowUp')}</span><span class="net-number" style="font-size:19px">${tx.value}</span><span class="net-unit">${tx.unit}</span><span style="flex:1"></span><span class="popover-sub" style="margin:0">上传</span></div>
      </div>
      <div class="popover-foot">
        <span class="popover-sub" style="margin:0">${escapeHtml(network.iface || '')}</span>
        <button class="ghost-button" data-role="network-settings">网络设置</button>
      </div>
    `;
    ui.popoverRoot.appendChild(popover);
    S.popover = popover;
    S.popoverType = 'network';
    positionPopover(popover, anchor, false);
    popover.querySelector('[data-role="network-settings"]').addEventListener('click', () => {
      callSystem('network-settings');
      closePopover();
    });
  }

  function onDocumentPointerDown(event) {
    if (!S.popover) return;
    if (S.popover.contains(event.target)) return;
    if (event.target.closest('#volumePill') || event.target.closest('#networkPill') || event.target.closest('[data-quick="volume"]') || event.target.closest('[data-quick="brightness"]')) return;
    closePopover();
  }

  function updateAudio(audio, showToastFlag) {
    if (!audio) return;
    const previousMuted = S.audio?.muted;
    S.audio = { ...S.audio, ...audio };
    if (S.quickState) S.quickState.audio = { ...S.audio };
    updateVolumeUI();
    updateSystemFields();
    if (S.controlModal?.type === 'volume') updateControlModal();
    if (S.popoverType === 'volume' && S.popover) {
      const value = S.popover.querySelector('[data-f="value"]');
      const range = S.popover.querySelector('[data-role="range"]');
      if (document.activeElement !== range) {
        if (value) value.textContent = S.audio.muted ? '静音' : `${Math.round(S.audio.volume)}%`;
        if (range) {
          range.value = Math.round(S.audio.volume);
          range.style.setProperty('--value', `${Math.round(S.audio.volume)}%`);
        }
        const muteButton = S.popover.querySelector('[data-role="mute"]');
        if (muteButton) {
          muteButton.classList.toggle('on', S.audio.muted);
          muteButton.querySelector('span').textContent = S.audio.muted ? '已静音' : '静音';
        }
      }
    }
    if (showToastFlag && previousMuted !== S.audio.muted) {
      toast(S.audio.muted ? '已静音' : '已取消静音', { icon: S.audio.muted ? 'mute' : 'volume' });
    }
  }

  function updateSystemFields() {
    for (const { node, widget } of S.widgetNodes.values()) {
      if (widget.kind === 'system') updateSystem(node);
    }
  }

  /* ------------------------------------------------------------------ */
  /* actions                                                             */
  /* ------------------------------------------------------------------ */

  async function callSystem(action, payload) {
    if (S.isDemo) {
      toast('预览模式下不会执行系统操作', { icon: 'info' });
      return { ok: true, result: {} };
    }
    try {
      return await api.systemAction(action, payload);
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  function openQuickSettings(action) {
    pokeCursor();
    if (S.isDemo) {
      toast(`预览：打开 ${action} 系统设置`, { icon: 'gear' });
      return;
    }
    api?.systemAction('open-quick-settings', { kind: action });
  }

  async function runQuickAction(action, anchor) {
    const definition = S.quickCatalog.find((item) => item.id === action) || DEMO_QUICK.find((item) => item.id === action);
    if (action === 'wifi' || action === 'bluetooth') {
      if (S.isDemo) {
        toast(`预览：切换 ${action === 'wifi' ? 'Wi-Fi' : '蓝牙'}`, { icon: action });
        return;
      }
      const response = await callSystem('quick-toggle', { kind: action });
      if (response?.ok && response.result) {
        S.quickState = {
          ...S.quickState,
          wifi: action === 'wifi' ? response.result.wifi : S.quickState?.wifi,
          bluetooth: action === 'bluetooth' ? response.result.bluetooth : S.quickState?.bluetooth,
        };
        updateQuickState();
        toast(`${action === 'wifi' ? 'Wi-Fi' : '蓝牙'}已${action === 'wifi' ? (response.result.wifi ? '开启' : '关闭') : (response.result.bluetooth ? '开启' : '关闭')}`, { icon: action });
      } else {
        toast(`切换失败：${response?.error || '系统拒绝'}`, { icon: action, type: 'error' });
      }
      return;
    }
    switch (action) {
      case 'volume':
        openControlModal('volume');
        return;
      case 'brightness':
        openControlModal('brightness');
        return;
      case 'mute': {
        if (!S.isDemo) {
          const response = await api.systemAction('mute');
          if (response?.ok && response.result) {
            updateAudio(response.result, true);
            if (S.quickState) {
              S.quickState.audio = { ...response.result };
              updateQuickState();
            }
          }
        } else {
          updateAudio({ ...S.audio, muted: !S.audio.muted }, true);
        }
        return;
      }
      case 'screenshot': {
        toast('正在截取副屏…', { icon: 'camera', duration: 1500 });
        const response = await callSystem('screenshot');
        if (response?.ok && response.result?.path) {
          toast('截图已保存，点击查看', {
            icon: 'camera',
            type: 'success',
            duration: 4000,
            onClick: () => api?.showInFolder(response.result.path),
          });
        } else {
          toast(`截图失败：${response?.error || '未知错误'}`, { icon: 'camera', type: 'error' });
        }
        return;
      }
      case 'settings':
        openSettings();
        return;
      case 'playpause':
      case 'next':
      case 'prev':
        sendMedia(action === 'playpause' ? 'playpause' : action === 'prev' ? 'previous' : action);
        return;
      case 'sleep':
        confirmAction({
          title: '进入睡眠？',
          copy: '副屏仪表盘会暂时熄灭，唤醒后自动恢复。',
          confirmLabel: '睡眠',
          onConfirm: () => callSystem('sleep'),
        });
        return;
      case 'lock':
        callSystem('lock');
        return;
      case 'taskmgr':
        callSystem(action);
        return;
      default:
        if (definition) callSystem(action);
    }
  }

  async function launchShortcut(id) {
    const shortcut = (S.config.shortcuts || []).find((item) => item.id === id);
    if (!shortcut) return;
    if (S.isDemo) {
      toast(`预览：启动 ${shortcut.label}`, { icon: shortcut.icon || 'grid' });
      return;
    }
    const response = await callSystem('launch', { target: shortcut.target, args: shortcut.args });
    if (!response?.ok) toast(`启动失败：${response?.error || shortcut.label}`, { icon: 'grid', type: 'error' });
  }

  function confirmAction({ title, copy, confirmLabel = '确定', danger = false, onConfirm }) {
    closePopover();
    const wrapper = document.createElement('div');
    wrapper.className = 'modal';
    wrapper.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true">
        <div class="modal-title">${escapeHtml(title)}</div>
        <div class="modal-copy">${escapeHtml(copy)}</div>
        <div class="modal-actions">
          <button class="modal-button" data-role="cancel">取消</button>
          <button class="modal-button ${danger ? 'danger' : 'primary'}" data-role="ok">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    ui.modalRoot.appendChild(wrapper);
    const close = () => { wrapper.remove(); pokeCursor(); };
    wrapper.querySelector('[data-role="cancel"]').addEventListener('click', close);
    wrapper.querySelector('[data-role="ok"]').addEventListener('click', () => {
      close();
      onConfirm?.();
    });
    wrapper.addEventListener('click', (event) => {
      if (event.target === wrapper) close();
    });
    wrapper._close = close;
  }

  function toast(message, options = {}) {
    if (!ui.toastRoot) return;
    while (ui.toastRoot.children.length >= 3) ui.toastRoot.firstElementChild.remove();
    const node = document.createElement('div');
    node.className = `toast ${options.type || ''} ${options.onClick ? 'clickable' : ''}`;
    node.innerHTML = `${icon(options.icon || 'info')}<span>${escapeHtml(message)}</span>`;
    if (options.onClick) node.addEventListener('click', options.onClick);
    ui.toastRoot.appendChild(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translateY(4px)';
      node.style.transition = 'opacity .25s ease, transform .25s ease';
      setTimeout(() => node.remove(), 280);
    }, options.duration || 2600);
  }

  /* ------------------------------------------------------------------ */
  /* immersive focus                                                     */
  /* ------------------------------------------------------------------ */

  function openFocus() {
    if (!S.media?.hasSession) return;
    closePopover();
    S.focusOpen = true;
    renderFocus();
    pokeCursor();
  }

  function closeFocus() {
    S.focusOpen = false;
    ui.focusRoot.innerHTML = '';
    pokeCursor();
  }

  function renderFocus() {
    if (!S.focusOpen) return;
    const media = S.media || { hasSession: false };
    const cover = S.cover;
    const existing = $('.focus');
    if (existing) {
      updateFocusFields(existing);
      fillFocusLyrics(existing);
      return;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'focus';
    wrapper.style.setProperty('--focus-image', cover ? `url("${cover}")` : 'none');
    wrapper.innerHTML = `
      <div class="focus-bg"></div>
      <div class="focus-veil"></div>
      <div class="focus-grain"></div>
      <div class="focus-top">
        <div class="focus-label"><span class="brand-mark">${icon('logo')}</span><span>NOW PLAYING</span></div>
        <button class="focus-close" data-role="close" title="退出沉浸歌词" aria-label="退出沉浸歌词">${icon('x')}</button>
      </div>
      <div class="focus-content">
        <aside class="focus-side">
          <div class="focus-cover">
            <div class="focus-cover-placeholder">${icon('music')}</div>
            <img alt="专辑封面">
          </div>
          <div class="focus-track">
            <div class="focus-source" data-f="source">${icon('music')} 系统媒体</div>
            <h1 class="focus-title" data-f="title">暂无正在播放</h1>
            <div class="focus-artist" data-f="artist"></div>
          </div>
          <div class="focus-progress">
            <span class="time" data-f="pos" style="width:27px;text-align:center">0:00</span>
            <div class="progress-track" data-progress>
              <span class="progress-fill" data-f="fill"></span>
              <span class="progress-knob" data-f="knob"></span>
            </div>
            <span class="time" data-f="dur" style="width:27px;text-align:right">0:00</span>
          </div>
          <div class="focus-controls">
            <button class="focus-btn" data-control="previous" title="上一首">${icon('prev')}</button>
            <button class="focus-btn play" data-control="playpause" title="播放/暂停">${icon('pause')}</button>
            <button class="focus-btn" data-control="next" title="下一首">${icon('next')}</button>
          </div>
        </aside>
        <section class="focus-lyrics">
          <div class="focus-lyrics-head">LYRICS</div>
          <div class="focus-roll" data-f="roll"></div>
          <div class="focus-empty" data-f="empty" hidden></div>
        </section>
      </div>
    `;
    ui.focusRoot.appendChild(wrapper);
    wrapper.querySelector('[data-role="close"]').addEventListener('click', closeFocus);
    wrapper.querySelectorAll('[data-control]').forEach((button) => {
      button.addEventListener('click', () => sendMedia(button.dataset.control));
    });
    wrapper.querySelector('[data-progress]').addEventListener('click', (event) => {
      seekFromEvent(event, event.currentTarget);
    });
    updateFocusFields(wrapper);
    fillFocusLyrics(wrapper);
    updateProgress();
    pokeCursor();
  }

  function updateFocusFields(wrapper) {
    const media = S.media || {};
    const source = wrapper.querySelector('[data-f="source"]');
    if (source) source.innerHTML = `${icon('music')} ${escapeHtml(media.playerName || '系统媒体')}`;
    setText(wrapper, '[data-f="title"]', media.title || '暂无正在播放');
    setText(wrapper, '[data-f="artist"]', media.artist || '');
    const play = wrapper.querySelector('[data-control="playpause"]');
    if (play) play.innerHTML = icon(media.status === 'Playing' ? 'pause' : 'play');
    const previous = wrapper.querySelector('[data-control="previous"]');
    const next = wrapper.querySelector('[data-control="next"]');
    if (previous) previous.disabled = !media.canPrevious;
    if (next) next.disabled = !media.canNext;
    const image = wrapper.querySelector('.focus-cover img');
    const coverBox = wrapper.querySelector('.focus-cover');
    if (coverBox) coverBox.classList.toggle('has-image', Boolean(S.cover));
    if (image) {
      if (S.cover) {
        image.src = S.cover;
        image.style.opacity = '1';
      } else {
        image.removeAttribute('src');
        image.style.opacity = '0';
      }
    }
    wrapper.style.setProperty('--focus-image', S.cover ? `url("${S.cover}")` : 'none');
  }

  function fillFocusLyrics(wrapper) {
    if (!wrapper) return;
    const roll = wrapper.querySelector('[data-f="roll"]');
    const empty = wrapper.querySelector('[data-f="empty"]');
    if (!roll || !empty) return;
    const lyrics = S.lyrics;
    const media = S.media || {};
    if (!media.hasSession) {
      roll.hidden = true;
      empty.hidden = false;
      empty.textContent = '等待音乐开始';
      return;
    }
    if (!S.config.media.lyricsEnabled) {
      roll.hidden = true;
      empty.hidden = false;
      empty.textContent = '歌词已关闭';
      return;
    }
    if (!lyrics?.lines?.length && !lyrics?.plainLines?.length && lyrics?.pending) {
      roll.hidden = true;
      empty.hidden = false;
      empty.textContent = '正在匹配歌词…';
      return;
    }
    if (!lyrics?.lines?.length) {
      roll.hidden = true;
      empty.hidden = false;
      empty.textContent = lyrics?.plainLines?.length ? lyrics.plainLines.slice(0, 4).join('\n') : (lyrics?.instrumental ? '纯音乐，请慢慢欣赏' : '未找到歌词');
      if (lyrics?.plainLines?.length) empty.style.whiteSpace = 'pre-line';
      return;
    }
    empty.hidden = true;
    roll.hidden = false;
    const wordCount = lyrics.lines.reduce((count, line) => count + (line.words?.length || 0), 0);
    const translationCount = lyrics.lines.reduce((count, line) => count + (line.translation ? 1 : 0), 0);
    const signature = `${lyrics.trackKey}|${lyrics.lines.length}|${S.config.media.showTranslation}|${wordCount}|${translationCount}`;
    if (roll.dataset.signature === signature) {
      updateFocusLyricsActive(true);
      return;
    }
    roll.dataset.signature = signature;
    roll.innerHTML = lyrics.lines.map((line, index) => {
      const translation = S.config.media.showTranslation && line.translation
        ? `<div class="focus-trans">${escapeHtml(line.translation)}</div>`
        : '';
      const text = line.words?.length
        ? line.words.map((word) => `<span class="focus-word" data-time="${word.time}">${escapeHtml(word.text)}</span>`).join('')
        : escapeHtml(line.text);
      return `<div class="focus-line" data-time="${line.time}" data-index="${index}"><div class="focus-text">${text}</div>${translation}</div>`;
    }).join('');
    S.activeLyricIndex = -2;
    requestAnimationFrame(() => updateFocusLyricsActive(true));
  }

  function updateFocusLyricsActive(force = false) {
    if (!S.focusOpen) return;
    const wrapper = $('.focus');
    if (!wrapper) return;
    const roll = wrapper.querySelector('[data-f="roll"]');
    const container = wrapper.querySelector('.focus-lyrics');
    if (!roll || !container || roll.hidden || !S.lyrics?.lines?.length) return;
    const seconds = getLyricTimeSeconds();
    const active = findActiveLyric(seconds);
    if (!force && active === S.activeLyricIndex && wrapper.dataset.active === String(active)) {
      updateKaraoke(seconds);
      return;
    }
    wrapper.dataset.active = String(active);
    const lines = [...roll.querySelectorAll('.focus-line')];
    lines.forEach((line, index) => {
      line.classList.toggle('active', index === active);
      line.classList.toggle('past', index === active - 1);
      line.classList.toggle('past-far', index < active - 1);
      line.classList.toggle('future', index > active);
      line.classList.toggle('upcoming', active < 0 ? index === 0 : index === active + 1);
    });
    const centerOn = () => {
      if (!roll.isConnected) return;
      const height = container.clientHeight;
      const anchor = height * 0.45;
      if (active < 0) {
        const first = lines[0];
        if (first) {
          const center = first.offsetTop + first.offsetHeight / 2;
          roll.style.transform = `translateY(${Math.round(anchor - center)}px)`;
        } else {
          roll.style.transform = 'translateY(42px)';
        }
        return;
      }
      const target = lines[active];
      if (!target) return;
      const center = target.offsetTop + target.offsetHeight / 2;
      roll.style.transform = `translateY(${Math.round(anchor - center)}px)`;
    };
    requestAnimationFrame(centerOn);
    updateKaraoke(seconds);
  }

  /* ------------------------------------------------------------------ */
  /* edit mode                                                           */
  /* ------------------------------------------------------------------ */

  function setEditMode(enabled) {
    if (enabled && S.focusOpen) closeFocus();
    closePopover();
    S.editMode = Boolean(enabled);
    clearTimeout(S.mediaIdleTimer);
    S.mediaIdleTimer = null;
    if (S.editMode) S.mediaIdle = false;
    ui.app.classList.toggle('editing', S.editMode);
    ui.toolbar.hidden = !S.editMode;
    ui.editButton.classList.toggle('active', S.editMode);
    ui.editButton.title = S.editMode ? '结束布局编辑' : '编辑小组件布局';
    renderWidgets();
    if (!S.editMode) scheduleMediaIdle();
    pokeCursor();
  }

  function attachEditLayer(node, widget) {
    const layer = document.createElement('div');
    layer.className = 'edit-layer';
    layer.innerHTML = `
      <span class="edit-drag-hint">${icon('drag')}</span>
      ${['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((direction) => (
        `<span class="edit-resize ${direction}" data-resize="${direction}" aria-hidden="true"></span>`
      )).join('')}
    `;
    node.appendChild(layer);
    layer.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const direction = event.target.closest('[data-resize]')?.dataset.resize || '';
      startLayoutGesture(node, widget, direction, event);
    });
  }

  function startLayoutGesture(node, widget, direction, event) {
    const grid = ui.grid;
    const rect = grid.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(grid).gap) || 8;
    const cols = S.config.layout.cols || 12;
    const rows = S.config.layout.rows || 8;
    const cellW = (rect.width - gap * (cols - 1)) / cols;
    const cellH = (rect.height - gap * (rows - 1)) / rows;
    const start = { x: event.clientX, y: event.clientY, widget: { ...widget } };
    let current = { ...widget };
    let moved = false;
    const catalog = S.catalog.find((item) => item.kind === widget.kind);
    const minW = catalog?.minW || 2;
    const minH = catalog?.minH || 1;
    node.classList.add('edit-dragging');
    const onMove = (moveEvent) => {
      const dx = Math.round((moveEvent.clientX - start.x) / (cellW + gap));
      const dy = Math.round((moveEvent.clientY - start.y) / (cellH + gap));
      if (dx !== 0 || dy !== 0) moved = true;
      if (direction) {
        const base = start.widget;
        let x = base.x;
        let y = base.y;
        let w = base.w;
        let h = base.h;
        if (direction.includes('e')) {
          w = clamp(base.w + dx, minW, cols - base.x);
        }
        if (direction.includes('s')) {
          h = clamp(base.h + dy, minH, rows - base.y);
        }
        if (direction.includes('w')) {
          w = base.w - dx;
          x = base.x + dx;
          if (w < minW) {
            w = minW;
            x = base.x + base.w - minW;
          }
          if (x < 0) {
            x = 0;
            w = base.x + base.w;
          }
        }
        if (direction.includes('n')) {
          h = base.h - dy;
          y = base.y + dy;
          if (h < minH) {
            h = minH;
            y = base.y + base.h - minH;
          }
          if (y < 0) {
            y = 0;
            h = base.y + base.h;
          }
        }
        current = { ...base, x, y, w, h };
      } else {
        current.x = clamp(start.widget.x + dx, 0, cols - start.widget.w);
        current.y = clamp(start.widget.y + dy, 0, rows - start.widget.h);
      }
      node.style.gridColumn = `${current.x + 1} / span ${current.w}`;
      node.style.gridRow = `${current.y + 1} / span ${current.h}`;
      node.classList.toggle('edit-invalid', hasOverlap(current, widget.id));
    };
    const onUp = async () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      node.classList.remove('edit-dragging', 'edit-invalid');
      if (!moved) return;
      if (hasOverlap(current, widget.id)) {
        node.style.gridColumn = `${widget.x + 1} / span ${widget.w}`;
        node.style.gridRow = `${widget.y + 1} / span ${widget.h}`;
        toast('这里已经有小组件了', { icon: 'layout', type: 'error' });
        return;
      }
      const widgets = (S.config.layout.widgets || []).map((item) => (
        item.id === widget.id ? { ...item, x: current.x, y: current.y, w: current.w, h: current.h } : item
      ));
      if (S.isDemo) {
        S.config.layout.widgets = widgets;
        renderWidgets();
        return;
      }
      try {
        const config = await api.updateConfig({ layout: { widgets } });
        S.config = config;
        renderWidgets();
      } catch (error) {
        toast(`保存布局失败：${error.message}`, { icon: 'layout', type: 'error' });
        renderWidgets();
      }
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function hasOverlap(candidate, ignoreId) {
    const widgets = (S.config.layout.widgets || []).filter((widget) => widget.enabled && widget.id !== ignoreId);
    return widgets.some((widget) => (
      candidate.x < widget.x + widget.w &&
      candidate.x + candidate.w > widget.x &&
      candidate.y < widget.y + widget.h &&
      candidate.y + candidate.h > widget.y
    ));
  }

  function resetLayout() {
    confirmAction({
      title: '恢复默认布局？',
      copy: '当前所有小组件的位置和尺寸会被重置，组件开关和外观设置保持不变。',
      confirmLabel: '恢复布局',
      onConfirm: async () => {
        const defaults = S.boot?.defaultLayout || DEFAULT_WIDGETS;
        const widgets = defaults.map((widget) => ({ ...widget }));
        if (S.isDemo) {
          S.config.layout.widgets = widgets;
          renderWidgets();
          return;
        }
        try {
          const config = await api.updateConfig({ layout: { widgets } });
          S.config = config;
          renderWidgets();
          toast('布局已恢复', { icon: 'check', type: 'success' });
        } catch (error) {
          toast(`恢复布局失败：${error.message}`, { icon: 'layout', type: 'error' });
        }
      },
    });
  }

  /* ------------------------------------------------------------------ */
  /* keyboard / cursor                                                   */
  /* ------------------------------------------------------------------ */

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      if (S.editMode) {
        setEditMode(false);
        return;
      }
      if (S.popover) {
        closePopover();
        return;
      }
      const modal = $('.modal');
      if (modal) {
        modal._close?.();
        return;
      }
      if (S.focusOpen) closeFocus();
      return;
    }
    if (event.key === 'f' && !event.ctrlKey && !event.altKey && S.focusOpen === false && document.activeElement?.tagName !== 'INPUT') {
      // reserved for future shortcuts
    }
  }

  function pokeCursor() {
    if (!S.config) return;
    document.body.classList.remove('cursor-hidden');
    clearTimeout(S.cursorTimer);
    if (!S.config.display.hideCursor) return;
    if (S.editMode || S.focusOpen || S.popover || $('.modal')) return;
    S.cursorTimer = setTimeout(() => {
      if (!S.editMode && !S.focusOpen && !S.popover && !$('.modal')) {
        document.body.classList.add('cursor-hidden');
      }
    }, 2800);
  }

  /* ------------------------------------------------------------------ */
  /* helper functions                                                    */
  /* ------------------------------------------------------------------ */

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));
  }

  /* ------------------------------------------------------------------ */
  /* demo preview                                                        */
  /* ------------------------------------------------------------------ */

  function buildDemo() {
    const now = new Date();
    const demoCpu = 34;
    const demoGpu = 21;
    const demoRam = 57;
    const history = {
      cpu: Array.from({ length: 32 }, (_, index) => 26 + Math.sin(index / 3) * 9 + (index % 7) * 1.6),
      gpu: Array.from({ length: 32 }, (_, index) => 14 + Math.sin(index / 4 + 1) * 10 + (index % 5) * 2),
      ram: Array.from({ length: 32 }, (_, index) => 54 + Math.sin(index / 5) * 2.5),
      rx: Array.from({ length: 32 }, (_, index) => 8000 + Math.max(0, Math.sin(index / 2.7)) * 43000 + (index % 4) * 1200),
      tx: Array.from({ length: 32 }, (_, index) => 600 + Math.max(0, Math.cos(index / 4)) * 3200),
      power: Array.from({ length: 32 }, (_, index) => 42 + Math.sin(index / 3.2) * 12),
    };
    const metrics = {
      ts: Date.now(),
      cpu: { load: demoCpu, temp: 63, power: 47.8, name: 'Intel Core i7-13645HX', cores: 20, speed: 2600 },
      gpu: { name: 'NVIDIA GeForce RTX 5050 Laptop GPU', load: demoGpu, temp: 57, power: 19.4, memoryUsed: 1638, memoryTotal: 8151, available: true },
      ram: { used: 9.72 * 1024 ** 3, total: 16 * 1024 ** 3, percent: demoRam },
      power: { cpu: 47.8, gpu: 19.4, total: 67.2 },
      network: { rxSec: 48500, txSec: 3200, iface: 'WLAN', ip: '192.168.1.102', ssid: 'Aurora 5G', type: 'wifi', signal: 86, connected: true },
      disk: {
        readSec: 1.2 * 1024 ** 2,
        writeSec: 240 * 1024,
        volumes: [
          { mount: 'C:', total: 200 * 1024 ** 3, used: 112 * 1024 ** 3, free: 88 * 1024 ** 3, percent: 56 },
          { mount: 'D:', total: 280 * 1024 ** 3, used: 221 * 1024 ** 3, free: 59 * 1024 ** 3, percent: 79 },
        ],
      },
      battery: { hasBattery: true, percent: 86, charging: false, ac: true, timeRemaining: null },
      system: { uptime: 2 * 3600 + 46 * 60, hostname: 'PAPERLAPTOP', os: 'Windows 11' },
      history,
    };
    const media = {
      hasSession: true,
      appId: 'AppleInc.AppleMusicWin_nzyj5cx40ttqa!App',
      playerName: 'Apple Music',
      title: '3 Strikes',
      artist: 'Terror Jr',
      album: '3 Strikes',
      status: 'Playing',
      positionMs: 38900,
      startMs: 0,
      endMs: 176000,
      canPlayPause: true,
      canNext: true,
      canPrevious: true,
      canSeek: true,
      cover: '../../assets/demo-3strikes.jpg',
      updatedAt: Date.now(),
    };
    const lyrics = {
      ...DEMO_LYRICS,
      trackKey: '3 strikes|terror jr|3 strikes',
      pending: false,
      providers: ['lrclib'],
    };
    const config = {
      version: 1,
      display: {
        targetId: null, mode: 'fullscreen', alwaysOnTop: false, preventSleep: true,
        hideCursor: true, launchAtLogin: false, refreshMs: 1000,
      },
      appearance: {
        theme: 'light', background: 'aurora', backgroundSolid: '#eaf3ff', gradientFrom: '#e8f4ff', gradientTo: '#f7ecff', gradientAngle: 135,
        accent: '#1687ff', accent2: '#7c5cff',
        blur: 26, opacity: 0.58, radius: 22, padding: 12, gap: 8, fontScale: 1, touchScale: 1.12,
        safeTop: 0, safeRight: 0, safeBottom: 0, safeLeft: 0,
        albumTint: true, animations: true, noise: true, showHeader: true, editorGrid: true,
      },
      layout: { cols: 12, rows: 8, widgets: DEFAULT_WIDGETS.map((widget) => ({ ...widget })) },
      media: {
        preferredPlayer: 'auto', lyricsEnabled: true, providers: ['lrclib', 'netease', 'qq', 'kugou'],
        preferLocalLyrics: true, localLyricsDir: '', autoHide: true,
        offsetMs: 0, showTranslation: true, showCover: true, autoFocus: false, lyricFontScale: 1,
      },
      quick: { actions: ['wifi', 'bluetooth', 'volume', 'brightness', 'mute', 'screenshot', 'lock', 'settings'] },
      shortcuts: [
        { id: 'explorer', label: '资源管理器', icon: 'folder', target: 'explorer.exe', args: '' },
        { id: 'edge', label: '浏览器', icon: 'globe', target: 'msedge.exe', args: '' },
        { id: 'taskmgr', label: '任务管理器', icon: 'activity', target: 'taskmgr.exe', args: '' },
        { id: 'terminal', label: '终端', icon: 'terminal', target: 'wt.exe', args: '' },
      ],
      system: { temperatureUnit: 'C', firstDayOfWeek: 1, showSeconds: false, screenshotDir: '', hardwareAcceleration: true },
    };
    return {
      config,
      version: '1.0.0-preview',
      isPackaged: false,
      platform: 'win32',
      displays: null,
      metrics,
      media,
      lyrics,
      bluetooth: [
        { name: 'Redmi Buds 6S', address: '90EF4A867F9E', battery: 82, connected: true },
        { name: 'EWEADN E11', address: '414235DAA817', battery: null, connected: true },
      ],
      quickState: {
        wifi: true,
        bluetooth: true,
        audio: { volume: 42, muted: false, available: true },
        brightness: { supported: true, checked: true, value: 68 },
      },
      audio: { volume: 42, muted: false, available: true },
      brightness: { supported: true, checked: true, value: 68, source: 'ddc', description: 'Demo Display' },
      catalog: [],
      quickActions: DEMO_QUICK,
      providers: [],
      defaultLayout: DEFAULT_WIDGETS,
      userData: '',
    };
  }

  function startDemoAnimation() {
    const tick = () => {
      if (!S.metrics) return;
      const history = S.metrics.history;
      const cpu = clamp((S.metrics.cpu.load || 30) + (Math.random() - 0.5) * 7, 8, 88);
      const gpu = clamp((S.metrics.gpu.load || 20) + (Math.random() - 0.5) * 9, 3, 85);
      const ram = clamp((S.metrics.ram.percent || 57) + (Math.random() - 0.5) * 0.7, 42, 78);
      S.metrics.cpu.load = Math.round(cpu * 10) / 10;
      S.metrics.gpu.load = Math.round(gpu * 10) / 10;
      S.metrics.cpu.power = Math.round((28 + cpu * 0.52) * 10) / 10;
      S.metrics.gpu.power = Math.round((9 + gpu * 0.45) * 10) / 10;
      S.metrics.power = { cpu: S.metrics.cpu.power, gpu: S.metrics.gpu.power, total: Math.round((S.metrics.cpu.power + S.metrics.gpu.power) * 10) / 10 };
      S.metrics.ram.percent = Math.round(ram * 10) / 10;
      S.metrics.ram.used = (ram / 100) * S.metrics.ram.total;
      S.metrics.network.rxSec = Math.round(8000 + Math.random() * 52000);
      S.metrics.network.txSec = Math.round(500 + Math.random() * 6000);
      [['cpu', cpu], ['gpu', gpu], ['ram', ram]].forEach(([key, value]) => {
        history[key].push(Math.round(value * 10) / 10);
        if (history[key].length > 60) history[key].shift();
      });
      history.rx.push(S.metrics.network.rxSec);
      if (history.rx.length > 60) history.rx.shift();
      history.tx.push(S.metrics.network.txSec);
      if (history.tx.length > 60) history.tx.shift();
      history.power.push(S.metrics.power.total);
      if (history.power.length > 60) history.power.shift();
      updateAllWidgets();
      updateTopbar();
    };
    setInterval(tick, 1000);
    setInterval(() => {
      if (S.media?.status === 'Playing') {
        // playback interpolation handles the position; occasionally correct it.
      }
    }, 1000);
  }

  init();
})();
