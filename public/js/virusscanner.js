(function () {
  let scannerState = {
    scanId: null,
    pollTimer: null,
    target: null,
    quarantineSearch: '',
    quarantinePage: 1,
    historySearch: '',
    historySort: 'timestamp',
    historyDir: 'desc',
    historyPage: 1,
    deleteModalData: null,
  };

  const QUARANTINE_PER_PAGE = 20;
  const HISTORY_PER_PAGE = 15;

  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return '&#' + c.charCodeAt(0) + ';';
    });
  }

  function formatElapsed(ms) {
    var s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    var m = Math.floor(s / 60);
    var sec = s % 60;
    return m + 'm ' + sec + 's';
  }

  function formatDate(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  }

  function getTargetDisplay(target) {
    var labels = { home: 'Entire Home Directory', mail: 'Mail', ftp: 'Public FTP Space', web: 'Public Web Space', custom: 'Specific Directory' };
    return labels[target] || target;
  }

  function showToast(msg, type) {
    var el = document.getElementById('scannerToast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'scanner-toast ' + (type || 'info');
    el.style.display = 'block';
    if (scannerState._toastTimer) clearTimeout(scannerState._toastTimer);
    scannerState._toastTimer = setTimeout(function () { el.style.display = 'none'; }, 4000);
  }

  function setButtonLoading(btn, loading, originalText) {
    if (!btn) return;
    if (loading) {
      btn.disabled = true;
      btn.dataset.vsOriginalText = btn.textContent;
      btn.textContent = originalText || 'Loading...';
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.vsOriginalText || originalText || btn.textContent;
    }
  }

  window.initVirusScanner = async function () {
    try {
      var me = await API.me();
      if (me.role !== 'admin') {
        document.getElementById('scannerContent').innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">Admin access required</span></div>';
        return;
      }
      await loadStatus();
      await loadQuarantine();
      await loadScanHistory();
    } catch {
      document.getElementById('scannerContent').innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">!</span><span class="db-error-text">Session expired</span></div>';
    }
  };

  async function loadStatus() {
    try {
      var status = await API.virusscanner.defsStatus();
      var el = document.getElementById('scannerStatusBadge');
      if (!status.installed) {
        el.innerHTML = '<span class="scanner-badge danger">ClamAV Not Installed</span>';
        document.getElementById('scannerNoClam').style.display = 'flex';
        document.getElementById('scannerReady').style.display = 'none';
        setClamInstallCmd();
      } else {
        var html = '<span class="scanner-badge ok">ClamAV ' + escHtml(status.version) + '</span> <span class="scanner-defs">Defs: ' + escHtml(status.defsDate || 'unknown') + '</span>';
        if (status.stale) {
          html += ' <span class="scanner-badge warning">Defs Stale (7+ days)</span>';
        }
        el.innerHTML = html;
        document.getElementById('scannerNoClam').style.display = 'none';
        document.getElementById('scannerReady').style.display = 'block';
      }
    } catch {}
  }

  async function setClamInstallCmd() {
    try {
      var sys = await API.getStats();
      var os = (sys.os || '').toLowerCase();
      var cmd = (os.includes('ubuntu') || os.includes('debian'))
        ? 'apt-get install -y clamav clamav-daemon && freshclam'
        : 'dnf install -y clamav clamav-update && freshclam';
      document.getElementById('clamInstallCmd').textContent = cmd;
    } catch {}
  }

  function selectTarget(target) {
    document.querySelectorAll('.scanner-target').forEach(function (c) { c.classList.remove('active'); });
    var el = document.querySelector('[data-vs-action="select-target"][data-vs-value="' + target + '"]');
    if (el) el.classList.add('active');
    document.getElementById('scannerCustomPathWrap').style.display = target === 'custom' ? 'block' : 'none';
    scannerState.target = target;
  }

  async function startScan() {
    var target = scannerState.target;
    if (!target) { showToast('Select a scan target', 'error'); return; }
    var customPath = target === 'custom' ? document.getElementById('scannerCustomPath').value.trim() : null;
    if (target === 'custom' && !customPath) { showToast('Enter a directory path', 'error'); return; }

    var btn = document.getElementById('scannerStartBtn');
    setButtonLoading(btn, true, 'Scanning...');
    scannerState.scanId = null;
    document.getElementById('scannerProgress').style.display = 'block';
    document.getElementById('scannerProgressBar').style.width = '0%';
    document.getElementById('scannerProgressScan').textContent = '0';
    document.getElementById('scannerProgressInfected').textContent = '0';
    document.getElementById('scannerProgressErrors').textContent = '0';
    document.getElementById('scannerProgressLabel').textContent = 'Starting scan of ' + escHtml(getTargetDisplay(target)) + '...';
    document.getElementById('scannerResults').style.display = 'none';
    document.getElementById('scannerQuarantineResult').style.display = 'none';

    try {
      var res = await API.virusscanner.startScan(target, customPath);
      scannerState.scanId = res.scanId;
      pollScan();
    } catch (err) {
      showToast(err.message, 'error');
      setButtonLoading(btn, false, '\u25b6 Start Scan');
      document.getElementById('scannerProgress').style.display = 'none';
    }
  }

  function pollScan() {
    if (scannerState.pollTimer) clearTimeout(scannerState.pollTimer);
    if (!scannerState.scanId) return;
    scannerState.pollTimer = setTimeout(async function () {
      try {
        var status = await API.virusscanner.getScanStatus(scannerState.scanId);
        if (!status) { stopPoll(); return; }
        updateProgress(status);
        if (!status.done) { pollScan(); return; }
        stopPoll();
        showResults(scannerState.scanId);
      } catch {
        stopPoll();
      }
    }, 1500);
  }

  function stopPoll() {
    if (scannerState.pollTimer) { clearTimeout(scannerState.pollTimer); scannerState.pollTimer = null; }
  }

  function updateProgress(status) {
    if (status.scanned > 0) {
      var pct = Math.min(100, Math.round((status.scanned / (status.scanned + 1)) * 100));
      document.getElementById('scannerProgressBar').style.width = pct + '%';
    }
    document.getElementById('scannerProgressScan').textContent = status.scanned;
    document.getElementById('scannerProgressInfected').textContent = status.infected;
    document.getElementById('scannerProgressErrors').textContent = status.errors;
    var elapsed = Math.floor(status.elapsed / 1000);
    var mins = Math.floor(elapsed / 60);
    var secs = elapsed % 60;
    document.getElementById('scannerProgressTime').textContent = mins + 'm ' + secs + 's';
    document.getElementById('scannerProgressLabel').textContent = status.aborted
      ? 'Scan aborted'
      : 'Scanning ' + escHtml(getTargetDisplay(status.target)) + '... (' + status.scanned + ' files)';
    if (status.done) {
      document.getElementById('scannerProgressBar').style.width = '100%';
      document.getElementById('scannerProgressLabel').textContent = status.aborted ? 'Scan aborted' : 'Scan complete';
    }
  }

  async function showResults(scanId) {
    var btn = document.getElementById('scannerStartBtn');
    setButtonLoading(btn, false, '\u25b6 Start Scan');
    try {
      var results = await API.virusscanner.getScanResults(scanId);
      var el = document.getElementById('scannerResults');
      el.style.display = 'block';
      var infectedCount = results.infectedFiles ? results.infectedFiles.length : 0;
      var html = '<div class="scanner-summary">';
      if (results.aborted) {
        html += '<span class="scanner-badge warning">Aborted</span> ';
      } else {
        html += infectedCount === 0
          ? '<span class="scanner-badge ok">Clean</span> '
          : '<span class="scanner-badge danger">' + infectedCount + ' infected</span> ';
      }
      html += escHtml(results.scanned) + ' files scanned, ' + escHtml(results.infected) + ' infected, ' + escHtml(results.errors) + ' errors';
      html += ' <span class="scanner-elapsed">(' + formatElapsed(results.elapsed) + ')</span>';
      html += '</div>';

      if (results.infectedFiles && results.infectedFiles.length > 0) {
        html += '<div class="scanner-infected-list">';
        results.infectedFiles.forEach(function (f) {
          html += '<div class="scanner-infected-item">';
          html += '<span class="scanner-infected-path">' + escHtml(f.path) + '</span>';
          html += '<span class="scanner-infected-threat">' + escHtml(f.threat) + '</span>';
          html += '</div>';
        });
        html += '</div>';
        html += '<button class="db-btn db-btn-primary" id="scannerQuarantineBtn" data-vs-action="quarantine-all" data-vs-scan-id="' + escHtml(scanId) + '">Move All Infected to Quarantine</button>';
      } else {
        html += '<div class="scanner-no-infected">No threats detected</div>';
      }
      el.innerHTML = html;
    } catch {}
  }

  async function abortScan() {
    if (!scannerState.scanId) return;
    try {
      await API.virusscanner.abortScan(scannerState.scanId);
      showToast('Scan aborted', 'warning');
    } catch {}
  }

  async function quarantineAll(scanId) {
    var btn = document.getElementById('scannerQuarantineBtn');
    setButtonLoading(btn, true, 'Quarantining...');
    try {
      var res = await API.virusscanner.quarantine(scanId);
      var el = document.getElementById('scannerQuarantineResult');
      el.style.display = 'block';
      el.innerHTML = '<span class="scanner-badge ok">' + res.quarantined.length + ' files moved to quarantine</span>';
      setButtonLoading(btn, false, 'Quarantined');
      btn.disabled = true;
      await loadQuarantine();
    } catch (err) {
      showToast('Quarantine error: ' + err.message, 'error');
      setButtonLoading(btn, false, 'Move All Infected to Quarantine');
    }
  }

  async function loadQuarantine() {
    try {
      var data = await API.virusscanner.listQuarantine();
      renderQuarantine(data.items || []);
    } catch {}
  }

  function renderQuarantine(items) {
    var el = document.getElementById('scannerQuarantineList');
    var countEl = document.getElementById('scannerQuarantineCount');
    var paginationEl = document.getElementById('scannerQuarantinePagination');

    if (!items || items.length === 0) {
      el.innerHTML = '<div class="scanner-empty">No quarantined files</div>';
      if (countEl) countEl.textContent = '0';
      if (paginationEl) paginationEl.innerHTML = '';
      return;
    }

    if (countEl) countEl.textContent = items.length;

    var filtered = items;
    if (scannerState.quarantineSearch) {
      var q = scannerState.quarantineSearch.toLowerCase();
      filtered = items.filter(function (item) {
        return (item.fileName && item.fileName.toLowerCase().includes(q)) ||
          (item.originalPath && item.originalPath.toLowerCase().includes(q)) ||
          (item.threat && item.threat.toLowerCase().includes(q));
      });
    }

    var total = filtered.length;
    var page = scannerState.quarantinePage;
    var pages = Math.ceil(total / QUARANTINE_PER_PAGE);
    if (page > pages) page = pages || 1;
    scannerState.quarantinePage = page;
    var start = (page - 1) * QUARANTINE_PER_PAGE;
    var pageItems = filtered.slice(start, start + QUARANTINE_PER_PAGE);

    el.innerHTML = pageItems.map(function (item) {
      return '<div class="scanner-q-item">'
        + '<div class="scanner-q-info">'
        + '<div class="scanner-q-path" title="' + escHtml(item.originalPath) + '">' + escHtml(item.fileName) + '</div>'
        + '<div class="scanner-q-meta">' + escHtml(item.originalPath || item.quarantinedPath) + (item.threat ? ' — ' + escHtml(item.threat) : '') + '</div>'
        + (item.sha256 ? '<div class="scanner-q-hash">SHA-256: ' + escHtml(item.sha256.substring(0, 16)) + '...</div>' : '')
        + '</div>'
        + '<div class="scanner-q-actions">'
        + '<button class="db-btn db-btn-sm" data-vs-action="restore-quarantine" data-vs-qid="' + escHtml(item.quarantineId) + '" data-vs-path="' + escHtml(item.quarantinedPath) + '" title="Restore">Restore</button>'
        + '<button class="db-btn db-btn-sm db-btn-danger" data-vs-action="delete-quarantine" data-vs-qid="' + escHtml(item.quarantineId) + '" data-vs-path="' + escHtml(item.quarantinedPath) + '" title="Delete">Delete</button>'
        + '</div>'
        + '</div>';
    }).join('');

    if (paginationEl) {
      if (pages <= 1) { paginationEl.innerHTML = ''; return; }
      var ph = '<div class="scanner-pagination">';
      ph += '<button class="db-btn db-btn-sm" data-vs-action="q-prev-page" ' + (page <= 1 ? 'disabled' : '') + '>Prev</button>';
      ph += '<span class="scanner-pagination-info">Page ' + page + ' of ' + pages + '</span>';
      ph += '<button class="db-btn db-btn-sm" data-vs-action="q-next-page" ' + (page >= pages ? 'disabled' : '') + '>Next</button>';
      ph += '</div>';
      paginationEl.innerHTML = ph;
    }
  }

  function showDeleteModal(type, data) {
    scannerState.deleteModalData = { type: type, data: data };
    var modal = document.getElementById('scannerDeleteModal');
    var title = document.getElementById('scannerDeleteModalTitle');
    var body = document.getElementById('scannerDeleteModalBody');
    if (type === 'quarantine') {
      title.textContent = 'Delete Quarantined File';
      body.innerHTML = '<p>Permanently delete <strong>' + escHtml(data.fileName) + '</strong>?</p>'
        + '<p class="scanner-delete-modal-path">' + escHtml(data.originalPath || data.quarantinedPath) + '</p>'
        + '<p class="scanner-delete-modal-warning">This action cannot be undone.</p>';
    } else if (type === 'restore') {
      title.textContent = 'Restore Quarantined File';
      body.innerHTML = '<p>Restore <strong>' + escHtml(data.fileName) + '</strong> to its original location?</p>'
        + '<p class="scanner-delete-modal-path">' + escHtml(data.originalPath) + '</p>';
    }
    modal.style.display = 'flex';
  }

  function hideDeleteModal() {
    scannerState.deleteModalData = null;
    var modal = document.getElementById('scannerDeleteModal');
    if (modal) modal.style.display = 'none';
  }

  async function confirmDeleteModalAction() {
    var d = scannerState.deleteModalData;
    if (!d) return;
    if (d.type === 'delete-quarantine') {
      try {
        await API.virusscanner.deleteQuarantine(d.data.qid, d.data.path);
        showToast('File deleted', 'success');
        await loadQuarantine();
      } catch (err) {
        showToast(err.message, 'error');
      }
    } else if (d.type === 'restore') {
      try {
        await API.virusscanner.restoreQuarantine(d.data.qid, d.data.path);
        showToast('File restored', 'success');
        await loadQuarantine();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
    hideDeleteModal();
  }

  async function updateDefs() {
    var btn = document.getElementById('scannerUpdateDefsBtn');
    setButtonLoading(btn, true, 'Updating...');
    try {
      var res = await API.virusscanner.updateDefs();
      if (res.success) {
        showToast('Virus definitions updated', 'success');
        await loadStatus();
      } else {
        showToast('Update failed: ' + (res.error || 'unknown'), 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
    setButtonLoading(btn, false, '\u21bb');
  }

  async function loadScanHistory() {
    try {
      var params = {
        page: scannerState.historyPage,
        limit: HISTORY_PER_PAGE,
        sort: scannerState.historySort,
        dir: scannerState.historyDir,
      };
      if (scannerState.historySearch) params.search = scannerState.historySearch;
      var result = await API.virusscanner.getScanHistory(params);
      renderScanHistory(result);
    } catch {}
  }

  function renderScanHistory(result) {
    var el = document.getElementById('scannerHistoryList');
    var paginationEl = document.getElementById('scannerHistoryPagination');
    if (!el) return;

    if (!result.items || result.items.length === 0) {
      el.innerHTML = '<div class="scanner-empty">No scan history yet</div>';
      if (paginationEl) paginationEl.innerHTML = '';
      return;
    }

    el.innerHTML = result.items.map(function (h) {
      var statusBadge;
      if (h.aborted) {
        statusBadge = '<span class="scanner-badge warning">Aborted</span>';
      } else if (h.infected > 0) {
        statusBadge = '<span class="scanner-badge danger">' + h.infected + ' infected</span>';
      } else {
        statusBadge = '<span class="scanner-badge ok">Clean</span>';
      }
      return '<div class="scanner-history-item">'
        + '<div class="scanner-history-info">'
        + '<div class="scanner-history-main">'
        + '<span class="scanner-history-target">' + escHtml(getTargetDisplay(h.target)) + '</span>'
        + '<span class="scanner-history-path">' + escHtml(h.path) + '</span>'
        + '</div>'
        + '<div class="scanner-history-meta">'
        + statusBadge + ' '
        + '<span>' + escHtml(h.scanned) + ' files</span> '
        + '<span class="scanner-history-elapsed">' + formatElapsed(h.elapsed) + '</span> '
        + '<span class="scanner-history-date">' + formatDate(h.timestamp) + '</span>'
        + '</div>'
        + '</div>'
        + '</div>';
    }).join('');

    if (paginationEl && result.pages > 1) {
      var ph = '<div class="scanner-pagination">';
      ph += '<button class="db-btn db-btn-sm" data-vs-action="hist-prev-page" ' + (result.page <= 1 ? 'disabled' : '') + '>Prev</button>';
      ph += '<span class="scanner-pagination-info">Page ' + result.page + ' of ' + result.pages + '</span>';
      ph += '<button class="db-btn db-btn-sm" data-vs-action="hist-next-page" ' + (result.page >= result.pages ? 'disabled' : '') + '>Next</button>';
      ph += '</div>';
      paginationEl.innerHTML = ph;
    } else if (paginationEl) {
      paginationEl.innerHTML = '';
    }
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-vs-action]');
    if (!btn) return;
    var action = btn.dataset.vsAction;

    switch (action) {
      case 'select-target':
        e.preventDefault();
        selectTarget(btn.dataset.vsValue);
        break;
      case 'start-scan':
        e.preventDefault();
        startScan();
        break;
      case 'abort-scan':
        e.preventDefault();
        abortScan();
        break;
      case 'quarantine-all':
        e.preventDefault();
        quarantineAll(btn.dataset.vsScanId);
        break;
      case 'restore-quarantine':
        e.preventDefault();
        showDeleteModal('restore', {
          qid: btn.dataset.vsQid,
          path: btn.dataset.vsPath,
          fileName: btn.closest('.scanner-q-item').querySelector('.scanner-q-path').textContent,
          originalPath: btn.closest('.scanner-q-item').querySelector('.scanner-q-meta').textContent.split(' — ')[0],
        });
        break;
      case 'delete-quarantine':
        e.preventDefault();
        showDeleteModal('delete-quarantine', {
          qid: btn.dataset.vsQid,
          path: btn.dataset.vsPath,
          fileName: btn.closest('.scanner-q-item').querySelector('.scanner-q-path').textContent,
          originalPath: btn.closest('.scanner-q-item').querySelector('.scanner-q-meta').textContent.split(' — ')[0],
          quarantinedPath: btn.dataset.vsPath,
        });
        break;
      case 'update-defs':
        e.preventDefault();
        updateDefs();
        break;
      case 'confirm-delete':
        e.preventDefault();
        confirmDeleteModalAction();
        break;
      case 'cancel-delete':
        e.preventDefault();
        hideDeleteModal();
        break;
      case 'q-prev-page':
        e.preventDefault();
        if (scannerState.quarantinePage > 1) {
          scannerState.quarantinePage--;
          loadQuarantine();
        }
        break;
      case 'q-next-page':
        e.preventDefault();
        scannerState.quarantinePage++;
        loadQuarantine();
        break;
      case 'hist-prev-page':
        e.preventDefault();
        if (scannerState.historyPage > 1) {
          scannerState.historyPage--;
          loadScanHistory();
        }
        break;
      case 'hist-next-page':
        e.preventDefault();
        scannerState.historyPage++;
        loadScanHistory();
        break;
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'scannerQuarantineSearch') {
      scannerState.quarantineSearch = e.target.value;
      scannerState.quarantinePage = 1;
      loadQuarantine();
    }
    if (e.target.id === 'scannerHistorySearch') {
      scannerState.historySearch = e.target.value;
      scannerState.historyPage = 1;
      loadScanHistory();
    }
  });
})();
