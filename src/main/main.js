'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage,
  powerSaveBlocker, session, shell, dialog,
} = require('electron');
const { ConfigStore, DEFAULT_CONFIG } = require('./config');
const { MetricsService } = require('./metrics');
const { MediaService } = require('./media');
const { LyricsService } = require('./lyrics');
const { BluetoothService } = require('./bluetooth');
const { ActionService } = require('./actions');
const { WIDGET_CATALOG, QUICK_ACTIONS, PROVIDERS } = require('./catalog');
const { assetPath } = require('./paths');

app.setAppUserModelId('com.paperdeck.desktop');

function readStartupConfig() {
  try {
    const userData = app.getPath('userData');
    return JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'));
  } catch {
    try {
      const fallback = path.join(process.env.APPDATA || '', 'PaperDeck', 'config.json');
      return JSON.parse(fs.readFileSync(fallback, 'utf8'));
    } catch {
      return {};
    }
  }
}

const startupConfig = readStartupConfig();
if (startupConfig?.system?.hardwareAcceleration === false) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-accelerated-video-decode');
} else {
  app.commandLine.appendSwitch('enable-accelerated-video-decode');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
}

process.on('unhandledRejection', (error) => {
  console.error('[paperdeck] unhandled rejection', error);
});

let configStore;
let metrics;
let media;
let lyrics;
let bluetooth;
let actions;
let displayWindow = null;
let settingsWindow = null;
let tray = null;
let currentDisplay = null;
let sleepBlockerId = null;
let quitting = false;
let lyricsRequestId = 0;
let currentLyrics = null;
let currentLyricsTrackKey = '';
let quickState = null;
let quickStateTimer = null;
const lyricTimers = new Map();

function updateTrayTooltip() {
  if (!tray) return;
  try {
    if (!currentDisplay) {
      tray.setToolTip('PaperDeck-未连接副屏');
      return;
    }
    const config = configStore.get();
    const primaryId = screen.getPrimaryDisplay().id;
    const displays = screen.getAllDisplays();
    const index = displays.findIndex((display) => display.id === currentDisplay.id);
    const bounds = currentDisplay.bounds;
    const nativeName = String(currentDisplay.label || '').trim();
    const displayName = nativeName && !nativeName.startsWith('\\\\.\\')
      ? nativeName
      : `显示器 ${index + 1}`;
    const resolution = `${bounds.width}×${bounds.height}`;
    const isPrimaryPreview = currentDisplay.id === primaryId && !config.display.targetId;
    const stateLabel = isPrimaryPreview ? '主屏预览' : '已连接副屏';
    tray.setToolTip(`PaperDeck-${stateLabel}（${displayName} ${resolution}）`);
  } catch {
    /* tray can be in a transient state */
  }
}

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      try { win.webContents.send(channel, payload); } catch { /* window disposing */ }
    }
  }
}

function displayLabel(display, index, primary = false) {
  const bounds = `${display.bounds.width} × ${display.bounds.height}`;
  return `${primary ? '主屏' : `显示器 ${index + 1}`} · ${bounds}${display.internal ? ' · 内置' : ''}`;
}

function displayPayload() {
  const primaryId = screen.getPrimaryDisplay().id;
  const displays = screen.getAllDisplays().map((display, index) => ({
    id: display.id,
    label: displayLabel(display, index, display.id === primaryId),
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
    primary: display.id === primaryId,
    internal: display.internal,
    rotation: display.rotation,
  }));
  return {
    displays,
    targetId: currentDisplay?.id ?? null,
    mode: configStore.get().display.mode,
    bounds: currentDisplay?.bounds || null,
    workArea: currentDisplay?.workArea || null,
  };
}

function pickDisplay(preferredId) {
  const displays = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;
  if (preferredId !== null && preferredId !== undefined) {
    const exact = displays.find((display) => String(display.id) === String(preferredId));
    if (exact) return exact;
  }
  const secondary = displays.filter((display) => display.id !== primaryId);
  const ideal = secondary.find((display) =>
    display.bounds.width === 798 && display.bounds.height === 480);
  if (ideal) return ideal;
  if (secondary.length) return secondary[0];
  return screen.getPrimaryDisplay();
}

function displayBoundsFor(display, mode) {
  const config = configStore.get();
  const primaryId = screen.getPrimaryDisplay().id;
  const isPrimary = display.id === primaryId;
  // Do not take over the primary desktop when the 798x480 companion screen is
  // temporarily disconnected. Instead show a centered preview window.
  if (!config.display.targetId && isPrimary) {
    const workArea = display.workArea;
    const width = Math.min(798, workArea.width - 40);
    const height = Math.min(480, workArea.height - 40);
    return {
      x: Math.round(workArea.x + (workArea.width - width) / 2),
      y: Math.round(workArea.y + (workArea.height - height) / 2),
      width,
      height,
    };
  }
  return mode === 'workarea' ? display.workArea : display.bounds;
}

function applyDisplaySettings() {
  const config = configStore.get();
  currentDisplay = pickDisplay(config.display.targetId);
  if (!displayWindow || displayWindow.isDestroyed()) return;
  const bounds = displayBoundsFor(currentDisplay, config.display.mode);
  try {
    displayWindow.setBounds(bounds, false);
    displayWindow.setAlwaysOnTop(Boolean(config.display.alwaysOnTop), 'normal');
  } catch (error) {
    console.error('[display] apply bounds failed', error);
  }
  applyPowerBlocker(config.display.preventSleep);
  applyLoginItem(config.display.launchAtLogin);
  metrics?.setRefresh(config.display.refreshMs);
  applyDisplayZoom(config);
  broadcast('display:update', displayPayload());
  updateTrayTooltip();
}

function applyPowerBlocker(enabled) {
  try {
    if (enabled) {
      if (sleepBlockerId === null || !powerSaveBlocker.isStarted(sleepBlockerId)) {
        sleepBlockerId = powerSaveBlocker.start('prevent-display-sleep');
      }
    } else if (sleepBlockerId !== null) {
      powerSaveBlocker.stop(sleepBlockerId);
      sleepBlockerId = null;
    }
  } catch { /* optional */ }
}

function applyLoginItem(enabled) {
  try {
    const settings = {
      openAtLogin: Boolean(enabled),
      path: process.execPath,
      args: app.isPackaged ? [] : [path.join(__dirname, '..', '..')],
    };
    app.setLoginItemSettings(settings);
  } catch { /* portable builds may not support this */ }
}

function applyDisplayZoom(config = configStore.get()) {
  if (!displayWindow || displayWindow.isDestroyed()) return;
  const manual = Math.min(1.6, Math.max(0.8, Number(config.appearance.fontScale) || 1));
  let auto = 1;
  if (config.display.autoScale !== false) {
    let bounds = null;
    try {
      bounds = displayBoundsFor(currentDisplay, config.display.mode);
    } catch { /* display may be transitioning */ }
    if (!bounds?.width || !bounds?.height) {
      try { bounds = displayWindow.getContentBounds(); } catch { /* window may be transitioning */ }
    }
    if (bounds?.width && bounds?.height) {
      // The dashboard was designed at 798x480. Scale the whole UI by the
      // largest factor that still fits the actual panel, so 1080p behaves
      // like a physically larger 798x480 screen instead of tiny 1x cards.
      auto = Math.min(bounds.width / 798, bounds.height / 480);
    }
  }
  const factor = Math.min(4, Math.max(0.7, auto * manual));
  try {
    displayWindow.webContents.setZoomFactor(factor);
  } catch { /* webContents may be navigating */ }
}

function createDisplayWindow() {
  const config = configStore.get();
  currentDisplay = pickDisplay(config.display.targetId);
  const bounds = displayBoundsFor(currentDisplay, config.display.mode);
  displayWindow = new BrowserWindow({    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: false,
    backgroundColor: '#edf4ff',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    thickFrame: false,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  displayWindow.setMenu(null);
  displayWindow.setAlwaysOnTop(Boolean(config.display.alwaysOnTop), 'normal');
  displayWindow.loadFile(path.join(__dirname, '..', 'renderer', 'display.html'));
  displayWindow.setSkipTaskbar(true);
  displayWindow.webContents.on('did-finish-load', () => applyDisplayZoom());
  displayWindow.once('ready-to-show', () => {
    if (!displayWindow || displayWindow.isDestroyed()) return;
    displayWindow.setSkipTaskbar(true);
    displayWindow.showInactive();
    displayWindow.setBounds(bounds, false);
    applyDisplayZoom();
  });
  displayWindow.webContents.on('render-process-gone', () => {
    if (!quitting) {
      setTimeout(() => {
        if (!quitting && displayWindow && !displayWindow.isDestroyed()) displayWindow.reload();
      }, 1200);
    }
  });
  displayWindow.on('closed', () => {
    displayWindow = null;
  });
  applyPowerBlocker(config.display.preventSleep);
  applyLoginItem(config.display.launchAtLogin);
}

function recreateDisplayWindow() {
  if (displayWindow && !displayWindow.isDestroyed()) {
    displayWindow.destroy();
    displayWindow = null;
  }
  createDisplayWindow();
}

function openSettings(tab) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
    if (tab) settingsWindow.webContents.send('settings:tab', tab);
    return;
  }
  const primary = screen.getPrimaryDisplay().workArea;
  const width = Math.min(1180, Math.max(960, Math.round(primary.width * 0.72)));
  const height = Math.min(820, Math.max(660, Math.round(primary.height * 0.78)));
  settingsWindow = new BrowserWindow({
    width,
    height,
    x: Math.round(primary.x + (primary.width - width) / 2),
    y: Math.round(primary.y + (primary.height - height) / 2),
    minWidth: 900,
    minHeight: 620,
    show: false,
    frame: false,
    backgroundColor: '#eef4ff',
    title: 'PaperDeck 设置',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  settingsWindow.setMenu(null);
  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
    settingsWindow.focus();
    if (tab) settingsWindow.webContents.send('settings:tab', tab);
  });
  settingsWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      settingsWindow.hide();
    }
  });
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function createTray() {
  const iconPath = assetPath('icon.png');
  let image = nativeImage.createFromPath(iconPath);
  if (!image.isEmpty()) image = image.resize({ width: 20, height: 20 });
  tray = new Tray(image);
  const updateMenu = () => {
    const config = configStore.get();
    const menu = Menu.buildFromTemplate([
      { label: '打开 PaperDeck 设置', click: () => openSettings() },
      { type: 'separator' },
      {
        label: '显示副屏仪表盘',
        type: 'checkbox',
        checked: Boolean(displayWindow && !displayWindow.isDestroyed() && displayWindow.isVisible()),
        click: (item) => {
          if (item.checked) {
            if (!displayWindow || displayWindow.isDestroyed()) createDisplayWindow();
            else displayWindow.showInactive();
          } else if (displayWindow && !displayWindow.isDestroyed()) {
            displayWindow.hide();
          }
        },
      },
      {
        label: '在副屏编辑小组件布局',
        click: () => {
          if (displayWindow && !displayWindow.isDestroyed()) {
            displayWindow.showInactive();
            displayWindow.webContents.send('layout:edit', true);
          } else {
            createDisplayWindow();
          }
        },
      },
      { type: 'separator' },
      {
        label: '始终置顶',
        type: 'checkbox',
        checked: Boolean(config.display.alwaysOnTop),
        click: (item) => updateConfig({ display: { alwaysOnTop: item.checked } }),
      },
      {
        label: '避开 Windows 任务栏',
        type: 'checkbox',
        checked: config.display.mode === 'workarea',
        click: (item) => updateConfig({ display: { mode: item.checked ? 'workarea' : 'fullscreen' } }),
      },
      { type: 'separator' },
      { label: '退出', click: () => { quitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu);
    updateTrayTooltip();
  };
  tray.setToolTip('PaperDeck-正在检测副屏');
  tray.on('double-click', () => openSettings());
  tray.on('click', () => openSettings());
  updateMenu();
  tray._updateMenu = updateMenu;
}

function updateConfig(patch) {
  const before = configStore.snapshot();
  const config = configStore.update(patch || {});
  const displayNeedsUpdate =
    JSON.stringify(before.display) !== JSON.stringify(config.display);
  const appearanceChanged =
    JSON.stringify(before.appearance) !== JSON.stringify(config.appearance);
  const mediaNeedsRefresh =
    JSON.stringify(before.media) !== JSON.stringify(config.media);
  if (displayNeedsUpdate) {
    applyDisplaySettings();
  }
  if (appearanceChanged) {
    applyDisplayZoom(config);
  }
  if (mediaNeedsRefresh) {
    media?.setPreferred(config.media.preferredPlayer || 'auto');
    const providersChanged = JSON.stringify(before.media.providers) !== JSON.stringify(config.media.providers);
    const enabledChanged = before.media.lyricsEnabled !== config.media.lyricsEnabled;
    const localChanged = before.media.preferLocalLyrics !== config.media.preferLocalLyrics
      || before.media.localLyricsDir !== config.media.localLyricsDir;
    const translationChanged = before.media.showTranslation !== config.media.showTranslation;
    if (providersChanged || enabledChanged || localChanged || translationChanged) queueLyrics({ force: true });
  }
  broadcast('config:update', config);
  broadcast('display:update', displayPayload());
  tray?._updateMenu?.();
  return config;
}

function currentMediaTrackKey() {
  const state = media?.getState();
  if (!state || !state.hasSession || !state.title) return '';
  return `${state.title}|${state.artist}|${state.album}`.toLowerCase();
}

function plainNoLyrics(trackKey) {
  return { trackKey, synced: false, lines: [], plainLines: [], source: '', pending: false };
}

async function queueLyrics(options = {}) {
  const config = configStore.get();
  const state = media?.getState();
  if (!state?.hasSession || !state.title) {
    currentLyrics = null;
    currentLyricsTrackKey = '';
    broadcast('lyrics:update', { trackKey: '', synced: false, lines: [], plainLines: [], source: '' });
    return;
  }
  const trackKey = currentMediaTrackKey();
  if (!config.media.lyricsEnabled) {
    currentLyrics = plainNoLyrics(trackKey);
    broadcast('lyrics:update', currentLyrics);
    return;
  }
  if (!options.force && currentLyricsTrackKey === trackKey && currentLyrics) {
    return;
  }
  const requestId = ++lyricsRequestId;
  currentLyricsTrackKey = trackKey;
  currentLyrics = { trackKey, synced: false, lines: [], plainLines: [], source: '', pending: true };
  broadcast('lyrics:update', { ...currentLyrics, pending: true });
  try {
    const result = await lyrics.lookup({
      title: state.title,
      artist: state.artist,
      album: state.album,
      durationMs: Math.max(0, (state.endMs || 0) - (state.startMs || 0)),
    }, {
      providers: config.media.providers,
      preferLocalLyrics: config.media.preferLocalLyrics,
      localLyricsDir: config.media.localLyricsDir,
      showTranslation: config.media.showTranslation,
      forceRefresh: Boolean(options.force),
    });
    if (requestId !== lyricsRequestId) return;
    currentLyrics = {
      ...result,
      trackKey,
      pending: false,
      offsetMs: config.media.offsetMs || 0,
      showTranslation: config.media.showTranslation,
    };
    broadcast('lyrics:update', currentLyrics);
  } catch (error) {
    if (requestId !== lyricsRequestId) return;
    currentLyrics = { ...plainNoLyrics(trackKey), error: error.message };
    broadcast('lyrics:update', currentLyrics);
  }
}

async function handleSystemAction(action, payload = {}) {
  if (action === 'media') {
    media?.send(payload.command);
    return { ok: true };
  }
  if (action === 'open-settings') {
    openSettings(payload.tab);
    return { ok: true };
  }
  if (action === 'edit-layout') {
    if (displayWindow && !displayWindow.isDestroyed()) {
      displayWindow.showInactive();
      displayWindow.webContents.send('layout:edit', true);
    }
    return { ok: true };
  }
  if (action === 'refresh-lyrics') {
    queueLyrics({ force: true });
    return { ok: true };
  }
  if (action === 'reload-display') {
    displayWindow?.reload();
    return { ok: true };
  }
  if (action === 'quit') {
    quitting = true;
    app.quit();
    return { ok: true };
  }
  if (action === 'open-config') {
    await shell.openPath(app.getPath('userData'));
    return { ok: true };
  }
  if (action === 'open-logs') {
    await shell.openPath(app.getPath('logs'));
    return { ok: true };
  }
  if (action === 'browse-screenshot-dir') {
    const options = {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择截图保存目录',
    };
    const result = settingsWindow && !settingsWindow.isDestroyed()
      ? await dialog.showOpenDialog(settingsWindow, options)
      : await dialog.showOpenDialog(options);
    if (!result.canceled && result.filePaths[0]) {
      updateConfig({ system: { screenshotDir: result.filePaths[0] } });
      return { ok: true, path: result.filePaths[0] };
    }
    return { ok: false, canceled: true };
  }
  if (action === 'browse-lyrics-dir') {
    const options = {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择本地歌词（.lrc）目录',
    };
    const result = settingsWindow && !settingsWindow.isDestroyed()
      ? await dialog.showOpenDialog(settingsWindow, options)
      : await dialog.showOpenDialog(options);
    if (!result.canceled && result.filePaths[0]) {
      updateConfig({ media: { localLyricsDir: result.filePaths[0], preferLocalLyrics: true } });
      return { ok: true, path: result.filePaths[0] };
    }
    return { ok: false, canceled: true };
  }
  return actions.perform(action, payload);
}

function registerIpc() {
  ipcMain.handle('app:bootstrap', () => {
    const config = configStore.snapshot();
    return {
      config,
      version: app.getVersion(),
      electron: process.versions.electron,
      isPackaged: app.isPackaged,
      platform: process.platform,
      displays: displayPayload(),
      metrics: metrics.snapshot(),
      media: media.getState(),
      bluetooth: bluetooth?.state || [],
      quickState,
      lyrics: currentLyrics,
      audio: actions.getAudioState(),
      brightness: actions.getBrightness(),
      screenshotDir: config.system.screenshotDir || path.join(app.getPath('pictures'), 'PaperDeck Screenshots'),
      catalog: WIDGET_CATALOG,
      quickActions: QUICK_ACTIONS,
      providers: PROVIDERS,
      defaultLayout: JSON.parse(JSON.stringify(DEFAULT_CONFIG.layout.widgets)),
      userData: app.getPath('userData'),
    };
  });

  ipcMain.handle('config:get', () => configStore.snapshot());
  ipcMain.handle('config:update', (_event, patch) => updateConfig(patch));
  ipcMain.handle('config:reset', () => {
    const config = configStore.reset();
    applyDisplaySettings();
    broadcast('config:update', config);
    broadcast('display:update', displayPayload());
    return config;
  });
  ipcMain.handle('display:list', () => displayPayload());
  ipcMain.handle('display:apply', () => {
    applyDisplaySettings();
    return displayPayload();
  });
  ipcMain.handle('display:recreate', () => {
    recreateDisplayWindow();
    return displayPayload();
  });
  ipcMain.handle('windows:open-settings', (_event, tab) => { openSettings(tab); return true; });
  ipcMain.handle('windows:close-settings', () => { settingsWindow?.hide(); return true; });
  ipcMain.handle('windows:minimize-settings', () => { settingsWindow?.minimize(); return true; });
  ipcMain.handle('windows:toggle-maximize', () => {
    if (!settingsWindow) return false;
    if (settingsWindow.isMaximized()) settingsWindow.unmaximize();
    else settingsWindow.maximize();
    return settingsWindow.isMaximized();
  });
  ipcMain.handle('windows:is-maximized', () => Boolean(settingsWindow?.isMaximized()));
  ipcMain.handle('media:command', (_event, command) => {
    const allowed = new Set(['playpause', 'play', 'pause', 'next', 'previous', 'seek']);
    const name = String(command || '').split(' ')[0];
    if (!allowed.has(name)) return { ok: false };
    media.send(String(command));
    return { ok: true };
  });
  ipcMain.handle('system:action', async (_event, action, payload) => {
    try {
      const result = await handleSystemAction(action, payload || {});
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle('lyrics:refresh', async () => {
    await queueLyrics({ force: true });
    return currentLyrics;
  });
  ipcMain.handle('media:get', () => media.getState());
  ipcMain.handle('metrics:get', () => metrics.snapshot());
  ipcMain.handle('audio:get', () => actions.getAudioState());
  ipcMain.handle('brightness:get', () => actions.refreshBrightness());
  ipcMain.handle('app:show-in-folder', (_event, filePath) => {
    if (filePath) shell.showItemInFolder(filePath);
    return true;
  });
  ipcMain.handle('app:open-external', (_event, url) => {
    if (/^https?:\/\//i.test(String(url || ''))) shell.openExternal(url);
    return true;
  });
  ipcMain.handle('app:diagnostics', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    userData: app.getPath('userData'),
    displays: displayPayload(),
    media: media.getState(),
    lyrics: currentLyrics,
    config: configStore.snapshot(),
    audio: actions.getAudioState(),
    brightness: actions.getBrightness(),
  }));
  ipcMain.handle('app:quit', () => { quitting = true; app.quit(); return true; });
  ipcMain.handle('app:relaunch', () => {
    setTimeout(() => {
      app.relaunch();
      app.quit();
    }, 250);
    return true;
  });
}

function setupScreenEvents() {
  const onDisplayChange = () => {
    applyDisplaySettings();
    broadcast('display:update', displayPayload());
  };
  screen.on('display-added', onDisplayChange);
  screen.on('display-removed', onDisplayChange);
  screen.on('display-metrics-changed', onDisplayChange);
}

function configureSession() {
  try {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    session.defaultSession.setPermissionCheckHandler(() => false);
  } catch { /* optional */ }
}

app.whenReady().then(async () => {
  configStore = new ConfigStore();
  app.setAboutPanelOptions({
    applicationName: 'PaperDeck',
    applicationVersion: app.getVersion(),
    copyright: 'Copyright © 2026 Paperpiece',
    credits: 'Developer: Paperpiece',
  });
  configureSession();
  metrics = new MetricsService({ refreshMs: configStore.get().display.refreshMs });
  media = new MediaService();
  lyrics = new LyricsService();
  bluetooth = new BluetoothService();
  actions = new ActionService({
    getDisplay: () => (currentDisplay ? { ...currentDisplay, bounds: displayBoundsFor(currentDisplay, configStore.get().display.mode) } : null),
    getScreenshotDir: () => configStore.get().system.screenshotDir || path.join(app.getPath('pictures'), 'PaperDeck Screenshots'),
    media,
  });
  registerIpc();
  createDisplayWindow();
  createTray();
  setupScreenEvents();
  metrics.on('metrics', (snapshot) => broadcast('metrics:update', snapshot));
  bluetooth.on('update', (devices) => broadcast('bluetooth:update', devices));
  media.on('update', (state) => {
    broadcast('media:update', state);
    if (state.hasSession && state.title) {
      const key = `${state.title}|${state.artist}|${state.album}`.toLowerCase();
      if (key !== currentLyricsTrackKey) {
        clearTimeout(lyricTimers.get('queue'));
        lyricTimers.set('queue', setTimeout(() => queueLyrics(), 280));
      }
    } else if (!state.hasSession && currentLyricsTrackKey) {
      currentLyricsTrackKey = '';
      currentLyrics = null;
      broadcast('lyrics:update', { trackKey: '', synced: false, lines: [], plainLines: [], source: '' });
    }
  });
  actions.start();
  media.start();
  metrics.start();
  bluetooth.start();
  const refreshQuickState = async () => {
    if (!actions) return;
    quickState = await actions.getQuickState();
    broadcast('quick:update', quickState);
  };
  refreshQuickState();
  quickStateTimer = setInterval(refreshQuickState, 15000);
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (!configStore.get().setupComplete) {
    updateConfig({ setupComplete: true });
    openSettings('welcome');
  }
}).catch((error) => {
  console.error('[paperdeck] startup failed', error);
});

app.on('activate', () => {
  openSettings();
});

app.on('window-all-closed', () => {
  // The display is a companion surface and settings may be hidden to tray.
});

app.on('before-quit', () => {
  quitting = true;
  clearInterval(quickStateTimer);
  try { media?.quit(); } catch { /* noop */ }
  try { actions?.quit(); } catch { /* noop */ }
  try { metrics?.stop(); } catch { /* noop */ }
  try { bluetooth?.stop(); } catch { /* noop */ }
  try { tray?.destroy(); } catch { /* noop */ }
  if (sleepBlockerId !== null) {
    try { powerSaveBlocker.stop(sleepBlockerId); } catch { /* noop */ }
  }
});
