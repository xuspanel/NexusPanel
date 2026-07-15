const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'notifications.json');

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function save(entries) {
  if (entries.length > 500) entries = entries.slice(-500);
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2));
}

function add(type, title, message) {
  const entries = load();
  const entry = {
    id: 'n_' + Date.now(),
    type, title, message,
    timestamp: new Date().toISOString(),
    read: false,
  };
  entries.push(entry);
  save(entries);
  return entry;
}

function list(unreadOnly) {
  let entries = load().reverse();
  if (unreadOnly) entries = entries.filter(e => !e.read);
  const unread = entries.filter(e => !e.read).length;
  return { entries: entries.slice(0, 50), unread, total: entries.length };
}

function markRead(id) {
  const entries = load();
  const e = entries.find(e => e.id === id);
  if (e) e.read = true;
  save(entries);
}

function markAllRead() {
  const entries = load();
  entries.forEach(e => e.read = true);
  save(entries);
}

function clear() {
  fs.writeFileSync(DATA_FILE, '[]');
}

module.exports = { add, list, markRead, markAllRead, clear };
