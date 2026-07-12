let mimeState = {
  system: null,
  user: [],
  filter: '',
  editingId: null,
};

const CATEGORY_ICONS = {
  application: '📦', text: '📝', image: '🖼', audio: '🎵',
  video: '🎬', font: '🔤', message: '✉', model: '🏗', multipart: '📎',
};

const DEFAULT_COLORS = {
  application: '#06b6d4', text: '#10b981', image: '#ec4899',
  audio: '#f59e0b', video: '#8b5cf6', font: '#3b82f6',
  message: '#14b8a6', model: '#f97316', multipart: '#64748b',
};

window.initMimetypes = async function () {
  try {
    const me = await API.me();
    if (me.role !== 'admin') {
      document.getElementById('mimeContent').innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">⚠</span><span class="db-error-text">Admin access required</span></div>';
      return;
    }
    await loadAll();
  } catch {
    document.getElementById('mimeContent').innerHTML = '<div class="db-error" style="display:flex"><span class="db-error-icon">⚠</span><span class="db-error-text">Session expired</span></div>';
  }
};

async function loadAll() {
  const [system, user] = await Promise.all([
    API.mimetypes.getSystem(),
    API.mimetypes.list(),
  ]);
  mimeState.system = system;
  mimeState.user = user;
  render();
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
}

function render() {
  renderHeader();
  renderSystem();
  renderUser();
}

function renderHeader() {
  if (!mimeState.system) return;
  const el = document.getElementById('mimeStats');
  const userCount = mimeState.user?.length || 0;
  el.innerHTML = '<span class="mime-stat"><strong>' + mimeState.system.total + '</strong> system types</span>'
    + '<span class="mime-stat-sep">|</span>'
    + '<span class="mime-stat"><strong>' + userCount + '</strong> user-defined</span>';
}

function renderSystem() {
  const el = document.getElementById('mimeSystemTypes');
  if (!mimeState.system || !mimeState.system.categories) {
    el.innerHTML = '<div class="mime-empty">No system MIME types found</div>';
    return;
  }
  const cats = mimeState.system.categories;
  const breakdown = mimeState.system.breakdown;
  const colors = mimeState.system.colors || DEFAULT_COLORS;
  const total = mimeState.system.total || 1;

  const catEntries = Object.entries(cats).sort((a, b) => b[1].length - a[1].length);

  let html = '';

  html += '<div class="mime-distribution">';
  for (const [cat, entries] of catEntries) {
    const pct = Math.round((entries.length / total) * 100);
    const color = colors[cat] || '#64748b';
    html += '<div class="mime-dist-item">'
      + '<span class="mime-dist-label">' + esc(CATEGORY_ICONS[cat] || '📄') + ' ' + esc(cat) + '</span>'
      + '<div class="mime-dist-bar-wrap"><div class="mime-dist-bar" style="width:' + pct + '%;background:' + color + '"></div></div>'
      + '<span class="mime-dist-pct">' + pct + '%</span>'
      + '<span class="mime-dist-count">' + entries.length + '</span>'
      + '</div>';
  }
  html += '</div>';

  const filter = mimeState.filter.toLowerCase();

  for (const [cat, entries] of catEntries) {
    const color = colors[cat] || '#64748b';
    const filtered = filter ? entries.filter(function (e) {
      return e.mimeType.toLowerCase().includes(filter)
        || e.extensions.some(function (ext) { return ext.toLowerCase().includes(filter); });
    }) : entries;
    if (filter && filtered.length === 0) continue;

    html += '<div class="mime-category">'
      + '<div class="mime-category-header" onclick="toggleMimeCat(this)">'
      + '<span class="mime-cat-toggle">▼</span>'
      + '<span class="mime-cat-icon">' + esc(CATEGORY_ICONS[cat] || '📄') + '</span>'
      + '<span class="mime-cat-name" style="color:' + color + '">' + esc(cat) + '</span>'
      + '<span class="mime-cat-count">' + filtered.length + (filter && filtered.length !== entries.length ? '/' + entries.length : '') + '</span>'
      + '</div>'
      + '<div class="mime-category-body">';

    const visible = filtered.slice(0, filter ? 500 : 150);
    for (const entry of visible) {
      html += '<div class="mime-entry">'
        + '<span class="mime-entry-type">' + esc(entry.mimeType) + '</span>'
        + '<span class="mime-entry-exts">';
      if (entry.extensions.length > 0) {
        html += entry.extensions.slice(0, 4).map(function (e) { return '<code class="mime-ext">' + esc(e) + '</code>'; }).join('');
        if (entry.extensions.length > 4) {
          html += '<span class="mime-ext-more">+' + (entry.extensions.length - 4) + '</span>';
        }
      } else {
        html += '<span class="mime-no-ext">—</span>';
      }
      html += '</span></div>';
    }
    if (visible.length < filtered.length) {
      html += '<div class="mime-more">+' + (filtered.length - visible.length) + ' more matches</div>';
    }
    if (!filter && entries.length > 150) {
      html += '<div class="mime-more">+' + (entries.length - 150) + ' more...</div>';
    }

    html += '</div></div>';
  }

  el.innerHTML = html;
}

function toggleMimeCat(header) {
  const body = header.nextElementSibling;
  const toggle = header.querySelector('.mime-cat-toggle');
  if (body.style.display === 'none') {
    body.style.display = 'block';
    toggle.textContent = '▼';
  } else {
    body.style.display = 'none';
    toggle.textContent = '▶';
  }
}

function filterSystem() {
  mimeState.filter = document.getElementById('mimeSystemSearch').value;
  renderSystem();
}

function renderUser() {
  const el = document.getElementById('mimeUserTypes');
  const types = mimeState.user || [];
  if (types.length === 0) {
    el.innerHTML = '<div class="mime-empty">No user-defined MIME types yet. Click "Add" to create one.</div>';
    return;
  }
  el.innerHTML = types.map(function (t) {
    var color = DEFAULT_COLORS[t.mimeType.split('/')[0]] || '#06b6d4';
    return '<div class="mime-user-card" data-id="' + esc(t.id) + '">'
      + '<div class="mime-user-info">'
      + '<div class="mime-user-type" style="--mime-color:' + color + '">' + esc(t.mimeType) + '</div>'
      + '<div class="mime-user-exts">' + t.extensions.map(function (e) { return '<code class="mime-ext">' + esc(e) + '</code>'; }).join('') + '</div>'
      + (t.description ? '<div class="mime-user-desc">' + esc(t.description) + '</div>' : '')
      + '</div>'
      + '<div class="mime-user-actions">'
      + '<button class="mime-btn mime-btn-icon" onclick="openEditMime(\'' + esc(t.id) + '\')" title="Edit">✎</button>'
      + '<button class="mime-btn mime-btn-icon mime-btn-danger" onclick="deleteMime(\'' + esc(t.id) + '\')" title="Delete">🗑</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

function openAddMime() {
  mimeState.editingId = null;
  document.getElementById('mimeModalTitle').textContent = 'Add Custom MIME Type';
  document.getElementById('mimeModalType').value = '';
  document.getElementById('mimeModalExts').value = '';
  document.getElementById('mimeModalDesc').value = '';
  document.getElementById('mimeModalError').textContent = '';
  document.getElementById('mimeModalError').style.display = 'none';
  document.getElementById('mimeModalOverlay').style.display = 'flex';
}

function openEditMime(id) {
  var t = mimeState.user.find(function (x) { return x.id === id; });
  if (!t) return;
  mimeState.editingId = id;
  document.getElementById('mimeModalTitle').textContent = 'Edit MIME Type';
  document.getElementById('mimeModalType').value = t.mimeType;
  document.getElementById('mimeModalExts').value = t.extensions.join(', ');
  document.getElementById('mimeModalDesc').value = t.description || '';
  document.getElementById('mimeModalError').textContent = '';
  document.getElementById('mimeModalError').style.display = 'none';
  document.getElementById('mimeModalOverlay').style.display = 'flex';
}

function closeMimeModal() {
  document.getElementById('mimeModalOverlay').style.display = 'none';
}

async function saveMime() {
  var type = document.getElementById('mimeModalType').value.trim();
  var exts = document.getElementById('mimeModalExts').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var desc = document.getElementById('mimeModalDesc').value.trim();
  var errEl = document.getElementById('mimeModalError');

  if (!type) { errEl.textContent = 'MIME type is required'; errEl.style.display = 'block'; return; }
  if (exts.length === 0) { errEl.textContent = 'At least one extension is required'; errEl.style.display = 'block'; return; }

  try {
    if (mimeState.editingId) {
      await API.mimetypes.update(mimeState.editingId, { mimeType: type, extensions: exts, description: desc });
    } else {
      await API.mimetypes.create({ mimeType: type, extensions: exts, description: desc });
    }
    closeMimeModal();
    showMimeToast(mimeState.editingId ? 'MIME type updated' : 'MIME type created', 'success');
    await loadAll();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
}

async function deleteMime(id) {
  if (!confirm('Delete this MIME type?')) return;
  try {
    await API.mimetypes.del(id);
    showMimeToast('MIME type deleted', 'success');
    await loadAll();
  } catch (err) {
    showMimeToast(err.message, 'error');
  }
}

var mimeToastTimer = null;
function showMimeToast(msg, type) {
  var el = document.getElementById('mimeToast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'mime-toast ' + (type || 'info');
  el.style.display = 'block';
  if (mimeToastTimer) clearTimeout(mimeToastTimer);
  mimeToastTimer = setTimeout(function () { el.style.display = 'none'; }, 4000);
}

// Modal click-outside close
document.addEventListener('click', function (e) {
  var overlay = document.getElementById('mimeModalOverlay');
  if (overlay && e.target === overlay) closeMimeModal();
});
