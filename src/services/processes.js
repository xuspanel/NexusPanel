const { runSafeSync } = require('../utils/shell');

const SIGNALS = {
  SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGKILL: 9, SIGUSR1: 10,
  SIGUSR2: 12, SIGTERM: 15, SIGCONT: 18, SIGSTOP: 19, SIGTSTP: 20,
};
const SIGNAL_NAMES = Object.keys(SIGNALS);
const MAX_PROCESSES = 200;
const KILL_RATE_LIMIT = 10;
const KILL_RATE_WINDOW = 60000;
const killTimestamps = [];

function list() {
  const result = runSafeSync('ps', ['aux', '--sort=-%cpu', '--no-headers']);
  if (result.status !== 0) return [];
  return result.stdout.trim().split('\n').filter(Boolean).slice(0, MAX_PROCESSES).map(line => {
    const clean = line.replace(/^[\s\u25CF]+/, '');
    const p = clean.split(/\s+/);
    return {
      user: p[0] || '',
      pid: parseInt(p[1]) || 0,
      cpu: parseFloat(p[2]) || 0,
      mem: parseFloat(p[3]) || 0,
      vsz: parseInt(p[4]) || 0,
      rss: parseInt(p[5]) || 0,
      tty: p[6] || '',
      stat: p[7] || '',
      start: p[8] || '',
      time: p[9] || '',
      command: p.slice(10).join(' ') || '',
    };
  }).filter(p => p.pid > 0);
}

function details(pid) {
  if (!/^\d+$/.test(String(pid))) throw new Error('Invalid PID');
  const pidStr = String(pid);
  const statusResult = runSafeSync('cat', ['/proc/' + pidStr + '/status']);
  if (statusResult.status !== 0 || !statusResult.stdout) {
    throw new Error('Process not found or access denied');
  }
  const info = {};
  const statusLines = statusResult.stdout.split('\n');
  for (const line of statusLines) {
    const match = line.match(/^(\w+):\s+(.+)$/);
    if (match) info[match[1]] = match[2].trim();
  }
  const cmdResult = runSafeSync('cat', ['/proc/' + pidStr + '/cmdline']);
  const fullCommand = cmdResult.stdout ? cmdResult.stdout.replace(/\0/g, ' ').trim() : (info.Name || '');
  const fdResult = runSafeSync('ls', ['/proc/' + pidStr + '/fd', '--no-group']);
  const openFds = fdResult.status === 0 ? fdResult.stdout.trim().split('\n').filter(Boolean).length : 0;
  return {
    pid: parseInt(info.Pid) || parseInt(pidStr),
    ppid: parseInt(info.PPid) || 0,
    name: info.Name || '',
    state: info.State || '',
    threads: parseInt(info.Threads) || 0,
    vmRSS: info.VmRSS || '',
    vmSize: info.VmSize || '',
    uid: info.Uid || '',
    gid: info.Gid || '',
    openFds: openFds,
    fullCommand: fullCommand,
  };
}

function kill(pid, signal) {
  if (!/^\d+$/.test(String(pid))) throw new Error('Invalid PID');
  const sigNum = parseInt(signal) || 15;
  if (sigNum < 1 || sigNum > 31) throw new Error('Invalid signal number');
  const result = runSafeSync('kill', ['-' + String(sigNum), String(pid)]);
  if (result.error) throw new Error('Failed to send signal to process');
  if (result.status !== 0) {
    const msg = (result.stderr || '').trim().substring(0, 200);
    throw new Error(msg || 'Failed to send signal to process');
  }
  return { ok: true, pid: parseInt(pid), signal: sigNum };
}

function sendSignal(pid, signalName) {
  if (!/^\d+$/.test(String(pid))) throw new Error('Invalid PID');
  if (!signalName || typeof signalName !== 'string') throw new Error('Signal name required');
  const upper = signalName.toUpperCase().replace(/^SIG/, '');
  const sigName = 'SIG' + upper;
  if (!SIGNALS[sigName]) throw new Error('Invalid signal: ' + signalName + '. Allowed: ' + SIGNAL_NAMES.join(', '));
  const now = Date.now();
  while (killTimestamps.length && killTimestamps[0] < now - KILL_RATE_WINDOW) killTimestamps.shift();
  if (killTimestamps.length >= KILL_RATE_LIMIT) throw new Error('Rate limit exceeded. Max ' + KILL_RATE_LIMIT + ' kills per minute.');
  killTimestamps.push(now);
  const result = runSafeSync('kill', ['-' + String(SIGNALS[sigName]), String(pid)]);
  if (result.error) throw new Error('Failed to send signal to process');
  if (result.status !== 0) {
    const msg = (result.stderr || '').trim().substring(0, 200);
    throw new Error(msg || 'Failed to send signal to process');
  }
  return { ok: true, pid: parseInt(pid), signal: sigName, signalNum: SIGNALS[sigName] };
}

function tree() {
  const pstreeResult = runSafeSync('pstree', ['-p']);
  if (pstreeResult.status === 0 && pstreeResult.stdout) {
    return { raw: pstreeResult.stdout.substring(0, 5000), method: 'pstree' };
  }
  const psResult = runSafeSync('ps', ['--forest', '--no-headers', '-o', 'pid,ppid,user,%cpu,%mem,stat,comm']);
  if (psResult.status === 0 && psResult.stdout) {
    return { raw: psResult.stdout.substring(0, 5000), method: 'ps-forest' };
  }
  return { raw: 'Unable to generate process tree', method: 'none' };
}

function listSignals() {
  return SIGNAL_NAMES.map(name => ({ name: name, number: SIGNALS[name] }));
}

module.exports = { list, details, kill, sendSignal, tree, listSignals, SIGNALS, KILL_RATE_LIMIT };
