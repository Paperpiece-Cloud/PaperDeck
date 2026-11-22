'use strict';

const os = require('node:os');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { spawn, execFile } = require('node:child_process');
const path = require('node:path');

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v) => {
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
};

function pushHistory(list, value, max = 60) {
  list.push(value);
  if (list.length > max) list.length = max;
}

class MetricsService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.refreshMs = options.refreshMs || 1000;
    this.timer = null;
    this.typeperf = null;
    this.typeperfBuffer = '';
    this.typeperfHeaders = null;
    this.lastEnergy = new Map();
    this.lastEnergyTs = null;
    this.lastGpuPoll = 0;
    this.gpuPolling = false;
    this.static = null;
    this.started = false;

    this.cpuPrev = os.cpus().map((core) => {
      const total = Object.values(core.times).reduce((a, b) => a + b, 0);
      return { idle: core.times.idle, total };
    });
    this.current = {
      ts: Date.now(),
      cpu: { load: 0, temp: null, power: null, name: 'CPU', cores: os.cpus().length, speed: 0 },
      gpu: { name: 'GPU', load: null, temp: null, power: null, memoryUsed: null, memoryTotal: null, available: false },
      ram: { used: 0, total: os.totalmem(), percent: 0 },
      power: { cpu: null, gpu: null, total: null },
      network: { rxSec: 0, txSec: 0, iface: '网络', ip: '', ssid: '', type: 'unknown', signal: null, connected: false },
      disk: { readSec: 0, writeSec: 0, volumes: [] },
      battery: { hasBattery: false, percent: null, charging: false, ac: true },
      system: { uptime: os.uptime(), hostname: os.hostname(), os: 'Windows' },
      history: { cpu: [], gpu: [], ram: [], rx: [], tx: [], power: [] },
    };
  }

  async start() {
    if (this.started) return;
    this.started = true;
    await this.gatherStatic();
    this.startTypeperf();
    this.startGpuLoop();
    this.pollBattery();
    this.pollVolumes();
    this.tick();
    this.timer = setInterval(() => this.tick(), this.refreshMs);
    this.batteryTimer = setInterval(() => this.pollBattery(), 30000);
    this.volumeTimer = setInterval(() => this.pollVolumes(), 8000);
    this.networkTimer = setInterval(() => this.pollSsid(), 15000);
  }

  stop() {
    clearInterval(this.timer);
    clearInterval(this.batteryTimer);
    clearInterval(this.volumeTimer);
    clearInterval(this.networkTimer);
    this.stopTypeperf();
    this.stopGpuLoop();
    this.started = false;
  }

  typeperfSeconds() {
    return Math.max(1, Math.min(10, Math.round(this.refreshMs / 1000)));
  }

  gpuSeconds() {
    return Math.max(2, Math.min(10, Math.round(this.refreshMs / 1000)));
  }

  setRefresh(ms) {
    const next = Math.min(10000, Math.max(500, Number(ms) || 1000));
    if (next === this.refreshMs) return;
    const previousTypeperf = this.typeperfSeconds();
    const previousGpu = this.gpuSeconds();
    this.refreshMs = next;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), this.refreshMs);
    }
    if (this.typeperfSeconds() !== previousTypeperf) this.restartTypeperf();
    if (this.gpuSeconds() !== previousGpu) this.startGpuLoop(true);
  }

  stopTypeperf() {
    if (this.typeperfRestartTimer) clearTimeout(this.typeperfRestartTimer);
    this.typeperfRestartTimer = null;
    if (!this.typeperf) return;
    try {
      this.typeperf.removeAllListeners('exit');
      this.typeperf.kill();
    } catch { /* noop */ }
    this.typeperf = null;
  }

  restartTypeperf() {
    this.stopTypeperf();
    this.startTypeperf();
  }

  async gatherStatic() {
    const cpus = os.cpus();
    const network = this.pickNetworkInterface();
    this.static = {
      cpuName: (cpus[0]?.model || 'CPU').replace(/\s+/g, ' ').trim(),
      cores: cpus.length,
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()}`,
      iface: network.iface,
      ip: network.ip,
    };
    this.current.cpu.name = this.static.cpuName;
    this.current.cpu.cores = this.static.cores;
    this.current.network.iface = this.static.iface;
    this.current.network.ip = this.static.ip;
    this.current.network.type = /wlan|wi-?fi|无线/i.test(this.static.iface) ? 'wifi' : (this.static.iface ? 'ethernet' : 'unknown');
    this.current.network.connected = Boolean(this.static.ip);

    this.pollVolumes();
    await this.pollGpuStatic();
    this.pollSsid();
  }

  pickNetworkInterface() {
    const interfaces = os.networkInterfaces();
    const priority = ['以太网', 'Ethernet', 'WLAN', 'Wi-Fi', 'WiFi'];
    const entries = [];
    for (const [name, addresses] of Object.entries(interfaces)) {
      for (const address of addresses || []) {
        if (address.family === 'IPv4' && !address.internal) {
          entries.push({ iface: name, ip: address.address });
        }
      }
    }
    for (const prefix of priority) {
      const found = entries.find((entry) => entry.iface.toLowerCase().includes(prefix.toLowerCase()));
      if (found) return found;
    }
    return entries[0] || { iface: '网络', ip: '' };
  }

  pollSsid() {
    const iface = this.current.network.iface || '';
    if (!/wlan|wi-?fi|无线/i.test(iface)) {
      this.current.network.connected = Boolean(this.current.network.ip);
      this.current.network.signal = this.current.network.connected ? 100 : null;
      this.current.network.type = iface ? 'ethernet' : 'unknown';
      return;
    }
    execFile('netsh', ['wlan', 'show', 'interfaces'], { timeout: 3500, windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return;
      const state = /^\s*(?:State|状态)\s*:\s*(.+)$/im.exec(stdout);
      const ssid = /^\s*SSID\s*:\s*(.+)$/im.exec(stdout);
      const signal = /^\s*(?:Signal|信号)\s*:\s*(\d+)%/im.exec(stdout);
      this.current.network.type = 'wifi';
      this.current.network.connected = Boolean(state && /connected|已连接/i.test(state[1]));
      if (ssid) this.current.network.ssid = ssid[1].trim();
      if (signal) this.current.network.signal = Number(signal[1]);
      else this.current.network.signal = this.current.network.connected ? 0 : null;
    });
  }

  startTypeperf() {
    const counters = [
      '\\Energy Meter(*)\\Energy',
      '\\Thermal Zone Information(*)\\High Precision Temperature',
    ];
    const args = [...counters, '-si', String(this.typeperfSeconds()), '-sc', '86400'];
    try {
      const child = spawn('typeperf', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      this.typeperf = child;
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => this.onTypeperfData(chunk));
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', () => {});
      child.on('error', () => { this.typeperf = null; });
      child.on('exit', () => {
        this.typeperf = null;
        if (!this.started) return;
        this.typeperfRestartTimer = setTimeout(() => this.startTypeperf(), 4000);
      });
    } catch {
      this.typeperf = null;
    }
  }

  parseCsvLine(line) {
    const parts = [];
    let inQuotes = false;
    let current = '';
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        parts.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    parts.push(current);
    return parts.map((part) => part.trim());
  }

  onTypeperfData(chunk) {
    this.typeperfBuffer += chunk;
    const lines = this.typeperfBuffer.split(/\r?\n/);
    this.typeperfBuffer = lines.pop() || '';
    for (const line of lines) {
      if (!line || line.startsWith('Exiting')) continue;
      const fields = this.parseCsvLine(line);
      if (fields.length < 2) continue;
      if (!this.typeperfHeaders) {
        if (fields.some((f) => /Energy Meter|Network Interface|Thermal Zone/i.test(f))) {
          this.typeperfHeaders = fields;
        }
        continue;
      }
      this.applyTypeperfRow(fields);
    }
  }

  applyTypeperfRow(fields) {
    const ts = Date.parse(fields[0]);
    if (!Number.isFinite(ts)) return;
    const header = this.typeperfHeaders;
    const samples = { energy: new Map(), thermal: [], rx: 0, tx: 0, diskRead: 0, diskWrite: 0 };
    for (let i = 1; i < fields.length && i < header.length; i += 1) {
      const value = num(fields[i]);
      if (value === null) continue;
      const key = header[i];
      if (/Energy Meter/i.test(key) && /\\Energy$/i.test(key)) {
        const instance = /\((.*)\)/.exec(key)?.[1] || String(i);
        samples.energy.set(instance, value);
      } else if (/Thermal Zone Information/i.test(key) && /High Precision Temperature/i.test(key)) {
        const celsius = value / 10 - 273.15;
        if (celsius > -20 && celsius < 120) samples.thermal.push(celsius);
      } else if (/Network Interface/i.test(key) && /Bytes Received\/sec/i.test(key)) {
        samples.rx += value;
      } else if (/Network Interface/i.test(key) && /Bytes Sent\/sec/i.test(key)) {
        samples.tx += value;
      } else if (/PhysicalDisk/i.test(key) && /Disk Read Bytes\/sec/i.test(key)) {
        samples.diskRead += value;
      } else if (/PhysicalDisk/i.test(key) && /Disk Write Bytes\/sec/i.test(key)) {
        samples.diskWrite += value;
      }
    }

    let watts = null;
    let energySum = 0;
    let energyCount = 0;
    for (const [instance, energy] of samples.energy.entries()) {
      if (!/pkg/i.test(instance)) continue;
      const prev = this.lastEnergy.get(instance);
      this.lastEnergy.set(instance, energy);
      if (prev !== undefined && this.lastEnergyTs !== null) {
        const dt = (ts - this.lastEnergyTs) / 1000;
        if (dt > 0.2) {
          const delta = energy - prev;
          // Windows' Energy Meter RAPL counter is picowatt-hours.
          const w = (delta * 3.6e-9) / dt;
          if (Number.isFinite(w) && w > 0 && w < 400) {
            energySum += w;
            energyCount += 1;
          }
        }
      }
    }
    if (energyCount > 0) watts = energySum;

    if (watts !== null) {
      this.current.cpu.power = Math.round(watts * 10) / 10;
    }
    if (samples.thermal.length) {
      this.current.cpu.temp = Math.round(Math.max(...samples.thermal) * 10) / 10;
    }
    if (this.lastEnergyTs !== null) {
      this.current.network.rxSec = Math.round(samples.rx);
      this.current.network.txSec = Math.round(samples.tx);
      this.current.disk.readSec = Math.round(samples.diskRead);
      this.current.disk.writeSec = Math.round(samples.diskWrite);
    }
    this.lastEnergyTs = ts;
  }

  async pollGpuStatic() {
    try {
      const si = require('systeminformation');
      const graphics = await si.graphics();
      const controllers = (graphics.controllers || []).filter(
        (c) => /nvidia|amd|radeon|intel/i.test(`${c.vendor} ${c.name || c.model}`) && !/spacedesk|virtual/i.test(c.name || c.model || ''),
      );
      // Laptops commonly expose the Intel iGPU first. Prefer the discrete GPU
      // so GPU load/power is read from nvidia-smi or the AMD controller.
      const gpu = controllers.find((c) => /nvidia/i.test(`${c.vendor} ${c.name || c.model}`))
        || controllers.find((c) => /amd|radeon/i.test(`${c.vendor} ${c.name || c.model}`))
        || controllers[0];
      if (gpu) {
        this.current.gpu.name = gpu.name || gpu.model || 'GPU';
        this.current.gpu.memoryTotal = gpu.memoryTotal || gpu.vram || null;
        this.current.gpu.staticVendor = gpu.vendor || '';
        this.current.gpu.available = true;
      }
    } catch {
      /* optional data */
    }
  }

  pollGpu() {
    this.startGpuLoop();
  }

  stopGpuLoop() {
    if (this.gpuRestartTimer) clearTimeout(this.gpuRestartTimer);
    this.gpuRestartTimer = null;
    if (!this.gpuLoop) return;
    try {
      this.gpuLoop.removeAllListeners('exit');
      this.gpuLoop.kill();
    } catch { /* noop */ }
    this.gpuLoop = null;
  }

  startGpuLoop(quiet = false) {
    if (this.gpuLoop && !quiet) return;
    if (quiet) this.stopGpuLoop();
    const vendor = String(this.current.gpu.staticVendor || '').toLowerCase();
    if (!vendor.includes('nvidia') && !/nvidia/i.test(this.current.gpu.name || '')) return;
    const seconds = this.gpuSeconds();
    const args = [
      '--query-gpu=index,name,utilization.gpu,memory.used,memory.total,power.draw,power.limit,temperature.gpu,clocks.current.graphics',
      '--format=csv,noheader,nounits',
      '-l', String(seconds),
    ];
    try {
      const child = spawn('nvidia-smi', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      this.gpuLoop = child;
      let buffer = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) this.applyGpuLine(line);
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', () => {});
      child.on('error', () => { this.gpuLoop = null; });
      child.on('exit', () => {
        this.gpuLoop = null;
        if (!this.started) return;
        this.gpuRestartTimer = setTimeout(() => this.startGpuLoop(), 5000);
      });
    } catch {
      this.gpuLoop = null;
    }
  }

  applyGpuLine(line) {
    const raw = String(line || '').trim();
    if (!raw || raw.startsWith('index')) return;
    const parts = raw.split(',').map((part) => part.trim());
    if (parts.length < 9) return;
    const [index, name, load, memUsed, memTotal, power, powerLimit, temp, clock] = parts;
    this.current.gpu = {
      ...this.current.gpu,
      index: num(index),
      name: name || this.current.gpu.name,
      load: num(load),
      memoryUsed: num(memUsed),
      memoryTotal: num(memTotal) || this.current.gpu.memoryTotal,
      power: num(power),
      powerLimit: num(powerLimit),
      temp: num(temp),
      clock: num(clock),
      available: true,
    };
  }

  async pollBattery() {
    try {
      const si = require('systeminformation');
      const battery = await si.battery();
      this.current.battery = {
        hasBattery: Boolean(battery.hasBattery),
        percent: battery.percent ?? null,
        charging: Boolean(battery.isCharging),
        ac: Boolean(battery.acConnected),
        timeRemaining: battery.timeRemaining ?? null,
        maxCapacity: battery.maxCapacity ?? null,
        voltage: battery.voltage ?? null,
      };
    } catch {
      /* battery is optional */
    }
  }

  pollVolumes() {
    const volumes = [];
    for (const drive of ['C:', 'D:', 'E:', 'F:', 'G:']) {
      try {
        if (!fs.existsSync(`${drive}\\`)) continue;
        const stat = fs.statfsSync(`${drive}\\`);
        const total = Number(stat.blocks) * Number(stat.bsize);
        const free = Number(stat.bavail) * Number(stat.bsize);
        if (!total) continue;
        volumes.push({
          mount: drive,
          total,
          free,
          used: total - free,
          percent: clamp(((total - free) / total) * 100, 0, 100),
        });
      } catch {
        /* skip inaccessible drive */
      }
    }
    this.current.disk.volumes = volumes;
  }

  sampleCpuLoad() {
    const cores = os.cpus();
    let totalDelta = 0;
    let idleDelta = 0;
    for (let i = 0; i < cores.length; i += 1) {
      const prev = this.cpuPrev[i];
      if (!prev) continue;
      const times = cores[i].times;
      const total = Object.values(times).reduce((a, b) => a + b, 0);
      totalDelta += total - prev.total;
      idleDelta += times.idle - prev.idle;
      this.cpuPrev[i] = { idle: times.idle, total };
    }
    if (totalDelta <= 0) return this.current.cpu.load;
    return clamp((1 - idleDelta / totalDelta) * 100, 0, 100);
  }

  tick() {
    const ts = Date.now();
    const load = this.sampleCpuLoad();
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const ramPercent = clamp((used / total) * 100, 0, 100);
    const gpuPower = this.current.gpu.power;
    const cpuPower = this.current.cpu.power;
    const knownPower = (cpuPower || 0) + (gpuPower || 0);

    this.current.ts = ts;
    this.current.cpu.load = Math.round(load * 10) / 10;
    this.current.ram = { used, total, percent: Math.round(ramPercent * 10) / 10 };
    this.current.power = {
      cpu: cpuPower,
      gpu: gpuPower,
      total: cpuPower || gpuPower ? Math.round(knownPower * 10) / 10 : null,
    };
    this.current.system.uptime = os.uptime();
    this.current.system.hostname = os.hostname();
    this.current.history.cpu = this.current.history.cpu || [];
    pushHistory(this.current.history.cpu, Math.round(load * 10) / 10);
    pushHistory(this.current.history.ram, Math.round(ramPercent * 10) / 10);
    pushHistory(this.current.history.gpu, this.current.gpu.load ?? 0);
    pushHistory(this.current.history.rx, this.current.network.rxSec || 0);
    pushHistory(this.current.history.tx, this.current.network.txSec || 0);
    pushHistory(this.current.history.power, Math.round(knownPower * 10) / 10);

    this.emit('metrics', this.snapshot());
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.current));
  }
}

module.exports = { MetricsService };
