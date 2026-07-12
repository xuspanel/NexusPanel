const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_FILE = path.join(__dirname, '..', '..', 'data', 'alerts.json');
const HISTORY_FILE = path.join(__dirname, '..', '..', 'data', 'alert-history.json');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {
    return { enabled: true, cooldown: 30, email: '', webhook: '', thresholds: { cpu: 90, mem: 85, disk: 90, service: true } };
  }
}

function saveConfig(config) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); }

function getHistory() { try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch { return []; } }

function addAlert(type, threshold, current) {
  const alerts = getHistory();
  alerts.push({ type, threshold, current, timestamp: new Date().toISOString() });
  if (alerts.length > 500) alerts.splice(0, alerts.length - 500);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(alerts, null, 2));

  const config = loadConfig();
  if (config.email) {
    try {
      execSync('sendmail -t -oi', { input: [
        'From: NexusPanel Alerts <alerts@nexuspanel.local>',
        'To: ' + config.email,
        'Subject: [NexusPanel Alert] ' + type.toUpperCase() + ' threshold exceeded',
        'Content-Type: text/plain; charset=utf-8', '',
        'Alert: ' + type + ' is at ' + current + '% (threshold: ' + threshold + '%)',
        'Server: ' + (process.env.SERVER_LOCATION || 'unknown'),
        'Time: ' + new Date().toISOString(),
      ].join('\n'), encoding: 'utf8', timeout: 10000 });
    } catch {}
  }
  if (config.webhook) {
    try {
      fetch(config.webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, threshold, current, timestamp: new Date().toISOString(), server: process.env.SERVER_LOCATION || 'unknown' }),
        signal: AbortSignal.timeout(5000) }).catch(() => {});
    } catch {}
  }
}

var lastAlert = {};

function checkMetrics(metrics) {
  var config = loadConfig();
  if (!config.enabled) return;
  var now = Date.now();
  var cooldownMs = (config.cooldown || 30) * 60000;

  if (metrics.cpu > config.thresholds.cpu && (!lastAlert.cpu || (now - lastAlert.cpu) > cooldownMs)) {
    addAlert('cpu', config.thresholds.cpu, Math.round(metrics.cpu));
    lastAlert.cpu = now;
  }
  if (metrics.memUsed / metrics.memTotal * 100 > config.thresholds.mem && (!lastAlert.mem || (now - lastAlert.mem) > cooldownMs)) {
    var pct = Math.round(metrics.memUsed / metrics.memTotal * 100);
    addAlert('memory', config.thresholds.mem, pct);
    lastAlert.mem = now;
  }
  if (metrics.diskUsed / metrics.diskTotal * 100 > config.thresholds.disk && (!lastAlert.disk || (now - lastAlert.disk) > cooldownMs)) {
    var pct = Math.round(metrics.diskUsed / metrics.diskTotal * 100);
    addAlert('disk', config.thresholds.disk, pct);
    lastAlert.disk = now;
  }
}

function getConfig() { return loadConfig(); }
function updateConfig(updates) { var c = loadConfig(); Object.assign(c, updates); saveConfig(c); return c; }

module.exports = { checkMetrics, getConfig, updateConfig, getHistory };
