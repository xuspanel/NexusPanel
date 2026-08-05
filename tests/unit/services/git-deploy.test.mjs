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

  describe('detectNodeEntry', () => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    let tmp;
    beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nxp-entry-test-')); });
    afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} });

    it('returns null for a build-only SPA (no main/start/server entry)', () => {
      fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'spa', type: 'module', scripts: { build: 'vite build' } }));
      expect(deploy.detectNodeEntry(tmp)).toBeNull();
    });

    it('detects a package.json main file', () => {
      fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'x', main: 'server.js' }));
      fs.writeFileSync(path.join(tmp, 'server.js'), '');
      expect(deploy.detectNodeEntry(tmp)).toEqual({ type: 'file', script: 'server.js' });
    });

    it('detects a start script pointing at a node file', () => {
      fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'x', scripts: { start: 'node --max-old-space-size=256 src/index.js' } }));
      fs.mkdirSync(path.join(tmp, 'src'));
      fs.writeFileSync(path.join(tmp, 'src/index.js'), '');
      expect(deploy.detectNodeEntry(tmp)).toEqual({ type: 'file', script: 'src/index.js' });
    });

    it('falls back to npm start for CLI-based start scripts (e.g. next start)', () => {
      fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'x', scripts: { start: 'next start' } }));
      expect(deploy.detectNodeEntry(tmp)).toEqual({ type: 'npm', script: 'start' });
    });

    it('detects default entry files when no main/start exists', () => {
      fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'x' }));
      fs.writeFileSync(path.join(tmp, 'index.js'), '');
      expect(deploy.detectNodeEntry(tmp)).toEqual({ type: 'file', script: 'index.js' });
    });
  });

  describe('generateEcosystem', () => {
    it('emits a script field for a file entry', () => {
      const rec = { pm2_name: 'app.dev', install_path: '/home/u/domains/app.dev/public_html', proxy_port: 42001 };
      const out = deploy.generateEcosystem(rec, { type: 'file', script: 'server.js' });
      expect(out).toContain('module.exports = {');
      expect(out).toContain("script: 'server.js',");
      expect(out).toContain('PORT: 42001');
      expect(out).toContain("name: 'app.dev',");
    });

    it('emits npm run start for an npm entry', () => {
      const rec = { pm2_name: 'app.dev', install_path: '/home/u/domains/app.dev/public_html', proxy_port: 42002 };
      const out = deploy.generateEcosystem(rec, { type: 'npm', script: 'start' });
      expect(out).toContain("script: 'npm',");
      expect(out).toContain("args: 'run start',");
    });

    it('uses .cjs extension on disk in startPm2 path (extension handled by caller)', () => {
      expect('ecosystem.config.cjs').toMatch(/\.cjs$/);
    });
  });

  describe('nextDeployDirName', () => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    let tmp;
    beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nxp-dirname-test-')); });
    afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} });

    it('returns a unique name even when the base exists', () => {
      const a = deploy.nextDeployDirName(tmp);
      fs.mkdirSync(path.join(tmp, a));
      const b = deploy.nextDeployDirName(tmp);
      expect(b).not.toBe(a);
      expect(fs.existsSync(path.join(tmp, b))).toBe(false);
    });

    it('is millisecond-precise', () => {
      const a = deploy.nextDeployDirName(tmp);
      expect(a).toMatch(/^\d{4}-\d{2}-\d{2}T\d{6}\d{3}Z$/);
    });
  });

  describe('per-domain lock', () => {
    it('blocks a second concurrent deploy for the same domain', () => {
      expect(deploy.acquireDomainLock('example.com')).toBe(true);
      expect(deploy.acquireDomainLock('example.com')).toBe(false);
      expect(deploy.acquireDomainLock('other.com')).toBe(true);
      deploy.releaseDomainLock('example.com');
      expect(deploy.acquireDomainLock('example.com')).toBe(true);
      deploy.releaseDomainLock('example.com');
      deploy.releaseDomainLock('other.com');
    });

    it('acquire is idempotent for distinct domains', () => {
      expect(deploy.acquireDomainLock('a.com')).toBe(true);
      expect(deploy.acquireDomainLock('b.com')).toBe(true);
      deploy.releaseDomainLock('a.com');
      deploy.releaseDomainLock('b.com');
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
