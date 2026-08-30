const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'audit.json');
const MAX_ENTRIES = 10000;
const MAX_QUERY_LIMIT = 500;
const FLUSH_INTERVAL = 5000;
const GENESIS_HASH = '0'.repeat(64);

let entries = [];
let writeBuffer = [];
let initialized = false;
let flushTimer = null;

function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalize).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k]));
  return '{' + pairs.join(',') + '}';
}

function computeEntryHash(entry) {
  const payload = {
    id: entry.id,
    timestamp: entry.timestamp,
    user: entry.user,
    role: entry.role,
    ip: entry.ip,
    action: entry.action,
    method: entry.method,
    path: entry.path,
    details: entry.details,
    prev_hash: entry.prev_hash || GENESIS_HASH
  };
  return crypto.createHash('sha256').update(canonicalize(payload)).digest('hex');
}

function loadFromDisk() {
  try { entries = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { entries = []; }
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
}

function flushToDisk() {
  if (writeBuffer.length === 0) return;
  const toWrite = entries.slice();
  writeBuffer = [];
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(toWrite, null, 2)); }
  catch (err) { console.error('[AUDIT] Failed to flush:', err.message); }
}

function init() {
  if (initialized) return;
  loadFromDisk();
  initialized = true;
  flushTimer = setInterval(flushToDisk, FLUSH_INTERVAL);
  process.on('exit', flushToDisk);
  process.on('SIGINT', () => { flushToDisk(); process.exit(); });
  process.on('SIGTERM', () => { flushToDisk(); process.exit(); });
}

function log(action, req, details) {
  init();
  const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;
  const prev_hash = lastEntry ? (lastEntry.hash || computeEntryHash(lastEntry)) : GENESIS_HASH;

  const entry = {
    id: 'a_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
    timestamp: new Date().toISOString(),
    user: (req && req.user && req.user.username) || 'system',
    role: (req && req.user && req.user.role) || 'system',
    ip: (req && (req.ip || (req.connection && req.connection.remoteAddress))) || 'unknown',
    action,
    method: (req && req.method) || 'SYSTEM',
    path: (req && (req.originalUrl || req.url)) || '-',
    details: details || null,
    prev_hash: prev_hash,
  };
  entry.hash = computeEntryHash(entry);

  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
  writeBuffer.push(entry);
  return entry;
}

function verifyIntegrity() {
  init();
  for (let i = 0; i < entries.length; i++) {
    const curr = entries[i];
    if (i === 0) {
      if (curr.prev_hash && curr.prev_hash !== GENESIS_HASH) {
        return { valid: false, brokenIndex: 0, reason: 'Genesis block prev_hash invalid', entry: curr };
      }
    } else {
      const prev = entries[i - 1];
      const expectedPrevHash = prev.hash || computeEntryHash(prev);
      if (curr.prev_hash && curr.prev_hash !== expectedPrevHash) {
        return { valid: false, brokenIndex: i, reason: 'Broken prev_hash chain link', entry: curr };
      }
    }
    if (curr.hash) {
      const computedHash = computeEntryHash(curr);
      if (curr.hash !== computedHash) {
        return { valid: false, brokenIndex: i, reason: 'Tampered content / hash mismatch', entry: curr };
      }
    }
  }
  return { valid: true, count: entries.length };
}

function query(opts) {
  init();
  const { user, action, search, startDate, endDate, limit, offset } = opts || {};
  let result = entries.slice().reverse();
  if (user) result = result.filter(function (e) { return e.user === user; });
  if (action) result = result.filter(function (e) { return e.action === action; });
  if (search) {
    var s = search.toLowerCase();
    result = result.filter(function (e) {
      return e.action.toLowerCase().indexOf(s) !== -1
        || e.path.toLowerCase().indexOf(s) !== -1
        || e.user.toLowerCase().indexOf(s) !== -1
        || (e.details && JSON.stringify(e.details).toLowerCase().indexOf(s) !== -1);
    });
  }
  if (startDate) result = result.filter(function (e) { return e.timestamp >= startDate; });
  if (endDate) result = result.filter(function (e) { return e.timestamp <= endDate; });
  var total = result.length;
  var safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), MAX_QUERY_LIMIT);
  var safeOffset = Math.max(parseInt(offset) || 0, 0);
  return { entries: result.slice(safeOffset, safeOffset + safeLimit), total: total };
}

function getActions() {
  init();
  var actions = new Set();
  entries.forEach(function (e) { actions.add(e.action); });
  return Array.from(actions).sort();
}

function getUsers() {
  init();
  var users = new Set();
  entries.forEach(function (e) { if (e.user !== 'system') users.add(e.user); });
  return Array.from(users).sort();
}

function getStats() {
  init();
  var actionCounts = {};
  var userCounts = {};
  entries.forEach(function (e) {
    actionCounts[e.action] = (actionCounts[e.action] || 0) + 1;
    userCounts[e.user] = (userCounts[e.user] || 0) + 1;
  });
  return {
    total: entries.length,
    oldest: entries.length > 0 ? entries[0].timestamp : null,
    newest: entries.length > 0 ? entries[entries.length - 1].timestamp : null,
    actions: actionCounts,
    users: userCounts,
  };
}

function exportAll() {
  init();
  return entries.slice();
}

function clear() {
  init();
  var backupFile = null;
  if (entries.length > 0) {
    backupFile = path.join(__dirname, '..', '..', 'data', 'audit-backup-' + Date.now() + '.json');
    try { fs.writeFileSync(backupFile, JSON.stringify(entries, null, 2)); } catch {}
  }
  entries = [];
  writeBuffer = [];
  flushToDisk();
  return { cleared: true, backup: backupFile };
}

function routeLogger(moduleName) {
  return function (req, res, next) {
    if (['POST', 'PUT', 'DELETE'].indexOf(req.method) === -1) return next();
    var orig = res.json.bind(res);
    res.json = function (data) {
      if (data && !data.error) {
        var suffix = req.method === 'POST' ? 'create' : req.method === 'PUT' ? 'update' : 'delete';
        var action = moduleName + ':' + suffix;
        var details = {};
        if (req.params) {
          Object.keys(req.params).forEach(function (k) {
            var v = req.params[k];
            if (v && typeof v === 'string' && v.length < 200) details[k] = v;
          });
        }
        if (req.body && typeof req.body === 'object') {
          ['name', 'type', 'action', 'enabled', 'domain', 'username', 'email', 'host', 'port'].forEach(function (k) {
            if (req.body[k] !== undefined) {
              var v = req.body[k];
              if (typeof v === 'string' && v.length < 200) details[k] = v;
              else if (typeof v === 'boolean' || typeof v === 'number') details[k] = v;
            }
          });
        }
        log(action, req, Object.keys(details).length > 0 ? details : null);
      }
      return orig(data);
    };
    next();
  };
}

module.exports = { log, query, getActions, getUsers, getStats, exportAll, clear, routeLogger, init, verifyIntegrity, computeEntryHash, GENESIS_HASH };

