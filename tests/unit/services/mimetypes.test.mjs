import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import { setupTestEnv } from '../../helpers/setup.mjs';

const require = createRequire(import.meta.url);

describe('mimetypes service', () => {
  beforeAll(() => { setupTestEnv(); });

  it('returns system MIME types (object)', () => {
    const mime = require('../../../src/services/mimetypes.js');
    const types = mime.getSystemTypes();
    expect(types).toBeDefined();
  });

  it('returns user MIME types (array)', () => {
    const mime = require('../../../src/services/mimetypes.js');
    const types = mime.getUserTypes();
    expect(Array.isArray(types)).toBe(true);
  });

  it('creates and deletes a user MIME type', () => {
    const mime = require('../../../src/services/mimetypes.js');
    const entry = mime.createUserType({ mimeType: 'application/x-vitest-temp', extensions: ['.vitest'] });
    expect(entry).toHaveProperty('id');
    expect(entry.mimeType).toBe('application/x-vitest-temp');
    const result = mime.deleteUserType(entry.id);
    expect(result.deleted).toBe(true);
  });

  it('returns null for non-existent user type', () => {
    const mime = require('../../../src/services/mimetypes.js');
    const type = mime.getUserType('nonexistent_id_' + Date.now());
    expect(type).toBeNull();
  });
});
