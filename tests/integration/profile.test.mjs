import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, createTestApp, makeAdminToken, authCookie } from '../helpers/setup.mjs';

describe('Profile Routes', () => {
  let app, adminCookie;
  beforeAll(() => {
    setupTestEnv();
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
  });

  it('GET /api/profile/ returns profile', async () => {
    const res = await request(app).get('/api/profile/').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('username');
  });

  it('PUT /api/profile/display-name updates display name', async () => {
    const res = await request(app).put('/api/profile/display-name').set('Cookie', adminCookie).send({ displayName: 'Test Display' });
    expect(res.status).toBe(200);
  });

  it('rejects unauthenticated profile request', async () => {
    const res = await request(app).get('/api/profile/');
    expect(res.status).toBe(401);
  });
});
