const { execSync } = require('child_process');
const alerts = require('./alerts');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'metrics');

function ensureDir() { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {} }

function collect() {
  try {
    const cpu = execSync("top -bn1 | head -5 | tail -1 | awk '{print $2+$4}'", { encoding: 'utf8', timeout: 5000 }).trim();
    const mem = execSync("free | grep Mem | awk '{printf \"%d %d %d\", $2,$3,$4}'", { encoding: 'utf8', timeout: 5000 }).trim().split(' ');
    const disk = execSync("df / | tail -1 | awk '{printf \"%d %d %d\", $2,$3,$4}'", { encoding: 'utf8', timeout: 5000 }).trim().split(' ');
    const net = execSync("cat /proc/net/dev | tail -n +3 | awk '{rx+=$2; tx+=$10} END {print rx, tx}'", { encoding: 'utf8', timeout: 5000 }).trim().split(' ');

    return {
      timestamp: Date.now(),
      cpu: parseFloat(cpu) || 0,
      memTotal: parseInt(mem[0]) || 0,
      memUsed: parseInt(mem[1]) || 0,
      memFree: parseInt(mem[2]) || 0,
      diskTotal: parseInt(disk[0]) || 0,
      diskUsed: parseInt(disk[1]) || 0,
      diskFree: parseInt(disk[2]) || 0,
      netRx: parseInt(net[0]) || 0,
      netTx: parseInt(net[1]) || 0,
    };
  } catch { return null; }
}

function getCurrent() {
  return collect();
}

function getHistory(period) {
  ensureDir();
  const hours = period === '24h' ? 24 : period === '7d' ? 168 : 1;
  const cutoff = Date.now() - hours * 3600000;
  const entries = [];

  const file = path.join(DATA_DIR, 'history.jsonl');
  try {
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    for (const line of lines) {
      try {
        const e = JSON.parse(line);
        if (e.timestamp >= cutoff && e.timestamp % 300000 < 10000) entries.push(e);
      } catch {}
    }
  } catch { return []; }
  return entries;
}

function record() {
  ensureDir();
  const entry = collect();
  if (!entry) return;
  const file = path.join(DATA_DIR, 'history.jsonl');
  fs.appendFileSync(file, JSON.stringify(entry) + '\n');
  cleanup(file);
}

function cleanup(file) {
  try {
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    if (lines.length > 2000) {
      fs.writeFileSync(file, lines.slice(-2000).join('\n') + '\n');
    }
  } catch {}
}

setInterval(() => { record(); try { var m = collect(); if(m) alerts.checkMetrics(m); } catch {} }, 300000);
record();

module.exports = { collect, getCurrent, getHistory };
