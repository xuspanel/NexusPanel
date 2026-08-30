const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_FILE = path.join(__dirname, '..', '..', 'data', 'license-cache.json');
const GRACE_PERIOD_MS = 72 * 60 * 60 * 1000; // 72 hours
const REVALIDATION_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let revalidationTimer = null;

const PLAN_FEATURES = {
  Starter: [
    'core', 'domains', 'ssl', 'files', 'php', 'static', 'security',
    'firewall', 'system', 'services', 'terminal', 'logs', 'updates', 'audit', 'apps'
  ],
  Pro: [
    'core', 'domains', 'ssl', 'files', 'php', 'static', 'security',
    'firewall', 'system', 'services', 'terminal', 'logs', 'updates', 'audit', 'apps',
    'docker', 'backups', 'git_deploy', 'databases', 'ftp', 'cron'
  ],
  Enterprise: ['*'],
  Unlimited: ['*']
};

function getSharedSecret() {
  return process.env.LICENSE_SECRET || 'nxl_hmac_v2_7f3a8b1c9d2e4f5a6b7c8d9e0f1a2b3c';
}

function computeHmac(obj) {
  const copy = { ...obj };
  delete copy.signature;
  const canonical = JSON.stringify(copy, Object.keys(copy).sort());
  return crypto.createHmac('sha256', getSharedSecret()).update(canonical).digest('hex');
}

function signCachePayload(payload) {
  const hmac = computeHmac(payload);
  return { ...payload, signature: hmac };
}

function verifyLocalCacheSignature(cacheData) {
  if (!cacheData || !cacheData.signature || typeof cacheData.signature !== 'string') return false;
  try {
    const expected = computeHmac(cacheData);
    const expBuf = Buffer.from(expected, 'utf8');
    const actBuf = Buffer.from(cacheData.signature, 'utf8');
    if (expBuf.length !== actBuf.length) return false;
    return crypto.timingSafeEqual(expBuf, actBuf);
  } catch {
    return false;
  }
}

function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (!verifyLocalCacheSignature(data)) {
      console.warn('[License] Cryptographic signature mismatch in license cache — tampering detected');
      return { valid: false, reason: 'tampered_cache', plan: null, features: [] };
    }
    return data;
  } catch (err) {
    console.error('[License] Cache read error:', err.message);
    return null;
  }
}

function saveCache(data) {
  try {
    const signedData = signCachePayload(data);
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = CACHE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(signedData, null, 2), 'utf8');
    fs.renameSync(tmp, CACHE_FILE);
    return signedData;
  } catch (err) {
    console.error('[License] Failed to save cache:', err.message);
  }
}

function checkLicense() {
  const cache = loadCache();
  if (!cache) return false;
  if (!cache.valid) return false;

  const now = Date.now();

  // Clock tampering check: rollback check against last_verified_at and max_observed_time
  if (cache.last_verified_at) {
    const lastVerifiedMs = new Date(cache.last_verified_at).getTime();
    if (!isNaN(lastVerifiedMs) && now < (lastVerifiedMs - 60000)) {
      console.error('[License] CLOCK TAMPER DETECTED: System clock is before last_verified_at');
      return false;
    }
  }

  if (cache.max_observed_time && typeof cache.max_observed_time === 'number') {
    if (now < (cache.max_observed_time - 60000)) {
      console.error('[License] CLOCK TAMPER DETECTED: System clock was wound backwards');
      return false;
    }
  }

  // Update max_observed_time monotonically
  if (!cache.max_observed_time || now > cache.max_observed_time) {
    cache.max_observed_time = now;
    saveCache(cache);
  }

  // If next_check has passed, trigger background revalidation
  if (cache.next_check && now >= cache.next_check) {
    triggerRevalidation();
  }

  // If within 72-hour grace period, license is active and unlocked
  if (cache.grace_until && now < cache.grace_until) {
    return true;
  }

  // Grace period expired
  console.warn('[License] 72-hour offline grace period expired without server ping');
  return false;
}

function getPlan() {
  const cache = loadCache();
  if (!cache || !cache.valid) return null;
  return cache.plan || 'Starter';
}

function getCachedFeatures() {
  const cache = loadCache();
  if (!cache || !cache.valid) return [];
  if (cache.features && Array.isArray(cache.features)) return cache.features;
  const plan = cache.plan || 'Starter';
  return PLAN_FEATURES[plan] || PLAN_FEATURES.Starter;
}

function hasFeature(feature) {
  if (!checkLicense()) return false;
  const features = getCachedFeatures();
  if (features.includes('*')) return true;
  return features.includes(feature);
}

function getLicenseStatus() {
  const cache = loadCache();
  if (!cache) return { valid: false, reason: 'not_configured', plan: null };
  return {
    valid: checkLicense(),
    reason: cache.reason,
    plan: cache.plan || null,
    checked_at: cache.checked_at || cache.last_verified_at,
    last_verified_at: cache.last_verified_at,
    grace_until: cache.grace_until
  };
}

async function validateWithServer(key, domain) {
  const serverUrl = process.env.LICENSE_SERVER_URL || 'https://nxl.xus.me/api';
  const now = Date.now();

  try {
    const res = await fetch(serverUrl + '/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, domain }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();

    if (!verifyLocalCacheSignature(data)) {
      console.error('[License] WARNING: Response signature verification failed — possible spoofing attempt');
      saveCache({
        valid: false,
        key: key,
        reason: 'invalid_signature',
        plan: null,
        features: [],
        next_check: now + 300000,
        checked_at: new Date().toISOString(),
        last_verified_at: null,
        grace_until: 0,
        max_observed_time: now
      });
      return false;
    }

    if (data.valid) {
      const plan = data.license?.plan || 'Starter';
      const features = PLAN_FEATURES[plan] || PLAN_FEATURES.Starter;
      const lastVerified = data.server_time || new Date().toISOString();
      const graceUntil = new Date(lastVerified).getTime() + GRACE_PERIOD_MS;

      saveCache({
        valid: true,
        key: key,
        boundDomain: domain || null,
        plan: plan,
        features: features,
        issued_to: data.license?.issued_to || '',
        expires_at: data.license?.expires_at || null,
        reason: null,
        next_check: now + REVALIDATION_INTERVAL_MS,
        checked_at: new Date().toISOString(),
        last_verified_at: lastVerified,
        grace_until: graceUntil,
        max_observed_time: now
      });
      console.log(`[License] Validated & signed (${plan} plan). Next check in 60 minutes.`);
      return true;
    } else {
      const cache = loadCache();
      if (cache?.valid && cache.grace_until && now < cache.grace_until) {
        console.warn('[License] Failed re-validation but operating within 72h grace period. Reason:', data.reason);
        return true;
      }
      saveCache({
        valid: false,
        key: key,
        plan: null,
        features: [],
        reason: data.reason || 'unknown',
        next_check: now + 300000,
        checked_at: new Date().toISOString(),
        last_verified_at: null,
        grace_until: 0,
        max_observed_time: now
      });
      console.error('[License] Validation failed. Reason:', data.reason);
      return false;
    }
  } catch (err) {
    console.error('[License] Network error connecting to license server:', err.message);
    const cache = loadCache();
    if (cache?.valid && cache.last_verified_at) {
      const graceUntil = cache.grace_until || (new Date(cache.last_verified_at).getTime() + GRACE_PERIOD_MS);
      if (now < graceUntil) {
        saveCache({
          ...cache,
          grace_until: graceUntil,
          next_check: now + 300000,
          max_observed_time: Math.max(cache.max_observed_time || 0, now)
        });
        console.warn('[License] Network unreachable, running under 72h grace window until:', new Date(graceUntil).toISOString());
        return true;
      }
    }
    saveCache({
      valid: false,
      key: key,
      plan: null,
      features: [],
      reason: 'network_error',
      next_check: now + 300000,
      checked_at: new Date().toISOString(),
      last_verified_at: null,
      grace_until: 0,
      max_observed_time: now
    });
    return false;
  }
}

async function bootstrapLicense() {
  const key = process.env.LICENSE_KEY;
  const domain = process.env.LICENSE_DOMAIN;

  if (!key) {
    console.warn('[License] LICENSE_KEY not set.');
    saveCache({
      valid: false,
      key: '',
      plan: null,
      features: [],
      reason: 'not_configured',
      next_check: 0,
      checked_at: new Date().toISOString(),
      last_verified_at: null,
      grace_until: 0,
      max_observed_time: Date.now()
    });
    return false;
  }

  if (!domain) {
    console.warn('[License] LICENSE_DOMAIN not set.');
    saveCache({
      valid: false,
      key: key,
      plan: null,
      features: [],
      reason: 'no_domain',
      next_check: 0,
      checked_at: new Date().toISOString(),
      last_verified_at: null,
      grace_until: 0,
      max_observed_time: Date.now()
    });
    return false;
  }

  return await validateWithServer(key, domain);
}

let revalidationPending = false;
async function triggerRevalidation() {
  if (revalidationPending) return;
  revalidationPending = true;
  try {
    const key = process.env.LICENSE_KEY;
    const domain = process.env.LICENSE_DOMAIN;
    if (key && domain) {
      await validateWithServer(key, domain);
    }
  } catch (err) {
    console.error('[License] Background revalidation error:', err.message);
  } finally {
    revalidationPending = false;
  }
}

function startRevalidationTimer() {
  if (revalidationTimer) clearInterval(revalidationTimer);
  revalidationTimer = setInterval(() => { triggerRevalidation(); }, REVALIDATION_INTERVAL_MS);
}

module.exports = {
  bootstrapLicense,
  validateWithServer,
  checkLicense,
  getLicenseStatus,
  getPlan,
  getCachedFeatures,
  hasFeature,
  signCachePayload,
  verifyLocalCacheSignature,
  loadCache,
  saveCache,
  startRevalidationTimer,
  PLAN_FEATURES,
  GRACE_PERIOD_MS
};
