const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'audit.json');
const MAX_ENTRIES = 10000;

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function save(entries) {
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2));
}

function log(action, req, details) {
  const entry = {
    id: 'a_' + Date.now(),
    timestamp: new Date().toISOString(),
    user: req.user?.username || 'system',
    role: req.user?.role || 'system',
    ip: req.ip || req.connection?.remoteAddress || 'unknown',
    action,
    method: req.method,
    path: req.originalUrl || req.url,
    details: details || null,
  };
  const entries = load();
  entries.push(entry);
  save(entries);
  return entry;
}

function query(opts) {
  const { user, action, search, limit, offset } = opts || {};
  let entries = load().reverse();
  if (user) entries = entries.filter(e => e.user === user);
  if (action) entries = entries.filter(e => e.action === action);
  if (search) {
    const s = search.toLowerCase();
    entries = entries.filter(e =>
      e.action.toLowerCase().includes(s) ||
      e.path.toLowerCase().includes(s) ||
      (e.details && JSON.stringify(e.details).toLowerCase().includes(s))
    );
  }
  const total = entries.length;
  const start = offset || 0;
  const end = start + (limit || 100);
  return { entries: entries.slice(start, end), total };
}

function getActions() {
  const entries = load();
  const actions = new Set();
  entries.forEach(e => actions.add(e.action));
  return [...actions].sort();
}

function clear() {
  fs.writeFileSync(DATA_FILE, '[]');
}

module.exports = { log, query, getActions, clear };
