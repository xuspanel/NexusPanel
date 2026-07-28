import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, createTestApp, makeAdminToken, authCookie } from '../helpers/setup.mjs';

describe('Audit Routes', () => {
  let app, adminCookie;
  beforeAll(() => {
    setupTestEnv();
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
  });

  it('GET /api/audit/ returns audit log', async () => {
    const res = await request(app).get('/api/audit/').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('entries');
  });

  it('GET /api/audit/stats returns stats', async () => {
    const res = await request(app).get('/api/audit/stats').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });

  it('rejects unauthenticated audit request', async () => {
    const res = await request(app).get('/api/audit/');
    expect(res.status).toBe(401);
  });
});
