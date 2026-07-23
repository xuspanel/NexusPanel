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
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const NGINX_CONF_DIR = '/etc/nginx/conf.d';
const MAX_SCHEDULER_BACKUP_TIME = 600000;

const runningTasks = new Map();
let metaLock = false;
const META_LOCK_TIMEOUT = 5000;

function acquireMetaLock() {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const wait = () => {
      if (!metaLock) { metaLock = true; return resolve(); }
      if (Date.now() - start > META_LOCK_TIMEOUT) return reject(new Error('Metadata write lock timeout'));
      setTimeout(wait, 10);
    };
    wait();
  });
}

function releaseMetaLock() { metaLock = false; }

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
              saveMetaSync(meta);
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
      const dir = path.dirname(TASK_STATE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmpFile = TASK_STATE_FILE + '.tmp';
      fs.writeFileSync(tmpFile, JSON.stringify(tasks[0], null, 2), 'utf8');
      fs.renameSync(tmpFile, TASK_STATE_FILE);
    } else {
      try { fs.unlinkSync(TASK_STATE_FILE); } catch (_) {}
    }
  } catch (_) {}
}

loadTaskState();

function loadMeta() {
  try {
    if (fs.existsSync(META_FILE)) {
      return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[Backups] Failed to load metadata:', err.message);
  }
  return [];
}

function saveMetaSync(meta) {
  const dir = path.dirname(META_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpFile = META_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(meta, null, 2), 'utf8');
  fs.renameSync(tmpFile, META_FILE);
}

async function saveMeta(meta) {
  await acquireMetaLock();
  try {
    saveMetaSync(meta);
  } finally {
    releaseMetaLock();
  }
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
      const avail = parseInt(parts[3], 10);
      if (!isNaN(avail) && avail < MIN_DISK_BYTES) {
        throw new Error('Insufficient disk space. Available: ' + formatSize(avail) + ', required: ' + formatSize(MIN_DISK_BYTES));
      }
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

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
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
  } catch (e) {
    return { size: 0, error: e.message };
  }
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

function createMultiFileArchive(files, outputPath, archiveName) {
  const zip = new AdmZip();
  for (const { name, content } of files) {
    if (typeof content === 'string') {
      zip.addFile(name, Buffer.from(content, 'utf8'));
    } else if (Buffer.isBuffer(content)) {
      zip.addFile(name, content);
    }
  }
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
  const usersPath = path.join(DATA_DIR, 'users.json');
  if (!fs.existsSync(usersPath)) {
    return createSQLArchive('No VPS users data found', outputPath, 'README.txt');
  }
  return createItemArchive(usersPath, outputPath, 'VPS_Users_' + timestamp + '.json');
}

async function backupNginx(outputPath, timestamp) {
  const files = [];
  try {
    if (fs.existsSync(NGINX_CONF_DIR)) {
      const confs = fs.readdirSync(NGINX_CONF_DIR).filter(f => f.endsWith('.conf') && !f.includes('.bak'));
      for (const conf of confs) {
        const content = fs.readFileSync(path.join(NGINX_CONF_DIR, conf), 'utf8');
        files.push({ name: 'conf.d/' + conf, content });
      }
    }
    const mainConf = '/etc/nginx/nginx.conf';
    if (fs.existsSync(mainConf)) {
      files.push({ name: 'nginx.conf', content: fs.readFileSync(mainConf, 'utf8') });
    }
  } catch (_) {}
  if (files.length === 0) {
    files.push({ name: 'README.txt', content: 'No nginx configurations found' });
  }
  return createMultiFileArchive(files, outputPath, 'nginx_configs.zip');
}

async function backupPanelData(outputPath, timestamp) {
  const files = [];
  try {
    if (fs.existsSync(DATA_DIR)) {
      const jsonFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
      for (const f of jsonFiles) {
        const content = fs.readFileSync(path.join(DATA_DIR, f), 'utf8');
        files.push({ name: f, content });
      }
    }
    const envFile = path.join(DATA_DIR, '..', '.env');
    if (fs.existsSync(envFile)) {
      files.push({ name: '.env', content: fs.readFileSync(envFile, 'utf8') });
    }
    const pkgFile = path.join(DATA_DIR, '..', 'package.json');
    if (fs.existsSync(pkgFile)) {
      files.push({ name: 'package.json', content: fs.readFileSync(pkgFile, 'utf8') });
    }
  } catch (_) {}
  if (files.length === 0) {
    files.push({ name: 'README.txt', content: 'No panel data found' });
  }
  return createMultiFileArchive(files, outputPath, 'panel_data.zip');
}

const ITEM_DEFS = [
  { id: 'root', label: '/root/ folder', icon: '📂', run: (out) => createDirArchive('/root', out) },
  { id: 'opt', label: '/opt/', icon: '📂', run: (out) => createDirArchive('/opt', out) },
  { id: 'var', label: '/var/', icon: '📂', run: (out) => createDirArchive('/var', out) },
  { id: 'etc', label: '/etc/', icon: '⚙️', run: (out) => createDirArchive('/etc', out) },
  { id: 'home', label: '/home/', icon: '🏠', run: (out) => createDirArchive('/home', out) },
  { id: 'postgres', label: 'PostgreSQL Databases', icon: '🗄️', run: (out, ts) => backupPostgreSQL(out, ts) },
  { id: 'ftp', label: 'FTP Accounts', icon: '📡', run: (out) => backupFTP(out) },
  { id: 'emails', label: 'Emails (Maildir)', icon: '✉️', run: (out, ts) => backupEmails(out, ts) },
  { id: 'users', label: 'VPS Users', icon: '👥', run: (out, ts) => backupUsers(out, ts) },
  { id: 'nginx', label: 'nginx Configs', icon: '🌐', run: (out, ts) => backupNginx(out, ts) },
  { id: 'config', label: 'Panel Configuration', icon: '📋', run: (out, ts) => backupPanelData(out, ts) },
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
    cancelled: false,
  };
  runningTasks.set(taskId, task);
  saveTaskState();

  setImmediate(async () => {
    try {
      checkDiskSpace();
      if (!fs.existsSync(backupPath)) fs.mkdirSync(backupPath, { recursive: true });
      const completed = [];
      for (let i = 0; i < items.length; i++) {
        if (task.cancelled) {
          task.status = 'cancelled';
          saveTaskState();
          return;
        }
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
          let checksum = null;
          try {
            if (result.size > 0) checksum = await sha256File(outPath);
          } catch (_) {}
          const entry = { id, label: def.label, icon: def.icon, file: fileName, size: result.size || 0, error: result.error || null, checksum };
          completed.push(entry);
          task.results.push(entry);
        } catch (e) {
          const entry = { id, label: def.label, icon: def.icon, file: fileName, size: 0, error: e.message, checksum: null };
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
      const infoPath = path.join(backupPath, 'info.json');
      const tmpInfo = infoPath + '.tmp';
      fs.writeFileSync(tmpInfo, JSON.stringify(backupEntry, null, 2), 'utf8');
      fs.renameSync(tmpInfo, infoPath);

      await saveMeta(loadMeta().length > 0 ? (() => { const m = loadMeta(); m.unshift(backupEntry); return m; })() : [backupEntry]);
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

function cancelBackup(taskId) {
  const task = runningTasks.get(taskId);
  if (!task) return false;
  if (task.status !== 'running') return false;
  task.cancelled = true;
  task.status = 'cancelled';
  task.error = 'Cancelled by user';
  saveTaskState();
  return true;
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
    timestamp: task.timestamp,
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

function listBackups(opts) {
  let meta = loadMeta();

  if (opts && opts.search) {
    const s = opts.search.toLowerCase();
    meta = meta.filter(e =>
      (e.timestamp && e.timestamp.includes(s)) ||
      (e.type && e.type.toLowerCase().includes(s)) ||
      (e.createdAt && e.createdAt.includes(s)) ||
      (e.items && e.items.some(it => (it.label && it.label.toLowerCase().includes(s)) || (it.id && it.id.toLowerCase().includes(s))))
    );
  }

  if (opts && opts.type) {
    meta = meta.filter(e => e.type === opts.type);
  }

  const sortBy = (opts && opts.sort) || 'createdAt';
  const sortDir = (opts && opts.dir) === 'asc' ? 1 : -1;
  meta.sort((a, b) => {
    const va = a[sortBy] || '';
    const vb = b[sortBy] || '';
    if (sortBy === 'totalSize' || sortBy === 'totalItems' || sortBy === 'failedItems') {
      return ((va || 0) - (vb || 0)) * sortDir;
    }
    if (typeof va === 'string') return va.localeCompare(vb) * sortDir;
    return 0;
  });

  const page = (opts && opts.page) || 1;
  const limit = (opts && opts.limit) || 50;
  const total = meta.length;
  const start = (page - 1) * limit;
  const paged = meta.slice(start, start + limit);

  return { backups: paged, total, page, limit, pages: Math.ceil(total / limit) };
}

function getBackupInfo(timestamp) {
  const meta = loadMeta();
  const entry = meta.find(e => e.timestamp === timestamp);
  if (!entry) throw new Error('Backup not found: ' + timestamp);
  return entry;
}

function deleteBackup(timestamp) {
  const meta = loadMeta();
  const idx = meta.findIndex(e => e.timestamp === timestamp);
  if (idx === -1) throw new Error('Backup not found: ' + timestamp);
  meta.splice(idx, 1);
  saveMetaSync(meta);
  const p = backupDir(timestamp);
  const resolved = path.resolve(p);
  if (!resolved.startsWith(path.resolve(BACKUP_ROOT) + path.sep)) {
    throw new Error('Path traversal detected');
  }
  try { fs.rmSync(resolved, { recursive: true, force: true }); } catch (_) {}
  return { ok: true };
}

function resolveDownload(timestamp, filename) {
  const TIMESTAMP_RE = /^\d{13}$/;
  if (!TIMESTAMP_RE.test(timestamp)) throw new Error('Invalid timestamp');
  const base = backupDir(timestamp);
  const resolved = path.resolve(base, filename || '');
  if (!resolved.startsWith(path.resolve(base) + path.sep) && resolved !== path.resolve(base)) {
    throw new Error('Path traversal detected');
  }
  if (!fs.existsSync(resolved)) throw new Error('File not found');
  const stat = fs.statSync(resolved);
  return { path: resolved, isDirectory: stat.isDirectory(), size: stat.size };
}

function getEstimatedSize(items) {
  const result = { items: [], totalEstimate: 0 };
  for (const id of items) {
    let estimate = 0;
    let label = id;
    if (id === 'root') { estimate = 500 * 1024 * 1024; label = '/root/ folder'; }
    else if (id === 'opt') { estimate = 100 * 1024 * 1024; label = '/opt/'; }
    else if (id === 'var') { estimate = 2 * 1024 * 1024 * 1024; label = '/var/'; }
    else if (id === 'etc') { estimate = 10 * 1024 * 1024; label = '/etc/'; }
    else if (id === 'home') { estimate = 100 * 1024 * 1024; label = '/home/'; }
    else if (id === 'postgres') { estimate = 50 * 1024 * 1024; label = 'PostgreSQL Databases'; }
    else if (id === 'ftp') { estimate = 100 * 1024; label = 'FTP Accounts'; }
    else if (id === 'emails') { estimate = 10 * 1024 * 1024; label = 'Emails (Maildir)'; }
    else if (id === 'users') { estimate = 10 * 1024; label = 'VPS Users'; }
    else if (id === 'nginx') { estimate = 500 * 1024; label = 'nginx Configs'; }
    else if (id === 'config') { estimate = 100 * 1024; label = 'Panel Configuration'; }
    result.items.push({ id, label, estimate });
    result.totalEstimate += estimate;
  }
  return result;
}

function getBackupStats() {
  const meta = loadMeta();
  const totalBackups = meta.length;
  const totalSize = meta.reduce((s, e) => s + (e.totalSize || 0), 0);
  const lastBackup = meta.length > 0 ? meta[0].createdAt : null;
  const failedBackups = meta.filter(e => e.failedItems > 0).length;
  return { totalBackups, totalSize, lastBackup, failedBackups };
}

module.exports = {
  startBackup,
  cancelBackup,
  getTaskStatus,
  getCurrentTask,
  listBackups,
  getBackupInfo,
  deleteBackup,
  resolveDownload,
  getEstimatedSize,
  getBackupStats,
  formatSize,
  ITEM_DEFS,
};
