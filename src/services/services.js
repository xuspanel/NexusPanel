const { execSync } = require('child_process');

function list() {
  try {
    const raw = execSync('systemctl list-units --type=service --all --no-legend --no-pager 2>/dev/null', { encoding: 'utf8', timeout: 10000 });
    return raw.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.split(/\s+/);
      return {
        name: parts[0] || '',
        load: parts[1] || '',
        active: parts[2] || '',
        sub: parts[3] || '',
        description: parts.slice(4).join(' ') || '',
      };
    });
  } catch { return []; }
}

function action(name, act) {
  execSync('systemctl ' + act + ' ' + name + ' 2>/dev/null', { timeout: 15000 });
}

function status(name) {
  try {
    const raw = execSync('systemctl status ' + name + ' --no-pager 2>/dev/null', { encoding: 'utf8', timeout: 10000 });
    return raw.substring(0, 2000);
  } catch (e) {
    return e.stdout || e.message;
  }
}

module.exports = { list, action, status };
