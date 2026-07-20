const fs = require('fs');
const path = require('path');
const os = require('os');
const pty = require('node-pty');

const PRESETS_FILE = path.join(__dirname, '..', '..', 'data', 'terminal-presets.json');

function loadPresets() {
  try {
    if (fs.existsSync(PRESETS_FILE)) {
      const presets = JSON.parse(fs.readFileSync(PRESETS_FILE, 'utf8'));
      let changed = false;
      presets.forEach(p => {
        if (!p.category) {
          p.category = 'Custom';
          changed = true;
        }
      });
      if (changed) savePresets(presets);
      return presets;
    }
  } catch (_) {}
  return [];
}

function savePresets(presets) {
  fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2), 'utf8');
}

function getPresets() {
  return loadPresets();
}

const PRESET_CATEGORIES = ['System', 'Docker', 'Files', 'Network', 'Database', 'Custom'];

function normalizeCategory(cat) {
  const c = String(cat || 'Custom').trim();
  const match = PRESET_CATEGORIES.find(x => x.toLowerCase() === c.toLowerCase());
  return match || 'Custom';
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

function createTerminalSession(cols, rows, env) {
  const shell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : 'bash');
  const session = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: process.env.HOME || '/root',
    env: sanitizeEnv(env),
  });

  return session;
}

module.exports = { getPresets, addPreset, updatePreset, deletePreset, createTerminalSession };
