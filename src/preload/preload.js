'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('paperdeck', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },

  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  updateConfig: (patch) => ipcRenderer.invoke('config:update', patch),
  resetConfig: () => ipcRenderer.invoke('config:reset'),
  getDisplays: () => ipcRenderer.invoke('display:list'),
  applyDisplay: () => ipcRenderer.invoke('display:apply'),
  recreateDisplay: () => ipcRenderer.invoke('display:recreate'),

  openSettings: (tab) => ipcRenderer.invoke('windows:open-settings', tab),
  closeSettings: () => ipcRenderer.invoke('windows:close-settings'),
  minimizeSettings: () => ipcRenderer.invoke('windows:minimize-settings'),
  toggleMaximize: () => ipcRenderer.invoke('windows:toggle-maximize'),
  isMaximized: () => ipcRenderer.invoke('windows:is-maximized'),

  mediaCommand: (command) => ipcRenderer.invoke('media:command', command),
  getMedia: () => ipcRenderer.invoke('media:get'),
  getMetrics: () => ipcRenderer.invoke('metrics:get'),
  refreshLyrics: () => ipcRenderer.invoke('lyrics:refresh'),
  getAudio: () => ipcRenderer.invoke('audio:get'),
  getBrightness: () => ipcRenderer.invoke('brightness:get'),
  systemAction: (action, payload) => ipcRenderer.invoke('system:action', action, payload),
  getDiagnostics: () => ipcRenderer.invoke('app:diagnostics'),

  showInFolder: (filePath) => ipcRenderer.invoke('app:show-in-folder', filePath),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  quit: () => ipcRenderer.invoke('app:quit'),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  onBluetooth: (callback) => subscribe('bluetooth:update', callback),
  onQuickState: (callback) => subscribe('quick:update', callback),

  onMetrics: (callback) => subscribe('metrics:update', callback),
  onMedia: (callback) => subscribe('media:update', callback),
  onLyrics: (callback) => subscribe('lyrics:update', callback),
  onConfig: (callback) => subscribe('config:update', callback),
  onDisplay: (callback) => subscribe('display:update', callback),
  onLayoutEdit: (callback) => subscribe('layout:edit', callback),
  onSettingsTab: (callback) => subscribe('settings:tab', callback),
});
