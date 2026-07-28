import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, createTestApp, makeAdminToken, authCookie } from '../helpers/setup.mjs';

describe('Domains Routes', () => {
  let app, adminCookie;
  beforeAll(() => {
    setupTestEnv();
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
  });

  it('GET /api/domains/ returns domain list', async () => {
    const res = await request(app).get('/api/domains/').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('domains');
  });

  it('GET /api/domains/parents returns parent candidates', async () => {
    const res = await request(app).get('/api/domains/parents').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });

  it('GET /api/domains/ports/available returns suggested port', async () => {
    const res = await request(app).get('/api/domains/ports/available').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });

  it('GET /api/domains/:name returns 404 for non-existent', async () => {
    const res = await request(app).get('/api/domains/nonexistent.com').set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  it('POST /api/domains/create requires domain', async () => {
    const res = await request(app).post('/api/domains/create').set('Cookie', adminCookie).send({ domain: 'not_a_domain' });
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated domain request', async () => {
    const res = await request(app).get('/api/domains/');
    expect(res.status).toBe(401);
  });
});
