/* Git Deploy tab — deployment form, history, SSH keys, webhooks, rollback */
(function () {
  var pollTimer = null;
  var pollId = null;
  var deployments = [];

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
  }

  function toast(msg, isError) {
    var el = document.getElementById('fmToast');
    var icon = document.getElementById('fmToastIcon');
    var text = document.getElementById('fmToastMsg');
    if (!el) { alert(msg); return; }
    text.textContent = msg;
    icon.textContent = isError ? '⚠️' : '✅';
    el.className = 'fm-toast fm-toast-' + (isError ? 'error' : 'success') + ' fm-toast-show';
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function () { el.className = 'fm-toast fm-toast-' + (isError ? 'error' : 'success'); }, 3000);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    pollId = null;
  }

  function openModal(id) { document.getElementById(id).style.display = 'flex'; }
  function closeModal(id) { document.getElementById(id).style.display = 'none'; }

  function statusPill(status) {
    var labels = { running: 'Live', deploying: 'Building', failed: 'Failed', rolled_back: 'Rolled Back' };
    return '<span class="apps-status-pill apps-status-' + (status === 'deploying' ? 'installing' : status === 'running' ? 'running' : status === 'failed' ? 'failed' : 'removed') + '">' + esc(labels[status] || status) + '</span>';
  }

  /* ─── Form helpers ─── */

  async function populateSelects() {
    try {
      var uRes = await API.request('GET', '/apps/system-users');
      var sel = document.getElementById('deployUser');
      var users = uRes.users || [];
      sel.innerHTML = '<option value="">Select system user…</option>' +
        users.map(function (u) { return '<option value="' + esc(u.username) + '">' + esc(u.username) + ' (' + esc(u.home) + ')</option>'; }).join('');

      var tRes = await API.request('GET', '/apps/targets');
      var dSel = document.getElementById('deployDomain');
      var domains = tRes.domains || [];
      dSel.innerHTML = '<option value="">Select domain…</option>' +
        domains.map(function (d) { return '<option value="' + esc(d.domain) + '">' + esc(d.domain) + ' (' + esc(d.url) + ')</option>'; }).join('');
    } catch (e) { toast(e.message, true); }
  }

  async function refreshSshStatus() {
    try {
      var res = await API.request('GET', '/deploy/ssh');
      document.getElementById('deploySshStatus').textContent = res.has_key ? '✅ Stored (' + (res.stored_at || '').slice(0, 10) + ')' : 'Not set';
    } catch (_) { document.getElementById('deploySshStatus').textContent = 'Error'; }
  }

  /* ─── History table ─── */

  function renderHistory() {
    var tbody = document.getElementById('deployHistoryBody');
    if (!tbody) return;
    if (!deployments.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="apps-empty-row">No deployments yet. Fill out the form to deploy your first project.</td></tr>';
      return;
    }
    tbody.innerHTML = deployments.map(function (d) {
      var repoName = (d.repo_url || '').split('/').pop().replace('.git', '');
      var actions =
        '<button class="fm-btn fm-btn-secondary fm-btn-sm deploy-act-logs" data-id="' + esc(d.id) + '">Logs</button> ' +
        '<button class="fm-btn fm-btn-secondary fm-btn-sm deploy-act-rollback" data-id="' + esc(d.id) + '"' +
        (d.status === 'deploying' ? ' disabled title="Deploy in progress"' : '') + '>↩ Rollback</button> ' +
        '<button class="fm-btn fm-btn-secondary fm-btn-sm deploy-act-env" data-id="' + esc(d.id) + '">Env</button>';
      return '<tr>' +
        '<td title="' + esc(d.repo_url) + '">' + esc(repoName) + '</td>' +
        '<td>' + esc(d.branch) + '</td>' +
        '<td>' + esc(d.domain) + '</td>' +
        '<td class="apps-path-cell">' + esc(d.commit_hash || '—') + '</td>' +
        '<td>' + esc(d.app_type) + '</td>' +
        '<td>' + statusPill(d.status) + (d.error ? '<div class="apps-error-hint" title="' + esc(d.error) + '">' + esc(d.error.slice(0, 60)) + '</div>' : '') + '</td>' +
        '<td>' + esc((d.created_at || '').slice(0, 16).replace('T', ' ')) + '</td>' +
        '<td>' + actions + '</td>' +
        '</tr>';
    }).join('');
  }

  async function loadDeployments() {
    try {
      var res = await API.request('GET', '/deploy/history');
      deployments = res.deployments || [];
      document.getElementById('deployLoading').style.display = 'none';
      document.getElementById('deployContent').style.display = '';
      renderHistory();
      if (deployments.length > 0) {
        var last = deployments[0];
        document.getElementById('deployRecentStatus').textContent = last.status + ' — ' + esc((last.domain || ''));
      }
    } catch (e) {
      document.getElementById('deployLoading').style.display = 'none';
      toast(e.message, true);
    }
  }

  /* ─── Deploy submit ─── */

  function submitDeploy() {
    var repoUrl = document.getElementById('deployRepoUrl').value.trim();
    var branch = document.getElementById('deployBranch').value.trim() || 'main';
    var domain = document.getElementById('deployDomain').value;
    var user = document.getElementById('deployUser').value;
    var appType = document.getElementById('deployType').value;
    var buildCmd = document.getElementById('deployBuildCmd').value.trim();
    var envVars = document.getElementById('deployEnvVars').value.trim();
    var force = document.getElementById('deployForce').checked;

    if (!repoUrl) return toast('Git repository URL is required', true);
    if (!domain) return toast('Select a target domain', true);
    if (!user) return toast('Select a system user', true);

    document.getElementById('appsProgressStatus').textContent = 'Deploying…';
    document.getElementById('appsProgressFill').style.width = '8%';
    document.getElementById('appsProgressLog').textContent = 'Starting deployment…';
    openModal('appsProgressModal');

    API.request('POST', '/deploy/git', {
      repo_url: repoUrl, branch: branch, domain: domain,
      system_user: user, app_type: appType, build_cmd: buildCmd,
      env_vars: envVars, force: force,
    }).then(function (res) {
      startPolling(res.id);
    }).catch(function (e) {
      stopPolling();
      closeModal('appsProgressModal');
      toast(e.message, true);
    });
  }

  function startPolling(id) {
    stopPolling();
    pollId = id;
    document.getElementById('appsProgressStatus').textContent = 'Deploying…';
    pollTick();
    pollTimer = setInterval(pollTick, 2000);
  }

  async function pollTick() {
    if (!pollId) return;
    try {
      var logRes = await API.request('GET', '/deploy/' + pollId + '/log?lines=50');
      var depRes = await API.request('GET', '/deploy/' + pollId);
      var lines = logRes.lines || [];
      var box = document.getElementById('appsProgressLog');
      box.textContent = lines.length ? lines.join('\n') : 'Working…';
      box.scrollTop = box.scrollHeight;

      var status = depRes.deployment.status;
      document.getElementById('appsProgressStatus').textContent = status === 'deploying' ? 'Deploying…' : status;
      document.getElementById('appsProgressFill').style.width = status === 'deploying' ? '55%' : '100%';

      if (status === 'running') {
        stopPolling();
        closeModal('appsProgressModal');
        showSuccess(depRes.deployment);
        loadDeployments();
      } else if (status === 'failed') {
        stopPolling();
        closeModal('appsProgressModal');
        toast('Deployment failed: ' + (depRes.deployment.error || 'unknown error'), true);
        loadDeployments();
      }
    } catch (e) {
      stopPolling();
      closeModal('appsProgressModal');
      toast(e.message, true);
      loadDeployments();
    }
  }

  function showSuccess(dep) {
    var copyBtn = function (label, value) {
      return '<button type="button" class="fm-btn fm-btn-secondary fm-btn-sm apps-copy-btn" data-copy="' + esc(value) + '">Copy</button>';
    };
    var body = document.getElementById('deploySuccessBody');
    body.innerHTML =
      '<div class="apps-success-head">📦 ' + esc((dep.repo_url || '').split('/').pop().replace('.git', '')) + ' deployed!</div>' +
      '<div class="apps-cred-row"><span class="apps-cred-label">URL</span><span class="apps-cred-val">' + esc(dep.url) + '</span>' + copyBtn('url', dep.url) + '</div>' +
      (dep.webhook_url ? '<div class="apps-cred-row"><span class="apps-cred-label">Webhook</span><span class="apps-cred-val">' + esc(dep.webhook_url) + '</span>' + copyBtn('webhook', dep.webhook_url) + '</div>' : '') +
      '<div class="apps-cred-row"><span class="apps-cred-label">Branch</span><span class="apps-cred-val">' + esc(dep.branch) + ' (' + esc(dep.commit_hash || '—') + ')</span></div>' +
      '<div class="apps-cred-row"><span class="apps-cred-label">Type</span><span class="apps-cred-val">' + esc(dep.app_type) + '</span>' +
      (dep.proxy_port ? '<span class="apps-cred-val">:' + esc(String(dep.proxy_port)) + '</span>' : '') + '</div>';
    openModal('deploySuccessModal');
  }

  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () { toast('Copied to clipboard'); }).catch(function () { fallbackCopy(value); });
    } else { fallbackCopy(value); }
  }

  function fallbackCopy(value) {
    var ta = document.createElement('textarea');
    ta.value = value;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
    toast('Copied to clipboard');
  }

  /* ─── Logs drawer ─── */

  async function openLogs(id) {
    var rec = deployments.find(function (d) { return d.id === id; });
    document.getElementById('appsLogsDomain').textContent = rec ? rec.domain : '';
    document.getElementById('appsLogsBody').textContent = 'Loading logs…';
    document.getElementById('appsLogsDrawer').style.display = 'flex';
    document.getElementById('appsLogsDrawer').dataset.appId = id;
    await refreshLogs();
  }

  async function refreshLogs() {
    var id = document.getElementById('appsLogsDrawer').dataset.appId;
    if (!id) return;
    try {
      var res = await API.request('GET', '/deploy/' + id + '/log?lines=50');
      var box = document.getElementById('appsLogsBody');
      box.textContent = (res.lines || []).join('\n') || 'No log output yet.';
      box.scrollTop = box.scrollHeight;
    } catch (e) { document.getElementById('appsLogsBody').textContent = 'Failed to load logs: ' + e.message; }
  }

  /* ─── Rollback ─── */

  function openRollback(id) {
    var rec = deployments.find(function (d) { return d.id === id; });
    if (!rec) return;
    document.getElementById('deployRollbackBody').innerHTML =
      '<p>Rollback <b>' + esc(rec.domain) + '</b> to the previous deployment?</p>' +
      '<p class="apps-form-note">This switches the symlink to the prior deploy directory and reloads nginx.</p>';
    document.getElementById('deployRollbackConfirm').dataset.id = id;
    openModal('deployRollbackModal');
  }

  function confirmRollback() {
    var id = document.getElementById('deployRollbackConfirm').dataset.id;
    closeModal('deployRollbackModal');
    API.request('POST', '/deploy/' + id + '/rollback')
      .then(function () { toast('Rollback complete'); loadDeployments(); })
      .catch(function (e) { toast(e.message, true); });
  }

  /* ─── SSH key modal ─── */

  function openSshModal() {
    API.request('GET', '/deploy/ssh').then(function (res) {
      document.getElementById('deploySshKeyText').value = res.has_key ? '(key stored — paste a new one to replace)' : '';
      openModal('deploySshModal');
    }).catch(function (e) { toast(e.message, true); });
  }

  function saveSshKey() {
    var val = document.getElementById('deploySshKeyText').value.trim();
    if (!val || !val.includes('PRIVATE KEY')) return toast('Invalid SSH private key', true);
    API.request('POST', '/deploy/ssh', { private_key: val }).then(function () {
      closeModal('deploySshModal');
      toast('SSH key saved');
      refreshSshStatus();
    }).catch(function (e) { toast(e.message, true); });
  }

  function deleteSshKey() {
    API.request('DELETE', '/deploy/ssh').then(function () {
      document.getElementById('deploySshKeyText').value = '';
      toast('SSH key deleted');
      refreshSshStatus();
    }).catch(function (e) { toast(e.message, true); });
  }

  /* ─── Env vars modal ─── */

  function openEnvModal(id) {
    document.getElementById('deployEnvText').dataset.deployId = id;
    API.request('GET', '/deploy/' + id + '/env').then(function (res) {
      var vars = res.vars || [];
      document.getElementById('deployEnvText').value = vars.map(function (v) { return v.key + '=' + v.value; }).join('\n');
      openModal('deployEnvModal');
    }).catch(function (e) { toast(e.message, true); });
  }

  function saveEnvVars() {
    var id = document.getElementById('deployEnvText').dataset.deployId;
    var text = document.getElementById('deployEnvText').value.trim();
    var vars = {};
    if (text) {
      text.split('\n').forEach(function (line) {
        var eq = line.indexOf('=');
        if (eq > 0) vars[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
      });
    }
    API.request('PUT', '/deploy/' + id + '/env', vars).then(function () {
      closeModal('deployEnvModal');
      toast('Environment variables saved');
    }).catch(function (e) { toast(e.message, true); });
  }

  /* ─── Wire events ─── */

  function wireEvents() {
    document.getElementById('deployForm').addEventListener('submit', function (e) { e.preventDefault(); submitDeploy(); });

    document.getElementById('deploySshBtn').addEventListener('click', openSshModal);
    document.getElementById('deploySshSave').addEventListener('click', saveSshKey);
    document.getElementById('deploySshDelete').addEventListener('click', deleteSshKey);
    document.getElementById('deploySshClose').addEventListener('click', function () { closeModal('deploySshModal'); });
    document.getElementById('deploySshCancel').addEventListener('click', function () { closeModal('deploySshModal'); });

    document.getElementById('deploySuccessClose').addEventListener('click', function () { closeModal('deploySuccessModal'); });
    document.getElementById('deploySuccessDone').addEventListener('click', function () { closeModal('deploySuccessModal'); });

    document.getElementById('deployRollbackClose').addEventListener('click', function () { closeModal('deployRollbackModal'); });
    document.getElementById('deployRollbackCancel').addEventListener('click', function () { closeModal('deployRollbackModal'); });
    document.getElementById('deployRollbackConfirm').addEventListener('click', confirmRollback);

    document.getElementById('deployEnvClose').addEventListener('click', function () { closeModal('deployEnvModal'); });
    document.getElementById('deployEnvCancel').addEventListener('click', function () { closeModal('deployEnvModal'); });
    document.getElementById('deployEnvSave').addEventListener('click', saveEnvVars);

    document.getElementById('deploySuccessBody').addEventListener('click', function (e) {
      var btn = e.target.closest('.apps-copy-btn');
      if (btn) copyText(btn.getAttribute('data-copy'));
    });

    var historyTable = document.getElementById('deployHistoryBody');
    if (historyTable) {
      historyTable.addEventListener('click', function (e) {
        var logsBtn = e.target.closest('.deploy-act-logs');
        if (logsBtn) { openLogs(logsBtn.getAttribute('data-id')); return; }
        var rbBtn = e.target.closest('.deploy-act-rollback');
        if (rbBtn) { openRollback(rbBtn.getAttribute('data-id')); return; }
        var envBtn = e.target.closest('.deploy-act-env');
        if (envBtn) { openEnvModal(envBtn.getAttribute('data-id')); }
      });
    }

    document.getElementById('appsLogsClose').addEventListener('click', function () { document.getElementById('appsLogsDrawer').style.display = 'none'; });
    document.getElementById('appsLogsRefresh').addEventListener('click', refreshLogs);
  }

  window.initDeploy = function () {
    stopPolling();
    if (!document.getElementById('deployContent').dataset.wired) {
      wireEvents();
      document.getElementById('deployContent').dataset.wired = '1';
    }
    populateSelects();
    refreshSshStatus();
    loadDeployments();
  };
})();
