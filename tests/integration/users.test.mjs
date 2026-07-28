import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, createTestApp, makeAdminToken, makeUserToken, authCookie } from '../helpers/setup.mjs';

describe('Users Routes', () => {
  let app, adminCookie, userCookie;
  beforeAll(() => {
    setupTestEnv();
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
    userCookie = authCookie(makeUserToken());
  });

  it('GET /api/users/list returns user list (admin)', async () => {
    const res = await request(app).get('/api/users/list').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('users');
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it('GET /api/users/list rejects non-admin', async () => {
    const res = await request(app).get('/api/users/list').set('Cookie', userCookie);
    expect(res.status).toBe(403);
  });

  it('GET /api/users/meta/options returns groups and shells', async () => {
    const res = await request(app).get('/api/users/meta/options').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('groups');
    expect(res.body).toHaveProperty('shells');
  });

  it('GET /api/users/:username returns user details for system user', async () => {
    const res = await request(app).get('/api/users/root').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('username');
  });

  it('GET /api/users/:username returns 404 for non-existent user', async () => {
    const res = await request(app).get('/api/users/nonexistent_xyz_999').set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated users request', async () => {
    const res = await request(app).get('/api/users/list');
    expect(res.status).toBe(401);
  });
});
