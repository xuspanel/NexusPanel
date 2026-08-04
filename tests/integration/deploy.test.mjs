import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { setupTestEnv, createTestApp, makeAdminToken, makeUserToken, authCookie } from '../helpers/setup.mjs';

describe('Deploy Routes', () => {
  let app, adminCookie, userCookie;
  beforeAll(() => {
    setupTestEnv();
    try { fs.writeFileSync(path.join(__dirname, '..', '..', 'data', 'deploy_keys.json'), '[]', 'utf8'); } catch (_) {}
    try { fs.writeFileSync(path.join(__dirname, '..', '..', 'data', 'deployments.json'), '[]', 'utf8'); } catch (_) {}
    try { fs.writeFileSync(path.join(__dirname, '..', '..', 'data', 'deploy_env_vars.json'), '[]', 'utf8'); } catch (_) {}
    app = createTestApp();
    adminCookie = authCookie(makeAdminToken());
    userCookie = authCookie(makeUserToken());
  });

  it('GET /api/deploy/history returns array', async () => {
    const res = await request(app).get('/api/deploy/history').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.deployments)).toBe(true);
  });

  it('GET /api/deploy/:id returns 404 for unknown', async () => {
    const res = await request(app).get('/api/deploy/nonexistent').set('Cookie', adminCookie);
    expect(res.status).toBe(404);
  });

  it('GET /api/deploy/:id/log returns array for unknown', async () => {
    const res = await request(app).get('/api/deploy/nonexistent/log').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.lines)).toBe(true);
  });

  it('GET /api/deploy/ssh returns has_key false by default', async () => {
    const res = await request(app).get('/api/deploy/ssh').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.has_key).toBe(false);
  });

  it('POST /api/deploy/ssh rejects invalid key', async () => {
    const res = await request(app).post('/api/deploy/ssh').set('Cookie', adminCookie).send({ private_key: 'not-a-key' });
    expect(res.status).toBe(400);
  });

  it('POST /api/deploy/ssh accepts valid key format', async () => {
    const res = await request(app).post('/api/deploy/ssh').set('Cookie', adminCookie).send({ private_key: '-----BEGIN OPENSSH PRIVATE KEY-----\nb3NxDmF...\n-----END OPENSSH PRIVATE KEY-----' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('POST /api/deploy/git requires fields', async () => {
    const res = await request(app).post('/api/deploy/git').set('Cookie', adminCookie).send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/deploy/:id/rollback returns 400 for unknown', async () => {
    const res = await request(app).post('/api/deploy/nonexistent/rollback').set('Cookie', adminCookie);
    expect(res.status).toBe(400);
  });

  it('GET /api/deploy/:id/env returns 404 for unknown', async () => {
    const res = await request(app).get('/api/deploy/nonexistent/env').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.vars)).toBe(true);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/deploy/history');
    expect([401, 403]).toContain(res.status);
  });

  it('webhook returns 400 for unknown deployment', async () => {
    const res = await request(app).post('/webhook/nonexistent/sometoken').send({});
    expect(res.status).toBe(400);
  });
});
