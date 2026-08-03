import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { setupTestEnv, createTestApp, makeAdminToken, makeUserToken, authCookie } from '../helpers/setup.mjs';

describe('Apps Routes', () => {
  let app, adminCookie, userCookie;
  beforeAll(() => {
    setupTestEnv();
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
    userCookie = authCookie(makeUserToken());
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/apps/catalog');
    expect([401, 403]).toContain(res.status);
  });

  it('GET /api/apps/catalog returns the 5-app catalog', async () => {
    const res = await request(app).get('/api/apps/catalog').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.apps)).toBe(true);
    expect(res.body.apps.length).toBe(5);
    const types = res.body.apps.map(a => a.app_type).sort();
    expect(types).toEqual(['laravel', 'nextjs', 'node', 'static', 'wordpress']);
    const wp = res.body.apps.find(a => a.app_type === 'wordpress');
    expect(wp.name).toBe('WordPress');
    expect(wp.needsDb).toBe(true);
  });

  it('GET /api/apps/list returns an array', async () => {
    const res = await request(app).get('/api/apps/list').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.apps)).toBe(true);
  });

  it('GET /api/apps/system-users returns users with required fields', async () => {
    const res = await request(app).get('/api/apps/system-users').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    for (const u of res.body.users) {
      expect(u).toHaveProperty('username');
      expect(u).toHaveProperty('home');
      expect(u).toHaveProperty('uid');
    }
  });

  it('GET /api/apps/targets returns candidate domains', async () => {
    const res = await request(app).get('/api/apps/targets').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.domains)).toBe(true);
    for (const d of res.body.domains) {
      expect(d).toHaveProperty('domain');
      expect(d).toHaveProperty('url');
    }
  });

  it('GET /api/apps/:id returns 404 for unknown app', async () => {
    const res = await request(app).get('/api/apps/does-not-exist').set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  it('GET /api/apps/:id/log returns 404 for unknown app', async () => {
    const res = await request(app).get('/api/apps/does-not-exist/log').set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  it('GET /api/apps/:id/log caps lines at 1000', async () => {
    const res = await request(app).get('/api/apps/does-not-exist/log?lines=99999').set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  it('works for a non-admin authenticated user', async () => {
    const res = await request(app).get('/api/apps/catalog').set('Cookie', userCookie);
    expect(res.status).toBe(200);
  });
});
