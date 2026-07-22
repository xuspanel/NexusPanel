function escHtml(str) { if (!str) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function timeAgo(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  var diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 2592000) return Math.floor(diff / 86400) + 'd ago';
  return d.toLocaleDateString();
}
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  var u = ['B','KB','MB','GB','TB'];
  var i = 0, s = bytes;
  while (s >= 1024 && i < u.length-1) { s/=1024; i++; }
  return s.toFixed(i>0?1:0) + ' ' + u[i];
}

/* ─── State ─── */
var dockerState = { containers: [], images: [], networks: [], composeProjects: [], tab: 'containers', loading: false, search: '', autoRefresh: null, selected: {} };
var dockerInit = false;
var dockerProjectColors = {};
var dockerLogsWS = null;
var dockerPullWS = null;
var dockerExecWS = null;
var dockerRefreshInterval = null;
var dockerContainerIdMap = {};
var dockerImageIdMap = {};

var PROJECT_COLORS = ['#06b6d4','#10b981','#8b5cf6','#f59e0b','#ec4899','#3b82f6','#f97316','#14b8a6'];

function getProjectColor(name) {
  if (!dockerProjectColors[name]) {
    dockerProjectColors[name] = PROJECT_COLORS[Object.keys(dockerProjectColors).length % PROJECT_COLORS.length];
  }
  return dockerProjectColors[name];
}

function parseLabels(s) {
  if (!s) return {};
  var r = {};
  s.split(',').forEach(function(p) { var eq = p.indexOf('='); if (eq>-1) { r[p.substring(0,eq).trim()] = p.substring(eq+1).trim(); } });
  return r;
}

function groupContainers(containers) {
  var projects = {}, standalone = [];
  containers.forEach(function(c) {
    var labels = parseLabels(c.Labels);
    var proj = labels['com.docker.compose.project'];
    if (proj) { if (!projects[proj]) projects[proj]=[]; projects[proj].push(c); }
    else { standalone.push(c); }
  });
  var projList = Object.keys(projects).sort().map(function(name) {
    var c = projects[name];
    var running = c.filter(function(x) { return x.State === 'running'; }).length;
    return { name: name, containers: c, running: running, total: c.length, type: 'project' };
  });
  return { projects: projList, standalone: standalone };
}

/* ─── Init ─── */
async function initDocker() {
  if (!dockerInit) {
    dockerInit = true;
    document.getElementById('dockerRefreshBtn').addEventListener('click', function() { refreshDocker(); });
    document.getElementById('dockerRetryBtn').addEventListener('click', function() { refreshDocker(); });
    document.getElementById('dockerSearchInput').addEventListener('input', function() {
      dockerState.search = this.value.toLowerCase();
      if (dockerState.tab === 'images') renderImages(dockerState.images);
      else renderContainers(dockerState.containers);
    });
    document.querySelectorAll('.docker-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.docker-tab').forEach(function(t) { t.classList.remove('active'); });
        document.querySelectorAll('.docker-tab-content').forEach(function(c) { c.classList.remove('active'); });
        tab.classList.add('active');
        var tgt = document.getElementById('dockerTab' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1));
        if (tgt) tgt.classList.add('active');
        if (tab.dataset.tab === 'images') loadImages();
        else if (tab.dataset.tab === 'networks') loadNetworks();
        else if (tab.dataset.tab === 'compose') loadComposeProjects();
        else loadContainers();
      });
    });

    /* Event delegation for container list */
    document.getElementById('dockerContainerList').addEventListener('click', function(e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) { /* check for checkbox clicks */
        var cb = e.target.closest('.docker-batch-cb');
        if (cb) { dockerToggleSelect(cb.dataset.id); return; }
        var hdr = e.target.closest('.docker-project-header');
        if (hdr) { toggleDockerProject(hdr); return; }
        var sub = e.target.closest('.docker-sub-item[data-id]');
        if (sub && !e.target.closest('.docker-sub-actions')) { dockerShowInspect(sub.dataset.id); }
        return;
      }
      var upBtn = e.target.closest('.docker-compose-up');
      if (upBtn) { dockerComposeUp(upBtn.dataset.project, upBtn); return; }
      var downBtn = e.target.closest('.docker-compose-down');
      if (downBtn) { dockerComposeDown(downBtn.dataset.project, downBtn); return; }
      var id = btn.dataset.id, act = btn.dataset.act;
      e.stopPropagation();
      if (act === 'start') dockerAction('start', id, btn);
      else if (act === 'stop') dockerAction('stop', id, btn);
      else if (act === 'restart') dockerAction('restart', id, btn);
      else if (act === 'remove') dockerRemoveContainer(id, btn);
      else if (act === 'logs') dockerShowLogs(id);
      else if (act === 'inspect') dockerShowInspect(id);
      else if (act === 'exec') dockerShowExec(id);
      else if (act === 'files') dockerShowFiles(id);
      else if (act === 'stats') dockerShowStats(id);
    });

    /* Event delegation for image list */
    document.getElementById('dockerImageList').addEventListener('click', function(e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) {
        var card = e.target.closest('.db-user-card[data-id]');
        if (card) dockerShowImageInspect(card.dataset.id);
        return;
      }
      var id = btn.dataset.id, act = btn.dataset.act;
      e.stopPropagation();
      if (act === 'rmi') dockerRemoveImage(id, btn.dataset.repo || id, btn);
      else if (act === 'inspect-img') dockerShowImageInspect(id);
      else if (act === 'history') dockerShowImageHistory(id);
    });

    document.getElementById('dockerAutoRefresh').addEventListener('change', function() { dockerSetAutoRefresh(parseInt(this.value,10)); });
    document.getElementById('dockerPullBtn').addEventListener('click', function() { dockerShowPullModal(); });
    document.getElementById('dockerPruneBtn').addEventListener('click', function() { dockerShowPruneModal(); });
    document.getElementById('dockerCreateBtn').addEventListener('click', function() { dockerShowCreateModal(); });
    document.getElementById('dockerStatsRefresh').addEventListener('click', function() { dockerRefreshStats(); });

    /* Delegation for batch bar buttons (dynamically rendered) */
    document.getElementById('dockerContainerList').addEventListener('click', function(e) {
      var bBtn = e.target.closest('#dockerBatchCancel, #dockerBatchStop, #dockerBatchRestart, #dockerBatchRemove');
      if (!bBtn) return;
      e.stopPropagation();
      var act = bBtn.id.replace('dockerBatch', '').toLowerCase();
      if (act === 'cancel') dockerClearSelection();
      else dockerBatchAction(act);
    });
  }
  dockerClearSelection();
  dockerState.search = '';
  var si = document.getElementById('dockerSearchInput');
  if (si) si.value = '';
  loadDockerInfo();
  await loadContainers();
}

function refreshDocker() {
  if (dockerState.tab === 'images') loadImages();
  else if (dockerState.tab === 'networks') loadNetworks();
  else if (dockerState.tab === 'compose') loadComposeProjects();
  else loadContainers();
}

async function loadContainers() {
  showDockerLoading();
  dockerState.tab = 'containers';
  try {
    var list = await API.docker.containers();
    dockerState.containers = list;
    renderContainers(list);
    showDockerContent();
  } catch (err) { showDockerError(err.message); }
}

async function loadImages() {
  showDockerLoading();
  dockerState.tab = 'images';
  try {
    var list = await API.docker.images();
    dockerState.images = list;
    renderImages(list);
    showDockerContent();
  } catch (err) { showDockerError(err.message); }
}

/* ─── Render Containers ─── */
function renderContainers(containers) {
  var list = document.getElementById('dockerContainerList');
  var breadcrumb = document.getElementById('dockerBreadcrumb');
  if (breadcrumb) breadcrumb.textContent = 'Projects';

  if (containers.length === 0) {
    list.innerHTML = '<div class="db-empty">No containers found. Run a container to get started.</div>';
    return;
  }

  var search = dockerState.search;
  var filtered = search ? containers.filter(function(c) {
    var names = Array.isArray(c.Names) ? c.Names : (c.Names ? [c.Names] : ['']);
    var name = (names[0] || '').replace(/^\//, '').toLowerCase();
    var image = (c.Image || '').toLowerCase();
    var state = (c.State || '').toLowerCase();
    var labels = (c.Labels || '').toLowerCase();
    return name.indexOf(search) > -1 || image.indexOf(search) > -1 || state.indexOf(search) > -1 || labels.indexOf(search) > -1;
  }) : containers;

  var running = filtered.filter(function(c) { return c.State === 'running'; }).length;
  var paused = filtered.filter(function(c) { return c.State === 'paused'; }).length;
  var stopped = filtered.filter(function(c) { return c.State !== 'running' && c.State !== 'paused'; }).length;

  /* Status summary bar */
  var statusBar = '<div class="docker-status-bar">'
    + '<span class="docker-status-count"><span class="dot running"></span> ' + running + ' running</span>'
    + '<span class="docker-status-count"><span class="dot paused"></span> ' + paused + ' paused</span>'
    + '<span class="docker-status-count"><span class="dot stopped"></span> ' + stopped + ' stopped</span>'
    + '<span class="docker-status-count">' + filtered.length + ' total</span>'
    + (search ? '<span class="docker-status-filtered"> (filtered from ' + containers.length + ')</span>' : '')
    + '</div>';

  dockerProjectColors = {};
  var grouped = groupContainers(filtered.length > 0 ? filtered : []);
  var selCount = Object.keys(dockerState.selected).length;
  var html = statusBar;

  /* Batch toolbar */
  html += '<div class="docker-batch-bar" id="dockerBatchBar"' + (selCount > 0 ? '' : ' style="display:none"') + '>'
    + '<span class="docker-batch-count">' + selCount + ' selected</span>'
    + '<button class="fm-btn fm-btn-sm" id="dockerBatchStop">⏹ Stop</button>'
    + '<button class="fm-btn fm-btn-sm" id="dockerBatchRestart">🔄 Restart</button>'
    + '<button class="fm-btn fm-btn-sm fm-btn-danger" id="dockerBatchRemove">🗑 Remove</button>'
    + '<button class="fm-btn fm-btn-sm" id="dockerBatchCancel">✕ Cancel</button>'
    + '</div>';

  /* Project cards */
  if (filtered.length === 0) {
    html += '<div class="db-empty">No containers match your filter.</div>';
    list.innerHTML = html;
    return;
  }

  grouped.projects.forEach(function(proj) {
    var color = getProjectColor(proj.name);
    html += '<div class="docker-project-card" style="--proj-color:' + color + '">';
    html += '<div class="docker-project-header">';
    html += '<span class="docker-project-toggle">▼</span>';
    html += '<span class="docker-project-icon">📦</span>';
    html += '<div class="docker-project-info">';
    html += '<span class="docker-project-name">' + escHtml(proj.name) + '</span>';
    html += '<span class="docker-project-meta">' + proj.total + ' containers · ' + proj.running + ' running</span>';
    html += '</div>';
    html += '<div class="docker-project-actions">';
    html += '<button class="fm-btn fm-btn-sm docker-compose-up" data-project="' + escHtml(proj.name) + '" title="Up (start all)">▶ Up</button>';
    html += '<button class="fm-btn fm-btn-sm docker-compose-down" data-project="' + escHtml(proj.name) + '" title="Down (stop all)">⏹ Down</button>';
    html += '</div>';
    html += '<div class="docker-project-dots">';
    proj.containers.forEach(function(c) {
      var cls = c.State === 'running' ? 'running' : (c.State === 'paused' ? 'paused' : 'stopped');
      html += '<span class="docker-project-dot ' + cls + '" title="' + escHtml(c.Status || '') + '"></span>';
    });
    html += '</div>';
    html += '</div>';
    html += '<div class="docker-project-body">';
    proj.containers.forEach(function(c) { html += renderSubContainer(c); });
    html += '</div></div>';
  });

  if (grouped.standalone.length > 0) {
    var sc = getProjectColor('_standalone');
    html += '<div class="docker-project-card docker-project-standalone" style="--proj-color:' + sc + '">';
    html += '<div class="docker-project-header">';
    html += '<span class="docker-project-toggle">▼</span>';
    html += '<span class="docker-project-icon">📄</span>';
    html += '<div class="docker-project-info">';
    html += '<span class="docker-project-name">Other Containers</span>';
    html += '<span class="docker-project-meta">' + grouped.standalone.length + ' container' + (grouped.standalone.length > 1 ? 's' : '') + '</span>';
    html += '</div>';
    html += '</div>';
    html += '<div class="docker-project-body">';
    grouped.standalone.forEach(function(c) { html += renderSubContainer(c); });
    html += '</div></div>';
  }

  list.innerHTML = html;
}

function renderSubContainer(c) {
  var id = c.ID || '';
  var shortId = id.length > 12 ? id.substring(0, 12) : id;
  var names = Array.isArray(c.Names) ? c.Names : (c.Names ? [c.Names] : []);
  var name = (names[0] || '').replace(/^\//, '').replace(/^.+_/, '');
  var fullName = (names[0] || '').replace(/^\//, '');
  var image = c.Image || '';
  var state = c.State || '';
  var ports = c.Ports || '';
  var health = '';
  var status = c.Status || '';
  if (status.indexOf('(healthy)') > -1) health = 'healthy';
  else if (status.indexOf('(unhealthy)') > -1) health = 'unhealthy';
  else if (status.indexOf('(health:') > -1) health = 'starting';

  var running = state === 'running';
  var isPaused = state === 'paused';
  var statusCls = running ? 'running' : (isPaused ? 'paused' : 'stopped');
  var healthHtml = health ? '<span class="docker-health-badge ' + health + '" title="Health: ' + health + '">' + (health === 'healthy' ? '✓' : health === 'unhealthy' ? '✗' : '~') + '</span>' : '';

  var portTags = '';
  if (ports) {
    portTags = ports.split(', ').filter(Boolean).map(function(p) {
      return '<span class="docker-port-tag">' + escHtml(p) + '</span>';
    }).join('');
  }

  var mountCount = c.Mounts ? c.Mounts.length : 0;
  var networkCount = c.Networks ? c.Networks.length : 0;

  var selected = dockerState.selected[id] || false;

  return '<div class="docker-sub-item' + (selected ? ' selected' : '') + '" data-id="' + escHtml(id) + '">'
    + '<input type="checkbox" class="docker-batch-cb" data-id="' + escHtml(id) + '"' + (selected ? ' checked' : '') + '>'
    + '<span class="docker-sub-status ' + statusCls + '"></span>'
    + '<div class="docker-sub-main">'
    + '<span class="docker-sub-name" title="' + escHtml(fullName) + '">' + escHtml(name) + healthHtml + '</span>'
    + '<span class="docker-sub-meta">' + escHtml(image) + ' <span class="docker-sub-id">' + shortId + '</span></span>'
    + (portTags ? '<span class="docker-sub-ports">' + portTags + '</span>' : '')
    + '<span class="docker-sub-labels">' + (mountCount > 0 ? '📂' + mountCount + ' ' : '') + (networkCount > 0 ? '🌐' + networkCount : '') + '</span>'
    + '</div>'
    + '<div class="docker-sub-actions">'
    + (running ? '<button class="fm-btn fm-btn-sm" data-act="stop" data-id="' + escHtml(id) + '" title="Stop">⏹</button>' : '')
    + (running ? '<button class="fm-btn fm-btn-sm" data-act="restart" data-id="' + escHtml(id) + '" title="Restart">🔄</button>' : '')
    + (!running && !isPaused ? '<button class="fm-btn fm-btn-sm" data-act="start" data-id="' + escHtml(id) + '" title="Start">▶</button>' : '')
    + '<button class="fm-btn fm-btn-sm" data-act="logs" data-id="' + escHtml(id) + '" title="Logs">📋</button>'
    + '<button class="fm-btn fm-btn-sm" data-act="exec" data-id="' + escHtml(id) + '" title="Exec">💻</button>'
    + '<button class="fm-btn fm-btn-sm" data-act="files" data-id="' + escHtml(id) + '" title="Files">📂</button>'
    + '<button class="fm-btn fm-btn-sm" data-act="stats" data-id="' + escHtml(id) + '" title="Stats">📊</button>'
    + '<button class="fm-btn fm-btn-sm" data-act="inspect" data-id="' + escHtml(id) + '" title="Inspect">🔍</button>'
    + '<button class="fm-btn fm-btn-sm fm-btn-danger" data-act="remove" data-id="' + escHtml(id) + '" title="Remove">🗑</button>'
    + '</div>'
    + '</div>';
}

function toggleDockerProject(header) {
  var body = header.nextElementSibling;
  var toggle = header.querySelector('.docker-project-toggle');
  if (!body) return;
  if (body.classList.contains('collapsed')) {
    body.classList.remove('collapsed');
    if (toggle) toggle.textContent = '▼';
  } else {
    body.classList.add('collapsed');
    if (toggle) toggle.textContent = '▶';
  }
}

/* ─── Selection / Batch ─── */
function dockerToggleSelect(id) {
  if (dockerState.selected[id]) delete dockerState.selected[id];
  else dockerState.selected[id] = true;
  renderContainers(dockerState.containers);
}

function dockerClearSelection() { dockerState.selected = {}; renderContainers(dockerState.containers); }

function dockerBatchAction(action) {
  var ids = Object.keys(dockerState.selected);
  if (ids.length === 0) return;
  if (action === 'remove' && !confirm('Remove ' + ids.length + ' container(s)? This cannot be undone.')) return;
  showToast('Executing ' + action + ' on ' + ids.length + ' container(s)...', 'info');
  var promises = ids.map(function(id) {
    if (action === 'stop') return API.docker.stop(id).catch(function(e) { return e; });
    if (action === 'restart') return API.docker.restart(id).catch(function(e) { return e; });
    if (action === 'remove') return API.docker.remove(id).catch(function(e) { return e; });
  });
  Promise.all(promises).then(function() {
    dockerState.selected = {};
    showToast(action + ' completed', 'success');
    loadContainers();
  });
}

/* ─── Actions ─── */
async function dockerAction(action, id, btn) {
  if (btn) btn.disabled = true;
  try {
    if (action === 'start') await API.docker.start(id);
    else if (action === 'stop') await API.docker.stop(id);
    else if (action === 'restart') await API.docker.restart(id);
    showToast('Container ' + action + 'ed', 'success');
    await loadContainers();
  } catch (err) {
    showToast('Failed to ' + action + ': ' + err.message, 'error');
    if (btn) btn.disabled = false;
  }
}

function dockerRemoveContainer(id, btn) {
  if (!confirm('Remove this container? This action cannot be undone.')) return;
  if (btn) btn.disabled = true;
  API.docker.remove(id).then(function() {
    showToast('Container removed', 'success');
    loadContainers();
  }).catch(function(err) {
    showToast('Failed to remove: ' + err.message, 'error');
    if (btn) btn.disabled = false;
  });
}

function dockerRemoveImage(id, repo, btn) {
  if (!confirm('Remove image "' + escHtml(repo) + '"? This cannot be undone.')) return;
  if (btn) btn.disabled = true;
  API.docker.removeImage(id).then(function() {
    showToast('Image removed', 'success');
    loadImages();
  }).catch(function(err) {
    showToast('Failed to remove image: ' + err.message, 'error');
    if (btn) btn.disabled = false;
  });
}

/* ─── Inspect Modal ─── */
async function dockerShowInspect(id) {
  var overlay = document.getElementById('dockerInspectModal');
  var body = document.getElementById('dockerInspectBody');
  overlay.style.display = 'flex';
  body.innerHTML = '<div class="db-loading"><div class="db-loading-spinner"></div></div>';
  try {
    var info = await API.docker.inspect(id);
    var cid = info.Id || id;
    var name = (info.Name || '').replace(/^\//, '');
    var html = '<div class="docker-inspect-grid">';

    /* General */
    html += '<div class="docker-inspect-section"><div class="docker-inspect-section-title">General</div>';
    html += '<div class="docker-inspect-row"><span class="docker-inspect-label">Name</span><span class="docker-inspect-value">' + escHtml(name) + '</span></div>';
    html += '<div class="docker-inspect-row"><span class="docker-inspect-label">ID</span><span class="docker-inspect-value mono">' + escHtml(cid) + '</span></div>';
    html += '<div class="docker-inspect-row"><span class="docker-inspect-label">Image</span><span class="docker-inspect-value">' + escHtml(info.Config && info.Config.Image || '') + '</span></div>';
    html += '<div class="docker-inspect-row"><span class="docker-inspect-label">Status</span><span class="docker-inspect-value">' + escHtml(info.State && info.State.Status || '') + '</span></div>';
    html += '<div class="docker-inspect-row"><span class="docker-inspect-label">Restart Policy</span><span class="docker-inspect-value">' + escHtml(info.HostConfig && info.HostConfig.RestartPolicy && info.HostConfig.RestartPolicy.Name || 'none') + '</span></div>';
    html += '<div class="docker-inspect-row"><span class="docker-inspect-label">Created</span><span class="docker-inspect-value">' + timeAgo(info.Created) + '</span></div>';
    html += '</div>';

    /* Ports */
    var ports = info.NetworkSettings && info.NetworkSettings.Ports;
    if (ports) {
      html += '<div class="docker-inspect-section"><div class="docker-inspect-section-title">Ports</div>';
      Object.keys(ports).forEach(function(p) {
        var bindings = ports[p];
        var val = bindings && bindings.length > 0 ? bindings.map(function(b) { return (b.HostIp || '0.0.0.0') + ':' + b.HostPort; }).join(', ') : '(not published)';
        html += '<div class="docker-inspect-row"><span class="docker-inspect-label">' + escHtml(p) + '</span><span class="docker-inspect-value">' + escHtml(val) + '</span></div>';
      });
      html += '</div>';
    }

    /* Mounts */
    var mounts = info.Mounts;
    if (mounts && mounts.length > 0) {
      html += '<div class="docker-inspect-section"><div class="docker-inspect-section-title">Mounts</div>';
      mounts.forEach(function(m) {
        html += '<div class="docker-inspect-row"><span class="docker-inspect-label">' + escHtml(m.Type || 'volume') + '</span><span class="docker-inspect-value mono">' + escHtml(m.Source || '') + ' → ' + escHtml(m.Destination) + (m.Mode ? ' (' + m.Mode + ')' : '') + '</span></div>';
      });
      html += '</div>';
    }

    /* Env */
    var env = info.Config && info.Config.Env;
    if (env && env.length > 0) {
      html += '<div class="docker-inspect-section"><div class="docker-inspect-section-title">Environment</div>';
      html += '<div class="docker-inspect-pre">';
      env.forEach(function(e) { html += escHtml(e) + '\n'; });
      html += '</div></div>';
    }

    /* Networks */
    var nets = info.NetworkSettings && info.NetworkSettings.Networks;
    if (nets) {
      html += '<div class="docker-inspect-section"><div class="docker-inspect-section-title">Networks</div>';
      Object.keys(nets).forEach(function(n) {
        var net = nets[n];
        html += '<div class="docker-inspect-row"><span class="docker-inspect-label">' + escHtml(n) + '</span><span class="docker-inspect-value">IP: ' + escHtml(net.IPAddress || '-') + ' / GW: ' + escHtml(net.Gateway || '-') + '</span></div>';
      });
      html += '</div>';
    }

    html += '</div>';

    /* Raw JSON */
    html += '<div class="docker-inspect-section"><div class="docker-inspect-section-title" onclick="dockerToggleRaw(this)" style="cursor:pointer">▶ Raw JSON</div>';
    html += '<div class="docker-inspect-raw" style="display:none"><pre class="docker-logs-content">' + escHtml(JSON.stringify(info, null, 2)) + '</pre></div></div>';

    body.innerHTML = html;
    document.getElementById('dockerInspectActions').innerHTML = ''
      + '<button class="fm-btn fm-btn-sm" onclick="dockerShowExec(\'' + escHtml(id) + '\')">💻 Exec</button>'
      + '<button class="fm-btn fm-btn-sm" onclick="dockerShowStats(\'' + escHtml(id) + '\')">📊 Stats</button>'
      + '<button class="fm-btn fm-btn-sm" onclick="dockerShowLogs(\'' + escHtml(id) + '\')">📋 Logs</button>'
      + '<button type="button" class="fm-btn fm-btn-primary" onclick="document.getElementById(\'dockerInspectModal\').style.display=\'none\'">Close</button>';
  } catch (err) {
    body.innerHTML = '<div class="db-empty">Error: ' + escHtml(err.message) + '</div>';
  }
}

function dockerToggleRaw(el) {
  var body = el.nextElementSibling;
  if (body) {
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
    el.textContent = body.style.display === 'none' ? '▶ Raw JSON' : '▼ Raw JSON';
  }
}

/* ─── Stats Modal ─── */
var dockerStatsData = null;
async function dockerShowStats(id) {
  var overlay = document.getElementById('dockerStatsModal');
  var body = document.getElementById('dockerStatsBody');
  overlay.style.display = 'flex';
  body.innerHTML = '<div class="db-loading"><div class="db-loading-spinner"></div></div>';
  document.getElementById('dockerStatsRefresh').dataset.id = id;
  try {
    var s = await API.docker.stats(id);
    dockerStatsData = s;
    renderStats(s);
  } catch (err) {
    body.innerHTML = '<div class="db-empty">Error: ' + escHtml(err.message) + '</div>';
  }
}

async function dockerRefreshStats() {
  var btn = document.getElementById('dockerStatsRefresh');
  var id = btn ? btn.dataset.id : null;
  if (!id) return;
  try {
    var s = await API.docker.stats(id);
    dockerStatsData = s;
    renderStats(s);
  } catch (err) { showToast('Stats error: ' + err.message, 'error'); }
}

function renderStats(s) {
  var cpuW = Math.min(s.cpuPercent, 100);
  var memPct = s.memoryPercent || 0;
  var memW = Math.min(memPct, 100);
  var body = document.getElementById('dockerStatsBody');
  body.innerHTML = ''
    + '<div class="docker-stats-grid">'
    + '<div class="docker-stat-card"><div class="docker-stat-label">CPU</div><div class="docker-stat-value">' + s.cpuPercent + '%</div><div class="docker-stat-bar"><div class="docker-stat-bar-fill" style="width:' + cpuW + '%"></div></div></div>'
    + '<div class="docker-stat-card"><div class="docker-stat-label">Memory</div><div class="docker-stat-value">' + formatBytes(s.memoryUsage) + ' / ' + formatBytes(s.memoryLimit) + '</div><div class="docker-stat-bar"><div class="docker-stat-bar-fill mem" style="width:' + memW + '%"></div></div><div class="docker-stat-sub">' + memPct + '%</div></div>'
    + '<div class="docker-stat-card"><div class="docker-stat-label">Network I/O</div><div class="docker-stat-value">▼ ' + formatBytes(s.networkRx) + ' ▲ ' + formatBytes(s.networkTx) + '</div></div>'
    + '<div class="docker-stat-card"><div class="docker-stat-label">Block I/O</div><div class="docker-stat-value">📖 ' + formatBytes(s.blockRead) + ' ✏ ' + formatBytes(s.blockWrite) + '</div></div>'
    + '</div>';
}

/* ─── Logs Modal ─── */
async function dockerShowLogs(id) {
  var overlay = document.getElementById('dockerLogsModal');
  var content = document.getElementById('dockerLogsContent');
  var title = document.getElementById('dockerLogsTitle');
  var btnLive = document.getElementById('dockerLogsLive');
  var tailSelect = document.getElementById('dockerLogsTail');
  overlay.style.display = 'flex';
  title.textContent = 'Logs: ' + escHtml(id.substring(0, 12));
  content.textContent = 'Loading...';

  /* Kill any existing WS */
  if (dockerLogsWS) { try { dockerLogsWS.close(); } catch (_) {} dockerLogsWS = null; }
  btnLive.textContent = '📡 Live';
  btnLive.classList.remove('active');
  btnLive.dataset.id = id;

  var tail = tailSelect ? tailSelect.value : '200';
  try {
    var data = await API.docker.logs(id, tail);
    content.textContent = data.logs || '(no output)';
  } catch (err) {
    content.textContent = 'Error: ' + err.message;
  }
}

function dockerLogsToggleLive(btn) {
  var id = btn.dataset.id;
  if (!id) return;
  var content = document.getElementById('dockerLogsContent');

  if (dockerLogsWS) {
    dockerLogsWS.close();
    dockerLogsWS = null;
    btn.textContent = '📡 Live';
    btn.classList.remove('active');
    return;
  }

  btn.textContent = '⏳ Connecting...';
  var proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  var wsUrl = proto + '//' + window.location.host + '/ws/docker';
  dockerLogsWS = new WebSocket(wsUrl);

  dockerLogsWS.onopen = function() {
    btn.textContent = '🔴 Live';
    btn.classList.add('active');
    var tail = document.getElementById('dockerLogsTail');
    dockerLogsWS.send(JSON.stringify({ type: 'logs', containerId: id, tail: tail ? tail.value : '200' }));
  };

  dockerLogsWS.onmessage = function(ev) {
    var msg = JSON.parse(ev.data);
    if (msg.type === 'logs-data') {
      var autoScroll = document.getElementById('dockerLogsAutoScroll') && document.getElementById('dockerLogsAutoScroll').checked;
      content.textContent += msg.data;
      if (autoScroll) content.scrollTop = content.scrollHeight;
    } else if (msg.type === 'logs-end' || msg.type === 'logs-error') {
      dockerLogsWS.close();
      dockerLogsWS = null;
      btn.textContent = '📡 Live';
      btn.classList.remove('active');
    }
  };

  dockerLogsWS.onerror = function() {
    showToast('WebSocket error', 'error');
    dockerLogsWS = null;
    btn.textContent = '📡 Live';
    btn.classList.remove('active');
  };

  dockerLogsWS.onclose = function() {
    if (dockerLogsWS) { dockerLogsWS = null; btn.textContent = '📡 Live'; btn.classList.remove('active'); }
  };
}

function dockerCloseLogs() {
  if (dockerLogsWS) { try { dockerLogsWS.close(); } catch (_) {} dockerLogsWS = null; }
  document.getElementById('dockerLogsModal').style.display = 'none';
}

/* ─── Exec Modal ─── */
var dockerExecFit = null;

function dockerShowExec(id) {
  var overlay = document.getElementById('dockerExecModal');
  var title = document.getElementById('dockerExecTitle');
  var termContainer = document.getElementById('dockerExecTerminal');
  overlay.style.display = 'flex';
  title.textContent = 'Exec: ' + escHtml(id.substring(0, 12));
  termContainer.innerHTML = '<div class="docker-exec-start" id="dockerExecStart"><select id="dockerExecShell" class="fm-input" style="width:auto"><option value="/bin/sh">/bin/sh</option><option value="/bin/bash">/bin/bash</option></select><button class="fm-btn fm-btn-primary" id="dockerExecConnectBtn">Connect</button></div>';

  /* Bind connect */
  var connectBtn = document.getElementById('dockerExecConnectBtn');
  if (connectBtn) {
    connectBtn.onclick = function() { dockerExecConnect(id); };
  }
}

function dockerExecConnect(id) {
  var termContainer = document.getElementById('dockerExecTerminal');
  var shell = document.getElementById('dockerExecShell');
  var cmd = shell ? shell.value : '/bin/sh';
  termContainer.innerHTML = '<div id="dockerExecXterm" style="height:400px"></div><div class="docker-exec-status">Connecting...</div>';

  var proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  var wsUrl = proto + '//' + window.location.host + '/ws/docker';
  dockerExecWS = new WebSocket(wsUrl);
  var term = null;
  dockerExecFit = null;

  dockerExecWS.onopen = function() {
    dockerExecWS.send(JSON.stringify({ type: 'exec', containerId: id, cmd: [cmd] }));
  };

  dockerExecWS.onmessage = function(ev) {
    var msg = JSON.parse(ev.data);
    if (msg.type === 'exec-started') {
      termContainer.querySelector('.docker-exec-status').textContent = 'Connected';

      /* Initialize xterm */
      if (typeof Terminal !== 'undefined') {
        term = new Terminal({
          cols: 80, rows: 20,
          cursorBlink: true, cursorStyle: 'block',
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
          theme: { background: '#0d1117', foreground: '#c9d1d9', cursor: '#c9d1d9',
            selectionBackground: '#264f78', black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
            blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
            brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364', brightYellow: '#e3b341',
            brightBlue: '#79c0ff', brightMagenta: '#d2a8ff', brightCyan: '#56d4dd', brightWhite: '#f0f6fc' },
          allowTransparency: true
        });

        term.onData(function(data) {
          if (dockerExecWS && dockerExecWS.readyState === WebSocket.OPEN) {
            dockerExecWS.send(JSON.stringify({ type: 'exec-input', containerId: id, data: btoa(data) }));
          }
        });

        term.onResize(function(dims) {
          if (dockerExecWS && dockerExecWS.readyState === WebSocket.OPEN) {
            dockerExecWS.send(JSON.stringify({ type: 'exec-resize', containerId: id, cols: dims.cols, rows: dims.rows, execId: '' }));
          }
        });

        term.open(document.getElementById('dockerExecXterm'));
        term.focus();

        /* FitAddon */
        if (typeof FitAddon !== 'undefined') {
          dockerExecFit = new FitAddon.FitAddon();
          term.loadAddon(dockerExecFit);
          setTimeout(function() { try { dockerExecFit.fit(); } catch (_) {} }, 100);
        }

        var onResizeExec = function() { if (dockerExecFit) { try { dockerExecFit.fit(); } catch (_) {} } };
        window.addEventListener('resize', onResizeExec);
        termContainer._execResizeHandler = onResizeExec;

        termContainer.querySelector('.docker-exec-status').textContent = 'Connected';
      }

    } else if (msg.type === 'exec-output') {
      if (term) {
        term.write(atob(msg.data));
      } else {
        var el = document.getElementById('dockerExecXterm');
        if (el) el.textContent += atob(msg.data);
      }
    } else if (msg.type === 'exec-end') {
      if (term) term.write('\r\n\x1b[1;33m[Process exited]\x1b[0m');
      termContainer.querySelector('.docker-exec-status').textContent = 'Disconnected';
    } else if (msg.type === 'exec-error') {
      termContainer.querySelector('.docker-exec-status').textContent = 'Error: ' + msg.error;
    }
  };

  dockerExecWS.onerror = function() {
    var st = termContainer.querySelector('.docker-exec-status');
    if (st) st.textContent = 'WebSocket error';
  };

  dockerExecWS.onclose = function() {
    if (termContainer._execResizeHandler) { window.removeEventListener('resize', termContainer._execResizeHandler); termContainer._execResizeHandler = null; }
    if (term) { try { term.dispose(); } catch (_) {} }
    dockerExecFit = null;
    dockerExecWS = null;
    var st = termContainer.querySelector('.docker-exec-status');
    if (st && st.textContent !== 'Disconnected') st.textContent = 'Disconnected';
  };
}

function dockerCloseExec() {
  if (dockerExecWS) { try { dockerExecWS.close(); } catch (_) {} dockerExecWS = null; }
  var tc = document.getElementById('dockerExecTerminal');
  if (tc && tc._execResizeHandler) { window.removeEventListener('resize', tc._execResizeHandler); tc._execResizeHandler = null; }
  dockerExecFit = null;
  document.getElementById('dockerExecModal').style.display = 'none';
}

/* ─── Render Images ─── */
function renderImages(images) {
  var list = document.getElementById('dockerImageList');
  var breadcrumb = document.getElementById('dockerBreadcrumb');
  if (breadcrumb) breadcrumb.textContent = 'Images';

  if (images.length === 0) {
    list.innerHTML = '<div class="db-empty">No images found. Pull an image to get started.</div>';
    return;
  }

  var search = dockerState.search;
  var filtered = search ? images.filter(function(img) {
    var repo = (img.Repository || '').toLowerCase();
    var tag = (img.Tag || '').toLowerCase();
    var id = (img.ID || '').toLowerCase();
    return repo.indexOf(search) > -1 || tag.indexOf(search) > -1 || id.indexOf(search) > -1;
  }) : images;

  var sortBy = document.getElementById('dockerImgSort') ? document.getElementById('dockerImgSort').value : 'name';
  var sorted = filtered.slice();
  if (sortBy === 'size') sorted.sort(function(a,b) { return (a.SizeBytes||0) - (b.SizeBytes||0); });
  else if (sortBy === 'size-desc') sorted.sort(function(a,b) { return (b.SizeBytes||0) - (a.SizeBytes||0); });
  else if (sortBy === 'created') sorted.sort(function(a,b) { return (a.Created||0) - (b.Created||0); });
  else if (sortBy === 'created-desc') sorted.sort(function(a,b) { return (b.Created||0) - (a.Created||0); });
  else sorted.sort(function(a,b) { return (a.Repository||'').localeCompare(b.Repository||''); });

  var totalSize = sorted.reduce(function(sum, img) { return sum + (img.SizeBytes || 0); }, 0);
  var html = '<div class="docker-status-bar"><span class="docker-status-count">' + sorted.length + ' images</span><span class="docker-status-count">' + formatBytes(totalSize) + ' total</span>'
    + (search ? '<span class="docker-status-filtered"> (filtered from ' + images.length + ')</span>' : '') + '</div>';

  html += '<div class="docker-img-toolbar">'
    + '<select id="dockerImgSort" class="fm-input" style="width:auto;display:inline-block;margin-right:8px" onchange="renderImages(dockerState.images)">'
    + '<option value="name">Sort: Name</option><option value="size">Sort: Size ↑</option><option value="size-desc">Sort: Size ↓</option>'
    + '<option value="created">Sort: Oldest</option><option value="created-desc">Sort: Newest</option></select>'
    + '</div>';

  if (sorted.length === 0) {
    html += '<div class="db-empty">No images match your filter.</div>';
    list.innerHTML = html;
    return;
  }

  sorted.forEach(function(img) {
    var id = img.ID || '';
    var shortId = id.length > 12 ? id.substring(0, 12) : id;
    var repo = img.Repository || '';
    var tag = img.Tag || '';
    var size = img.Size || '';
    var created = img.CreatedAt || '';

    html += '<div class="db-user-card" data-id="' + escHtml(id) + '">'
      + '<div class="db-user-card-glow"></div>'
      + '<div class="docker-row-top">'
      + '<span class="docker-img-icon">📦</span>'
      + '<span class="docker-container-name">' + escHtml(repo || '<none>') + '</span>'
      + '<span class="docker-img-tag">' + escHtml(tag || '<none>') + '</span>'
      + '</div>'
      + '<div class="docker-row-details">'
      + '<div class="docker-detail-item"><span class="docker-detail-label">Image ID</span><span class="docker-detail-value mono">' + shortId + '</span></div>'
      + '<div class="docker-detail-item"><span class="docker-detail-label">Size</span><span class="docker-detail-value">' + escHtml(size) + '</span></div>'
      + '<div class="docker-detail-item"><span class="docker-detail-label">Created</span><span class="docker-detail-value">' + timeAgo(created) + '</span></div>'
      + '</div>'
      + '<div class="docker-row-actions">'
      + '<button class="fm-btn fm-btn-sm" data-act="inspect-img" data-id="' + escHtml(id) + '">🔍 Inspect</button>'
      + '<button class="fm-btn fm-btn-sm" data-act="history" data-id="' + escHtml(id) + '">📜 History</button>'
      + '<button class="fm-btn fm-btn-sm fm-btn-danger" data-act="rmi" data-id="' + escHtml(id) + '" data-repo="' + escHtml(repo || '<none>') + '">🗑 Remove</button>'
      + '</div>'
      + '</div>';
  });

  list.innerHTML = html;
}

/* ─── Image Inspect ─── */
async function dockerShowImageInspect(id) {
  var overlay = document.getElementById('dockerImageInspectModal');
  var body = document.getElementById('dockerImageInspectBody');
  overlay.style.display = 'flex';
  body.innerHTML = '<div class="db-loading"><div class="db-loading-spinner"></div></div>';
  try {
    var info = await API.docker.inspectImage(id);
    var html = '<div class="docker-inspect-grid">';
    html += '<div class="docker-inspect-section"><div class="docker-inspect-section-title">Image Info</div>';
    html += '<div class="docker-inspect-row"><span class="docker-inspect-label">ID</span><span class="docker-inspect-value mono">' + escHtml(info.Id || id) + '</span></div>';
    html += '<div class="docker-inspect-row"><span class="docker-inspect-label">RepoTags</span><span class="docker-inspect-value">' + escHtml((info.RepoTags || []).join(', ')) + '</span></div>';
    html += '<div class="docker-inspect-row"><span class="docker-inspect-label">Size</span><span class="docker-inspect-value">' + formatBytes(info.Size || 0) + '</span></div>';
    html += '<div class="docker-inspect-row"><span class="docker-inspect-label">Virtual Size</span><span class="docker-inspect-value">' + formatBytes(info.VirtualSize || 0) + '</span></div>';
    html += '<div class="docker-inspect-row"><span class="docker-inspect-label">Architecture</span><span class="docker-inspect-value">' + escHtml(info.Architecture || '') + ' / ' + escHtml(info.Os || '') + '</span></div>';
    html += '<div class="docker-inspect-row"><span class="docker-inspect-label">Created</span><span class="docker-inspect-value">' + timeAgo(info.Created) + '</span></div></div>';

    var cfg = info.Config;
    if (cfg) {
      if (cfg.Env && cfg.Env.length > 0) {
        html += '<div class="docker-inspect-section"><div class="docker-inspect-section-title">Default Env</div><div class="docker-inspect-pre">';
        cfg.Env.forEach(function(e) { html += escHtml(e) + '\n'; });
        html += '</div></div>';
      }
      if (cfg.Cmd && cfg.Cmd.length > 0) {
        html += '<div class="docker-inspect-section"><div class="docker-inspect-section-title">Cmd</div><div class="docker-inspect-value">' + escHtml(cfg.Cmd.join(' ')) + '</div></div>';
      }
      if (cfg.Entrypoint && cfg.Entrypoint.length > 0) {
        html += '<div class="docker-inspect-section"><div class="docker-inspect-section-title">Entrypoint</div><div class="docker-inspect-value">' + escHtml(cfg.Entrypoint.join(' ')) + '</div></div>';
      }
      if (cfg.ExposedPorts) {
        html += '<div class="docker-inspect-section"><div class="docker-inspect-section-title">Exposed Ports</div><div class="docker-inspect-value">' + escHtml(Object.keys(cfg.ExposedPorts).join(', ')) + '</div></div>';
      }
      if (cfg.Labels && Object.keys(cfg.Labels).length > 0) {
        html += '<div class="docker-inspect-section"><div class="docker-inspect-section-title">Labels</div>';
        Object.keys(cfg.Labels).forEach(function(k) {
          html += '<div class="docker-inspect-row"><span class="docker-inspect-label">' + escHtml(k) + '</span><span class="docker-inspect-value">' + escHtml(cfg.Labels[k]) + '</span></div>';
        });
        html += '</div>';
      }
    }

    html += '</div>';
    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = '<div class="db-empty">Error: ' + escHtml(err.message) + '</div>';
  }
}

/* ─── Image History ─── */
async function dockerShowImageHistory(id) {
  var overlay = document.getElementById('dockerImageHistoryModal');
  var body = document.getElementById('dockerImageHistoryBody');
  overlay.style.display = 'flex';
  body.innerHTML = '<div class="db-loading"><div class="db-loading-spinner"></div></div>';
  try {
    var history = await API.docker.imageHistory(id);
    var html = '<table class="docker-history-table"><thead><tr><th>Layer</th><th>Created</th><th>Size</th><th>Command</th></tr></thead><tbody>';
    history.forEach(function(h, idx) {
      var size = h.Size < 1024 ? h.Size + ' B' : h.Size < 1048576 ? (h.Size / 1024).toFixed(1) + ' KB' : (h.Size / 1048576).toFixed(1) + ' MB';
      var cmd = (h.CreatedBy || '').replace(/\s+/g, ' ').substring(0, 120);
      var tag = h.Tag || '';
      html += '<tr><td class="mono">' + (tag ? escHtml(tag) : '<' + idx + '>') + '</td>'
        + '<td>' + timeAgo(new Date(h.Created * 1000).toISOString()) + '</td>'
        + '<td>' + size + '</td>'
        + '<td class="mono small">' + escHtml(cmd) + '</td></tr>';
    });
    html += '</tbody></table>';
    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = '<div class="db-empty">Error: ' + escHtml(err.message) + '</div>';
  }
}

/* ─── Pull Modal ─── */
function dockerShowPullModal() {
  var overlay = document.getElementById('dockerPullModal');
  overlay.style.display = 'flex';
  document.getElementById('dockerPullInput').value = '';
  document.getElementById('dockerPullProgress').innerHTML = '';
  document.getElementById('dockerPullStatus').textContent = '';
  document.getElementById('dockerPullBtn2').style.display = 'inline-block';
  document.getElementById('dockerPullBtn2').disabled = false;
}

function dockerStartPull() {
  var input = document.getElementById('dockerPullInput');
  var image = input.value.trim();
  if (!image) { showToast('Enter an image name', 'error'); return; }
  var progress = document.getElementById('dockerPullProgress');
  var status = document.getElementById('dockerPullStatus');
  var btn = document.getElementById('dockerPullBtn2');
  btn.disabled = true;
  status.textContent = 'Pulling ' + escHtml(image) + '...';
  progress.innerHTML = '';

  var proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  var wsUrl = proto + '//' + window.location.host + '/ws/docker';

  if (dockerPullWS) { try { dockerPullWS.close(); } catch (_) {} }
  dockerPullWS = new WebSocket(wsUrl);

  dockerPullWS.onopen = function() {
    dockerPullWS.send(JSON.stringify({ type: 'pull', image: image }));
  };

  dockerPullWS.onmessage = function(ev) {
    var msg = JSON.parse(ev.data);
    if (msg.type === 'pull-progress') {
      if (msg.id) {
        var lineId = 'pull-line-' + msg.id.replace(/[^a-zA-Z0-9]/g, '');
        var el = document.getElementById(lineId);
        if (!el) {
          el = document.createElement('div');
          el.className = 'docker-pull-line';
          el.id = lineId;
          progress.appendChild(el);
        }
        el.innerHTML = '<span class="docker-pull-id">' + escHtml(msg.id) + '</span> <span class="docker-pull-status">' + escHtml(msg.status || '') + '</span>'
          + (msg.progress ? ' <span class="docker-pull-progress">' + escHtml(msg.progress) + '</span>' : '');
      } else if (msg.status) {
        status.textContent = msg.status;
      }
      progress.scrollTop = progress.scrollHeight;
    } else if (msg.type === 'pull-done') {
      status.textContent = '✅ Pull complete!';
      btn.style.display = 'none';
      showToast('Image pulled successfully', 'success');
      dockerPullWS.close();
      dockerPullWS = null;
      loadImages();
    } else if (msg.type === 'pull-error') {
      status.textContent = '❌ Error: ' + msg.error;
      btn.disabled = false;
      showToast('Pull failed: ' + msg.error, 'error');
      dockerPullWS.close();
      dockerPullWS = null;
    }
  };

  dockerPullWS.onerror = function() {
    status.textContent = '❌ WebSocket error';
    btn.disabled = false;
    dockerPullWS = null;
  };

  dockerPullWS.onclose = function() {
    if (dockerPullWS) dockerPullWS = null;
  };
}

function dockerClosePull() {
  if (dockerPullWS) { try { dockerPullWS.close(); } catch (_) {} dockerPullWS = null; }
  document.getElementById('dockerPullModal').style.display = 'none';
}

/* ─── Prune Modal ─── */
function dockerShowPruneModal() {
  var overlay = document.getElementById('dockerPruneModal');
  overlay.style.display = 'flex';
}

async function dockerDoPrune() {
  var btn = document.getElementById('dockerPruneBtn2');
  var result = document.getElementById('dockerPruneResult');
  var pruneContainers = document.getElementById('dockerPruneContainers').checked;
  var pruneImages = document.getElementById('dockerPruneImages').checked;
  var pruneVolumes = document.getElementById('dockerPruneVolumes').checked;
  btn.disabled = true;
  result.innerHTML = '<div class="db-loading"><div class="db-loading-spinner"></div> Pruning...</div>';
  try {
    var data = await API.docker.prune('all');
    var parts = [];
    if (pruneContainers && data.containers) parts.push('Containers: ' + (data.containers.deleted || []).length + ' removed, ' + formatBytes(data.containers.reclaimedSpace || 0) + ' reclaimed');
    if (pruneImages && data.images) parts.push('Images: ' + (data.images.deleted || []).length + ' removed, ' + formatBytes(data.images.reclaimedSpace || 0) + ' reclaimed');
    if (pruneVolumes && data.volumes) parts.push('Volumes: ' + (data.volumes.deleted || []).length + ' removed, ' + formatBytes(data.volumes.reclaimedSpace || 0) + ' reclaimed');
    if (!parts.length) parts.push('Nothing selected to prune');
    result.innerHTML = '<div class="docker-prune-result">' + parts.join('<br>') + '</div>';
    showToast('Prune complete', 'success');
    loadContainers();
    loadImages();
  } catch (err) {
    result.innerHTML = '<div class="docker-prune-result error">Error: ' + escHtml(err.message) + '</div>';
  }
  btn.disabled = false;
}

function dockerClosePrune() { document.getElementById('dockerPruneModal').style.display = 'none'; }

/* ─── Create Container Modal ─── */
function dockerShowCreateModal() {
  var overlay = document.getElementById('dockerCreateModal');
  overlay.style.display = 'flex';
  /* Load networks */
  API.docker.networks().then(function(nets) {
    var sel = document.getElementById('dockerCreateNetwork');
    if (sel && nets) {
      sel.innerHTML = '<option value="bridge">bridge</option><option value="host">host</option><option value="none">none</option>'
        + nets.filter(function(n) { return n.Name !== 'bridge' && n.Name !== 'host' && n.Name !== 'none'; }).map(function(n) { return '<option value="' + escHtml(n.Name) + '">' + escHtml(n.Name) + '</option>'; }).join('');
    }
  }).catch(function() {});
}

function dockerCreateAddRow(type) {
  var container = document.getElementById('dockerCreate' + type);
  var row = document.createElement('div');
  row.className = 'docker-create-row';
  if (type === 'Ports') {
    row.innerHTML = '<input class="fm-input docker-create-port-h" placeholder="Host port">:<input class="fm-input docker-create-port-c" placeholder="Container port">/<select class="fm-input docker-create-port-p"><option value="tcp">TCP</option><option value="udp">UDP</option></select>'
      + '<button class="fm-btn fm-btn-sm fm-btn-danger" onclick="this.parentElement.remove()">✕</button>';
  } else if (type === 'Volumes') {
    row.innerHTML = '<input class="fm-input docker-create-vol-h" placeholder="Host path">:<input class="fm-input docker-create-vol-c" placeholder="Container path">:<select class="fm-input docker-create-vol-m"><option value="rw">RW</option><option value="ro">RO</option></select>'
      + '<button class="fm-btn fm-btn-sm fm-btn-danger" onclick="this.parentElement.remove()">✕</button>';
  } else if (type === 'Env') {
    row.innerHTML = '<input class="fm-input docker-create-env-k" placeholder="KEY">=<input class="fm-input docker-create-env-v" placeholder="value">'
      + '<button class="fm-btn fm-btn-sm fm-btn-danger" onclick="this.parentElement.remove()">✕</button>';
  }
  container.appendChild(row);
}

async function dockerDoCreate() {
  var img = document.getElementById('dockerCreateImage').value.trim();
  var name = document.getElementById('dockerCreateName').value.trim();
  if (!img) { showToast('Image name is required', 'error'); return; }

  var config = { Image: img };
  if (name) config.name = name;

  /* Ports */
  var portRows = document.querySelectorAll('#dockerCreatePorts .docker-create-row');
  var exposedPorts = {}, portBindings = {};
  portRows.forEach(function(row) {
    var hp = row.querySelector('.docker-create-port-h').value.trim();
    var cp = row.querySelector('.docker-create-port-c').value.trim();
    var p = row.querySelector('.docker-create-port-p').value;
    if (!cp) return;
    var key = cp + '/' + p;
    exposedPorts[key] = {};
    if (hp) {
      if (!portBindings[key]) portBindings[key] = [];
      portBindings[key].push({ HostPort: hp });
    }
  });
  if (Object.keys(exposedPorts).length > 0) config.ExposedPorts = exposedPorts;
  if (Object.keys(portBindings).length > 0) config.HostConfig = config.HostConfig || {};
  if (Object.keys(portBindings).length > 0) config.HostConfig.PortBindings = portBindings;

  /* Volumes */
  var volRows = document.querySelectorAll('#dockerCreateVolumes .docker-create-row');
  var binds = [], volumes = {};
  volRows.forEach(function(row) {
    var hp = row.querySelector('.docker-create-vol-h').value.trim();
    var cp = row.querySelector('.docker-create-vol-c').value.trim();
    var m = row.querySelector('.docker-create-vol-m').value.trim();
    if (cp) {
      volumes[cp] = {};
      if (hp) binds.push(hp + ':' + cp + ':' + m);
    }
  });
  if (Object.keys(volumes).length > 0) config.Volumes = volumes;
  if (binds.length > 0) { config.HostConfig = config.HostConfig || {}; config.HostConfig.Binds = binds; }

  /* Env */
  var envRows = document.querySelectorAll('#dockerCreateEnv .docker-create-row');
  var env = [];
  envRows.forEach(function(row) {
    var k = row.querySelector('.docker-create-env-k').value.trim();
    var v = row.querySelector('.docker-create-env-v').value.trim();
    if (k) env.push(k + '=' + v);
  });
  if (env.length > 0) config.Env = env;

  /* Network */
  var net = document.getElementById('dockerCreateNetwork').value;
  if (net && net !== 'bridge') config.NetworkingConfig = { EndpointsConfig: {} };
  if (net && net !== 'bridge') config.NetworkingConfig.EndpointsConfig[net] = {};

  /* Restart policy */
  var rp = document.getElementById('dockerCreateRestart').value;
  if (rp && rp !== 'no') { config.HostConfig = config.HostConfig || {}; config.HostConfig.RestartPolicy = { Name: rp }; }

  /* Resources */
  var mem = document.getElementById('dockerCreateMemory').value.trim();
  var cpus = document.getElementById('dockerCreateCpus').value.trim();
  if (mem) { config.HostConfig = config.HostConfig || {}; config.HostConfig.Memory = parseInt(mem, 10) * 1024 * 1024; }
  if (cpus) { config.HostConfig = config.HostConfig || {}; config.HostConfig.NanoCpus = parseFloat(cpus) * 1e9; }

  /* Command */
  var cmd = document.getElementById('dockerCreateCmd').value.trim();
  if (cmd) config.Cmd = cmd.split(/\s+/);

  var btn = document.getElementById('dockerCreateBtn2');
  btn.disabled = true;
  btn.textContent = 'Creating...';
  try {
    var result = await API.docker.createContainer(config);
    showToast('Container created: ' + (result.id || '').substring(0, 12), 'success');
    dockerCloseCreate();
    loadContainers();
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Create';
  }
}

function dockerCloseCreate() {
  document.getElementById('dockerCreateModal').style.display = 'none';
  /* Reset form */
  var btn = document.getElementById('dockerCreateBtn2');
  if (btn) { btn.disabled = false; btn.textContent = 'Create'; }
}

/* ─── Auto-refresh ─── */
function dockerSetAutoRefresh(seconds) {
  if (dockerRefreshInterval) { clearInterval(dockerRefreshInterval); dockerRefreshInterval = null; }
  if (seconds > 0) {
    dockerRefreshInterval = setInterval(function() {
      if (dockerState.tab === 'images') loadImages();
      else if (dockerState.tab === 'networks') loadNetworks();
      else if (dockerState.tab === 'compose') loadComposeProjects();
      else loadContainers();
    }, seconds * 1000);
  }
}

/* ─── Toast system ─── */
function showToast(msg, type) {
  if (typeof fmShowToast === 'function') { fmShowToast(msg, type || 'info'); return; }
  /* Fallback: create a toast element */
  var t = document.createElement('div');
  t.className = 'fm-toast' + (type ? ' fm-toast-' + type : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function() { t.classList.add('fm-toast-fadeout'); setTimeout(function() { t.remove(); }, 300); }, 3000);
}

/* ─── UI State ─── */
function showDockerLoading() {
  document.getElementById('dockerLoading').style.display = 'flex';
  document.getElementById('dockerContent').style.display = 'none';
  document.getElementById('dockerError').style.display = 'none';
}

function showDockerContent() {
  document.getElementById('dockerLoading').style.display = 'none';
  document.getElementById('dockerContent').style.display = 'block';
  document.getElementById('dockerError').style.display = 'none';
}

function showDockerError(msg) {
  document.getElementById('dockerLoading').style.display = 'none';
  document.getElementById('dockerContent').style.display = 'none';
  document.getElementById('dockerError').style.display = 'flex';
  document.getElementById('dockerErrorText').textContent = msg;
}

/* ─── Docker Info Bar ─── */
var dockerInfoLoaded = false;
async function loadDockerInfo() {
  if (dockerInfoLoaded) return;
  try {
    var info = await API.docker.info();
    dockerInfoLoaded = true;
    var bar = document.getElementById('dockerInfoBar');
    bar.innerHTML = '<span class="docker-info-item"><span class="docker-info-label">Docker</span> <span class="docker-info-value">' + escHtml(info.ServerVersion || '?') + '</span></span>'
      + '<span class="docker-info-sep"></span>'
      + '<span class="docker-info-item"><span class="docker-info-value">' + escHtml(info.ContainersRunning || 0) + '</span> <span class="docker-info-label">running</span></span>'
      + '<span class="docker-info-item"><span class="docker-info-value">' + escHtml(info.ContainersStopped || 0) + '</span> <span class="docker-info-label">stopped</span></span>'
      + '<span class="docker-info-sep"></span>'
      + '<span class="docker-info-item"><span class="docker-info-value">' + escHtml(info.Images || 0) + '</span> <span class="docker-info-label">images</span></span>'
      + '<span class="docker-info-item"><span class="docker-info-value">' + escHtml(info.NCPU || 0) + '</span> <span class="docker-info-label">CPUs</span></span>'
      + '<span class="docker-info-item"><span class="docker-info-value">' + formatBytes(info.MemTotal || 0) + '</span> <span class="docker-info-label">RAM</span></span>'
      + '<span class="docker-info-sep"></span>'
      + '<span class="docker-info-item"><span class="docker-info-value">' + escHtml(info.Driver || '') + '</span></span>'
      + '<span class="docker-info-item"><span class="docker-info-value">' + escHtml(info.Architecture || '') + '</span></span>';
    bar.style.display = 'flex';
  } catch (_) {}
}

/* ─── Compose Actions ─── */
async function dockerComposeUp(project, btn) {
  if (!confirm('Start all containers in compose project "' + project + '"?')) return;
  if (btn) btn.disabled = true;
  try {
    await API.docker.composeUp(project);
    showToast('Compose "' + project + '" started', 'success');
    await loadContainers();
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
    if (btn) btn.disabled = false;
  }
}

async function dockerComposeDown(project, btn) {
  if (!confirm('Stop all containers in compose project "' + project + '"?')) return;
  if (btn) btn.disabled = true;
  try {
    await API.docker.composeDown(project);
    showToast('Compose "' + project + '" stopped', 'success');
    await loadContainers();
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
    if (btn) btn.disabled = false;
  }
}

/* ─── Networks ─── */
async function loadNetworks() {
  showDockerLoading();
  dockerState.tab = 'networks';
  try {
    var nets = await API.docker.networks();
    dockerState.networks = nets;
    renderNetworks(nets);
    showDockerContent();
  } catch (err) { showDockerError(err.message); }
}

function renderNetworks(nets) {
  var list = document.getElementById('dockerNetworkList');
  var breadcrumb = document.getElementById('dockerBreadcrumb');
  if (breadcrumb) breadcrumb.textContent = 'Networks';

  if (!nets || nets.length === 0) {
    list.innerHTML = '<div class="db-empty">No networks found.</div>';
    return;
  }

  var search = dockerState.search;
  var filtered = search ? nets.filter(function(n) {
    return (n.Name || '').toLowerCase().indexOf(search) > -1 || (n.Driver || '').toLowerCase().indexOf(search) > -1;
  }) : nets;

  var statusBar = '<div class="docker-status-bar"><span class="docker-status-count">' + filtered.length + ' networks</span>'
    + (search ? '<span class="docker-status-filtered"> (filtered from ' + nets.length + ')</span>' : '') + '</div>';

  var html = statusBar;
  filtered.forEach(function(n) {
    var isSystem = ['bridge', 'host', 'none'].indexOf(n.Name) > -1;
    var containerCount = n.Containers ? Object.keys(n.Containers).length : 0;
    html += '<div class="db-user-card docker-net-card">'
      + '<div class="db-user-card-glow"></div>'
      + '<div class="docker-row-top">'
      + '<span class="docker-img-icon">' + (isSystem ? '🔒' : '🌐') + '</span>'
      + '<span class="docker-container-name">' + escHtml(n.Name) + '</span>'
      + '<span class="docker-img-tag">' + escHtml(n.Driver || '') + '</span>'
      + (isSystem ? '<span class="docker-img-tag">system</span>' : '')
      + '</div>'
      + '<div class="docker-row-details">'
      + '<div class="docker-detail-item"><span class="docker-detail-label">ID</span><span class="docker-detail-value mono">' + escHtml((n.Id || '').substring(0, 12)) + '</span></div>'
      + '<div class="docker-detail-item"><span class="docker-detail-label">Scope</span><span class="docker-detail-value">' + escHtml(n.Scope || '') + '</span></div>'
      + '<div class="docker-detail-item"><span class="docker-detail-label">Containers</span><span class="docker-detail-value">' + containerCount + '</span></div>'
      + '</div>'
      + '<div class="docker-row-actions">'
      + '<button class="fm-btn fm-btn-sm" onclick="dockerShowNetInspect(\'' + escHtml(n.Id) + '\')" title="Inspect">🔍 Inspect</button>'
      + (!isSystem ? '<button class="fm-btn fm-btn-sm fm-btn-danger" onclick="dockerRemoveNet(\'' + escHtml(n.Id) + '\', \'' + escHtml(n.Name) + '\')" title="Remove">🗑 Remove</button>' : '')
      + '</div>'
      + '</div>';
  });

  list.innerHTML = html;
}

async function dockerShowNetInspect(id) {
  var overlay = document.getElementById('dockerNetInspectModal');
  var body = document.getElementById('dockerNetInspectBody');
  overlay.style.display = 'flex';
  body.innerHTML = '<div class="db-loading"><div class="db-loading-spinner"></div></div>';
  try {
    var info = await API.docker.inspectNetwork(id);
    var html = '<div class="docker-inspect-grid">';
    html += '<div class="docker-inspect-section"><div class="docker-inspect-section-title">General</div>';
    html += '<div class="docker-inspect-row"><span class="docker-inspect-label">Name</span><span class="docker-inspect-value">' + escHtml(info.Name || '') + '</span></div>';
    html += '<div class="docker-inspect-row"><span class="docker-inspect-label">ID</span><span class="docker-inspect-value mono">' + escHtml(info.Id || id) + '</span></div>';
    html += '<div class="docker-inspect-row"><span class="docker-inspect-label">Driver</span><span class="docker-inspect-value">' + escHtml(info.Driver || '') + '</span></div>';
    html += '<div class="docker-inspect-row"><span class="docker-inspect-label">Scope</span><span class="docker-inspect-value">' + escHtml(info.Scope || '') + '</span></div>';
    html += '<div class="docker-inspect-row"><span class="docker-inspect-label">Created</span><span class="docker-inspect-value">' + timeAgo(info.Created) + '</span></div>';
    html += '</div>';

    if (info.IPAM && info.IPAM.Config && info.IPAM.Config.length > 0) {
      html += '<div class="docker-inspect-section"><div class="docker-inspect-section-title">IPAM Config</div>';
      info.IPAM.Config.forEach(function(c) {
        html += '<div class="docker-inspect-row"><span class="docker-inspect-label">Subnet</span><span class="docker-inspect-value">' + escHtml(c.Subnet || '-') + '</span></div>';
        html += '<div class="docker-inspect-row"><span class="docker-inspect-label">Gateway</span><span class="docker-inspect-value">' + escHtml(c.Gateway || '-') + '</span></div>';
        if (c.IPRange) html += '<div class="docker-inspect-row"><span class="docker-inspect-label">IP Range</span><span class="docker-inspect-value">' + escHtml(c.IPRange) + '</span></div>';
      });
      html += '</div>';
    }

    var containers = info.Containers || {};
    var cIds = Object.keys(containers);
    if (cIds.length > 0) {
      html += '<div class="docker-inspect-section"><div class="docker-inspect-section-title">Connected Containers</div>';
      cIds.forEach(function(cid) {
        var c = containers[cid];
        html += '<div class="docker-inspect-row"><span class="docker-inspect-label">' + escHtml((c.Name || '').substring(0, 20)) + '</span><span class="docker-inspect-value">IP: ' + escHtml(c.IPAddress || '-') + '</span></div>';
      });
      html += '</div>';
    }

    html += '<div class="docker-inspect-section"><div class="docker-inspect-section-title" onclick="dockerToggleRaw(this)" style="cursor:pointer">▶ Raw JSON</div>';
    html += '<div class="docker-inspect-raw" style="display:none"><pre class="docker-logs-content">' + escHtml(JSON.stringify(info, null, 2)) + '</pre></div></div>';
    html += '</div>';
    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = '<div class="db-empty">Error: ' + escHtml(err.message) + '</div>';
  }
}

async function dockerRemoveNet(id, name) {
  if (!confirm('Remove network "' + name + '"? This cannot be undone.')) return;
  try {
    await API.docker.removeNetwork(id);
    showToast('Network removed', 'success');
    loadNetworks();
  } catch (err) {
    showToast('Failed to remove: ' + err.message, 'error');
  }
}

/* ─── Compose Projects ─── */
async function loadComposeProjects() {
  showDockerLoading();
  dockerState.tab = 'compose';
  try {
    var projects = await API.docker.composeProjects();
    dockerState.composeProjects = projects;
    renderComposeProjects(projects);
    showDockerContent();
  } catch (err) { showDockerError(err.message); }
}

function renderComposeProjects(projects) {
  var list = document.getElementById('dockerComposeList');
  var breadcrumb = document.getElementById('dockerBreadcrumb');
  if (breadcrumb) breadcrumb.textContent = 'Compose Stacks';

  if (!projects || projects.length === 0) {
    list.innerHTML = '<div class="db-empty">No compose projects found. Containers with <code>com.docker.compose.project</code> label will appear here.</div>';
    return;
  }

  var html = '<div class="docker-status-bar"><span class="docker-status-count">' + projects.length + ' project' + (projects.length > 1 ? 's' : '') + '</span></div>';

  projects.forEach(function(proj) {
    var color = getProjectColor(proj.name);
    html += '<div class="docker-project-card" style="--proj-color:' + color + '">';
    html += '<div class="docker-project-header">';
    html += '<span class="docker-project-toggle">▼</span>';
    html += '<span class="docker-project-icon">📦</span>';
    html += '<div class="docker-project-info">';
    html += '<span class="docker-project-name">' + escHtml(proj.name) + '</span>';
    html += '<span class="docker-project-meta">' + proj.total + ' services · ' + proj.running + ' running</span>';
    html += '</div>';
    html += '<div class="docker-project-actions">';
    html += '<button class="fm-btn fm-btn-sm docker-compose-up" data-project="' + escHtml(proj.name) + '">▶ Up</button>';
    html += '<button class="fm-btn fm-btn-sm docker-compose-down" data-project="' + escHtml(proj.name) + '">⏹ Down</button>';
    html += '</div>';
    html += '<div class="docker-project-dots">';
    proj.containers.forEach(function(c) {
      var cls = c.State === 'running' ? 'running' : (c.State === 'paused' ? 'paused' : 'stopped');
      var cNames = Array.isArray(c.Names) ? c.Names : (c.Names ? [c.Names] : ['?']);
      html += '<span class="docker-project-dot ' + cls + '" title="' + escHtml(cNames[0] || '') + ' (' + escHtml(c.Service || '') + ')"></span>';
    });
    html += '</div></div>';

    html += '<div class="docker-project-body">';
    proj.containers.forEach(function(c) {
      var id = c.ID || '';
      var shortId = id.length > 12 ? id.substring(0, 12) : id;
      var cNames = Array.isArray(c.Names) ? c.Names : (c.Names ? [c.Names] : ['']);
      var name = (cNames[0] || '').replace(/^\//, '').replace(/^.+_/, '');
      var state = c.State || '';
      var statusCls = state === 'running' ? 'running' : (state === 'paused' ? 'paused' : 'stopped');
      html += '<div class="docker-sub-item" data-id="' + escHtml(id) + '">'
        + '<span class="docker-sub-status ' + statusCls + '"></span>'
        + '<div class="docker-sub-main">'
        + '<span class="docker-sub-name">' + escHtml(name) + ' <span class="docker-compose-svc">' + escHtml(c.Service || '') + '</span></span>'
        + '<span class="docker-sub-meta">' + escHtml(c.Image || '') + ' <span class="docker-sub-id">' + shortId + '</span></span>'
        + '</div>'
        + '<div class="docker-sub-actions">'
        + '<button class="fm-btn fm-btn-sm" data-act="logs" data-id="' + escHtml(id) + '" title="Logs">📋</button>'
        + '<button class="fm-btn fm-btn-sm" data-act="exec" data-id="' + escHtml(id) + '" title="Exec">💻</button>'
        + '<button class="fm-btn fm-btn-sm" data-act="inspect" data-id="' + escHtml(id) + '" title="Inspect">🔍</button>'
        + '</div></div>';
    });
    html += '</div></div>';
  });

  list.innerHTML = html;

  /* Bind compose project actions */
  list.querySelectorAll('.docker-compose-up').forEach(function(btn) {
    btn.addEventListener('click', function() { dockerComposeUp(btn.dataset.project, btn); });
  });
  list.querySelectorAll('.docker-compose-down').forEach(function(btn) {
    btn.addEventListener('click', function() { dockerComposeDown(btn.dataset.project, btn); });
  });
  /* Bind sub-item clicks for logs/exec/inspect */
  list.querySelectorAll('.docker-sub-item[data-id]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      var actBtn = e.target.closest('[data-act]');
      if (!actBtn) return;
      var act = actBtn.dataset.act, id = actBtn.dataset.id;
      e.stopPropagation();
      if (act === 'logs') dockerShowLogs(id);
      else if (act === 'exec') dockerShowExec(id);
      else if (act === 'inspect') dockerShowInspect(id);
    });
  });
}

/* ─── Container Files Browser ─── */
var dockerFilesContainerId = null;
var dockerFilesCurrentPath = '/';

function dockerShowFiles(id) {
  var overlay = document.getElementById('dockerFilesModal');
  var title = document.getElementById('dockerFilesTitle');
  overlay.style.display = 'flex';
  title.textContent = 'Files: ' + id.substring(0, 12);
  dockerFilesContainerId = id;
  dockerFilesCurrentPath = '/';
  document.getElementById('dockerFilesPath').value = '/';
  document.getElementById('dockerFileViewer').style.display = 'none';
  dockerFilesLoad('/');
}

function dockerFilesGoUp() {
  var path = dockerFilesCurrentPath || '/';
  var parent = path === '/' ? '/' : path.replace(/\/[^\/]+\/?$/, '') || '/';
  dockerFilesChangePath(parent);
}

function dockerFilesNavigate() {
  var path = document.getElementById('dockerFilesPath').value.trim() || '/';
  dockerFilesCurrentPath = path;
  document.getElementById('dockerFileViewer').style.display = 'none';
  dockerFilesLoad(path);
}

function dockerFilesRefresh() {
  document.getElementById('dockerFileViewer').style.display = 'none';
  dockerFilesLoad(dockerFilesCurrentPath);
}

async function dockerFilesLoad(path) {
  var list = document.getElementById('dockerFilesList');
  list.innerHTML = '<div class="db-loading"><div class="db-loading-spinner"></div></div>';
  try {
    var data = await API.docker.containerFs(dockerFilesContainerId, path);
    var entries = data.entries || [];
    /* filter to top-level only (entries under the given path) */
    var depth = path === '/' ? 1 : path.split('/').filter(Boolean).length + 1;
    var seen = {};
    var items = [];
    entries.forEach(function(e) {
      var parts = e.name.replace(/^\//, '').split('/');
      if (parts.length === depth) {
        var baseName = parts[parts.length - 1];
        if (!seen[baseName] && baseName) {
          seen[baseName] = true;
          items.push({ name: baseName, size: e.size, type: e.type, mode: e.mode });
        }
      } else if (parts.length > depth) {
        var dirName = parts[depth - 1];
        if (dirName && !seen[dirName]) {
          seen[dirName] = true;
          items.push({ name: dirName, size: 0, type: 'directory', mode: 0 });
        }
      }
    });

    /* Sort: directories first, then files */
    items.sort(function(a, b) {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    var html = '';
    if (path !== '/') {
      var parentPath = path.replace(/\/[^\/]+\/?$/, '') || '/';
      html += '<div class="docker-file-row docker-file-dir" onclick="dockerFilesChangePath(\'' + escHtml(parentPath) + '\')">'
        + '<span class="docker-file-icon">📁</span><span class="docker-file-name">..</span>'
        + '<span class="docker-file-meta">Parent directory</span></div>';
    }
    items.forEach(function(item) {
      var isDir = item.type === 'directory';
      var icon = isDir ? '📁' : '📄';
      var fullPath = (path === '/' ? '/' : path.replace(/\/$/, '') + '/') + item.name;
      var click = isDir ? 'dockerFilesChangePath' : 'dockerFilesReadFile';
      var arg = isDir ? "'" + escHtml(fullPath) + "'" : "'" + escHtml(fullPath) + "'";
      var meta = isDir ? '' : formatBytes(item.size);
      html += '<div class="docker-file-row" onclick="' + click + '(' + arg + ')">'
        + '<span class="docker-file-icon">' + icon + '</span>'
        + '<span class="docker-file-name">' + escHtml(item.name) + '</span>'
        + '<span class="docker-file-meta">' + meta + '</span>'
        + '</div>';
    });
    if (items.length === 0 && path !== '/') {
      html += '<div class="db-empty" style="padding:20px">Empty directory</div>';
    }
    list.innerHTML = html || '<div class="db-empty" style="padding:20px">Empty directory</div>';
  } catch (err) {
    list.innerHTML = '<div class="db-empty" style="padding:20px">Error: ' + escHtml(err.message) + '</div>';
  }
}

function dockerFilesChangePath(path) {
  dockerFilesCurrentPath = path;
  document.getElementById('dockerFilesPath').value = path;
  document.getElementById('dockerFileViewer').style.display = 'none';
  dockerFilesLoad(path);
}

async function dockerFilesReadFile(path) {
  var viewer = document.getElementById('dockerFileViewer');
  var nameEl = document.getElementById('dockerFileViewerName');
  var contentEl = document.getElementById('dockerFileViewerContent');
  viewer.style.display = 'block';
  nameEl.textContent = path;
  contentEl.textContent = 'Loading...';
  try {
    var data = await API.docker.containerFsRead(dockerFilesContainerId, path);
    contentEl.textContent = data.content || '(empty file)';
  } catch (err) {
    contentEl.textContent = 'Error: ' + err.message;
  }
}

function dockerCloseFileViewer() {
  document.getElementById('dockerFileViewer').style.display = 'none';
}

function dockerCloseFiles() {
  dockerFilesContainerId = null;
  document.getElementById('dockerFilesModal').style.display = 'none';
}

window.initDocker = initDocker;
