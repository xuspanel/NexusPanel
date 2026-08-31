import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, createTestApp, makeAdminToken, authCookie } from '../helpers/setup.mjs';

describe('Services Routes', () => {
  let app, adminCookie;
  beforeAll(() => {
    setupTestEnv();
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
  });

  it('GET /api/services/ returns service list', async () => {
    const res = await request(app).get('/api/services/').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects unauthenticated service request', async () => {
    const res = await request(app).get('/api/services/');
    expect(res.status).toBe(401);
  });

  it('POST /api/system/services/install rejects unauthenticated request', async () => {
    const res = await request(app).post('/api/system/services/install').send({ service: 'nodejs' });
    expect(res.status).toBe(401);
  });

  it('POST /api/system/services/install requires service preset name', async () => {
    const res = await request(app).post('/api/system/services/install').set('Cookie', adminCookie).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('POST /api/system/services/install rejects unknown service preset', async () => {
    const res = await request(app).post('/api/system/services/install').set('Cookie', adminCookie).send({ service: 'invalid_xyz' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unknown service preset/i);
  });
});
