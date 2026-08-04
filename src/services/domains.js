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

let cachedNginxVersion = null;

function getNginxVersion() {
  if (cachedNginxVersion) return cachedNginxVersion;
  try {
    const res = runSafeSync('nginx', ['-v']);
    const out = res.stderr || res.stdout || '';
    const m = out.match(/nginx\/(\d+)\.(\d+)(?:\.(\d+))?/);
    if (m) {
      cachedNginxVersion = {
        major: parseInt(m[1], 10),
        minor: parseInt(m[2], 10),
        patch: parseInt(m[3] || '0', 10),
      };
    }
  } catch (_) { /* fall through */ }
  return cachedNginxVersion;
}

function supportsStandaloneHttp2() {
  const v = getNginxVersion();
  if (!v) return true;
  if (v.major > 1) return true;
  if (v.major === 1) {
    if (v.minor > 25) return true;
    if (v.minor === 25 && v.patch >= 1) return true;
  }
  return false;
}

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

function getBoundPorts() {
  const ports = new Set();
  const addLinePorts = (output) => {
    for (const line of output.split('\n')) {
      if (/^\s*LISTEN/.test(line) || line.includes('LISTEN')) {
        const m = line.match(/[:\[](\d+)\s+\]/) || line.match(/:(\d+)\s/);
        if (m && m[1]) {
          const p = parseInt(m[1], 10);
          if (p >= 1 && p <= 65535) ports.add(p);
        }
      }
    }
  };
  const ss = runSafeSync('ss', ['-tln'], { timeout: 5000 });
  if (ss.status === 0 && ss.stdout) {
    addLinePorts(ss.stdout);
    return ports;
  }
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      for (const line of content.split('\n').slice(1)) {
        const fields = line.trim().split(/\s+/);
        if (fields.length >= 4 && fields[3] === '0A') {
          const local = fields[1];
          const port = parseInt(local.split(':').pop(), 16);
          if (port >= 1 && port <= 65535) ports.add(port);
        }
      }
    } catch (_) {}
  }
  return ports;
}

function getNginxConfPorts() {
  const ports = new Set();
  try {
    if (!fs.existsSync(NGINX_CONF_DIR)) return ports;
    const files = fs.readdirSync(NGINX_CONF_DIR).filter(f => f.endsWith('.conf') && !f.includes('.bak'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(NGINX_CONF_DIR, file), 'utf8');
      const matches = content.match(/listen\s+(\d+)/g) || [];
      for (const m of matches) {
        const p = parseInt(m.replace(/listen\s+/, ''), 10);
        if (p >= 1 && p <= 65535) ports.add(p);
      }
    }
  } catch (_) {}
  return ports;
}

function getUsedPorts() {
  const store = loadDomains();
  const usedPorts = new Set([80, 443]);
  for (const name in store) {
    if (store[name].port) usedPorts.add(store[name].port);
  }
  for (const p of getNginxConfPorts()) usedPorts.add(p);
  for (const p of getBoundPorts()) usedPorts.add(p);
  return usedPorts;
}

function findNextFreePort(usedPorts, start, end) {
  const used = usedPorts || new Set();
  const lo = start || PORT_RANGE_START;
  const hi = end || PORT_RANGE_END;
  for (let p = lo; p <= hi; p++) {
    if (!used.has(p)) return p;
  }
  throw new Error('No available ports in range ' + lo + '-' + hi);
}

function findAvailablePort() {
  return findNextFreePort(getUsedPorts());
}

function assertPortFree(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid port number: ' + port);
  }
  const usedPorts = getUsedPorts();
  if (usedPorts.has(port)) {
    throw new Error('Port ' + port + ' is already in use by another domain or service. Choose a different port or leave it empty to auto-assign.');
  }
  return true;
}

function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (_) {}
}

function getServerPublicIP() {
  try {
    const r = runSafeSync('hostname', ['-I'], { timeout: 5000 });
    const first = (r.stdout || '').trim().split(/\s+/)[0];
    if (first && validators.ipAddr.test(first)) return first;
  } catch (_) {}
  return '127.0.0.1';
}

function verifyDomainLive(domain, port, sslEnabled) {
  const scheme = sslEnabled ? 'https' : 'http';
  const args = ['-s', '-k', '-o', '/dev/null', '-w', '%{http_code}', '-H', 'Host: ' + domain, scheme + '://127.0.0.1:' + port + '/'];
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = runSafeSync('curl', args, { timeout: 5000 });
    const status = parseInt((r.stdout || '').trim(), 10);
    if (!Number.isNaN(status) && status >= 200 && status < 400) {
      return { ok: true, status };
    }
    if (attempt < 2) sleepSync(500);
  }
  return { ok: false, status: 0 };
}

function ensureFirewallPort(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  const state = runSafeSync('firewall-cmd', ['--state'], { timeout: 3000 });
  if (state.status !== 0) return false;
  const query = runSafeSync('firewall-cmd', ['--query-port', port + '/tcp'], { timeout: 5000 });
  if (query.status === 0) return false;
  runSafeSync('firewall-cmd', ['--permanent', '--zone=public', '--add-port', port + '/tcp'], { timeout: 10000 });
  runSafeSync('firewall-cmd', ['--reload'], { timeout: 10000 });
  return true;
}

function releaseFirewallPort(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return;
  const state = runSafeSync('firewall-cmd', ['--state'], { timeout: 3000 });
  if (state.status !== 0) return;
  runSafeSync('firewall-cmd', ['--permanent', '--zone=public', '--remove-port', port + '/tcp'], { timeout: 10000 });
  runSafeSync('firewall-cmd', ['--reload'], { timeout: 10000 });
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

function validateDomain(name, type, parentDomain) {
  if (!name || name.length < 3) throw new Error('Invalid domain name');
  if (!validators.domain.test(name)) {
    throw new Error('Invalid domain format. Use example.com');
  }
  if (type === 'subdomain') {
    const parts = name.split('.');
    if (parts.length < 3) throw new Error('Subdomain must have at least 3 parts (e.g. sub.example.com)');
    if (!parentDomain) {
      throw new Error('Subdomain requires selecting an associated parent domain');
    }
    const store = loadDomains();
    if (!store[parentDomain]) {
      throw new Error('Parent domain not found: ' + parentDomain);
    }
    if (store[parentDomain].type === 'subdomain') {
      throw new Error('Parent domain cannot be a subdomain: ' + parentDomain);
    }
    if (name !== parentDomain && !name.endsWith('.' + parentDomain)) {
      throw new Error('Subdomain "' + name + '" must belong to parent "' + parentDomain + '" (e.g. sub.' + parentDomain + ')');
    }
  }
}

function generateNginxConf(domain, port, sslEnabled, type, options) {
  const root = (options && options.root) || '/var/www/' + domain;
  const log = '/var/log/nginx/' + domain;
  const httpsPort = port || 443;
  let conf = 'server {\n';
  conf += '    server_name ' + domain + ';\n';
  conf += '\n';
  if (sslEnabled) {
    const standaloneH2 = supportsStandaloneHttp2();
    conf += '    listen ' + httpsPort + ' ssl' + (standaloneH2 ? '' : ' http2') + ';\n';
    conf += '    listen [::]:' + httpsPort + ' ssl' + (standaloneH2 ? '' : ' http2') + ';\n';
    if (standaloneH2) conf += '    http2 on;\n';
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
  conf += '    add_header X-Frame-Options "DENY" always;\n';
  conf += '    add_header X-Content-Type-Options "nosniff" always;\n';
  conf += '    add_header X-XSS-Protection "1; mode=block" always;\n';
  conf += '    add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n';
  conf += '\n';
  conf += '    location / {\n';
  conf += '        try_files $uri $uri/ =404;\n';
  conf += '    }\n';
  conf += '\n';
  conf += '    location ~ /\\. {\n';
  conf += '        deny all;\n';
  conf += '        access_log off;\n';
  conf += '        log_not_found off;\n';
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
    conf += '    return 301 https://$server_name' + (httpsPort === 443 ? '' : ':' + httpsPort) + '$request_uri;\n';
    conf += '}\n';
  }

  return conf;
}

function generateAppNginxConf(domain, port, sslEnabled, opts) {
  const options = opts || {};
  const root = options.root;
  const proxyPass = options.proxyPass;
  const phpSocket = options.phpSocket;
  const log = '/var/log/nginx/' + domain;
  const httpsPort = port || 443;
  let conf = 'server {\n';
  conf += '    server_name ' + domain + ';\n';
  conf += '\n';
  if (sslEnabled) {
    const standaloneH2 = supportsStandaloneHttp2();
    conf += '    listen ' + httpsPort + ' ssl' + (standaloneH2 ? '' : ' http2') + ';\n';
    conf += '    listen [::]:' + httpsPort + ' ssl' + (standaloneH2 ? '' : ' http2') + ';\n';
    if (standaloneH2) conf += '    http2 on;\n';
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
  conf += '    add_header X-Frame-Options "DENY" always;\n';
  conf += '    add_header X-Content-Type-Options "nosniff" always;\n';
  conf += '    add_header X-XSS-Protection "1; mode=block" always;\n';
  conf += '    add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n';
  conf += '\n';

  if (proxyPass) {
    conf += '    location / {\n';
    conf += '        proxy_pass ' + proxyPass + ';\n';
    conf += '        proxy_http_version 1.1;\n';
    conf += '        proxy_set_header Upgrade $http_upgrade;\n';
    conf += '        proxy_set_header Connection "upgrade";\n';
    conf += '        proxy_set_header Host $host;\n';
    conf += '        proxy_set_header X-Real-IP $remote_addr;\n';
    conf += '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n';
    conf += '        proxy_set_header X-Forwarded-Proto $scheme;\n';
    conf += '        proxy_read_timeout 300s;\n';
    conf += '        proxy_send_timeout 300s;\n';
    conf += '    }\n';
    conf += '\n';
  } else {
    conf += '    root ' + root + ';\n';
    conf += '    index index.php index.html index.htm;\n';
    conf += '\n';
    conf += '    location / {\n';
    conf += phpSocket
      ? '        try_files $uri $uri/ /index.php?$query_string;\n'
      : '        try_files $uri $uri/ =404;\n';
    conf += '    }\n';
    conf += '\n';
  }

  if (phpSocket && !proxyPass) {
    conf += '    location ~ \\.php$ {\n';
    conf += '        fastcgi_pass unix:' + phpSocket + ';\n';
    conf += '        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;\n';
    conf += '        include fastcgi_params;\n';
    conf += '    }\n';
    conf += '\n';
  }

  conf += '    location ~ /\\. {\n';
  conf += '        deny all;\n';
  conf += '        access_log off;\n';
  conf += '        log_not_found off;\n';
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
    conf += '    return 301 https://$server_name' + (httpsPort === 443 ? '' : ':' + httpsPort) + '$request_uri;\n';
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

function createDomainWWW(domain, root) {
  const dir = root || path.join(WWW_DIR, domain);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const indexPath = path.join(dir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, LIVE_PAGE_HTML(domain), 'utf8');
  }
  return dir;
}

function LIVE_PAGE_HTML(domain) {
  const safe = String(domain).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
  return '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex">' +
    '<title>' + safe + ' — Live</title>' +
    '<style>' +
    '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}' +
    'html,body{height:100%}' +
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;' +
    'background:radial-gradient(1200px 600px at 50% -10%,#1e1b4b 0%,#0f172a 55%,#020617 100%);' +
    'color:#e2e8f0;display:flex;align-items:center;justify-content:center;padding:24px;overflow:hidden}' +
    'body::before{content:"";position:fixed;inset:0;background:radial-gradient(600px 300px at 80% 90%,rgba(34,211,238,.10) 0%,transparent 60%);pointer-events:none}' +
    '.card{position:relative;text-align:center;max-width:560px;width:100%;padding:56px 40px;border:1px solid rgba(148,163,184,.18);border-radius:20px;' +
    'background:linear-gradient(180deg,rgba(30,41,59,.6) 0%,rgba(15,23,42,.6) 100%);' +
    'box-shadow:0 24px 80px rgba(2,6,23,.6);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}' +
    '.live{display:inline-flex;align-items:center;gap:10px;padding:6px 16px;border-radius:999px;background:rgba(16,185,129,.12);' +
    'border:1px solid rgba(16,185,129,.35);color:#34d399;font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;margin-bottom:28px}' +
    '.dot{width:10px;height:10px;border-radius:50%;background:#10b981;box-shadow:0 0 0 0 rgba(16,185,129,.6);animation:pulse 2s infinite}' +
    '@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(16,185,129,.55)}70%{box-shadow:0 0 0 12px rgba(16,185,129,0)}100%{box-shadow:0 0 0 0 rgba(16,185,129,0)}}' +
    '.globe{font-size:44px;margin-bottom:18px;line-height:1}' +
    'h1{font-size:clamp(22px,4.5vw,34px);font-weight:700;color:#f8fafc;letter-spacing:-.01em;word-break:break-all;margin-bottom:14px}' +
    'p.tag{color:#94a3b8;font-size:16px;line-height:1.6;margin-bottom:32px}' +
    'p.tag b{color:#cbd5e1;font-weight:600}' +
    '.footer{display:flex;align-items:center;justify-content:center;gap:8px;color:#64748b;font-size:13px}' +
    '.footer .bolt{color:#22d3ee;font-size:15px}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="card">' +
    '<span class="live"><span class="dot"></span>Live</span>' +
    '<div class="globe">&#127760;</div>' +
    '<h1>' + safe + '</h1>' +
    '<p class="tag">This domain is <b>up and serving traffic</b>.<br>Content is ready to be placed here.</p>' +
    '<div class="footer"><span class="bolt">&#9889;</span> Hosted with NexusPanel</div>' +
    '</div>' +
    '</body>' +
    '</html>';
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
    sslError: d.sslError || '',
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

function createDomain(type, name, opts) {
  const options = opts || {};
  const requestedPort = options.port !== undefined ? parseInt(options.port, 10) : 0;
  const enableSSL = options.ssl !== undefined ? !!options.ssl : true;
  const customRoot = (options.root || options.location || '').trim();
  const parentDomain = (options.parentDomain || '').trim() || null;

  validateDomain(name, type, parentDomain);

  const store = loadDomains();
  if (store[name]) throw new Error('Domain "' + name + '" already exists');

  const sslEnabled = enableSSL;
  const customPort = requestedPort > 0;

  if (customPort) {
    assertPortFree(requestedPort);
  }

  const root = customRoot ? path.resolve(customRoot) : path.join(WWW_DIR, name);
  if (customRoot && !customRoot.startsWith('/')) {
    throw new Error('Location must be an absolute path');
  }

  if (!fs.existsSync(NGINX_CONF_DIR)) {
    fs.mkdirSync(NGINX_CONF_DIR, { recursive: true });
  }

  createDomainWWW(name, root);

  let finalPort = sslEnabled && !customPort ? 443 : (customPort ? requestedPort : findAvailablePort());
  let finalSSL = false;
  let sslError = '';

  if (sslEnabled) {
    writeNginxConf(name, generateNginxConf(name, 80, false, type, { root }));
    nginxTestAndReload();
    const sslResult = installCertbotSSL(name);
    if (sslResult.success) {
      finalSSL = true;
    } else {
      sslError = (sslResult.output || 'certbot failed').substring(0, 500);
      console.error('[Domains] SSL install failed for ' + name + ':', sslError);
    }
  }

  if (!sslEnabled || !finalSSL) {
    finalPort = customPort ? requestedPort : findAvailablePort();
  }

  writeNginxConf(name, generateNginxConf(name, finalPort, finalSSL, type, { root }));
  nginxTestAndReload();

  const firewallOpened = ensureFirewallPort(finalPort);
  const liveCheck = verifyDomainLive(name, finalPort, finalSSL);

  const parent = type === 'subdomain' ? (parentDomain || name.split('.').slice(1).join('.')) : null;

  store[name] = {
    type,
    domain: name,
    parentDomain: parent,
    port: finalPort,
    root: root,
    sslEnabled: finalSSL,
    sslCert: finalSSL ? '/etc/letsencrypt/live/' + name + '/fullchain.pem' : '',
    sslError: sslError || undefined,
    autoPort: !customPort,
    syncedFromNginx: false,
    nginxFile: name + '.conf',
    firewallOpened: firewallOpened || undefined,
    createdAt: new Date().toISOString(),
  };
  saveDomains(store);

  const result = getDomain(name);
  result.liveCheck = liveCheck;
  result.previewUrl = (liveCheck.ok && !finalSSL && finalPort !== 80 && finalPort !== 443)
    ? 'http://' + getServerPublicIP() + ':' + finalPort + '/'
    : null;
  return result;
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
    if (newPort !== d.port) assertPortFree(newPort);
    d.port = newPort;
  }

  if (updates.root) d.root = newRoot;
  if (updates.type) d.type = updates.type;

  if (updates.port !== undefined || updates.root) {
    const conf = generateNginxConf(name, d.port, d.sslEnabled, d.type, { root: d.root });
    writeNginxConf(name, conf);
    nginxTestAndReload();
  }

  if (updates.sslEnabled !== undefined && updates.sslEnabled !== d.sslEnabled) {
    if (newSSL) {
      writeNginxConf(name, generateNginxConf(name, 80, false, d.type, { root: d.root }));
      nginxTestAndReload();
      const sslResult = installCertbotSSL(name);
      if (!sslResult.success) {
        writeNginxConf(name, generateNginxConf(name, d.port || 80, false, d.type, { root: d.root }));
        nginxTestAndReload();
        throw new Error('SSL installation failed: ' + sslResult.output);
      }
      d.sslEnabled = true;
      const httpsPort = d.port === 80 ? 443 : (d.port || 443);
      d.port = httpsPort;
      d.sslCert = '/etc/letsencrypt/live/' + name + '/fullchain.pem';
    } else {
      writeNginxConf(name, generateNginxConf(name, 80, false, d.type, { root: d.root }));
      nginxTestAndReload();
      d.sslEnabled = false;
      d.port = d.port === 443 ? 80 : d.port;
      d.sslCert = '';
      deleteCertbotSSL(name);
    }
    writeNginxConf(name, generateNginxConf(name, d.port, d.sslEnabled, d.type, { root: d.root }));
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

  const port = store[name].port;
  const hadFirewall = !!store[name].firewallOpened;

  removeNginxConf(name);
  removeDomainWWW(name);

  try { nginxTestAndReload(); } catch (_) {}

  delete store[name];
  saveDomains(store);

  if (hadFirewall) {
    const stillUsed = Object.keys(store).some(k => Number(store[k].port) === port) || getNginxConfPorts().has(port);
    if (!stillUsed) releaseFirewallPort(port);
  }

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
    const httpsPort = store[name].port === 80 || store[name].port === 443 ? 443 : (store[name].port || 443);
    store[name].port = httpsPort;
    store[name].sslCert = '/etc/letsencrypt/live/' + name + '/fullchain.pem';
    writeNginxConf(name, generateNginxConf(name, httpsPort, true, store[name].type, { root: store[name].root }));
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
  findNextFreePort,
  getUsedPorts,
  writeNginxConf,
  nginxTestAndReload,
  generateNginxConf,
  generateAppNginxConf,
};
