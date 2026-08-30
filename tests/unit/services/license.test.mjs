import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const licenseService = require('../../../src/services/license');
const licenseMiddleware = require('../../../src/middleware/license');

const CACHE_FILE = path.join(__dirname, '..', '..', '..', 'data', 'license-cache.json');
let originalCache = null;

describe('License Service & Cryptographic Integrity', () => {
  beforeEach(() => {
    if (fs.existsSync(CACHE_FILE)) {
      try { originalCache = fs.readFileSync(CACHE_FILE, 'utf8'); } catch (_) {}
    }
  });

  afterEach(() => {
    if (originalCache !== null) {
      try { fs.writeFileSync(CACHE_FILE, originalCache, 'utf8'); } catch (_) {}
    } else if (fs.existsSync(CACHE_FILE)) {
      try { fs.unlinkSync(CACHE_FILE); } catch (_) {}
    }
  });

  it('generates valid cryptographic signatures for cache payloads', () => {
    const payload = {
      valid: true,
      key: 'NX-TEST-KEY-1234',
      plan: 'Starter',
      last_verified_at: new Date().toISOString(),
      grace_until: Date.now() + 259200000
    };

    const signed = licenseService.signCachePayload(payload);
    expect(signed.signature).toBeDefined();
    expect(typeof signed.signature).toBe('string');
    expect(licenseService.verifyLocalCacheSignature(signed)).toBe(true);
  });

  it('detects tampering when cache contents are modified without matching HMAC', () => {
    const payload = {
      valid: true,
      key: 'NX-TEST-KEY-1234',
      plan: 'Starter',
      last_verified_at: new Date().toISOString(),
      grace_until: Date.now() + 259200000
    };

    const signed = licenseService.signCachePayload(payload);
    // Tamper with plan
    const tampered = { ...signed, plan: 'Enterprise' };
    expect(licenseService.verifyLocalCacheSignature(tampered)).toBe(false);

    // Write tampered cache to disk
    fs.writeFileSync(CACHE_FILE, JSON.stringify(tampered));
    const loaded = licenseService.loadCache();
    expect(loaded.valid).toBe(false);
    expect(loaded.reason).toBe('tampered_cache');
  });

  it('honors 72-hour offline grace period when signature is valid', () => {
    const now = Date.now();
    const payload = {
      valid: true,
      key: 'NX-TEST-KEY-1234',
      plan: 'Pro',
      last_verified_at: new Date(now - 3600000).toISOString(), // 1 hr ago
      grace_until: now + (71 * 3600000), // 71 hrs remaining
      next_check: now + 3600000,
      max_observed_time: now
    };

    licenseService.saveCache(payload);
    expect(licenseService.checkLicense()).toBe(true);
  });

  it('rejects expired grace period (>72 hours without ping)', () => {
    const now = Date.now();
    const payload = {
      valid: true,
      key: 'NX-TEST-KEY-1234',
      plan: 'Starter',
      last_verified_at: new Date(now - (80 * 3600000)).toISOString(),
      grace_until: now - (8 * 3600000), // expired 8 hrs ago
      next_check: now - 3600000,
      max_observed_time: now - 3600000
    };

    licenseService.saveCache(payload);
    expect(licenseService.checkLicense()).toBe(false);
  });

  it('detects clock tampering when system clock is wound backwards', () => {
    const now = Date.now();
    const payload = {
      valid: true,
      key: 'NX-TEST-KEY-1234',
      plan: 'Starter',
      last_verified_at: new Date(now + 86400000).toISOString(), // Future timestamp
      grace_until: now + (100 * 3600000),
      next_check: now + 3600000,
      max_observed_time: now + 86400000 // Watermark in the future
    };

    licenseService.saveCache(payload);
    expect(licenseService.checkLicense()).toBe(false);
  });

  it('enforces plan-based feature resolution', () => {
    const now = Date.now();
    // 1. Starter Plan
    licenseService.saveCache({
      valid: true,
      key: 'NX-STARTER',
      plan: 'Starter',
      last_verified_at: new Date().toISOString(),
      grace_until: now + 259200000,
      max_observed_time: now
    });
    expect(licenseService.hasFeature('domains')).toBe(true);
    expect(licenseService.hasFeature('ssl')).toBe(true);
    expect(licenseService.hasFeature('docker')).toBe(false);
    expect(licenseService.hasFeature('backups')).toBe(false);

    // 2. Pro Plan
    licenseService.saveCache({
      valid: true,
      key: 'NX-PRO',
      plan: 'Pro',
      last_verified_at: new Date().toISOString(),
      grace_until: now + 259200000,
      max_observed_time: now
    });
    expect(licenseService.hasFeature('docker')).toBe(true);
    expect(licenseService.hasFeature('backups')).toBe(true);
    expect(licenseService.hasFeature('git_deploy')).toBe(true);
  });
});

describe('License Middleware Enforcement', () => {
  it('returns HTTP 402 when license is missing or invalid', () => {
    // Invalidate cache
    licenseService.saveCache({
      valid: false,
      reason: 'invalid_key',
      grace_until: 0
    });

    const req = { path: '/api/domains', headers: { accept: 'application/json' } };
    let statusSent = null;
    let jsonSent = null;
    const res = {
      status(code) { statusSent = code; return this; },
      json(data) { jsonSent = data; return this; }
    };
    let nextCalled = false;
    licenseMiddleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(statusSent).toBe(402);
    expect(jsonSent.code).toBe('LICENSE_REQUIRED');
  });

  it('returns HTTP 403 when Starter plan accesses restricted docker or backups route', () => {
    const now = Date.now();
    licenseService.saveCache({
      valid: true,
      key: 'NX-STARTER',
      plan: 'Starter',
      last_verified_at: new Date().toISOString(),
      grace_until: now + 259200000,
      max_observed_time: now
    });

    const req = { path: '/api/docker/containers', headers: { accept: 'application/json' } };
    let statusSent = null;
    let jsonSent = null;
    const res = {
      status(code) { statusSent = code; return this; },
      json(data) { jsonSent = data; return this; }
    };
    let nextCalled = false;
    licenseMiddleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(false);
    expect(statusSent).toBe(403);
    expect(jsonSent.code).toBe('FEATURE_RESTRICTED');
    expect(jsonSent.required_feature).toBe('docker');
    expect(jsonSent.current_plan).toBe('Starter');
  });

  it('allows Pro plan to access /api/docker routes', () => {
    const now = Date.now();
    licenseService.saveCache({
      valid: true,
      key: 'NX-PRO',
      plan: 'Pro',
      last_verified_at: new Date().toISOString(),
      grace_until: now + 259200000,
      max_observed_time: now
    });

    const req = { path: '/api/docker/containers', headers: { accept: 'application/json' } };
    let nextCalled = false;
    const res = { status() { return this; }, json() { return this; } };
    licenseMiddleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });
});
