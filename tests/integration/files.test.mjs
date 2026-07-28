import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, createTestApp, makeAdminToken, authCookie } from '../helpers/setup.mjs';

describe('Files Routes', () => {
  let app, adminCookie;
  beforeAll(() => {
    setupTestEnv();
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
  });

  it('GET /api/files/list requires auth', async () => {
    const res = await request(app).get('/api/files/list?path=/');
    expect(res.status).toBe(401);
  });

  it('GET /api/files/list returns directory listing', async () => {
    const res = await request(app).get('/api/files/list?path=' + encodeURIComponent('/root/NexusPanel')).set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('entries');
  });

  it('POST /api/files/create requires name and parentPath', async () => {
    const res = await request(app).post('/api/files/create').set('Cookie', adminCookie).send({});
    expect(res.status).toBe(400);
  });
});
