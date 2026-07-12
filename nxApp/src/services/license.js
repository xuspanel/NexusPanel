const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', '..', 'data', 'license-cache.json');
let revalidationTimer = null;

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); }
  catch { return null; }
}

function saveCache(data) {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch {}
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
    if (data.valid) {
      saveCache({
        valid: true,
        features: data.features || ["*"],
        key: key,
        reason: null,
        next_check: Date.now() + 3600000,
        checked_at: new Date().toISOString(),
      });
      console.log('[License] Validated successfully. Next check in 60 minutes.');
      return true;
    } else {
      const cache = loadCache();
      const graceUntil = cache?.valid ? (new Date(cache.checked_at).getTime() + 86400000) : 0;
      if (Date.now() < graceUntil) {
        saveCache({
          valid: false,
          key: key,
          reason: data.reason || 'unknown',
          next_check: Date.now() + 300000,
          checked_at: new Date().toISOString(),
          grace_until: graceUntil,
        });
        console.warn('[License] Validation failed but within grace period. Reason:', data.reason);
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
      console.error('[License] Validation failed beyond grace period. Reason:', data.reason);
      return false;
    }
  } catch (err) {
    console.error('[License] Network error validating license:', err.message);
    const cache = loadCache();
    if (cache?.valid) {
      const graceUntil = new Date(cache.checked_at).getTime() + 86400000;
      if (Date.now() < graceUntil) {
        console.warn('[License] Network error, using cached valid state. Grace until:', new Date(graceUntil).toISOString());
        return true;
      }
    }
    return false;
  }
}

async function bootstrapLicense() {
  const key = process.env.LICENSE_KEY;
  const domain = process.env.LICENSE_DOMAIN;

  if (!key) {
    console.error('[License] LICENSE_KEY not set in .env');
    console.error('[License] The panel will run but all requests will be blocked until a valid license is configured.');
    saveCache({ valid: false, key: '', reason: 'not_configured', next_check: 0, checked_at: new Date().toISOString(), grace_until: 0 });
    return false;
  }

  console.log('[License] Validating license key:', key.substring(0, 12) + '...');
  console.log('[License] Domain:', domain || '(not set)');

  const valid = await validateWithServer(key, domain);
  if (!valid) {
    console.error('[License] License validation failed. The panel will run but requests will be blocked.');
    return false;
  }

  console.log('[License] License active. Panel fully operational.');
  return true;
}

function checkLicense() {
  const cache = loadCache();
  if (!cache) return true;

  if (cache.valid) {
    if (Date.now() < cache.next_check) return true;

    if (Date.now() < (cache.grace_until || (new Date(cache.checked_at).getTime() + 86400000))) {
      triggerRevalidation();
      return true;
    }
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
  } catch {}
  revalidationPending = false;
}

function startRevalidationTimer() {
  if (revalidationTimer) clearInterval(revalidationTimer);
  revalidationTimer = setInterval(() => {
    triggerRevalidation();
  }, 3600000);
}

function getLicenseStatus() {
  const cache = loadCache();
  if (!cache) return { valid: true, reason: null };
  return { valid: cache.valid, reason: cache.reason, checked_at: cache.checked_at };
}

module.exports = { bootstrapLicense, getCachedFeatures, hasFeature, getLicenseStatus, checkLicense, startRevalidationTimer, getLicenseStatus };

function getCachedFeatures() {
  try {
    var cache = loadCache();
    if (cache && cache.features) return cache.features;
    return ['*']; // default: all features if not cached yet
  } catch { return ['*']; }
}

function hasFeature(feature) {
  var features = getCachedFeatures();
  return features.includes('*') || features.includes(feature);
}
