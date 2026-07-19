const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dbService = require('../services/databases');

const MAX_RESULTS = 40;

function top(items) { return items.slice(0, MAX_RESULTS); }

function searchAccounts(q) {
  try {
    const out = execSync("getent passwd 2>/dev/null", { encoding: 'utf8', timeout: 2000 });
    return out.split('\n').filter(l => l.includes(':') && l.split(':')[2] >= 1000 && l.split(':')[0] !== 'nobody').map(line => {
      const p = line.split(':');
      return { username: p[0], home: p[5], shell: p[6] };
    }).filter(u => u.username.toLowerCase().includes(q)).map(u => ({
      type: 'user',
      module: 'Users',
      title: u.username,
      desc: 'Home: ' + u.home,
      view: 'users'
    }));
  } catch { return []; }
}

function searchServices(q) {
  try {
    const out = execSync("systemctl list-units --type=service --all --no-legend 2>/dev/null | head -100", { encoding: 'utf8', timeout: 3000 });
    return out.split('\n').filter(l => l.includes('.service') && l.toLowerCase().includes(q)).map(line => {
      const w = line.trim().split(/\s+/);
      return { name: w[0].replace('.service', ''), status: w[3] || 'unknown' };
    }).map(s => ({ type: 'service', module: 'Services', title: s.name, desc: s.status, view: 'services' }));
  } catch { return []; }
}

function searchDocker(q) {
  try {
    const out = execSync("docker ps -a --format '{{.Names}}|{{.Status}}|{{.Image}}' 2>/dev/null | head -30", { encoding: 'utf8', timeout: 3000 });
    return out.split('\n').filter(l => l.includes('|') && l.toLowerCase().includes(q)).map(line => {
      const p = line.split('|');
      return { name: p[0], status: p[1] || '', image: p[2] || '' };
    }).map(c => ({ type: 'container', module: 'Docker', title: c.name, desc: c.status, view: 'docker' }));
  } catch { return []; }
}

function searchDomains(q) {
  try {
    const dir = '/etc/nginx/conf.d/';
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith('.conf') && f.toLowerCase().includes(q)).map(f => ({
      type: 'domain',
      module: 'Domains',
      title: f.replace('.conf', ''),
      desc: '/etc/nginx/conf.d/' + f,
      view: 'domains'
    }));
  } catch { return []; }
}

function searchCron(q) {
  try {
    const out = execSync("crontab -l 2>/dev/null || echo ''", { encoding: 'utf8', timeout: 2000 });
    return out.split('\n').filter(l => l.trim() && !l.startsWith('#') && l.toLowerCase().includes(q)).map(line => ({
      type: 'cron',
      module: 'Cron Jobs',
      title: line.trim().substring(0, 50) + (line.length > 50 ? '…' : ''),
      desc: line.trim(),
      view: 'cron'
    }));
  } catch { return []; }
}

function searchFirewall(q) {
  try {
    const out = execSync("iptables -L -n --line-numbers 2>/dev/null | head -80", { encoding: 'utf8', timeout: 2000 });
    return out.split('\n').filter(l => l.includes(':') && l.toLowerCase().includes(q)).map(line => ({
      type: 'firewall',
      module: 'Firewall',
      title: line.trim().substring(0, 60),
      desc: 'iptables rule',
      view: 'firewall'
    }));
  } catch { return []; }
}

async function searchDatabases(q) {
  try {
    const dbs = await dbService.listDatabases();
    return dbs.filter(d => d.name.toLowerCase().includes(q)).map(d => ({
      type: 'database',
      module: 'Databases',
      title: d.name,
      desc: 'PostgreSQL database',
      view: 'databases'
    }));
  } catch { return []; }
}

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q || q.length < 2) return res.json({ query: q, results: [] });

  const terms = q.split(/\s+/).filter(t => t.length > 1);
  if (!terms.length) return res.json({ query: q, results: [] });

  const all = [
    ...searchAccounts(terms[0]),
    ...searchServices(terms[0]),
    ...searchDocker(terms[0]),
    ...searchDomains(terms[0]),
    ...searchCron(terms[0]),
    ...searchFirewall(terms[0]),
    ...(await searchDatabases(terms[0])),
  ];

  const scored = [];
  for (const item of all) {
    let score = 0;
    const t = (item.title + ' ' + (item.desc || '')).toLowerCase();
    for (const term of terms) {
      if (item.title.toLowerCase() === term) score += 100;
      else if (item.title.toLowerCase().startsWith(term)) score += 50;
      else if (t.includes(term)) score += 10 + (20 / (t.indexOf(term) + 1));
    }
    if (score > 0) scored.push({ ...item, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const unique = scored.filter(r => {
    const key = r.module + '::' + r.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  res.json({ query: q, results: top(unique) });
});

module.exports = router;
