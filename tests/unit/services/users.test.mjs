import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import { setupTestEnv } from '../../helpers/setup.mjs';

const require = createRequire(import.meta.url);

describe('users service', () => {
  beforeAll(() => { setupTestEnv(); });

  it('loads panel users', () => {
    const users = require('../../../src/services/users.js');
    const user = users.getPanelUser('admin');
    expect(user).not.toBeNull();
    expect(user.role).toBe('admin');
  });

  it('returns null for non-existent user', () => {
    const users = require('../../../src/services/users.js');
    const user = users.getPanelUser('nonexistent_user_xyz_' + Date.now());
    expect(user).toBeNull();
  });

  it('gets profile summary', () => {
    const users = require('../../../src/services/users.js');
    const summary = users.getProfileSummary('admin');
    expect(summary).not.toBeNull();
    expect(summary.username).toBe('admin');
  });

  it('returns null profile for non-existent user', () => {
    const users = require('../../../src/services/users.js');
    const summary = users.getProfileSummary('ghost_' + Date.now());
    expect(summary).toBeNull();
  });

  it('validates password strength', () => {
    const users = require('../../../src/services/users.js');
    const weak = users.validatePasswordStrength('123');
    expect(weak).toBeTruthy();
  });

  it('validates avatar path helper', () => {
    const users = require('../../../src/services/users.js');
    const avatarPath = users.getAvatarPath('admin');
    expect(typeof avatarPath === 'string' || avatarPath === null).toBe(true);
  });
});
