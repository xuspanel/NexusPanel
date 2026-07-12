const fs = require('fs');
const path = require('path');

const SCHEDULE_FILE = path.join(__dirname, '..', '..', 'data', 'backup-schedules.json');

function load() {
  try { return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8')); }
  catch { return []; }
}

function save(schedules) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(schedules, null, 2));
}

function create(config) {
  const schedules = load();
  const schedule = {
    id: 'bs_' + Date.now(),
    target: config.target,
    frequency: config.frequency,  // 'daily', 'weekly', 'monthly'
    time: config.time || '02:00', // HH:MM UTC
    dayOfWeek: config.dayOfWeek || 0, // 0=Sun for weekly
    dayOfMonth: config.dayOfMonth || 1, // for monthly
    retention: config.retention || 7, // keep last N backups
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
}

function getDue() {
  const now = Date.now();
  return load().filter(s => s.enabled && s.nextRun && new Date(s.nextRun).getTime() <= now);
}

function applyRetention(target, keep) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'backups.json'), 'utf8'));
    const entries = Object.entries(meta)
      .filter(([, v]) => (v.type || v.target) === target)
      .sort((a, b) => new Date(b[0]) - new Date(a[0]));
    if (entries.length > keep) {
      const toDelete = entries.slice(keep);
      toDelete.forEach(([ts]) => {
        const dir = path.join('/var/backups/nexuspanel', ts);
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
        delete meta[ts];
      });
      fs.writeFileSync(path.join(__dirname, '..', '..', 'data', 'backups.json'), JSON.stringify(meta, null, 2));
    }
  } catch {}
}

module.exports = { create, list, get, toggle, remove, getDue, markRun, applyRetention };
