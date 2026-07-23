const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'mime-types.json');
const SYSTEM_FILE = '/etc/mime.types';

const MIME_RE = /^(\w+\/[\w.+-]+)(?:\s+([\w.+-]+(?:\s+[\w.+-]+)*))?$/;
const EXT_RE = /^\.[a-z0-9]{1,32}$/i;
const ID_RE = /^m_\d+_[a-f0-9]+$/;

const MAX_MIME_LENGTH = 128;
const MAX_DESC_LENGTH = 512;
const MAX_EXT_LENGTH = 32;
const MAX_EXT_COUNT = 20;

const CATEGORY_COLORS = {
  application: '#06b6d4',
  text: '#10b981',
  image: '#ec4899',
  audio: '#f59e0b',
  video: '#8b5cf6',
  font: '#3b82f6',
  message: '#14b8a6',
  model: '#f97316',
  multipart: '#64748b',
};

let fileLock = false;
let fileLockTimer = null;

function acquireLock(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryLock = () => {
      if (!fileLock) {
        fileLock = true;
        fileLockTimer = setTimeout(() => { fileLock = false; }, timeoutMs);
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Timeout acquiring file lock'));
        return;
      }
      setTimeout(tryLock, 50);
    };
    tryLock();
  });
}

function releaseLock() {
  if (fileLockTimer) { clearTimeout(fileLockTimer); fileLockTimer = null; }
  fileLock = false;
}

function getSystemTypes() {
  try {
    const content = fs.readFileSync(SYSTEM_FILE, 'utf8');
    const categories = {};
    let total = 0;
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const m = trimmed.match(MIME_RE);
      if (!m) continue;
      const mimeType = m[1];
      const extensions = m[2] ? m[2].split(/\s+/).filter(Boolean).map(e => '.' + e) : [];
      const cat = mimeType.split('/')[0] || 'other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push({ mimeType, extensions });
      total++;
    }
    const breakdown = {};
    for (const [cat, entries] of Object.entries(categories)) {
      breakdown[cat] = entries.length;
    }
    return { categories, breakdown, total, colors: CATEGORY_COLORS };
  } catch {
    return { categories: {}, breakdown: {}, total: 0, colors: CATEGORY_COLORS };
  }
}

function getSystemList() {
  const { categories } = getSystemTypes();
  const all = [];
  for (const entries of Object.values(categories)) {
    all.push(...entries);
  }
  return all;
}

function loadUserTypes() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveUserTypes(types) {
  const tmp = DATA_FILE + '.tmp.' + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(types, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

function getUserTypes() {
  return loadUserTypes();
}

function getUserType(id) {
  if (!ID_RE.test(id)) return null;
  const types = loadUserTypes();
  return types.find(t => t.id === id) || null;
}

function validateExtensions(extensions) {
  if (!Array.isArray(extensions) || extensions.length === 0) {
    throw new Error('At least one extension is required');
  }
  if (extensions.length > MAX_EXT_COUNT) {
    throw new Error('Maximum ' + MAX_EXT_COUNT + ' extensions allowed');
  }
  const cleaned = [];
  for (const ext of extensions) {
    const normalized = ext.startsWith('.') ? ext : '.' + ext;
    if (normalized.length > MAX_EXT_LENGTH) {
      throw new Error('Extension too long (max ' + MAX_EXT_LENGTH + ' chars): ' + ext);
    }
    if (!EXT_RE.test(normalized)) {
      throw new Error('Invalid extension format: ' + ext);
    }
    cleaned.push(normalized);
  }
  return cleaned;
}

function createUserType({ mimeType, extensions, description }) {
  if (!mimeType || typeof mimeType !== 'string') {
    throw new Error('MIME type is required');
  }
  if (mimeType.length > MAX_MIME_LENGTH) {
    throw new Error('MIME type too long (max ' + MAX_MIME_LENGTH + ' chars)');
  }
  if (!/^\w+\/[\w.+-]+$/.test(mimeType)) {
    throw new Error('Invalid MIME type format (must be type/subtype)');
  }
  const cleanExts = validateExtensions(extensions);
  if (description && typeof description === 'string' && description.length > MAX_DESC_LENGTH) {
    throw new Error('Description too long (max ' + MAX_DESC_LENGTH + ' chars)');
  }

  const types = loadUserTypes();
  const allSystem = getSystemList();
  if (allSystem.some(t => t.mimeType === mimeType)) {
    throw new Error('MIME type already exists in system types');
  }
  if (types.some(t => t.mimeType === mimeType)) {
    throw new Error('MIME type already exists in user-defined types');
  }

  const entry = {
    id: 'm_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
    mimeType,
    extensions: cleanExts,
    description: (description || '').substring(0, MAX_DESC_LENGTH),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  types.push(entry);
  saveUserTypes(types);
  return entry;
}

function updateUserType(id, updates) {
  if (!ID_RE.test(id)) throw new Error('Invalid MIME type ID');
  const types = loadUserTypes();
  const idx = types.findIndex(t => t.id === id);
  if (idx === -1) throw new Error('MIME type not found');

  if (updates.mimeType !== undefined) {
    if (typeof updates.mimeType !== 'string' || updates.mimeType.length > MAX_MIME_LENGTH) {
      throw new Error('Invalid MIME type');
    }
    if (!/^\w+\/[\w.+-]+$/.test(updates.mimeType)) {
      throw new Error('Invalid MIME type format');
    }
    const dup = types.find((t, i) => i !== idx && t.mimeType === updates.mimeType);
    if (dup) throw new Error('MIME type already exists');
    const allSystem = getSystemList();
    if (allSystem.some(t => t.mimeType === updates.mimeType)) {
      throw new Error('MIME type already exists in system types');
    }
    types[idx].mimeType = updates.mimeType;
  }
  if (updates.extensions !== undefined) {
    types[idx].extensions = validateExtensions(updates.extensions);
  }
  if (updates.description !== undefined) {
    types[idx].description = (updates.description || '').substring(0, MAX_DESC_LENGTH);
  }
  types[idx].updatedAt = new Date().toISOString();
  saveUserTypes(types);
  return types[idx];
}

function deleteUserType(id) {
  if (!ID_RE.test(id)) throw new Error('Invalid MIME type ID');
  const types = loadUserTypes();
  const idx = types.findIndex(t => t.id === id);
  if (idx === -1) throw new Error('MIME type not found');
  types.splice(idx, 1);
  saveUserTypes(types);
  return { deleted: true };
}

function bulkDeleteUserTypes(ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('No IDs provided');
  if (ids.length > 50) throw new Error('Maximum 50 bulk operations');
  const types = loadUserTypes();
  let deleted = 0;
  for (const id of ids) {
    if (!ID_RE.test(id)) continue;
    const idx = types.findIndex(t => t.id === id);
    if (idx !== -1) {
      types.splice(idx, 1);
      deleted++;
    }
  }
  saveUserTypes(types);
  return { deleted };
}

function lookupByExtension(ext) {
  if (!ext || typeof ext !== 'string') return [];
  const normalized = ext.startsWith('.') ? ext.toLowerCase() : '.' + ext.toLowerCase();
  const results = [];

  const systemTypes = getSystemList();
  for (const t of systemTypes) {
    if (t.extensions.some(e => e.toLowerCase() === normalized)) {
      results.push({ mimeType: t.mimeType, extensions: t.extensions, source: 'system' });
    }
  }

  const userTypes = loadUserTypes();
  for (const t of userTypes) {
    if (t.extensions.some(e => e.toLowerCase() === normalized)) {
      results.push({ mimeType: t.mimeType, extensions: t.extensions, source: 'user', id: t.id });
    }
  }

  return results;
}

function exportUserTypes() {
  return loadUserTypes();
}

function importUserTypes(typesToImport) {
  if (!Array.isArray(typesToImport)) throw new Error('Import data must be an array');
  if (typesToImport.length > 50) throw new Error('Maximum 50 types per import');

  const existing = loadUserTypes();
  const allSystem = getSystemList();
  const existingMimes = new Set([...allSystem.map(t => t.mimeType), ...existing.map(t => t.mimeType)]);
  let imported = 0;
  let skipped = 0;

  for (const item of typesToImport) {
    if (!item.mimeType || !/^\w+\/[\w.+-]+$/.test(item.mimeType)) {
      skipped++;
      continue;
    }
    if (existingMimes.has(item.mimeType)) {
      skipped++;
      continue;
    }
    let cleanExts;
    try {
      cleanExts = validateExtensions(item.extensions);
    } catch {
      skipped++;
      continue;
    }
    const entry = {
      id: 'm_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
      mimeType: item.mimeType,
      extensions: cleanExts,
      description: (item.description || '').substring(0, MAX_DESC_LENGTH),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    existing.push(entry);
    existingMimes.add(item.mimeType);
    imported++;
  }

  saveUserTypes(existing);
  return { imported, skipped };
}

function getExtensionOverlap(extensions) {
  const cleanExts = extensions.map(e => e.startsWith('.') ? e.toLowerCase() : ('.' + e).toLowerCase());
  const overlaps = [];

  const systemTypes = getSystemList();
  for (const t of systemTypes) {
    const match = t.extensions.filter(e => cleanExts.includes(e.toLowerCase()));
    if (match.length > 0) {
      overlaps.push({ mimeType: t.mimeType, extensions: match, source: 'system' });
    }
  }

  const userTypes = loadUserTypes();
  for (const t of userTypes) {
    const match = t.extensions.filter(e => cleanExts.includes(e.toLowerCase()));
    if (match.length > 0) {
      overlaps.push({ mimeType: t.mimeType, extensions: match, source: 'user', id: t.id });
    }
  }

  return overlaps;
}

module.exports = {
  getSystemTypes, getSystemList,
  getUserTypes, getUserType,
  createUserType, updateUserType, deleteUserType,
  bulkDeleteUserTypes, lookupByExtension,
  exportUserTypes, importUserTypes, getExtensionOverlap,
  CATEGORY_COLORS, ID_RE,
};
