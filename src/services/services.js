const { runSafeSync } = require('../utils/shell');

const VALID_ACTIONS = ['start', 'stop', 'restart', 'reload', 'enable', 'disable'];
const NAME_REGEX = /^[a-zA-Z0-9@_:.\-]+$/;

function list() {
  const result = runSafeSync('systemctl', ['list-units', '--type=service', '--all', '--no-legend', '--no-pager']);
  if (result.status !== 0) return [];
  return result.stdout.trim().split('\n').filter(Boolean).map(line => {
    const parts = line.split(/\s+/);
    const name = (parts[0] || '').replace(/\.service$/, '');
    return {
      name: name,
      fullName: parts[0] || '',
      load: parts[1] || '',
      active: parts[2] || '',
      sub: parts[3] || '',
      description: parts.slice(4).join(' ') || '',
    };
  });
}

function action(name, act) {
  if (!VALID_ACTIONS.includes(act)) throw new Error('Invalid action');
  if (!name || !NAME_REGEX.test(name)) throw new Error('Invalid service name');
  const serviceName = name.endsWith('.service') ? name : name + '.service';
  const result = runSafeSync('systemctl', [act, serviceName]);
  if (result.error) throw new Error('Failed to ' + act + ' service');
  if (result.status !== 0) {
    const msg = (result.stderr || result.stdout || '').trim().substring(0, 200);
    throw new Error(msg || 'Service ' + act + ' failed');
  }
  return { ok: true, action: act, service: name };
}

function status(name) {
  if (!name || !NAME_REGEX.test(name)) throw new Error('Invalid service name');
  const serviceName = name.endsWith('.service') ? name : name + '.service';
  const result = runSafeSync('systemctl', ['status', serviceName, '--no-pager']);
  return {
    output: (result.stdout + result.stderr).substring(0, 3000),
    active: result.status === 0 ? 'active' : 'inactive',
  };
}

function bulkAction(names, act) {
  if (!VALID_ACTIONS.includes(act)) throw new Error('Invalid action');
  if (!Array.isArray(names) || names.length === 0) throw new Error('No services specified');
  if (names.length > 20) throw new Error('Too many services (max 20)');
  const results = [];
  for (const name of names.slice(0, 20)) {
    try {
      action(name, act);
      results.push({ name: name, ok: true });
    } catch (e) {
      results.push({ name: name, ok: false, error: e.message });
    }
  }
  return results;
}

module.exports = { list, action, status, bulkAction, VALID_ACTIONS };
