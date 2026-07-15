const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function list() {
  try {
    const entries = fs.readdirSync('/var/log', { withFileTypes: true });
    return entries.filter(e => e.isFile()).map(e => ({
      name: e.name,
      path: path.join('/var/log', e.name),
      size: fs.statSync(path.join('/var/log', e.name)).size,
    })).sort((a, b) => b.size - a.size);
  } catch { return []; }
}

function read(logFile, tail) {
  const safe = path.resolve('/var/log', logFile);
  if (!safe.startsWith('/var/log')) throw new Error('Invalid path');
  try {
    const data = fs.readFileSync(safe, 'utf8');
    const lines = data.split('\n');
    const n = tail || 500;
    return lines.slice(-n).join('\n');
  } catch (e) { throw new Error('Cannot read log file'); }
}

function search(logFile, query) {
  const safe = path.resolve('/var/log', logFile);
  if (!safe.startsWith('/var/log')) throw new Error('Invalid path');
  try {
    const data = fs.readFileSync(safe, 'utf8');
    const lines = data.split('\n').filter(l => l.toLowerCase().includes(query.toLowerCase()));
    return lines.slice(-200).join('\n');
  } catch (e) { throw new Error('Cannot search log file'); }
}

module.exports = { list, read, search };
