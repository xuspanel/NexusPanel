const { execSync } = require('child_process');

function listRules() {
  try {
    const raw = execSync('iptables -L -n -v --line-numbers 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
    const chains = {};
    let current = null;
    raw.split('\n').forEach(line => {
      if (line.startsWith('Chain ')) {
        const m = line.match(/Chain (\w+)/);
        if (m) { current = m[1]; chains[current] = []; }
      } else if (current && line.match(/^\d+/)) {
        const p = line.trim().split(/\s+/);
        if (p.length >= 8) chains[current].push({
          num: p[0], pkts: p[1], bytes: p[2],
          target: p[3], prot: p[4], opt: p[5],
          in: p[6], out: p[7], source: p[8],
          destination: p[9] || '', extra: p.slice(10).join(' ') || '',
        });
      }
    });
    return { chains };
  } catch { return { chains: {} }; }
}

function addRule(chain, rule) {
  const cmd = 'iptables -A ' + chain + ' ' + rule;
  execSync(cmd + ' 2>/dev/null', { timeout: 5000 });
  return { ok: true };
}

function deleteRule(chain, num) {
  execSync('iptables -D ' + chain + ' ' + num + ' 2>/dev/null', { timeout: 5000 });
  return { ok: true };
}

function saveRules() {
  execSync('iptables-save > /etc/sysconfig/iptables 2>/dev/null || iptables-save > /etc/iptables/rules.v4 2>/dev/null', { timeout: 5000 });
}

module.exports = { listRules, addRule, deleteRule, saveRules };
