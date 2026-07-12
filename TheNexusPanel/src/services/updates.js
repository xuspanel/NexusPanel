const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

function check() {
  try {
    const raw = execSync('dnf check-update 2>/dev/null', { encoding: 'utf8', timeout: 60000 });
    const lines = raw.trim().split('\n');
    const updates = [];
    let inList = false;
    for (const line of lines) {
      if (line === '' || line.includes('Last metadata')) continue;
      if (!inList) { inList = true; continue; }
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        updates.push({ name: parts[0], version: parts[1], repo: parts[2] });
      }
    }
    return { count: updates.length, updates };
  } catch (e) {
    if (e.status === 100) {
      const lines = (e.stdout || '').trim().split('\n');
      const updates = [];
      let inList = false;
      for (const line of lines) {
        if (line === '' || line.includes('Last metadata')) continue;
        if (!inList) { inList = true; continue; }
        const parts = line.split(/\s+/);
        if (parts.length >= 3) updates.push({ name: parts[0], version: parts[1], repo: parts[2] });
      }
      return { count: updates.length, updates };
    }
    return { count: 0, updates: [], error: e.message };
  }
}

function apply() {
  try {
    const raw = execSync('dnf update -y 2>&1', { encoding: 'utf8', timeout: 300000 });
    return { ok: true, output: raw.substring(raw.length - 500) };
  } catch (e) {
    return { error: e.stderr || e.message };
  }
}

function applySingle(name) {
  if (!name || typeof name !== 'string') return { error: 'Package name required' };
  const clean = name.replace(/[^a-zA-Z0-9._+\-]/g, '');
  if (!clean) return { error: 'Invalid package name' };
  try {
    const raw = execSync('dnf update -y ' + clean + ' 2>&1', { encoding: 'utf8', timeout: 300000 });
    return { ok: true, output: raw.substring(raw.length - 500) };
  } catch (e) {
    return { error: e.stderr || e.message };
  }
}

function getLocalVersion() {
  const versionPath = path.join(__dirname, '..', '..', 'VERSION');
  try { return fs.readFileSync(versionPath, 'utf8').trim(); } catch { return '0.0.0'; }
}

function getChangelog() {
  const changelogPath = path.join(__dirname, '..', '..', 'CHANGELOG.md');
  try {
    const content = fs.readFileSync(changelogPath, 'utf8');
    const entries = [];
    const regex = /##\s*\[([^\]]+)\]\s*-\s*(.+?)\n([\s\S]*?)(?=\n##\s|$)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const changes = match[3].trim().split('\n').filter(l => l.trim().startsWith('-')).map(l => l.replace(/^-\s*/, '').trim());
      entries.push({ version: match[1], date: match[2].trim(), changes });
    }
    return entries;
  } catch { return []; }
}

async function checkPanelVersion(force) {
  const now = Date.now();
  const cachePath = path.join(__dirname, '..', '..', 'data', 'panel-version-cache.json');
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch {}
  if (!force && cache.lastCheck && (now - cache.lastCheck) < 86400000) return cache;
  const localVersion = getLocalVersion();
  try {
    const remoteVersion = await fetchRemoteVersion();
    const updateAvailable = compareVersions(remoteVersion, localVersion) > 0;
    const result = { localVersion, remoteVersion, updateAvailable, changelog: getChangelog(), lastCheck: new Date(now).toISOString() };
    fs.writeFileSync(cachePath, JSON.stringify(result), 'utf8');
    return result;
  } catch (e) {
    if (cache.localVersion) return cache;
    return { localVersion, remoteVersion: '0.0.0', updateAvailable: false, changelog: [], lastCheck: new Date(now).toISOString() };
  }
}

function fetchRemoteVersion() {
  return new Promise((resolve, reject) => {
    https.get('https://raw.githubusercontent.com/xuspanel/NexusPanel/master/VERSION', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data.trim()));
    }).on('error', reject);
  });
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0, nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function applyPanelUpdate(callback) {
  const panelRoot = path.join(__dirname, '..', '..');
  const updateScript = path.join(panelRoot, 'update.sh');
  const child = require('child_process').spawn('/bin/bash', [fs.existsSync(updateScript) ? updateScript : '-c', fs.existsSync(updateScript) ? '' : 'cd ' + panelRoot + ' && git pull && npm install 2>&1'], { cwd: panelRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', d => output += d.toString());
  child.stderr.on('data', d => output += d.toString());
  child.on('exit', (code) => {
    if (code === 0) callback(null, output);
    else callback(new Error('Update failed with code ' + code), output);
  });
  return child;
}

module.exports = { check, apply, applySingle, checkPanelVersion, applyPanelUpdate };
