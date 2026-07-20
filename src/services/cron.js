const { execFileSync } = require('child_process');
const fs = require('fs');

function runCrontab(args) {
  try {
    const stdout = execFileSync('crontab', args, { timeout: 5000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { stdout, stderr: '', status: 0 };
  } catch (e) {
    return { stdout: e.stdout || '', stderr: e.stderr || '', status: e.status || 1 };
  }
}

function list(owner) {
  const safeOwner = owner.replace(/[^a-zA-Z0-9_.-]/g, '');
  const result = runCrontab(['-l', '-u', safeOwner]);
  if (result.status !== 0) return [];
  return parse(result.stdout);
}

function parse(raw) {
  const lines = raw.split('\n');
  const entries = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 6) return;
    entries.push({
      index: i,
      minute: parts[0],
      hour: parts[1],
      dom: parts[2],
      month: parts[3],
      dow: parts[4],
      command: parts.slice(5).join(' '),
    });
  });
  return entries;
}

function format(entries) {
  return entries.map(e => e.minute + ' ' + e.hour + ' ' + e.dom + ' ' + e.month + ' ' + e.dow + ' ' + e.command).join('\n') + '\n';
}

function save(owner, entries) {
  const safeOwner = owner.replace(/[^a-zA-Z0-9_.-]/g, '');
  const content = format(entries);
  const tmp = '/tmp/cron_' + safeOwner + '_tmp';
  fs.writeFileSync(tmp, content);
  runCrontab(['-u', safeOwner, tmp]);
  try { fs.unlinkSync(tmp); } catch {}
}

function add(owner, entry) {
  const entries = list(owner);
  entries.push(entry);
  save(owner, entries);
}

function update(owner, index, entry) {
  const entries = list(owner);
  if (index < 0 || index >= entries.length) throw new Error('Entry not found');
  entries[index] = entry;
  save(owner, entries);
}

function remove(owner, index) {
  const entries = list(owner);
  if (index < 0 || index >= entries.length) throw new Error('Entry not found');
  entries.splice(index, 1);
  save(owner, entries);
}

function getOwners() {
  try {
    const raw = execFileSync('cut', ['-d:', '-f1', '/etc/passwd'], { encoding: 'utf8', timeout: 3000 });
    const users = raw.trim().split('\n');
    return users.filter(u => {
      try {
        execFileSync('crontab', ['-l', '-u', u], { timeout: 2000, stdio: ['ignore', 'pipe', 'pipe'] });
        return true;
      } catch { return false; }
    });
  } catch { return []; }
}

module.exports = { list, add, update, remove, getOwners, parse, format };
