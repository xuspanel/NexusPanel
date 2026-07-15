const { execSync } = require('child_process');
const fs = require('fs');

function list(owner) {
  try {
    const raw = execSync('crontab -l -u ' + owner + ' 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
    return parse(raw);
  } catch { return []; }
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
  const content = format(entries);
  const tmp = '/tmp/cron_' + owner + '_tmp';
  fs.writeFileSync(tmp, content);
  execSync('crontab -u ' + owner + ' ' + tmp + ' 2>/dev/null', { timeout: 5000 });
  fs.unlinkSync(tmp);
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
    const raw = execSync("cut -d: -f1 /etc/passwd", { encoding: 'utf8', timeout: 3000 });
    const users = raw.trim().split('\n');
    return users.filter(u => {
      try { execSync('crontab -l -u ' + u + ' 2>/dev/null', { timeout: 2000 }); return true; } catch { return false; }
    });
  } catch { return []; }
}

module.exports = { list, add, update, remove, getOwners, parse, format };
