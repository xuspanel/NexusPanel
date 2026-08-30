const pty = require('node-pty');
const os = require('os');
const fs = require('fs');
const path = require('path');

const PRESETS_FILE = path.join(__dirname, '..', '..', 'data', 'terminal-presets.json');

const VALID_CATEGORIES = ['system', 'services', 'docker', 'network', 'security', 'logs', 'custom'];

function normalizeCategory(cat) {
  if (!cat || typeof cat !== 'string') return 'custom';
  const c = cat.toLowerCase().trim();
  return VALID_CATEGORIES.includes(c) ? c : 'custom';
}

function loadPresets() {
  try {
    if (fs.existsSync(PRESETS_FILE)) {
      return JSON.parse(fs.readFileSync(PRESETS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[Terminal] Error loading presets:', err.message);
  }
  return [];
}

function savePresets(presets) {
  try {
    const dir = path.dirname(PRESETS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2), 'utf8');
  } catch (err) {
    console.error('[Terminal] Error saving presets:', err.message);
  }
}

function getPresets(category) {
  const all = loadPresets();
  if (category) {
    const norm = normalizeCategory(category);
    return all.filter(p => p.category === norm);
  }
  return all;
}

function addPreset(label, cmd, category) {
  const presets = loadPresets();
  const id = 'p' + Date.now();
  presets.push({ id, label, cmd, category: normalizeCategory(category) });
  savePresets(presets);
  return presets[presets.length - 1];
}

function updatePreset(id, label, cmd, category) {
  const presets = loadPresets();
  const idx = presets.findIndex(p => p.id === id);
  if (idx === -1) throw new Error('Preset not found');
  presets[idx] = { ...presets[idx], label, cmd, category: normalizeCategory(category) };
  savePresets(presets);
  return presets[idx];
}

function deletePreset(id) {
  let presets = loadPresets();
  presets = presets.filter(p => p.id !== id);
  savePresets(presets);
  return { ok: true };
}

const SAFE_ENV_KEYS = new Set([
  'HOME', 'USER', 'LOGNAME', 'SHELL', 'TERM', 'PATH', 'LANG', 'LC_ALL',
  'EDITOR', 'PAGER', 'DISPLAY', 'XAUTHORITY',
  'HOSTNAME', 'HOST', 'TZ', 'PWD', 'OLDPWD',
]);

function sanitizeEnv(extra) {
  const clean = {};
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key] !== undefined) clean[key] = process.env[key];
  }
  clean.PATH = process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
  clean.TERM = 'xterm-256color';
  return { ...clean, ...extra };
}

function createTerminalSession(cols, rows, env = {}) {
  const isWindows = os.platform() === 'win32';
  const defaultShell = process.env.SHELL || (isWindows ? 'powershell.exe' : 'bash');
  const isRoot = !process.getuid || process.getuid() === 0;
  const isAdmin = env.ROLE === 'admin' || env.role === 'admin' || env.USER === 'admin';

  let bin = defaultShell;
  let args = [];
  // Use a universally accessible working directory for initial spawn so chdir(2) never fails
  let cwd = '/tmp';

  if (!isWindows && !isRoot && isAdmin) {
    bin = 'sudo';
    args = ['-i', '-u', 'root'];
    cwd = '/tmp';
  } else if (isRoot) {
    cwd = process.env.HOME || '/root';
  } else {
    cwd = '/tmp';
  }

  const session = pty.spawn(bin, args, {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: cwd,
    env: sanitizeEnv(env),
  });

  return session;
}

module.exports = { getPresets, addPreset, updatePreset, deletePreset, createTerminalSession };
