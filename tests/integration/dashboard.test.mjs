import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, createTestApp, makeAdminToken, authCookie } from '../helpers/setup.mjs';

describe('Dashboard Routes', () => {
  let app, adminCookie;
  beforeAll(() => {
    setupTestEnv();
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
  });

  it('GET /api/system/stats returns system stats', async () => {
    const res = await request(app).get('/api/system/stats').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('memory');
    expect(res.body).toHaveProperty('disk');
    expect(res.body).toHaveProperty('cpuCores');
  });

  it('GET /api/system/service-health returns service health', async () => {
    const res = await request(app).get('/api/system/service-health').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/system/quick-stats returns quick stats', async () => {
    const res = await request(app).get('/api/system/quick-stats').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });

  it('rejects unauthenticated dashboard request', async () => {
    const res = await request(app).get('/api/system/stats');
    expect(res.status).toBe(401);
  });
});
