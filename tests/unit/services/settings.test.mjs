import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import { setupTestEnv } from '../../helpers/setup.mjs';

const require = createRequire(import.meta.url);

describe('settings service', () => {
  beforeAll(() => { setupTestEnv(); });

  it('loads settings', () => {
    const settings = require('../../../src/services/settings.js');
    const s = settings.load();
    expect(s).toHaveProperty('panelName');
  });

  it('validates settings correctly', () => {
    const settings = require('../../../src/services/settings.js');
    const errors = settings.validate({ panelName: 'Test Panel Name' });
    expect(errors).toEqual([]);
  });

  it('rejects invalid values', () => {
    const settings = require('../../../src/services/settings.js');
    const errors = settings.validate({ panelName: 'AB' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns system info', () => {
    const settings = require('../../../src/services/settings.js');
    const info = settings.getSystemInfo();
    expect(info).toHaveProperty('hostname');
    expect(info).toHaveProperty('uptime');
    expect(info).toHaveProperty('memory');
  });

  it('returns system health', () => {
    const settings = require('../../../src/services/settings.js');
    const health = settings.getSystemHealth();
    expect(health).toHaveProperty('services');
    expect(health).toHaveProperty('memory');
  });
});
