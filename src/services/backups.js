const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { runSafe, runSafeSync } = require('../utils/shell');

const BACKUP_ROOT = '/var/backups/nexuspanel';
const META_FILE = path.join(__dirname, '..', '..', 'data', 'backups.json');
const TASK_STATE_FILE = path.join(__dirname, '..', '..', 'data', 'backup_task.json');
const TASK_TTL = 30 * 60 * 1000;
const MIN_DISK_BYTES = 500 * 1024 * 1024;

const runningTasks = new Map();

function loadTaskState() {
  try {
    if (fs.existsSync(TASK_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(TASK_STATE_FILE, 'utf8'));
      if (data && data.id) {
        data._recovered = true;
        if (data.status === 'running') {
          data.status = 'failed';
          data.error = 'Server was restarted while backup was in progress';
          data.progress = data.progress || 0;
          // Write partial results for recovered tasks
          if (data.results && data.results.length > 0 && data.timestamp) {
            try {
              const partial = {
                timestamp: data.timestamp,
                type: data.type || 'selected',
                items: data.results,
                totalSize: data.results.reduce((s, e) => s + (e.size || 0), 0),
                totalItems: data.results.length,
                failedItems: data.results.filter(e => e.error).length,
                createdAt: new Date().toISOString(),
                _partial: true,
                _recovered: true,
              };
              const meta = loadMeta();
              meta.unshift(partial);
              saveMeta(meta);
            } catch (_) {}
          }
        }
        runningTasks.set(data.id, data);
        saveTaskState();
      }
    }
  } catch (_) {}
}

function saveTaskState() {
  try {
    const tasks = [...runningTasks.values()].filter(t => t.status === 'running');
    if (tasks.length > 0) {
      if (!fs.existsSync(path.dirname(TASK_STATE_FILE))) fs.mkdirSync(path.dirname(TASK_STATE_FILE), { recursive: true });
      fs.writeFileSync(TASK_STATE_FILE, JSON.stringify(tasks[0], null, 2), 'utf8');
    } else {
      try { fs.unlinkSync(TASK_STATE_FILE); } catch (_) {}
    }
  } catch (_) {}
}

// Recover any stale task on startup
loadTaskState();

function loadMeta() {
  try {
    if (fs.existsSync(META_FILE)) return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  } catch (_) {}
  return [];
}

function saveMeta(meta) {
  if (!fs.existsSync(path.dirname(META_FILE))) fs.mkdirSync(path.dirname(META_FILE), { recursive: true });
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf8');
}

function ts() {
  const d = new Date();
  return d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') + '_' +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') +
    String(d.getSeconds()).padStart(2, '0');
}

function backupDir(t) {
  return path.join(BACKUP_ROOT, 'backup_' + t);
}

function checkDiskSpace() {
  try {
    const { stdout: dfOut } = runSafeSync('df', ['-B1', BACKUP_ROOT]);
    const lines = dfOut.trim().split('\n');
    const out = lines[lines.length - 1] || '';
    const parts = out.split(/\s+/);
    if (parts.length >= 4) {
      const avail = parseInt(parts[3]);
      if (avail < MIN_DISK_BYTES) throw new Error('Insufficient disk space. Available: ' + formatSize(avail) + ', required: ' + formatSize(MIN_DISK_BYTES));
    }
  } catch (e) {
    if (e.message.includes('Insufficient')) throw e;
  }
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return size.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function admZipSize(zip, outputPath) {
  zip.writeZip(outputPath);
  try { return { size: fs.statSync(outputPath).size }; } catch (_) { return { size: 0 }; }
}

function createDirArchive(sourceDir, outputPath) {
  if (!fs.existsSync(sourceDir)) return { size: 0, error: 'Directory not found: ' + sourceDir };
  try {
    const parent = path.dirname(sourceDir);
    const base = path.basename(sourceDir);
    const excludes = [
      '-x', '*/node_modules/*', '-x', '*/.git/*',
      '-x', '*/cache/*', '-x', '*/tmp/*',
      '-x', '*/containerd/*', '-x', '*/docker/*',
      '-x', '*/log/*', '-x', '*/apt/*',
      '-x', '*/Maildir/*',
    ];
    runSafeSync('zip', ['-r', '-q', outputPath, base, ...excludes], { timeout: 300000, cwd: parent });
  } catch (_) {}
  try { return { size: fs.statSync(outputPath).size }; } catch (_) { return { size: 0, error: 'output not created (possibly too large)' }; }
}

function createItemArchive(filePath, archivePath, archiveName) {
  if (!fs.existsSync(filePath)) return { size: 0, error: 'File not found: ' + filePath };
  const zip = new AdmZip();
  zip.addLocalFile(filePath, '', archiveName);
  return admZipSize(zip, archivePath);
}

function createSQLArchive(dumpContent, outputPath, archiveName) {
  const zip = new AdmZip();
  zip.addFile(archiveName, Buffer.from(dumpContent, 'utf8'));
  return admZipSize(zip, outputPath);
}

async function backupPostgreSQL(outputPath, timestamp) {
  const sqlName = 'PostgreSQL_Databases_' + timestamp + '.sql';
  try {
    const { stdout: dump } = await runSafe('sudo', ['-u', 'postgres', 'pg_dumpall', '--clean', '--if-exists'], { timeout: 600000, maxBuffer: 500 * 1024 * 1024 });
    const result = createSQLArchive(dump, outputPath, sqlName);
    return { ...result, name: sqlName };
  } catch (e) {
    const fallback = '-- PostgreSQL dump failed: ' + e.message;
    const result = createSQLArchive(fallback, outputPath, sqlName);
    return { ...result, error: e.message, name: sqlName };
  }
}

async function backupEmails(outputPath, timestamp) {
  const zip = new AdmZip();
  let count = 0;
  try {
    const entries = fs.readdirSync('/home/');
    for (const entry of entries) {
      const maildir = path.join('/home/', entry, 'Maildir');
      try {
        if (fs.statSync(maildir).isDirectory()) {
          zip.addLocalFolder(maildir, entry + '_Maildir');
          count++;
        }
      } catch (_) {}
    }
  } catch (_) {}
  if (count === 0) zip.addFile('README.txt', Buffer.from('No Maildirs found', 'utf8'));
  return admZipSize(zip, outputPath);
}

async function backupFTP(outputPath) {
  const vsftpdDir = '/etc/vsftpd';
  if (!fs.existsSync(vsftpdDir)) {
    return createSQLArchive('No vsftpd configuration found', outputPath, 'README.txt');
  }
  const zip = new AdmZip();
  zip.addLocalFolder(vsftpdDir, 'vsftpd');
  return admZipSize(zip, outputPath);
}

async function backupUsers(outputPath, timestamp) {
  const usersPath = path.join(__dirname, '..', '..', 'data', 'users.json');
  if (!fs.existsSync(usersPath)) {
    return createSQLArchive('No VPS users data found', outputPath, 'README.txt');
  }
  return createItemArchive(usersPath, outputPath, 'VPS_Users_' + timestamp + '.json');
}

const ITEM_DEFS = [
  { id: 'root', label: '/root/ folder', icon: '📂', run: (out, ts) => createDirArchive('/root', out) },
  { id: 'opt', label: '/opt/', icon: '📂', run: (out, ts) => createDirArchive('/opt', out) },
  { id: 'var', label: '/var/', icon: '📂', run: (out, ts) => createDirArchive('/var', out) },
  { id: 'etc', label: '/etc/', icon: '⚙️', run: (out, ts) => createDirArchive('/etc', out) },
  { id: 'home', label: '/home/', icon: '🏠', run: (out, ts) => createDirArchive('/home', out) },
  { id: 'postgres', label: 'PostgreSQL Databases', icon: '🗄️', run: (out, ts) => backupPostgreSQL(out, ts) },
  { id: 'ftp', label: 'FTP Accounts', icon: '📡', run: (out, ts) => backupFTP(out) },
  { id: 'emails', label: 'Emails (Maildir)', icon: '✉️', run: (out, ts) => backupEmails(out, ts) },
  { id: 'users', label: 'VPS Users', icon: '👥', run: (out, ts) => backupUsers(out, ts) },
];

function getItemDef(id) {
  return ITEM_DEFS.find(i => i.id === id);
}

function startBackup(items, type) {
  for (const [, task] of runningTasks) {
    if (task.status === 'running') throw new Error('A backup task is already running');
  }
  const now = ts();
  const taskId = crypto.randomBytes(8).toString('hex');
  const backupPath = backupDir(now);
  items = items.filter(id => getItemDef(id));
  if (items.length === 0) throw new Error('No valid backup items selected');

  const task = {
    id: taskId,
    timestamp: now,
    type: type || (items.length === ITEM_DEFS.length ? 'full' : 'selected'),
    items,
    status: 'running',
    progress: 0,
    currentItem: '',
    results: [],
    startedAt: Date.now(),
    expiresAt: Date.now() + TASK_TTL,
  };
  runningTasks.set(taskId, task);
  saveTaskState();

  setImmediate(async () => {
    try {
      if (!fs.existsSync(backupPath)) fs.mkdirSync(backupPath, { recursive: true });
      checkDiskSpace();
      const meta = loadMeta();
      const completed = [];
      for (let i = 0; i < items.length; i++) {
        const id = items[i];
        const def = getItemDef(id);
        if (!def) continue;
        task.currentItem = def.label;
        task.progress = Math.round((i / items.length) * 100);
        saveTaskState();
        const fileName = id + '_' + now + '.zip';
        const outPath = path.join(backupPath, fileName);
        try {
          const result = await def.run(outPath, now);
          const entry = { id, label: def.label, icon: def.icon, file: fileName, size: result.size || 0, error: result.error || null };
          completed.push(entry);
          task.results.push(entry);
        } catch (e) {
          const entry = { id, label: def.label, icon: def.icon, file: fileName, size: 0, error: e.message };
          completed.push(entry);
          task.results.push(entry);
        }
      }
      task.progress = 100;
      task.currentItem = '';

      const totalSize = completed.reduce((s, e) => s + (e.size || 0), 0);
      const failedCount = completed.filter(e => e.error).length;
      const backupEntry = {
        timestamp: now,
        type: task.type,
        items: completed,
        totalSize,
        totalItems: completed.length,
        failedItems: failedCount,
        createdAt: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(backupPath, 'info.json'), JSON.stringify(backupEntry, null, 2), 'utf8');
      meta.unshift(backupEntry);
      saveMeta(meta);
      task.status = failedCount === completed.length ? 'failed' : 'complete';
      saveTaskState();
    } catch (e) {
      task.status = 'failed';
      task.error = e.message;
      saveTaskState();
    }
  });

  return { taskId, timestamp: now, items: task.items };
}

function getTaskStatus(taskId) {
  const task = runningTasks.get(taskId);
  if (!task) return { status: 'not_found' };
  if (task.status !== 'running' && Date.now() > task.expiresAt) {
    runningTasks.delete(taskId);
    saveTaskState();
    return { status: 'expired' };
  }
  return {
    status: task.status,
    progress: task.progress,
    currentItem: task.currentItem,
    items: task.items,
    results: task.results,
    error: task.error || null,
  };
}

function getCurrentTask() {
  const now = Date.now();
  for (const [id, task] of runningTasks) {
    if (task.status === 'running') {
      return { taskId: id, status: 'running', progress: task.progress, currentItem: task.currentItem, items: task.items, results: task.results, error: task.error || null };
    }
  }
  for (const [id, task] of runningTasks) {
    if (now < task.expiresAt) {
      return { taskId: id, status: task.status, progress: task.progress, currentItem: task.currentItem, items: task.items, results: task.results, error: task.error || null };
    }
  }
  return null;
}

function listBackups() {
  return loadMeta();
}

function getBackupInfo(timestamp) {
  const meta = loadMeta();
  const entry = meta.find(e => e.timestamp === timestamp);
  if (!entry) throw new Error('Backup not found: ' + timestamp);
  return entry;
}

function deleteBackup(timestamp) {
  let meta = loadMeta();
  const idx = meta.findIndex(e => e.timestamp === timestamp);
  if (idx === -1) throw new Error('Backup not found: ' + timestamp);
  meta.splice(idx, 1);
  saveMeta(meta);
  const p = backupDir(timestamp);
  const resolved = path.resolve(p);
  if (!resolved.startsWith(path.resolve(BACKUP_ROOT) + path.sep)) {
    throw new Error('Path traversal detected');
  }
  try { fs.rmSync(resolved, { recursive: true, force: true }); } catch (_) {}
  return { ok: true };
}

function resolveDownload(timestamp, filename) {
  const p = backupDir(timestamp);
  const resolved = path.resolve(p, filename || '');
  if (!resolved.startsWith(p)) throw new Error('Invalid path');
  if (!fs.existsSync(resolved)) throw new Error('File not found');
  const stat = fs.statSync(resolved);
  return { path: resolved, isDirectory: stat.isDirectory(), size: stat.size };
}

module.exports = {
  startBackup,
  getTaskStatus,
  getCurrentTask,
  listBackups,
  getBackupInfo,
  deleteBackup,
  resolveDownload,
  formatSize,
  ITEM_DEFS,
};
