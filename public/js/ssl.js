(function () {
  var sslState = { certs: [], search: '', sort: 'expiry', loading: false, error: null, autoRenew: null };
  var _toastTimer = null;

  function esc(s) { if (!s) return ''; return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }

  function showLoading() {
    var el = document.getElementById('sslContent');
    if (el) el.innerHTML = '<div class="db-loading"><div class="db-loading-spinner"></div><div class="db-loading-text">Loading certificates...</div></div>';
  }

  function showError(msg) {
    var el = document.getElementById('sslContent');
    if (el) el.innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">' + esc(msg) + '</span></div>';
  }

  function showToast(msg, type) {
    var el = document.getElementById('sslToast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'ssl-toast ' + (type || 'info');
    el.style.display = 'block';
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { el.style.display = 'none'; }, 4000);
  }

  function showConfirm(msg, onConfirm) {
    var overlay = document.getElementById('sslConfirmOverlay');
    var msgEl = document.getElementById('sslConfirmMsg');
    if (!overlay || !msgEl) { onConfirm(); return; }
    msgEl.textContent = msg;
    overlay.style.display = 'flex';
    var yesBtn = document.getElementById('sslConfirmYes');
    var noBtn = document.getElementById('sslConfirmNo');
    function close() { overlay.style.display = 'none'; yesBtn.onclick = null; noBtn.onclick = null; }
    yesBtn.onclick = function () { close(); onConfirm(); };
    noBtn.onclick = close;
  }

  function renderSummary(certs) {
    var total = certs.length;
    var expiring = certs.filter(function (c) { return c.daysLeft !== null && c.daysLeft > 0 && c.daysLeft <= 30; }).length;
    var expired = certs.filter(function (c) { return c.daysLeft !== null && c.daysLeft <= 0; }).length;
    var ecdsa = certs.filter(function (c) { return c.keyType === 'ECDSA'; }).length;
    var rsa = certs.filter(function (c) { return c.keyType === 'RSA'; }).length;
    var html = '<div class="ssl-summary-bar">';
    html += '<div class="ssl-stat-badge"><span class="ssl-stat-value">' + total + '</span><span class="ssl-stat-label">Total</span></div>';
    html += '<div class="ssl-stat-badge ssl-stat-expiring"><span class="ssl-stat-value">' + expiring + '</span><span class="ssl-stat-label">Expiring</span></div>';
    html += '<div class="ssl-stat-badge ssl-stat-expired"><span class="ssl-stat-value">' + expired + '</span><span class="ssl-stat-label">Expired</span></div>';
    html += '<div class="ssl-stat-badge ssl-stat-ecdsa"><span class="ssl-stat-value">' + ecdsa + '</span><span class="ssl-stat-label">ECDSA</span></div>';
    html += '<div class="ssl-stat-badge ssl-stat-rsa"><span class="ssl-stat-value">' + rsa + '</span><span class="ssl-stat-label">RSA</span></div>';
    html += '</div>';
    return html;
  }

  function renderAutoRenew(autoRenew) {
    if (!autoRenew) return '';
    var html = '<div class="ssl-autorenew">';
    var cronActive = !!autoRenew.cron;
    var dotClass = cronActive ? 'ssl-autorenew-dot active' : 'ssl-autorenew-dot inactive';
    html += '<div class="' + dotClass + '"></div>';
    html += '<span class="ssl-autorenew-label">Auto-Renewal</span>';
    if (autoRenew.cron) {
      html += '<span class="ssl-autorenew-schedule">Cron: ' + esc(autoRenew.cron) + '</span>';
    }
    if (autoRenew.timerEnabled) {
      html += '<span class="ssl-autorenew-schedule">Timer: ' + esc(autoRenew.timerEnabled) + '</span>';
    }
    if (autoRenew.lastRun) {
      html += '<span class="ssl-autorenew-last">Last run: ' + esc(autoRenew.lastRun) + '</span>';
    }
    html += '</div>';
    return html;
  }

  function renderCerts() {
    var el = document.getElementById('sslContent');
    if (!el) return;
    var searchVal = sslState.search;
    var sortVal = sslState.sort;
    var certs = sslState.certs.slice();
    if (searchVal) {
      var q = searchVal.toLowerCase();
      certs = certs.filter(function (c) {
        return c.domain.toLowerCase().indexOf(q) !== -1 ||
          c.serial.toLowerCase().indexOf(q) !== -1 ||
          c.keyType.toLowerCase().indexOf(q) !== -1;
      });
    }
    var sortKey = sortVal;
    certs.sort(function (a, b) {
      if (sortKey === 'domain') return a.domain.localeCompare(b.domain);
      if (sortKey === 'daysLeft') return (a.daysLeft || 0) - (b.daysLeft || 0);
      if (sortKey === 'keyType') return (a.keyType || '').localeCompare(b.keyType || '');
      var da = a.expiry ? new Date(a.expiry).getTime() : 0;
      var db = b.expiry ? new Date(b.expiry).getTime() : 0;
      return da - db;
    });
    var html = renderSummary(sslState.certs);
    html += renderAutoRenew(sslState.autoRenew);
    html += '<div class="ssl-toolbar">';
    html += '<input class="ssl-search" id="sslSearchInput" type="text" placeholder="Search certificates..." value="' + esc(searchVal) + '">';
    html += '<div class="ssl-sort-group">';
    var sortFields = [['expiry', 'Expiry'], ['domain', 'Domain'], ['daysLeft', 'Days Left'], ['keyType', 'Key Type']];
    for (var i = 0; i < sortFields.length; i++) {
      var sf = sortFields[i];
      var active = sortVal === sf[0] ? ' active' : '';
      html += '<button class="ssl-sort-btn' + active + '" data-ssl-action="sort" data-ssl-sort="' + sf[0] + '">' + sf[1] + '</button>';
    }
    html += '</div></div>';
    if (certs.length === 0) {
      html += '<div class="db-empty">' + (searchVal ? 'No certificates match your search' : 'No SSL certificates found') + '</div>';
    } else {
      html += '<div class="ssl-list">';
      for (var j = 0; j < certs.length; j++) {
        var c = certs[j];
        var badge = c.daysLeft !== null ? (c.daysLeft <= 0 ? 'danger' : c.daysLeft <= 30 ? 'warning' : 'ok') : 'unknown';
        var daysText = c.daysLeft !== null ? (c.daysLeft <= 0 ? 'EXPIRED' : c.daysLeft + 'd') : 'N/A';
        var keyBadge = c.keyType === 'ECDSA' ? 'keytype-ecdsa' : c.keyType === 'RSA' ? 'keytype-rsa' : '';
        html += '<div class="ssl-card">';
        html += '<div class="ssl-card-main">';
        html += '<div class="ssl-card-left">';
        html += '<div class="ssl-domain">' + esc(c.domain) + '</div>';
        html += '<div class="ssl-meta">';
        if (c.keyType) html += '<span class="ssl-badge ' + keyBadge + '">' + esc(c.keyType) + '</span>';
        if (c.serial) html += '<span class="ssl-serial">' + esc(c.serial.substring(0, 20)) + (c.serial.length > 20 ? '...' : '') + '</span>';
        html += '</div></div>';
        html += '<div class="ssl-card-right">';
        html += '<div class="ssl-expiry-block">';
        html += '<span class="ssl-badge ssl-badge-expiry ' + badge + '">' + daysText + '</span>';
        html += '</div>';
        html += '<div class="ssl-actions">';
        html += '<button class="fm-btn fm-btn-sm" data-ssl-action="detail" data-ssl-domain="' + esc(c.domain) + '">Details</button>';
        html += '<button class="fm-btn fm-btn-sm" data-ssl-action="renew" data-ssl-domain="' + esc(c.domain) + '">Renew</button>';
        html += '<button class="fm-btn fm-btn-sm fm-btn-danger" data-ssl-action="delete" data-ssl-domain="' + esc(c.domain) + '">Delete</button>';
        html += '</div></div></div></div>';
      }
      html += '</div>';
    }
    el.innerHTML = html;
    var searchInput = document.getElementById('sslSearchInput');
    if (searchInput) {
      searchInput.value = searchVal;
      searchInput.focus();
      var len = searchInput.value.length;
      searchInput.setSelectionRange(len, len);
      searchInput.addEventListener('input', function () {
        sslState.search = this.value;
        renderCerts();
      });
    }
  }

  window.initSSL = async function () {
    var me = await API.me();
    if (me.role !== 'admin') return;
    bindEvents();
    loadCerts();
    loadAutoRenew();
  };

  function bindEvents() {
    var contentEl = document.getElementById('sslContent');
    if (contentEl && !contentEl._sslBound) {
      contentEl._sslBound = true;
      contentEl.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-ssl-action]');
        if (!btn) return;
        var action = btn.dataset.sslAction;
        var domain = btn.dataset.sslDomain;
        if (action === 'detail') sslDetail(domain);
        else if (action === 'renew') sslRenew(domain);
        else if (action === 'delete') sslDelete(domain);
        else if (action === 'sort') {
          sslState.sort = btn.dataset.sslSort;
          renderCerts();
        }
      });
    }
    var issueBtn = document.getElementById('sslIssueBtn');
    if (issueBtn && !issueBtn._sslBound) {
      issueBtn._sslBound = true;
      issueBtn.addEventListener('click', sslIssueForm);
    }
    var refreshBtn = document.getElementById('sslRefreshBtn');
    if (refreshBtn && !refreshBtn._sslBound) {
      refreshBtn._sslBound = true;
      refreshBtn.addEventListener('click', function () { loadCerts(); loadAutoRenew(); });
    }
    var renewAllBtn = document.getElementById('sslRenewAllBtn');
    if (renewAllBtn && !renewAllBtn._sslBound) {
      renewAllBtn._sslBound = true;
      renewAllBtn.addEventListener('click', sslRenewAll);
    }
    var dryRunBtn = document.getElementById('sslDryRunBtn');
    if (dryRunBtn && !dryRunBtn._sslBound) {
      dryRunBtn._sslBound = true;
      dryRunBtn.addEventListener('click', sslDryRun);
    }
    var modalOverlay = document.getElementById('sslModalOverlay');
    if (modalOverlay && !modalOverlay._sslBound) {
      modalOverlay._sslBound = true;
      modalOverlay.addEventListener('click', function (e) { if (e.target === this) this.style.display = 'none'; });
    }
    var modalClose = document.getElementById('sslModalClose');
    if (modalClose) modalClose.addEventListener('click', function () { document.getElementById('sslModalOverlay').style.display = 'none'; });
    var modalSubmit = document.getElementById('sslModalSubmit');
    if (modalSubmit) modalSubmit.addEventListener('click', sslIssue);
    var modalCancel = document.getElementById('sslModalCancel');
    if (modalCancel) modalCancel.addEventListener('click', function () { document.getElementById('sslModalOverlay').style.display = 'none'; });
    var detailOverlay = document.getElementById('sslDetailOverlay');
    if (detailOverlay && !detailOverlay._sslBound) {
      detailOverlay._sslBound = true;
      detailOverlay.addEventListener('click', function (e) { if (e.target === this) this.style.display = 'none'; });
    }
    var detailClose = document.getElementById('sslDetailClose');
    if (detailClose) detailClose.addEventListener('click', function () { document.getElementById('sslDetailOverlay').style.display = 'none'; });
    var dryRunOverlay = document.getElementById('sslDryRunOverlay');
    if (dryRunOverlay && !dryRunOverlay._sslBound) {
      dryRunOverlay._sslBound = true;
      dryRunOverlay.addEventListener('click', function (e) { if (e.target === this) this.style.display = 'none'; });
    }
    var dryRunClose = document.getElementById('sslDryRunClose');
    if (dryRunClose) dryRunClose.addEventListener('click', function () { document.getElementById('sslDryRunOverlay').style.display = 'none'; });
  }

  async function loadCerts() {
    sslState.loading = true;
    sslState.error = null;
    showLoading();
    try {
      sslState.certs = await API.ssl.list();
      sslState.loading = false;
      renderCerts();
    } catch (e) {
      sslState.loading = false;
      sslState.error = e.message;
      showError('Failed to load certificates: ' + e.message);
    }
  }

  async function loadAutoRenew() {
    try {
      sslState.autoRenew = await API.ssl.autoRenewStatus();
      renderCerts();
    } catch (_) {}
  }

  async function sslDetail(domain) {
    var el = document.getElementById('sslDetailContent');
    var overlay = document.getElementById('sslDetailOverlay');
    if (!el || !overlay) return;
    el.innerHTML = '<div class="db-loading"><div class="db-loading-spinner"></div></div>';
    overlay.style.display = 'flex';
    try {
      var d = await API.ssl.detail(domain);
      var html = '<div class="ssl-detail-grid">';
      html += '<div class="ssl-detail-row"><span class="ssl-detail-label">Domain</span><span class="ssl-detail-value">' + esc(d.domain) + '</span></div>';
      html += '<div class="ssl-detail-row"><span class="ssl-detail-label">Subject</span><span class="ssl-detail-value">' + esc(d.subject) + '</span></div>';
      html += '<div class="ssl-detail-row"><span class="ssl-detail-label">Issuer</span><span class="ssl-detail-value">' + esc(d.issuer) + '</span></div>';
      html += '<div class="ssl-detail-row"><span class="ssl-detail-label">Serial</span><span class="ssl-detail-value ssl-fingerprint">' + esc(d.serial) + '</span></div>';
      html += '<div class="ssl-detail-row"><span class="ssl-detail-label">Key Type</span><span class="ssl-detail-value"><span class="ssl-badge ' + (d.keyType === 'ECDSA' ? 'keytype-ecdsa' : 'keytype-rsa') + '">' + esc(d.keyType) + '</span>' + (d.keySize ? ' ' + d.keySize + ' bit' : '') + '</span></div>';
      html += '<div class="ssl-detail-row"><span class="ssl-detail-label">Signature</span><span class="ssl-detail-value">' + esc(d.signatureAlgorithm) + '</span></div>';
      html += '<div class="ssl-detail-row"><span class="ssl-detail-label">Valid From</span><span class="ssl-detail-value">' + esc(d.notBefore) + '</span></div>';
      html += '<div class="ssl-detail-row"><span class="ssl-detail-label">Valid Until</span><span class="ssl-detail-value">' + esc(d.notAfter) + '</span></div>';
      var badge = d.daysLeft !== null ? (d.daysLeft <= 0 ? 'danger' : d.daysLeft <= 30 ? 'warning' : 'ok') : 'unknown';
      html += '<div class="ssl-detail-row"><span class="ssl-detail-label">Days Left</span><span class="ssl-detail-value"><span class="ssl-badge ssl-badge-expiry ' + badge + '">' + (d.daysLeft !== null ? d.daysLeft + ' days' : 'N/A') + '</span></span></div>';
      html += '<div class="ssl-detail-row"><span class="ssl-detail-label">SANs</span><span class="ssl-detail-value">' + (d.san ? d.san.map(esc).join(', ') : '—') + '</span></div>';
      html += '<div class="ssl-detail-row"><span class="ssl-detail-label">SHA-256</span><span class="ssl-detail-value ssl-fingerprint">' + esc(d.fingerprint) + '</span></div>';
      html += '<div class="ssl-detail-row"><span class="ssl-detail-label">Cert Path</span><span class="ssl-detail-value ssl-fingerprint">' + esc(d.certPath) + '</span></div>';
      html += '<div class="ssl-detail-row"><span class="ssl-detail-label">Key Path</span><span class="ssl-detail-value ssl-fingerprint">' + esc(d.keyPath) + '</span></div>';
      html += '</div>';
      el.innerHTML = html;
    } catch (e) {
      el.innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">' + esc(e.message) + '</span></div>';
    }
  }

  function sslIssueForm() {
    var el = document.getElementById('sslDomain');
    if (el) el.value = '';
    var em = document.getElementById('sslEmail');
    if (em) em.value = '';
    var st = document.getElementById('sslStaging');
    if (st) st.checked = false;
    var errEl = document.getElementById('sslIssueError');
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
    document.getElementById('sslModalOverlay').style.display = 'flex';
  }

  async function sslIssue() {
    var domain = document.getElementById('sslDomain').value.trim();
    var email = document.getElementById('sslEmail').value.trim();
    var staging = document.getElementById('sslStaging').checked;
    var errEl = document.getElementById('sslIssueError');
    var btn = document.getElementById('sslModalSubmit');
    if (!domain) { if (errEl) { errEl.textContent = 'Domain is required'; errEl.style.display = 'block'; } return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Issuing...'; }
    try {
      var r = await API.ssl.issue(domain, { email: email || undefined, staging: staging || undefined });
      if (r.success) {
        showToast('Certificate issued for ' + domain, 'success');
        document.getElementById('sslModalOverlay').style.display = 'none';
        loadCerts();
      } else {
        if (errEl) { errEl.textContent = r.error || 'Issuance failed'; errEl.style.display = 'block'; }
      }
    } catch (e) {
      if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; }
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Issue Certificate'; }
  }

  function sslRenew(domain) {
    showConfirm('Renew certificate for ' + domain + '?', async function () {
      try {
        showToast('Renewing certificate for ' + domain + '...', 'info');
        var r = await API.ssl.renew(domain);
        if (r.success) {
          showToast('Certificate renewed for ' + domain, 'success');
          loadCerts();
        } else {
          showToast('Renewal failed: ' + (r.error || 'Unknown error'), 'error');
        }
      } catch (e) { showToast('Error: ' + e.message, 'error'); }
    });
  }

  function sslRenewAll() {
    var count = sslState.certs.length;
    showConfirm('Force-renew all ' + count + ' certificates?', async function () {
      try {
        showToast('Renewing all certificates...', 'info');
        var r = await API.ssl.renewAll();
        showToast('Renewal complete: ' + r.renewed + ' renewed, ' + r.failed + ' failed', r.failed > 0 ? 'warning' : 'success');
        loadCerts();
      } catch (e) { showToast('Error: ' + e.message, 'error'); }
    });
  }

  function sslDelete(domain) {
    showConfirm('Permanently delete the certificate for ' + domain + '? This cannot be undone.', async function () {
      try {
        var r = await API.ssl.remove(domain);
        if (r.success) {
          showToast('Certificate deleted for ' + domain, 'success');
          loadCerts();
        } else {
          showToast('Delete failed: ' + (r.error || 'Unknown error'), 'error');
        }
      } catch (e) { showToast('Error: ' + e.message, 'error'); }
    });
  }

  async function sslDryRun() {
    var el = document.getElementById('sslDryRunContent');
    var overlay = document.getElementById('sslDryRunOverlay');
    if (!el || !overlay) return;
    el.innerHTML = '<div class="db-loading"><div class="db-loading-spinner"></div><div class="db-loading-text">Running renewal test...</div></div>';
    overlay.style.display = 'flex';
    try {
      var r = await API.ssl.dryRun();
      var html = '<div class="ssl-dryrun-header">';
      html += '<span class="ssl-badge ' + (r.success ? 'ssl-badge-expiry ok' : 'ssl-badge-expiry danger') + '">' + (r.success ? 'All Passed' : 'Some Failed') + '</span>';
      html += '</div>';
      if (r.results && r.results.length > 0) {
        html += '<div class="ssl-dryrun-list">';
        for (var i = 0; i < r.results.length; i++) {
          var rr = r.results[i];
          html += '<div class="ssl-dryrun-row">';
          html += '<span class="ssl-dryrun-icon">' + (rr.status === 'ok' ? '&#10003;' : '&#10007;') + '</span>';
          html += '<span class="ssl-dryrun-cert">' + esc(rr.cert) + '</span>';
          html += '<span class="ssl-dryrun-msg">' + esc(rr.message) + '</span>';
          html += '</div>';
        }
        html += '</div>';
      } else {
        html += '<div class="db-empty">No certificates to renew</div>';
      }
      el.innerHTML = html;
    } catch (e) {
      el.innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">' + esc(e.message) + '</span></div>';
    }
  }
})();
