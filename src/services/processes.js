const { runSafeSync } = require('../utils/shell');

function list() {
  const result = runSafeSync('ps', ['aux', '--sort=-%cpu', '--no-headers']);
  if (result.status !== 0) return [];
  return result.stdout.trim().split('\n').slice(0, 100).map(line => {
    const p = line.split(/\s+/);
    return {
      user: p[0] || '',
      pid: parseInt(p[1]) || 0,
      cpu: parseFloat(p[2]) || 0,
      mem: parseFloat(p[3]) || 0,
      vsz: parseInt(p[4]) || 0,
      rss: parseInt(p[5]) || 0,
      tty: p[6] || '',
      stat: p[7] || '',
      start: p[8] || '',
      time: p[9] || '',
      command: p.slice(10).join(' ') || '',
    };
  });
}

function kill(pid, signal) {
  if (!/^\d+$/.test(String(pid))) throw new Error('Invalid PID');
  const sigNum = signal || 15;
  if (!/^\d{1,3}$/.test(String(sigNum))) throw new Error('Invalid signal');
  runSafeSync('kill', ['-' + String(sigNum), String(pid)]);
}

function tree() {
  const result = runSafeSync('pstree', ['-p']);
  if (result.status !== 0) {
    const fallback = runSafeSync('ps', ['--forest', '--no-headers']);
    return (fallback.stdout).substring(0, 5000);
  }
  return result.stdout.substring(0, 5000);
}

module.exports = { list, kill, tree };
