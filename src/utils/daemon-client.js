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

async function installService(service, opts = {}) {
  const isRoot = !process.getuid || process.getuid() === 0;
  const daemonActive = isDaemonAvailable();
  const sockPath = opts.sockPath || process.env.NEXUSPANEL_SOCK || DEFAULT_SOCKET_PATH;
  const timeoutMs = opts.timeout || 300000;

  if (daemonActive) {
    return new Promise((resolve, reject) => {
      let resolved = false;
      let buffer = '';

      const socket = net.createConnection({ path: sockPath }, () => {
        const payload = JSON.stringify({
          jsonrpc: '2.0',
          id: 'svc_inst_' + Date.now(),
          method: 'install_service',
          params: { service, timeout: timeoutMs }
        }) + '\n';
        socket.write(payload);
      });

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          reject(new Error(`Service installation timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs + 5000);

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
              if (resp.error && !resp.result) {
                const err = new Error(resp.error.message || 'Service installation error');
                err.code = resp.error.code;
                return reject(err);
              }
              resolve(resp.result || { success: true, stdout: '', stderr: '', output: '' });
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

  // Direct execution fallback if running as root or in test environment
  const { exec: execCmd } = require('child_process');
  let osFamily = 'debian';
  let osMap = {};
  try {
    const serverModule = require('../daemon/server');
    osFamily = serverModule.detectOSFamily ? serverModule.detectOSFamily() : 'debian';
    osMap = (serverModule.PRESET_SERVICE_COMMANDS && serverModule.PRESET_SERVICE_COMMANDS[osFamily]) || {};
  } catch (_) {}

  const commandStr = osMap[service];
  if (!commandStr) {
    if (isRoot) {
      throw new Error(`Unknown service preset: '${service}'`);
    } else {
      throw new Error('Root Daemon is not active to execute privileged service installation');
    }
  }

  return new Promise((resolve, reject) => {
    execCmd(commandStr, {
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' }
    }, (err, stdout, stderr) => {
      const output = ((stdout || '') + '\n' + (stderr || '')).trim();
      const status = err ? (err.code || 1) : 0;
      resolve({
        success: !err && status === 0,
        service,
        os: osFamily,
        command: commandStr,
        stdout: stdout || '',
        stderr: stderr || '',
        output: output || (err ? err.message : 'Service installed successfully'),
        status
      });
    });
  });
}

module.exports = {
  isDaemonAvailable,
  execViaSocket,
  exec,
  execSync,
  installService
};
