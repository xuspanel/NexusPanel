import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { setupTestEnv } from '../../helpers/setup.mjs';

const require = createRequire(import.meta.url);

describe('apps service internals', () => {
  let apps;
  beforeAll(() => {
    setupTestEnv();
    apps = require('../../../src/services/apps.js');
  });

  describe('encryption', () => {
    it('encryptSecret/decryptSecret round-trips', () => {
      const plain = 's3cr3t-p@ssw0rd-ƒ';
      const token = apps.encryptSecret(plain);
      expect(token).toContain(':');
      expect(token).not.toContain(plain);
      expect(apps.decryptSecret(token)).toBe(plain);
    });

    it('encryptSecret produces distinct tokens for same input', () => {
      const t1 = apps.encryptSecret('same');
      const t2 = apps.encryptSecret('same');
      expect(t1).not.toBe(t2);
      expect(apps.decryptSecret(t1)).toBe('same');
      expect(apps.decryptSecret(t2)).toBe('same');
    });

    it('decryptSecret returns empty for garbage', () => {
      expect(apps.decryptSecret('')).toBe('');
      expect(apps.decryptSecret('not-a-valid-token')).toBe('');
      expect(apps.decryptSecret('a:b:c')).toBe('');
      expect(apps.decryptSecret(undefined)).toBe('');
    });
  });

  describe('password generation', () => {
    it('generates URL-safe passwords of expected length', () => {
      const p = apps._internals.genPassword();
      expect(p).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(p.length).toBeGreaterThanOrEqual(24);
    });
  });

  describe('db identifiers', () => {
    it('makeDbIdent sanitizes and prefixes', () => {
      const id = apps._internals.makeDbIdent('my-app.example.com');
      expect(id).toMatch(/^nxp_myappexample_[0-9a-f]{4}$/);
    });

    it('makeDbIdent falls back for empty input', () => {
      expect(apps._internals.makeDbIdent('!!@@')).toMatch(/^nxp_app_[0-9a-f]{4}$/);
    });
  });

  describe('url building', () => {
    it('buildUrl handles ssl/port combos', () => {
      expect(apps._internals.buildUrl('x.com', 8080, false)).toBe('http://x.com:8080');
      expect(apps._internals.buildUrl('x.com', 80, false)).toBe('http://x.com');
      expect(apps._internals.buildUrl('x.com', 443, true)).toBe('https://x.com');
      expect(apps._internals.buildUrl('x.com', 8443, true)).toBe('https://x.com:8443');
    });
  });

  describe('install path resolution', () => {
    it('accepts a valid user/domain path', () => {
      expect(apps._internals.resolveInstallPath('alice', 'site.example.com'))
        .toBe('/home/alice/domains/site.example.com/public_html');
    });

    it('rejects invalid domain or user', () => {
      expect(() => apps._internals.resolveInstallPath('alice', 'bad_domain!')).toThrow();
      expect(() => apps._internals.resolveInstallPath('../evil', 'ok.com')).toThrow();
      expect(() => apps._internals.resolveInstallPath('root', 'ok.com')).toThrow();
    });
  });

  describe('concurrency slots', () => {
    it('allows max 2 per user then rejects', () => {
      const { acquireInstallSlot, releaseInstallSlot, activeInstalls } = apps._internals;
      activeInstalls.clear();
      expect(acquireInstallSlot('bob')).toBe(true);
      expect(acquireInstallSlot('bob')).toBe(true);
      expect(acquireInstallSlot('bob')).toBe(false);
      releaseInstallSlot('bob');
      expect(acquireInstallSlot('bob')).toBe(true);
      expect(acquireInstallSlot('bob')).toBe(false);
      activeInstalls.clear();
    });

    it('tracks slots per user independently', () => {
      const { acquireInstallSlot, activeInstalls } = apps._internals;
      activeInstalls.clear();
      expect(acquireInstallSlot('carol')).toBe(true);
      expect(acquireInstallSlot('carol')).toBe(true);
      expect(acquireInstallSlot('dave')).toBe(true);
      expect(acquireInstallSlot('carol')).toBe(false);
      expect(acquireInstallSlot('dave')).toBe(true);
      activeInstalls.clear();
    });
  });

  describe('port allocation', () => {
    it('findAppPort returns an integer in the app port range', () => {
      const p = apps._internals.findAppPort();
      expect(Number.isInteger(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(41000);
      expect(p).toBeLessThanOrEqual(49999);
    });
  });

  describe('validation', () => {
    it('rejects unsupported app types', () => {
      expect(() => apps.validateInstall({ app_type: 'phpbb', system_user: 'alice', domain: 'x.com' })).toThrow(/Unsupported/);
      expect(() => apps.validateInstall(null)).toThrow();
      expect(() => apps.validateInstall({})).toThrow(/Unsupported/);
    });

    it('rejects invalid system user / missing domain', () => {
      expect(() => apps.validateInstall({ app_type: 'static', system_user: 'not valid!', domain: 'x.com' })).toThrow(/Invalid system user/);
      expect(() => apps.validateInstall({ app_type: 'static', system_user: 'alice', domain: '' })).toThrow(/Invalid domain/);
    });
  });
});
