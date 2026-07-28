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
});
