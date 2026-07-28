import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, createTestApp, makeAdminToken, authCookie } from '../helpers/setup.mjs';

describe('Search Routes', () => {
  let app, adminCookie;
  beforeAll(() => {
    setupTestEnv();
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
  });

  it('GET /api/search/ returns empty for short query', async () => {
    const res = await request(app).get('/api/search/?q=ab').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });

  it('GET /api/search/ with valid query returns results', async () => {
    const res = await request(app).get('/api/search/?q=root').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('query');
    expect(res.body).toHaveProperty('results');
  });

  it('rejects unauthenticated search', async () => {
    const res = await request(app).get('/api/search/?q=test');
    expect(res.status).toBe(401);
  });
});
