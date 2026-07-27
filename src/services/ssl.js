const fs = require('fs');
const path = require('path');
const { runSafeSync, validators } = require('../utils/shell');

const CERTBOT_LIVE = '/etc/letsencrypt/live';
const CERTBOT_RENEWAL = '/etc/letsencrypt/renewal';
const SSL_OPTIONS = '/etc/letsencrypt/options-ssl-nginx.conf';
const CRON_FILE = '/etc/cron.d/certbot-renew';

function parseCertbotOutput(output) {
  const certs = [];
  const blocks = output.split(/Certificate Name:/).slice(1);
  for (const block of blocks) {
    const name = block.split('\n')[0].trim();
    if (!name) continue;
    const serialM = block.match(/Serial Number:\s*(.+)/);
    const keyTypeM = block.match(/Key Type:\s*(.+)/);
    const domainsM = block.match(/Domains:\s*(.+)/);
    const expiryM = block.match(/Expiry Date:\s*(.+?)(?:\s*\(|$)/m);
    const certPathM = block.match(/Certificate Path:\s*(.+)/);
    const keyPathM = block.match(/Private Key Path:\s*(.+)/);
    let expiry = null;
    let daysLeft = null;
    if (expiryM) {
      const raw = expiryM[1].trim();
      expiry = new Date(raw);
      if (!isNaN(expiry.getTime())) {
        daysLeft = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
      }
    }
    certs.push({
      domain: name,
      serial: serialM ? serialM[1].trim() : '',
      keyType: keyTypeM ? keyTypeM[1].trim() : '',
      domains: domainsM ? domainsM[1].trim().split(/\s+/) : [name],
      expiry: expiry ? expiry.toISOString() : null,
      daysLeft,
      certPath: certPathM ? certPathM[1].trim() : '',
      keyPath: keyPathM ? keyPathM[1].trim() : '',
    });
  }
  return certs;
}

function list() {
  const result = runSafeSync('certbot', ['certificates'], { timeout: 15000 });
  if (result.status !== 0) return [];
  return parseCertbotOutput(result.stdout);
}

function detail(certName) {
  if (!certName || /[^a-zA-Z0-9._-]/.test(certName)) throw new Error('Invalid certificate name');
  const certPem = path.join(CERTBOT_LIVE, certName, 'fullchain.pem');
  if (!fs.existsSync(certPem)) throw new Error('Certificate not found: ' + certName);
  const textOut = runSafeSync('openssl', ['x509', '-in', certPem, '-noout', '-text'], { timeout: 5000 });
  if (textOut.status !== 0) throw new Error('Failed to read certificate');
  const text = textOut.stdout;
  const subjectM = text.match(/Subject:.*?CN\s*=\s*(.+)/);
  const issuerM = text.match(/Issuer:.*?CN\s*=\s*(.+)/);
  const serialM = text.match(/Serial Number:\s*\n?\s*([0-9a-f:\s]+)/i);
  const notBeforeM = text.match(/Not Before:\s*(.+)/);
  const notAfterM = text.match(/Not After\s*:\s*(.+)/);
  const keyTypeM = text.match(/Public Key Algorithm:\s*(.+)/);
  const keySizeM = text.match(/Public-Key:\s*\((\d+)\s*bit\)/);
  const sigAlgM = text.match(/Signature Algorithm:\s*(.+)/);
  const sanM = text.match(/X509v3 Subject Alternative Name:\s*\n\s*DNS:(.+)/);
  const sha256Out = runSafeSync('openssl', ['x509', '-in', certPem, '-noout', '-fingerprint', '-sha256'], { timeout: 3000 });
  const sha256 = sha256Out.status === 0 ? sha256Out.stdout.replace(/.*=/, '').trim() : '';
  const keySize = keySizeM ? parseInt(keySizeM[1]) : null;
  let keyType = keyTypeM ? keyTypeM[1].trim() : '';
  if (keyType === 'id-ecPublicKey') keyType = 'ECDSA';
  else if (keyType === 'rsaEncryption') keyType = 'RSA';
  const daysLeft = notAfterM ? Math.ceil((new Date(notAfterM[1].trim()).getTime() - Date.now()) / 86400000) : null;
  return {
    domain: certName,
    subject: subjectM ? subjectM[1].trim() : certName,
    issuer: issuerM ? issuerM[1].trim() : '',
    serial: serialM ? serialM[1].trim().replace(/\s+/g, ':') : '',
    notBefore: notBeforeM ? notBeforeM[1].trim() : '',
    notAfter: notAfterM ? notAfterM[1].trim() : '',
    daysLeft,
    keyType,
    keySize,
    signatureAlgorithm: sigAlgM ? sigAlgM[1].trim() : '',
    san: sanM ? sanM[1].trim().split(/,\s*DNS:/) : [certName],
    fingerprint: sha256,
    certPath: path.join(CERTBOT_LIVE, certName, 'fullchain.pem'),
    keyPath: path.join(CERTBOT_LIVE, certName, 'privkey.pem'),
    chainPath: path.join(CERTBOT_LIVE, certName, 'chain.pem'),
  };
}

function getConfig(certName) {
  if (!certName || /[^a-zA-Z0-9._-]/.test(certName)) throw new Error('Invalid certificate name');
  const confPath = path.join(CERTBOT_RENEWAL, certName + '.conf');
  if (!fs.existsSync(confPath)) throw new Error('Renewal config not found: ' + certName);
  const content = fs.readFileSync(confPath, 'utf8');
  const params = {};
  const renewalParams = content.match(/\[renewalparams\]([\s\S]*?)(?:\[|$)/);
  if (renewalParams) {
    for (const line of renewalParams[1].split('\n')) {
      const m = line.trim().match(/^(\w+)\s*=\s*(.+)/);
      if (m) params[m[1]] = m[2].trim();
    }
  }
  return { certName, params, raw: content };
}

function issue(domain, opts) {
  if (!validators.domain.test(domain)) throw new Error('Invalid domain');
  const email = opts?.email || process.env.CERTBOT_EMAIL || 'admin@localhost';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email');
  const args = ['certonly', '--webroot', '-w', '/var/www/' + domain, '-d', domain, '--non-interactive', '--agree-tos', '-m', email];
  if (opts?.staging) args.push('--staging');
  if (opts?.dryRun) args.push('--dry-run');
  const result = runSafeSync('certbot', args, { timeout: 120000 });
  if (result.status !== 0) {
    return { success: false, error: (result.stderr || result.stdout || 'certbot failed').trim(), output: ((result.stdout || '') + '\n' + (result.stderr || '')).trim() };
  }
  return { success: true, domain, output: (result.stdout || '').trim() };
}

function renew(domain) {
  if (!validators.domain.test(domain)) throw new Error('Invalid domain');
  const result = runSafeSync('certbot', ['renew', '--cert-name', domain, '--force-renewal'], { timeout: 120000 });
  if (result.status !== 0) {
    return { success: false, error: (result.stderr || result.stdout || 'certbot renew failed').trim() };
  }
  return { success: true, output: (result.stdout || '').trim() };
}

function renewAll() {
  const result = runSafeSync('certbot', ['renew', '--quiet'], { timeout: 300000 });
  const output = ((result.stdout || '') + '\n' + (result.stderr || '')).trim();
  const renewed = (output.match(/Congratulations/g) || []).length;
  const failed = (output.match(/Failed to renew/g) || []).length;
  const skipped = (output.match(/No renewals were attempted/g) || []).length;
  return { success: result.status === 0, renewed, failed, skipped, output };
}

function remove(certName) {
  if (!certName || /[^a-zA-Z0-9._-]/.test(certName)) throw new Error('Invalid certificate name');
  const liveDir = path.join(CERTBOT_LIVE, certName);
  if (!fs.existsSync(liveDir)) throw new Error('Certificate not found: ' + certName);
  const result = runSafeSync('certbot', ['delete', '--cert-name', certName, '--non-interactive', '--no-confirm'], { timeout: 30000 });
  if (result.status !== 0) {
    return { success: false, error: (result.stderr || result.stdout || 'delete failed').trim() };
  }
  return { success: true, output: (result.stdout || '').trim() };
}

function revoke(certName) {
  if (!certName || /[^a-zA-Z0-9._-]/.test(certName)) throw new Error('Invalid certificate name');
  const certPem = path.join(CERTBOT_LIVE, certName, 'cert.pem');
  if (!fs.existsSync(certPem)) throw new Error('Certificate not found: ' + certName);
  const result = runSafeSync('certbot', ['revoke', '--cert-name', certName, '--non-interactive'], { timeout: 60000 });
  if (result.status !== 0) {
    return { success: false, error: (result.stderr || result.stdout || 'revoke failed').trim() };
  }
  return { success: true, output: (result.stdout || '').trim() };
}

function autoRenewStatus() {
  const status = { cron: null, timerEnabled: null, serviceEnabled: null, lastRun: null };
  if (fs.existsSync(CRON_FILE)) {
    const content = fs.readFileSync(CRON_FILE, 'utf8').trim();
    const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
    if (lines.length > 0) status.cron = lines[0].trim();
  }
  const timerOut = runSafeSync('systemctl', ['is-enabled', 'certbot-renew.timer'], { timeout: 3000 });
  status.timerEnabled = timerOut.stdout.trim();
  const serviceOut = runSafeSync('systemctl', ['is-enabled', 'certbot-renew.service'], { timeout: 3000 });
  status.serviceEnabled = serviceOut.stdout.trim();
  const journalOut = runSafeSync('journalctl', ['-u', 'certbot-renew.service', '--no-pager', '-n', '10', '--output=short-iso'], { timeout: 5000 });
  if (journalOut.status === 0 && journalOut.stdout.trim()) {
    const lines = journalOut.stdout.trim().split('\n');
    for (const line of lines.reverse()) {
      if (line.includes('Finished') || line.includes('Completed') || line.includes('Stopped')) {
        const tsM = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:]+)/);
        if (tsM) { status.lastRun = tsM[1]; break; }
      }
    }
  }
  return status;
}

function dryRun() {
  const result = runSafeSync('certbot', ['renew', '--dry-run'], { timeout: 300000 });
  const output = ((result.stdout || '') + '\n' + (result.stderr || '')).trim();
  const results = [];
  let currentCert = null;
  const lines = output.split('\n');
  for (const line of lines) {
    const certM = line.match(/Processing\s+.*[\/\\]([^\/\\]+)\.conf/);
    if (certM) currentCert = certM[1];
    if (currentCert && line.includes('Congratulations')) {
      results.push({ cert: currentCert, status: 'ok', message: 'Renewal simulated successfully' });
      currentCert = null;
    }
    if (currentCert && line.includes('Failed to renew')) {
      const errM = line.match(/Failed to renew certificate\s+\S+\s+with error:\s*(.*)/);
      results.push({ cert: currentCert, status: 'failed', message: errM ? errM[1].trim() : 'Renewal failed' });
      currentCert = null;
    }
  }
  return { success: result.status === 0, results, output };
}

function nginxOptions() {
  if (!fs.existsSync(SSL_OPTIONS)) return null;
  const content = fs.readFileSync(SSL_OPTIONS, 'utf8');
  const protocolsMatch = content.match(/ssl_protocols\s+(.+?);/);
  const protocols = protocolsMatch ? protocolsMatch[1].trim().split(/\s+/) : [];
  const cipherMatch = content.match(/ssl_ciphers\s+["']?(.+?)["']?;?/);
  const hsts = /Strict-Transport-Security/.test(content);
  const staplingOut = runSafeSync('grep', ['-r', 'ssl_stapling on', '/etc/nginx/'], { timeout: 3000 });
  const ocspStapling = staplingOut.status === 0 && !!staplingOut.stdout.trim();
  return { protocols, ciphers: cipherMatch ? cipherMatch[1].trim() : '', hsts, ocspStapling, raw: content };
}

function search(query) {
  if (!query) return list();
  const certs = list();
  const q = query.toLowerCase();
  return certs.filter(c =>
    c.domain.toLowerCase().includes(q) ||
    c.serial.toLowerCase().includes(q) ||
    c.keyType.toLowerCase().includes(q) ||
    (c.domains && c.domains.some(d => d.toLowerCase().includes(q)))
  );
}

module.exports = { list, detail, getConfig, issue, renew, renewAll, remove, revoke, autoRenewStatus, dryRun, nginxOptions, search, parseCertbotOutput };
