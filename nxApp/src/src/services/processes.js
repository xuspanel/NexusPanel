const { execSync } = require('child_process');

function list() {
  try {
    const raw = execSync("ps aux --sort=-%cpu --no-headers 2>/dev/null", { encoding: 'utf8', timeout: 5000 });
    return raw.trim().split('\n').slice(0, 100).map(line => {
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
  } catch { return []; }
}

function kill(pid, signal) {
  execSync('kill ' + (signal || '-15') + ' ' + pid + ' 2>/dev/null', { timeout: 5000 });
}

function tree() {
  try {
    return execSync('pstree -p 2>/dev/null || ps --forest --no-headers 2>/dev/null', { encoding: 'utf8', timeout: 5000 }).substring(0, 5000);
  } catch { return ''; }
}

module.exports = { list, kill, tree };
