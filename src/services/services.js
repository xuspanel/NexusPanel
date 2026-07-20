const { runSafeSync } = require('../utils/shell');

function list() {
  const result = runSafeSync('systemctl', ['list-units', '--type=service', '--all', '--no-legend', '--no-pager']);
  if (result.status !== 0) return [];
  return result.stdout.trim().split('\n').filter(Boolean).map(line => {
    const parts = line.split(/\s+/);
    return {
      name: parts[0] || '',
      load: parts[1] || '',
      active: parts[2] || '',
      sub: parts[3] || '',
      description: parts.slice(4).join(' ') || '',
    };
  });
}

function action(name, act) {
  const validActions = ['start', 'stop', 'restart', 'reload', 'enable', 'disable'];
  if (!validActions.includes(act)) throw new Error('Invalid action: ' + act);
  const safeName = name.replace(/[^a-zA-Z0-9@_:.\-]/g, '');
  runSafeSync('systemctl', [act, safeName]);
}

function status(name) {
  const safeName = name.replace(/[^a-zA-Z0-9@_:.\-]/g, '');
  const result = runSafeSync('systemctl', ['status', safeName, '--no-pager']);
  return (result.stdout + result.stderr).substring(0, 2000);
}

module.exports = { list, action, status };
