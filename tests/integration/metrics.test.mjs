import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, createTestApp, makeAdminToken, authCookie } from '../helpers/setup.mjs';

describe('Metrics Routes', () => {
  let app, adminCookie;
  beforeAll(() => {
    setupTestEnv();
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
  });

  it('GET /api/metrics/current returns current metrics', async () => {
    const res = await request(app).get('/api/metrics/current').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('cpu');
  });

  it('rejects unauthenticated metrics request', async () => {
    const res = await request(app).get('/api/metrics/current');
    expect(res.status).toBe(401);
  });
});
