import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, createTestApp, makeAdminToken, authCookie } from '../helpers/setup.mjs';

describe('Alerts Routes', () => {
  let app, adminCookie;
  beforeAll(() => {
    setupTestEnv();
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
  });

  it('GET /api/alerts/config returns alert config', async () => {
    const res = await request(app).get('/api/alerts/config').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });

  it('rejects unauthenticated alerts request', async () => {
    const res = await request(app).get('/api/alerts/config');
    expect(res.status).toBe(401);
  });
});
