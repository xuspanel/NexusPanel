import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, createTestApp, makeAdminToken, authCookie } from '../helpers/setup.mjs';

describe('Notifications Routes', () => {
  let app, adminCookie;
  beforeAll(() => {
    setupTestEnv();
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
  });

  it('GET /api/notifications/ returns notifications', async () => {
    const res = await request(app).get('/api/notifications/').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('entries');
    expect(res.body).toHaveProperty('unread');
  });

  it('rejects unauthenticated notification request', async () => {
    const res = await request(app).get('/api/notifications/');
    expect(res.status).toBe(401);
  });
});
