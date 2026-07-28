import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import { setupTestEnv } from '../../helpers/setup.mjs';

const require = createRequire(import.meta.url);

describe('audit service', () => {
  beforeAll(() => { setupTestEnv(); });

  it('logs entries with correct structure', () => {
    const audit = require('../../../src/services/audit.js');
    const entry = audit.log('vitest.log', { user: { username: 'admin', role: 'admin' }, ip: '127.0.0.1', method: 'GET', originalUrl: '/test' }, { detail: 'vitest' });
    expect(entry.id).toMatch(/^a_/);
    expect(entry.user).toBe('admin');
    expect(entry.action).toBe('vitest.log');
  });

  it('queries entries', () => {
    const audit = require('../../../src/services/audit.js');
    const result = audit.query({ limit: 10 });
    expect(result).toHaveProperty('entries');
    expect(result).toHaveProperty('total');
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it('returns distinct actions', () => {
    const audit = require('../../../src/services/audit.js');
    const actions = audit.getActions();
    expect(Array.isArray(actions)).toBe(true);
  });

  it('returns distinct users', () => {
    const audit = require('../../../src/services/audit.js');
    const users = audit.getUsers();
    expect(Array.isArray(users)).toBe(true);
  });

  it('returns stats', () => {
    const audit = require('../../../src/services/audit.js');
    const stats = audit.getStats();
    expect(stats).toHaveProperty('total');
  });

  it('exports all entries', () => {
    const audit = require('../../../src/services/audit.js');
    const entries = audit.exportAll();
    expect(Array.isArray(entries)).toBe(true);
  });
});
