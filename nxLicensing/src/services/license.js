const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'licenses.json');

function getSharedSecret() {
  return process.env.VALIDATION_SECRET || 'nxlicensing_default_hmac_secret_2026';
}

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function save(licenses) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(licenses, null, 2));
}

function generateKeys(opts) {
  const count = opts.count || 1;
  const maxDomains = opts.max_domains || 1;
  const expiresInMonths = opts.expires_in_months || null;
  const issuedTo = opts.issued_to || '';
  const notes = opts.notes || '';

  const keys = [];
  const licenses = load();

  for (let i = 0; i < count; i++) {
    const key = 'NX-' + Array.from({ length: 3 }, () =>
      crypto.randomBytes(2).toString('hex').toUpperCase().substring(0, 4)
    ).join('-');

    const license = {
      key,
      status: 'active',
      max_domains: parseInt(maxDomains),
      contact_email: opts.contact_email || "",
      domains: [],
      issued_at: new Date().toISOString(),
      expires_at: expiresInMonths
        ? new Date(Date.now() + expiresInMonths * 30 * 24 * 3600000).toISOString()
        : null,
      issued_to: issuedTo,
      plan: opts.plan || "Starter",
      notes: notes,
      last_check_in: null,
      check_in_count: 0,
      created_at: new Date().toISOString(),
    };

    licenses.push(license);
    keys.push(license);
  }

  save(licenses);
  return keys;
}

function validateKey(key, domain) {
  const licenses = load();
  const lic = licenses.find(l => l.key === key);

  if (!lic) return { valid: false, reason: 'invalid_key', code: 'LICENSE_NOT_FOUND' };

  if (lic.status === 'suspended') return { valid: false, reason: 'suspended', code: 'LICENSE_SUSPENDED' };
  if (lic.status === 'revoked') return { valid: false, reason: 'revoked', code: 'LICENSE_REVOKED' };

  if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
    if (lic.status === 'active') { lic.status = 'expired'; save(licenses); }
    return { valid: false, reason: 'expired', code: 'LICENSE_EXPIRED', expired_at: lic.expires_at };
  }

  if (domain && !lic.domains.includes(domain)) {
    if (lic.domains.length >= lic.max_domains) {
      return { valid: false, reason: 'domain_limit_exceeded', code: 'DOMAIN_LIMIT', max: lic.max_domains, current: lic.domains };
    }
    lic.domains.push(domain);
  }

  lic.last_check_in = new Date().toISOString();
  lic.check_in_count = (lic.check_in_count || 0) + 1;
  save(licenses);

  return {
    valid: true,
    license: {
      key: lic.key,
      status: lic.status,
      max_domains: lic.max_domains,
      domains: lic.domains,
      expires_at: lic.expires_at,
      issued_to: lic.issued_to,
    },
    server_time: new Date().toISOString(),
  };
}

function signPayload(payload) {
  const secret = getSharedSecret();
  const str = JSON.stringify(payload, Object.keys(payload).sort());
  const hmac = crypto.createHmac('sha256', secret).update(str).digest('hex');
  return { ...payload, signature: hmac };
}

function getLicense(key) {
  return load().find(l => l.key === key) || null;
}

function listLicenses() {
  return load().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function updateLicense(key, updates) {
  const licenses = load();
  const lic = licenses.find(l => l.key === key);
  if (!lic) return null;

  if (updates.status) lic.status = updates.status;
  if (updates.notes !== undefined) lic.notes = updates.notes;
  if (updates.issued_to !== undefined) lic.issued_to = updates.issued_to;
  if (updates.max_domains !== undefined) lic.max_domains = parseInt(updates.max_domains);
  if (updates.expires_in_months !== undefined) {
    lic.expires_at = new Date(Date.now() + updates.expires_in_months * 30 * 24 * 3600000).toISOString();
  }
  if (updates.extend_days !== undefined) {
    const current = lic.expires_at ? new Date(lic.expires_at) : new Date();
    lic.expires_at = new Date(current.getTime() + updates.extend_days * 24 * 3600000).toISOString();
    if (lic.status === 'expired') lic.status = 'active';
  }

  save(licenses);
  return lic;
}

function deleteLicense(key) {
  const licenses = load();
  const idx = licenses.findIndex(l => l.key === key);
  if (idx === -1) return false;
  licenses.splice(idx, 1);
  save(licenses);
  return true;
}

function getStats() {
  const licenses = load();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return {
    total: licenses.length,
    active: licenses.filter(l => l.status === 'active').length,
    suspended: licenses.filter(l => l.status === 'suspended').length,
    revoked: licenses.filter(l => l.status === 'revoked').length,
    expired: licenses.filter(l => l.status === 'expired').length,
    validations_today: licenses.reduce((sum, l) => {
      if (l.last_check_in && new Date(l.last_check_in) >= todayStart) return sum + 1;
      return sum;
    }, 0),
    total_check_ins: licenses.reduce((sum, l) => sum + (l.check_in_count || 0), 0),
  };
}

module.exports = { generateKeys, validateKey, getLicense, listLicenses, updateLicense, deleteLicense, getStats, getAnalytics, checkExpiries, getPlanFeatures, signPayload };

const PLAN_FEATURES = {
  Starter: ['dashboard','files','terminal','services','processes','logs','cron','users','profile','theme'],
  Professional: ['dashboard','files','terminal','services','processes','logs','cron','users','profile','theme','docker','domains','ssl','backups','firewall','ftp','emails','databases','audit'],
  Business: ['dashboard','files','terminal','services','processes','logs','cron','users','profile','theme','docker','domains','ssl','backups','firewall','ftp','emails','databases','audit','virusscanner','phpfpm','updates','mimetypes','metrics','alerts'],
  Enterprise: ['*'],
};

function getPlanFeatures(plan) { return PLAN_FEATURES[plan] || PLAN_FEATURES.Enterprise; }

function getAnalytics() {
  var licenses = load();
  var now = new Date();
  var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var weekStart = todayStart - 7 * 86400000;
  var monthStart = todayStart - 30 * 86400000;

  // Daily check-in trend (last 14 days)
  var dailyChecks = {};
  for (var d = 13; d >= 0; d--) {
    var day = new Date(todayStart - d * 86400000);
    var key = day.toISOString().substring(0, 10);
    dailyChecks[key] = 0;
  }
  licenses.forEach(function (l) {
    if (l.last_check_in) {
      var day = new Date(l.last_check_in).toISOString().substring(0, 10);
      if (dailyChecks[day] !== undefined) dailyChecks[day]++;
    }
  });

  // Domain registrations by day (last 14 days)
  var domainRegs = {};
  for (var d = 13; d >= 0; d--) {
    var day = new Date(todayStart - d * 86400000);
    var key = day.toISOString().substring(0, 10);
    domainRegs[key] = 0;
  }
  licenses.forEach(function (l) {
    // Approximate: count domains added based on check-in dates
    if (l.domains && l.domains.length) {
      var d = l.last_check_in ? new Date(l.last_check_in).toISOString().substring(0, 10) : null;
      if (d && domainRegs[d] !== undefined) domainRegs[d] += l.domains.length;
    }
  });

  // Top licenses
  var topLicenses = licenses
    .filter(l => l.check_in_count > 0)
    .sort((a, b) => b.check_in_count - a.check_in_count)
    .slice(0, 10)
    .map(l => ({ key: l.key, checks: l.check_in_count, issued_to: l.issued_to, domains: l.domains.length }));

  return {
    dailyChecks: Object.entries(dailyChecks).map(([k, v]) => ({ date: k, count: v })),
    domainRegs: Object.entries(domainRegs).map(([k, v]) => ({ date: k, count: v })),
    topLicenses,
    checksToday: licenses.filter(l => l.last_check_in && new Date(l.last_check_in) >= todayStart).length,
    checksThisWeek: licenses.filter(l => l.last_check_in && new Date(l.last_check_in) >= weekStart).length,
    checksThisMonth: licenses.filter(l => l.last_check_in && new Date(l.last_check_in) >= monthStart).length,
  };
}

var warningSent = {};

function checkExpiries() {
  var licenses = load();
  var now = Date.now();
  var milestones = [30, 14, 7]; // days before expiry

  licenses.filter(l => l.status === 'active' && l.expires_at).forEach(function (l) {
    var daysLeft = Math.ceil((new Date(l.expires_at).getTime() - now) / 86400000);
    milestones.forEach(function (m) {
      if (daysLeft === m && !warningSent[l.key + '_' + m]) {
        warningSent[l.key + '_' + m] = true;
        sendExpiryWarning(l, daysLeft);
      }
    });
    if (daysLeft <= 0) {
      l.status = 'expired';
      save(licenses);
    }
  });
}

function sendExpiryWarning(license, daysLeft) {
  // Admin notification
  try {
    var adminMsg = [
      'From: nxLicensing <alerts@nxl.xus.me>',
      'To: ' + (process.env.ADMIN_EMAIL || 'admin@xus.me'),
      'Subject: License ' + license.key + ' expires in ' + daysLeft + ' days',
      'Content-Type: text/plain; charset=utf-8', '',
      'License: ' + license.key,
      'Issued To: ' + (license.issued_to || 'Unknown'),
      'Expires: ' + new Date(license.expires_at).toLocaleDateString(),
      'Days Left: ' + daysLeft,
      'Domains: ' + (license.domains || []).join(', ') || 'None',
      '',
      'Action: Contact the customer about renewal.',
    ].join('\n');
    execSync('sendmail -t -oi', { input: adminMsg, encoding: 'utf8', timeout: 10000 });
  } catch {}

  // Customer notification if contact_email exists
  if (license.contact_email) {
    try {
      var userMsg = [
        'From: NexusPanel <nxp@s2u.me>',
        'To: ' + license.contact_email,
        'Subject: Your NexusPanel License Expires in ' + daysLeft + ' Days',
        'Content-Type: text/plain; charset=utf-8', '',
        'Hello,',
        '',
        'Your NexusPanel license (' + license.key + ') will expire in ' + daysLeft + ' days.',
        'Please renew to continue using NexusPanel without interruption.',
        '',
        'Renew at: https://nxp.xus.me/pricing',
        '',
        '— The NexusPanel Team',
      ].join('\n');
      execSync('sendmail -t -oi', { input: userMsg, encoding: 'utf8', timeout: 10000 });
    } catch {}
  }
}

// Run on server startup
checkExpiries();
// Run daily
setInterval(checkExpiries, 24 * 3600000);
