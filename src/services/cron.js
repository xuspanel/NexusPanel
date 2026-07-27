const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const CRON_LOCKS = {};
const CRON_LOCK_TIMEOUT = 10000;
const CRON_FIELD_RE = /^(@\w+|[\d\*\/\,\-\/\s]+)\s+([\d\*\/\,\-\/\s]+)\s+([\d\*\/\,\-\/\s]+)\s+([\d\*\/\,\-\/\s]+)\s+([\d\*\/\,\-\/\s]+)\s+(.+)$/;
const SHORTHAND_RE = /^@(reboot|yearly|annually|monthly|weekly|daily|midnight|hourly)$/;
const CRON_D_DIR = '/etc/cron.d';

function acquireLock(owner) {
  if (CRON_LOCKS[owner]) {
    if (Date.now() - CRON_LOCKS[owner] < CRON_LOCK_TIMEOUT) {
      throw new Error('Operation in progress for this owner, please retry');
    }
    delete CRON_LOCKS[owner];
  }
  CRON_LOCKS[owner] = Date.now();
}

function releaseLock(owner) {
  delete CRON_LOCKS[owner];
}

function sanitizeOwner(owner) {
  if (!owner || typeof owner !== 'string') throw new Error('Invalid owner');
  const safe = owner.replace(/[^a-zA-Z0-9_.-]/g, '');
  if (!safe) throw new Error('Invalid owner');
  return safe;
}

function sanitizeField(val) {
  if (val === undefined || val === null) return '*';
  return String(val).trim() || '*';
}

function runCrontab(args) {
  try {
    const stdout = execFileSync('crontab', args, { timeout: 5000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { stdout, stderr: '', status: 0 };
  } catch (e) {
    return { stdout: e.stdout || '', stderr: e.stderr || '', status: e.status || 1 };
  }
}

function validateCronField(value, fieldName, min, max) {
  if (value === '*' || value === undefined || value === null) return true;
  const str = String(value).trim();
  if (!str || str === '*') return true;
  const parts = str.split(',');
  for (const part of parts) {
    const stepParts = part.split('/');
    if (stepParts.length > 2) return false;
    if (stepParts.length === 2) {
      const step = stepParts[1];
      if (!/^\d+$/.test(step) || parseInt(step) < 1) return false;
    }
    const rangePart = stepParts[0];
    if (rangePart === '*') continue;
    const rangeParts = rangePart.split('-');
    if (rangeParts.length > 2) return false;
    for (const rp of rangeParts) {
      if (!/^\d+$/.test(rp)) return false;
      const v = parseInt(rp);
      if (v < min || v > max) return false;
    }
  }
  return true;
}

function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') throw new Error('Invalid entry');
  const cmd = sanitizeField(entry.command);
  if (!cmd || cmd === '*') throw new Error('Command is required');
  if (cmd.length > 2048) throw new Error('Command too long (max 2048 chars)');

  const shorthands = ['@reboot', '@yearly', '@annually', '@monthly', '@weekly', '@daily', '@midnight', '@hourly'];
  const hasShorthand = shorthands.some(s => cmd.startsWith(s + ' ') || cmd === s);

  if (entry.shorthand) {
    if (!shorthands.includes(entry.shorthand)) throw new Error('Invalid shorthand: ' + entry.shorthand);
    return {
      shorthand: entry.shorthand,
      minute: '*',
      hour: '*',
      dom: '*',
      month: '*',
      dow: '*',
      command: cmd,
      enabled: entry.enabled !== false,
    };
  }

  if (!validateCronField(entry.minute, 'minute', 0, 59)) throw new Error('Invalid minute field');
  if (!validateCronField(entry.hour, 'hour', 0, 23)) throw new Error('Invalid hour field');
  if (!validateCronField(entry.dom, 'day of month', 1, 31)) throw new Error('Invalid day of month field');
  if (!validateCronField(entry.month, 'month', 1, 12)) throw new Error('Invalid month field');
  if (!validateCronField(entry.dow, 'day of week', 0, 7)) throw new Error('Invalid day of week field');

  return {
    minute: sanitizeField(entry.minute),
    hour: sanitizeField(entry.hour),
    dom: sanitizeField(entry.dom),
    month: sanitizeField(entry.month),
    dow: sanitizeField(entry.dow),
    command: cmd,
    enabled: entry.enabled !== false,
  };
}

function parseEntryLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const isComment = trimmed.startsWith('#');
  const content = isComment ? trimmed.slice(1).trim() : trimmed;
  if (!content) return null;

  const shorthandMatch = content.match(SHORTHAND_RE);
  if (shorthandMatch) {
    const parts = content.split(/\s+/);
    const shorthand = parts[0];
    const cmd = parts.slice(1).join(' ');
    return {
      minute: shorthand === '@hourly' ? '0' : shorthand === '@daily' || shorthand === '@midnight' ? '0' : shorthand === '@weekly' ? '0' : shorthand === '@monthly' ? '0' : shorthand === '@yearly' || shorthand === '@annually' ? '0' : '*',
      hour: shorthand === '@hourly' ? '*' : '0',
      dom: '*',
      month: '*',
      dow: '*',
      command: cmd,
      enabled: !isComment,
      shorthand: shorthand,
    };
  }

  const match = content.match(CRON_FIELD_RE);
  if (!match) return null;

  return {
    minute: match[1].trim(),
    hour: match[2].trim(),
    dom: match[3].trim(),
    month: match[4].trim(),
    dow: match[5].trim(),
    command: match[6].trim(),
    enabled: !isComment,
  };
}

function formatEntry(entry) {
  if (entry.shorthand) {
    const line = entry.shorthand + ' ' + entry.command;
    return entry.enabled ? line : '# ' + line;
  }
  const line = [entry.minute, entry.hour, entry.dom, entry.month, entry.dow, entry.command].join(' ');
  return entry.enabled ? line : '# ' + line;
}

function parse(raw) {
  const lines = raw.split('\n');
  const entries = [];
  lines.forEach((line) => {
    const entry = parseEntryLine(line);
    if (entry) entries.push(entry);
  });
  return entries;
}

function format(entries) {
  return entries.map(e => formatEntry(e)).join('\n') + '\n';
}

function acquireFileLock(filePath) {
  const lockFile = filePath + '.lock';
  if (fs.existsSync(lockFile)) {
    try {
      const content = fs.readFileSync(lockFile, 'utf8');
      const lockTime = parseInt(content);
      if (Date.now() - lockTime < CRON_LOCK_TIMEOUT) {
        throw new Error('File is locked, please retry');
      }
    } catch (e) {
      if (e.message.includes('locked')) throw e;
    }
  }
  fs.writeFileSync(lockFile, String(Date.now()), { mode: 0o600 });
}

function releaseFileLock(filePath) {
  const lockFile = filePath + '.lock';
  try { fs.unlinkSync(lockFile); } catch {}
}

function list(owner) {
  const safeOwner = sanitizeOwner(owner);
  const result = runCrontab(['-l', '-u', safeOwner]);
  if (result.status !== 0) return [];
  return parse(result.stdout);
}

function save(owner, entries) {
  const safeOwner = sanitizeOwner(owner);
  acquireLock(safeOwner);
  try {
    const content = format(entries);
    const tmp = path.join(os.tmpdir(), 'cron_' + safeOwner + '_' + crypto.randomBytes(8).toString('hex') + '.tmp');
    fs.writeFileSync(tmp, content, { mode: 0o600 });
    try {
      const result = runCrontab(['-u', safeOwner, tmp]);
      if (result.status !== 0 && result.stderr) {
        throw new Error('Failed to save crontab: ' + result.stderr.trim());
      }
    } finally {
      try { fs.unlinkSync(tmp); } catch {}
    }
  } finally {
    releaseLock(safeOwner);
  }
}

function add(owner, entry) {
  const validated = validateEntry(entry);
  const entries = list(owner);
  entries.push(validated);
  save(owner, entries);
  return validated;
}

function update(owner, index, entry) {
  const validated = validateEntry(entry);
  const entries = list(owner);
  if (index < 0 || index >= entries.length) throw new Error('Entry not found');
  entries[index] = validated;
  save(owner, entries);
  return validated;
}

function remove(owner, index) {
  const entries = list(owner);
  if (index < 0 || index >= entries.length) throw new Error('Entry not found');
  entries.splice(index, 1);
  save(owner, entries);
}

function toggle(owner, index) {
  const entries = list(owner);
  if (index < 0 || index >= entries.length) throw new Error('Entry not found');
  entries[index].enabled = !entries[index].enabled;
  save(owner, entries);
  return entries[index];
}

function getOwners() {
  const owners = new Map();
  try {
    const raw = fs.readFileSync('/etc/passwd', 'utf8');
    const lines = raw.trim().split('\n');
    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length >= 1) owners.set(parts[0], { name: parts[0], uid: parseInt(parts[2]) || 0 });
    }
  } catch {}

  const result = [];
  for (const [name] of owners) {
    try {
      const out = execFileSync('crontab', ['-l', '-u', name], { timeout: 2000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      const entries = parse(out);
      if (entries.length > 0) {
        result.push({ name, entries: entries.length });
      }
    } catch {}
  }

  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

function describeField(value, fieldName) {
  const v = String(value).trim();
  if (v === '*') {
    const map = { minute: 'every minute', hour: 'every hour', dom: 'every day', month: 'every month', dow: 'every day of week' };
    return map[fieldName] || v;
  }
  if (v.includes('/')) {
    const parts = v.split('/');
    const step = parts[1] || '1';
    if (parts[0] === '*') return 'every ' + step + ' ' + fieldName + 's';
    return 'every ' + step + ' ' + fieldName + 's from ' + parts[0];
  }
  if (v.includes('-') && v.includes(',')) return v;
  if (v.includes('-')) {
    const [a, b] = v.split('-');
    return fieldName + 's ' + a + ' through ' + b;
  }
  if (v.includes(',')) {
    return fieldName + 's ' + v;
  }
  return fieldName + ' ' + v;
}

function describeSchedule(entry) {
  if (entry.shorthand) {
    const map = {
      '@reboot': 'At system startup',
      '@yearly': 'Once a year (Jan 1, 00:00)',
      '@annually': 'Once a year (Jan 1, 00:00)',
      '@monthly': 'Once a month (1st, 00:00)',
      '@weekly': 'Once a week (Sunday, 00:00)',
      '@daily': 'Once a day (00:00)',
      '@midnight': 'Once a day (00:00)',
      '@hourly': 'Once an hour (minute 0)',
    };
    return map[entry.shorthand] || entry.shorthand;
  }

  const isMinuteAny = entry.minute === '*';
  const isHourAny = entry.hour === '*';
  const isDomAny = entry.dom === '*';
  const isMonthAny = entry.month === '*';
  const isDowAny = entry.dow === '*';

  if (isMinuteAny && isHourAny && isDomAny && isMonthAny && isDowAny) return 'Every minute';
  if (!isMinuteAny && isHourAny && isDomAny && isMonthAny && isDowAny && /^\d+$/.test(entry.minute)) {
    return 'Minute ' + entry.minute + ' of every hour';
  }

  const parts = [];
  if (isMinuteAny && isHourAny) parts.push('Every minute');
  else if (isHourAny && /^\d+$/.test(entry.minute)) parts.push('Minute ' + entry.minute + ' of every hour');
  else if (isMinuteAny && /^\d+$/.test(entry.hour)) parts.push('At ' + entry.hour.padStart(2, '0') + ':00');
  else if (/^\d+$/.test(entry.minute) && /^\d+$/.test(entry.hour)) parts.push('At ' + entry.hour.padStart(2, '0') + ':' + entry.minute.padStart(2, '0'));
  else parts.push(describeField(entry.minute, 'minute'));

  if (!isDomAny) parts.push('on day ' + entry.dom);
  if (!isMonthAny) parts.push('in month ' + entry.month);
  if (!isDowAny) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (/^\d+$/.test(entry.dow)) parts.push('on ' + (dayNames[parseInt(entry.dow)] || 'day ' + entry.dow));
    else parts.push('on day of week ' + entry.dow);
  }

  return parts.join(', ');
}

function calcNextRun(entry, from) {
  const now = from || new Date();
  if (entry.shorthand) {
    if (entry.shorthand === '@reboot') return null;
    const d = new Date(now);
    switch (entry.shorthand) {
      case '@hourly': d.setMinutes(0); d.setSeconds(0); d.setMilliseconds(0); if (d <= now) d.setHours(d.getHours() + 1); break;
      case '@daily': case '@midnight': d.setHours(0); d.setMinutes(0); d.setSeconds(0); d.setMilliseconds(0); if (d <= now) d.setDate(d.getDate() + 1); break;
      case '@weekly': d.setHours(0); d.setMinutes(0); d.setSeconds(0); d.setMilliseconds(0); d.setDate(d.getDate() + (7 - d.getDay())); if (d <= now) d.setDate(d.getDate() + 7); break;
      case '@monthly': d.setHours(0); d.setMinutes(0); d.setSeconds(0); d.setMilliseconds(0); d.setDate(1); if (d <= now) d.setMonth(d.getMonth() + 1); break;
      case '@yearly': case '@annually': d.setHours(0); d.setMinutes(0); d.setSeconds(0); d.setMilliseconds(0); d.setMonth(0); d.setDate(1); if (d <= now) d.setFullYear(d.getFullYear() + 1); break;
    }
    return d;
  }

  const matchCronValue = (field, value) => {
    if (field === '*') return true;
    const str = String(field).trim();
    if (str.includes('/')) {
      const parts = str.split('/');
      const base = parts[0] === '*' ? 0 : parseInt(parts[0]);
      const step = parseInt(parts[1]) || 1;
      return (value - base) % step === 0;
    }
    if (str.includes(',')) return str.split(',').some(v => matchCronValue(v.trim(), value));
    if (str.includes('-')) {
      const [a, b] = str.split('-').map(Number);
      return value >= a && value <= b;
    }
    return parseInt(str) === value;
  };

  const d = new Date(now);
  d.setSeconds(0);
  d.setMilliseconds(0);
  d.setMinutes(d.getMinutes() + 1);

  for (let iter = 0; iter < 366 * 24 * 60; iter++) {
    if (!matchCronValue(entry.month, d.getMonth() + 1)) { d.setMonth(d.getMonth() + 1); d.setDate(1); d.setHours(0); d.setMinutes(0); continue; }
    if (!matchCronValue(entry.dom, d.getDate())) { d.setDate(d.getDate() + 1); d.setHours(0); d.setMinutes(0); continue; }
    if (!matchCronValue(entry.dow, d.getDay())) { d.setDate(d.getDate() + 1); d.setHours(0); d.setMinutes(0); continue; }
    if (!matchCronValue(entry.hour, d.getHours())) { d.setHours(d.getHours() + 1); d.setMinutes(0); continue; }
    if (!matchCronValue(entry.minute, d.getMinutes())) { d.setMinutes(d.getMinutes() + 1); continue; }
    return d;
  }
  return null;
}

function formatDuration(ms) {
  if (ms < 0) return 'past due';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'less than a minute';
  if (mins < 60) return mins + ' min' + (mins === 1 ? '' : 's');
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 24) return hrs + 'h ' + remMins + 'm';
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return days + 'd ' + remHrs + 'h';
}

function listSystemCronD() {
  const entries = [];
  try {
    const files = fs.readdirSync(CRON_D_DIR);
    for (const file of files) {
      if (file.startsWith('.')) continue;
      const filePath = path.join(CRON_D_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) continue;
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = parse(raw);
        for (const entry of parsed) {
          entry.file = file;
          entry.filePath = filePath;
          entries.push(entry);
        }
      } catch {}
    }
  } catch {}
  return entries;
}

function readSystemCronD(filename) {
  const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, '');
  if (!safeName) throw new Error('Invalid filename');
  const filePath = path.join(CRON_D_DIR, safeName);
  if (!fs.existsSync(filePath)) throw new Error('File not found');
  const raw = fs.readFileSync(filePath, 'utf8');
  return { filename: safeName, content: raw, entries: parse(raw) };
}

function saveSystemCronD(filename, content) {
  const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, '');
  if (!safeName) throw new Error('Invalid filename');
  const filePath = path.join(CRON_D_DIR, safeName);
  acquireFileLock(filePath);
  try {
    const tmp = path.join(os.tmpdir(), 'crond_' + safeName + '_' + crypto.randomBytes(8).toString('hex') + '.tmp');
    fs.writeFileSync(tmp, content, { mode: 0o644 });
    try {
      fs.copyFileSync(tmp, filePath);
    } finally {
      try { fs.unlinkSync(tmp); } catch {}
    }
  } finally {
    releaseFileLock(filePath);
  }
}

function deleteSystemCronD(filename) {
  const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, '');
  if (!safeName) throw new Error('Invalid filename');
  const filePath = path.join(CRON_D_DIR, safeName);
  if (!fs.existsSync(filePath)) throw new Error('File not found');
  acquireFileLock(filePath);
  try {
    const backup = filePath + '.bak.' + Date.now();
    try { fs.copyFileSync(filePath, backup); } catch {}
    fs.unlinkSync(filePath);
  } finally {
    releaseFileLock(filePath);
  }
}

module.exports = {
  list, add, update, remove, toggle, getOwners, parse, format,
  validateEntry, describeSchedule, calcNextRun, formatDuration,
  listSystemCronD, readSystemCronD, saveSystemCronD, deleteSystemCronD,
};
