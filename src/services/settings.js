const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { runSafeSync } = require('../utils/shell');

const SETTINGS_FILE = path.join(__dirname, '..', '..', 'data', 'settings.json');
const TOKENS_FILE = path.join(__dirname, '..', '..', 'data', 'api-tokens.json');

const DEFAULTS = {
  panelName: 'NexusPanel',
  serverLocation: '',
  defaultPage: 'dashboard',
  sessionTimeout: 60,
  idleTimeout: 30,
  language: 'en',
  timezone: 'UTC',
  enable2FA: false,
  loginNotifications: true,
  ipWhitelist: [],
  theme: 'dark',
  sidebarPosition: 'left',
  fontSize: 'medium',
  accentColor: '#10b981',
  desktopNotifications: false,
  updateAlerts: true,
  emailNotifications: false,
  notifyOn: { updates: true, security: true, errors: true },
  debugMode: false,
  logRetentionDays: 30,
  autoUpdate: false,
  updateChannel: 'stable',
  lastUpdateCheck: null,
  lastUpdateResult: null,
};

const SCHEMA = {
  panelName: { type: 'string', min: 3, max: 64 },
  serverLocation: { type: 'string', max: 128 },
  defaultPage: { type: 'enum', values: ['dashboard', 'domains', 'databases', 'files', 'users', 'services'] },
  sessionTimeout: { type: 'number', min: 5, max: 1440 },
  idleTimeout: { type: 'number', min: 0, max: 1440 },
  language: { type: 'enum', values: ['en', 'nl', 'de', 'fr', 'es', 'pt', 'ru', 'zh', 'ja'] },
  timezone: { type: 'string', max: 64 },
  enable2FA: { type: 'boolean' },
  loginNotifications: { type: 'boolean' },
  ipWhitelist: { type: 'array', max: 50 },
  theme: { type: 'enum', values: ['dark', 'light', 'auto'] },
  sidebarPosition: { type: 'enum', values: ['left', 'right'] },
  fontSize: { type: 'enum', values: ['small', 'medium', 'large'] },
  accentColor: { type: 'string', max: 7 },
  desktopNotifications: { type: 'boolean' },
  updateAlerts: { type: 'boolean' },
  emailNotifications: { type: 'boolean' },
  notifyOn: { type: 'object' },
  debugMode: { type: 'boolean' },
  logRetentionDays: { type: 'number', min: 7, max: 365 },
  autoUpdate: { type: 'boolean' },
  updateChannel: { type: 'enum', values: ['stable', 'beta'] },
};

function load() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      return { ...DEFAULTS, ...data };
    }
  } catch (e) {
    console.error('Failed to load settings:', e.message);
  }
  return { ...DEFAULTS };
}

function save(settings) {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const current = load();
    const merged = { ...current, ...settings };
    const tmpFile = SETTINGS_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(merged, null, 2), 'utf-8');
    fs.renameSync(tmpFile, SETTINGS_FILE);
    return merged;
  } catch (e) {
    console.error('Failed to save settings:', e.message);
    return null;
  }
}

function validate(settings) {
  const errors = [];
  for (const [key, value] of Object.entries(settings)) {
    if (!(key in SCHEMA)) continue;
    const rule = SCHEMA[key];
    if (rule.type === 'string' || rule.type === 'enum') {
      if (typeof value !== 'string') {
        errors.push(key + ': must be a string');
        continue;
      }
      if (rule.min && value.length < rule.min) errors.push(key + ': min ' + rule.min + ' chars');
      if (rule.max && value.length > rule.max) errors.push(key + ': max ' + rule.max + ' chars');
      if (rule.type === 'enum' && !rule.values.includes(value)) errors.push(key + ': must be one of ' + rule.values.join(', '));
    } else if (rule.type === 'boolean') {
      if (typeof value !== 'boolean') errors.push(key + ': must be a boolean');
    } else if (rule.type === 'number') {
      if (typeof value !== 'number' || isNaN(value)) {
        errors.push(key + ': must be a number');
        continue;
      }
      if (rule.min !== undefined && value < rule.min) errors.push(key + ': min ' + rule.min);
      if (rule.max !== undefined && value > rule.max) errors.push(key + ': max ' + rule.max);
    } else if (rule.type === 'array') {
      if (!Array.isArray(value)) {
        errors.push(key + ': must be an array');
        continue;
      }
      if (rule.max && value.length > rule.max) errors.push(key + ': max ' + rule.max + ' items');
      if (key === 'ipWhitelist') {
        const ipRe = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
        for (const item of value) {
          if (typeof item !== 'string' || !ipRe.test(item)) errors.push('ipWhitelist: invalid IP/CIDR "' + item + '"');
        }
      }
    } else if (rule.type === 'object') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) errors.push(key + ': must be an object');
    }
  }
  return errors;
}

function getSystemInfo() {
  const info = {};
  try {
    const uptimeRes = runSafeSync('uptime', ['-p']);
    info.uptime = uptimeRes.stdout.trim() || 'unknown';
  } catch { info.uptime = 'unknown'; }
  try {
    const memRes = runSafeSync('free', ['-b']);
    const memLines = memRes.stdout.split('\n');
    if (memLines.length >= 2) {
      const parts = memLines[1].trim().split(/\s+/);
      info.memory = { total: parseInt(parts[1]) || 0, used: parseInt(parts[2]) || 0, free: parseInt(parts[3]) || 0 };
    }
  } catch { info.memory = { total: 0, used: 0, free: 0 }; }
  try {
    const diskRes = runSafeSync('df', ['-B1', '/']);
    const diskLines = diskRes.stdout.split('\n');
    if (diskLines.length >= 2) {
      const parts = diskLines[1].trim().split(/\s+/);
      info.disk = { total: parseInt(parts[1]) || 0, used: parseInt(parts[2]) || 0, free: parseInt(parts[3]) || 0 };
    }
  } catch { info.disk = { total: 0, used: 0, free: 0 }; }
  try {
    const nodeRes = runSafeSync('node', ['--version']);
    info.nodeVersion = nodeRes.stdout.trim() || 'unknown';
  } catch { info.nodeVersion = 'unknown'; }
  try {
    const phpRes = runSafeSync('php', ['-v']);
    const phpLine = phpRes.stdout.split('\n')[0] || '';
    info.phpVersion = phpLine.match(/PHP\s+([\d.]+)/)?.[1] || 'not installed';
  } catch { info.phpVersion = 'not installed'; }
  try {
    const nginxRes = runSafeSync('nginx', ['-v']);
    const nginxErr = nginxRes.stderr || '';
    info.nginxVersion = nginxErr.match(/nginx\/([\d.]+)/)?.[1] || 'not installed';
  } catch { info.nginxVersion = 'not installed'; }
  try {
    const osRes = runSafeSync('cat', ['/etc/os-release']);
    const osLines = osRes.stdout.split('\n');
    const osMap = {};
    for (const line of osLines) {
      const m = line.match(/^PRETTY_NAME="?([^"]+)"?$/);
      if (m) info.osName = m[1];
    }
    if (!info.osName) {
      const nameLine = osLines.find(l => l.startsWith('NAME='));
      const verLine = osLines.find(l => l.startsWith('VERSION='));
      info.osName = ((nameLine || '').split('=')[1] || '').replace(/"/g, '') + ' ' + ((verLine || '').split('=')[1] || '').replace(/"/g, '');
    }
  } catch { info.osName = 'unknown'; }
  try {
    const cpuRes = runSafeSync('nproc', []);
    info.cpuCores = parseInt(cpuRes.stdout.trim()) || 1;
  } catch { info.cpuCores = 1; }
  try {
    const loadRes = runSafeSync('cat', ['/proc/loadavg']);
    const loadParts = loadRes.stdout.trim().split(/\s+/);
    info.loadAverage = [parseFloat(loadParts[0]) || 0, parseFloat(loadParts[1]) || 0, parseFloat(loadParts[2]) || 0];
  } catch { info.loadAverage = [0, 0, 0]; }
  try {
    const hostnameRes = runSafeSync('hostname', []);
    info.hostname = hostnameRes.stdout.trim() || 'unknown';
  } catch { info.hostname = 'unknown'; }
  return info;
}

function getSystemHealth() {
  const services = ['nginx', 'php-fpm', 'postgresql', 'vsftpd', 'clamav-daemon', 'firewalld'];
  const statuses = {};
  for (const svc of services) {
    try {
      const res = runSafeSync('systemctl', ['is-active', svc]);
      statuses[svc] = res.stdout.trim() === 'active' ? 'running' : 'stopped';
    } catch {
      statuses[svc] = 'stopped';
    }
  }
  const diskRes = runSafeSync('df', ['-B1', '/']);
  let diskUsed = 0, diskTotal = 0;
  try {
    const lines = diskRes.stdout.split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].trim().split(/\s+/);
      diskTotal = parseInt(parts[1]) || 0;
      diskUsed = parseInt(parts[2]) || 0;
    }
  } catch {}
  let memUsed = 0, memTotal = 0;
  try {
    const memRes = runSafeSync('free', ['-b']);
    const lines = memRes.stdout.split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].trim().split(/\s+/);
      memTotal = parseInt(parts[1]) || 0;
      memUsed = parseInt(parts[2]) || 0;
    }
  } catch {}
  return { services: statuses, disk: { used: diskUsed, total: diskTotal, percent: diskTotal ? Math.round(diskUsed / diskTotal * 100) : 0 }, memory: { used: memUsed, total: memTotal, percent: memTotal ? Math.round(memUsed / memTotal * 100) : 0 } };
}

function loadTokens() {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveTokens(tokens) {
  const dir = path.dirname(TOKENS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpFile = TOKENS_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(tokens, null, 2), 'utf-8');
  fs.renameSync(tmpFile, TOKENS_FILE);
}

function createApiToken(name, scope) {
  const tokens = loadTokens();
  const id = 'tok_' + Date.now() + '_' + crypto.randomBytes(8).toString('hex');
  const secret = 'nxs_' + crypto.randomBytes(32).toString('hex');
  const token = { id, name, scope: scope || 'read', secret, createdAt: new Date().toISOString(), revoked: false };
  tokens.push(token);
  saveTokens(tokens);
  return { id, name, scope: token.scope, secret, createdAt: token.createdAt };
}

function revokeApiToken(id) {
  const tokens = loadTokens();
  const token = tokens.find(t => t.id === id);
  if (!token) return null;
  token.revoked = true;
  token.revokedAt = new Date().toISOString();
  saveTokens(tokens);
  return { id, name: token.name, revoked: true };
}

function getApiTokens() {
  return loadTokens().map(t => ({ id: t.id, name: t.name, scope: t.scope, createdAt: t.createdAt, revoked: t.revoked, revokedAt: t.revokedAt }));
}

function clearCache() {
  const cacheFiles = [
    path.join(__dirname, '..', '..', 'data', 'panel-version-cache.json'),
  ];
  let cleared = 0;
  for (const f of cacheFiles) {
    try {
      if (fs.existsSync(f)) { fs.unlinkSync(f); cleared++; }
    } catch {}
  }
  const metricsDir = path.join(__dirname, '..', '..', 'data', 'metrics');
  try {
    if (fs.existsSync(metricsDir)) {
      const files = fs.readdirSync(metricsDir);
      for (const f of files) {
        try { fs.unlinkSync(path.join(metricsDir, f)); cleared++; } catch {}
      }
    }
  } catch {}
  return { cleared };
}

function rotateLogs() {
  const logDirs = ['/var/log/nginx'];
  let rotated = 0;
  for (const dir of logDirs) {
    try {
      const res = runSafeSync('logrotate', ['-f', '/etc/logrotate.d/nginx']);
      if (res.status === 0) rotated++;
    } catch {}
  }
  return { rotated };
}

function restartService() {
  try {
    const res = runSafeSync('systemctl', ['restart', 'nexuspanel']);
    return { success: res.status === 0, error: res.error || (res.status !== 0 ? res.stderr.trim() : null) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = { load, save, validate, getSystemInfo, getSystemHealth, getApiTokens, createApiToken, revokeApiToken, clearCache, rotateLogs, restartService, DEFAULTS };
