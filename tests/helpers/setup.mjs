import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
import jwt from 'jsonwebtoken';

const require = createRequire(import.meta.url);

let tmpDir = null;

export function getTmpDir() {
  if (!tmpDir) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexuspanel-test-'));
  }
  return tmpDir;
}

export function cleanupTmpDir() {
  if (tmpDir && fs.existsSync(tmpDir)) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    tmpDir = null;
  }
}

export function setupTestEnv() {
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret-for-nexuspanel-tests-2026';
  }
  if (!process.env.ADMIN_PASS) {
    process.env.ADMIN_PASS = 'test-admin-password-secure';
  }
  return getTmpDir();
}

export function createTestApp() {
  const express = require('express');
  const cookieParser = require('cookie-parser');

  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(cookieParser());

  const apiLimiter = (req, res, next) => next();
  const loginLimiter = (req, res, next) => next();

  const authRoutes = require('../../src/routes/auth.js');
  const dashboardRoutes = require('../../src/routes/dashboard.js');
  const profileRoutes = require('../../src/routes/profile.js');
  const fileRoutes = require('../../src/routes/files.js');
  const usersRoutes = require('../../src/routes/users.js');
  const domainsRoutes = require('../../src/routes/domains.js');
  const ftpRoutes = require('../../src/routes/ftp.js');
  const alertRoutes = require('../../src/routes/alerts.js');
  const tokenRoutes = require('../../src/routes/tokens.js');
  const backupRoutes = require('../../src/routes/backups.js');
  const virusscannerRoutes = require('../../src/routes/virusscanner.js');
  const mimetypesRoutes = require('../../src/routes/mimetypes.js');
  const auditRoutes = require('../../src/routes/audit.js');
  const metricsRoutes = require('../../src/routes/metrics.js');
  const servicesRoutes = require('../../src/routes/services.js');
  const processesRoutes = require('../../src/routes/processes.js');
  const logsRoutes = require('../../src/routes/logs.js');
  const cronRoutes = require('../../src/routes/cron.js');
  const firewallRoutes = require('../../src/routes/firewall.js');
  const sslRoutes = require('../../src/routes/ssl.js');
  const phpfpmRoutes = require('../../src/routes/phpfpm.js');
  const updatesRoutes = require('../../src/routes/updates.js');
  const notificationsRoutes = require('../../src/routes/notifications.js');
  const settingsRoutes = require('../../src/routes/settings.js');
  const searchRoutes = require('../../src/routes/search.js');
  const emailRoutes = require('../../src/routes/emails.js');
  const databasesRoutes = require('../../src/routes/databases.js');
  const dockerRoutes = require('../../src/routes/docker.js');
  const appsRoutes = require('../../src/routes/apps.js');
  const deployRoutes = require('../../src/routes/deploy.js');
  const webhookRoutes = require('../../src/routes/webhook.js');

  app.use('/api/auth', loginLimiter, authRoutes);
  app.use('/api/system', apiLimiter, dashboardRoutes);
  app.use('/api/profile', apiLimiter, profileRoutes);
  app.use('/api/files', apiLimiter, fileRoutes);
  const { authMiddleware } = require('../../src/middleware/auth.js');
  app.use('/api/users', apiLimiter, authMiddleware, usersRoutes);
  app.use('/api/domains', apiLimiter, domainsRoutes);
  app.use('/api/ftp', apiLimiter, ftpRoutes);
  app.use('/api/alerts', apiLimiter, alertRoutes);
  app.use('/api/tokens', apiLimiter, tokenRoutes);
  app.use('/api/backups', apiLimiter, backupRoutes);
  app.use('/api/virusscanner', apiLimiter, virusscannerRoutes);
  app.use('/api/mimetypes', apiLimiter, mimetypesRoutes);
  app.use('/api/audit', apiLimiter, auditRoutes);
  app.use('/api/metrics', apiLimiter, metricsRoutes);
  app.use('/api/services', apiLimiter, servicesRoutes);
  app.use('/api/processes', apiLimiter, processesRoutes);
  app.use('/api/logs', apiLimiter, logsRoutes);
  app.use('/api/cron', apiLimiter, cronRoutes);
  app.use('/api/firewall', apiLimiter, firewallRoutes);
  app.use('/api/ssl', apiLimiter, sslRoutes);
  app.use('/api/phpfpm', apiLimiter, phpfpmRoutes);
  app.use('/api/updates', apiLimiter, updatesRoutes);
  app.use('/api/notifications', apiLimiter, notificationsRoutes);
  app.use('/api/settings', apiLimiter, settingsRoutes);
  app.use('/api/search', apiLimiter, searchRoutes);
  app.use('/api/emails', apiLimiter, emailRoutes);
  app.use('/api/databases', apiLimiter, databasesRoutes);
  app.use('/api/docker', apiLimiter, dockerRoutes);
  app.use('/api/apps', apiLimiter, appsRoutes);
  app.use('/api/deploy', apiLimiter, deployRoutes);
  app.use('/webhook', webhookRoutes);

  app.use('/api/{*rest}', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  app.use((err, req, res, next) => {
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export function makeAdminToken() {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret-for-nexuspanel-tests-2026';
  return jwt.sign(
    { username: 'admin', role: 'admin' },
    secret,
    { expiresIn: '1h' }
  );
}

export function makeUserToken() {
  const secret = process.env.JWT_SECRET || 'test-jwt-secret-for-nexuspanel-tests-2026';
  return jwt.sign(
    { username: 'testuser', role: 'user' },
    secret,
    { expiresIn: '1h' }
  );
}

export function authCookie(token) {
  return `token=${token}`;
}

export const TEST_ADMIN_USER = 'admin';
