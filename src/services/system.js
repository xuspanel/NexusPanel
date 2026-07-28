const { execSync } = require('child_process');
const { runSafeSync } = require('../utils/shell');
const fs = require('fs');
const path = require('path');
const os = require('os');

function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return '';
  }
}

function getIPv4() {
  const data = exec("ip route get 1.1.1.1 2>/dev/null | awk '{print $7}'");
  if (data && data !== '1.1.1.1') return data;
  const fallback = exec("hostname -I 2>/dev/null | awk '{print $1}'");
  return fallback && fallback !== '127.0.0.1' ? fallback : 'N/A';
}

function getIPv6() {
  const data = exec("ip -6 addr show | grep -oP 'inet6 \\K[^/]+' | grep -v '^::1$' | grep -v '^fe80'");
  return data || 'N/A';
}

function getHostname() {
  return os.hostname() || exec('hostname') || 'N/A';
}

function getOS() {
  try {
    const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
    const name = osRelease.match(/^PRETTY_NAME="(.+)"$/m);
    if (name) return name[1];
    const id = osRelease.match(/^ID="?(\w+)"?$/m);
    const version = osRelease.match(/^VERSION_ID="?([\d.]+)"?$/m);
    return id && version ? `${id[1]} ${version[1]}` : osRelease.match(/^NAME="(.+)"$/m)?.[1] || 'Linux';
  } catch {
    return os.type() + ' ' + os.release();
  }
}

function getUptime() {
  try {
    const uptimeSeconds = Math.floor(os.uptime());
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);
    return parts.join(' ');
  } catch {
    return exec('uptime -p') || 'N/A';
  }
}

function getCPUInfo() {
  let cores = os.cpus().length;
  const model = os.cpus()[0]?.model || '';
  const load = os.loadavg();
  return { cores: cores.toString(), model, load: load[0].toFixed(2) };
}

function getMemory() {
  try {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const usedGB = (used / 1073741824).toFixed(1);
    const totalGB = (total / 1073741824).toFixed(1);
    const percent = ((used / total) * 100).toFixed(1);
    return { used: usedGB, total: totalGB, percent, usedBytes: used, totalBytes: total };
  } catch {
    const data = exec("free -b | awk '/Mem:/ {print $2,$3}'");
    if (data) {
      const [total, used] = data.split(' ').map(Number);
      const usedGB = (used / 1073741824).toFixed(1);
      const totalGB = (total / 1073741824).toFixed(1);
      const percent = ((used / total) * 100).toFixed(1);
      return { used: usedGB, total: totalGB, percent, usedBytes: used, totalBytes: total };
    }
    return { used: '0', total: '0', percent: '0', usedBytes: 0, totalBytes: 1 };
  }
}

function getDiskUsage() {
  try {
    const data = exec("df -B1 / 2>/dev/null | awk 'NR==2 {print $2,$3,$4,$5}'");
    if (data) {
      const parts = data.split(' ');
      const total = parseInt(parts[0]);
      const used = parseInt(parts[1]);
      const avail = parseInt(parts[2]);
      const percent = parts[3].replace('%', '');
      return {
        total: formatBytes(total),
        used: formatBytes(used),
        avail: formatBytes(avail),
        percent,
        usedBytes: used,
        totalBytes: total
      };
    }
  } catch {}
  return { total: '0', used: '0', avail: '0', percent: '0', usedBytes: 0, totalBytes: 1 };
}

let prevCpu = getCpuTimes();
function getCpuTimes() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
}

function getCPUUsage() {
  const current = getCpuTimes();
  const idleDelta = current.idle - prevCpu.idle;
  const totalDelta = current.total - prevCpu.total;
  prevCpu = current;
  if (totalDelta === 0) return '0.0';
  const usage = ((1 - idleDelta / totalDelta) * 100).toFixed(1);
  return usage;
}

function getSSHUser() {
  try {
    const envFile = '/etc/nexus-ssh-user';
    if (fs.existsSync(envFile)) {
      return fs.readFileSync(envFile, 'utf8').trim();
    }
    return process.env.SSH_USER || 'root';
  } catch {
    return 'root';
  }
}

function getServerLocation() {
  try {
    const envFile = '/etc/nexus-location';
    if (fs.existsSync(envFile)) {
      return fs.readFileSync(envFile, 'utf8').trim();
    }
    return process.env.SERVER_LOCATION || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

function getTraffic() {
  try {
    const data = fs.readFileSync('/proc/net/dev', 'utf8');
    const lines = data.split('\n');
    let ethRegex = /^\s*(eth\d+|ens\d+|enp\ds\d+|eno\d+|enx\w+):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/;
    let totalRx = 0, totalTx = 0, mainIface = '';
    for (const line of lines) {
      const match = line.match(ethRegex);
      if (match) {
        if (!mainIface) mainIface = match[1];
        totalRx += parseInt(match[2]);
        totalTx += parseInt(match[3]);
      }
    }
    if (!mainIface) {
      const fallbackRegex = /^\s*([\w-]+):\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/;
      for (const line of lines) {
        const match = line.match(fallbackRegex);
        if (match && match[1] !== 'lo' && !match[1].startsWith('docker') && !match[1].startsWith('br-') && !match[1].startsWith('veth') && !match[1].startsWith('tun')) {
          if (!mainIface) mainIface = match[1];
          totalRx += parseInt(match[2]);
          totalTx += parseInt(match[3]);
        }
      }
    }
    return {
      rx: (totalRx / 1073741824).toFixed(2),
      tx: (totalTx / 1073741824).toFixed(2),
      rxFormatted: formatBytes(totalRx),
      txFormatted: formatBytes(totalTx),
      interface: mainIface || 'eth0'
    };
  } catch {
    return { rx: '0', tx: '0', rxFormatted: '0 B', txFormatted: '0 B', interface: 'eth0' };
  }
}

function getBandwidth() {
  const traffic = getTraffic();
  return `↓ ${traffic.rxFormatted} / ↑ ${traffic.txFormatted}`;
}

function isRebooting() {
  try {
    const output = exec('systemctl is-system-running');
    return output === 'stopping' || output === 'degraded' && fs.existsSync('/run/nologin');
  } catch {
    return false;
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function getStats() {
  const cpuUsage = getCPUUsage();
  const traffic = getTraffic();
  const memory = getMemory();
  const cpuInfo = getCPUInfo();

  return {
    ipv4: getIPv4(),
    ipv6: getIPv6(),
    hostname: getHostname(),
    serverLocation: getServerLocation(),
    os: getOS(),
    uptime: getUptime(),
    sshUser: getSSHUser(),
    cpuCores: cpuInfo.cores,
    cpuModel: cpuInfo.model,
    cpuLoad: cpuInfo.load,
    cpuUsage,
    memory: {
      used: memory.used,
      total: memory.total,
      percent: memory.percent,
      usedFormatted: formatBytes(memory.usedBytes),
      totalFormatted: formatBytes(memory.totalBytes)
    },
    bandwidth: getBandwidth(),
    disk: getDiskUsage(),
    traffic: {
      rx: traffic.rx,
      tx: traffic.tx,
      rxFormatted: traffic.rxFormatted,
      txFormatted: traffic.txFormatted
    },
    rebooting: isRebooting(),
    rootAccess: `ssh ${getSSHUser()}@${getIPv4()}`
  };
}

const SERVICE_LIST = ['nginx', 'php-fpm', 'postgresql', 'vsftpd', 'docker'];

function getServiceHealth() {
  return SERVICE_LIST.map(name => {
    const r = runSafeSync('systemctl', ['is-active', name], { timeout: 3000 });
    return { name, active: r.stdout.trim() === 'active' };
  });
}

function getQuickStats() {
  let domainCount = 0;
  let userCount = 0;
  let containerCount = 0;

  try {
    const domainsFile = path.join(__dirname, '..', '..', 'data', 'domains.json');
    if (fs.existsSync(domainsFile)) {
      const domains = JSON.parse(fs.readFileSync(domainsFile, 'utf8'));
      domainCount = Array.isArray(domains) ? domains.length : 0;
    }
  } catch {}

  try {
    const usersFile = path.join(__dirname, '..', '..', 'data', 'users.json');
    if (fs.existsSync(usersFile)) {
      const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
      userCount = Array.isArray(users) ? users.length : 0;
    }
  } catch {}

  try {
    const r = runSafeSync('docker', ['ps', '-q'], { timeout: 5000 });
    const ids = r.stdout.trim().split('\n').filter(Boolean);
    containerCount = ids.length;
  } catch {}

  return { domainCount, userCount, containerCount };
}

module.exports = { getStats, isRebooting, getServiceHealth, getQuickStats };
