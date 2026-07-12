const fs = require('fs');
const path = require('path');
const os = require('os');
const pty = require('node-pty');

const PRESETS_FILE = path.join(__dirname, '..', '..', 'data', 'terminal-presets.json');

function loadPresets() {
  try {
    if (fs.existsSync(PRESETS_FILE)) {
      return JSON.parse(fs.readFileSync(PRESETS_FILE, 'utf8'));
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

function addPreset(label, cmd) {
  const presets = loadPresets();
  const id = 'p' + Date.now();
  presets.push({ id, label, cmd });
  savePresets(presets);
  return { id, label, cmd };
}

function updatePreset(id, label, cmd) {
  const presets = loadPresets();
  const idx = presets.findIndex(p => p.id === id);
  if (idx === -1) throw new Error('Preset not found');
  presets[idx] = { ...presets[idx], label, cmd };
  savePresets(presets);
  return presets[idx];
}

function deletePreset(id) {
  let presets = loadPresets();
  presets = presets.filter(p => p.id !== id);
  savePresets(presets);
  return { ok: true };
}

function createTerminalSession(cols, rows, env) {
  const shell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : 'bash');
  const session = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: process.env.HOME || '/root',
    env: { ...process.env, TERM: 'xterm-256color', ...env },
  });

  return session;
}

module.exports = { getPresets, addPreset, updatePreset, deletePreset, createTerminalSession };
