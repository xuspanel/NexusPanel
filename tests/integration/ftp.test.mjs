import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, createTestApp, makeAdminToken, authCookie } from '../helpers/setup.mjs';

describe('FTP Routes', () => {
  let app, adminCookie;
  beforeAll(() => {
    setupTestEnv();
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
  });

  it('GET /api/ftp/status returns FTP status', async () => {
    const res = await request(app).get('/api/ftp/status').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });

  it('rejects unauthenticated FTP request', async () => {
    const res = await request(app).get('/api/ftp/status');
    expect(res.status).toBe(401);
  });
});
