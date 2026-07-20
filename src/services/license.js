const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_FILE = path.join(__dirname, '..', '..', 'data', 'license-cache.json');
let revalidationTimer = null;

function getSharedSecret() {
  if (!process.env.LICENSE_SECRET) {
    throw new Error('LICENSE_SECRET is not set — cannot verify license signatures');
  }
  return process.env.LICENSE_SECRET;
}

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); }
  catch { return null; }
}

function saveCache(data) {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[License] Failed to save cache:', err.message);
  }
}

function verifySignature(data) {
  if (!data || !data.signature) return false;
  var copy = { ...data };
  delete copy.signature;
  var str = JSON.stringify(copy, Object.keys(copy).sort());
  var expected = crypto.createHmac('sha256', getSharedSecret()).update(str).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(data.signature));
}

async function validateWithServer(key, domain) {
  const serverUrl = process.env.LICENSE_SERVER_URL || 'https://nxl.xus.me/api';
  try {
    const res = await fetch(serverUrl + '/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, domain }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();

    if (!verifySignature(data)) {
      console.error('[License] WARNING: Response signature verification failed — possible spoofing attempt');
      saveCache({ valid: false, key: key, reason: 'invalid_signature', next_check: Date.now() + 300000, checked_at: new Date().toISOString(), grace_until: 0 });
      return false;
    }

    if (data.valid) {
      saveCache({
        valid: true,
        features: ['*'],
        key: key,
        boundDomain: domain || null,
        reason: null,
        next_check: Date.now() + 3600000,
        checked_at: new Date().toISOString(),
        grace_until: 0,
      });
      console.log('[License] Validated & signed. Next check in 60 minutes.');
      return true;
    } else {
      const cache = loadCache();
      if (cache?.valid && cache.grace_until && Date.now() < cache.grace_until) {
        console.warn('[License] Failed re-validation but within grace period. Reason:', data.reason);
        return true;
      }
      saveCache({
        valid: false,
        key: key,
        reason: data.reason || 'unknown',
        next_check: Date.now() + 300000,
        checked_at: new Date().toISOString(),
        grace_until: 0,
      });
      console.error('[License] Validation failed. Reason:', data.reason);
      return false;
    }
  } catch (err) {
    console.error('[License] Network error:', err.message);
    const cache = loadCache();
    if (cache?.valid) {
      const graceMs = 3600000; // 1 hour grace for network errors
      const graceUntil = new Date(cache.checked_at).getTime() + graceMs;
      if (Date.now() < graceUntil) {
        saveCache({ ...cache, grace_until: graceUntil, next_check: Date.now() + 300000 });
        console.warn('[License] Network error, grace until:', new Date(graceUntil).toISOString());
        return true;
      }
    }
    saveCache({ valid: false, key: key, reason: 'network_error', next_check: Date.now() + 300000, checked_at: new Date().toISOString(), grace_until: 0 });
    return false;
  }
}

async function bootstrapLicense() {
  const key = process.env.LICENSE_KEY;
  const domain = process.env.LICENSE_DOMAIN;

  if (!key) {
    console.error('[License] LICENSE_KEY not set. Blocking all requests.');
    saveCache({ valid: false, key: '', reason: 'not_configured', next_check: 0, checked_at: new Date().toISOString(), grace_until: 0 });
    return false;
  }

  if (!domain) {
    console.error('[License] LICENSE_DOMAIN not set. Domain binding requires a domain.');
    saveCache({ valid: false, key: key, reason: 'no_domain', next_check: 0, checked_at: new Date().toISOString(), grace_until: 0 });
    return false;
  }

  console.log('[License] Validating:', key.substring(0, 12) + '... for domain:', domain);

  const valid = await validateWithServer(key, domain);
  if (!valid) {
    console.error('[License] Validation failed. Panel blocked.');
    return false;
  }

  console.log('[License] Active. Panel operational.');
  return true;
}

function checkLicense() {
  const cache = loadCache();
  if (!cache) return false;

  if (cache.valid) {
    if (Date.now() < cache.next_check) return true;
    triggerRevalidation();
    return true;
  }

  if (cache.grace_until && Date.now() < cache.grace_until) return true;

  return false;
}

let revalidationPending = false;
async function triggerRevalidation() {
  if (revalidationPending) return;
  revalidationPending = true;
  try {
    await validateWithServer(process.env.LICENSE_KEY, process.env.LICENSE_DOMAIN);
  } catch (err) {
    console.error('[License] Revalidation error:', err.message);
  }
  revalidationPending = false;
}

function startRevalidationTimer() {
  if (revalidationTimer) clearInterval(revalidationTimer);
  revalidationTimer = setInterval(() => { triggerRevalidation(); }, 3600000);
}

function getLicenseStatus() {
  const cache = loadCache();
  if (!cache) return { valid: true, reason: null };
  return { valid: cache.valid, reason: cache.reason, checked_at: cache.checked_at };
}

function getCachedFeatures() {
  try {
    var cache = loadCache();
    if (cache && cache.features) return cache.features;
    return ['*'];
  } catch { return ['*']; }
}

function hasFeature(feature) {
  var features = getCachedFeatures();
  return features.includes('*') || features.includes(feature);
}

module.exports = { bootstrapLicense, getCachedFeatures, hasFeature, getLicenseStatus, checkLicense, startRevalidationTimer };
