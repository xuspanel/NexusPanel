const { execFile, spawnSync } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const daemonClient = require('./daemon-client');
const { PRIVILEGED_BINARIES } = require('../daemon/protocol');

function buildExecutionPlan(command, args = []) {
  return { bin: command, finalArgs: args || [] };
}

async function runSafe(command, args = [], opts = {}) {
  return daemonClient.exec(command, args, opts);
}

function runSafeSync(command, args = [], opts = {}) {
  return daemonClient.execSync(command, args, opts);
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

module.exports = { runSafe, runSafeSync, validators, PRIVILEGED_BINARIES, buildExecutionPlan };


