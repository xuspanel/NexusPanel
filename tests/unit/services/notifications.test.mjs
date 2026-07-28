import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import { setupTestEnv } from '../../helpers/setup.mjs';

const require = createRequire(import.meta.url);

describe('notifications service', () => {
  beforeAll(() => { setupTestEnv(); });

  it('adds a notification', () => {
    const notif = require('../../../src/services/notifications.js');
    const entry = notif.add('info', 'Vitest Test', 'Test message from vitest');
    expect(entry.id).toMatch(/^n_/);
    expect(entry.type).toBe('info');
    expect(entry.title).toBe('Vitest Test');
    expect(entry.read).toBe(false);
  });

  it('lists notifications', () => {
    const notif = require('../../../src/services/notifications.js');
    const result = notif.list(false);
    expect(result).toHaveProperty('entries');
    expect(result).toHaveProperty('unread');
    expect(Array.isArray(result.entries)).toBe(true);
  });

  it('marks all as read', () => {
    const notif = require('../../../src/services/notifications.js');
    notif.markAllRead();
    const result = notif.list(false);
    expect(result.unread).toBe(0);
  });
});
