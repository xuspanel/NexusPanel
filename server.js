require('dotenv').config();

const fs = require('fs');
const pkg = require('./package.json');

try {
  const versionFile = require('path').join(__dirname, 'VERSION');
  const current = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf8').trim() : '';
  if (current !== pkg.version) {
    fs.writeFileSync(versionFile, pkg.version, 'utf8');
    console.log('[STARTUP] VERSION synced: ' + current + ' → ' + pkg.version);
  }
} catch {}

const REQUIRED_ENV = ['JWT_SECRET', 'ADMIN_PASS'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key] || process.env[key].startsWith('change-me') || process.env[key].startsWith('replace-with')) {
    console.error(`[STARTUP] FATAL: ${key} is not set or still has a default value. Set it in .env`);
    process.exit(1);
  }
}

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { authMiddleware } = require('./src/middleware/auth');
const { securityHeaders, loginLimiter, apiLimiter } = require('./src/middleware/security');
const users = require('./src/services/users');
const terminal = require('./src/services/terminal');
const dockerWs = require('./src/services/docker-ws');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3443;

users.init();

app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const origin = req.headers.origin || req.headers.referer || '';
    if (origin && !origin.startsWith('http://127.0.0.1:') && !origin.startsWith('http://localhost:') && !origin.startsWith('https://')) {
      return res.status(403).json({ error: 'CSRF: invalid origin' });
    }
  }
  next();
});

require('./src/services/audit').init();

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '365d', etag: true, lastModified: true }));

const authRoutes = require('./src/routes/auth');
const dashboardRoutes = require('./src/routes/dashboard');
const profileRoutes = require('./src/routes/profile');
const fileRoutes = require('./src/routes/files');
const databaseRoutes = require('./src/routes/databases');
const emailRoutes = require('./src/routes/emails');
const dockerRoutes = require('./src/routes/docker');
const terminalRoutes = require('./src/routes/terminal');
const usersRoutes = require('./src/routes/users');
const ftpRoutes = require('./src/routes/ftp');
const domainsRoutes = require('./src/routes/domains');
const alertRoutes = require('./src/routes/alerts');
const tokenRoutes = require('./src/routes/tokens');
const backupRoutes = require('./src/routes/backups');
const backupScheduler = require('./src/services/backup-scheduler');
const backupService = require('./src/services/backups');
const notificationService = require('./src/services/notifications');
const virusscannerRoutes = require('./src/routes/virusscanner');
const mimetypesRoutes = require('./src/routes/mimetypes');
const auditRoutes = require('./src/routes/audit');
const metricsRoutes = require('./src/routes/metrics');
const servicesRoutes = require('./src/routes/services');
const processesRoutes = require('./src/routes/processes');
const logsRoutes = require('./src/routes/logs');
const cronRoutes = require('./src/routes/cron');
const firewallRoutes = require('./src/routes/firewall');
const sslRoutes = require('./src/routes/ssl');
const phpfpmRoutes = require('./src/routes/phpfpm');
const updatesRoutes = require('./src/routes/updates');
const notificationsRoutes = require('./src/routes/notifications');
const settingsRoutes = require('./src/routes/settings');
const searchRoutes = require('./src/routes/search');
const appsRoutes = require('./src/routes/apps');
const deployRoutes = require('./src/routes/deploy');
const webhookRoutes = require('./src/routes/webhook');

app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/system', apiLimiter, dashboardRoutes);
app.use('/api/profile', apiLimiter, profileRoutes);
app.use('/api/files', apiLimiter, fileRoutes);
app.use('/api/databases', apiLimiter, databaseRoutes);
app.use('/api/emails', apiLimiter, emailRoutes);

app.use('/api/docker', apiLimiter, dockerRoutes);
app.use('/api/terminal', apiLimiter, terminalRoutes);
app.use('/api/users', apiLimiter, authMiddleware, usersRoutes);
app.use('/api/ftp', apiLimiter, ftpRoutes);
app.use('/api/domains', apiLimiter, domainsRoutes);
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
app.use('/api/apps', apiLimiter, appsRoutes);
app.use('/api/deploy', apiLimiter, deployRoutes);
app.use('/webhook', webhookRoutes);

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  next();
});

app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

const wss = new WebSocketServer({ noServer: true });
let sessIdCounter = 0;

const dockerWss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; } catch (_) { socket.destroy(); return; }

  if (pathname === '/ws/terminal') {
    const token = parseCookies(req.headers.cookie || '').token;
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (_) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else if (pathname === '/ws/docker') {
    const token = parseCookies(req.headers.cookie || '').token;
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (_) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    dockerWss.handleUpgrade(req, socket, head, (ws) => {
      dockerWss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

dockerWss.on('connection', (ws, req) => dockerWs.handleConnection(ws, req));

wss.on('connection', (ws, req) => {
  const panes = new Map();
  ws.send(JSON.stringify({ type: 'ready' }));

  function createPane(cols, rows, explicitPaneId) {
    const paneId = explicitPaneId || ('p' + (++sessIdCounter));
    const pty = terminal.createTerminalSession(cols, rows, { USER: req.user?.username || 'admin' });
    const pane = { pty, paneId };
    panes.set(paneId, pane);

    pty.onData((data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'data', paneId, data: Buffer.from(data).toString('base64') }));
      }
    });

    pty.on('exit', () => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'exit', paneId }));
      }
      panes.delete(paneId);
    });

    return pane;
  }

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'create') {
        const cols = msg.cols || 80;
        const rows = msg.rows || 24;
        const pane = createPane(cols, rows, msg.paneId);
        ws.send(JSON.stringify({ type: 'created', paneId: pane.paneId }));
        return;
      }

      if (msg.type === 'create-pane') {
        const cols = msg.cols || 80;
        const rows = msg.rows || 24;
        const pane = createPane(cols, rows);
        ws.send(JSON.stringify({ type: 'pane-created', paneId: pane.paneId }));
        return;
      }

      if (msg.type === 'close-pane') {
        const pane = panes.get(msg.paneId);
        if (pane) {
          try { pane.pty.kill('SIGHUP'); } catch (_) {}
          panes.delete(msg.paneId);
        }
        ws.send(JSON.stringify({ type: 'pane-closed', paneId: msg.paneId }));
        return;
      }

      if (msg.type === 'input') {
        const pane = msg.paneId ? panes.get(msg.paneId) : null;
        if (pane) {
          pane.pty.write(Buffer.from(msg.data, 'base64').toString());
        }
        return;
      }

      if (msg.type === 'focus') {
        const pane = msg.paneId ? panes.get(msg.paneId) : null;
        if (pane) {
          pane.pty.write('\x1b[I');
        }
        return;
      }

      if (msg.type === 'blur') {
        const pane = msg.paneId ? panes.get(msg.paneId) : null;
        if (pane) {
          pane.pty.write('\x1b[O');
        }
        return;
      }

      if (msg.type === 'resize') {
        const pane = msg.paneId ? panes.get(msg.paneId) : null;
        if (pane) {
          pane.pty.resize(msg.cols || 80, msg.rows || 24);
        }
        return;
      }

      if (msg.type === 'kill') {
        const pane = msg.paneId ? panes.get(msg.paneId) : null;
        if (pane) {
          pane.pty.kill('SIGHUP');
        }
        return;
      }
    } catch (_) {}
  });

  ws.on('close', () => {
    panes.forEach(pane => {
      try { pane.pty.kill('SIGHUP'); } catch (_) {}
    });
    panes.clear();
  });
});

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(pair => {
    const parts = pair.split('=');
    if (parts.length >= 2) {
      cookies[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('='));
    }
  });
  return cookies;
}

const updates_ = require('./src/services/updates');
const settings_ = require('./src/services/settings');

server.listen(PORT, '127.0.0.1', () => {
  console.log(`NexusPanel running on http://127.0.0.1:${PORT}`);

  // Startup panel version check (5s delay, respects auto-update setting)
  setTimeout(async () => {
    try {
      const result = await updates_.checkPanelVersion(false);
      if (result.updateAvailable) {
        notificationService.add('info', 'New NexusPanel Version Available',
          'Version ' + result.remoteVersion + ' is available. Current: ' + result.localVersion + '. Go to Updates to install.');
        const s = settings_.load();
        if (s.autoUpdate) {
          console.log('[AutoUpdate] New version available (' + result.remoteVersion + '), applying...');
          updates_.applyPanelUpdate().then(function (output) {
            console.log('[AutoUpdate] Success:', output.substring(output.length - 200));
          }).catch(function (err) {
            console.error('[AutoUpdate] Failed:', err.message);
          });
        }
      }
    } catch (e) { /* silent */ }
  }, 5000);

  // Periodic panel version check every 6 hours
  setInterval(async () => {
    try { await updates_.checkPanelVersion(false); } catch {}
  }, 6 * 60 * 60 * 1000);

  // Backup scheduler — checks every 60 seconds
  setInterval(async () => {
    try {
      const due = backupScheduler.getDue();
      for (const schedule of due) {
        console.log('[Scheduler] Running backup for:', schedule.target, 'schedule:', schedule.id);
        try {
          const items = Array.isArray(schedule.target) ? schedule.target : [schedule.target];
          const taskId = backupService.startBackup(items, null);
          let done = false;
          let attempts = 0;
          while (!done && attempts < 300) {
            await new Promise(r => setTimeout(r, 2000));
            const status = backupService.getTaskStatus(taskId);
            if (status?.status === 'complete') {
              done = true;
              backupScheduler.applyRetention(schedule.target, schedule.retention);
              backupScheduler.markRun(schedule.id);
              console.log('[Scheduler] Backup completed for:', schedule.target);
            } else if (status?.status === 'failed') {
              done = true;
              backupScheduler.markRun(schedule.id);
              notificationService.add('error', 'Scheduled Backup Failed',
                'Backup for ' + schedule.target + ' failed. Schedule: ' + schedule.id);
            } else if (status?.status === 'cancelled') {
              done = true;
              backupScheduler.markRun(schedule.id);
              console.log('[Scheduler] Backup cancelled for:', schedule.target);
            }
            attempts++;
          }
          if (!done) {
            backupScheduler.markRun(schedule.id);
            console.error('[Scheduler] Backup timed out for:', schedule.target);
          }
        } catch (e) {
          console.error('[Scheduler] Backup failed:', e.message);
          backupScheduler.markRun(schedule.id);
        }
      }
    } catch (e) { /* silent */ }
  }, 60000);

  // Graceful shutdown — close DB pools
  const closeDb = () => { try { require('./src/services/databases').close(); } catch {} };
  process.on('SIGTERM', () => { closeDb(); server.close(() => process.exit(0)); });
  process.on('SIGINT', () => { closeDb(); server.close(() => process.exit(0)); });
});
