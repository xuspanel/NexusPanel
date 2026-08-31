const net = require('net');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const {
  DEFAULT_SOCKET_PATH,
  MAX_PAYLOAD_SIZE,
  ERROR_CODES,
  formatResponse,
  validateCommand
} = require('./protocol');

// Crash Immunity Guards
process.on('uncaughtException', (err) => {
  console.error('[DAEMON FATAL] Uncaught Exception:', err && err.stack ? err.stack : err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[DAEMON FATAL] Unhandled Rejection:', reason && reason.stack ? reason.stack : reason);
});

let serverInstance = null;
let currentSocketPath = null;
const activeSockets = new Set();

function resolveNexusPanelGid() {
  try {
    const groupFile = fs.readFileSync('/etc/group', 'utf8');
    for (const line of groupFile.split('\n')) {
      const parts = line.split(':');
      if (parts[0] === 'nexuspanel' && parts[2]) {
        const gid = parseInt(parts[2], 10);
        if (!isNaN(gid)) return gid;
      }
    }
  } catch (_) {}
  return process.getgid ? process.getgid() : 0;
}

function executePrivilegedCommand(params) {
  return new Promise((resolve) => {
    const { command, args, timeout, maxBuffer, env, input } = params;
    const validation = validateCommand(command);

    if (!validation.valid) {
      return resolve({
        result: null,
        error: {
          code: ERROR_CODES.FORBIDDEN_BINARY,
          message: validation.reason
        }
      });
    }

    // Crucial Security Guard: Restricted filesystem mutations
    const FS_MUTATION_BINARIES = new Set(['chown', 'chmod', 'mkdir', 'cp', 'mv', 'rm']);
    if (FS_MUTATION_BINARIES.has(validation.command)) {
      let targetPaths = (args || []).filter(a => typeof a === 'string' && !a.startsWith('-'));
      if (validation.command === 'chown' || validation.command === 'chmod') {
        targetPaths = targetPaths.slice(1);
      }
      if (targetPaths.length === 0) {
        return resolve({
          result: null,
          error: {
            code: ERROR_CODES.INVALID_PARAMS,
            message: `Missing target path for ${validation.command}`
          }
        });
      }

      const allowedPrefixes = ['/var/www/', '/var/www', '/etc/nginx/', '/var/lib/rspamd/dkim/', '/var/log/nginx/'];

      for (let idx = 0; idx < targetPaths.length; idx++) {
        const targetPath = targetPaths[idx];
        const normalized = path.normalize(targetPath);

        // For cp/mv, source file (first path argument) can be located in /tmp
        const isSourceArg = (validation.command === 'cp' || validation.command === 'mv') && idx === 0 && targetPaths.length > 1;
        const isTmpAllowed = isSourceArg && (normalized.startsWith('/tmp/') || normalized === '/tmp');

        const isAllowed = isTmpAllowed || allowedPrefixes.some(prefix => normalized.startsWith(prefix) || normalized === prefix.replace(/\/$/, ''));
        if (!isAllowed) {
          return resolve({
            result: null,
            error: {
              code: ERROR_CODES.FORBIDDEN_BINARY,
              message: `Unauthorized path for ${validation.command}: target must strictly begin with /var/www/, /etc/nginx/, or /var/lib/rspamd/dkim/`
            }
          });
        }
      }
    }

    const options = {
      timeout: Math.min(Math.max(timeout || 30000, 1000), 300000),
      maxBuffer: Math.min(maxBuffer || 10 * 1024 * 1024, 25 * 1024 * 1024)
    };
    if (env && typeof env === 'object') options.env = env;
    if (input) options.input = input;

    execFile(validation.command, args || [], options, (error, stdout, stderr) => {
      if (error) {
        return resolve({
          result: {
            stdout: stdout || '',
            stderr: stderr || (error.message || ''),
            status: typeof error.code === 'number' ? error.code : 1,
            error: error.message
          },
          error: null
        });
      }
      resolve({
        result: {
          stdout: stdout || '',
          stderr: stderr || '',
          status: 0,
          error: null
        },
        error: null
      });
    });
  });
}

function detectOSFamily() {
  try {
    if (fs.existsSync('/etc/os-release')) {
      const content = fs.readFileSync('/etc/os-release', 'utf8');
      const lines = content.split('\n');
      const vars = {};
      for (const line of lines) {
        const match = line.match(/^([A-Z_]+)=(.*)$/);
        if (match) {
          const key = match[1];
          let val = match[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          vars[key] = val.toLowerCase();
        }
      }

      const id = vars.ID || '';
      const idLike = vars.ID_LIKE || '';

      if (id.includes('debian') || id.includes('ubuntu') || idLike.includes('debian') || idLike.includes('ubuntu')) {
        return 'debian';
      }
      if (
        id.includes('rhel') || id.includes('alma') || id.includes('rocky') ||
        id.includes('centos') || id.includes('fedora') ||
        idLike.includes('rhel') || idLike.includes('fedora') || idLike.includes('centos')
      ) {
        return 'rhel';
      }
    }
  } catch (_) {}

  // Fallback: check binaries
  try {
    if (fs.existsSync('/usr/bin/apt-get') || fs.existsSync('/usr/bin/apt')) return 'debian';
    if (fs.existsSync('/usr/bin/dnf') || fs.existsSync('/usr/bin/yum')) return 'rhel';
  } catch (_) {}

  return 'debian';
}

const PRESET_SERVICE_COMMANDS = {
  debian: {
    vsftpd: 'apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y vsftpd && systemctl enable vsftpd --now',
    'php-fpm': 'apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y php-fpm && (systemctl enable php-fpm --now 2>/dev/null || systemctl enable php*-fpm --now 2>/dev/null || true)',
    nodejs: 'apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs npm',
    nginx: 'apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y nginx && systemctl enable nginx --now',
    redis: 'apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y redis-server && systemctl enable redis-server --now'
  },
  rhel: {
    vsftpd: 'dnf install -y vsftpd && systemctl enable vsftpd --now',
    'php-fpm': 'dnf install -y php-fpm && systemctl enable php-fpm --now',
    nodejs: 'dnf install -y nodejs npm',
    nginx: 'dnf install -y nginx && systemctl enable nginx --now',
    redis: 'dnf install -y redis && systemctl enable redis --now'
  }
};

function handleInstallService(params) {
  return new Promise((resolve) => {
    const rawService = (params && (params.service || params.name)) ? String(params.service || params.name).toLowerCase().trim() : '';
    if (!rawService) {
      return resolve({
        result: null,
        error: {
          code: ERROR_CODES.INVALID_PARAMS,
          message: 'Missing service preset name'
        }
      });
    }

    const osFamily = detectOSFamily();
    const osMap = PRESET_SERVICE_COMMANDS[osFamily] || PRESET_SERVICE_COMMANDS.debian;
    const commandStr = osMap[rawService];

    if (!commandStr) {
      const available = Object.keys(osMap).join(', ');
      return resolve({
        result: null,
        error: {
          code: ERROR_CODES.INVALID_PARAMS,
          message: `Unknown service preset: '${rawService}'. Available presets: ${available}`
        }
      });
    }

    console.log(`[DAEMON] Installing service preset '${rawService}' on ${osFamily}: ${commandStr}`);

    const { exec } = require('child_process');
    exec(commandStr, {
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive', PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' }
    }, (error, stdout, stderr) => {
      const output = ((stdout || '') + '\n' + (stderr || '')).trim();
      const status = error ? (error.code || 1) : 0;
      const success = !error && status === 0;

      resolve({
        result: {
          success,
          service: rawService,
          os: osFamily,
          command: commandStr,
          stdout: stdout || '',
          stderr: stderr || '',
          output: output || (success ? 'Service installed successfully' : 'Installation failed'),
          status
        },
        error: error && !stdout ? {
          code: ERROR_CODES.EXEC_FAILED,
          message: error.message
        } : null
      });
    });
  });
}

function handleClientConnection(socket) {
  activeSockets.add(socket);
  let buffer = '';
  let totalReceived = 0;

  socket.on('close', () => {
    activeSockets.delete(socket);
  });

  socket.on('data', async (chunk) => {
    totalReceived += chunk.length;
    if (totalReceived > MAX_PAYLOAD_SIZE) {
      console.warn('[DAEMON] Payload limit exceeded, dropping connection');
      const errResp = formatResponse(null, null, {
        code: ERROR_CODES.PAYLOAD_TOO_LARGE,
        message: `Payload exceeds max allowed size of ${MAX_PAYLOAD_SIZE} bytes`
      });
      socket.write(errResp);
      socket.destroy();
      return;
    }

    buffer += chunk.toString('utf8');
    let lineIdx;
    while ((lineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.substring(0, lineIdx).trim();
      buffer = buffer.substring(lineIdx + 1);
      totalReceived = buffer.length;

      if (!line) continue;

      let req;
      try {
        req = JSON.parse(line);
      } catch (err) {
        socket.write(formatResponse(null, null, {
          code: ERROR_CODES.INVALID_REQUEST,
          message: 'Invalid JSON request: ' + err.message
        }));
        continue;
      }

      if (!req || req.jsonrpc !== '2.0' || !req.method || !req.params) {
        socket.write(formatResponse(req?.id || null, null, {
          code: ERROR_CODES.INVALID_REQUEST,
          message: 'Malformed JSON-RPC 2.0 request payload'
        }));
        continue;
      }

      if (req.method === 'install_service') {
        try {
          const { result, error } = await handleInstallService(req.params);
          if (socket.writable) {
            socket.write(formatResponse(req.id, result, error));
          }
        } catch (err) {
          if (socket.writable) {
            socket.write(formatResponse(req.id, null, {
              code: ERROR_CODES.INTERNAL_ERROR,
              message: 'Service installation error: ' + err.message
            }));
          }
        }
        continue;
      }

      if (req.method === 'exec') {
        try {
          const { result, error } = await executePrivilegedCommand(req.params);
          if (socket.writable) {
            socket.write(formatResponse(req.id, result, error));
          }
        } catch (err) {
          if (socket.writable) {
            socket.write(formatResponse(req.id, null, {
              code: ERROR_CODES.INTERNAL_ERROR,
              message: 'Daemon execution error: ' + err.message
            }));
          }
        }
        continue;
      }

      socket.write(formatResponse(req.id, null, {
        code: ERROR_CODES.METHOD_NOT_FOUND,
        message: `Unknown JSON-RPC method: '${req.method}'`
      }));
    }
  });

  socket.on('error', (err) => {
    console.warn('[DAEMON] Client socket error:', err.message);
  });
}

function startDaemon(customSockPath) {
  return new Promise((resolve, reject) => {
    const sockPath = customSockPath || DEFAULT_SOCKET_PATH;
    currentSocketPath = sockPath;

    const sockDir = path.dirname(sockPath);
    if (!fs.existsSync(sockDir)) {
      try { fs.mkdirSync(sockDir, { recursive: true, mode: 0o755 }); } catch (_) {}
    }

    if (fs.existsSync(sockPath)) {
      try { fs.unlinkSync(sockPath); } catch (err) {
        console.warn('[DAEMON] Could not unlink stale socket:', err.message);
      }
    }

    const server = net.createServer(handleClientConnection);

    server.listen(sockPath, () => {
      console.log(`[DAEMON] NexusPanel Root Daemon listening on ${sockPath}`);
      try {
        const nexuspanelGid = resolveNexusPanelGid();
        if (process.getuid && process.getuid() === 0) {
          try { fs.chownSync(sockPath, 0, nexuspanelGid); } catch (err) {
            console.warn('[DAEMON] Could not chown socket to group ' + nexuspanelGid + ':', err.message);
          }
        }
        fs.chmodSync(sockPath, 0o660);
      } catch (err) {
        console.warn('[DAEMON] Note: Could not set permissions on socket:', err.message);
      }
      resolve(server);
    });

    server.on('error', (err) => {
      console.error('[DAEMON] Server error:', err.message);
      reject(err);
    });

    serverInstance = server;

    const cleanup = () => {
      if (fs.existsSync(sockPath)) {
        try { fs.unlinkSync(sockPath); } catch (_) {}
      }
    };

    process.on('exit', cleanup);
    process.on('SIGINT', () => { cleanup(); process.exit(); });
    process.on('SIGTERM', () => { cleanup(); process.exit(); });
  });
}

function stopDaemon() {
  return new Promise((resolve) => {
    for (const socket of activeSockets) {
      try { socket.destroy(); } catch (_) {}
    }
    activeSockets.clear();
    if (serverInstance) {
      serverInstance.close(() => {
        serverInstance = null;
        if (currentSocketPath && fs.existsSync(currentSocketPath)) {
          try { fs.unlinkSync(currentSocketPath); } catch (_) {}
        }
        resolve();
      });
    } else {
      if (currentSocketPath && fs.existsSync(currentSocketPath)) {
        try { fs.unlinkSync(currentSocketPath); } catch (_) {}
      }
      resolve();
    }
  });
}

if (require.main === module) {
  startDaemon();
}

module.exports = {
  startDaemon,
  stopDaemon,
  executePrivilegedCommand,
  resolveNexusPanelGid,
  detectOSFamily,
  PRESET_SERVICE_COMMANDS,
  handleInstallService
};
