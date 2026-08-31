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

  it('POST /api/domains/create rejects subdomain without parent', async () => {
    const res = await request(app).post('/api/domains/create').set('Cookie', adminCookie).send({ type: 'subdomain', domain: 'test-' + Date.now() + '.example.com', ssl: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/parent domain/i);
  });

  it('POST /api/domains/create rejects subdomain with unknown parent', async () => {
    const res = await request(app).post('/api/domains/create').set('Cookie', adminCookie).send({ type: 'subdomain', domain: 'test-' + Date.now() + '.nonexistent-parent.com', parentDomain: 'nonexistent-parent.com', ssl: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/parent domain not found/i);
  });

  it('POST /api/domains/create rejects a reserved port', async () => {
    const res = await request(app).post('/api/domains/create').set('Cookie', adminCookie).send({ type: 'domain', domain: 'portbusy-' + Date.now() + '.com', port: 443, ssl: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/security violation|already in use/i);
  });

  it('POST /api/domains/create rejects an invalid port', async () => {
    const res = await request(app).post('/api/domains/create').set('Cookie', adminCookie).send({ type: 'domain', domain: 'badport-' + Date.now() + '.com', port: 70000, ssl: false });
    expect(res.status).toBe(400);
  });

  it('GET /api/domains/ports/available returns a conflict-free port', async () => {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const domains = require('../../src/services/domains.js');
    const usedPorts = domains.getUsedPorts();
    const res = await request(app).get('/api/domains/ports/available').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.port).toBeGreaterThanOrEqual(8000);
    expect(res.body.port).toBeLessThanOrEqual(9000);
    expect(usedPorts.has(res.body.port)).toBe(false);
  });

  it('rejects unauthenticated domain request', async () => {
    const res = await request(app).get('/api/domains/');
    expect(res.status).toBe(401);
  });
});
