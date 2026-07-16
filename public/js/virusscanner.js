let scannerState = {
  scanId: null,
  pollTimer: null,
  target: null,
};

window.initVirusScanner = async function () {
  try {
    const me = await API.me();
    if (me.role !== 'admin') {
      document.getElementById('scannerContent').innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">⚠</span><span class="db-error-text">Admin access required</span></div>';
      return;
    }
    await loadStatus();
    await loadQuarantine();
  } catch {
    document.getElementById('scannerContent').innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">⚠</span><span class="db-error-text">Session expired</span></div>';
  }
};

async function loadStatus() {
  try {
    const status = await API.virusscanner.defsStatus();
    const el = document.getElementById('scannerStatusBadge');
    if (!status.installed) {
      el.innerHTML = '<span class="scanner-badge danger">ClamAV Not Installed</span>';
      document.getElementById('scannerNoClam').style.display = 'flex';
      document.getElementById('scannerReady').style.display = 'none';
      setClamInstallCmd();
    } else {
      el.innerHTML = '<span class="scanner-badge ok">ClamAV ' + escHtml(status.version) + '</span> <span class="scanner-defs">Defs: ' + escHtml(status.defsDate || 'unknown') + '</span>';
      document.getElementById('scannerNoClam').style.display = 'none';
      document.getElementById('scannerReady').style.display = 'block';
    }
  } catch {}
}

async function loadQuarantine() {
  try {
    const data = await API.virusscanner.listQuarantine();
    renderQuarantine(data.items || []);
  } catch {}
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, function (c) {
    return '&#' + c.charCodeAt(0) + ';';
  });
}

async function setClamInstallCmd() {
  try {
    const sys = await API.getStats();
    const os = (sys.os || '').toLowerCase();
    const cmd = (os.includes('ubuntu') || os.includes('debian'))
      ? 'apt-get install -y clamav clamav-daemon && freshclam'
      : 'dnf install -y clamav clamav-update && freshclam';
    document.getElementById('clamInstallCmd').textContent = cmd;
  } catch {}
}

function selectTarget(target, el) {
  document.querySelectorAll('.scanner-target').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  document.getElementById('scannerCustomPathWrap').style.display = target === 'custom' ? 'block' : 'none';
  scannerState.target = target;
}

function getTargetDisplay(target) {
  const labels = { home: 'Entire Home Directory', mail: 'Mail', ftp: 'Public FTP Space', web: 'Public Web Space', custom: 'Specific Directory' };
  return labels[target] || target;
}

async function startScan() {
  const target = scannerState.target;
  if (!target) { showScannerToast('Select a scan target', 'error'); return; }
  const customPath = target === 'custom' ? document.getElementById('scannerCustomPath').value.trim() : null;
  if (target === 'custom' && !customPath) { showScannerToast('Enter a directory path', 'error'); return; }

  scannerState.scanId = null;
  document.getElementById('scannerProgress').style.display = 'block';
  document.getElementById('scannerProgressBar').style.width = '0%';
  document.getElementById('scannerProgressScan').textContent = '0';
  document.getElementById('scannerProgressInfected').textContent = '0';
  document.getElementById('scannerProgressErrors').textContent = '0';
  document.getElementById('scannerProgressLabel').textContent = 'Starting scan of ' + escHtml(getTargetDisplay(target)) + '...';
  document.getElementById('scannerResults').style.display = 'none';
  document.getElementById('scannerQuarantineResult').style.display = 'none';
  document.getElementById('scannerStartBtn').disabled = true;
  document.getElementById('scannerStartBtn').textContent = 'Scanning...';

  try {
    const res = await API.virusscanner.startScan(target, customPath);
    scannerState.scanId = res.scanId;
    pollScan();
  } catch (err) {
    showScannerToast(err.message, 'error');
    document.getElementById('scannerStartBtn').disabled = false;
    document.getElementById('scannerStartBtn').textContent = '▶ Start Scan';
    document.getElementById('scannerProgress').style.display = 'none';
  }
}

function pollScan() {
  if (scannerState.pollTimer) clearTimeout(scannerState.pollTimer);
  if (!scannerState.scanId) return;
  scannerState.pollTimer = setTimeout(async () => {
    try {
      const status = await API.virusscanner.getScanStatus(scannerState.scanId);
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
    const pct = Math.min(100, Math.round((status.scanned / (status.scanned + 1)) * 100));
    document.getElementById('scannerProgressBar').style.width = pct + '%';
  }
  document.getElementById('scannerProgressScan').textContent = status.scanned;
  document.getElementById('scannerProgressInfected').textContent = status.infected;
  document.getElementById('scannerProgressErrors').textContent = status.errors;
  const elapsed = Math.floor(status.elapsed / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
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
  document.getElementById('scannerStartBtn').disabled = false;
  document.getElementById('scannerStartBtn').textContent = '▶ Start Scan';
  try {
    const results = await API.virusscanner.getScanResults(scanId);
    const el = document.getElementById('scannerResults');
    el.style.display = 'block';
    const infectedCount = results.infectedFiles ? results.infectedFiles.length : 0;
    let html = '<div class="scanner-summary">';
    if (results.aborted) {
      html += '<span class="scanner-badge warning">⚠ Aborted</span> ';
    } else {
      html += infectedCount === 0
        ? '<span class="scanner-badge ok">✅ Clean</span> '
        : '<span class="scanner-badge danger">🔴 ' + infectedCount + ' infected</span> ';
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
      html += '<button class="db-btn db-btn-primary" id="scannerQuarantineBtn" onclick="quarantineAll(\'' + escHtml(scanId) + '\')">📦 Move All Infected to Quarantine</button>';
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
    showScannerToast('Scan aborted', 'warning');
  } catch {}
}

async function quarantineAll(scanId) {
  try {
    const res = await API.virusscanner.quarantine(scanId);
    const el = document.getElementById('scannerQuarantineResult');
    el.style.display = 'block';
    el.innerHTML = '<span class="scanner-badge ok">✅ ' + res.quarantined.length + ' files moved to quarantine</span>';
    document.getElementById('scannerQuarantineBtn').disabled = true;
    document.getElementById('scannerQuarantineBtn').textContent = '✅ Quarantined';
    await loadQuarantine();
  } catch (err) {
    showScannerToast('Quarantine error: ' + err.message, 'error');
  }
}

function renderQuarantine(items) {
  const el = document.getElementById('scannerQuarantineList');
  const countEl = document.getElementById('scannerQuarantineCount');
  if (!items || items.length === 0) {
    el.innerHTML = '<div class="scanner-empty">No quarantined files</div>';
    if (countEl) countEl.textContent = '0';
    return;
  }
  if (countEl) countEl.textContent = items.length;
  el.innerHTML = items.map(function (item) {
    return '<div class="scanner-q-item">'
      + '<div class="scanner-q-info">'
      + '<div class="scanner-q-path" title="' + escHtml(item.originalPath) + '">' + escHtml(item.fileName) + '</div>'
      + '<div class="scanner-q-meta">' + escHtml(item.originalPath || item.quarantinedPath) + (item.threat ? ' — ' + escHtml(item.threat) : '') + '</div>'
      + '</div>'
      + '<div class="scanner-q-actions">'
      + '<button class="db-btn db-btn-sm" onclick="restoreQuarantine(\'' + escHtml(item.quarantineId) + '\', \'' + escHtml(item.quarantinedPath) + '\')" title="Restore">↩</button>'
      + '<button class="db-btn db-btn-sm db-btn-danger" onclick="deleteQuarantine(\'' + escHtml(item.quarantineId) + '\', \'' + escHtml(item.quarantinedPath) + '\')" title="Delete">🗑</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

async function restoreQuarantine(qid, filePath) {
  if (!confirm('Restore this file to its original location?')) return;
  try {
    await API.virusscanner.restoreQuarantine(qid, filePath);
    showScannerToast('File restored', 'success');
    await loadQuarantine();
  } catch (err) {
    showScannerToast(err.message, 'error');
  }
}

async function deleteQuarantine(qid, filePath) {
  if (!confirm('Permanently delete this quarantined file?')) return;
  try {
    await API.virusscanner.deleteQuarantine(qid, filePath);
    showScannerToast('File deleted', 'success');
    await loadQuarantine();
  } catch (err) {
    showScannerToast(err.message, 'error');
  }
}

async function updateDefs() {
  const btn = document.getElementById('scannerUpdateDefsBtn');
  btn.disabled = true;
  btn.textContent = 'Updating...';
  try {
    const res = await API.virusscanner.updateDefs();
    if (res.success) {
      showScannerToast('Virus definitions updated', 'success');
      await loadStatus();
    } else {
      showScannerToast('Update failed: ' + (res.error || 'unknown'), 'error');
    }
  } catch (err) {
    showScannerToast(err.message, 'error');
  }
  btn.disabled = false;
  btn.textContent = '↻ Update Definitions';
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m + 'm ' + sec + 's';
}

let scannerToastTimer = null;
function showScannerToast(msg, type) {
  const el = document.getElementById('scannerToast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'scanner-toast ' + (type || 'info');
  el.style.display = 'block';
  if (scannerToastTimer) clearTimeout(scannerToastTimer);
  scannerToastTimer = setTimeout(function () { el.style.display = 'none'; }, 4000);
}
