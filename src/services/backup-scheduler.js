const fs = require('fs');
const path = require('path');

const SCHEDULE_FILE = path.join(__dirname, '..', '..', 'data', 'backup-schedules.json');
const BACKUP_ROOT = '/var/backups/nexuspanel';
const META_FILE = path.join(__dirname, '..', '..', 'data', 'backups.json');

let writeLock = false;
const LOCK_TIMEOUT = 5000;

function acquireLock() {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const wait = () => {
      if (!writeLock) { writeLock = true; return resolve(); }
      if (Date.now() - start > LOCK_TIMEOUT) return reject(new Error('Schedule write lock timeout'));
      setTimeout(wait, 10);
    };
    wait();
  });
}

function releaseLock() { writeLock = false; }

function load() {
  try {
    if (fs.existsSync(SCHEDULE_FILE)) {
      return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[Scheduler] Failed to load schedules:', err.message);
  }
  return [];
}

function save(schedules) {
  const dir = path.dirname(SCHEDULE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpFile = SCHEDULE_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(schedules, null, 2), 'utf8');
  fs.renameSync(tmpFile, SCHEDULE_FILE);
}

function create(config) {
  const schedules = load();
  const schedule = {
    id: 'bs_' + Date.now(),
    target: config.target,
    frequency: config.frequency,
    time: config.time || '02:00',
    dayOfWeek: config.dayOfWeek || 0,
    dayOfMonth: config.dayOfMonth || 1,
    retention: config.retention || 7,
    enabled: true,
    lastRun: null,
    nextRun: null,
    createdAt: new Date().toISOString(),
  };
  computeNextRun(schedule);
  schedules.push(schedule);
  save(schedules);
  return schedule;
}

function computeNextRun(schedule) {
  const now = new Date();
  const [h, m] = (schedule.time || '02:00').split(':').map(Number);
  let next = new Date(now);
  next.setUTCHours(h, m, 0, 0);

  if (schedule.frequency === 'daily') {
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  } else if (schedule.frequency === 'weekly') {
    const targetDay = schedule.dayOfWeek || 0;
    while (next.getUTCDay() !== targetDay || next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
  } else if (schedule.frequency === 'monthly') {
    const targetDay = Math.min(schedule.dayOfMonth || 1, new Date(next.getUTCFullYear(), next.getUTCMonth() + 1, 0).getUTCDate());
    next.setUTCDate(targetDay);
    if (next <= now) {
      next.setUTCMonth(next.getUTCMonth() + 1);
      const maxDay = new Date(next.getUTCFullYear(), next.getUTCMonth() + 1, 0).getUTCDate();
      next.setUTCDate(Math.min(targetDay, maxDay));
    }
  }

  schedule.nextRun = next.toISOString();
}

function list() { return load(); }

function get(id) { return load().find(s => s.id === id) || null; }

function toggle(id, enabled) {
  const schedules = load();
  const s = schedules.find(s => s.id === id);
  if (!s) return null;
  s.enabled = enabled;
  if (enabled) computeNextRun(s);
  else s.nextRun = null;
  save(schedules);
  return s;
}

function remove(id) {
  const schedules = load();
  const idx = schedules.findIndex(s => s.id === id);
  if (idx === -1) return false;
  schedules.splice(idx, 1);
  save(schedules);
  return true;
}

function markRun(id) {
  const schedules = load();
  const s = schedules.find(s => s.id === id);
  if (!s) return;
  s.lastRun = new Date().toISOString();
  computeNextRun(s);
  save(schedules);
  return s;
}

function getDue() {
  const now = Date.now();
  return load().filter(s => s.enabled && s.nextRun && new Date(s.nextRun).getTime() <= now);
}

function applyRetention(target, keep) {
  try {
    let meta = [];
    try {
      if (fs.existsSync(META_FILE)) {
        meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
      }
    } catch (_) {}

    if (!Array.isArray(meta) || meta.length === 0) return;

    const matching = meta
      .filter(e => e.type === target || (e.items && e.items.some(it => it.id === target)))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    if (matching.length <= keep) return;

    const toDelete = matching.slice(keep);
    for (const entry of toDelete) {
      if (!entry.timestamp) continue;
      const dir = path.join(BACKUP_ROOT, 'backup_' + entry.timestamp);
      try {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      } catch (_) {}
      const idx = meta.findIndex(e => e.timestamp === entry.timestamp);
      if (idx !== -1) meta.splice(idx, 1);
    }

    const tmpFile = META_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(meta, null, 2), 'utf8');
    fs.renameSync(tmpFile, META_FILE);
  } catch (err) {
    console.error('[Scheduler] Retention error:', err.message);
  }
}

module.exports = { create, list, get, toggle, remove, getDue, markRun, applyRetention };
