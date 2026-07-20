const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const archiver = require('archiver');
const { createReadStream, createWriteStream } = require('fs');

const ALLOWED_ROOTS = [
  '/', '/bin', '/boot', '/dev', '/etc', '/home', '/lib', '/lib64',
  '/media', '/mnt', '/opt', '/proc', '/root', '/run', '/sbin',
  '/srv', '/sys', '/tmp', '/usr', '/var',
];
const DENIED_PATHS = [
  '/etc/shadow', '/etc/gshadow', '/etc/sudoers', '/etc/ssh/',
  '/etc/pam.d/', '/etc/security/',
];

function safeResolve(inputPath) {
  let resolved = path.resolve('/', inputPath);
  if (resolved === '/') resolved = '/var/www';
  const allowed = ALLOWED_ROOTS.some(root => resolved.startsWith(root + '/') || resolved === root);
  if (!allowed) throw new Error('Access denied: path outside allowed directories');
  if (DENIED_PATHS.some(d => resolved.startsWith(d))) throw new Error('Access denied: path is restricted');
  return resolved;
}

function isHidden(name) {
  return name.startsWith('.');
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatMode(mode) {
  const m = mode & parseInt('777', 8);
  return m.toString(8).padStart(3, '0');
}

function formatDate(date) {
  const d = new Date(date);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800000) return d.toLocaleDateString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

async function listDirectory(dirPath) {
  const safePath = safeResolve(dirPath);
  const entries = await fsp.readdir(safePath, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    try {
      const fullPath = path.join(safePath, entry.name);
      const stat = await fsp.stat(fullPath);
      result.push({
        name: entry.name,
        path: fullPath,
        size: stat.size,
        sizeFormatted: formatSize(stat.size),
        type: entry.isDirectory() ? 'directory' : 'file',
        modified: stat.mtimeMs,
        modifiedFormatted: formatDate(stat.mtime),
        permissions: formatMode(stat.mode),
        mode: stat.mode,
        isHidden: isHidden(entry.name),
        isSymlink: entry.isSymbolicLink(),
        owner: stat.uid,
        group: stat.gid,
      });
    } catch {}
  }
  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return {
    entries: result,
    currentPath: safePath,
    parentPath: safePath === '/' ? null : path.dirname(safePath),
  };
}

async function readFile(filePath) {
  const safePath = safeResolve(filePath);
  const stat = await fsp.stat(safePath);
  if (stat.isDirectory()) throw new Error('Cannot read a directory');
  const content = await fsp.readFile(safePath, 'utf-8');
  const ext = path.extname(safePath).slice(1).toLowerCase();
  return { content, language: ext, size: stat.size };
}

async function createEntry(parentPath, name, type, content) {
  if (!name || name.includes('/') || name.includes('\0')) throw new Error('Invalid name');
  const safePath = safeResolve(path.join(parentPath, name));
  if (type === 'directory') {
    await fsp.mkdir(safePath, { recursive: true });
  } else {
    await fsp.writeFile(safePath, content || '', 'utf-8');
  }
  return { path: safePath };
}

async function renameEntry(oldPath, newName) {
  if (!newName || newName.includes('/') || newName.includes('\0')) throw new Error('Invalid name');
  const safeOld = safeResolve(oldPath);
  const safeNew = safeResolve(path.join(path.dirname(safeOld), newName));
  await fsp.rename(safeOld, safeNew);
  return { path: safeNew };
}

async function copyEntry(source, destination) {
  if (!source || !destination) throw new Error('Source and destination required');
  const safeSource = safeResolve(source);
  const safeDest = safeResolve(destination);
  
  const stat = await fsp.stat(safeSource);
  
  if (stat.isDirectory()) {
    await fsp.mkdir(safeDest, { recursive: true });
    const entries = await fsp.readdir(safeSource, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(safeSource, entry.name);
      const destPath = path.join(safeDest, entry.name);
      if (entry.isDirectory()) {
        await copyEntry(srcPath, destPath);
      } else {
        await fsp.copyFile(srcPath, destPath);
      }
    }
  } else {
    await fsp.mkdir(path.dirname(safeDest), { recursive: true });
    await fsp.copyFile(safeSource, safeDest);
  }
  return { path: safeDest };
}

async function copyEntry(source, destination) {
  if (!source || !destination) throw new Error('Source and destination required');
  const safeSource = safeResolve(source);
  const safeDest = safeResolve(destination);
  
  const stat = await fsp.stat(safeSource);
  
  if (stat.isDirectory()) {
    await fsp.mkdir(safeDest, { recursive: true });
    const entries = await fsp.readdir(safeSource, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(safeSource, entry.name);
      const destPath = path.join(safeDest, entry.name);
      await copyEntry(srcPath, destPath);
    }
  } else {
    await fsp.mkdir(path.dirname(safeDest), { recursive: true });
    await fsp.copyFile(safeSource, safeDest);
  }
  return { path: safeDest };
}

async function moveEntry(source, destination) {
  if (!source || !destination) throw new Error('Source and destination required');
  const safeSource = safeResolve(source);
  const safeDest = safeResolve(destination);
  
  const stat = await fsp.stat(safeSource);
  
  if (stat.isDirectory()) {
    await fsp.mkdir(safeDest, { recursive: true });
    const entries = await fsp.readdir(safeSource, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(safeSource, entry.name);
      const destPath = path.join(safeDest, entry.name);
      await moveEntry(srcPath, destPath);
    }
    await fsp.rmdir(safeSource, { recursive: true });
  } else {
    await fsp.mkdir(path.dirname(safeDest), { recursive: true });
    await fsp.rename(safeSource, safeDest);
  }
  return { path: safeDest };
}

async function moveEntryWithOverwrite(source, destination, overwrite) {
  const safeSource = safeResolve(source);
  const safeDest = safeResolve(destination);
  
  if (fs.existsSync(safeDest) && !overwrite) {
    throw new Error('Destination already exists. Use overwrite=true to replace.');
  }
  
  if (fs.existsSync(safeDest) && overwrite) {
    await fsp.rm(safeDest);
  }
  
  const stat = await fsp.stat(safeSource);
  
  if (stat.isDirectory()) {
    await fsp.mkdir(safeDest, { recursive: true });
    const entries = await fsp.readdir(safeSource, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(safeSource, entry.name);
      const destPath = path.join(safeDest, entry.name);
      await moveEntryWithOverwrite(srcPath, destPath, overwrite);
    }
    await fsp.rmdir(safeSource, { recursive: true });
  } else {
    await fsp.mkdir(path.dirname(safeDest), { recursive: true });
    await fsp.rename(safeSource, safeDest);
  }
  return { path: safeDest };
}

async function copyEntryWithOverwrite(source, destination, overwrite) {
  const safeSource = safeResolve(source);
  const safeDest = safeResolve(destination);
  
  if (fs.existsSync(safeDest) && !overwrite) {
    throw new Error('Destination already exists. Use overwrite=true to replace.');
  }
  
  if (fs.existsSync(safeDest) && overwrite) {
    await fsp.rm(safeDest);
  }
  
  const stat = await fsp.stat(safeSource);
  
  if (stat.isDirectory()) {
    await fsp.mkdir(safeDest, { recursive: true });
    const entries = await fsp.readdir(safeSource, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(safeSource, entry.name);
      const destPath = path.join(safeDest, entry.name);
      await copyEntry(srcPath, destPath);
    }
  } else {
    await fsp.mkdir(path.dirname(safeDest), { recursive: true });
    await fsp.copyFile(safeSource, safeDest);
  }
  
  return { path: safeDest };
}

async function duplicateEntry(source) {
  const safeSource = safeResolve(source);
  const stat = await fsp.stat(safeSource);
  const name = path.basename(safeSource);
  const parent = path.dirname(safeSource);
  const newName = name + ' (copy)';
  const destPath = path.join(parent, newName);
  
  if (stat.isDirectory()) {
    await copyEntry(source, destPath);
  } else {
    await fsp.copyFile(safeSource, destPath);
  }
  
  return { path: destPath };
}

async function deleteEntry(targetPath) {
  const safePath = safeResolve(targetPath);
  const stat = await fsp.stat(safePath);
  if (stat.isDirectory()) {
    await fsp.rm(safePath, { recursive: true, force: true });
  } else {
    await fsp.unlink(safePath);
  }
  return { success: true };
}

async function copyEntry(source, destination) {
  const safeSrc = safeResolve(source);
  const safeDest = safeResolve(destination);
  const stat = await fsp.stat(safeSrc);
  if (stat.isDirectory()) {
    await fsp.cp(safeSrc, safeDest, { recursive: true });
  } else {
    await fsp.copyFile(safeSrc, safeDest);
  }
  return { path: safeDest };
}

async function moveEntry(source, destination) {
  const safeSrc = safeResolve(source);
  const safeDest = safeResolve(destination);
  try {
    await fsp.rename(safeSrc, safeDest);
  } catch (err) {
    if (err.code === 'EXDEV') {
      await copyEntry(source, destination);
      await deleteEntry(source);
    } else {
      throw err;
    }
  }
  return { path: safeDest };
}

async function duplicateEntry(targetPath) {
  const safePath = safeResolve(targetPath);
  const dir = path.dirname(safePath);
  const ext = path.extname(safePath);
  const base = path.basename(safePath, ext);
  let newName = `${base}_copy${ext}`;
  let newPath = path.join(dir, newName);
  let counter = 1;
  while (true) {
    try {
      await fsp.access(newPath);
      counter++;
      newName = `${base}_copy(${counter})${ext}`;
      newPath = path.join(dir, newName);
    } catch {
      break;
    }
  }
  await copyEntry(safePath, newPath);
  return { path: newPath, name: newName };
}

async function copyEntryWithOverwrite(source, destination, overwrite) {
  const safeSource = safeResolve(source);
  const safeDest = safeResolve(destination);
  
  if (fs.existsSync(safeDest) && !overwrite) {
    throw new Error('Destination already exists. Use overwrite=true to replace.');
  }
  
  if (fs.existsSync(safeDest) && overwrite) {
    if (fs.lstatSync(safeDest).isDirectory()) {
      await fsp.rm(safeDest, { recursive: true });
    } else {
      await fsp.unlink(safeDest);
    }
  }
  
  const stat = await fsp.stat(safeSource);
  
  if (stat.isDirectory()) {
    await fsp.mkdir(safeDest, { recursive: true });
    const entries = await fsp.readdir(safeSource, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(safeSource, entry.name);
      const destPath = path.join(safeDest, entry.name);
      await copyEntryWithOverwrite(srcPath, destPath, overwrite);
    }
  } else {
    await fsp.mkdir(path.dirname(safeDest), { recursive: true });
    await fsp.copyFile(safeSource, safeDest);
  }
  
  return { path: safeDest };
}

async function searchFiles(rootPath, query, includePatterns, excludePatterns) {
  const safeRoot = safeResolve(rootPath);
  const results = [];
  function matchesAny(name, patterns) {
    if (!patterns || patterns.length === 0) return true;
    const lower = name.toLowerCase();
    return patterns.some(p => {
      if (p.startsWith('*.')) return lower.endsWith(p.slice(1));
      if (p.endsWith('*')) return lower.startsWith(p.slice(0, -1));
      return lower.includes(p);
    });
  }
  async function walk(dir, depth) {
    if (depth > 8) return;
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (!matchesAny(entry.name, includePatterns)) continue;
        if (excludePatterns && excludePatterns.length > 0 && matchesAny(entry.name, excludePatterns)) continue;
        if (entry.name.toLowerCase().includes(query.toLowerCase())) {
          try {
            const stat = await fsp.stat(fullPath);
            results.push({
              name: entry.name,
              path: fullPath,
              type: entry.isDirectory() ? 'directory' : 'file',
              size: stat.size,
              sizeFormatted: formatSize(stat.size),
              modified: stat.mtimeMs,
              modifiedFormatted: formatDate(stat.mtime),
            });
          } catch {}
        }
        if (entry.isDirectory() && depth < 8) {
          await walk(fullPath, depth + 1);
        }
        if (results.length >= 200) return;
      }
    } catch {}
  }
  await walk(safeRoot, 0);
  return results;
}

async function createArchive(paths, destination, format) {
  const safeDest = safeResolve(destination);
  return new Promise((resolve, reject) => {
    const output = createWriteStream(safeDest);
    let archive;
    if (format === 'zip') {
      archive = new archiver.ZipArchive();
    } else if (format === 'gz') {
      archive = new archiver.TarArchive({ gzip: true });
    } else {
      archive = new archiver.TarArchive();
    }
    output.on('close', () => resolve({ path: safeDest, size: archive.pointer() }));
    archive.on('error', reject);
    archive.pipe(output);
    for (const p of paths) {
      const safePath = safeResolve(p);
      const stat = fs.statSync(safePath);
      if (stat.isDirectory()) {
        archive.directory(safePath, path.basename(safePath));
      } else {
        archive.file(safePath, { name: path.basename(safePath) });
      }
    }
    archive.finalize();
  });
}

function resolveSafeChild(base, name) {
  const target = path.resolve(base, name);
  if (!target.startsWith(base + path.sep) && target !== base) {
    throw new Error('Zip slip blocked: ' + name);
  }
  return target;
}

async function extractArchive(archivePath, destination) {
  const safeArchive = safeResolve(archivePath);
  const safeDest = safeResolve(destination);
  await fsp.mkdir(safeDest, { recursive: true });
  const ext = path.extname(safeArchive).toLowerCase();
  if (ext === '.zip') {
    const { default: AdmZip } = await import('adm-zip');
    const zip = new AdmZip(safeArchive);
    const entries = zip.getEntries();
    for (const entry of entries) {
      const targetPath = resolveSafeChild(safeDest, entry.entryName);
      if (entry.isDirectory) {
        fs.mkdirSync(targetPath, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, entry.getData());
      }
    }
  } else if (ext === '.gz' || ext === '.tgz' || ext === '.tar') {
    const { createGunzip } = require('zlib');
    const { tar } = require('tar-stream');
    const extract = tar.extract();
    const source = ext === '.gz' || ext === '.tgz'
      ? createReadStream(safeArchive).pipe(createGunzip())
      : createReadStream(safeArchive);
    await new Promise((resolve, reject) => {
      extract.on('entry', (header, stream, next) => {
        const targetPath = resolveSafeChild(safeDest, header.name);
        if (header.type === 'directory') {
          fs.mkdirSync(targetPath, { recursive: true });
          next();
        } else {
          fs.mkdirSync(path.dirname(targetPath), { recursive: true });
          const ws = createWriteStream(targetPath);
          stream.pipe(ws);
          ws.on('finish', next);
        }
        stream.resume();
      });
      extract.on('finish', resolve);
      extract.on('error', reject);
      source.pipe(extract);
    });
  } else {
    throw new Error('Unsupported archive format: ' + ext);
  }
  return { path: safeDest };
}

async function changePermissions(targetPath, modeStr) {
  const safePath = safeResolve(targetPath);
  const mode = parseInt(modeStr, 8);
  if (isNaN(mode) || mode < 0 || mode > 777) throw new Error('Invalid mode');
  await fsp.chmod(safePath, mode);
  return { success: true };
}

async function getDetails(targetPath) {
  const safePath = safeResolve(targetPath);
  const stat = await fsp.stat(safePath);
  return {
    name: path.basename(safePath),
    path: safePath,
    size: stat.size,
    sizeFormatted: formatSize(stat.size),
    type: stat.isDirectory() ? 'directory' : 'file',
    modified: stat.mtimeMs,
    modifiedFormatted: formatDate(stat.mtime),
    permissions: formatMode(stat.mode),
    mode: stat.mode,
    owner: stat.uid,
    group: stat.gid,
    isSymlink: stat.isSymbolicLink(),
  };
}

module.exports = {
  gitStatus, gitStage, gitUnstage, gitCommit, gitPush, gitPull, gitLog,
  listDirectory, readFile, createEntry, renameEntry, deleteEntry,
  copyEntry, moveEntry, duplicateEntry, searchFiles,
  createArchive, extractArchive, changePermissions, getDetails,
  safeResolve, formatSize,
  copyEntryWithOverwrite, moveEntryWithOverwrite,
};

/* ─── Git Integration ─── */
const { runSafeSync } = require('../utils/shell');

function gitExec(dir, args) {
  try {
    const result = runSafeSync('git', ['-C', dir, ...args]);
    return result.stdout.trim();
  } catch { return null; }
}

function gitStatus(dirPath) {
  const safe = safeResolve(dirPath);
  const out = gitExec(safe, ['status', '--porcelain', '-b']);
  if (out === null) return null;
  const lines = out.split('\n');
  const branch = lines[0].replace('## ', '').split('...')[0];
  const files = lines.slice(1).filter(Boolean).map(line => ({
    status: line.substring(0, 2).trim(),
    file: line.substring(3),
  }));
  return { branch, files, isRepo: true };
}

function gitStage(dirPath, file) {
  const safe = safeResolve(dirPath);
  gitExec(safe, ['add', file]);
}

function gitUnstage(dirPath, file) {
  const safe = safeResolve(dirPath);
  gitExec(safe, ['reset', 'HEAD', file]);
}

function gitCommit(dirPath, message) {
  const safe = safeResolve(dirPath);
  const out = gitExec(safe, ['commit', '-m', message]);
  if (out === null) throw new Error('Commit failed');
  return out;
}

function gitPush(dirPath) {
  const safe = safeResolve(dirPath);
  const out = gitExec(safe, ['push']);
  if (out === null) throw new Error('Push failed');
  return out;
}

function gitPull(dirPath) {
  const safe = safeResolve(dirPath);
  const out = gitExec(safe, ['pull']);
  if (out === null) throw new Error('Pull failed');
  return out;
}

function gitLog(dirPath, n) {
  const safe = safeResolve(dirPath);
  return gitExec(safe, ['log', '--oneline', '-' + (n || 10)]) || '';
}
