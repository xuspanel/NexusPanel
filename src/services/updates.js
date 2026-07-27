const { spawn, spawnSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { runSafeSync } = require('../utils/shell');

const ROOT = path.join(__dirname, '..', '..');
const HISTORY_PATH = path.join(ROOT, 'data', 'update-history.json');
const PANEL_CACHE_PATH = path.join(ROOT, 'data', 'panel-version-cache.json');

function detectPackageManager() {
  try {
    const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
    const id = (osRelease.match(/^ID=(.+)$/m) || [])[1]?.toLowerCase().replace(/["']/g, '') || '';
    const idLike = (osRelease.match(/^ID_LIKE=(.+)$/m) || [])[1]?.toLowerCase().replace(/["']/g, '') || '';

    if (id === 'ubuntu' || id === 'debian' || idLike.includes('debian')) {
      return {
        check: { cmd: 'apt', args: ['list', '--upgradable'] },
        updateAll: { cmd: 'apt-get', args: ['-y', 'upgrade'] },
        updateSingle: (pkg) => ({ cmd: 'apt-get', args: ['-y', 'install', '--only-upgrade', pkg] }),
        search: (q) => ({ cmd: 'apt-cache', args: ['search', q] }),
        info: (pkg) => ({ cmd: 'apt-cache', args: ['show', pkg] }),
        installed: (pkg) => ({ cmd: 'dpkg-query', args: ['-W', '-f=${Version}', pkg] }),
        format: 'apt',
        env: { DEBIAN_FRONTEND: 'noninteractive' }
      };
    }
  } catch {}

  return {
    check: { cmd: 'dnf', args: ['check-update'] },
    updateAll: { cmd: 'dnf', args: ['-y', 'update'] },
    updateSingle: (pkg) => ({ cmd: 'dnf', args: ['-y', 'update', pkg] }),
    search: (q) => ({ cmd: 'dnf', args: ['search', q] }),
    info: (pkg) => ({ cmd: 'dnf', args: ['info', pkg] }),
    installed: (pkg) => ({ cmd: 'rpm', args: ['-q', pkg] }),
    format: 'dnf',
    env: {}
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

function sanitizePackageName(name) {
  if (!name || typeof name !== 'string') return null;
  const clean = name.replace(/[^a-zA-Z0-9._+\-]/g, '');
  if (!clean || clean.length > 200) return null;
  if (clean.includes('..') || clean.startsWith('-')) return null;
  return clean;
}

function check() {
  const pm = detectPackageManager();
  const { check } = pm;
  const env = { ...process.env, ...pm.env };
  try {
    const r = runSafeSync(check.cmd, check.args, { timeout: 60000, env });
    const raw = r.stdout || '';
    const updates = parseUpdates(raw, pm.format);
    return { count: updates.length, updates, pm: pm.format };
  } catch (e) {
    return { count: 0, updates: [], pm: pm.format, error: e.message };
  }
}

function apply() {
  const pm = detectPackageManager();
  const { updateAll } = pm;
  const env = { ...process.env, ...pm.env };
  try {
    const r = runSafeSync(updateAll.cmd, updateAll.args, { timeout: 300000, env });
    const output = r.stdout || '';
    const tail = output.length > 800 ? output.substring(output.length - 800) : output;
    if (r.status === 0) {
      return { ok: true, output: tail };
    }
    return { error: r.stderr || 'Update failed with exit code ' + r.status, output: tail };
  } catch (e) {
    return { error: e.message };
  }
}

function applySingle(name) {
  const clean = sanitizePackageName(name);
  if (!clean) return { error: 'Invalid package name' };
  const pm = detectPackageManager();
  const { updateSingle } = pm;
  const cmd = updateSingle(clean);
  const env = { ...process.env, ...pm.env };
  try {
    const r = runSafeSync(cmd.cmd, cmd.args, { timeout: 300000, env });
    const output = r.stdout || '';
    const tail = output.length > 800 ? output.substring(output.length - 800) : output;
    if (r.status === 0) {
      return { ok: true, output: tail, package: clean };
    }
    return { error: r.stderr || 'Update failed with exit code ' + r.status, output: tail };
  } catch (e) {
    return { error: e.message };
  }
}

function searchPackages(query) {
  if (!query || typeof query !== 'string') return { results: [] };
  const q = query.trim().replace(/[^a-zA-Z0-9._+\-\s]/g, '').substring(0, 100);
  if (!q) return { results: [] };
  const pm = detectPackageManager();
  const cmd = pm.search(q);
  const env = { ...process.env, ...pm.env };
  try {
    const r = runSafeSync(cmd.cmd, cmd.args, { timeout: 30000, env });
    const output = r.stdout || '';
    return { results: parseSearchResults(output, pm.format), query: q };
  } catch (e) {
    return { results: [], query: q, error: e.message };
  }
}

function parseSearchResults(output, format) {
  const lines = output.trim().split('\n');
  const results = [];
  if (format === 'dnf') {
    let inList = false;
    for (const line of lines) {
      if (line.includes('No matches')) break;
      if (!inList) {
        if (line.includes('Matched') || line.includes('Name')) { inList = true; continue; }
        continue;
      }
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        results.push({ name: parts[0], version: parts[1] || '', description: parts.slice(2).join(' ') });
      }
    }
  } else {
    for (const line of lines) {
      const parts = line.split(' - ');
      if (parts.length >= 2) {
        results.push({ name: parts[0].trim(), description: parts.slice(1).join(' - ').trim(), version: '' });
      }
    }
  }
  return results.slice(0, 50);
}

function getPackageInfo(name) {
  const clean = sanitizePackageName(name);
  if (!clean) return { error: 'Invalid package name' };
  const pm = detectPackageManager();
  const cmd = pm.info(clean);
  const env = { ...process.env, ...pm.env };
  try {
    const r = runSafeSync(cmd.cmd, cmd.args, { timeout: 15000, env });
    const output = r.stdout || '';
    if (r.status !== 0 && !output) {
      return { error: 'Package not found', name: clean };
    }
    return { info: parsePackageInfo(output, pm.format), name: clean };
  } catch (e) {
    return { error: e.message, name: clean };
  }
}

function parsePackageInfo(output, format) {
  const info = {};
  if (format === 'dnf') {
    const lines = output.split('\n');
    let currentKey = '';
    for (const line of lines) {
      const kvMatch = line.match(/^(\w[\w\s]*?):\s+(.+)/);
      if (kvMatch) {
        currentKey = kvMatch[1].trim().toLowerCase().replace(/\s+/g, '_');
        info[currentKey] = kvMatch[2].trim();
      } else if (currentKey && line.startsWith(' ')) {
        info[currentKey] += ' ' + line.trim();
      }
    }
  } else {
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes(':')) {
        const idx = line.indexOf(':');
        const key = line.substring(0, idx).trim().toLowerCase().replace(/\s+/g, '_');
        const val = line.substring(idx + 1).trim();
        if (key) info[key] = val;
      }
    }
  }
  return info;
}

function getInstalledVersion(name) {
  const clean = sanitizePackageName(name);
  if (!clean) return null;
  const pm = detectPackageManager();
  const cmd = pm.installed(clean);
  try {
    const r = runSafeSync(cmd.cmd, cmd.args, { timeout: 5000 });
    if (r.status === 0) {
      return (r.stdout || '').trim();
    }
  } catch {}
  return null;
}

function getSecurityAdvisories() {
  const pm = detectPackageManager();
  if (pm.format !== 'dnf') {
    return { advisories: [], supported: false };
  }
  try {
    const r = runSafeSync('dnf', ['updateinfo', 'list', '--security'], { timeout: 60000 });
    const output = r.stdout || '';
    return { advisories: parseSecurityAdvisories(output), supported: true };
  } catch (e) {
    return { advisories: [], supported: true, error: e.message };
  }
}

function parseSecurityAdvisories(output) {
  const advisories = [];
  const lines = output.trim().split('\n');
  for (const line of lines) {
    if (line.includes('Security') || line.includes('CVE') || line.includes('RHSA')) {
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        const severity = detectSeverity(line);
        advisories.push({
          id: parts[0] || '',
          type: parts[1] || '',
          severity,
          packages: parts.slice(2).join(' ')
        });
      }
    }
  }
  return advisories.slice(0, 100);
}

function detectSeverity(line) {
  const lower = line.toLowerCase();
  if (lower.includes('critical')) return 'critical';
  if (lower.includes('important')) return 'important';
  if (lower.includes('moderate')) return 'moderate';
  if (lower.includes('low')) return 'low';
  return 'unknown';
}

function getUpdateHistory() {
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
    return { history: Array.isArray(data) ? data.slice(0, 100) : [] };
  } catch {
    return { history: [] };
  }
}

function recordUpdate(entry) {
  let history = [];
  try {
    history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
    if (!Array.isArray(history)) history = [];
  } catch {}

  history.unshift({
    id: 'upd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
    timestamp: new Date().toISOString(),
    ...entry
  });

  if (history.length > 100) history = history.slice(0, 100);

  try {
    const tmpPath = HISTORY_PATH + '.tmp.' + process.pid;
    fs.writeFileSync(tmpPath, JSON.stringify(history, null, 2), 'utf8');
    fs.renameSync(tmpPath, HISTORY_PATH);
  } catch {}
}

function getLocalVersion() {
  let version = null;
  try {
    const v = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
    if (/^\d+\.\d+\.\d+$/.test(v)) version = v;
  } catch {}
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    if (pkg.version && pkg.version !== version) {
      version = pkg.version;
      try { fs.writeFileSync(path.join(ROOT, 'VERSION'), version, 'utf8'); } catch {}
    }
  } catch {}
  return version || '0.0.0';
}

function getChangelog() {
  const changelogPath = path.join(ROOT, 'CHANGELOG.md');
  try {
    const content = fs.readFileSync(changelogPath, 'utf8');
    const entries = [];
    const regex = /##\s*\[([^\]]+)\]\s*-\s*(.+?)\n([\s\S]*?)(?=\n##\s|$)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const changes = match[3].trim().split('\n')
        .filter(l => l.trim().startsWith('-'))
        .map(l => l.replace(/^-\s*/, '').trim());
      entries.push({ version: match[1], date: match[2].trim(), changes });
    }
    return entries;
  } catch {
    return [];
  }
}

async function checkPanelVersion(force) {
  const now = Date.now();
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(PANEL_CACHE_PATH, 'utf8')); } catch {}
  const localVersion = getLocalVersion();

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
    try {
      const tmpPath = PANEL_CACHE_PATH + '.tmp.' + process.pid;
      fs.writeFileSync(tmpPath, JSON.stringify(result), 'utf8');
      fs.renameSync(tmpPath, PANEL_CACHE_PATH);
    } catch {}
    return result;
  } catch (e) {
    if (cache.remoteVersion && typeof cache.remoteVersion === 'string') {
      const updateAvailable = compareVersions(cache.remoteVersion, localVersion) > 0;
      return { localVersion, remoteVersion: cache.remoteVersion, updateAvailable, changelog: getChangelog(), lastCheck: now };
    }
    return { localVersion, remoteVersion: '0.0.0', updateAvailable: false, changelog: [], lastCheck: now };
  }
}

function fetchRemoteVersion() {
  return new Promise((resolve, reject) => {
    const req = https.get('https://raw.githubusercontent.com/xuspanel/NexusPanel/main/VERSION', { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data.trim()));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
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

function applyPanelUpdate() {
  return new Promise((resolve, reject) => {
    const panelRoot = ROOT;
    const updateScript = path.join(panelRoot, 'update.sh');
    const hasScript = fs.existsSync(updateScript);

    const child = spawn('/bin/bash', hasScript ? [updateScript] : ['-c', 'cd ' + panelRoot + ' && git pull && npm install 2>&1'], {
      cwd: panelRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    child._output = '';
    child._success = false;

    child.stdout.on('data', d => { child._output += d.toString(); });
    child.stderr.on('data', d => { child._output += d.toString(); });
    child.on('exit', (code) => {
      child._success = code === 0;
      child._exitCode = code;
      if (code === 0) resolve({ ok: true, output: child._output });
      else reject(new Error('Update failed with exit code ' + code));
    });
    child.on('error', (err) => reject(err));
  });
}

function spawnPanelUpdateStream() {
  const panelRoot = ROOT;
  const updateScript = path.join(panelRoot, 'update.sh');
  const hasScript = fs.existsSync(updateScript);

  const child = spawn('/bin/bash', hasScript ? [updateScript] : ['-c', 'cd ' + panelRoot + ' && git pull && npm install 2>&1'], {
    cwd: panelRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' }
  });

  return child;
}

module.exports = {
  check, apply, applySingle,
  searchPackages, getPackageInfo, getInstalledVersion,
  getSecurityAdvisories,
  getUpdateHistory, recordUpdate,
  getLocalVersion, getChangelog,
  checkPanelVersion, applyPanelUpdate, spawnPanelUpdateStream,
  detectPackageManager, sanitizePackageName, compareVersions
};
