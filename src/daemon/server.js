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

      if (!req || req.jsonrpc !== '2.0' || !req.method || req.method !== 'exec' || !req.params) {
        socket.write(formatResponse(req?.id || null, null, {
          code: ERROR_CODES.INVALID_REQUEST,
          message: 'Malformed JSON-RPC 2.0 request payload'
        }));
        continue;
      }

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

module.exports = { startDaemon, stopDaemon, executePrivilegedCommand, resolveNexusPanelGid };
