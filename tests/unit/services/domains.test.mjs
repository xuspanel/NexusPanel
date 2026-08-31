import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import { setupTestEnv } from '../../helpers/setup.mjs';

const require = createRequire(import.meta.url);

describe('domains service', () => {
  beforeAll(() => { setupTestEnv(); });

  it('returns domain list', () => {
    const domains = require('../../../src/services/domains.js');
    const result = domains.listDomains({});
    expect(result).toHaveProperty('domains');
    expect(Array.isArray(result.domains)).toBe(true);
  });

  it('getDomain returns existing domain or throws', () => {
    const domains = require('../../../src/services/domains.js');
    const result = domains.listDomains({});
    if (result.domains.length > 0) {
      const first = result.domains[0];
      const d = domains.getDomain(first.domain || first.name);
      expect(d).toBeDefined();
    }
  });

  it('throws for non-existent domain', () => {
    const domains = require('../../../src/services/domains.js');
    expect(() => domains.getDomain('nonexistent_xyz_' + Date.now() + '.com')).toThrow();
  });

  it('findNextFreePort returns the first free port in range', () => {
    const domains = require('../../../src/services/domains.js');
    expect(domains.findNextFreePort(new Set([8000]), 8000, 9000)).toBe(8001);
    expect(domains.findNextFreePort(new Set([8000, 8001, 8002]), 8000, 9000)).toBe(8003);
    expect(domains.findNextFreePort(new Set(), 8000, 9000)).toBe(8000);
  });

  it('findNextFreePort skips ports used by other ranges', () => {
    const domains = require('../../../src/services/domains.js');
    const used = new Set([8000, 8100, 9000]);
    const port = domains.findNextFreePort(used, 8000, 9000);
    expect(used.has(port)).toBe(false);
  });

  it('findNextFreePort throws when the range is exhausted', () => {
    const domains = require('../../../src/services/domains.js');
    const full = new Set();
    for (let p = 8000; p <= 9000; p++) full.add(p);
    expect(() => domains.findNextFreePort(full, 8000, 9000)).toThrow(/No available ports/);
  });

  it('findAvailablePort finds an open port via live TCP network check', async () => {
    const domains = require('../../../src/services/domains.js');
    const port = await domains.findAvailablePort(8000, 9000);
    expect(typeof port).toBe('number');
    expect(port).toBeGreaterThanOrEqual(8000);
    expect(port).toBeLessThanOrEqual(9000);
  });

  it('createDomain rejects subdomain without a parent before writing anything', async () => {
    const domains = require('../../../src/services/domains.js');
    await expect(domains.createDomain('subdomain', 'no-parent-' + Date.now() + '.example.com', { ssl: false }))
      .rejects.toThrow(/parent domain/i);
  });

  it('createDomain rejects reserved web ports 80 and 443 with security violation', async () => {
    const domains = require('../../../src/services/domains.js');
    await expect(domains.createDomain('domain', 'reserved-port-' + Date.now() + '.com', { port: 443, ssl: false }))
      .rejects.toThrow(/Security Violation: Cannot proxy backend to reserved web ports/i);

    await expect(domains.createDomain('domain', 'reserved-port-80-' + Date.now() + '.com', { port: 80, ssl: false }))
      .rejects.toThrow(/Security Violation: Cannot proxy backend to reserved web ports/i);
  });

  it('writeNginxConf and generateAppNginxConf enforce proxy port guardrails', () => {
    const domains = require('../../../src/services/domains.js');
    expect(() => domains.generateAppNginxConf('test.com', 443, false))
      .toThrow(/Security Violation/i);
    expect(() => domains.generateAppNginxConf('test.com', 80, false))
      .toThrow(/Security Violation/i);
  });

  it('generateNginxConf generates static vs reverse proxy templates based on siteType', () => {
    const domains = require('../../../src/services/domains.js');
    const staticConf = domains.generateNginxConf('static.example.com', null, false, 'domain', { siteType: 'static' });
    expect(staticConf).toContain('try_files $uri $uri/ =404;');
    expect(staticConf).not.toContain('proxy_pass');

    const proxyConf = domains.generateNginxConf('proxy.example.com', 8080, false, 'domain', { siteType: 'proxy' });
    expect(proxyConf).toContain('proxy_pass http://127.0.0.1:8080;');
    expect(proxyConf).toContain('proxy_set_header Upgrade $http_upgrade;');
    expect(proxyConf).toContain("proxy_set_header Connection 'upgrade';");
    expect(proxyConf).toContain('proxy_cache_bypass $http_upgrade;');
  });

  it('persists siteType and assigned port correctly in domain store and sanitizeDomain', () => {
    const domains = require('../../../src/services/domains.js');
    const proxyDomain = {
      type: 'domain',
      siteType: 'proxy',
      port: 8555,
      root: '/var/www/proxy.com',
      sslEnabled: false,
    };
    const sanitizedProxy = domains.sanitizeDomain(proxyDomain, 'proxy.com');
    expect(sanitizedProxy.siteType).toBe('proxy');
    expect(sanitizedProxy.port).toBe(8555);

    const staticDomain = {
      type: 'domain',
      siteType: 'static',
      port: null,
      root: '/var/www/static.com',
      sslEnabled: false,
    };
    const sanitizedStatic = domains.sanitizeDomain(staticDomain, 'static.com');
    expect(sanitizedStatic.siteType).toBe('static');
    expect(sanitizedStatic.port).toBeNull();
  });
});
