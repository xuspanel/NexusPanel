const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');

const QUARANTINE_DIR = '/var/virus-quarantine';
const HISTORY_FILE = path.join(__dirname, '../../data/scan-history.json');
const MAX_HISTORY = 100;
const ALLOWED_SCAN_BASES = ['/home', '/var/www', '/etc/vsftpd'];

const SCANS = new Map();
let scanIdCounter = 0;

let historyLock = false;
let historyLockTimer = null;
let quarantineLock = false;
let quarantineLockTimer = null;

function acquireHistoryLock(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryLock = () => {
      if (!historyLock) {
        historyLock = true;
        historyLockTimer = setTimeout(() => { historyLock = false; }, timeoutMs);
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Timeout acquiring history lock'));
        return;
      }
      setTimeout(tryLock, 50);
    };
    tryLock();
  });
}

function releaseHistoryLock() {
  if (historyLockTimer) { clearTimeout(historyLockTimer); historyLockTimer = null; }
  historyLock = false;
}

function acquireQuarantineLock(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryLock = () => {
      if (!quarantineLock) {
        quarantineLock = true;
        quarantineLockTimer = setTimeout(() => { quarantineLock = false; }, timeoutMs);
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Timeout acquiring quarantine lock'));
        return;
      }
      setTimeout(tryLock, 50);
    };
    tryLock();
  });
}

function releaseQuarantineLock() {
  if (quarantineLockTimer) { clearTimeout(quarantineLockTimer); quarantineLockTimer = null; }
  quarantineLock = false;
}

function isValidScanPath(scanPath) {
  if (!scanPath || typeof scanPath !== 'string') return false;
  if (scanPath.includes('..')) return false;
  try {
    const resolved = path.resolve(scanPath);
    return ALLOWED_SCAN_BASES.some(base => resolved === base || resolved.startsWith(base + '/'));
  } catch {
    return false;
  }
}

function isInsideQuarantine(filePath, quarantineId) {
  if (!filePath || typeof filePath !== 'string') return false;
  try {
    const resolved = path.resolve(filePath);
    const quarantineBase = path.resolve(QUARANTINE_DIR, quarantineId);
    return resolved === quarantineBase || resolved.startsWith(quarantineBase + '/');
  } catch {
    return false;
  }
}

function getTargetPaths(target, customPath) {
  switch (target) {
    case 'home': return ['/home'];
    case 'mail': {
      try {
        const users = fs.readdirSync('/home').filter(u => {
          try { return fs.statSync(path.join('/home', u, 'Maildir')).isDirectory(); } catch { return false; }
        });
        return users.map(u => path.join('/home', u, 'Maildir'));
      } catch { return []; }
    }
    case 'ftp': return ['/etc/vsftpd'];
    case 'web': return ['/var/www'];
    case 'custom': {
      if (!customPath || !isValidScanPath(customPath)) return [];
      return [customPath];
    }
    default: return [];
  }
}

async function runScan(target, customPath) {
  if (target === 'custom' && !isValidScanPath(customPath)) {
    throw new Error('Invalid scan path. Must be within /home, /var/www, or /etc/vsftpd');
  }

  const paths = getTargetPaths(target, customPath);
  if (paths.length === 0) throw new Error('No paths to scan');

  const scanId = 'scan_' + (++scanIdCounter) + '_' + Date.now();
  const outputFile = '/tmp/clamav_' + scanId + '.log';

  const args = ['-r', '--infected', '--log=' + outputFile, ...paths];

  const proc = spawn('clamscan', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  const scan = {
    id: scanId,
    target,
    path: customPath || paths.join(', '),
    paths,
    startTime: Date.now(),
    proc,
    outputFile,
    done: false,
    aborted: false,
    scanned: 0,
    infected: 0,
    errors: 0,
    infectedFiles: [],
    errorMessages: [],
  };
  SCANS.set(scanId, scan);

  proc.on('close', (code) => {
    scan.done = true;
    parseOutput(scan);
    saveScanToHistory(scan).catch(() => {});
  });

  proc.on('error', (err) => {
    scan.done = true;
    scan.errors++;
    scan.errorMessages.push(err.message);
    saveScanToHistory(scan).catch(() => {});
  });

  return scanId;
}

function parseOutput(scan) {
  try {
    const content = fs.readFileSync(scan.outputFile, 'utf8');
    const lines = content.split('\n');
    let inSummary = false;
    for (const line of lines) {
      if (line.includes('---') && line.includes('SCAN SUMMARY')) { inSummary = true; continue; }
      if (inSummary) {
        const m = line.match(/^Infected files:\s+(\d+)/);
        if (m) scan.infected = parseInt(m[1], 10);
        const m2 = line.match(/^Scanned files:\s+(\d+)/);
        if (m2) scan.scanned = parseInt(m2[1], 10);
        const m3 = line.match(/^Errors:\s+(\d+)/);
        if (m3) scan.errors = parseInt(m3[1], 10);
        continue;
      }
      const found = line.match(/^(.+?):\s+(.+)\s+FOUND$/);
      if (found) {
        scan.infectedFiles.push({ path: found[1].trim(), threat: found[2].trim() });
      }
      const errMatch = line.match(/^ERROR:\s+(.+)/);
      if (errMatch) scan.errorMessages.push(errMatch[1].trim());
    }
  } catch {}
}

function getScanStatus(scanId) {
  const scan = SCANS.get(scanId);
  if (!scan) return null;
  return {
    id: scan.id,
    target: scan.target,
    done: scan.done,
    aborted: scan.aborted,
    scanned: scan.scanned,
    infected: scan.infected,
    errors: scan.errors,
    startTime: scan.startTime,
    elapsed: Date.now() - scan.startTime,
    infectedFiles: scan.done ? scan.infectedFiles : [],
  };
}

function getScanResults(scanId) {
  const scan = SCANS.get(scanId);
  if (!scan) return null;
  return {
    id: scan.id,
    target: scan.target,
    path: scan.path,
    done: scan.done,
    aborted: scan.aborted,
    scanned: scan.scanned,
    infected: scan.infected,
    errors: scan.errors,
    startTime: scan.startTime,
    elapsed: Date.now() - scan.startTime,
    infectedFiles: scan.infectedFiles,
    errorMessages: scan.errorMessages,
  };
}

function abortScan(scanId) {
  const scan = SCANS.get(scanId);
  if (!scan || scan.done) return false;
  scan.proc.kill('SIGTERM');
  scan.aborted = true;
  scan.done = true;
  saveScanToHistory(scan).catch(() => {});
  return true;
}

function getClamStatus() {
  let clamVersion = null;
  let defsDate = null;
  let defsTimestamp = null;
  try {
    const out = execSync('clamscan --version', { encoding: 'utf8', timeout: 5000 }).trim();
    const m = out.match(/ClamAV\s+(\S+)\/(\S+)/);
    if (m) {
      clamVersion = m[1];
      defsDate = m[2];
      try {
        const parts = m[2].split(' ');
        const dateStr = parts[0];
        const timeStr = parts[1] || '00:00:00';
        defsTimestamp = new Date(dateStr + 'T' + timeStr).getTime();
      } catch {}
    }
  } catch {
    return { installed: false };
  }
  const stale = defsTimestamp ? (Date.now() - defsTimestamp > 7 * 24 * 60 * 60 * 1000) : false;
  return { installed: true, version: clamVersion, defsDate, stale };
}

async function updateDefs() {
  try {
    execSync('freshclam', { encoding: 'utf8', timeout: 120000 });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function ensureQuarantineDir() {
  try {
    await fsp.mkdir(QUARANTINE_DIR, { recursive: true, mode: 0o755 });
  } catch {}
}

async function computeFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function quarantineFiles(scanId) {
  const scan = SCANS.get(scanId);
  if (!scan) throw new Error('Scan not found');
  if (scan.infectedFiles.length === 0) throw new Error('No infected files to quarantine');

  await acquireQuarantineLock();
  try {
    await ensureQuarantineDir();
    const dir = path.join(QUARANTINE_DIR, scanId);
    await fsp.mkdir(dir, { recursive: true, mode: 0o755 });

    const quarantined = [];
    for (const f of scan.infectedFiles) {
      try {
        const src = f.path;
        let hash = null;
        try { hash = await computeFileHash(src); } catch {}
        const relPath = src.replace(/^\//, '');
        const dest = path.join(dir, relPath);
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.rename(src, dest);
        const meta = { originalPath: src, threat: f.threat, scanId, timestamp: Date.now(), sha256: hash };
        await fsp.writeFile(dest + '.meta.json', JSON.stringify(meta, null, 2));
        quarantined.push({ originalPath: src, quarantinedPath: dest, threat: f.threat, sha256: hash });
      } catch (err) {
        scan.errorMessages.push('Failed to quarantine ' + f.path + ': ' + err.message);
      }
    }
    return quarantined;
  } finally {
    releaseQuarantineLock();
  }
}

async function listQuarantine() {
  await ensureQuarantineDir();
  const items = [];
  try {
    const dirs = await fsp.readdir(QUARANTINE_DIR);
    for (const d of dirs) {
      const fullDir = path.join(QUARANTINE_DIR, d);
      const stat = await fsp.stat(fullDir);
      if (!stat.isDirectory()) continue;
      const files = await walkDir(fullDir);
      for (const f of files) {
        if (f.endsWith('.meta.json')) continue;
        const metaPath = f + '.meta.json';
        let meta = null;
        try {
          meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
        } catch {}
        items.push({
          quarantineId: d,
          quarantinedPath: f,
          fileName: path.basename(f),
          originalPath: meta ? meta.originalPath : null,
          threat: meta ? meta.threat : null,
          timestamp: meta ? meta.timestamp : null,
          sha256: meta ? meta.sha256 : null,
        });
      }
    }
  } catch {}
  return items;
}

async function walkDir(dir) {
  const results = [];
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) results.push(...await walkDir(full));
      else results.push(full);
    }
  } catch {}
  return results;
}

async function restoreFromQuarantine(quarantineId, filePath) {
  if (!isInsideQuarantine(filePath, quarantineId)) {
    throw new Error('Invalid file path: outside quarantine directory');
  }
  await acquireQuarantineLock();
  try {
    const src = filePath;
    const metaPath = src + '.meta.json';
    let meta = null;
    try { meta = JSON.parse(await fsp.readFile(metaPath, 'utf8')); } catch {}
    const dest = meta ? meta.originalPath : src.replace(path.join(QUARANTINE_DIR, quarantineId), '');
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.rename(src, dest);
    try { await fsp.unlink(metaPath); } catch {}
    return { restoredTo: dest };
  } finally {
    releaseQuarantineLock();
  }
}

async function deleteFromQuarantine(quarantineId, filePath) {
  if (!isInsideQuarantine(filePath, quarantineId)) {
    throw new Error('Invalid file path: outside quarantine directory');
  }
  await acquireQuarantineLock();
  try {
    const metaPath = filePath + '.meta.json';
    await fsp.unlink(filePath);
    try { await fsp.unlink(metaPath); } catch {}
    const dir = path.dirname(filePath);
    try {
      const remaining = await fsp.readdir(dir);
      if (remaining.length === 0 || (remaining.length === 1 && remaining[0] === '.meta.json')) {
        try { await fsp.rm(dir, { recursive: true }); } catch {}
      }
    } catch {}
    try {
      const parentDir = path.join(QUARANTINE_DIR, quarantineId);
      const remaining = await fsp.readdir(parentDir);
      if (remaining.length === 0) {
        try { await fsp.rm(parentDir, { recursive: true }); } catch {}
      }
    } catch {}
    return { deleted: true };
  } finally {
    releaseQuarantineLock();
  }
}

async function saveScanToHistory(scan) {
  await acquireHistoryLock();
  try {
    let history = [];
    try { history = JSON.parse(await fsp.readFile(HISTORY_FILE, 'utf8')); } catch {}
    const entry = {
      id: scan.id,
      target: scan.target,
      path: scan.path,
      startTime: scan.startTime,
      elapsed: Date.now() - scan.startTime,
      scanned: scan.scanned,
      infected: scan.infected,
      errors: scan.errors,
      aborted: scan.aborted,
      infectedFiles: scan.infectedFiles,
      errorMessages: scan.errorMessages,
      timestamp: Date.now(),
    };
    history.unshift(entry);
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    const tmp = HISTORY_FILE + '.tmp.' + Date.now();
    await fsp.writeFile(tmp, JSON.stringify(history, null, 2), 'utf8');
    await fsp.rename(tmp, HISTORY_FILE);
  } finally {
    releaseHistoryLock();
  }
}

async function getScanHistory(params = {}) {
  await acquireHistoryLock();
  try {
    let history = [];
    try { history = JSON.parse(await fsp.readFile(HISTORY_FILE, 'utf8')); } catch {}
    let filtered = history;

    if (params.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(h =>
        (h.path && h.path.toLowerCase().includes(q)) ||
        (h.target && h.target.toLowerCase().includes(q)) ||
        (h.id && h.id.toLowerCase().includes(q))
      );
    }
    if (params.target) {
      filtered = filtered.filter(h => h.target === params.target);
    }
    if (params.status === 'clean') {
      filtered = filtered.filter(h => h.infected === 0 && !h.aborted);
    } else if (params.status === 'infected') {
      filtered = filtered.filter(h => h.infected > 0);
    } else if (params.status === 'aborted') {
      filtered = filtered.filter(h => h.aborted);
    }

    const sortField = params.sort || 'timestamp';
    const sortDir = params.dir === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      const av = a[sortField] || 0;
      const bv = b[sortField] || 0;
      if (typeof av === 'string') return av.localeCompare(bv) * sortDir;
      return (av - bv) * sortDir;
    });

    const total = filtered.length;
    const page = Math.max(1, parseInt(params.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(params.limit) || 20));
    const pages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

    return { items, total, page, limit, pages };
  } finally {
    releaseHistoryLock();
  }
}

module.exports = {
  runScan, getScanStatus, getScanResults, abortScan,
  getClamStatus, updateDefs,
  quarantineFiles, listQuarantine, restoreFromQuarantine, deleteFromQuarantine,
  getScanHistory, isValidScanPath,
};
