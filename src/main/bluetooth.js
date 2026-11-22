'use strict';

const { EventEmitter } = require('node:events');
const { execFile } = require('node:child_process');
const { scriptPath, powershellPath } = require('./paths');

class BluetoothService extends EventEmitter {
  constructor() {
    super();
    this.state = [];
    this.timer = null;
    this.refreshing = false;
    this.timeout = 9000;
  }

  start() {
    this.stop();
    this.timer = setInterval(() => this.refresh(), 30000);
    setTimeout(() => this.refresh(), 1200);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  refresh() {
    if (this.refreshing) return;
    this.refreshing = true;
    execFile(
      powershellPath(),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath('bluetooth.ps1')],
      { timeout: this.timeout, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        this.refreshing = false;
        if (error && !stdout) {
          if (!this.state.length) this.emit('update', []);
          return;
        }
        try {
          const parsed = JSON.parse(String(stdout).replace(/^\uFEFF/, '').trim());
          const devices = Array.isArray(parsed) ? parsed : [parsed];
          this.state = devices.filter((device) => device && device.name).slice(0, 4);
          this.emit('update', this.state);
        } catch {
          /* Bluetooth data is optional; keep the previous state. */
        }
      },
    );
  }
}

module.exports = { BluetoothService };
