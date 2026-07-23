const fs = require('fs');
const path = require('path');
const { runSafeSync, validators } = require('../utils/shell');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DOMAINS_FILE = path.join(DATA_DIR, 'domains.json');
const NGINX_CONF_DIR = '/etc/nginx/conf.d';
const WWW_DIR = '/var/www';
const NGINX_LOG_DIR = '/var/log/nginx';
const PORT_RANGE_START = 8000;
const PORT_RANGE_END = 9000;
const LOCK_TIMEOUT = 5000;

let writeLock = false;

function acquireLock() {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const wait = () => {
      if (!writeLock) { writeLock = true; return resolve(); }
      if (Date.now() - start > LOCK_TIMEOUT) return reject(new Error('Write lock timeout'));
      setTimeout(wait, 10);
    };
    wait();
  });
}

function releaseLock() { writeLock = false; }

function loadDomains() {
  try {
    if (fs.existsSync(DOMAINS_FILE)) {
      return JSON.parse(fs.readFileSync(DOMAINS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[Domains] Failed to load domains.json:', err.message);
  }
  return {};
}

function saveDomains(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpFile = DOMAINS_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, DOMAINS_FILE);
}

function backupNginxConf(domain) {
  const confPath = path.join(NGINX_CONF_DIR, domain + '.conf');
  if (fs.existsSync(confPath)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = path.join(NGINX_CONF_DIR, domain + '.conf.bak.' + ts);
    try { fs.copyFileSync(confPath, backupPath); } catch (_) {}
  }
}

function nginxTestAndReload() {
  const test = runSafeSync('nginx', ['-t']);
  const testOutput = (test.stdout + test.stderr);
  if (test.status !== 0 || testOutput.includes('test failed') || testOutput.includes('[emerg]')) {
    throw new Error('nginx config test failed:\n' + (testOutput || test.error));
  }
  const reload = runSafeSync('nginx', ['-s', 'reload']);
  const reloadOutput = (reload.stdout + reload.stderr);
  if (reload.status !== 0 || reloadOutput.includes('failed') || reloadOutput.includes('error')) {
    throw new Error('nginx reload failed:\n' + (reloadOutput || reload.error));
  }
  return true;
}

function validateNginxContent(content) {
  if (!content || content.trim().length === 0) throw new Error('Config content cannot be empty');
  const dangerous = [
    /\bproxy_pass\b/,
    /\balias\b/,
    /\binclude\b/,
    /\bset\b/,
    /\beval\b/,
    /\baccess_by_lua\b/,
    /\bcontent_by_lua\b/,
  ];
  for (const re of dangerous) {
    if (re.test(content)) {
      throw new Error('Config contains potentially dangerous directive: ' + re.source.replace(/\\b/g, ''));
    }
  }
  return true;
}

function parseNginxServerBlocks(confContent) {
  const blocks = [];
  let i = 0;

  while (i < confContent.length) {
    const serverMatch = confContent.substring(i).match(/server\s*\{/);
    if (!serverMatch) break;
    const braceStart = i + serverMatch.index + serverMatch[0].length - 1;
    let depth = 1;
    let j = braceStart + 1;
    while (j < confContent.length && depth > 0) {
      if (confContent[j] === '{') depth++;
      else if (confContent[j] === '}') depth--;
      j++;
    }

    const body = confContent.substring(braceStart + 1, j - 1);

    const serverNameM = body.match(/server_name\s+([^;]+);/);
    const listenM = body.match(/listen\s+(\d+)/);
    const rootM = body.match(/root\s+([^;]+);/);
    const sslM = body.match(/ssl_certificate\s+([^;]+);/);
    const sslEnabled = body.includes('ssl') && listenM && body.includes('listen ' + listenM[1] + ' ssl');

    if (serverNameM) {
      const names = serverNameM[1].trim().split(/\s+/);
      for (const name of names) {
        if (name === 'localhost' || name === '_') continue;
        blocks.push({
          server_name: name,
          port: listenM ? parseInt(listenM[1]) || 80 : 80,
          root: rootM ? rootM[1].trim() : '',
          sslEnabled: sslEnabled,
          sslCert: sslM ? sslM[1].trim() : '',
        });
      }
    }

    i = j;
  }

  return blocks;
}

function findAvailablePort() {
  const store = loadDomains();
  const usedPorts = new Set([80, 443]);
  for (const name in store) {
    if (store[name].port) usedPorts.add(store[name].port);
  }
  for (let p = PORT_RANGE_START; p <= PORT_RANGE_END; p++) {
    if (!usedPorts.has(p)) return p;
  }
  throw new Error('No available ports in range ' + PORT_RANGE_START + '-' + PORT_RANGE_END);
}

function syncFromNginx() {
  const store = loadDomains();
  const seen = {};
  const changed = {};

  try {
    if (!fs.existsSync(NGINX_CONF_DIR)) return store;
    const files = fs.readdirSync(NGINX_CONF_DIR).filter(f => f.endsWith('.conf') && !f.includes('.bak'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(NGINX_CONF_DIR, file), 'utf8');
      const blocks = parseNginxServerBlocks(content);

      for (const block of blocks) {
        const name = block.server_name;

        if (seen[name]) {
          const existing = seen[name];
          if (block.sslEnabled) {
            existing.port = block.port;
            existing.sslEnabled = true;
          }
          if (block.sslCert && !existing.sslCert) existing.sslCert = block.sslCert;
          if (block.root && !existing.root) existing.root = block.root;
          continue;
        }

        seen[name] = block;
        seen[name].nginxFile = file;
      }
    }

    for (const name in seen) {
      const block = seen[name];

      if (!store[name]) {
        const isSubdomain = name.split('.').length > 2;
        store[name] = {
          type: isSubdomain ? 'subdomain' : 'domain',
          domain: name,
          parentDomain: isSubdomain ? name.split('.').slice(1).join('.') : null,
          port: block.port || 80,
          root: block.root || '/var/www/' + name,
          sslEnabled: !!block.sslEnabled,
          sslCert: block.sslCert || '',
          autoPort: false,
          nginxFile: block.nginxFile,
          syncedFromNginx: true,
          createdAt: new Date().toISOString(),
        };
        changed[name] = 'imported';
      } else {
        if (!store[name].syncedFromNginx) {
          store[name].port = block.port || store[name].port;
          store[name].root = block.root || store[name].root;
          store[name].sslEnabled = !!block.sslEnabled;
          store[name].sslCert = block.sslCert || store[name].sslCert;
          store[name].nginxFile = block.nginxFile;
          changed[name] = 'updated';
        }
      }
    }
  } catch (err) {
    console.error('[Domains] nginx sync error:', err.message);
  }

  if (Object.keys(changed).length > 0) saveDomains(store);
  return store;
}

function validateDomain(name, type) {
  if (!name || name.length < 3) throw new Error('Invalid domain name');
  if (!validators.domain.test(name)) {
    throw new Error('Invalid domain format. Use example.com');
  }
  if (type === 'subdomain') {
    const parts = name.split('.');
    if (parts.length < 3) throw new Error('Subdomain must have at least 3 parts (e.g. sub.example.com)');
  }
}

function generateNginxConf(domain, port, sslEnabled, type, options) {
  const root = '/var/www/' + domain;
  const log = '/var/log/nginx/' + domain;
  let conf = 'server {\n';
  conf += '    server_name ' + domain + ';\n';
  conf += '\n';
  if (sslEnabled) {
    conf += '    listen ' + port + ' ssl;\n';
    conf += '    listen [::]:' + port + ' ssl;\n';
    conf += '    http2 on;\n';
    conf += '\n';
    conf += '    ssl_certificate /etc/letsencrypt/live/' + domain + '/fullchain.pem;\n';
    conf += '    ssl_certificate_key /etc/letsencrypt/live/' + domain + '/privkey.pem;\n';
    conf += '    include /etc/letsencrypt/options-ssl-nginx.conf;\n';
    conf += '    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;\n';
  } else {
    conf += '    listen ' + port + ';\n';
    conf += '    listen [::]:' + port + ';\n';
  }
  conf += '\n';
  conf += '    root ' + root + ';\n';
  conf += '    index index.html index.htm;\n';
  conf += '\n';
  conf += '    location / {\n';
  conf += '        try_files $uri $uri/ =404;\n';
  conf += '    }\n';
  conf += '\n';
  conf += '    access_log ' + log + '_access.log;\n';
  conf += '    error_log ' + log + '_error.log;\n';
  conf += '}\n';

  if (sslEnabled) {
    conf += '\n';
    conf += 'server {\n';
    conf += '    listen 80;\n';
    conf += '    listen [::]:80;\n';
    conf += '    server_name ' + domain + ';\n';
    conf += '    return 301 https://$server_name$request_uri;\n';
    conf += '}\n';
  }

  return conf;
}

function writeNginxConf(domain, confContent) {
  if (!validators.domain.test(domain)) throw new Error('Invalid domain: ' + domain);
  const confPath = path.join(NGINX_CONF_DIR, domain + '.conf');
  backupNginxConf(domain);
  const tmpFile = confPath + '.tmp';
  fs.writeFileSync(tmpFile, confContent, 'utf8');
  fs.renameSync(tmpFile, confPath);
  return confPath;
}

function removeNginxConf(domain) {
  if (!validators.domain.test(domain)) throw new Error('Invalid domain: ' + domain);
  const confPath = path.join(NGINX_CONF_DIR, domain + '.conf');
  try {
    if (fs.existsSync(confPath)) fs.unlinkSync(confPath);
  } catch (_) {}
}

function createDomainWWW(domain) {
  const dir = path.join(WWW_DIR, domain);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), '<!DOCTYPE html><html><head><title>' + domain + '</title><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0e1a;color:#f1f5f9}div{text-align:center}h1{font-size:2.5rem;margin-bottom:0.5rem}p{color:#94a3b8}</style></head><body><div><h1>' + domain + '</h1><p>Welcome! This site is hosted on NexusPanel.</p></div></body></html>', 'utf8');
  }
  return dir;
}

function removeDomainWWW(domain) {
  if (!validators.domain.test(domain)) throw new Error('Invalid domain: ' + domain);
  const dir = path.join(WWW_DIR, domain);
  try {
    const resolved = path.resolve(dir);
    if (resolved.startsWith(path.resolve(WWW_DIR) + path.sep) || resolved === path.resolve(WWW_DIR)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (_) {}
}

function getSSLCertInfo(domain) {
  try {
    const certPath = '/etc/letsencrypt/live/' + domain + '/fullchain.pem';
    if (!fs.existsSync(certPath)) return null;
    const result = runSafeSync('openssl', ['x509', '-enddate', '-noout', '-in', certPath]);
    const match = result.stdout.match(/notAfter=(.+)/);
    if (!match) return null;
    const expiryDate = new Date(match[1].trim());
    const now = new Date();
    const daysLeft = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));
    return {
      expiryDate: expiryDate.toISOString(),
      daysLeft: daysLeft,
      isExpired: daysLeft < 0,
      isExpiringSoon: daysLeft >= 0 && daysLeft < 30,
    };
  } catch (_) {
    return null;
  }
}

function installCertbotSSL(domain) {
  if (!validators.domain.test(domain)) throw new Error('Invalid domain: ' + domain);
  const adminEmail = process.env.CERTBOT_EMAIL || 'admin@meedo51.com';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new Error('Invalid email');
  const result = runSafeSync('certbot', ['--nginx', '-d', domain, '--non-interactive', '--agree-tos', '-m', adminEmail], { timeout: 120000 });
  const output = (result.stdout || '') + (result.stderr || '');
  const certPath = '/etc/letsencrypt/live/' + domain + '/fullchain.pem';
  const success = fs.existsSync(certPath);
  return { success, output };
}

function deleteCertbotSSL(domain) {
  if (!validators.domain.test(domain)) throw new Error('Invalid domain: ' + domain);
  const result = runSafeSync('certbot', ['delete', '--cert-name', domain, '--non-interactive'], { timeout: 30000 });
  return { output: (result.stdout || '') + (result.stderr || '') };
}

function sanitizeDomain(d, name) {
  return {
    domain: name,
    type: d.type || 'domain',
    port: d.port || 80,
    root: d.root || '/var/www/' + name,
    sslEnabled: !!d.sslEnabled,
    parentDomain: d.parentDomain || null,
    syncedFromNginx: !!d.syncedFromNginx,
    autoPort: !!d.autoPort,
    createdAt: d.createdAt || '',
    nginxFile: d.nginxFile || name + '.conf',
    sslInfo: d.sslEnabled ? getSSLCertInfo(name) : null,
  };
}

function listDomains(opts) {
  syncFromNginx();
  const store = loadDomains();
  let list = Object.keys(store).sort().map(name => sanitizeDomain(store[name], name));

  if (opts && opts.search) {
    const s = opts.search.toLowerCase();
    list = list.filter(d =>
      d.domain.toLowerCase().includes(s) ||
      d.type.toLowerCase().includes(s) ||
      (d.parentDomain && d.parentDomain.toLowerCase().includes(s))
    );
  }

  const sortBy = (opts && opts.sort) || 'domain';
  const sortDir = (opts && opts.dir) === 'desc' ? -1 : 1;
  list.sort((a, b) => {
    const va = a[sortBy] || '';
    const vb = b[sortBy] || '';
    if (typeof va === 'string') return va.localeCompare(vb) * sortDir;
    return (va - vb) * sortDir;
  });

  const page = (opts && opts.page) || 1;
  const limit = (opts && opts.limit) || 50;
  const total = list.length;
  const start = (page - 1) * limit;
  const paged = list.slice(start, start + limit);

  return { domains: paged, total, page, limit, pages: Math.ceil(total / limit) };
}

function getDomain(name) {
  syncFromNginx();
  const store = loadDomains();
  if (!store[name]) throw new Error('Domain not found: ' + name);
  return sanitizeDomain(store[name], name);
}

function createDomain(type, name, port, enableSSL) {
  validateDomain(name, type);

  const store = loadDomains();
  if (store[name]) throw new Error('Domain "' + name + '" already exists');

  const autoPort = !port || port === 0;
  if (autoPort) {
    port = findAvailablePort();
  }

  if (!fs.existsSync(NGINX_CONF_DIR)) {
    fs.mkdirSync(NGINX_CONF_DIR, { recursive: true });
  }

  createDomainWWW(name);

  const sslEnabled = enableSSL !== false;

  let finalSSL = false;
  if (sslEnabled) {
    writeNginxConf(name, generateNginxConf(name, port, false));
    nginxTestAndReload();
    const sslResult = installCertbotSSL(name);
    if (sslResult.success) {
      finalSSL = true;
    } else {
      console.error('[Domains] SSL install failed for ' + name + ':', sslResult.output);
    }
  }

  writeNginxConf(name, generateNginxConf(name, finalSSL ? 443 : port, finalSSL));
  nginxTestAndReload();

  const parentDomain = type === 'subdomain' ? name.split('.').slice(1).join('.') : null;

  store[name] = {
    type,
    domain: name,
    parentDomain,
    port: finalSSL ? 443 : port,
    root: '/var/www/' + name,
    sslEnabled: finalSSL,
    sslCert: finalSSL ? '/etc/letsencrypt/live/' + name + '/fullchain.pem' : '',
    autoPort: autoPort,
    syncedFromNginx: false,
    nginxFile: name + '.conf',
    createdAt: new Date().toISOString(),
  };
  saveDomains(store);

  return getDomain(name);
}

function editDomain(name, updates) {
  const store = loadDomains();
  if (!store[name]) throw new Error('Domain not found: ' + name);

  const d = store[name];
  const allowed = ['port', 'sslEnabled', 'root', 'type'];
  const newPort = updates.port !== undefined ? parseInt(updates.port, 10) : d.port;
  const newSSL = updates.sslEnabled !== undefined ? !!updates.sslEnabled : !!d.sslEnabled;
  const newRoot = updates.root || d.root;

  if (updates.port !== undefined) {
    if (isNaN(newPort) || newPort < 1 || newPort > 65535) throw new Error('Invalid port number');
    d.port = newPort;
  }

  if (updates.root) d.root = newRoot;
  if (updates.type) d.type = updates.type;

  if (updates.port !== undefined || updates.root) {
    const conf = generateNginxConf(name, d.port, d.sslEnabled);
    writeNginxConf(name, conf);
    nginxTestAndReload();
  }

  if (updates.sslEnabled !== undefined && updates.sslEnabled !== d.sslEnabled) {
    if (newSSL) {
      writeNginxConf(name, generateNginxConf(name, 80, false));
      nginxTestAndReload();
      const sslResult = installCertbotSSL(name);
      if (!sslResult.success) {
        writeNginxConf(name, generateNginxConf(name, d.port || 80, false));
        nginxTestAndReload();
        throw new Error('SSL installation failed: ' + sslResult.output);
      }
      d.sslEnabled = true;
      d.port = 443;
      d.sslCert = '/etc/letsencrypt/live/' + name + '/fullchain.pem';
    } else {
      writeNginxConf(name, generateNginxConf(name, 80, false));
      nginxTestAndReload();
      d.sslEnabled = false;
      d.port = 80;
      d.sslCert = '';
      deleteCertbotSSL(name);
    }
    writeNginxConf(name, generateNginxConf(name, d.port, d.sslEnabled));
    nginxTestAndReload();
  }

  if (updates.type === 'subdomain' && !d.parentDomain) {
    d.parentDomain = name.split('.').slice(1).join('.');
  }

  saveDomains(store);
  return getDomain(name);
}

function deleteDomain(name) {
  const store = loadDomains();
  if (!store[name]) throw new Error('Domain not found: ' + name);

  if (store[name].sslEnabled) {
    deleteCertbotSSL(name);
  }

  removeNginxConf(name);
  removeDomainWWW(name);

  try { nginxTestAndReload(); } catch (_) {}

  delete store[name];
  saveDomains(store);

  return { ok: true, domain: name };
}

function getNginxPreview(name) {
  if (!validators.domain.test(name)) throw new Error('Invalid domain: ' + name);
  const confPath = path.join(NGINX_CONF_DIR, name + '.conf');
  if (!fs.existsSync(confPath)) throw new Error('nginx config not found for ' + name);
  return fs.readFileSync(confPath, 'utf8');
}

function saveNginxPreview(name, content) {
  if (!validators.domain.test(name)) throw new Error('Invalid domain: ' + name);
  validateNginxContent(content);
  writeNginxConf(name, content);
  nginxTestAndReload();
  return { ok: true };
}

function installSSL(name) {
  const store = loadDomains();
  if (!store[name]) throw new Error('Domain not found: ' + name);

  const result = installCertbotSSL(name);
  if (result.success) {
    store[name].sslEnabled = true;
    store[name].port = 443;
    store[name].sslCert = '/etc/letsencrypt/live/' + name + '/fullchain.pem';
    writeNginxConf(name, generateNginxConf(name, 443, true));
    nginxTestAndReload();
    saveDomains(store);
  }

  return { success: result.success, output: result.output };
}

function getParentCandidates() {
  syncFromNginx();
  const store = loadDomains();
  const candidates = [];
  for (const key in store) {
    if (store[key].type === 'domain' || key.split('.').length <= 2) {
      candidates.push(key);
    }
  }
  return candidates.sort();
}

function getSuggestedPort() {
  return { port: findAvailablePort() };
}

function bulkDelete(names) {
  if (!Array.isArray(names) || names.length === 0) throw new Error('No domains specified');
  if (names.length > 50) throw new Error('Too many domains (max 50)');
  const results = [];
  for (const name of names) {
    try {
      deleteDomain(name);
      results.push({ domain: name, success: true });
    } catch (e) {
      results.push({ domain: name, success: false, error: e.message });
    }
  }
  return results;
}

module.exports = {
  listDomains,
  getDomain,
  createDomain,
  editDomain,
  deleteDomain,
  getNginxPreview,
  saveNginxPreview,
  installSSL,
  getParentCandidates,
  getSuggestedPort,
  syncFromNginx,
  bulkDelete,
  validateNginxContent,
};
