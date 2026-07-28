import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, createTestApp, makeAdminToken, authCookie } from '../helpers/setup.mjs';

describe('Tokens Routes', () => {
  let app, adminCookie;
  beforeAll(() => {
    setupTestEnv();
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
  });

  it('GET /api/tokens/ lists tokens', async () => {
    const res = await request(app).get('/api/tokens/').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/tokens/ creates token', async () => {
    const res = await request(app).post('/api/tokens/').set('Cookie', adminCookie).send({ label: 'Test Token', scope: 'read' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.token).toMatch(/^npt_/);
    await request(app).delete('/api/tokens/' + res.body.id).set('Cookie', adminCookie);
  });

  it('rejects unauthenticated token request', async () => {
    const res = await request(app).get('/api/tokens/');
    expect(res.status).toBe(401);
  });
});
