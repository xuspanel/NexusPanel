import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, createTestApp, makeAdminToken, makeUserToken, authCookie } from '../helpers/setup.mjs';

describe('Auth Routes', () => {
  let app, adminCookie;
  beforeAll(() => {
    setupTestEnv();
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
  });

  it('GET /api/auth/me returns user info with valid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('username');
    expect(res.body.username).toBe('admin');
  });

  it('GET /api/auth/me returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/login with invalid credentials returns 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/logout succeeds', async () => {
    const res = await request(app).post('/api/auth/logout').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });
});
