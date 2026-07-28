import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, createTestApp, makeAdminToken, authCookie } from '../helpers/setup.mjs';

describe('PHP-FPM Routes', () => {
  let app, adminCookie;
  beforeAll(() => {
    setupTestEnv();
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
  });

  it('GET /api/phpfpm/ returns PHP-FPM status', async () => {
    const res = await request(app).get('/api/phpfpm/').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });

  it('rejects unauthenticated PHP-FPM request', async () => {
    const res = await request(app).get('/api/phpfpm/');
    expect(res.status).toBe(401);
  });
});
