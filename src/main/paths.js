'use strict';

const path = require('node:path');
const { app } = require('electron');

function projectRoot() {
  return path.join(__dirname, '..', '..');
}

function resourcePath(...parts) {
  return app.isPackaged
    ? path.join(process.resourcesPath, ...parts)
    : path.join(projectRoot(), ...parts);
}

function scriptPath(name) {
  return resourcePath('scripts', name);
}

function assetPath(name) {
  return resourcePath('assets', name);
}

function powershellPath() {
  return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

module.exports = { projectRoot, resourcePath, scriptPath, assetPath, powershellPath };
