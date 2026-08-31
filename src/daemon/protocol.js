const PRIVILEGED_BINARIES = new Set([
  'systemctl', 'iptables', 'nft', 'ufw', 'firewall-cmd',
  'certbot', 'nginx', 'vsftpd', 'chpasswd', 'useradd',
  'userdel', 'usermod', 'clamscan', 'journalctl',
  'rspamadm', 'chown', 'chmod', 'mkdir', 'cp', 'mv', 'rm'
]);

const DEFAULT_SOCKET_PATH = process.env.NEXUSPANEL_SOCK || '/var/run/nexuspanel.sock';
const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5MB max payload per message

const ERROR_CODES = {
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  FORBIDDEN_BINARY: -32001,
  PAYLOAD_TOO_LARGE: -32002,
  EXEC_FAILED: -32003,
  TIMEOUT: -32004
};

function formatRequest(id, command, args = [], opts = {}) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: id || 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
    method: 'exec',
    params: {
      command,
      args: Array.isArray(args) ? args : [],
      timeout: opts.timeout || 30000,
      maxBuffer: opts.maxBuffer || 10 * 1024 * 1024,
      env: opts.env || null,
      input: opts.input || null
    }
  }) + '\n';
}

function formatResponse(id, result, error = null) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    result: result || null,
    error: error || null
  }) + '\n';
}

function validateCommand(command) {
  if (typeof command !== 'string' || !command.trim()) {
    return { valid: false, reason: 'Command must be a non-empty string' };
  }
  const cleanCmd = command.trim();
  if (cleanCmd.includes('/') || cleanCmd.includes('\\') || cleanCmd.includes('\0') || cleanCmd.includes('..')) {
    return { valid: false, reason: 'Command path traversal or invalid characters detected' };
  }
  if (!PRIVILEGED_BINARIES.has(cleanCmd)) {
    return { valid: false, reason: `Forbidden binary: '${cleanCmd}' is not in privileged whitelist` };
  }
  return { valid: true, command: cleanCmd };
}

module.exports = {
  PRIVILEGED_BINARIES,
  DEFAULT_SOCKET_PATH,
  MAX_PAYLOAD_SIZE,
  ERROR_CODES,
  formatRequest,
  formatResponse,
  validateCommand
};
