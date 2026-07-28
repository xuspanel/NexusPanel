import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import { setupTestEnv } from '../../helpers/setup.mjs';

const require = createRequire(import.meta.url);

describe('tokens service', () => {
  beforeAll(() => { setupTestEnv(); });

  it('generates a token with correct structure', async () => {
    const tokens = require('../../../src/services/tokens.js');
    const result = await tokens.generate('vitest-user', 'Vitest Token', 'read');
    expect(result.id).toMatch(/^tk_/);
    expect(result.token).toMatch(/^npt_/);
    expect(result.label).toBe('Vitest Token');
    tokens.remove(result.id);
  });

  it('validates a generated token', async () => {
    const tokens = require('../../../src/services/tokens.js');
    const generated = await tokens.generate('vitest-user', 'Validate', 'read');
    const validated = await tokens.validate(generated.token);
    expect(validated).not.toBeNull();
    expect(validated.userId).toBe('vitest-user');
    tokens.remove(generated.id);
  });

  it('rejects invalid token', async () => {
    const tokens = require('../../../src/services/tokens.js');
    const result = await tokens.validate('npt_invalid_token_12345');
    expect(result).toBeNull();
  });

  it('lists tokens for a user', async () => {
    const tokens = require('../../../src/services/tokens.js');
    const list = tokens.list('vitest-user');
    expect(Array.isArray(list)).toBe(true);
  });

  it('returns false when removing non-existent token', () => {
    const tokens = require('../../../src/services/tokens.js');
    const removed = tokens.remove('tk_nonexistent_' + Date.now());
    expect(removed).toBe(false);
  });
});
