import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { createRequire } from 'module';
import { setupTestEnv } from '../../helpers/setup.mjs';

const require = createRequire(import.meta.url);

describe('authMiddleware', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-nexuspanel-tests-2026';
  beforeAll(() => { setupTestEnv(); });

  it('rejects requests with no token', async () => {
    const { authMiddleware } = require('../../../src/middleware/auth.js');
    const req = { cookies: {}, headers: {} };
    let statusCode, responseBody;
    const res = {
      status(code) { statusCode = code; return this; },
      json(body) { responseBody = body; },
    };
    await authMiddleware(req, res, () => {});
    expect(statusCode).toBe(401);
    expect(responseBody.error).toBe('Unauthorized');
  });

  it('accepts valid JWT cookie', async () => {
    const { authMiddleware } = require('../../../src/middleware/auth.js');
    const token = jwt.sign({ username: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
    const req = { cookies: { token }, headers: {}, method: 'GET' };
    let called = false;
    const res = { status() { return this; }, json() {} };
    await authMiddleware(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(req.user.username).toBe('admin');
    expect(req.user.role).toBe('admin');
  });

  it('rejects expired JWT', async () => {
    const { authMiddleware } = require('../../../src/middleware/auth.js');
    const token = jwt.sign({ username: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '-1h' });
    const req = { cookies: { token }, headers: {} };
    let statusCode;
    const res = { status(code) { statusCode = code; return this; }, json() {} };
    await authMiddleware(req, res, () => {});
    expect(statusCode).toBe(401);
  });

  it('rejects invalid cookie token', async () => {
    const { authMiddleware } = require('../../../src/middleware/auth.js');
    const req = { cookies: { token: 'invalid.jwt.token' }, headers: {} };
    let statusCode;
    const res = { status(code) { statusCode = code; return this; }, json() {} };
    await authMiddleware(req, res, () => {});
    expect(statusCode).toBe(401);
  });
});

describe('adminOnly', () => {
  it('allows admin users', () => {
    const { adminOnly } = require('../../../src/middleware/auth.js');
    const req = { user: { role: 'admin' } };
    let called = false;
    const res = { status() { return this; }, json() {} };
    adminOnly(req, res, () => { called = true; });
    expect(called).toBe(true);
  });

  it('rejects non-admin users', () => {
    const { adminOnly } = require('../../../src/middleware/auth.js');
    const req = { user: { role: 'user' } };
    let statusCode, body;
    const res = { status(code) { statusCode = code; return this; }, json(b) { body = b; } };
    adminOnly(req, res, () => {});
    expect(statusCode).toBe(403);
    expect(body.error).toContain('Admin');
  });

  it('rejects users with no role', () => {
    const { adminOnly } = require('../../../src/middleware/auth.js');
    const req = { user: {} };
    let statusCode;
    const res = { status(code) { statusCode = code; return this; }, json() {} };
    adminOnly(req, res, () => {});
    expect(statusCode).toBe(403);
  });
});
