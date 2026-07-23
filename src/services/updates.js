const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

function detectPackageManager() {
  try {
    const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
    const id = (osRelease.match(/^ID=(.+)$/m) || [])[1]?.toLowerCase().replace(/["']/g, '') || '';
    const idLike = (osRelease.match(/^ID_LIKE=(.+)$/m) || [])[1]?.toLowerCase().replace(/["']/g, '') || '';

    if (id === 'ubuntu' || id === 'debian' || idLike.includes('debian')) {
      return {
        check: 'apt list --upgradable 2>/dev/null',
        updateAll: 'DEBIAN_FRONTEND=noninteractive apt-get upgrade -y 2>&1',
        updateSingle: (pkg) => `DEBIAN_FRONTEND=noninteractive apt-get install --only-upgrade -y ${pkg} 2>&1`,
        format: 'apt'
      };
    }
  } catch {}
  return {
    check: 'dnf check-update 2>/dev/null',
    updateAll: 'dnf update -y 2>&1',
    updateSingle: (pkg) => `dnf update -y ${pkg} 2>&1`,
    format: 'dnf'
  };
}

function parseUpdates(output, format) {
  const lines = output.trim().split('\n');
  const updates = [];
  if (format === 'dnf') {
    let inList = false;
    for (const line of lines) {
      if (line === '' || line.includes('Last metadata')) continue;
      if (!inList) { inList = true; continue; }
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        updates.push({ name: parts[0], version: parts[1], repo: parts[2] });
      }
    }
  } else {
    for (const line of lines) {
      if (!line.includes('upgradable') || line.startsWith('Listing')) continue;
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const nameVer = parts[0].split('/');
        updates.push({ name: nameVer[0], version: parts[1], repo: nameVer[1] || 'apt' });
      }
    }
  }
  return updates;
}

function check() {
  const pm = detectPackageManager();
  try {
    const raw = execSync(pm.check, { encoding: 'utf8', timeout: 60000 });
    const updates = parseUpdates(raw, pm.format);
    return { count: updates.length, updates };
  } catch (e) {
    if (pm.format === 'dnf' && e.status === 100) {
      const updates = parseUpdates(e.stdout || '', pm.format);
      return { count: updates.length, updates };
    }
    return { count: 0, updates: [], error: e.message };
  }
}

function apply() {
  const pm = detectPackageManager();
  try {
    const raw = execSync(pm.updateAll, { encoding: 'utf8', timeout: 300000 });
    return { ok: true, output: raw.substring(raw.length - 500) };
  } catch (e) {
    return { error: e.stderr || e.message };
  }
}

function applySingle(name) {
  if (!name || typeof name !== 'string') return { error: 'Package name required' };
  const clean = name.replace(/[^a-zA-Z0-9._+\-]/g, '');
  if (!clean) return { error: 'Invalid package name' };
  const pm = detectPackageManager();
  try {
    const raw = execSync(pm.updateSingle(clean), { encoding: 'utf8', timeout: 300000 });
    return { ok: true, output: raw.substring(raw.length - 500) };
  } catch (e) {
    return { error: e.stderr || e.message };
  }
}

function getLocalVersion() {
  const root = path.join(__dirname, '..', '..');
  let version = null;
  try {
    const v = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
    if (/^\d+\.\d+\.\d+$/.test(v)) version = v;
  } catch {}
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (pkg.version && pkg.version !== version) {
      version = pkg.version;
      try { fs.writeFileSync(path.join(root, 'VERSION'), version, 'utf8'); } catch {}
    }
  } catch {}
  return version || '0.0.0';
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
  const localVersion = getLocalVersion();
  /* Invalidate cache when local version changes (panel was updated) */
  if (cache.localVersion && cache.localVersion !== localVersion) {
    cache = {};
  }
  if (!force && cache.lastCheck && typeof cache.lastCheck === 'number' && (now - cache.lastCheck) < 86400000) {
    return cache;
  }
  try {
    const remoteVersion = await fetchRemoteVersion();
    const updateAvailable = compareVersions(remoteVersion, localVersion) > 0;
    const result = { localVersion, remoteVersion, updateAvailable, changelog: getChangelog(), lastCheck: now };
    fs.writeFileSync(cachePath, JSON.stringify(result), 'utf8');
    return result;
  } catch (e) {
    /* Fetch failed — use cached remote version to still detect updates */
    if (cache.remoteVersion && typeof cache.remoteVersion === 'string') {
      const updateAvailable = compareVersions(cache.remoteVersion, localVersion) > 0;
      const result = { localVersion, remoteVersion: cache.remoteVersion, updateAvailable, changelog: getChangelog(), lastCheck: now };
      return result;
    }
    return { localVersion, remoteVersion: '0.0.0', updateAvailable: false, changelog: [], lastCheck: now };
  }
}

function fetchRemoteVersion() {
  return new Promise((resolve, reject) => {
    https.get('https://raw.githubusercontent.com/xuspanel/NexusPanel/main/VERSION', (res) => {
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
