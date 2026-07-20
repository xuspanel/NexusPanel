const fs = require('fs');
const path = require('path');
const { runSafeSync, validators } = require('../utils/shell');

function list() {
  const certs = [];
  const liveDir = '/etc/letsencrypt/live';
  try {
    if (!fs.existsSync(liveDir)) return certs;
    const domains = fs.readdirSync(liveDir, { withFileTypes: true }).filter(e => e.isDirectory());
    for (const d of domains) {
      const p = path.join(liveDir, d.name);
      try {
        const notAfterOut = runSafeSync('openssl', ['x509', '-enddate', '-noout', '-in', path.join(p, 'cert.pem')]);
        if (notAfterOut.status !== 0) continue;
        const notAfter = notAfterOut.stdout.replace('notAfter=', '').trim();
        const issuerOut = runSafeSync('openssl', ['x509', '-issuer', '-noout', '-in', path.join(p, 'cert.pem')]);
        if (issuerOut.status !== 0) continue;
        const issuer = issuerOut.stdout.replace('issuer=', '').trim();
        const expiry = new Date(notAfter);
        const daysLeft = Math.ceil((expiry - Date.now()) / 86400000);
        certs.push({ domain: d.name, path: p, issuer, notAfter, expiry: expiry.toISOString(), daysLeft });
      } catch {}
    }
  } catch {}
  return certs;
}

function issue(domain, opts) {
  if (!validators.domain.test(domain)) throw new Error('Invalid domain');
  const email = opts?.email || 'admin@localhost';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email');
  const result = runSafeSync('certbot', ['certonly', '--standalone', '-d', domain, '--non-interactive', '--agree-tos', '-m', email], { timeout: 120000 });
  if (result.status !== 0) {
    return { error: result.stderr || result.stdout || result.error || 'certbot failed' };
  }
  return { ok: true, domain };
}

function renew(domain) {
  if (!validators.domain.test(domain)) throw new Error('Invalid domain');
  const result = runSafeSync('certbot', ['renew', '--cert-name', domain, '--force-renewal'], { timeout: 60000 });
  if (result.status !== 0) {
    return { error: result.stderr || result.stdout || result.error || 'certbot renew failed' };
  }
  return { ok: true };
}

module.exports = { list, issue, renew };
