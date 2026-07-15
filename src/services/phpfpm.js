const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function listPools() {
  const pools = [];
  const poolDirs = ['/etc/php-fpm.d', '/etc/php/8.2/fpm/pool.d', '/etc/php/8.1/fpm/pool.d', '/etc/php/8.3/fpm/pool.d'];
  for (const dir of poolDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.conf'));
      for (const f of files) {
        try {
          const content = fs.readFileSync(path.join(dir, f), 'utf8');
          const name = f.replace('.conf', '');
          let pm = 'dynamic', maxChildren = '50', user = '', listen = '';
          content.split('\n').forEach(l => {
            if (l.match(/^pm\s*=/)) pm = l.split('=')[1].trim();
            if (l.match(/^pm\.max_children\s*=/)) maxChildren = l.split('=')[1].trim();
            if (l.match(/^user\s*=/)) user = l.split('=')[1].trim();
            if (l.match(/^\s*listen\s*=/)) listen = l.split('=')[1].trim();
          });
          pools.push({ name, file: f, dir, pm, maxChildren, user, listen });
        } catch {}
      }
    } catch {}
  }
  return pools;
}

function getStatus() {
  try {
    const raw = execSync('systemctl status php*-fpm 2>/dev/null || true', { encoding: 'utf8', timeout: 5000 });
    return raw.substring(0, 1500);
  } catch { return ''; }
}

function restart() {
  execSync('systemctl restart php*-fpm 2>/dev/null || true', { timeout: 10000 });
  return { ok: true };
}

module.exports = { listPools, getStatus, restart };
