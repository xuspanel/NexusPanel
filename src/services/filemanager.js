const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const archiver = require('archiver');
const { createReadStream, createWriteStream } = require('fs');

const ADMIN_ROOTS = [
  '/', '/bin', '/boot', '/dev', '/etc', '/home', '/lib', '/lib64',
  '/media', '/mnt', '/opt', '/proc', '/root', '/run', '/sbin',
  '/srv', '/sys', '/tmp', '/usr', '/var',
];
const DENIED_PATHS = [
  '/etc/shadow', '/etc/gshadow', '/etc/sudoers', '/etc/ssh/',
  '/etc/pam.d/', '/etc/security/',
];

function safeResolve(inputPath, user) {
  let resolved = path.resolve('/', inputPath);
  if (resolved === '/') {
    if (user && user.role !== 'admin') {
      resolved = '/home/' + (user.username || 'user');
    } else {
      resolved = '/var/www';
    }
  }
  const roots = (user && user.role !== 'admin')
    ? ['/home/' + (user.username || 'user')]
    : ADMIN_ROOTS;
  const allowed = roots.some(root => resolved.startsWith(root + '/') || resolved === root);
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

async function listDirectory(dirPath, user) {
  const safePath = safeResolve(dirPath, user);
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

async function readFile(filePath, user) {
  const safePath = safeResolve(filePath, user);
  const stat = await fsp.stat(safePath);
  if (stat.isDirectory()) throw new Error('Cannot read a directory');
  if (stat.size > 10 * 1024 * 1024) throw new Error('File too large to edit (max 10MB)');
  const content = await fsp.readFile(safePath, 'utf-8');
  const ext = path.extname(safePath).slice(1).toLowerCase();
  return { content, language: ext, size: stat.size };
}

async function createEntry(parentPath, name, type, content, user) {
  if (!name || name.includes('/') || name.includes('\0')) throw new Error('Invalid name');
  const safePath = safeResolve(path.join(parentPath, name), user);
  if (type === 'directory') {
    await fsp.mkdir(safePath, { recursive: true });
  } else {
    await fsp.writeFile(safePath, content || '', 'utf-8');
  }
  return { path: safePath };
}

async function renameEntry(oldPath, newName, user) {
  if (!newName || newName.includes('/') || newName.includes('\0')) throw new Error('Invalid name');
  const safeOld = safeResolve(oldPath, user);
  const safeNew = safeResolve(path.join(path.dirname(safeOld), newName), user);
  await fsp.rename(safeOld, safeNew);
  return { path: safeNew };
}

async function copyEntry(source, destination, user) {
  const safeSrc = safeResolve(source, user);
  const safeDest = safeResolve(destination, user);
  const stat = await fsp.stat(safeSrc);
  if (stat.isDirectory()) {
    await fsp.cp(safeSrc, safeDest, { recursive: true });
  } else {
    await fsp.copyFile(safeSrc, safeDest);
  }
  return { path: safeDest };
}

async function moveEntry(source, destination, user) {
  const safeSrc = safeResolve(source, user);
  const safeDest = safeResolve(destination, user);
  try {
    await fsp.rename(safeSrc, safeDest);
  } catch (err) {
    if (err.code === 'EXDEV') {
      await copyEntry(source, destination, user);
      await deleteEntryPermanent(safeSrc);
    } else {
      throw err;
    }
  }
  return { path: safeDest };
}

async function duplicateEntry(targetPath, user) {
  const safePath = safeResolve(targetPath, user);
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
  await copyEntry(safePath, newPath, user);
  return { path: newPath, name: newName };
}

async function copyEntryWithOverwrite(source, destination, overwrite, user) {
  const safeSource = safeResolve(source, user);
  const destDir = safeResolve(destination, user);
  const name = path.basename(safeSource);
  const safeDest = path.join(destDir, name);
  
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
      await copyEntryWithOverwrite(srcPath, path.dirname(destPath), overwrite, user);
    }
  } else {
    await fsp.mkdir(path.dirname(safeDest), { recursive: true });
    await fsp.copyFile(safeSource, safeDest);
  }
  
  return { path: safeDest };
}

async function moveEntryWithOverwrite(source, destination, overwrite, user) {
  const safeSource = safeResolve(source, user);
  const destDir = safeResolve(destination, user);
  const name = path.basename(safeSource);
  const safeDest = path.join(destDir, name);

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
      await moveEntryWithOverwrite(srcPath, path.dirname(destPath), overwrite, user);
    }
    await fsp.rm(safeSource, { recursive: true });
  } else {
    await fsp.mkdir(path.dirname(safeDest), { recursive: true });
    await fsp.copyFile(safeSource, safeDest);
    await fsp.unlink(safeSource);
  }

  return { path: safeDest };
}

async function searchFiles(rootPath, query, includePatterns, excludePatterns, user) {
  const safeRoot = safeResolve(rootPath, user);
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

async function createArchive(paths, destination, format, user) {
  const safeDest = safeResolve(destination, user);
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
      const safePath = safeResolve(p, user);
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

async function extractArchive(archivePath, destination, user) {
  const safeArchive = safeResolve(archivePath, user);
  const safeDest = safeResolve(destination, user);
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

async function changePermissions(targetPath, modeStr, user) {
  const safePath = safeResolve(targetPath, user);
  const mode = parseInt(modeStr, 8);
  if (isNaN(mode) || mode < 0 || mode > 777) throw new Error('Invalid mode');
  await fsp.chmod(safePath, mode);
  return { success: true };
}

async function getDetails(targetPath, user) {
  const safePath = safeResolve(targetPath, user);
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

/* ─── Archive Preview (list entries without extracting) ─── */
async function listArchiveEntries(archivePath, user) {
  const safeArchive = safeResolve(archivePath, user);
  const ext = path.extname(safeArchive).toLowerCase();
  const entries = [];
  if (ext === '.zip') {
    const { default: AdmZip } = await import('adm-zip');
    const zip = new AdmZip(safeArchive);
    for (const entry of zip.getEntries()) {
      entries.push({
        name: entry.entryName,
        size: entry.header.size,
        compressedSize: entry.header.compressedSize,
        type: entry.isDirectory ? 'directory' : 'file',
        modified: entry.header.time ? new Date(entry.header.time).getTime() : null,
      });
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
        entries.push({
          name: header.name,
          size: header.size,
          compressedSize: header.size,
          type: header.type === 'directory' ? 'directory' : 'file',
          modified: header.mtime ? new Date(header.mtime).getTime() : null,
        });
        stream.resume();
        next();
      });
      extract.on('finish', resolve);
      extract.on('error', reject);
      source.pipe(extract);
    });
  } else {
    throw new Error('Unsupported archive format: ' + ext);
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

/* ─── Conflict Detection ─── */
function getBinRoot() {
  return path.join(__dirname, '../../data/filebin');
}

function generateRenamePath(destPath) {
  const dir = path.dirname(destPath);
  const ext = path.extname(destPath);
  const base = path.basename(destPath, ext);
  let counter = 1;
  let newPath;
  do {
    newPath = path.join(dir, base + '_' + counter + ext);
    counter++;
  } while (fs.existsSync(newPath));
  return newPath;
}

async function checkConflicts(sources, destDir, user) {
  const conflicts = [];
  const noConflicts = [];
  let totalSourceSize = 0;
  let totalDestSize = 0;
  for (const src of sources) {
    const safeSrc = safeResolve(src, user);
    const safeDestDir = safeResolve(destDir, user);
    const name = path.basename(safeSrc);
    const destPath = path.join(safeDestDir, name);
    try {
      const srcStat = await fsp.stat(safeSrc);
      totalSourceSize += srcStat.size;
      if (fs.existsSync(destPath)) {
        const destStat = await fsp.stat(destPath);
        totalDestSize += destStat.size;
        const different = srcStat.size !== destStat.size || Math.abs(srcStat.mtimeMs - destStat.mtimeMs) > 1000;
        conflicts.push({
          source: safeSrc,
          dest: destPath,
          name: name,
          sourceSize: srcStat.size,
          destSize: destStat.size,
          sourceSizeFormatted: formatSize(srcStat.size),
          destSizeFormatted: formatSize(destStat.size),
          sourceModified: srcStat.mtimeMs,
          destModified: destStat.mtimeMs,
          sourceModifiedFormatted: formatDate(srcStat.mtime),
          destModifiedFormatted: formatDate(destStat.mtime),
          type: srcStat.isDirectory() ? 'directory' : 'file',
          different: different,
        });
      } else {
        noConflicts.push({ source: safeSrc, dest: destPath, name: name });
      }
    } catch (e) {
      noConflicts.push({ source: safeSrc, dest: destPath, name: name, error: e.message });
    }
  }
  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
    noConflicts,
    totalSourceSize,
    totalDestSize,
    totalSourceSizeFormatted: formatSize(totalSourceSize),
    totalDestSizeFormatted: formatSize(totalDestSize),
    conflictCount: conflicts.length,
    noConflictCount: noConflicts.length,
    totalEntries: conflicts.length + noConflicts.length,
    entryCount: conflicts.length + noConflicts.length,
  };
}

async function checkExtractConflicts(archivePath, destDir, user) {
  const entries = await listArchiveEntries(archivePath, user);
  const safeDestDir = safeResolve(destDir, user);
  const conflicts = [];
  const noConflicts = [];
  let totalSourceSize = 0;
  let totalDestSize = 0;
  for (const entry of entries) {
    if (!entry.name || entry.name.endsWith('/')) continue;
    const baseName = path.basename(entry.name);
    const destPath = path.join(safeDestDir, baseName);
    totalSourceSize += entry.size || 0;
    try {
      if (fs.existsSync(destPath)) {
        const destStat = await fsp.stat(destPath);
        totalDestSize += destStat.size;
        const different = (entry.size || 0) !== destStat.size;
        conflicts.push({
          source: entry.name,
          dest: destPath,
          name: baseName,
          sourceSize: entry.size || 0,
          destSize: destStat.size,
          sourceSizeFormatted: formatSize(entry.size || 0),
          destSizeFormatted: formatSize(destStat.size),
          sourceModified: entry.modified,
          destModified: destStat.mtimeMs,
          sourceModifiedFormatted: entry.modified ? formatDate(new Date(entry.modified)) : '—',
          destModifiedFormatted: formatDate(destStat.mtime),
          type: entry.type,
          different: different,
        });
      } else {
        noConflicts.push({ source: entry.name, dest: destPath, name: baseName, size: entry.size, type: entry.type });
      }
    } catch {
      noConflicts.push({ source: entry.name, dest: destPath, name: baseName, size: entry.size, type: entry.type });
    }
  }
  return {
    hasConflicts: conflicts.length > 0,
    entries,
    conflicts,
    noConflicts,
    totalSourceSize,
    totalDestSize,
    totalSourceSizeFormatted: formatSize(totalSourceSize),
    totalDestSizeFormatted: formatSize(totalDestSize),
    conflictCount: conflicts.length,
    noConflictCount: noConflicts.length,
    totalEntries: entries.length,
    entryCount: entries.length,
  };
}

/* ─── Strategy-Based Operations ─── */
function applyStrategy(srcPath, destDir, strategy) {
  const name = path.basename(srcPath);
  const destPath = path.join(destDir, name);
  if (!fs.existsSync(destPath)) return { destPath, action: 'write' };
  switch (strategy) {
    case 'skip':
      return { destPath, action: 'skip' };
    case 'rename':
      return { destPath: generateRenamePath(destPath), action: 'rename' };
    case 'overwrite':
    default:
      return { destPath, action: 'overwrite' };
  }
}

async function extractArchiveWithStrategy(archivePath, destDir, strategy, user) {
  const safeArchive = safeResolve(archivePath, user);
  const safeDest = safeResolve(destDir, user);
  await fsp.mkdir(safeDest, { recursive: true });
  const ext = path.extname(safeArchive).toLowerCase();
  const results = [];
  let extracted = 0, skipped = 0, renamed = 0, totalSize = 0;
  function handleEntry(entryName, entrySize, isDir, readFn) {
    const cleanName = entryName.replace(/\/$/, '');
    if (!cleanName) return;
    const baseName = path.basename(cleanName);
    if (!baseName) return;
    const { destPath, action } = applyStrategy(path.join(safeDest, baseName), safeDest, strategy);
    if (isDir) {
      fs.mkdirSync(destPath, { recursive: true });
      results.push({ name: cleanName, path: destPath, status: 'extracted', size: 0 });
      extracted++;
      return;
    }
    if (action === 'skip') {
      results.push({ name: cleanName, path: destPath, status: 'skipped', size: entrySize || 0 });
      skipped++;
      return;
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    if (readFn) {
      readFn(destPath);
    }
    const status = action === 'rename' ? 'renamed' : 'extracted';
    if (action === 'rename') renamed++; else extracted++;
    totalSize += entrySize || 0;
    results.push({ name: cleanName, path: destPath, status, size: entrySize || 0 });
  }
  if (ext === '.zip') {
    const { default: AdmZip } = await import('adm-zip');
    const zip = new AdmZip(safeArchive);
    for (const entry of zip.getEntries()) {
      const entryName = entry.entryName;
      if (entry.isDirectory) {
        handleEntry(entryName, 0, true, null);
      } else {
        const { destPath, action } = applyStrategy(path.join(safeDest, path.basename(entryName)), safeDest, strategy);
        if (action === 'skip') {
          results.push({ name: entryName, path: destPath, status: 'skipped', size: entry.header.size || 0 });
          skipped++;
        } else {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.writeFileSync(destPath, entry.getData());
          const status = action === 'rename' ? 'renamed' : 'extracted';
          if (action === 'rename') renamed++; else extracted++;
          totalSize += entry.header.size || 0;
          results.push({ name: entryName, path: destPath, status, size: entry.header.size || 0 });
        }
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
        const cleanName = header.name.replace(/\/$/, '');
        const baseName = path.basename(cleanName);
        if (!baseName || header.type === 'directory') {
          if (baseName) {
            const dirPath = path.join(safeDest, baseName);
            fs.mkdirSync(dirPath, { recursive: true });
            results.push({ name: cleanName, path: dirPath, status: 'extracted', size: 0 });
            extracted++;
          }
          stream.resume();
          next();
          return;
        }
        const { destPath, action } = applyStrategy(path.join(safeDest, baseName), safeDest, strategy);
        if (action === 'skip') {
          results.push({ name: cleanName, path: destPath, status: 'skipped', size: header.size || 0 });
          skipped++;
          stream.resume();
          next();
          return;
        }
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        const ws = createWriteStream(destPath);
        stream.pipe(ws);
        ws.on('finish', () => {
          const status = action === 'rename' ? 'renamed' : 'extracted';
          if (action === 'rename') renamed++; else extracted++;
          totalSize += header.size || 0;
          results.push({ name: cleanName, path: destPath, status, size: header.size || 0 });
          next();
        });
      });
      extract.on('finish', resolve);
      extract.on('error', reject);
      source.pipe(extract);
    });
  } else {
    throw new Error('Unsupported archive format: ' + ext);
  }
  return { extracted, skipped, renamed, totalSize, totalSizeFormatted: formatSize(totalSize), files: results };
}

async function copyEntryWithStrategy(source, destination, strategy, user) {
  const safeSource = safeResolve(source, user);
  const destDir = safeResolve(destination, user);
  const name = path.basename(safeSource);
  const { destPath, action } = applyStrategy(path.join(destDir, name), destDir, strategy || 'overwrite');
  if (action === 'skip') return { path: destPath, action: 'skip' };
  const stat = await fsp.stat(safeSource);
  if (stat.isDirectory()) {
    await fsp.mkdir(destPath, { recursive: true });
    const entries = await fsp.readdir(safeSource, { withFileTypes: true });
    for (const entry of entries) {
      await copyEntryWithStrategy(path.join(safeSource, entry.name), destPath, strategy, user);
    }
  } else {
    await fsp.mkdir(path.dirname(destPath), { recursive: true });
    await fsp.copyFile(safeSource, destPath);
  }
  return { path: destPath, action: action === 'rename' ? 'renamed' : 'copied' };
}

async function moveEntryWithStrategy(source, destination, strategy, user) {
  const safeSource = safeResolve(source, user);
  const destDir = safeResolve(destination, user);
  const name = path.basename(safeSource);
  const { destPath, action } = applyStrategy(path.join(destDir, name), destDir, strategy || 'overwrite');
  if (action === 'skip') return { path: destPath, action: 'skip' };
  try {
    await fsp.rename(safeSource, destPath);
  } catch (err) {
    if (err.code === 'EXDEV') {
      await copyEntryWithStrategy(source, path.dirname(destPath), strategy, user);
      await deleteEntryPermanent(safeSource);
    } else {
      throw err;
    }
  }
  return { path: destPath, action: action === 'rename' ? 'renamed' : 'moved' };
}

/* ─── Bin / Trash ─── */
const BIN_ROOT = getBinRoot();

function ensureBinRoot() {
  fs.mkdirSync(BIN_ROOT, { recursive: true });
}

async function deleteToBin(paths, user) {
  ensureBinRoot();
  const batchId = String(Date.now());
  const batchDir = path.join(BIN_ROOT, batchId);
  fs.mkdirSync(batchDir, { recursive: true });
  const manifest = { batchId, deletedAt: new Date().toISOString(), files: [] };
  for (const p of paths) {
    const safePath = safeResolve(p, user);
    if (!fs.existsSync(safePath)) continue;
    const stat = await fsp.stat(safePath);
    const name = path.basename(safePath);
    const destPath = path.join(batchDir, name);
    if (stat.isDirectory()) {
      await fsp.cp(safePath, destPath, { recursive: true });
      await fsp.rm(safePath, { recursive: true, force: true });
      let childCount = 0;
      try {
        const walk = async (dir) => {
          const entries = await fsp.readdir(dir, { withFileTypes: true });
          for (const e of entries) {
            childCount++;
            if (e.isDirectory()) await walk(path.join(dir, e.name));
          }
        };
        await walk(destPath);
      } catch {}
      manifest.files.push({
        originalPath: safePath,
        name,
        relativePath: name,
        size: 0,
        type: 'directory',
        childCount,
        deletedAt: new Date().toISOString(),
      });
    } else {
      await fsp.copyFile(safePath, destPath);
      await fsp.unlink(safePath);
      manifest.files.push({
        originalPath: safePath,
        name,
        relativePath: name,
        size: stat.size,
        type: 'file',
        deletedAt: new Date().toISOString(),
      });
    }
  }
  if (manifest.files.length === 0) {
    try { fs.rmdirSync(batchDir); } catch {}
    return { moved: 0 };
  }
  fs.writeFileSync(path.join(batchDir, '.manifest.json'), JSON.stringify(manifest, null, 2));
  return { moved: manifest.files.length, batchId };
}

async function listBin() {
  ensureBinRoot();
  const batches = [];
  try {
    const dirs = await fsp.readdir(BIN_ROOT, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const manifestPath = path.join(BIN_ROOT, dir.name, '.manifest.json');
      try {
        const raw = await fsp.readFile(manifestPath, 'utf8');
        const manifest = JSON.parse(raw);
        batches.push(manifest);
      } catch {}
    }
  } catch {}
  batches.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
  return batches;
}

async function restoreFromBin(batchId, fileName, user) {
  const safeBatchId = batchId.replace(/[^a-zA-Z0-9]/g, '');
  const manifestPath = path.join(BIN_ROOT, safeBatchId, '.manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('Bin batch not found');
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  const fileIdx = manifest.files.findIndex(f => f.name === fileName);
  if (fileIdx === -1) throw new Error('File not found in bin');
  const fileEntry = manifest.files[fileIdx];
  const srcPath = path.join(BIN_ROOT, safeBatchId, fileEntry.name);
  const destDir = path.dirname(fileEntry.originalPath);
  await fsp.mkdir(destDir, { recursive: true });
  if (fileEntry.type === 'directory') {
    await fsp.cp(srcPath, fileEntry.originalPath, { recursive: true });
    await fsp.rm(srcPath, { recursive: true, force: true });
  } else {
    await fsp.copyFile(srcPath, fileEntry.originalPath);
    await fsp.unlink(srcPath);
  }
  manifest.files.splice(fileIdx, 1);
  if (manifest.files.length === 0) {
    await fsp.rm(path.join(BIN_ROOT, safeBatchId), { recursive: true, force: true });
  } else {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
  return { restored: fileEntry.originalPath };
}

async function permanentDeleteBin(batchId, fileName) {
  const safeBatchId = batchId.replace(/[^a-zA-Z0-9]/g, '');
  const manifestPath = path.join(BIN_ROOT, safeBatchId, '.manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('Bin batch not found');
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  const fileIdx = manifest.files.findIndex(f => f.name === fileName);
  if (fileIdx === -1) throw new Error('File not found in bin');
  const fileEntry = manifest.files[fileIdx];
  const filePath = path.join(BIN_ROOT, safeBatchId, fileEntry.name);
  try {
    if (fileEntry.type === 'directory') {
      await fsp.rm(filePath, { recursive: true, force: true });
    } else {
      await fsp.unlink(filePath);
    }
  } catch {}
  manifest.files.splice(fileIdx, 1);
  if (manifest.files.length === 0) {
    await fsp.rm(path.join(BIN_ROOT, safeBatchId), { recursive: true, force: true });
  } else {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
  return { deleted: fileName };
}

async function emptyBin() {
  ensureBinRoot();
  const dirs = await fsp.readdir(BIN_ROOT, { withFileTypes: true });
  let count = 0;
  for (const dir of dirs) {
    if (dir.isDirectory()) {
      try {
        const manifestPath = path.join(BIN_ROOT, dir.name, '.manifest.json');
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
          count += manifest.files.length;
        }
        await fsp.rm(path.join(BIN_ROOT, dir.name), { recursive: true, force: true });
      } catch {}
    }
  }
  return { deleted: count };
}

async function deleteEntryPermanent(targetPath) {
  const stat = await fsp.stat(targetPath);
  if (stat.isDirectory()) {
    await fsp.rm(targetPath, { recursive: true, force: true });
  } else {
    await fsp.unlink(targetPath);
  }
}

async function deleteEntry(targetPath, user) {
  const safePath = safeResolve(targetPath, user);
  return deleteToBin([safePath], user);
}

module.exports = {
  gitStatus, gitStage, gitUnstage, gitCommit, gitPush, gitPull, gitLog,
  listDirectory, readFile, createEntry, renameEntry, deleteEntry,
  copyEntry, moveEntry, duplicateEntry, searchFiles,
  createArchive, extractArchive, changePermissions, getDetails,
  safeResolve, formatSize, formatMode, formatDate,
  copyEntryWithOverwrite, moveEntryWithOverwrite,
  listArchiveEntries, checkConflicts, checkExtractConflicts,
  extractArchiveWithStrategy, copyEntryWithStrategy, moveEntryWithStrategy,
  deleteToBin, listBin, restoreFromBin, permanentDeleteBin, emptyBin,
};

/* ─── Git Integration ─── */
const { runSafeSync } = require('../utils/shell');

function gitExec(dir, args) {
  try {
    const result = runSafeSync('git', ['-C', dir, ...args]);
    return result.stdout.trim();
  } catch { return null; }
}

function gitStatus(dirPath, user) {
  const safe = safeResolve(dirPath, user);
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

function gitStage(dirPath, file, user) {
  const safe = safeResolve(dirPath, user);
  gitExec(safe, ['add', file]);
}

function gitUnstage(dirPath, file, user) {
  const safe = safeResolve(dirPath, user);
  gitExec(safe, ['reset', 'HEAD', file]);
}

function gitCommit(dirPath, message, user) {
  const safe = safeResolve(dirPath, user);
  const out = gitExec(safe, ['commit', '-m', message]);
  if (out === null) throw new Error('Commit failed');
  return out;
}

function gitPush(dirPath, user) {
  const safe = safeResolve(dirPath, user);
  const out = gitExec(safe, ['push']);
  if (out === null) throw new Error('Push failed');
  return out;
}

function gitPull(dirPath, user) {
  const safe = safeResolve(dirPath, user);
  const out = gitExec(safe, ['pull']);
  if (out === null) throw new Error('Pull failed');
  return out;
}

function gitLog(dirPath, n, user) {
  const safe = safeResolve(dirPath, user);
  return gitExec(safe, ['log', '--oneline', '-' + (n || 10)]) || '';
}
