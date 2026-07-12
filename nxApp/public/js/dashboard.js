let cpuChartInstance = null;
let pollInterval = null;
let isRebootingFlag = false;
let dashboardInitialized = false;

function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  let w, h;
  let running = true;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  class Particle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * w;
      this.y = Math.random() * h;
      this.size = Math.random() * 2 + 0.5;
      this.speedX = (Math.random() - 0.5) * 0.3;
      this.speedY = (Math.random() - 0.5) * 0.3;
      this.opacity = Math.random() * 0.5 + 0.1;
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      if (this.x < 0 || this.x > w || this.y < 0 || this.y > h) this.reset();
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = (window.getParticleColor || function(o) { return 'rgba(6,182,212,' + o + ')'; })(this.opacity);
      ctx.fill();
    }
  }

  const count = Math.min(Math.floor(w * h / 15000), 100);
  for (let i = 0; i < count; i++) particles.push(new Particle());

  function connectParticles() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          const lineOpacity = 0.06 * (1 - dist / 120);
          ctx.strokeStyle = (window.getParticleColor || function(o) { return 'rgba(6,182,212,' + o + ')'; })(lineOpacity);
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  function animate() {
    if (!running) return;
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => { p.update(); p.draw(); });
    connectParticles();
    requestAnimationFrame(animate);
  }
  animate();

  window.reinitParticles = function () {
    running = false;
    ctx.clearRect(0, 0, w, h);
    particles = [];
    for (let i = 0; i < count; i++) particles.push(new Particle());
    running = true;
    requestAnimationFrame(animate);
  };
  return function () { running = false; };
}

function updateClock() {
  const now = new Date();
  const time = document.getElementById('headerTime');
  if (time) {
    time.textContent = now.toLocaleTimeString('en-US', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }
}

function copyRootCommand() {
  const text = document.getElementById('homeRootCommandText') || document.getElementById('rootCommandText');
  if (text) {
    navigator.clipboard.writeText(text.textContent).catch(() => {});
    const hint = document.querySelector('.copy-hint');
    if (hint) {
      hint.textContent = '✅ Copied!';
      setTimeout(() => { hint.textContent = '📋 Click to copy'; }, 2000);
    }
  }
}

function navigateTo(view) {
  const btn = document.querySelector('.side-nav-item[data-view="' + view + '"]');
  if (btn) btn.click();
}

function renderHomeCards() {
  const grid = document.getElementById('homeCardsGrid');
  if (!grid) return;

  const sections = [
    { name: 'Server', icon: '🖥️', cards: [
      { view: 'terminal', icon: '💻', title: 'Terminal', desc: 'Interactive server shell', gradient: 'linear-gradient(135deg, #64748b, #475569)' },
      { view: 'services', icon: '⚙️', title: 'Service Manager', desc: 'Systemd start/stop/restart', gradient: 'linear-gradient(135deg, #10b981, #059669)' },
      { view: 'processes', icon: '📊', title: 'Process Manager', desc: 'Live process monitoring & kill', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
      { view: 'logs', icon: '📝', title: 'Log Viewer', desc: 'System log browser & search', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
      { view: 'cron', icon: '⏰', title: 'Cron Jobs', desc: 'Crontab editor & scheduler', gradient: 'linear-gradient(135deg, #ec4899, #be185d)' },
      { view: 'updates', icon: '🔄', title: 'System Updates', desc: 'dnf package check & apply', gradient: 'linear-gradient(135deg, #f97316, #ea580c)' },
    ]},
    { name: 'Web', icon: '🌐', cards: [
      { view: 'domains', icon: '🌐', title: 'Domains', desc: 'nginx virtual hosts & SSL', gradient: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' },
      { view: 'ssl', icon: '🔒', title: 'SSL Certificates', desc: 'Let\'s Encrypt issue & renew', gradient: 'linear-gradient(135deg, #14b8a6, #0d9488)' },
      { view: 'phpfpm', icon: '🐘', title: 'PHP-FPM Manager', desc: 'PHP pool config & restart', gradient: 'linear-gradient(135deg, #8b5cf6, #6366f1)' },
    ]},
    { name: 'Data', icon: '🗄️', cards: [
      { view: 'databases', icon: '🗄️', title: 'Databases', desc: 'PostgreSQL management & queries', gradient: 'linear-gradient(135deg, #10b981, #06b6d4)' },
      { view: 'files', icon: '📁', title: 'File Manager', desc: 'Browse, upload, edit server files', gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)' },
      { view: 'backups', icon: '💾', title: 'Backups', desc: 'Backup wizard & archive manager', gradient: 'linear-gradient(135deg, #f97316, #dc2626)' },
      { view: 'emails', icon: '✉️', title: 'Emails', desc: 'Email accounts & webmail client', gradient: 'linear-gradient(135deg, #f59e0b, #ef4444)' },
      { view: 'ftp', icon: '📡', title: 'FTP', desc: 'FTP accounts & vsftpd config', gradient: 'linear-gradient(135deg, #d946ef, #ec4899)' },
    ]},
    { name: 'Security', icon: '🛡️', cards: [
      { view: 'virusscanner', icon: '🛡️', title: 'Virus Scanner', desc: 'ClamAV malware detection & quarantine', gradient: 'linear-gradient(135deg, #ef4444, #f97316)' },
      { view: 'firewall', icon: '🛡️', title: 'Firewall Rules', desc: 'iptables chain & rule manager', gradient: 'linear-gradient(135deg, #ef4444, #b91c1c)' },
      { view: 'audit', icon: '📜', title: 'Audit Trail', desc: 'Admin activity log & history', gradient: 'linear-gradient(135deg, #64748b, #475569)' },
    ]},
    { name: 'DevOps', icon: '🐳', cards: [
      { view: 'docker', icon: '🐳', title: 'Docker', desc: 'Container & image management', gradient: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' },
      { view: 'mimetypes', icon: '📋', title: 'MIME Types', desc: 'System & custom MIME type manager', gradient: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' },
      { view: 'users', icon: '👥', title: 'Users', desc: 'System user & permission manager', gradient: 'linear-gradient(135deg, #06b6d4, #d946ef)' },
    ]},
    { name: 'Account', icon: '👤', cards: [
      { view: 'profile', icon: '👤', title: 'Profile', desc: 'Account settings & 2FA', gradient: 'linear-gradient(135deg, #475569, #64748b)' },
    ]},
  ];

  grid.innerHTML = sections.map(s => `
    <div class="home-section">
      <div class="home-sub-header">
        <span class="home-sub-icon">${s.icon}</span>
        <span class="home-sub-title">${s.name}</span>
      </div>
      <div class="home-sub-grid">
        ${s.cards.map(c => `
          <div class="home-card" onclick="navigateTo('${c.view}')" style="--card-grad: ${c.gradient}">
            <div class="home-card-glow"></div>
            <div class="home-card-icon">${c.icon}</div>
            <div class="home-card-title">${c.title}</div>
            <div class="home-card-desc">${c.desc}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function updateStatusBadge(stats) {
  const badge = document.getElementById('homeStatusBadge') || document.getElementById('statusBadge');
  if (!badge) return;
  if (stats.rebooting) {
    badge.innerHTML = '<span class="status-dot rebooting"></span>Rebooting';
  } else {
    badge.innerHTML = '<span class="status-dot online"></span>Online';
  }
}

function updateDashboard(stats) {
  document.getElementById('homeHeroSubtitle').textContent = stats.hostname ? stats.hostname + ' • VPS Control Center' : 'VPS Control Center';

  document.getElementById('homeStatCores').textContent = stats.cpuCores || '—';
  document.getElementById('homeStatRam').textContent = stats.memory ? stats.memory.total + ' GB' : '—';
  document.getElementById('homeStatUptime').textContent = stats.uptime || '—';
  document.getElementById('homeStatOS').textContent = stats.os ? stats.os.split(' ')[0] : '—';

  document.getElementById('homeRootCommandText').textContent = stats.rootAccess || 'ssh root@—';

  if (stats.memory) {
    const percent = parseFloat(stats.memory.percent);
    document.getElementById('homeRamText').textContent = stats.memory.usedFormatted + ' used of ' + stats.memory.totalFormatted;
    document.getElementById('homeRamPercent').textContent = percent + '%';
    const ramFill = document.getElementById('homeRamFill');
    ramFill.style.width = Math.min(percent, 100) + '%';
    ramFill.className = 'progress-fill ' + (
      percent > 90 ? 'progress-fill-red' : percent > 70 ? 'progress-fill-gold' : 'progress-fill-green'
    );
  }

  if (stats.disk) {
    const diskPercent = parseFloat(stats.disk.percent);
    document.getElementById('homeDiskText').textContent = stats.disk.used + ' used of ' + stats.disk.total;
    document.getElementById('homeDiskPercent').textContent = diskPercent + '%';
    const diskFill = document.getElementById('homeDiskFill');
    diskFill.style.width = Math.min(diskPercent, 100) + '%';
    diskFill.className = 'progress-fill ' + (
      diskPercent > 90 ? 'progress-fill-red' : diskPercent > 75 ? 'progress-fill-gold' : 'progress-fill-cyan'
    );
  }

  const cpuPercent = parseFloat(stats.cpuUsage || 0);
  document.getElementById('homeCpuPercent').textContent = cpuPercent + '%';
  const cpuFill = document.getElementById('homeCpuFill');
  cpuFill.style.width = Math.min(cpuPercent, 100) + '%';
  cpuFill.className = 'progress-fill ' + (
    cpuPercent > 90 ? 'progress-fill-red' : cpuPercent > 70 ? 'progress-fill-gold' : 'progress-fill-green'
  );

  if (stats.traffic) {
    document.getElementById('homeTrafficRx').textContent = stats.traffic.rxFormatted || '0 B';
    document.getElementById('homeTrafficTx').textContent = stats.traffic.txFormatted || '0 B';
  }

  updateStatusBadge(stats);

  const rebootStatus = document.getElementById('homeRebootStatus');
  if (stats.rebooting) {
    isRebootingFlag = true;
    showRebootOverlay();
    if (rebootStatus) rebootStatus.textContent = '⚠ Server is rebooting...';
  } else {
    isRebootingFlag = false;
    if (rebootStatus) rebootStatus.textContent = 'Server is running normally';
  }
}

function showRebootOverlay() {
  document.getElementById('rebootOverlay').classList.add('active');
}

function hideRebootOverlay() {
  document.getElementById('rebootOverlay').classList.remove('active');
}

async function fetchStats() {
  if (isRebootingFlag) {
    try {
      const status = await API.rebootStatus();
      if (!status.rebooting) {
        isRebootingFlag = false;
        hideRebootOverlay();
        location.reload();
      }
    } catch {}
    return;
  }
  try {
    const stats = await API.getStats();
    updateDashboard(stats);
  } catch (err) {
    if (err.message === 'Unauthorized' || err.message === 'Session expired') {
      clearInterval(pollInterval);
      location.reload();
    }
  }
}

async function initDashboard() {
  if (dashboardInitialized) {
    await fetchStats();
    return;
  }
  dashboardInitialized = true;
  updateClock();
  setInterval(updateClock, 1000);

  renderHomeCards();
  loadHistoryCharts();

  await fetchStats();
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(fetchStats, 5000);

  document.getElementById('homeRebootBtn').addEventListener('click', async () => {
    if (isRebootingFlag) return;
    const btn = document.getElementById('homeRebootBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="icon">⏳</span> Rebooting...';
    try {
      await API.reboot();
      document.getElementById('homeRebootStatus').textContent = '⚠ Reboot scheduled in 1 minute...';
      isRebootingFlag = true;
    } catch (err) {
      btn.innerHTML = '<span class="icon">🔃</span> Reboot Server';
      btn.disabled = false;
      document.getElementById('homeRebootStatus').textContent = '✖ Failed to initiate reboot';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const rootCmd = document.getElementById('homeRootCommand') || document.getElementById('rootCommand');
  if (rootCmd) rootCmd.addEventListener('click', copyRootCommand);
});

window.initParticles = initParticles;
window.initDashboard = initDashboard;
window.navigateTo = navigateTo;

/* ─── Resource History Charts ─── */
var historyCharts = {};
var historyPeriod = '24h';

async function loadHistoryCharts() {
  var container = document.getElementById('homeHistoryCharts');
  if (!container) return;
  try {
    var data = await API.metrics.history(historyPeriod);
    if (!data || !data.length) { container.innerHTML = ''; return; }
    renderHistoryCharts(data);
  } catch (e) {}
}

function renderHistoryCharts(data) {
  var container = document.getElementById('homeHistoryCharts');
  if (!data.length) { container.innerHTML = ''; return; }

  var labels = data.map(function(d) { return new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); });
  var common = { type: 'line', options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
    scales: { x: { display: false }, y: { display: false, min: 0 } },
    elements: { point: { radius: 0 }, line: { borderWidth: 2, tension: 0.3 } } } };

  Object.values(historyCharts).forEach(function(c) { try { c.destroy(); } catch {} });
  historyCharts = {};
  var charts = [
    { id: 'chartCpu', label: 'CPU %', data: data.map(d => d.cpu), color: '#06b6d4', bg: 'rgba(6,182,212,0.1)' },
    { id: 'chartMem', label: 'Memory GB', data: data.map(d => d.memUsed / 1024 / 1024), color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
    { id: 'chartDisk', label: 'Disk GB', data: data.map(d => d.diskUsed / 1024 / 1024), color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
    { id: 'chartNet', label: 'Network MB', data: [], color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  ];

  charts.forEach(function(c) {
    var canvas = document.getElementById(c.id);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var cfg = JSON.parse(JSON.stringify(common));
    cfg.data = { labels: labels, datasets: [{ data: c.data, borderColor: c.color, backgroundColor: c.bg, fill: true }] };
    historyCharts[c.id] = new Chart(ctx, cfg);
  });
}

function switchHistoryPeriod(period, btn) {
  historyPeriod = period;
  document.querySelectorAll('.home-period-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  loadHistoryCharts();
}
