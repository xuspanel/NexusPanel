const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');

const LOG_ROOT = '/var/log';
const SUBDIRS = ['nginx', 'audit', 'httpd', 'php-fpm', 'nexuspanel'];
const MAX_READ_SIZE = 10 * 1024 * 1024;
const MAX_TAIL_LINES = 5000;
const MAX_SEARCH_LINES = 2000;
const TAIL_CHUNK_SIZE = 64 * 1024;

const PINNED_LOGS = [
  { name: 'messages', path: 'messages', label: 'System Log' },
  { name: 'secure', path: 'secure', label: 'Auth Log' },
  { name: 'nginx/access.log', path: 'nginx/access.log', label: 'Nginx Access' },
  { name: 'nginx/error.log', path: 'nginx/error.log', label: 'Nginx Error' },
  { name: 'nexuspanel.log', path: 'nexuspanel.log', label: 'Panel Log' },
  { name: 'vsftpd.log', path: 'vsftpd.log', label: 'FTP Log' },
];

const CATEGORY_MAP = {
  'messages': 'system', 'secure': 'system', 'boot.log': 'system', 'cron': 'system',
  'maillog': 'system', 'dmesg': 'system', 'anaconda': 'system', 'yum.log': 'system',
  'dnf.log': 'packages', 'dnf.rpm.log': 'packages', 'dnf.librepo.log': 'packages',
  'hawkey.log': 'packages', 'cloud-init.log': 'packages', 'cloud-init-output.log': 'packages',
  'vsftpd.log': 'ftp', 'xferlog': 'ftp',
  'nexuspanel.log': 'panel',
};

const CATEGORY_LABELS = {
  system: { label: 'System', icon: '🖥' },
  nginx: { label: 'Nginx', icon: '🌐' },
  audit: { label: 'Audit', icon: '🔒' },
  ftp: { label: 'FTP', icon: '📁' },
  panel: { label: 'Panel', icon: '📊' },
  packages: { label: 'Packages', icon: '📦' },
  other: { label: 'Other', icon: '📄' },
};

function safePath(subpath) {
  const resolved = path.resolve(LOG_ROOT, subpath);
  if (!resolved.startsWith(LOG_ROOT)) throw new Error('Invalid path');
  return resolved;
}

function getFileMeta(fullPath, subpath) {
  try {
    const stat = fs.statSync(fullPath);
    const name = path.basename(subpath);
    const isGz = name.endsWith('.gz');
    const dirPart = path.dirname(subpath);
    const isSubdir = dirPart !== '.';
    let category = 'other';
    if (isSubdir) {
      const dir = dirPart.split(path.sep)[0];
      if (dir === 'nginx') category = 'nginx';
      else if (dir === 'audit') category = 'audit';
      else if (dir === 'php-fpm') category = 'panel';
      else if (dir === 'nexuspanel') category = 'panel';
      else if (dir === 'httpd') category = 'nginx';
    } else {
      category = CATEGORY_MAP[name] || 'other';
    }
    return {
      name: name,
      path: subpath,
      fullPath: fullPath,
      size: stat.size,
      modified: stat.mtime.toISOString(),
      category: category,
      isGzipped: isGz,
      readable: stat.isFile() && (stat.size < MAX_READ_SIZE || isGz),
      subpath: isSubdir ? dirPart + '/' : '',
    };
  } catch { return null; }
}

function list() {
  const files = [];
  try {
    const entries = fs.readdirSync(LOG_ROOT, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const subpath = e.name;
      const fullPath = path.join(LOG_ROOT, subpath);
      const meta = getFileMeta(fullPath, subpath);
      if (meta) files.push(meta);
    }
  } catch { }
  for (const dir of SUBDIRS) {
    const dirPath = path.join(LOG_ROOT, dir);
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile()) continue;
        const subpath = path.join(dir, e.name);
        const fullPath = path.join(LOG_ROOT, subpath);
        const meta = getFileMeta(fullPath, subpath);
        if (meta) files.push(meta);
      }
    } catch { }
  }
  files.sort((a, b) => {
    const aPinned = PINNED_LOGS.findIndex(p => p.path === a.path);
    const bPinned = PINNED_LOGS.findIndex(p => p.path === b.path);
    if (aPinned !== -1 && bPinned !== -1) return aPinned - bPinned;
    if (aPinned !== -1) return -1;
    if (bPinned !== -1) return 1;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return b.size - a.size;
  });
  return files;
}

function categories() {
  const files = list();
  const cats = {};
  for (const f of files) {
    if (!cats[f.category]) cats[f.category] = [];
    cats[f.category].push(f);
  }
  return Object.keys(CATEGORY_LABELS).filter(k => cats[k] && cats[k].length > 0).map(k => ({
    id: k,
    label: CATEGORY_LABELS[k].label,
    icon: CATEGORY_LABELS[k].icon,
    count: cats[k].length,
    files: cats[k],
  }));
}

function tailReverse(file, targetLines) {
  const filePath = safePath(file);
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');
  try {
    let lines = [];
    let pos = stat.size;
    let remainder = '';
    const buf = Buffer.alloc(TAIL_CHUNK_SIZE);
    while (pos > 0 && lines.length < targetLines) {
      const readSize = Math.min(TAIL_CHUNK_SIZE, pos);
      pos -= readSize;
      const bytesRead = fs.readSync(fd, buf, 0, readSize, pos);
      const chunk = buf.slice(0, bytesRead).toString('utf8');
      const text = chunk + remainder;
      const parts = text.split('\n');
      remainder = pos > 0 ? parts[0] : '';
      const startIdx = pos > 0 ? 1 : 0;
      for (let i = parts.length - 1; i >= startIdx; i--) {
        if (lines.length >= targetLines) break;
        if (parts[i] !== '' || i > startIdx) lines.unshift(parts[i]);
      }
    }
    return lines.join('\n');
  } finally {
    fs.closeSync(fd);
  }
}

function tailGzipped(file, targetLines) {
  return new Promise((resolve, reject) => {
    const filePath = safePath(file);
    const lines = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath).pipe(zlib.createGunzip()),
      crlfDelay: Infinity,
    });
    rl.on('line', (line) => {
      lines.push(line);
      if (lines.length > targetLines * 2) {
        lines.splice(0, lines.length - targetLines);
      }
    });
    rl.on('close', () => resolve(lines.slice(-targetLines).join('\n')));
    rl.on('error', reject);
  });
}

function read(file, tail) {
  const n = Math.min(parseInt(tail) || 500, MAX_TAIL_LINES);
  const filePath = safePath(file);
  const stat = fs.statSync(filePath);
  const isGz = file.endsWith('.gz');
  if (isGz) return tailGzipped(file, n);
  if (stat.size > MAX_READ_SIZE) return tailReverse(file, n);
  const data = fs.readFileSync(filePath, 'utf8');
  const lines = data.split('\n');
  return lines.slice(-n).join('\n');
}

function search(file, query, opts) {
  const filePath = safePath(file);
  const isGz = file.endsWith('.gz');
  const isRegex = opts && opts.regex;
  let matcher;
  if (isRegex) {
    try { matcher = new RegExp(query, 'i'); }
    catch { throw new Error('Invalid regex pattern'); }
  } else {
    const lower = query.toLowerCase();
    matcher = { test: function(s) { return s.toLowerCase().includes(lower); } };
  }
  if (isGz) return searchGzipped(filePath, matcher, MAX_SEARCH_LINES);
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_READ_SIZE) return searchLargeFile(filePath, matcher, MAX_SEARCH_LINES);
  const data = fs.readFileSync(filePath, 'utf8');
  const lines = data.split('\n').filter(l => matcher.test(l));
  return lines.slice(-MAX_SEARCH_LINES).join('\n');
}

function searchGzipped(filePath, matcher, maxLines) {
  return new Promise((resolve, reject) => {
    const lines = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath).pipe(zlib.createGunzip()),
      crlfDelay: Infinity,
    });
    rl.on('line', (line) => {
      if (matcher.test(line)) {
        lines.push(line);
        if (lines.length > maxLines * 2) lines.splice(0, lines.length - maxLines);
      }
    });
    rl.on('close', () => resolve(lines.slice(-maxLines).join('\n')));
    rl.on('error', reject);
  });
}

function searchLargeFile(filePath, matcher, maxLines) {
  return new Promise((resolve, reject) => {
    const lines = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    rl.on('line', (line) => {
      if (matcher.test(line)) {
        lines.push(line);
        if (lines.length > maxLines * 2) lines.splice(0, lines.length - maxLines);
      }
    });
    rl.on('close', () => resolve(lines.slice(-maxLines).join('\n')));
    rl.on('error', reject);
  });
}

function searchMulti(files, query, opts) {
  const limit = Math.min(parseInt(opts && opts.limit) || 100, 500);
  const isRegex = opts && opts.regex;
  let matcher;
  if (isRegex) {
    try { matcher = new RegExp(query, 'i'); }
    catch { throw new Error('Invalid regex pattern'); }
  } else {
    const lower = query.toLowerCase();
    matcher = { test: function(s) { return s.toLowerCase().includes(lower); } };
  }
  const results = [];
  for (const f of files.slice(0, 20)) {
    try {
      const filePath = safePath(f);
      const data = fs.readFileSync(filePath, 'utf8');
      const matches = data.split('\n').filter(l => matcher.test(l)).slice(-limit);
      if (matches.length > 0) {
        results.push({ file: f, matches: matches.length, lines: matches.slice(-limit) });
      }
    } catch { }
  }
  return results;
}

function lineCount(file) {
  const filePath = safePath(file);
  const isGz = file.endsWith('.gz');
  if (isGz) return lineCountGzipped(filePath);
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_READ_SIZE) return lineCountStream(filePath);
  const data = fs.readFileSync(filePath, 'utf8');
  return data.split('\n').length;
}

function lineCountStream(filePath) {
  const result = { stdout: '', stderr: '', status: 0, error: null };
  try {
    const buf = fs.readFileSync(filePath);
    let count = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 0x0a) count++;
    }
    return count + 1;
  } catch { return 0; }
}

function lineCountGzipped(filePath) {
  return new Promise((resolve, reject) => {
    let count = 0;
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath).pipe(zlib.createGunzip()),
      crlfDelay: Infinity,
    });
    rl.on('line', () => count++);
    rl.on('close', () => resolve(count));
    rl.on('error', () => resolve(0));
  });
}

function stream(file, res) {
  const filePath = safePath(file);
  const tail = tailReverse(file, 50);
  res.write('data: ' + JSON.stringify({ type: 'init', content: tail }) + '\n\n');
  let pos = fs.statSync(filePath).size;
  const interval = setInterval(() => {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > pos) {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(stat.size - pos);
        fs.readSync(fd, buf, 0, buf.length, pos);
        fs.closeSync(fd);
        pos = stat.size;
        const newLines = buf.toString('utf8');
        if (newLines) res.write('data: ' + JSON.stringify({ type: 'data', content: newLines }) + '\n\n');
      }
    } catch { }
  }, 1000);
  const cleanup = () => clearInterval(interval);
  if (res.on) {
    res.on('close', cleanup);
  } else {
    setTimeout(cleanup, 30000);
  }
  setTimeout(() => { clearInterval(interval); try { res.end(); } catch { } }, 30000);
}

module.exports = {
  list, categories, read, search, searchMulti, tailReverse, tailGzipped,
  lineCount, lineCountGzipped, stream, safePath, PINNED_LOGS, CATEGORY_LABELS,
  MAX_TAIL_LINES, MAX_SEARCH_LINES, MAX_READ_SIZE,
};
