const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function list() {
  const certs = [];
  const liveDir = '/etc/letsencrypt/live';
  try {
    if (!fs.existsSync(liveDir)) return certs;
    const domains = fs.readdirSync(liveDir, { withFileTypes: true }).filter(e => e.isDirectory());
    for (const d of domains) {
      const p = path.join(liveDir, d.name);
      try {
        const cert = fs.readFileSync(path.join(p, 'cert.pem'), 'utf8');
        const notAfter = execSync("openssl x509 -enddate -noout -in " + path.join(p, 'cert.pem'), { encoding: 'utf8', timeout: 5000 }).replace('notAfter=', '').trim();
        const issuer = execSync("openssl x509 -issuer -noout -in " + path.join(p, 'cert.pem'), { encoding: 'utf8', timeout: 5000 }).replace('issuer=', '').trim();
        const expiry = new Date(notAfter);
        const daysLeft = Math.ceil((expiry - Date.now()) / 86400000);
        certs.push({ domain: d.name, path: p, issuer, notAfter, expiry: expiry.toISOString(), daysLeft });
      } catch {}
    }
  } catch {}
  return certs;
}

function issue(domain, opts) {
  const email = opts?.email || 'admin@localhost';
  try {
    execSync('certbot certonly --standalone -d ' + domain + ' --non-interactive --agree-tos -m ' + email + ' 2>&1', { timeout: 120000 });
    return { ok: true, domain };
  } catch (e) {
    return { error: e.stderr || e.message };
  }
}

function renew(domain) {
  try {
    execSync('certbot renew --cert-name ' + domain + ' --force-renewal 2>&1', { timeout: 60000 });
    return { ok: true };
  } catch (e) {
    return { error: e.stderr || e.message };
  }
}

module.exports = { list, issue, renew };
