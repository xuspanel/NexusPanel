(function () {
  var state = {
    cpuChart: null,
    historyCharts: {},
    historyPeriod: '24h',
    historyFetching: false,
    pollInterval: null,
    isRebooting: false,
    active: true,
    dashboardInit: false,
    consecutiveErrors: 0,
    _toastTimer: null,
  };

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function $(id) { return document.getElementById(id); }

  function showToast(msg, type) {
    var el = $('dashToast');
    if (!el) return;
    if (state._toastTimer) clearTimeout(state._toastTimer);
    el.textContent = msg;
    el.className = 'dash-toast ' + (type || 'ok');
    el.style.display = 'block';
    state._toastTimer = setTimeout(function () { el.style.display = 'none'; }, 4000);
  }

  function setConnectionStatus(ok) {
    var el = $('dashConnStatus');
    if (!el) return;
    if (ok) {
      el.className = 'dash-conn-dot dash-conn-ok';
      el.title = 'Connected';
    } else {
      el.className = 'dash-conn-dot dash-conn-err';
      el.title = 'Connection lost';
    }
  }

  /* ─── CARDS ─── */

  var CARDS_DATA = [
    { name: 'Server', icon: '🖥️', cards: [
      { view: 'terminal', icon: '💻', title: 'Terminal', desc: 'Interactive server shell', gradient: 'linear-gradient(135deg, #64748b, #475569)' },
      { view: 'services', icon: '⚙️', title: 'Service Manager', desc: 'Systemd start/stop/restart', gradient: 'linear-gradient(135deg, #10b981, #059669)' },
      { view: 'processes', icon: '📊', title: 'Process Manager', desc: 'Live process monitoring & kill', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
      { view: 'logs', icon: '📝', title: 'Log Viewer', desc: 'System log browser & search', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
      { view: 'cron', icon: '⏰', title: 'Cron Jobs', desc: 'Crontab editor & scheduler', gradient: 'linear-gradient(135deg, #ec4899, #be185d)' },
      { view: 'updates', icon: '🔄', title: 'System Updates', desc: 'Package check & apply', gradient: 'linear-gradient(135deg, #f97316, #ea580c)' },
    ]},
    { name: 'Web', icon: '🌐', cards: [
      { view: 'domains', icon: '🌐', title: 'Domains', desc: 'nginx virtual hosts & SSL', gradient: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' },
      { view: 'ssl', icon: '🔒', title: 'SSL Certificates', desc: "Let's Encrypt issue & renew", gradient: 'linear-gradient(135deg, #14b8a6, #0d9488)' },
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

  function renderCards() {
    var grid = $('dashCardsGrid');
    if (!grid) return;
    grid.innerHTML = CARDS_DATA.map(function (s) {
      return '<div class="dash-section">' +
        '<div class="dash-sub-header">' +
          '<span class="dash-sub-icon" aria-hidden="true">' + esc(s.icon) + '</span>' +
          '<span class="dash-sub-title">' + esc(s.name) + '</span>' +
        '</div>' +
        '<div class="dash-sub-grid">' +
          s.cards.map(function (c) {
            return '<div class="dash-card" data-dash-action="navigate" data-view="' + esc(c.view) + '" style="--card-grad: ' + esc(c.gradient) + '" role="button" tabindex="0" aria-label="' + esc(c.title) + ': ' + esc(c.desc) + '">' +
              '<div class="dash-card-glow"></div>' +
              '<div class="dash-card-icon" aria-hidden="true">' + esc(c.icon) + '</div>' +
              '<div class="dash-card-title">' + esc(c.title) + '</div>' +
              '<div class="dash-card-desc">' + esc(c.desc) + '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ─── STATS UPDATE ─── */

  function removeSkeletons() {
    var view = $('viewDashboard');
    if (!view) return;
    view.querySelectorAll('.skeleton, .skeleton-progress').forEach(function (el) {
      el.classList.remove('skeleton', 'skeleton-text', 'skeleton-inline', 'skeleton-progress');
      if (el.tagName === 'SPAN' && !el.textContent.trim()) el.textContent = '';
    });
  }

  function progressClass(percent, thresholds) {
    if (percent > (thresholds[0] || 90)) return 'progress-fill-red';
    if (percent > (thresholds[1] || 70)) return 'progress-fill-gold';
    return thresholds[2] || 'progress-fill-green';
  }

  function updateStats(stats) {
    removeSkeletons();

    var subtitle = $('dashHeroSubtitle');
    if (subtitle) subtitle.textContent = stats.hostname ? esc(stats.hostname) + ' \u2022 VPS Control Center' : 'VPS Control Center';

    var elCores = $('dashStatCores');
    if (elCores) elCores.textContent = stats.cpuCores || '\u2014';
    var elRam = $('dashStatRam');
    if (elRam) elRam.textContent = stats.memory ? stats.memory.total + ' GB' : '\u2014';
    var elUptime = $('dashStatUptime');
    if (elUptime) elUptime.textContent = stats.uptime || '\u2014';
    var elOS = $('dashStatOS');
    if (elOS) elOS.textContent = stats.os || '\u2014';

    var elCmd = $('dashRootCommandText');
    if (elCmd) elCmd.textContent = stats.rootAccess || 'ssh root@\u2014';

    if (stats.memory) {
      var pct = parseFloat(stats.memory.percent);
      var usedF = stats.memory.usedFormatted || stats.memory.used + ' GB';
      var totalF = stats.memory.totalFormatted || stats.memory.total + ' GB';
      var elText = $('dashRamText');
      if (elText) elText.textContent = usedF + ' used of ' + totalF;
      var elPct = $('dashRamPercent');
      if (elPct) elPct.textContent = pct + '%';
      var elFill = $('dashRamFill');
      if (elFill) {
        elFill.style.width = Math.min(pct, 100) + '%';
        elFill.className = 'progress-fill ' + progressClass(pct, [90, 70, 'progress-fill-green']);
      }
    }

    if (stats.disk) {
      var diskPct = parseFloat(stats.disk.percent);
      var diskUsed = stats.disk.usedFormatted || stats.disk.used;
      var diskTotal = stats.disk.totalFormatted || stats.disk.total;
      var elDText = $('dashDiskText');
      if (elDText) elDText.textContent = diskUsed + ' used of ' + diskTotal;
      var elDPct = $('dashDiskPercent');
      if (elDPct) elDPct.textContent = diskPct + '%';
      var elDFill = $('dashDiskFill');
      if (elDFill) {
        elDFill.style.width = Math.min(diskPct, 100) + '%';
        elDFill.className = 'progress-fill ' + progressClass(diskPct, [90, 75, 'progress-fill-cyan']);
      }
      var elQsDisk = $('dashQsDisks');
      if (elQsDisk) elQsDisk.textContent = diskTotal;
    }

    var cpuPct = parseFloat(stats.cpuUsage || 0);
    var elCPct = $('dashCpuPercent');
    if (elCPct) elCPpt_text(elCPct, cpuPct);
    var elCFill = $('dashCpuFill');
    if (elCFill) {
      elCFill.style.width = Math.min(cpuPct, 100) + '%';
      elCFill.className = 'progress-fill ' + progressClass(cpuPct, [90, 70, 'progress-fill-gold']);
    }

    if (stats.cpuLoad !== undefined && stats.cpuCores) {
      var elLoad = $('dashCpuLoad');
      if (elLoad) elLoad.textContent = 'Load: ' + stats.cpuLoad + ' / ' + stats.cpuCores + ' cores';
    }

    if (stats.traffic) {
      var elRx = $('dashTrafficRx');
      if (elRx) elRx.textContent = stats.traffic.rxFormatted || '0 B';
      var elTx = $('dashTrafficTx');
      if (elTx) elTx.textContent = stats.traffic.txFormatted || '0 B';
    }

    updateStatusBadge(stats);
    handleRebootStatus(stats);
  }

  function elCPct_text(el, val) { el.textContent = val + '%'; }

  function updateStatusBadge(stats) {
    var badge = $('dashStatusBadge');
    if (!badge) return;
    if (stats.rebooting) {
      badge.innerHTML = '<span class="status-dot rebooting"></span>Rebooting';
    } else {
      badge.innerHTML = '<span class="status-dot online"></span>Online';
    }
  }

  function handleRebootStatus(stats) {
    var el = $('dashRebootStatus');
    if (stats.rebooting) {
      state.isRebooting = true;
      showRebootOverlay();
      if (el) el.textContent = '\u26a0 Server is rebooting...';
    } else {
      state.isRebooting = false;
      if (el) el.textContent = 'Server is running normally';
    }
  }

  function showRebootOverlay() {
    var el = $('rebootOverlay');
    if (el) el.classList.add('active');
  }

  function hideRebootOverlay() {
    var el = $('rebootOverlay');
    if (el) el.classList.remove('active');
  }

  /* ─── SERVICE HEALTH ─── */

  function updateServiceHealth() {
    API.dashboard.serviceHealth().then(function (services) {
      var el = $('dashServiceHealth');
      if (!el) return;
      el.innerHTML = services.map(function (s) {
        var cls = s.active ? 'dash-svc-ok' : 'dash-svc-err';
        return '<span class="dash-service-badge ' + cls + '">' +
          '<span class="dash-svc-dot"></span>' +
          '<span class="dash-svc-name">' + esc(s.name) + '</span>' +
        '</span>';
      }).join('');
    }).catch(function () {});
  }

  /* ─── QUICK STATS ─── */

  function updateQuickStats() {
    API.dashboard.quickStats().then(function (data) {
      var elDomains = $('dashQsDomains');
      if (elDomains) elDomains.textContent = data.domainCount || '0';
      var elUsers = $('dashQsUsers');
      if (elUsers) elUsers.textContent = data.userCount || '0';
      var elContainers = $('dashQsContainers');
      if (elContainers) elContainers.textContent = data.containerCount || '0';
    }).catch(function () {});
  }

  /* ─── HISTORY CHARTS ─── */

  function loadHistoryCharts() {
    var errorEl = $('dashChartsError');
    if (errorEl) errorEl.style.display = 'none';
    if (state.historyFetching) return;
    state.historyFetching = true;

    API.metrics.history(state.historyPeriod).then(function (data) {
      state.historyFetching = false;
      if (!data || !data.length) {
        showChartEmpty();
        return;
      }
      hideChartEmpty();
      renderHistoryCharts(data);
    }).catch(function () {
      state.historyFetching = false;
      var errEl = $('dashChartsError');
      if (errEl) errEl.style.display = 'flex';
    });
  }

  function showChartEmpty() {
    var container = $('dashHistoryCharts');
    if (!container) return;
    container.querySelectorAll('.dash-chart-empty').forEach(function (el) { el.style.display = 'flex'; });
    container.querySelectorAll('canvas').forEach(function (el) { el.style.display = 'none'; });
  }

  function hideChartEmpty() {
    var container = $('dashHistoryCharts');
    if (!container) return;
    container.querySelectorAll('.dash-chart-empty').forEach(function (el) { el.style.display = 'none'; });
    container.querySelectorAll('canvas').forEach(function (el) { el.style.display = 'block'; });
  }

  function renderHistoryCharts(data) {
    var labels = data.map(function (d) {
      return new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    var commonOpts = {
      type: 'line',
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400, easing: 'easeOutQuart' },
        plugins: { legend: { display: false } },
        scales: { x: { display: false }, y: { display: false, min: 0 } },
        elements: { point: { radius: 0 }, line: { borderWidth: 2, tension: 0.3 } },
      }
    };

    var charts = [
      { id: 'dashChartCpu', label: 'CPU %', data: data.map(function (d) { return d.cpu; }), color: '#06b6d4', bg: 'rgba(6,182,212,0.1)' },
      { id: 'dashChartMem', label: 'Memory GB', data: data.map(function (d) { return d.memUsed / 1024 / 1024; }), color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
      { id: 'dashChartDisk', label: 'Disk GB', data: data.map(function (d) { return d.diskUsed / 1024 / 1024; }), color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
      { id: 'dashChartNet', label: 'Network MB', data: data.map(function (d) { return (d.netRx + d.netTx) / 1024 / 1024; }), color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
    ];

    charts.forEach(function (c) {
      var canvas = $(c.id);
      if (!canvas) return;

      if (state.historyCharts[c.id]) {
        state.historyCharts[c.id].data.labels = labels;
        state.historyCharts[c.id].data.datasets[0].data = c.data;
        state.historyCharts[c.id].update('none');
        return;
      }

      var ctx = canvas.getContext('2d');
      var cfg = JSON.parse(JSON.stringify(commonOpts));
      cfg.data = { labels: labels, datasets: [{ data: c.data, borderColor: c.color, backgroundColor: c.bg, fill: true }] };
      state.historyCharts[c.id] = new Chart(ctx, cfg);
    });
  }

  function switchHistoryPeriod(period, btn) {
    state.historyPeriod = period;
    document.querySelectorAll('.dash-period-btn').forEach(function (b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    Object.keys(state.historyCharts).forEach(function (k) {
      try { state.historyCharts[k].destroy(); } catch {}
    });
    state.historyCharts = {};
    loadHistoryCharts();
  }

  /* ─── REBOOT MODAL ─── */

  function showRebootModal() {
    if (state.isRebooting) return;
    var el = $('dashRebootOverlay');
    if (el) el.style.display = 'flex';
  }

  function hideRebootModal() {
    var el = $('dashRebootOverlay');
    if (el) el.style.display = 'none';
  }

  async function doReboot() {
    hideRebootModal();
    var btn = $('dashRebootBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="icon">\u23f3</span> Rebooting...';
    }
    try {
      await API.reboot();
      var status = $('dashRebootStatus');
      if (status) status.textContent = '\u26a0 Reboot scheduled in 1 minute...';
      state.isRebooting = true;
    } catch (err) {
      if (btn) {
        btn.innerHTML = '<span class="icon">\u{1f503}</span> Reboot Server';
        btn.disabled = false;
      }
      var status2 = $('dashRebootStatus');
      if (status2) status2.textContent = '\u2716 Failed to initiate reboot';
      showToast('Failed to initiate reboot', 'err');
    }
  }

  /* ─── COPY ─── */

  function copyRootCommand() {
    var text = $('dashRootCommandText');
    if (!text) return;
    navigator.clipboard.writeText(text.textContent).catch(function () {});
    var hint = $('dashCopyHint');
    if (hint) {
      hint.textContent = 'Copied!';
      setTimeout(function () { hint.textContent = 'Click to copy'; }, 2000);
    }
  }

  /* ─── NAVIGATION ─── */

  function navigateTo(view) {
    var btn = document.querySelector('.side-nav-item[data-view="' + view + '"]');
    if (btn) btn.click();
  }

  /* ─── CLOCK ─── */

  function updateClock() {
    var now = new Date();
    var time = $('headerTime');
    if (time) {
      time.textContent = now.toLocaleTimeString('en-US', {
        hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
  }

  /* ─── POLLING ─── */

  async function fetchStats() {
    if (!state.active) return;

    if (state.isRebooting) {
      try {
        var status = await API.rebootStatus();
        if (!status.rebooting) {
          state.isRebooting = false;
          hideRebootOverlay();
          location.reload();
        }
      } catch {}
      return;
    }

    try {
      var stats = await API.getStats();
      updateStats(stats);
      state.consecutiveErrors = 0;
      setConnectionStatus(true);
    } catch (err) {
      state.consecutiveErrors++;
      if (state.consecutiveErrors >= 3) setConnectionStatus(false);
      if ((err.message === 'Unauthorized' || err.message === 'Session expired') && $('loginPage') && $('loginPage').style.display !== 'flex') {
        clearInterval(state.pollInterval);
        location.reload();
      }
    }
  }

  /* ─── EVENT DELEGATION ─── */

  function setupEvents() {
    var view = $('viewDashboard');
    if (!view) return;

    view.addEventListener('click', function (e) {
      var action = e.target.closest('[data-dash-action]');
      if (!action) return;
      var act = action.getAttribute('data-dash-action');

      switch (act) {
        case 'navigate':
          navigateTo(action.getAttribute('data-view'));
          break;
        case 'switch-period':
          switchHistoryPeriod(action.getAttribute('data-period'), action);
          break;
        case 'copy-command':
          copyRootCommand();
          break;
        case 'reboot':
          showRebootModal();
          break;
        case 'confirm-reboot':
          doReboot();
          break;
        case 'cancel-reboot':
          hideRebootModal();
          break;
        case 'retry-charts':
          loadHistoryCharts();
          break;
      }
    });

    view.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var card = e.target.closest('.dash-card[data-dash-action="navigate"]');
        if (card) {
          e.preventDefault();
          navigateTo(card.getAttribute('data-view'));
        }
      }
    });
  }

  /* ─── INIT ─── */

  async function initDashboard() {
    if (!state.dashboardInit) {
      state.dashboardInit = true;
      updateClock();
      setInterval(updateClock, 1000);
      renderCards();
      setupEvents();
      loadHistoryCharts();
      updateServiceHealth();
      updateQuickStats();
      if (state.pollInterval) clearInterval(state.pollInterval);
      state.pollInterval = setInterval(function () {
        fetchStats();
        updateServiceHealth();
        updateQuickStats();
      }, 10000);
    }
    state.active = true;
    await fetchStats();
  }

  function stopDashboardPolling() {
    state.active = false;
  }

  function resumeDashboardPolling() {
    state.active = true;
  }

  /* ─── VISIBILITY ─── */

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      state.active = false;
    } else {
      state.active = true;
      if (state.dashboardInit && $('viewDashboard') && $('viewDashboard').style.display !== 'none') {
        initDashboard();
      }
    }
  });

  /* ─── EXPOSE & EVENT SUBSCRIPTIONS ─── */
  window.initDashboard = initDashboard;
  window.stopDashboardPolling = stopDashboardPolling;
  window.resumeDashboardPolling = resumeDashboardPolling;

  if (window.NexusEvents) {
    window.NexusEvents.on('service:updated', function (payload) {
      updateServiceHealth();
    });
  }
})();
