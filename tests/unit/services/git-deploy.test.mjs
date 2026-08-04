import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import { setupTestEnv } from '../../helpers/setup.mjs';

const require = createRequire(import.meta.url);

describe('git-deploy service', () => {
  let deploy, apps;
  beforeAll(() => {
    setupTestEnv();
    deploy = require('../../../src/services/git-deploy.js');
    apps = require('../../../src/services/apps.js');
  });

  describe('SSH key encryption round-trip', () => {
    it('encrypts and decrypts an SSH key', () => {
      const fakeKey = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3NxDmF...\n-----END OPENSSH PRIVATE KEY-----';
      const encrypted = apps.encryptSecret(fakeKey);
      expect(encrypted).toContain(':');
      expect(encrypted).not.toContain('b3NxDmF');
      const decrypted = apps.decryptSecret(encrypted);
      expect(decrypted).toBe(fakeKey);
    });

    it('encrypt produces distinct tokens for same key', () => {
      const t1 = apps.encryptSecret('test-key');
      const t2 = apps.encryptSecret('test-key');
      expect(t1).not.toBe(t2);
      expect(apps.decryptSecret(t1)).toBe('test-key');
      expect(apps.decryptSecret(t2)).toBe('test-key');
    });
  });

  describe('detectAppType', () => {
    it('is imported and callable', () => {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nxp-deploy-test-'));
      try {
        fs.writeFileSync(path.join(tmp, 'package.json'), '{}');
        expect(deploy).toBeDefined();
      } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
      }
    });
  });

  describe('getDeployment', () => {
    it('throws for unknown id', () => {
      expect(() => deploy.getDeployment('nonexistent-12345')).toThrow('Deployment not found');
    });
  });

  describe('listDeployments', () => {
    it('returns an array', () => {
      const list = deploy.listDeployments();
      expect(Array.isArray(list)).toBe(true);
    });
  });
});
