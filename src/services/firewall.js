const { runSafeSync, validators } = require('../utils/shell');

function listRules() {
  const result = runSafeSync('iptables', ['-L', '-n', '-v', '--line-numbers']);
  if (result.error) return { chains: {} };
  const chains = {};
  let current = null;
  result.stdout.split('\n').forEach(line => {
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
}

function addRule(chain, rule) {
  if (!validators.chainName.test(chain)) throw new Error('Invalid chain name');
  if (!rule || typeof rule !== 'string') throw new Error('Invalid rule');
  const tokens = rule.trim().split(/\s+/);
  if (tokens.length === 0) throw new Error('Empty rule');
  for (const token of tokens) {
    if (/[;&|`$()]/.test(token)) throw new Error('Invalid character in rule: ' + token);
  }
  const result = runSafeSync('iptables', ['-A', chain, ...tokens]);
  if (result.status !== 0) throw new Error('iptables failed: ' + (result.stderr || result.stdout));
  return { ok: true };
}

function deleteRule(chain, num) {
  if (!validators.chainName.test(chain)) throw new Error('Invalid chain name');
  const numStr = String(num);
  if (!validators.numeric.test(numStr)) throw new Error('Invalid rule number');
  const result = runSafeSync('iptables', ['-D', chain, numStr]);
  if (result.status !== 0) throw new Error('iptables failed: ' + (result.stderr || result.stdout));
  return { ok: true };
}

function saveRules() {
  const fs = require('fs');
  const result = runSafeSync('iptables-save', []);
  if (result.status !== 0) return;
  try {
    fs.writeFileSync('/etc/sysconfig/iptables', result.stdout, 'utf8');
  } catch {
    try {
      fs.writeFileSync('/etc/iptables/rules.v4', result.stdout, 'utf8');
    } catch {}
  }
}

module.exports = { listRules, addRule, deleteRule, saveRules };
