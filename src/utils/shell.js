const { execFile, spawn, spawnSync } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

async function runSafe(command, args, opts = {}) {
  const { timeout = 30000, maxBuffer = 10 * 1024 * 1024, env, input } = opts;
  const options = { timeout, maxBuffer };
  if (env) options.env = env;
  if (input) options.input = input;
  return execFileAsync(command, args, options);
}

function runSafeSync(command, args, opts = {}) {
  const { timeout = 10000, maxBuffer = 10 * 1024 * 1024, env } = opts;
  const options = {
    timeout, maxBuffer, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  };
  if (env) options.env = env;
  const result = spawnSync(command, args, options);
  return {
    stdout: (result.stdout || ''),
    stderr: (result.stderr || ''),
    status: result.status,
    error: result.error ? result.error.message : null
  };
}

const validators = {
  containerId: /^[a-zA-Z0-9]{12,64}$/,
  imageName: /^[a-zA-Z0-9._\-\/:]+$/,
  port: /^\d{1,5}$/,
  username: /^[a-zA-Z][a-zA-Z0-9._-]{0,31}$/,
  domain: /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
  ipAddr: /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  chainName: /^(INPUT|OUTPUT|FORWARD|PREROUTING|POSTROUTING|[a-zA-Z][a-zA-Z0-9_-]*)$/,
  numeric: /^\d+$/,
  iptablesRule: /^[\w\s.\-\/:!"'$%&()+,;=<>\[\]{}|\\@#~`?]+$/
};

module.exports = { runSafe, runSafeSync, validators };
