const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

const QUARANTINE_DIR = '/var/virus-quarantine';
const SCANS = new Map();
let scanIdCounter = 0;

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
    case 'custom': return customPath ? [customPath] : [];
    default: return [];
  }
}

async function runScan(target, customPath) {
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
  });

  proc.on('error', (err) => {
    scan.done = true;
    scan.errors++;
    scan.errorMessages.push(err.message);
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
  return true;
}

function getClamStatus() {
  let clamVersion = null;
  let defsDate = null;
  try {
    const out = execSync('clamscan --version', { encoding: 'utf8', timeout: 5000 }).trim();
    const m = out.match(/ClamAV\s+(\S+)\/(\S+)/);
    if (m) {
      clamVersion = m[1];
      defsDate = m[2];
    }
  } catch {
    return { installed: false };
  }
  return { installed: true, version: clamVersion, defsDate };
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

async function quarantineFiles(scanId) {
  const scan = SCANS.get(scanId);
  if (!scan) throw new Error('Scan not found');
  if (scan.infectedFiles.length === 0) throw new Error('No infected files to quarantine');

  await ensureQuarantineDir();
  const dir = path.join(QUARANTINE_DIR, scanId);
  await fsp.mkdir(dir, { recursive: true, mode: 0o755 });

  const quarantined = [];
  for (const f of scan.infectedFiles) {
    try {
      const src = f.path;
      const relPath = src.replace(/^\//, '');
      const dest = path.join(dir, relPath);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.rename(src, dest);
      const meta = { originalPath: src, threat: f.threat, scanId, timestamp: Date.now() };
      await fsp.writeFile(dest + '.meta.json', JSON.stringify(meta, null, 2));
      quarantined.push({ originalPath: src, quarantinedPath: dest, threat: f.threat });
    } catch (err) {
      scan.errorMessages.push('Failed to quarantine ' + f.path + ': ' + err.message);
    }
  }
  return quarantined;
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
  const src = filePath;
  const metaPath = src + '.meta.json';
  let meta = null;
  try { meta = JSON.parse(await fsp.readFile(metaPath, 'utf8')); } catch {}
  const dest = meta ? meta.originalPath : src.replace(path.join(QUARANTINE_DIR, quarantineId), '');
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.rename(src, dest);
  try { await fsp.unlink(metaPath); } catch {}
  return { restoredTo: dest };
}

async function deleteFromQuarantine(quarantineId, filePath) {
  const metaPath = filePath + '.meta.json';
  await fsp.unlink(filePath);
  try { await fsp.unlink(metaPath); } catch {}
  const dir = path.dirname(filePath);
  try {
    const remaining = await fsp.readdir(dir);
    if (remaining.length === 0 || (remaining.length === 1 && remaining[0] === '.meta.json')) {
      try { await fsp.rmdir(dir, { recursive: true }); } catch {}
    }
  } catch {}
  try {
    const parentDir = path.join(QUARANTINE_DIR, quarantineId);
    const remaining = await fsp.readdir(parentDir);
    if (remaining.length === 0) {
      try { await fsp.rmdir(parentDir); } catch {}
    }
  } catch {}
  return { deleted: true };
}

module.exports = {
  runScan, getScanStatus, getScanResults, abortScan,
  getClamStatus, updateDefs,
  quarantineFiles, listQuarantine, restoreFromQuarantine, deleteFromQuarantine,
};
