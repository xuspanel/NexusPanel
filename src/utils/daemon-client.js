const net = require('net');
const fs = require('fs');
const path = require('path');
const { execFile, spawnSync } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const {
  DEFAULT_SOCKET_PATH,
  formatRequest,
  PRIVILEGED_BINARIES,
  validateCommand
} = require('../daemon/protocol');

const BRIDGE_SCRIPT = path.join(__dirname, 'ipc-sync-bridge.js');

function isDaemonAvailable(customSockPath) {
  const sockPath = customSockPath || process.env.NEXUSPANEL_SOCK || DEFAULT_SOCKET_PATH;
  try {
    return fs.existsSync(sockPath);
  } catch (_) {
    return false;
  }
}

async function execViaSocket(command, args = [], opts = {}, customSockPath) {
  const sockPath = customSockPath || process.env.NEXUSPANEL_SOCK || DEFAULT_SOCKET_PATH;
  const timeoutMs = opts.timeout || 30000;

  return new Promise((resolve, reject) => {
    let resolved = false;
    let buffer = '';

    const socket = net.createConnection({ path: sockPath }, () => {
      const payload = formatRequest(null, command, args, opts);
      socket.write(payload);
    });

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        reject(new Error(`Daemon execution timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs + 2000);

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lineIdx = buffer.indexOf('\n');
      if (lineIdx !== -1) {
        const line = buffer.substring(0, lineIdx).trim();
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          socket.end();
          try {
            const resp = JSON.parse(line);
            if (resp.error) {
              const err = new Error(resp.error.message || 'Daemon execution error');
              err.code = resp.error.code;
              return reject(err);
            }
            resolve(resp.result || { stdout: '', stderr: '', status: 0, error: null });
          } catch (err) {
            reject(new Error('Failed to parse daemon response: ' + err.message));
          }
        }
      }
    });

    socket.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

async function exec(command, args = [], opts = {}) {
  const isRoot = !process.getuid || process.getuid() === 0;
  const requiresPrivilege = PRIVILEGED_BINARIES.has(command);
  const daemonActive = isDaemonAvailable();

  if (requiresPrivilege && daemonActive) {
    try {
      return await execViaSocket(command, args, opts);
    } catch (err) {
      // If daemon connection failed and we are running as root, fallback to direct execution
      if (isRoot) {
        console.warn(`[IPC-CLIENT] Daemon error for ${command}, falling back to direct execution:`, err.message);
        return execFileAsync(command, args, opts);
      }
      throw err;
    }
  }

  // Direct execution for safe commands or root mode
  return execFileAsync(command, args, opts);
}

function execSync(command, args = [], opts = {}) {
  const isRoot = !process.getuid || process.getuid() === 0;
  const requiresPrivilege = PRIVILEGED_BINARIES.has(command);
  const daemonActive = isDaemonAvailable();

  if (requiresPrivilege && daemonActive && !isRoot) {
    // Dispatch via synchronous CLI socket bridge
    const payload = JSON.stringify({ command, args, opts });
    const res = spawnSync(process.execPath, [BRIDGE_SCRIPT], {
      input: payload,
      encoding: 'utf8',
      timeout: (opts.timeout || 30000) + 3000
    });

    if (res.status === 0 && res.stdout) {
      try {
        const parsed = JSON.parse(res.stdout.trim());
        if (parsed.ok && parsed.result) {
          return parsed.result;
        }
        return {
          stdout: '',
          stderr: parsed.error || 'Bridge error',
          status: 1,
          error: parsed.error
        };
      } catch (_) {}
    }

    return {
      stdout: res.stdout || '',
      stderr: res.stderr || (res.error ? res.error.message : 'IPC Sync Bridge error'),
      status: res.status || 1,
      error: res.error ? res.error.message : null
    };
  }

  // Direct sync execution
  const options = {
    timeout: opts.timeout || 10000,
    maxBuffer: opts.maxBuffer || 10 * 1024 * 1024,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  };
  if (opts.env) options.env = opts.env;

  const result = spawnSync(command, args, options);
  return {
    stdout: (result.stdout || ''),
    stderr: (result.stderr || ''),
    status: result.status,
    error: result.error ? result.error.message : null
  };
}

module.exports = {
  isDaemonAvailable,
  execViaSocket,
  exec,
  execSync
};
