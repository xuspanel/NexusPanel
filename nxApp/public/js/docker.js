function escHtml(str) { if (!str) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 2592000) return Math.floor(diff / 86400) + 'd ago';
  return d.toLocaleDateString();
}

let dockerState = { containers: [], images: [], tab: 'containers', loading: false };
let dockerInit = false;

const PROJECT_COLORS = ['#06b6d4', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#3b82f6', '#f97316', '#14b8a6'];
let dockerProjectColors = {};

function getProjectColor(projectName) {
  if (!dockerProjectColors[projectName]) {
    const idx = Object.keys(dockerProjectColors).length % PROJECT_COLORS.length;
    dockerProjectColors[projectName] = PROJECT_COLORS[idx];
  }
  return dockerProjectColors[projectName];
}

function parseLabels(labelsStr) {
  if (!labelsStr) return {};
  const result = {};
  labelsStr.split(',').forEach(function (part) {
    const eq = part.indexOf('=');
    if (eq === -1) return;
    result[part.substring(0, eq).trim()] = part.substring(eq + 1).trim();
  });
  return result;
}

function groupContainers(containers) {
  const projects = {};
  const standalone = [];

  containers.forEach(function (c) {
    const labels = parseLabels(c.Labels);
    const project = labels['com.docker.compose.project'];
    if (project) {
      if (!projects[project]) projects[project] = [];
      projects[project].push(c);
    } else {
      standalone.push(c);
    }
  });

  const projectList = Object.keys(projects).sort().map(function (name) {
    const conts = projects[name];
    const running = conts.filter(function (c) { return c.State === 'running'; }).length;
    return { name: name, containers: conts, running: running, total: conts.length, type: 'project' };
  });

  return { projects: projectList, standalone: standalone };
}

async function initDocker() {
  if (!dockerInit) {
    dockerInit = true;
    document.getElementById('dockerRefreshBtn').addEventListener('click', refreshDocker);
    document.getElementById('dockerRetryBtn').addEventListener('click', refreshDocker);
    document.querySelectorAll('.docker-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.docker-tab').forEach(function (t) { t.classList.remove('active'); });
        document.querySelectorAll('.docker-tab-content').forEach(function (c) { c.classList.remove('active'); });
        tab.classList.add('active');
        var target = document.getElementById('dockerTab' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1));
        if (target) target.classList.add('active');
        if (tab.dataset.tab === 'images') loadImages();
        else loadContainers();
      });
    });
  }
  await loadContainers();
}

function refreshDocker() {
  if (dockerState.tab === 'images') loadImages();
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
  } catch (err) {
    showDockerError(err.message);
  }
}

async function loadImages() {
  showDockerLoading();
  dockerState.tab = 'images';
  try {
    var list = await API.docker.images();
    dockerState.images = list;
    renderImages(list);
    showDockerContent();
  } catch (err) {
    showDockerError(err.message);
  }
}

function renderContainers(containers) {
  var list = document.getElementById('dockerContainerList');
  var breadcrumb = document.getElementById('dockerBreadcrumb');
  if (breadcrumb) breadcrumb.textContent = 'Projects';

  if (containers.length === 0) {
    list.innerHTML = '<div class="db-empty">No containers found. Run a container to get started.</div>';
    return;
  }

  dockerProjectColors = {};
  var grouped = groupContainers(containers);
  var html = '';

  grouped.projects.forEach(function (proj, idx) {
    var color = getProjectColor(proj.name);
    var icon = '📦';
    html += '<div class="docker-project-card" style="--proj-color:' + color + '">';
    html += '<div class="docker-project-header" onclick="toggleDockerProject(this)">';
    html += '<span class="docker-project-toggle">▼</span>';
    html += '<span class="docker-project-icon">' + icon + '</span>';
    html += '<div class="docker-project-info">';
    html += '<span class="docker-project-name">' + escHtml(proj.name) + '</span>';
    html += '<span class="docker-project-meta">' + proj.total + ' containers · ' + proj.running + ' running</span>';
    html += '</div>';
    html += '<div class="docker-project-dots">';
    proj.containers.forEach(function (c) {
      var cls = c.State === 'running' ? 'running' : (c.State === 'paused' ? 'paused' : 'stopped');
      html += '<span class="docker-project-dot ' + cls + '"></span>';
    });
    html += '</div>';
    html += '</div>';

    html += '<div class="docker-project-body">';
    proj.containers.forEach(function (c) {
      html += renderSubContainer(c);
    });
    html += '</div></div>';
  });

  if (grouped.standalone.length > 0) {
    var standaloneColor = getProjectColor('_standalone');
    html += '<div class="docker-project-card docker-project-standalone" style="--proj-color:' + standaloneColor + '">';
    html += '<div class="docker-project-header" onclick="toggleDockerProject(this)">';
    html += '<span class="docker-project-toggle">▼</span>';
    html += '<span class="docker-project-icon">📄</span>';
    html += '<div class="docker-project-info">';
    html += '<span class="docker-project-name">Other Containers</span>';
    html += '<span class="docker-project-meta">' + grouped.standalone.length + ' container' + (grouped.standalone.length > 1 ? 's' : '') + '</span>';
    html += '</div>';
    html += '</div>';
    html += '<div class="docker-project-body">';
    grouped.standalone.forEach(function (c) {
      html += renderSubContainer(c);
    });
    html += '</div></div>';
  }

  list.innerHTML = html;
  bindDockerActions();
}

function renderSubContainer(c) {
  var id = c.ID || '';
  var shortId = id.length > 12 ? id.substring(0, 12) : id;
  var name = (c.Names || '').replace(/^\//, '').replace(/^.+_/, '');
  var image = c.Image || '';
  var state = c.State || '';
  var ports = c.Ports || '';
  var running = state === 'running';
  var isPaused = state === 'paused';
  var portTags = ports ? ports.replace(/0\.0\.0\.0:/g, '').split(', ').filter(Boolean).map(function (p) {
    return '<span class="docker-port-tag">' + escHtml(p) + '</span>';
  }).join('') : '';

  var cls = running ? 'running' : (isPaused ? 'paused' : 'stopped');

  return '<div class="docker-sub-item" data-id="' + escHtml(id) + '">'
    + '<span class="docker-sub-status ' + cls + '"></span>'
    + '<div class="docker-sub-main">'
    + '<span class="docker-sub-name" title="' + escHtml((c.Names || '').replace(/^\//, '')) + '">' + escHtml(name) + '</span>'
    + '<span class="docker-sub-meta">' + escHtml(image) + ' <span class="docker-sub-id">' + shortId + '</span></span>'
    + (portTags ? '<span class="docker-sub-ports">' + portTags + '</span>' : '')
    + '</div>'
    + '<div class="docker-sub-actions">'
    + (running ? '<button class="fm-btn fm-btn-sm docker-act-stop" data-id="' + escHtml(id) + '" title="Stop">⏹</button>' : '')
    + (running ? '<button class="fm-btn fm-btn-sm docker-act-restart" data-id="' + escHtml(id) + '" title="Restart">🔄</button>' : '')
    + (!running && !isPaused ? '<button class="fm-btn fm-btn-sm docker-act-start" data-id="' + escHtml(id) + '" title="Start">▶</button>' : '')
    + '<button class="fm-btn fm-btn-sm docker-act-logs" data-id="' + escHtml(id) + '" title="Logs">📋</button>'
    + '<button class="fm-btn fm-btn-sm fm-btn-danger docker-act-remove" data-id="' + escHtml(id) + '" title="Remove">🗑</button>'
    + '</div>'
    + '</div>';
}

function bindDockerActions() {
  var list = document.getElementById('dockerContainerList');
  if (!list) return;

  list.querySelectorAll('.docker-act-start').forEach(function (btn) {
    btn.addEventListener('click', function (e) { e.stopPropagation(); dockerAction('start', this.dataset.id); });
  });
  list.querySelectorAll('.docker-act-stop').forEach(function (btn) {
    btn.addEventListener('click', function (e) { e.stopPropagation(); dockerAction('stop', this.dataset.id); });
  });
  list.querySelectorAll('.docker-act-restart').forEach(function (btn) {
    btn.addEventListener('click', function (e) { e.stopPropagation(); dockerAction('restart', this.dataset.id); });
  });
  list.querySelectorAll('.docker-act-remove').forEach(function (btn) {
    btn.addEventListener('click', function (e) { e.stopPropagation(); dockerRemoveContainer(this.dataset.id); });
  });
  list.querySelectorAll('.docker-act-logs').forEach(function (btn) {
    btn.addEventListener('click', function (e) { e.stopPropagation(); dockerShowLogs(this.dataset.id); });
  });
}

function toggleDockerProject(header) {
  var body = header.nextElementSibling;
  var toggle = header.querySelector('.docker-project-toggle');
  if (body.classList.contains('collapsed')) {
    body.classList.remove('collapsed');
    if (toggle) toggle.textContent = '▼';
  } else {
    body.classList.add('collapsed');
    if (toggle) toggle.textContent = '▶';
  }
}

function renderImages(images) {
  var list = document.getElementById('dockerImageList');
  var breadcrumb = document.getElementById('dockerBreadcrumb');
  if (breadcrumb) breadcrumb.textContent = 'Images';
  if (images.length === 0) {
    list.innerHTML = '<div class="db-empty">No images found. Pull an image to get started.</div>';
    return;
  }
  list.innerHTML = images.map(function (img) {
    var id = img.ID || '';
    var shortId = id.length > 12 ? id.substring(0, 12) : id;
    var repo = img.Repository || '';
    var tag = img.Tag || '';
    var size = img.Size || '';
    var created = img.CreatedAt || '';

    return '<div class="db-user-card" data-id="' + escHtml(id) + '">'
      + '<div class="db-user-card-glow"></div>'
      + '<div class="docker-row-top">'
      + '<span class="docker-img-icon">📦</span>'
      + '<span class="docker-container-name">' + escHtml(repo || '<none>') + '</span>'
      + '<span class="docker-img-tag">' + escHtml(tag || '<none>') + '</span>'
      + '</div>'
      + '<div class="docker-row-details">'
      + '<div class="docker-detail-item"><span class="docker-detail-label">Image ID</span><span class="docker-detail-value">' + shortId + '</span></div>'
      + '<div class="docker-detail-item"><span class="docker-detail-label">Size</span><span class="docker-detail-value">' + escHtml(size) + '</span></div>'
      + '<div class="docker-detail-item"><span class="docker-detail-label">Created</span><span class="docker-detail-value">' + timeAgo(created) + '</span></div>'
      + '</div>'
      + '<div class="docker-row-actions">'
      + '<button class="fm-btn fm-btn-sm fm-btn-danger docker-act-rmi" data-id="' + escHtml(id) + '" data-repo="' + escHtml(repo || '<none>') + '">🗑 Remove</button>'
      + '</div>'
      + '</div>';
  }).join('');

  list.querySelectorAll('.docker-act-rmi').forEach(function (btn) {
    btn.addEventListener('click', function (e) { e.stopPropagation(); dockerRemoveImage(this.dataset.id, this.dataset.repo); });
  });
}

async function dockerAction(action, id) {
  try {
    if (action === 'start') await API.docker.start(id);
    else if (action === 'stop') await API.docker.stop(id);
    else if (action === 'restart') await API.docker.restart(id);
    await loadContainers();
  } catch (err) {
    alert('Failed to ' + action + ' container: ' + err.message);
  }
}

function dockerRemoveContainer(id) {
  if (!confirm('Remove this container? This action cannot be undone.')) return;
  dockerActionRemove(id);
}

async function dockerActionRemove(id) {
  try {
    await API.docker.remove(id);
    await loadContainers();
  } catch (err) {
    alert('Failed to remove container: ' + err.message);
  }
}

function dockerRemoveImage(id, repo) {
  if (!confirm('Remove image "' + repo + '"? This action cannot be undone.')) return;
  dockerActionRemoveImage(id);
}

async function dockerActionRemoveImage(id) {
  try {
    await API.docker.removeImage(id);
    await loadImages();
  } catch (err) {
    alert('Failed to remove image: ' + err.message);
  }
}

async function dockerShowLogs(id) {
  var overlay = document.getElementById('dockerLogsModal');
  var content = document.getElementById('dockerLogsContent');
  var title = document.getElementById('dockerLogsTitle');
  overlay.style.display = 'flex';
  title.textContent = 'Container Logs';
  content.textContent = 'Loading...';
  try {
    var data = await API.docker.logs(id);
    content.textContent = data.logs || '(no output)';
  } catch (err) {
    content.textContent = 'Error loading logs: ' + err.message;
  }
}

function dockerCloseLogs() {
  document.getElementById('dockerLogsModal').style.display = 'none';
}

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

window.initDocker = initDocker;
