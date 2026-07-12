const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'mime-types.json');
const SYSTEM_FILE = '/etc/mime.types';

const MIME_RE = /^(\w+\/[\w.+-]+)(?:\s+([\w.+-]+(?:\s+[\w.+-]+)*))?$/;

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
  fs.writeFileSync(DATA_FILE, JSON.stringify(types, null, 2));
}

function getUserTypes() {
  return loadUserTypes();
}

function getUserType(id) {
  const types = loadUserTypes();
  return types.find(t => t.id === id) || null;
}

function createUserType({ mimeType, extensions, description }) {
  if (!mimeType || !/^\w+\/[\w.+-]+$/.test(mimeType)) {
    throw new Error('Invalid MIME type format (must be type/subtype)');
  }
  if (!extensions || extensions.length === 0) {
    throw new Error('At least one extension is required');
  }
  const cleanExts = extensions.map(e => e.startsWith('.') ? e : '.' + e);
  const types = loadUserTypes();
  const allSystem = getSystemList();
  if (allSystem.some(t => t.mimeType === mimeType)) {
    throw new Error('MIME type already exists in system types');
  }
  if (types.some(t => t.mimeType === mimeType)) {
    throw new Error('MIME type already exists in user-defined types');
  }
  const entry = {
    id: 'm_' + Date.now(),
    mimeType,
    extensions: cleanExts,
    description: description || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  types.push(entry);
  saveUserTypes(types);
  return entry;
}

function updateUserType(id, updates) {
  const types = loadUserTypes();
  const idx = types.findIndex(t => t.id === id);
  if (idx === -1) throw new Error('MIME type not found');
  if (updates.mimeType !== undefined) {
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
    if (updates.extensions.length === 0) throw new Error('At least one extension is required');
    types[idx].extensions = updates.extensions.map(e => e.startsWith('.') ? e : '.' + e);
  }
  if (updates.description !== undefined) {
    types[idx].description = updates.description;
  }
  types[idx].updatedAt = new Date().toISOString();
  saveUserTypes(types);
  return types[idx];
}

function deleteUserType(id) {
  const types = loadUserTypes();
  const idx = types.findIndex(t => t.id === id);
  if (idx === -1) throw new Error('MIME type not found');
  types.splice(idx, 1);
  saveUserTypes(types);
  return { deleted: true };
}

module.exports = {
  getSystemTypes, getSystemList,
  getUserTypes, getUserType,
  createUserType, updateUserType, deleteUserType,
  CATEGORY_COLORS,
};
