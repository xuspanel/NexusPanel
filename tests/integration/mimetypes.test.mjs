import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, createTestApp, makeAdminToken, authCookie } from '../helpers/setup.mjs';

describe('MIME Types Routes', () => {
  let app, adminCookie;
  beforeAll(() => {
    setupTestEnv();
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
  });

  it('GET /api/mimetypes/system returns system types', async () => {
    const res = await request(app).get('/api/mimetypes/system').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(res.body).toHaveProperty('categories');
  });

  it('GET /api/mimetypes/ returns user types', async () => {
    const res = await request(app).get('/api/mimetypes/').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects unauthenticated mime request', async () => {
    const res = await request(app).get('/api/mimetypes/system');
    expect(res.status).toBe(401);
  });
});
