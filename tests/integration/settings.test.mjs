import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, createTestApp, makeAdminToken, authCookie } from '../helpers/setup.mjs';

describe('Settings Routes', () => {
  let app, adminCookie;
  beforeAll(() => {
    setupTestEnv();
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
  });

  it('GET /api/settings/ returns settings', async () => {
    const res = await request(app).get('/api/settings/').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('panelName');
  });

  it('GET /api/settings/system-info returns system info', async () => {
    const res = await request(app).get('/api/settings/system-info').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });

  it('rejects unauthenticated settings request', async () => {
    const res = await request(app).get('/api/settings/');
    expect(res.status).toBe(401);
  });
});
