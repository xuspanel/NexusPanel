const { runSafeSync, validators } = require('../utils/shell');
const fs = require('fs');

const CHAIN_RE = /^(INPUT|OUTPUT|FORWARD|PREROUTING|POSTROUTING|[a-zA-Z][a-zA-Z0-9_-]*)$/;
const ZONE_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const PORT_RE = /^\d{1,5}(\/(tcp|udp))?$/;
const SERVICE_RE = /^[a-zA-Z][a-zA-Z0-9._-]*$/;
const RICH_RULE_RE = /^[\w\s.\-\/:!"'$%&()+,;=<>\[\]{}|\\@#~`?]+$/;

let cachedBackend = null;

function detectBackend() {
  if (cachedBackend) return cachedBackend;
  const ufw = runSafeSync('ufw', ['status'], { timeout: 3000 });
  if (ufw.status === 0 && ufw.stdout.includes('Status: active')) {
    cachedBackend = 'ufw';
    return 'ufw';
  }
  const fw = runSafeSync('firewall-cmd', ['--state'], { timeout: 3000 });
  if (fw.status === 0 && fw.stdout.trim() === 'running') {
    cachedBackend = 'firewalld';
    return 'firewalld';
  }
  const nft = runSafeSync('nft', ['list', 'tables'], { timeout: 3000 });
  if (nft.status === 0 && nft.stdout.trim()) {
    cachedBackend = 'nftables';
    return 'nftables';
  }
  const ipt = runSafeSync('iptables', ['-L', '-n'], { timeout: 3000 });
  if (ipt.status === 0) {
    cachedBackend = 'iptables';
    return 'iptables';
  }
  cachedBackend = 'none';
  return 'none';
}

function invalidateBackendCache() { cachedBackend = null; }

function fmtBytes(n) {
  const num = parseInt(n) || 0;
  if (num < 1024) return num + ' B';
  if (num < 1048576) return (num / 1024).toFixed(1) + ' KB';
  if (num < 1073741824) return (num / 1048576).toFixed(1) + ' MB';
  return (num / 1073741824).toFixed(1) + ' GB';
}

function fwCmd(args) {
  const result = runSafeSync('firewall-cmd', args, { timeout: 10000 });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'firewall-cmd failed').trim());
  return result.stdout.trim();
}

function fwCmdQuiet(args) {
  const result = runSafeSync('firewall-cmd', args, { timeout: 10000 });
  return result.status === 0 ? result.stdout.trim() : null;
}

function parseIptablesOutput(stdout) {
  const chains = {};
  const policies = {};
  let current = null;
  (stdout || '').split('\n').forEach(line => {
    const chainMatch = line.match(/^Chain (\w+) \(policy (\w+)/);
    if (chainMatch) {
      current = chainMatch[1];
      chains[current] = [];
      policies[current] = chainMatch[2];
      return;
    }
    const chainNoPolicy = line.match(/^Chain (\w+)/);
    if (chainNoPolicy && !line.match(/^Chain \w+ \(policy/)) {
      current = chainNoPolicy[1];
      chains[current] = [];
      policies[current] = '—';
      return;
    }
    if (current && line.match(/^\d+/)) {
      const p = line.trim().split(/\s+/);
      if (p.length >= 8) chains[current].push({
        num: parseInt(p[0]),
        pkts: p[1],
        bytes: p[2],
        bytesFmt: fmtBytes(p[2]),
        pktsFmt: fmtBytes(p[1]),
        target: p[3],
        prot: p[4],
        opt: p[5],
        inIf: p[6],
        outIf: p[7],
        source: p[8] || '',
        destination: p[9] || '',
        extra: p.slice(10).join(' ') || '',
      });
    }
  });
  return { chains, policies };
}

function isDockerChain(name) {
  return name && (name.startsWith('DOCKER') || name === 'FIREWALLD_DIRECT_CHAIN');
}

function getFirewalldZones() {
  const defaultZone = fwCmd(['--get-default-zone']);
  const activeZones = {};
  const activeRaw = fwCmdQuiet(['--get-active-zones']);
  if (activeRaw) {
    let currentZone = null;
    activeRaw.split('\n').forEach(line => {
      if (line && !line.startsWith(' ')) {
        currentZone = line.trim();
        activeZones[currentZone] = [];
      } else if (currentZone && line.trim()) {
        const trimmed = line.trim().replace(/^interfaces:\s*/, '');
        if (trimmed) activeZones[currentZone].push(...trimmed.split(/\s+/).filter(Boolean));
      }
    });
  }
  const allZonesRaw = fwCmd(['--get-zones']);
  const allZones = allZonesRaw ? allZonesRaw.split(/\s+/).filter(Boolean) : [];
  return allZones.map(name => {
    const services = (fwCmdQuiet(['--zone=' + name, '--list-services']) || '').split(/\s+/).filter(Boolean);
    const ports = (fwCmdQuiet(['--zone=' + name, '--list-ports']) || '').split(/\s+/).filter(Boolean);
    const richRulesRaw = fwCmdQuiet(['--zone=' + name, '--list-rich-rules']) || '';
    const richRules = richRulesRaw ? richRulesRaw.split('\n').filter(l => l.trim()) : [];
    const protocols = (fwCmdQuiet(['--zone=' + name, '--list-protocols']) || '').split(/\s+/).filter(Boolean);
    const masquerade = (fwCmdQuiet(['--zone=' + name, '--query-masquerade']) || '') === 'yes';
    const target = fwCmdQuiet(['--zone=' + name, '--get-target']) || 'default';
    return {
      name,
      isDefault: name === defaultZone,
      isActive: !!activeZones[name],
      interfaces: activeZones[name] || [],
      services,
      ports,
      protocols,
      richRules,
      masquerade,
      target,
    };
  });
}

function getFirewalldInfo() {
  const defaultZone = fwCmd(['--get-default-zone']);
  const version = fwCmdQuiet(['--version']) || '';
  const zones = getFirewalldZones();
  return { backend: 'firewalld', version, defaultZone, zones };
}

function addFirewalldService(zone, service) {
  if (!ZONE_RE.test(zone)) throw new Error('Invalid zone name');
  if (!SERVICE_RE.test(service)) throw new Error('Invalid service name');
  fwCmd(['--zone=' + zone, '--add-service=' + service, '--permanent']);
  fwCmd(['--reload']);
  invalidateBackendCache();
}

function removeFirewalldService(zone, service) {
  if (!ZONE_RE.test(zone)) throw new Error('Invalid zone name');
  if (!SERVICE_RE.test(service)) throw new Error('Invalid service name');
  fwCmd(['--zone=' + zone, '--remove-service=' + service, '--permanent']);
  fwCmd(['--reload']);
  invalidateBackendCache();
}

function addFirewalldPort(zone, port) {
  if (!ZONE_RE.test(zone)) throw new Error('Invalid zone name');
  if (!PORT_RE.test(port)) throw new Error('Invalid port (use format: 8080/tcp or 51820/udp)');
  fwCmd(['--zone=' + zone, '--add-port=' + port, '--permanent']);
  fwCmd(['--reload']);
  invalidateBackendCache();
}

function removeFirewalldPort(zone, port) {
  if (!ZONE_RE.test(zone)) throw new Error('Invalid zone name');
  if (!PORT_RE.test(port)) throw new Error('Invalid port');
  fwCmd(['--zone=' + zone, '--remove-port=' + port, '--permanent']);
  fwCmd(['--reload']);
  invalidateBackendCache();
}

function addFirewalldRichRule(zone, rule) {
  if (!ZONE_RE.test(zone)) throw new Error('Invalid zone name');
  if (!rule || !RICH_RULE_RE.test(rule)) throw new Error('Invalid rich rule');
  fwCmd(['--zone=' + zone, '--add-rich-rule=' + JSON.stringify(rule), '--permanent']);
  fwCmd(['--reload']);
  invalidateBackendCache();
}

function removeFirewalldRichRule(zone, rule) {
  if (!ZONE_RE.test(zone)) throw new Error('Invalid zone name');
  if (!rule || !RICH_RULE_RE.test(rule)) throw new Error('Invalid rich rule');
  fwCmd(['--zone=' + zone, '--remove-rich-rule=' + JSON.stringify(rule), '--permanent']);
  fwCmd(['--reload']);
  invalidateBackendCache();
}

function setFirewalldDefaultZone(zone) {
  if (!ZONE_RE.test(zone)) throw new Error('Invalid zone name');
  fwCmd(['--set-default-zone=' + zone]);
  invalidateBackendCache();
}

function toggleFirewalldMasquerade(zone, enable) {
  if (!ZONE_RE.test(zone)) throw new Error('Invalid zone name');
  fwCmd(['--zone=' + zone, enable ? '--add-masquerade' : '--remove-masquerade', '--permanent']);
  fwCmd(['--reload']);
  invalidateBackendCache();
}

function addFirewalldIcmpBlock(zone, icmp) {
  if (!ZONE_RE.test(zone)) throw new Error('Invalid zone name');
  if (!icmp || !SERVICE_RE.test(icmp)) throw new Error('Invalid ICMP type');
  fwCmd(['--zone=' + zone, '--add-icmp-block=' + icmp, '--permanent']);
  fwCmd(['--reload']);
}

function removeFirewalldIcmpBlock(zone, icmp) {
  if (!ZONE_RE.test(zone)) throw new Error('Invalid zone name');
  if (!icmp || !SERVICE_RE.test(icmp)) throw new Error('Invalid ICMP type');
  fwCmd(['--zone=' + zone, '--remove-icmp-block=' + icmp, '--permanent']);
  fwCmd(['--reload']);
}

function getFirewalldServices() {
  const result = fwCmd(['--get-services']);
  return result ? result.split(/\s+/).filter(Boolean) : [];
}

function listIptablesRules() {
  const result = runSafeSync('iptables', ['-L', '-n', '-v', '--line-numbers'], { timeout: 10000 });
  if (result.error || result.status !== 0) return { chains: {}, policies: {}, backend: 'iptables' };
  const parsed = parseIptablesOutput(result.stdout);
  const allChains = [];
  for (const name in parsed.chains) {
    allChains.push({
      name,
      policy: parsed.policies[name] || '—',
      ruleCount: parsed.chains[name].length,
      rules: parsed.chains[name],
      isDocker: isDockerChain(name),
    });
  }
  const builtin = allChains.filter(c => ['INPUT', 'OUTPUT', 'FORWARD'].includes(c.name));
  const custom = allChains.filter(c => !['INPUT', 'OUTPUT', 'FORWARD'].includes(c.name));
  return { backend: 'iptables', chains: { builtin, custom }, policies: parsed.policies };
}

function addIptablesRule(chain, rule) {
  if (!CHAIN_RE.test(chain)) throw new Error('Invalid chain name');
  if (!rule || typeof rule !== 'string') throw new Error('Invalid rule');
  const tokens = rule.trim().split(/\s+/);
  if (tokens.length === 0) throw new Error('Empty rule');
  for (const token of tokens) {
    if (/[;&|`$()]/.test(token)) throw new Error('Invalid character in rule: ' + token);
  }
  const result = runSafeSync('iptables', ['-A', chain, ...tokens]);
  if (result.status !== 0) throw new Error('iptables failed: ' + (result.stderr || result.stdout));
  invalidateBackendCache();
  return { ok: true };
}

function deleteIptablesRule(chain, num) {
  if (!CHAIN_RE.test(chain)) throw new Error('Invalid chain name');
  const numStr = String(num);
  if (!validators.numeric.test(numStr)) throw new Error('Invalid rule number');
  const result = runSafeSync('iptables', ['-D', chain, numStr]);
  if (result.status !== 0) throw new Error('iptables failed: ' + (result.stderr || result.stdout));
  invalidateBackendCache();
  return { ok: true };
}

function setIptablesPolicy(chain, target) {
  if (!CHAIN_RE.test(chain)) throw new Error('Invalid chain name');
  const validTargets = ['ACCEPT', 'DROP', 'REJECT'];
  if (!validTargets.includes(target)) throw new Error('Invalid policy target');
  const result = runSafeSync('iptables', ['-P', chain, target]);
  if (result.status !== 0) throw new Error('iptables failed: ' + (result.stderr || result.stdout));
  invalidateBackendCache();
  return { ok: true };
}

function flushIptablesChain(chain) {
  if (!CHAIN_RE.test(chain)) throw new Error('Invalid chain name');
  const result = runSafeSync('iptables', ['-F', chain]);
  if (result.status !== 0) throw new Error('iptables failed: ' + (result.stderr || result.stdout));
  invalidateBackendCache();
  return { ok: true };
}

function saveIptablesRules() {
  const result = runSafeSync('iptables-save', [], { timeout: 10000 });
  if (result.status !== 0) return { ok: false, error: 'iptables-save failed' };
  const paths = ['/etc/sysconfig/iptables', '/etc/iptables/rules.v4'];
  for (const p of paths) {
    try { fs.writeFileSync(p, result.stdout, 'utf8'); return { ok: true, path: p }; } catch {}
  }
  return { ok: false, error: 'Could not write to any iptables save path' };
}

function getUfwInfo() {
  const statusRaw = runSafeSync('ufw', ['status', 'verbose'], { timeout: 5000 });
  if (statusRaw.status !== 0) return { backend: 'ufw', active: false, rules: [], policies: {} };
  const lines = statusRaw.stdout.split('\n');
  const active = lines.some(l => l.includes('Status: active'));
  const defaultIn = (lines.find(l => l.includes('Default:')) || '').match(/inbound:\s*(\w+)/);
  const defaultOut = (lines.find(l => l.includes('Default:')) || '').match(/outbound:\s*(\w+)/);
  const rules = [];
  lines.forEach(line => {
    const m = line.match(/^\s*\[\s*\d+\]\s+(\S+)\s+(\S+)\s+(.+?)\s+(ALLOW|DENY|REJECT|LIMIT)\s+(IN|OUT)\s+(.+)/);
    if (m) {
      rules.push({
        num: parseInt(m[1]),
        proto: m[2],
        port: m[3],
        action: m[4],
        direction: m[5],
        from: m[6] || '',
      });
    }
  });
  return {
    backend: 'ufw',
    active,
    policies: { INPUT: defaultIn ? defaultIn[1].toUpperCase() : '—', OUTPUT: defaultOut ? defaultOut[1].toUpperCase() : '—' },
    rules,
  };
}

function getOverallInfo() {
  const backend = detectBackend();
  if (backend === 'firewalld') return getFirewalldInfo();
  if (backend === 'iptables') return listIptablesRules();
  if (backend === 'ufw') return getUfwInfo();
  return { backend: 'none' };
}

module.exports = {
  detectBackend,
  invalidateBackendCache,
  getOverallInfo,
  fmtBytes,
  getFirewalldZones,
  getFirewalldInfo,
  addFirewalldService,
  removeFirewalldService,
  addFirewalldPort,
  removeFirewalldPort,
  addFirewalldRichRule,
  removeFirewalldRichRule,
  setFirewalldDefaultZone,
  toggleFirewalldMasquerade,
  addFirewalldIcmpBlock,
  removeFirewalldIcmpBlock,
  getFirewalldServices,
  listIptablesRules,
  addIptablesRule,
  deleteIptablesRule,
  setIptablesPolicy,
  flushIptablesChain,
  saveIptablesRules,
  getUfwInfo,
};
