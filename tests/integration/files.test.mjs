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

  it('POST /api/files/upload rejects request with no files', async () => {
    const res = await request(app).post('/api/files/upload').set('Cookie', adminCookie).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no files/i);
  });

  it('POST /api/files/upload uploads a file and delegates to IPC daemon', async () => {
    const res = await request(app)
      .post('/api/files/upload')
      .set('Cookie', adminCookie)
      .field('path', '/tmp')
      .attach('files', Buffer.from('console.log("hello world");'), 'test_upload.js');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('uploaded');
    expect(Array.isArray(res.body.uploaded)).toBe(true);
    expect(res.body.uploaded[0].name).toBe('test_upload.js');
  });
});
