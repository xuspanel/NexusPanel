import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, createTestApp, makeAdminToken, authCookie } from '../helpers/setup.mjs';

describe('Virus Scanner Routes', () => {
  let app, adminCookie;
  beforeAll(() => {
    setupTestEnv();
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
  });

  it('GET /api/virusscanner/status returns status', async () => {
    const res = await request(app).get('/api/virusscanner/status').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });

  it('rejects unauthenticated scanner request', async () => {
    const res = await request(app).get('/api/virusscanner/status');
    expect(res.status).toBe(401);
  });
});
