let fmState = {
  currentPath: '/',
  entries: [],
  selected: new Set(),
  showHidden: localStorage.getItem('fmShowHidden') === 'true',
  history: ['/'],
  historyIndex: 0,
  searchQuery: '',
  contextPath: null,
  contextName: null,
  editorPath: null,
  editorOriginalContent: null,
  fmInitialized: false,
  clipboard: null,
};

const ICON_MAP = {
  directory: '📁', '.jpg': '🖼', '.jpeg': '🖼', '.png': '🖼', '.gif': '🖼',
  '.svg': '🖼', '.webp': '🖼', '.ico': '🖼', '.bmp': '🖼',
  '.mp4': '🎬', '.avi': '🎬', '.mkv': '🎬', '.mov': '🎬',
  '.mp3': '🎵', '.wav': '🎵', '.flac': '🎵', '.ogg': '🎵',
  '.zip': '📦', '.tar': '📦', '.gz': '📦', '.rar': '📦', '.7z': '📦',
  '.pdf': '📄', '.doc': '📝', '.docx': '📝',
  '.js': '📜', '.ts': '📜', '.jsx': '📜', '.tsx': '📜',
  '.py': '🐍', '.rb': '💎', '.go': '🔵', '.rs': '🦀',
  '.json': '📋', '.xml': '📋', '.yml': '📋', '.yaml': '📋',
  '.css': '🎨', '.scss': '🎨', '.less': '🎨',
  '.html': '🌐', '.htm': '🌐', '.php': '🐘',
  '.sh': '💻', '.bash': '💻', '.zsh': '💻',
  '.md': '📝', '.txt': '📄',
  '.conf': '⚙', '.cfg': '⚙', '.ini': '⚙',
  '.log': '📋',
};

function getIcon(entry) {
  if (entry.type === 'directory') return entry.isSymlink ? '📂🔗' : '📁';
  const ext = entry.name?.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
  return ICON_MAP[ext] || '📄';
}

function getColor(entry) {
  if (entry.type === 'directory') return 'var(--accent-cyan)';
  const ext = entry.name?.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
  if (['.jpg','.jpeg','.png','.gif','.svg','.webp','.bmp','.ico'].includes(ext)) return 'var(--accent-magenta)';
  if (['.zip','.tar','.gz','.rar','.7z'].includes(ext)) return 'var(--accent-gold)';
  if (['.js','.ts','.jsx','.tsx','.py','.go','.rs','.rb'].includes(ext)) return 'var(--accent-green)';
  if (['.html','.htm','.php'].includes(ext)) return 'var(--accent-blue)';
  if (['.sh','.bash','.zsh'].includes(ext)) return 'var(--accent-magenta)';
  return 'var(--text-secondary)';
}

async function fmNavigate(path) {
  if (!path || path === fmState.currentPath) return;
  fmState.searchQuery = '';
  fmState.currentPath = path;
  if (fmState.history[fmState.historyIndex] !== path) {
    fmState.history = fmState.history.slice(0, fmState.historyIndex + 1);
    fmState.history.push(path);
    fmState.historyIndex = fmState.history.length - 1;
  }
  await fmLoadDirectory();
}

async function fmLoadDirectory() {
  const entries = document.getElementById('fmEntries');
  const empty = document.getElementById('fmEmpty');
  const loading = document.getElementById('fmLoading');

  loading.style.display = 'flex';
  entries.style.display = 'none';
  empty.style.display = 'none';
  fmState.selected.clear();

  try {
    const result = await API.file.list(fmState.currentPath);
    fmState.currentPath = result.currentPath;
    fmState.entries = result.entries;
    document.getElementById('fmPathInput').value = result.currentPath;
    fmRenderEntries();
    fmUpdateStatus();
    fmUpdateSidebar(result.currentPath);
  } catch (err) {
    fmShowToast(err.message || 'Failed to load directory', 'error');
    entries.innerHTML = '';
  }
  loading.style.display = 'none';
}

function fmRenderEntries() {
  const container = document.getElementById('fmEntries');
  const empty = document.getElementById('fmEmpty');
  const entries = fmState.searchQuery
    ? fmState.entries.filter(e => e.name.toLowerCase().includes(fmState.searchQuery.toLowerCase()))
    : fmState.entries;
  const filtered = fmState.showHidden ? entries : entries.filter(e => !e.isHidden);

  if (filtered.length === 0) {
    container.style.display = 'none';
    empty.style.display = 'flex';
    return;
  }
  container.style.display = 'grid';
  empty.style.display = 'none';

  container.innerHTML = filtered.map(e => {
    const icon = getIcon(e);
    const color = getColor(e);
    const selected = fmState.selected.has(e.path);
    const safeName = escapeHtml(e.name);
    const safePath = escapeHtml(e.path);
    const safeSize = escapeHtml(e.type === 'directory' ? '—' : e.sizeFormatted);
    const safeDate = escapeHtml(e.modifiedFormatted);
    const safePerms = escapeHtml(e.permissions);
    return `<div class="fm-entry${selected ? ' selected' : ''}${e.isHidden ? ' hidden' : ''}" data-path="${safePath}" data-name="${safeName}" data-type="${e.type}">
      <span class="fm-entry-icon" style="color:${color}">${icon}</span>
      <div class="fm-entry-info">
        <div class="fm-entry-name" title="${safeName}${e.isSymlink ? ' (symlink)' : ''}">${safeName}</div>
        <div class="fm-entry-meta">
          <span class="fm-entry-size">${safeSize}</span>
          <span class="fm-entry-date">${safeDate}</span>
          <span class="fm-entry-perms">${safePerms}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  if (!container._fmDelegation) {
    container._fmDelegation = true;
    container.addEventListener('click', (ev) => {
      const el = ev.target.closest('.fm-entry');
      if (el) fmEntryClick(ev, el);
    });
    container.addEventListener('dblclick', (ev) => {
      const el = ev.target.closest('.fm-entry');
      if (el) fmEntryOpen(el);
    });
    container.addEventListener('contextmenu', (ev) => {
      const el = ev.target.closest('.fm-entry');
      if (el) {
        ev.preventDefault();
        fmShowContextMenu(ev, el.dataset.path, el.dataset.name);
      }
    });
  }
}

function fmEntryClick(ev, el) {
  const path = el.dataset.path;
  if (ev.ctrlKey || ev.metaKey) {
    if (fmState.selected.has(path)) fmState.selected.delete(path);
    else fmState.selected.add(path);
    el.classList.toggle('selected');
    fmUpdateStatus();
    return;
  }
  if (ev.shiftKey && fmState._lastClicked) {
    const all = [...document.querySelectorAll('.fm-entry')];
    const start = all.indexOf(all.find(e => e.dataset.path === fmState._lastClicked));
    const end = all.indexOf(el);
    const [from, to] = start < end ? [start, end] : [end, start];
    for (let i = from; i <= to; i++) {
      fmState.selected.add(all[i].dataset.path);
      all[i].classList.add('selected');
    }
    fmUpdateStatus();
    return;
  }
  if (!fmState.selected.has(path)) {
    fmState.selected.clear();
    document.querySelectorAll('.fm-entry.selected').forEach(e => e.classList.remove('selected'));
    fmState.selected.add(path);
    el.classList.add('selected');
  }
  fmState._lastClicked = path;
  fmUpdateStatus();
}

function fmEntryOpen(el) {
  const path = el.dataset.path;
  const type = el.dataset.type;
  if (type === 'directory') {
    fmNavigate(path);
  } else {
    const ext = path.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
    const imageExts = ['.jpg','.jpeg','.png','.gif','.svg','.webp','.bmp','.ico'];
    if (imageExts.includes(ext)) fmPreviewImage(path, el.dataset.name);
    else if (ext === '.pdf') fmPreviewPdf(path, el.dataset.name);
    else fmOpenEditor(path);
  }
}

function fmUpdateStatus() {
  const count = fmState.selected.size;
  const total = fmState.entries.length;
  const hidden = fmState.entries.filter(e => e.isHidden).length;
  const parts = [`${total} items`];
  if (fmState.showHidden && hidden > 0) parts.push(`${hidden} hidden`);
  if (count > 0) parts.push(`${count} selected`);
  document.getElementById('fmStatusText').textContent = parts.join(' · ');

  if (count > 1) {
    document.getElementById('fmBatchActions').style.display = '';
  } else {
    document.getElementById('fmBatchActions').style.display = 'none';
  }
}

function fmUpdateSidebar(path) {
  document.querySelectorAll('.fm-sidebar-item').forEach(el => {
    el.classList.toggle('active', el.dataset.path === path);
  });
  fmUpdateTreeActive(path);
}

/* ─── Directory Tree ─── */
let fmTreeLoaded = false;

function fmToggleTree() {
  const container = document.getElementById('fmTreeContainer');
  const header = document.getElementById('fmTreeToggle');
  header.classList.toggle('open');
  container.classList.toggle('open');
  if (!fmTreeLoaded && container.classList.contains('open')) {
    fmTreeLoaded = true;
    fmLoadTreeChildren('/', container);
  }
}

async function fmLoadTreeChildren(dirPath, parentEl) {
  try {
    const result = await API.file.list(dirPath);
    const entries = result.entries.filter(e => e.type === 'directory').sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const childPath = (dirPath === '/' ? '/' : dirPath + '/') + entry.name;
      const item = document.createElement('div');
      item.className = 'fm-tree-item';
      item.dataset.path = childPath;

      const arrow = document.createElement('span');
      arrow.className = 'fm-tree-arrow placeholder';
      arrow.textContent = '▸';
      item.appendChild(arrow);

      const icon = document.createElement('span');
      icon.className = 'fm-tree-icon';
      icon.textContent = '📁';
      item.appendChild(icon);

      const label = document.createElement('span');
      label.className = 'fm-tree-label';
      label.textContent = entry.name;
      item.appendChild(label);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        fmNavigate(childPath);
      });

      parentEl.appendChild(item);
    }

    /* lazy-load child on first expand */
    parentEl.querySelectorAll('.fm-tree-item').forEach(item => {
      const arrow = item.querySelector('.fm-tree-arrow');
      if (!arrow) return;
      arrow.className = 'fm-tree-arrow';
      arrow.addEventListener('click', (e) => {
        e.stopPropagation();
        fmTreeToggleItem(item);
      });
    });

    fmUpdateTreeActive(fmState.currentPath);
  } catch (e) { console.warn('fmLoadTreeChildren:', e); }
}

function fmTreeToggleItem(item) {
  const children = item.dataset.childrenId;
  let childContainer;

  if (children) {
    childContainer = document.getElementById(children);
    childContainer.classList.toggle('open');
    item.querySelector('.fm-tree-arrow').classList.toggle('expanded');
    return;
  }

  const path = item.dataset.path;
  if (!path) return;

  const id = 'fmTreeChildren_' + path.replace(/[^a-zA-Z0-9]/g, '_');
  const arrow = item.querySelector('.fm-tree-arrow');

  if (document.getElementById(id)) {
    childContainer = document.getElementById(id);
    childContainer.classList.toggle('open');
    arrow.classList.toggle('expanded');
    return;
  }

  childContainer = document.createElement('div');
  childContainer.className = 'fm-tree-children';
  childContainer.id = id;
  item.dataset.childrenId = id;
  item.parentNode.insertBefore(childContainer, item.nextSibling);

  arrow.classList.add('expanded');
  childContainer.classList.add('open');

  /* lazy-load */
  fmLoadTreeChildren(path, childContainer);
}

function fmUpdateTreeActive(path) {
  document.querySelectorAll('.fm-tree-item').forEach(el => {
    el.classList.toggle('active', el.dataset.path === path);
  });

  /* expand ancestors */
  const parts = path.split('/').filter(Boolean);
  let acc = '';
  for (const p of parts) {
    acc += '/' + p;
    document.querySelectorAll('.fm-tree-item').forEach(el => {
      if (el.dataset.path === acc) {
        const arrow = el.querySelector('.fm-tree-arrow');
        if (arrow && !arrow.classList.contains('placeholder')) {
          arrow.classList.add('expanded');
          const cid = el.dataset.childrenId;
          if (cid) {
            const cc = document.getElementById(cid);
            if (cc) cc.classList.add('open');
          }
        }
      }
    });
  }
}

function fmShowToast(msg, type) {
  const toast = document.getElementById('fmToast');
  const icon = document.getElementById('fmToastIcon');
  const text = document.getElementById('fmToastMsg');
  toast.className = 'fm-toast';
  icon.textContent = type === 'success' ? '✅' : type === 'error' ? '❌' : '';
  text.textContent = msg;
  if (type) toast.classList.add(type);
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ─── Modal System ─── */
function openFmModal(title, bodyHtml) {
  document.getElementById('fmModalTitle').textContent = title;
  document.getElementById('fmModalBody').innerHTML = bodyHtml;
  document.getElementById('fmModalOverlay').style.display = 'flex';
}

function fmShowCopyTo(path, name) {
  const parentDir = path.substring(0, path.lastIndexOf('/')) || '/';
  openFmModal('📋 Copy to...', `
    <div class="fm-form-group">
      <label class="fm-form-label">Destination</label>
      <input class="fm-form-input" id="fmCopyDest" value="${escapeAttr(parentDir)}" placeholder="/new/path">
    </div>
    <div class="fm-form-actions">
      <button class="fm-btn fm-btn-cancel">Cancel</button>
      <button class="fm-btn fm-btn-primary" id="fmCopySubmit">Copy</button>
    </div>
  `);
  document.getElementById('fmCopySubmit').addEventListener('click', async () => {
    const dest = document.getElementById('fmCopyDest').value.trim();
    if (!dest) return;
    try {
      const conflicts = await API.file.checkConflicts({ sources: [path], dest });
      if (conflicts.hasConflicts) {
        fmShowConflictModal(conflicts.conflicts, 1, 'copy', async (strategy) => {
          try {
            await API.file.copyto({ source: path, destination: dest, strategy });
            closeFmModal();
            await fmLoadDirectory();
            fmRefreshBin();
            fmShowToast('Copied successfully', 'success');
          } catch (e) { fmShowToast(e.message, 'error'); }
        });
      } else {
        await API.file.copyto({ source: path, destination: dest, overwrite: false });
        closeFmModal();
        await fmLoadDirectory();
        fmShowToast('Copied successfully', 'success');
      }
    } catch (e) { fmShowToast(e.message, 'error'); closeFmModal(); }
  });
}

function fmShowMoveTo(path, name) {
  const parentDir = path.substring(0, path.lastIndexOf('/')) || '/';
  openFmModal('✂️ Move to...', `
    <div class="fm-form-group">
      <label class="fm-form-label">Destination</label>
      <input class="fm-form-input" id="fmMoveDest" value="${escapeAttr(parentDir)}" placeholder="/new/path">
    </div>
    <div class="fm-form-actions">
      <button class="fm-btn fm-btn-cancel">Cancel</button>
      <button class="fm-btn fm-btn-primary" id="fmMoveSubmit">Move</button>
    </div>
  `);
  document.getElementById('fmMoveSubmit').addEventListener('click', async () => {
    const dest = document.getElementById('fmMoveDest').value.trim();
    if (!dest) return;
    try {
      const conflicts = await API.file.checkConflicts({ sources: [path], dest });
      if (conflicts.hasConflicts) {
        fmShowConflictModal(conflicts.conflicts, 1, 'move', async (strategy) => {
          try {
            await API.file.moveto({ source: path, destination: dest, strategy });
            closeFmModal();
            await fmLoadDirectory();
            fmRefreshBin();
            fmShowToast('Moved successfully', 'success');
          } catch (e) { fmShowToast(e.message, 'error'); }
        });
      } else {
        await API.file.moveto({ source: path, destination: dest, overwrite: false });
        closeFmModal();
        await fmLoadDirectory();
        fmShowToast('Moved successfully', 'success');
      }
    } catch (e) { fmShowToast(e.message, 'error'); closeFmModal(); }
  });
}

function closeFmModal(ev) {
  if (ev && ev.target !== document.getElementById('fmModalOverlay') && ev.target !== document.querySelector('.fm-modal-close')) {
    if (ev.target.closest('.fm-modal')) return;
  }
  document.getElementById('fmModalOverlay').style.display = 'none';
}

/* ─── Create Modal ─── */
function fmShowCreate() {
  openFmModal('✨ Create New', `
    <div class="fm-form-group">
      <label class="fm-form-label">Name</label>
      <input class="fm-form-input" id="fmCreateName" placeholder="file.txt or folder name" autofocus>
      <div class="fm-form-error" id="fmCreateError"></div>
    </div>
    <div class="fm-form-group">
      <label class="fm-form-label">Type</label>
      <select class="fm-form-select" id="fmCreateType">
        <option value="file">File</option>
        <option value="directory">Folder</option>
      </select>
    </div>
    <div class="fm-form-group" id="fmCreateContentGroup">
      <label class="fm-form-label">Content (optional)</label>
      <textarea class="fm-form-textarea" id="fmCreateContent" placeholder="File content..."></textarea>
    </div>
    <div class="fm-form-actions">
      <button class="fm-btn fm-btn-cancel">Cancel</button>
      <button class="fm-btn fm-btn-primary" id="fmCreateSubmit">Create</button>
    </div>
  `);
  document.getElementById('fmCreateType').addEventListener('change', () => {
    document.getElementById('fmCreateContentGroup').style.display =
      document.getElementById('fmCreateType').value === 'file' ? 'block' : 'none';
  });
  document.getElementById('fmCreateSubmit').addEventListener('click', async () => {
    const name = document.getElementById('fmCreateName').value.trim();
    const type = document.getElementById('fmCreateType').value;
    const content = document.getElementById('fmCreateContent').value;
    const err = document.getElementById('fmCreateError');
    if (!name) { err.textContent = 'Name is required'; err.style.display = 'block'; return; }
    if (name.includes('/') || name.includes('\0')) { err.textContent = 'Invalid name'; err.style.display = 'block'; return; }
    err.style.display = 'none';
    try {
      await API.file.create({ parentPath: fmState.currentPath, name, type, content });
      closeFmModal();
      await fmLoadDirectory();
    } catch (e) {
      err.textContent = e.message; err.style.display = 'block';
    }
  });
  document.getElementById('fmCreateName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('fmCreateSubmit').click();
    if (e.key === 'Escape') closeFmModal();
  });
}

/* ─── Rename Modal ─── */
async function fmShowRename(path, currentName) {
  openFmModal('✏ Rename', `
    <div class="fm-form-group">
      <label class="fm-form-label">New name</label>
      <input class="fm-form-input" id="fmRenameInput" value="${escapeAttr(currentName)}" autofocus>
      <div class="fm-form-error" id="fmRenameError"></div>
    </div>
    <div class="fm-form-actions">
      <button class="fm-btn fm-btn-cancel">Cancel</button>
      <button class="fm-btn fm-btn-primary" id="fmRenameSubmit">Rename</button>
    </div>
  `);
  document.getElementById('fmRenameSubmit').addEventListener('click', async () => {
    const newName = document.getElementById('fmRenameInput').value.trim();
    const err = document.getElementById('fmRenameError');
    if (!newName) { err.textContent = 'Name is required'; err.style.display = 'block'; return; }
    err.style.display = 'none';
    try {
      await API.file.rename({ path, newName });
      closeFmModal();
      await fmLoadDirectory();
    } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
  });
  document.getElementById('fmRenameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('fmRenameSubmit').click();
    if (e.key === 'Escape') closeFmModal();
  });
}

/* ─── Delete Confirmation ─── */
async function fmShowDelete(paths) {
  const names = paths.map(p => escapeHtml(p.split('/').pop())).join(', ');
  openFmModal('🗑 Move to Bin', `
    <p style="color:var(--text-secondary);margin-bottom:16px;">Move <strong style="color:var(--accent-gold)">${names}</strong> to bin?</p>
    <div class="fm-form-actions">
      <button class="fm-btn fm-btn-cancel">Cancel</button>
      <button class="fm-btn fm-btn-primary" id="fmDeleteSubmit">Move to Bin</button>
    </div>
  `);
  document.getElementById('fmDeleteSubmit').addEventListener('click', async () => {
    try {
      for (const p of paths) await API.file.del({ path: p });
      closeFmModal();
      await fmLoadDirectory();
      fmRefreshBin();
      fmShowToast('Moved to bin', 'success');
    } catch (e) { fmShowToast(e.message, 'error'); closeFmModal(); }
  });
}

/* ─── Permissions Modal ─── */
function parseMode(mode) {
  const oct = mode.toString().padStart(3, '0');
  return oct.split('').map(o => parseInt(o).toString(2).padStart(3, '0').split('').map(b => b === '1'));
}

function symbolicFromMode(mode) {
  const oct = mode.toString().padStart(3, '0');
  const perms = ['---','--x','-w-','-wx','r--','r-x','rw-','rwx'];
  return oct.split('').map(d => perms[parseInt(d)] || '---').join('');
}

async function fmShowPermissions(path) {
  let details;
  try { details = await API.file.details(path); } catch (e) { fmShowToast(e.message, 'error'); return; }
  const rawMode = details.mode || details.permissions || '755';
  const modeStr = rawMode.toString().replace(/[^0-7]/g, '').slice(-3).padStart(3, '0');
  const bits = parseMode(modeStr);

  const labels = ['Owner', 'Group', 'Others'];
  const permNames = ['Read', 'Write', 'eXecute'];
  const permLetters = ['R', 'W', 'X'];

  openFmModal('🔒 Permissions — ' + path.split('/').pop(), `
    <div class="fm-perm-grid">
      ${labels.map((label, i) => `
        <div class="fm-perm-column">
          <div class="fm-perm-col-label">${label}</div>
          ${permNames.map((perm, j) => `
            <label class="fm-perm-check">
              <input type="checkbox" class="fm-perm-cb" data-row="${i}" data-col="${j}" ${bits[i][j] ? 'checked' : ''}>
              <span class="fm-perm-box ${bits[i][j] ? 'checked' : ''}">${permLetters[j]}</span>
              <span class="fm-perm-name">${perm}</span>
            </label>
          `).join('')}
        </div>
      `).join('')}
    </div>
    <div class="fm-perm-octal-row">
      <div class="fm-perm-octal">
        <span class="fm-perm-octal-label">Mode:</span>
        <span class="fm-perm-value" id="fmPermOctal">${modeStr}</span>
      </div>
      <div class="fm-perm-sym">
        <span class="fm-perm-sym-value" id="fmPermSymbolic">${symbolicFromMode(modeStr)}</span>
      </div>
    </div>
    <div class="fm-form-actions">
      <button class="fm-btn fm-btn-cancel">Cancel</button>
      <button class="fm-btn fm-btn-primary" id="fmPermSubmit">Apply</button>
    </div>
  `);

  function updatePermDisplay() {
    const rows = [
      [0,0,0], [0,0,0], [0,0,0]
    ];
    document.querySelectorAll('.fm-perm-cb').forEach(cb => {
      const r = parseInt(cb.dataset.row);
      const c = parseInt(cb.dataset.col);
      rows[r][c] = cb.checked ? 1 : 0;
      const box = cb.closest('.fm-perm-check').querySelector('.fm-perm-box');
      if (box) box.classList.toggle('checked', cb.checked);
    });
    const oct = rows.map(row => parseInt(row.join(''), 2)).join('');
    const sym = symbolicFromMode(oct);
    document.getElementById('fmPermOctal').textContent = oct;
    document.getElementById('fmPermSymbolic').textContent = sym;
  }

  document.querySelectorAll('.fm-perm-cb').forEach(cb => {
    cb.addEventListener('change', updatePermDisplay);
  });

  document.getElementById('fmPermSubmit').addEventListener('click', async () => {
    const mode = document.getElementById('fmPermOctal').textContent;
    try {
      await API.file.permissions({ path, mode });
      closeFmModal();
      await fmLoadDirectory();
    } catch (e) { fmShowToast(e.message, 'error'); }
  });
}

/* ─── Details Modal ─── */
async function fmShowDetails(path) {
  let details;
  try { details = await API.file.details(path); } catch (e) { fmShowToast(e.message, 'error'); return; }
  const name = path.split('/').pop() || path;
  const lines = [
    { label: 'Name', value: name },
    { label: 'Path', value: path },
    { label: 'Type', value: details.type || (details.isDirectory ? 'Directory' : 'File') },
    { label: 'Size', value: formatSizeStr(details.size) },
    { label: 'Permissions', value: details.permissions || details.mode || '—' },
    { label: 'Owner', value: details.owner || '—' },
    { label: 'Group', value: details.group || '—' },
    { label: 'Modified', value: details.modified ? new Date(details.modified).toLocaleString() : (details.modifiedFormatted || '—') },
    { label: 'Created', value: details.birthtime ? new Date(details.birthtime).toLocaleString() : '—' },
    { label: 'Symlink', value: details.isSymlink ? 'Yes' : 'No' },
  ];
  openFmModal('ℹ️ ' + name, `
    <div class="fm-details-grid">
      ${lines.filter(l => l.value !== '—' || l.label === 'Name').map(l => `
        <div class="fm-details-row">
          <span class="fm-details-label">${escapeHtml(l.label)}</span>
          <span class="fm-details-value">${escapeHtml(l.value)}</span>
        </div>
      `).join('')}
    </div>
    <div class="fm-form-actions">
      <button class="fm-btn fm-btn-cancel">Close</button>
    </div>
  `);
}

/* ─── Archive Modal ─── */
async function fmShowArchive(paths) {
  const defaultName = paths.length === 1 ? paths[0].split('/').pop() + '.zip' : 'archive.zip';
  openFmModal('📦 Create Archive', `
    <div class="fm-form-group">
      <label class="fm-form-label">Archive name</label>
      <input class="fm-form-input" id="fmArchiveName" value="${escapeAttr(defaultName)}" autofocus>
    </div>
    <div class="fm-form-group">
      <label class="fm-form-label">Format</label>
      <select class="fm-form-select" id="fmArchiveFormat">
        <option value="zip">ZIP</option>
        <option value="tar">TAR</option>
        <option value="gz">TAR.GZ</option>
      </select>
    </div>
    <div class="fm-form-actions">
      <button class="fm-btn fm-btn-cancel">Cancel</button>
      <button class="fm-btn fm-btn-primary" id="fmArchiveSubmit">Archive</button>
    </div>
  `);
  document.getElementById('fmArchiveSubmit').addEventListener('click', async () => {
    const name = document.getElementById('fmArchiveName').value.trim();
    const format = document.getElementById('fmArchiveFormat').value;
    const dest = fmState.currentPath.replace(/\/?$/, '/') + name;
    try {
      await API.file.archive({ paths, destination: dest, format });
      closeFmModal();
      await fmLoadDirectory();
    } catch (e) { fmShowToast(e.message, 'error'); closeFmModal(); }
  });
}

/* ─── Extract Modal ─── */
async function fmShowExtract(path) {
  const defaultDest = fmState.currentPath;
  openFmModal('🗜 Extract Archive', `
    <div class="fm-form-group">
      <label class="fm-form-label">Extract to</label>
      <input class="fm-form-input" id="fmExtractDest" value="${escapeAttr(defaultDest)}" autofocus>
    </div>
    <div class="fm-form-actions">
      <button class="fm-btn fm-btn-cancel">Cancel</button>
      <button class="fm-btn fm-btn-primary" id="fmExtractSubmit">Extract</button>
    </div>
  `);
  document.getElementById('fmExtractSubmit').addEventListener('click', async () => {
    const dest = document.getElementById('fmExtractDest').value.trim();
    if (!dest) return;
    try {
      const conflicts = await API.file.checkExtractConflicts({ archive: path, dest });
      if (conflicts.hasConflicts) {
        fmShowConflictModal(conflicts.conflicts, conflicts.entryCount, 'extract', async (strategy) => {
          try {
            await API.file.extract({ archive: path, destination: dest, strategy });
            closeFmModal();
            await fmLoadDirectory();
            fmRefreshBin();
            fmShowToast('Archive extracted successfully', 'success');
          } catch (e) { fmShowToast(e.message, 'error'); }
        });
      } else {
        await API.file.extract({ archive: path, destination: dest });
        closeFmModal();
        await fmLoadDirectory();
        fmShowToast('Archive extracted successfully', 'success');
      }
    } catch (e) { fmShowToast(e.message, 'error'); closeFmModal(); }
  });
}

/* ─── Code Editor (Ace) ─── */
let fmAceEditor = null;
let fmAceWrap = false;

const LANGUAGE_MAP = {
  js:'javascript', ts:'typescript', jsx:'javascript', tsx:'typescript',
  mjs:'javascript', cjs:'javascript', es:'javascript',  esm:'javascript',
  py:'python', rb:'ruby', php:'php', go:'go', rs:'rust',
  java:'java', kt:'kotlin', scala:'scala',
  c:'c_cpp', h:'c_cpp', cpp:'c_cpp', hpp:'c_cpp', cc:'c_cpp', cxx:'c_cpp',
  cs:'csharp', swift:'swift',
  html:'html', htm:'html', xhtml:'html',
  css:'css', scss:'scss', less:'less', sass:'scss', styl:'stylus',
  json:'json', xml:'xml', xsl:'xml', xsd:'xml', rng:'xml',
  yml:'yaml', yaml:'yaml',
  md:'markdown', mdx:'markdown',
  sql:'sql', mysql:'sql', pgsql:'sql',
  sh:'sh', bash:'sh', zsh:'sh', fish:'sh',
  conf:'nginx', nginx_conf:'nginx',
  dockerfile:'dockerfile', Dockerfile:'dockerfile',
  env:'properties', env_example:'properties', ini:'ini', cfg:'ini',
  toml:'toml', Makefile:'makefile', mk:'makefile',
  vue:'html', svelte:'html', astro:'html',
  svg:'xml', pl:'perl', pm:'perl', lua:'lua', r:'r', R:'r',
  gitignore:'text', gitkeep:'text', gitattributes:'text',
  log:'text', txt:'text', diff:'diff', patch:'diff',
  graphql:'graphqlschema', gql:'graphqlschema',
  tf:'hcl', hcl:'hcl', vagrantfile:'ruby',
  cmake:'cmake', gradle:'groovy', groovy:'groovy',
  dart:'dart', pas:'pascal', pp:'pascal',
  erl:'erlang', hrl:'erlang', ex:'elixir', exs:'elixir',
  hs:'haskell', lhs:'haskell',
  clj:'clojure', cljs:'clojure', edn:'clojure',
  ps1:'powershell', psd1:'powershell', psm1:'powershell',
  jl:'julia', cr:'crystal',
};

function detectLang(filename) {
  const name = filename.split('/').pop() || filename;
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : name;
  const base = name.split('.').shift();
  if (name === 'Dockerfile' || name === 'dockerfile') return 'dockerfile';
  if (name === 'Makefile' || name === 'makefile') return 'makefile';
  if (name === '.env' || name.startsWith('.env.')) return 'properties';
  if (name === '.gitignore' || name === '.gitkeep') return 'text';
  return LANGUAGE_MAP[ext] || LANGUAGE_MAP[name] || 'text';
}

function initAceEditor(container, content, lang) {
  if (typeof ace === 'undefined') {
    container.innerHTML = `<textarea id="fmEditorTextarea" spellcheck="false" style="width:100%;height:100%;padding:16px 20px;background:#0d1117;border:none;color:#e6edf3;font-family:'JetBrains Mono',monospace;font-size:13px;line-height:1.6;resize:none;outline:none;tab-size:2;"></textarea>`;
    document.getElementById('fmEditorTextarea').value = content;
    return null;
  }
  const editor = ace.edit(container);
  editor.setTheme('ace/theme/monokai');
  editor.session.setMode('ace/mode/' + lang);
  editor.setValue(content, -1);
  editor.setOptions({
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
    showPrintMargin: false,
    showGutter: true,
    highlightActiveLine: true,
    enableBasicAutocompletion: true,
    enableLiveAutocompletion: true,
    tabSize: 2,
    useSoftTabs: true,
    wrap: false,
    indentedSoftWrap: false,
  });
  editor.session.setOption('useWorker', false);
  editor.focus();
  editor.session.getSelection().clearSelection();

  editor.commands.addCommand({
    name: 'save',
    bindKey: { win: 'Ctrl-S', mac: 'Cmd-S' },
    exec: () => document.getElementById('fmEditorSave').click(),
  });
  editor.commands.addCommand({
    name: 'close',
    bindKey: { win: 'Ctrl-W', mac: 'Cmd-W' },
    exec: () => document.getElementById('fmEditorClose').click(),
  });

  editor.session.selection.on('changeCursor', () => {
    const pos = editor.getCursorPosition();
    const lc = `Ln ${pos.row + 1}, Col ${pos.column + 1}`;
    const sel = editor.getSelectedText();
    const selInfo = sel ? ` (${sel.split('\n').length} lines)` : '';
    document.getElementById('fmEditorStatus').textContent = lc + selInfo;
  });

  return editor;
}

function getEditorContent() {
  if (fmAceEditor) return fmAceEditor.getValue();
  const ta = document.getElementById('fmEditorTextarea');
  return ta ? ta.value : '';
}

function destroyEditor() {
  if (fmAceEditor) {
    fmAceEditor.destroy();
    fmAceEditor = null;
  }
  const container = document.getElementById('fmEditorContainer');
  if (container) container.innerHTML = '';
}

async function fmOpenEditor(filePath) {
  try {
    destroyEditor();
    const result = await API.file.read(filePath);
    const name = filePath.split('/').pop();
    document.getElementById('fmEditorOverlay').style.display = 'flex';
    document.getElementById('fmEditorFilename').textContent = name;
    document.getElementById('fmEditorPath').textContent = filePath;
    document.getElementById('fmEditorStatus').textContent = '';
    fmState.editorPath = filePath;
    fmState.editorOriginalContent = result.content;

    const lang = detectLang(name);
    const langBadge = document.getElementById('fmEditorLang');
    langBadge.textContent = lang;
    langBadge.className = 'fm-editor-lang lang-' + lang.replace(/[^a-z0-9]/g, '-');

    const container = document.getElementById('fmEditorContainer');
    fmAceEditor = initAceEditor(container, result.content, lang);

    const wrapBtn = document.getElementById('fmEditorWrap');
    wrapBtn.textContent = fmAceWrap ? '↩ Wrap: ON' : '↩ Wrap';
    if (fmAceEditor) fmAceEditor.session.setOption('wrap', fmAceWrap);
  } catch (e) {
    fmShowToast(e.message, 'error');
  }
}

document.getElementById('fmEditorSave').addEventListener('click', async () => {
  const content = getEditorContent();
  const path = fmState.editorPath;
  if (!path) return;
  const status = document.getElementById('fmEditorStatus');
  status.textContent = 'Saving...';
  try {
    const parent = path.substring(0, path.lastIndexOf('/'));
    const name = path.split('/').pop();
    await API.file.create({ parentPath: parent, name, type: 'file', content });
    fmState.editorOriginalContent = content;
    status.textContent = '✅ Saved';
    setTimeout(() => { if (fmAceEditor) fmAceEditor.focus(); }, 100);
  } catch (e) {
    status.textContent = '❌ ' + e.message;
  }
});

document.getElementById('fmEditorWrap').addEventListener('click', () => {
  fmAceWrap = !fmAceWrap;
  const btn = document.getElementById('fmEditorWrap');
  btn.textContent = fmAceWrap ? '↩ Wrap: ON' : '↩ Wrap';
  if (fmAceEditor) fmAceEditor.session.setOption('wrap', fmAceWrap);
});

document.getElementById('fmEditorFullscreen').addEventListener('click', () => {
  const editor = document.getElementById('fmEditor');
  const overlay = document.getElementById('fmEditorOverlay');
  const btn = document.getElementById('fmEditorFullscreen');
  const isFs = editor.classList.toggle('fullscreen');
  overlay.classList.toggle('fullscreen', isFs);
  btn.classList.toggle('active', isFs);
  btn.textContent = isFs ? '⛶' : '✕';
  if (fmAceEditor) setTimeout(() => fmAceEditor.resize(), 100);
});

document.getElementById('fmEditorClose').addEventListener('click', () => {
  fmCloseEditor();
});

function fmCloseEditor() {
  const content = getEditorContent();
  if (fmState.editorOriginalContent !== null && content !== fmState.editorOriginalContent) {
    if (!confirm('You have unsaved changes. Close without saving?')) return;
  }
  document.getElementById('fmEditorOverlay').style.display = 'none';
  destroyEditor();
  fmState.editorPath = null;
  fmState.editorOriginalContent = null;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (document.getElementById('fmEditorOverlay').style.display === 'flex') {
      fmCloseEditor();
      return;
    }
    if (document.getElementById('fmModalOverlay').style.display === 'flex') closeFmModal();
    if (document.getElementById('fmPreviewOverlay').style.display === 'flex') closeFmPreview();
    if (document.getElementById('fmContextMenu').style.display !== 'none') {
      document.getElementById('fmContextMenu').style.display = 'none';
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's' && document.getElementById('fmEditorOverlay').style.display === 'flex') {
    e.preventDefault();
    document.getElementById('fmEditorSave').click();
  }
});

/* ─── Preview ─── */
function fmPreviewImage(path, name) {
  document.getElementById('fmPreviewOverlay').style.display = 'flex';
  document.getElementById('fmPreviewName').textContent = name;
  document.getElementById('fmPreviewBody').innerHTML = `<img src="${API.getDownloadUrl(path)}" alt="${escapeAttr(name)}">`;
}

function fmPreviewPdf(path, name) {
  document.getElementById('fmPreviewOverlay').style.display = 'flex';
  document.getElementById('fmPreviewName').textContent = name;
  document.getElementById('fmPreviewBody').innerHTML = `<iframe src="${API.getDownloadUrl(path)}"></iframe>`;
}

function closeFmPreview(ev) {
  if (ev && ev.target !== document.getElementById('fmPreviewOverlay') && ev.target !== document.getElementById('fmPreviewClose')) {
    if (ev.target.closest('.fm-preview')) return;
  }
  document.getElementById('fmPreviewOverlay').style.display = 'none';
  document.getElementById('fmPreviewBody').innerHTML = '';
}

/* ─── Context Menu ─── */
function fmShowContextMenu(ev, path, name) {
  fmState.contextPath = path;
  fmState.contextName = name;
  const menu = document.getElementById('fmContextMenu');
  menu.style.display = 'block';

  // Estimate menu height based on visible items
  const visibleItems = [...menu.querySelectorAll('.fm-context-item')].filter(i => i.style.display !== 'none');
  const menuHeight = visibleItems.length * 36 + 8;
  const spaceBelow = window.innerHeight - ev.clientY;
  const spaceAbove = ev.clientY;

  if (window.innerWidth > 768) {
    menu.style.left = Math.min(ev.clientX, window.innerWidth - 220) + 'px';
    if (spaceBelow < menuHeight && spaceAbove > menuHeight) {
      menu.style.top = (ev.clientY - menuHeight) + 'px';
    } else {
      menu.style.top = Math.min(ev.clientY, window.innerHeight - menuHeight) + 'px';
    }
  }

  const isSpace = !path;
  const type = path ? (document.querySelector(`.fm-entry[data-path="${CSS.escape(path)}"]`)?.dataset.type || 'file') : 'file';
  const hasClipboard = fmState.clipboard && fmState.clipboard.paths.length > 0;
  menu.querySelectorAll('.fm-context-item').forEach(item => {
    const action = item.dataset.action;
    item.style.display = '';
    if (isSpace) {
      // Empty space: hide file-specific actions, show empty-space actions
      const spaceActions = ['create-file','create-folder','dir-permissions','details'];
      if (!spaceActions.includes(action)) { item.style.display = 'none'; }
    } else {
      // File/dir: hide empty-space actions
      const spaceActions = ['create-file','create-folder','dir-permissions','details'];
      if (spaceActions.includes(action)) { item.style.display = 'none'; }
      if (action === 'extract') {
        const ext = (name || '').toLowerCase();
        item.style.display = (ext.endsWith('.zip') || ext.endsWith('.tar') || ext.endsWith('.gz') || ext.endsWith('.tgz')) ? '' : 'none';
      }
      if (action === 'download') {
        item.style.display = type === 'directory' ? 'none' : '';
      }
    }
    if (action === 'clipboard-paste') {
      item.style.display = hasClipboard ? '' : 'none';
    }
  });
  const divider = document.getElementById('fmCtxDividerEmpty');
  if (divider) divider.style.display = isSpace ? 'none' : '';
}

document.querySelectorAll('.fm-context-item').forEach(item => {
  item.addEventListener('click', async () => {
    const menu = document.getElementById('fmContextMenu');
    menu.style.display = 'none';
    const path = fmState.contextPath;
    const name = fmState.contextName || '';
    const action = item.dataset.action;

    switch (action) {
      case 'open':
        const el = document.querySelector(`.fm-entry[data-path="${CSS.escape(path)}"]`);
        if (el) fmEntryOpen(el);
        break;
      case 'download':
        window.open(API.getDownloadUrl(path), '_blank');
        break;
      case 'rename':
        fmShowRename(path, name);
        break;
      case 'duplicate':
        try { await API.file.duplicate({ path }); await fmLoadDirectory(); }
        catch (e) { fmShowToast(e.message, 'error'); }
        break;
      case 'copy':
        navigator.clipboard.writeText(path).then(() => fmShowToast('Path copied to clipboard', 'success'));
        break;
      case 'copyto':
        fmShowCopyTo(path, name);
        break;
      case 'moveto':
        fmShowMoveTo(path, name);
        break;
      case 'archive':
        fmShowArchive([path]);
        break;
      case 'extract':
        fmShowExtract(path);
        break;
      case 'permissions':
        fmShowPermissions(path);
        break;
      case 'delete':
        fmShowDelete([path]);
        break;
      case 'create-file':
        fmShowCreate();
        break;
      case 'create-folder':
        fmShowCreateFolder();
        break;
      case 'dir-permissions':
        fmShowPermissions(fmState.currentPath);
        break;
      case 'details':
        fmShowDetails(path || fmState.currentPath);
        break;
      case 'clipboard-copy':
        fmClipboardCopy([path]);
        break;
      case 'clipboard-cut':
        fmClipboardCut([path]);
        break;
      case 'clipboard-paste':
        fmClipboardPaste();
        break;
    }
  });
});

document.addEventListener('click', (e) => {
  const menu = document.getElementById('fmContextMenu');
  if (menu.style.display !== 'none' && !menu.contains(e.target)) {
    menu.style.display = 'none';
  }
  // Close search panel when clicking outside
  const searchWrap = document.querySelector('.fm-search-wrap');
  if (fmSearchOpen && searchWrap && !searchWrap.contains(e.target)) {
    fmSearchOpen = false;
    document.getElementById('fmSearchPanel').style.display = 'none';
    document.getElementById('fmSearchToggle').classList.remove('active');
  }
});

document.getElementById('fmMain').addEventListener('contextmenu', (e) => {
  if (e.target.closest('.fm-entry') || e.target.closest('.fm-sidebar')) return;
  e.preventDefault();
  fmShowContextMenu(e, null, null);
});

/* ─── Upload ─── */
async function fmUpload(files) {
  if (!files || files.length === 0) return;

  // Check for oversized files (500MB limit)
  const MAX_FILE_SIZE = 500 * 1024 * 1024;
  const oversizedFiles = Array.from(files).filter(file => file.size > MAX_FILE_SIZE);
  if (oversizedFiles.length > 0) {
    const oversizedMsg = oversizedFiles.map(file =>
      `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB - max 500MB)`
    ).join('\n');
    fmShowToast(`Files too large (max 500MB):\n${oversizedMsg}`, 'error');
    return;
  }

  const progressBar = document.getElementById('fmUploadProgress');
  const progressFill = document.getElementById('fmUploadProgressFill');
  const progressTitle = document.getElementById('fmUploadProgressTitle');
  const progressText = document.getElementById('fmUploadProgressText');
  const progressSize = document.getElementById('fmUploadProgressSize');
  const cancelBtn = document.getElementById('fmUploadCancel');

  const totalSize = Array.from(files).reduce((sum, f) => sum + f.size, 0);
  progressBar.style.display = 'block';
  progressFill.style.width = '0%';
  progressText.textContent = '0%';
  progressSize.textContent = `0 B / ${formatSizeStr(totalSize)}`;
  progressTitle.textContent = `Uploading ${files.length} file(s)...`;

  const form = new FormData();
  form.append('path', fmState.currentPath);
  for (const file of files) form.append('files', file);

  let aborted = false;
  const xhr = new XMLHttpRequest();
  cancelBtn.onclick = () => { aborted = true; xhr.abort(); };

  try {
    await new Promise((resolve, reject) => {
      xhr.open('POST', API.base + '/files/upload');
      xhr.withCredentials = true;

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          progressFill.style.width = pct + '%';
          progressText.textContent = pct + '%';
          progressSize.textContent = `${formatSizeStr(e.loaded)} / ${formatSizeStr(e.total)}`;
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
        else reject(new Error(JSON.parse(xhr.responseText || '{}').error || 'Upload failed'));
      });

      xhr.addEventListener('error', () => reject(new Error('Network error')));
      xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

      xhr.send(form);
    });

    if (!aborted) {
      fmShowToast(`Upload complete (${formatSizeStr(totalSize)})`, 'success');
      await fmLoadDirectory();
    }
  } catch (e) {
    if (!aborted) fmShowToast(e.message || 'Upload failed', 'error');
  }

  progressBar.style.display = 'none';
}

function formatSizeStr(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

document.getElementById('fmUploadBtn').addEventListener('click', () => {
  document.getElementById('fmFileInput').click();
});

document.getElementById('fmFileInput').addEventListener('change', (e) => {
  fmUpload(e.target.files);
  e.target.value = '';
});

/* ─── Drag & Drop ─── */
const fmMain = document.getElementById('fmMain');
fmMain.addEventListener('dragover', (e) => {
  e.preventDefault();
  fmMain.classList.add('drag-over');
});
fmMain.addEventListener('dragleave', () => {
  fmMain.classList.remove('drag-over');
});
fmMain.addEventListener('drop', (e) => {
  e.preventDefault();
  fmMain.classList.remove('drag-over');
  fmUpload(e.dataTransfer.files);
});

/* ─── Path Input ─── */
document.getElementById('fmPathInput').addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    const path = e.target.value.trim();
    if (!path) return;
    fmNavigate(path);
    document.getElementById('fmPathSuggestions').classList.remove('active');
  }
  if (e.key === 'Escape') {
    document.getElementById('fmPathSuggestions').classList.remove('active');
  }
});

let suggestTimer = null;
document.getElementById('fmPathInput').addEventListener('input', (e) => {
  clearTimeout(suggestTimer);
  const val = e.target.value;
  if (!val || val.length < 2) { document.getElementById('fmPathSuggestions').classList.remove('active'); return; }
  suggestTimer = setTimeout(async () => {
    try {
      const parent = val.substring(0, val.lastIndexOf('/')) || '/';
      const partial = val.split('/').pop();
      const result = await API.file.list(parent);
      const suggestions = result.entries
        .filter(e => e.type === 'directory' && e.name.startsWith(partial))
        .slice(0, 10)
        .map(e => (parent === '/' ? '/' : parent + '/') + e.name);
      const el = document.getElementById('fmPathSuggestions');
      if (suggestions.length > 0) {
        el.innerHTML = suggestions.map(s => `<div class="fm-path-suggestion">${escapeHtml(s)}</div>`).join('');
        el.classList.add('active');
        /* Delegated click on fmPathSuggestions handles navigation — see initFileManager */
      } else {
        el.classList.remove('active');
      }
    } catch (e) { console.warn('fmPathSearch:', e); }
  }, 300);
});

/* ─── Toolbar Buttons ─── */
document.getElementById('fmBackBtn').addEventListener('click', () => {
  if (fmState.historyIndex > 0) {
    fmState.historyIndex--;
    fmState.currentPath = fmState.history[fmState.historyIndex];
    fmLoadDirectory();
  }
});

document.getElementById('fmUpBtn').addEventListener('click', () => {
  if (fmState.currentPath === '/') return;
  const parent = fmState.currentPath.replace(/\/$/, '').split('/').slice(0, -1).join('/') || '/';
  fmNavigate(parent);
});

document.getElementById('fmRefreshBtn').addEventListener('click', fmLoadDirectory);

document.getElementById('fmHiddenToggle').addEventListener('click', () => {
  fmState.showHidden = !fmState.showHidden;
  localStorage.setItem('fmShowHidden', fmState.showHidden);
  document.getElementById('fmHiddenToggle').classList.toggle('active', fmState.showHidden);
  fmRenderEntries();
  fmUpdateStatus();
});

document.getElementById('fmCreateBtn').addEventListener('click', fmShowCreate);

/* ─── Batch Action Buttons ─── */
document.getElementById('fmBatchBtnCopy')?.addEventListener('click', () => {
  const sel = getSelectedPaths();
  if (sel.length) fmShowCopyToBatch(sel);
});
document.getElementById('fmBatchBtnMove')?.addEventListener('click', () => {
  const sel = getSelectedPaths();
  if (sel.length) fmShowMoveToBatch(sel);
});
document.getElementById('fmBatchBtnArchive')?.addEventListener('click', () => {
  const sel = getSelectedPaths();
  if (sel.length) fmShowArchive(sel);
});
document.getElementById('fmBatchBtnDelete')?.addEventListener('click', () => {
  const sel = getSelectedPaths();
  if (sel.length) fmShowDelete(sel);
});
document.getElementById('fmBatchBtnDiff')?.addEventListener('click', () => {
  const sel = getSelectedPaths();
  fmShowDiff(sel);
});
document.getElementById('fmBatchBtnRename')?.addEventListener('click', () => {
  const sel = getSelectedPaths();
  if (sel.length) fmShowBatchRename(sel);
});

/* ─── Search ─── */
let searchTimer = null;
let fmSearchOpen = false;

document.getElementById('fmSearchToggle').addEventListener('click', () => {
  fmSearchOpen = !fmSearchOpen;
  document.getElementById('fmSearchPanel').style.display = fmSearchOpen ? 'flex' : 'none';
  document.getElementById('fmSearchToggle').classList.toggle('active', fmSearchOpen);
  if (fmSearchOpen) document.getElementById('fmSearchInput').focus();
});

document.getElementById('fmSearchPanelClose').addEventListener('click', () => {
  fmSearchOpen = false;
  document.getElementById('fmSearchPanel').style.display = 'none';
  document.getElementById('fmSearchToggle').classList.remove('active');
});

function getGlobPatterns(input) {
  if (!input || !input.trim()) return [];
  return input.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function matchesPattern(name, patterns) {
  if (patterns.length === 0) return true;
  const lower = name.toLowerCase();
  return patterns.some(p => {
    if (p.startsWith('*.')) return lower.endsWith(p.slice(1));
    if (p.endsWith('*')) return lower.startsWith(p.slice(0, -1));
    return lower.includes(p);
  });
}

async function doGlobalSearch(query, path, include, exclude) {
  try {
    let url = '/files/search?query=' + encodeURIComponent(query) + '&path=' + encodeURIComponent(path);
    if (include.length > 0) url += '&include=' + encodeURIComponent(include.join(','));
    if (exclude.length > 0) url += '&exclude=' + encodeURIComponent(exclude.join(','));
    const res = await API.request('GET', url);
    return res.results || [];
  } catch (e) {
    fmShowToast('Search error: ' + e.message, 'error');
    return [];
  }
}

document.getElementById('fmSearchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(searchTimer);
    e.target.dispatchEvent(new Event('input'));
  }
});
document.getElementById('fmSearchGo').addEventListener('click', () => {
  const el = document.getElementById('fmSearchInput');
  clearTimeout(searchTimer);
  el.dispatchEvent(new Event('input'));
});
document.getElementById('fmSearchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const query = e.target.value;
  fmState.searchQuery = query;
  const scope = document.getElementById('fmSearchScope').value;
  searchTimer = setTimeout(async () => {
    const include = getGlobPatterns(document.getElementById('fmSearchInclude').value);
    const exclude = getGlobPatterns(document.getElementById('fmSearchExclude').value);

    if (!query) {
      fmRenderEntries();
      document.getElementById('fmSearchResults').innerHTML = '';
      document.getElementById('fmSearchStats').textContent = '';
      return;
    }

    if (scope === 'local') {
      fmRenderEntries();
      document.getElementById('fmSearchResults').innerHTML = '';
      const filtered = fmState.entries.filter(e => {
        const nameMatch = e.name.toLowerCase().includes(query.toLowerCase());
        const inclMatch = include.length === 0 || matchesPattern(e.name, include);
        const exclMatch = exclude.length === 0 || !matchesPattern(e.name, exclude);
        return nameMatch && inclMatch && exclMatch;
      });
      document.getElementById('fmSearchStats').textContent = filtered.length + ' matches in current folder';
    } else {
      const results = await doGlobalSearch(query, fmState.currentPath, include, exclude);
      const resultsEl = document.getElementById('fmSearchResults');
      if (results.length === 0) {
        resultsEl.innerHTML = '<div class="fm-search-empty">No matches found</div>';
      } else {
        resultsEl.innerHTML = results.slice(0, 100).map(r => `
          <div class="fm-search-result" data-path="${escapeAttr(r.path)}" data-type="${escapeAttr(r.type)}">
            <span class="fm-search-result-icon">${r.type === 'directory' ? '📁' : '📄'}</span>
            <span class="fm-search-result-name">${escapeHtml(r.name)}</span>
            <span class="fm-search-result-path">${escapeHtml(r.path)}</span>
          </div>
        `).join('');
        /* Delegated click on fmSearchResults handles navigation — see initFileManager */
      }
      document.getElementById('fmSearchStats').textContent = results.length + ' matches found';
    }
  }, scope === 'local' ? 200 : 400);
});

document.getElementById('fmSearchScope').addEventListener('change', () => {
  const el = document.getElementById('fmSearchInput');
  if (el.value) el.dispatchEvent(new Event('input'));
});

/* ─── Sidebar ─── */
document.querySelectorAll('.fm-sidebar-item').forEach(item => {
  item.addEventListener('click', () => fmNavigate(item.dataset.path));
});
document.getElementById('fmTreeToggle').addEventListener('click', fmToggleTree);

/* ─── Modal Close Listeners ── */
document.getElementById('fmModalOverlay').addEventListener('click', closeFmModal);
document.getElementById('fmModal').addEventListener('click', (e) => e.stopPropagation());
document.getElementById('fmModalClose').addEventListener('click', closeFmModal);
document.getElementById('fmModalBody').addEventListener('click', (e) => {
  if (e.target.classList.contains('fm-btn-cancel')) closeFmModal();
});

document.getElementById('fmPreviewOverlay').addEventListener('click', closeFmPreview);
document.getElementById('fmPreview').addEventListener('click', (e) => e.stopPropagation());
document.getElementById('fmPreviewClose').addEventListener('click', closeFmPreview);

/* ─── Init ─── */
async function initFileManager() {
  if (fmState.fmInitialized) {
    await fmLoadDirectory();
    return;
  }
  fmState.fmInitialized = true;
  document.getElementById('fmHiddenToggle').classList.toggle('active', fmState.showHidden);

  /* Delegated click on search results */
  document.getElementById('fmSearchResults').addEventListener('click', (e) => {
    const el = e.target.closest('.fm-search-result');
    if (!el) return;
    const path = el.dataset.path;
    const type = el.dataset.type;
    if (!path) return;
    fmSearchOpen = false;
    document.getElementById('fmSearchPanel').style.display = 'none';
    document.getElementById('fmSearchToggle').classList.remove('active');
    if (type === 'directory') {
      fmNavigate(path);
    } else {
      const parent = path.substring(0, path.lastIndexOf('/')) || '/';
      fmNavigate(parent);
      setTimeout(() => fmOpenEditor(path), 300);
    }
  });

  /* Delegated click on path suggestions */
  document.getElementById('fmPathSuggestions').addEventListener('click', (e) => {
    const el = e.target.closest('.fm-path-suggestion');
    if (!el) return;
    document.getElementById('fmPathInput').value = el.textContent;
    document.getElementById('fmPathSuggestions').classList.remove('active');
    document.getElementById('fmPathInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  });

  /* Bin toggle */
  document.getElementById('fmBinToggle').addEventListener('click', fmToggleBin);

  /* Bin actions (delegated) */
  document.getElementById('fmBinContainer').addEventListener('click', (e) => {
    const restoreBtn = e.target.closest('.fm-bin-restore');
    if (restoreBtn) {
      fmRestoreBinItem(restoreBtn.dataset.batch, restoreBtn.dataset.file);
      return;
    }
    const deleteBtn = e.target.closest('.fm-bin-delete');
    if (deleteBtn) {
      fmPermanentDeleteBinItem(deleteBtn.dataset.batch, deleteBtn.dataset.file);
      return;
    }
  });

  document.getElementById('fmBinEmptyBtn').addEventListener('click', () => {
    if (confirm('Empty entire bin? This cannot be undone.')) fmEmptyBin();
  });

  /* Conflict modal tab switching is handled inline in fmShowConflictModal */

  await fmLoadDirectory();
  fmLoadBin();
}

/* ── Batch Move To ── */
function fmShowMoveToBatch(paths) {
  openFmModal('✂️ Move ' + paths.length + ' items', `
    <div class="fm-form-group">
      <label class="fm-form-label">Move ${paths.length} items to:</label>
      <input class="fm-form-input" id="fmMoveDest" value="${escapeAttr(fmState.currentPath)}" placeholder="/destination">
    </div>
    <div class="fm-form-actions">
      <button class="fm-btn fm-btn-cancel">Cancel</button>
      <button class="fm-btn fm-btn-primary" id="fmMoveSubmit">Move All</button>
    </div>
  `);
  document.getElementById('fmMoveSubmit').addEventListener('click', async () => {
    const dest = document.getElementById('fmMoveDest').value.trim();
    if (!dest) return;
    try {
      const sources = paths.map(p => p);
      const conflicts = await API.file.checkConflicts({ sources, dest });
      if (conflicts.hasConflicts) {
        fmShowConflictModal(conflicts.conflicts, paths.length, 'move', async (strategy) => {
          try {
            for (const p of paths) {
              await API.file.moveto({ source: p, destination: dest, strategy });
            }
            closeFmModal(); await fmLoadDirectory(); fmRefreshBin();
            fmShowToast(`Moved ${paths.length} items`, 'success');
          } catch (e) { fmShowToast(e.message, 'error'); }
        });
      } else {
        for (const p of paths) {
          await API.file.moveto({ source: p, destination: dest, overwrite: false });
        }
        closeFmModal(); await fmLoadDirectory();
        fmShowToast(`Moved ${paths.length} items`, 'success');
      }
    } catch (e) { fmShowToast(e.message, 'error'); closeFmModal(); }
  });
}

/* ── Batch Copy To ── */
function fmShowCopyToBatch(paths) {
  openFmModal('📋 Copy ' + paths.length + ' items', `
    <div class="fm-form-group">
      <label class="fm-form-label">Copy ${paths.length} items to:</label>
      <input class="fm-form-input" id="fmCopyDest" value="${escapeAttr(fmState.currentPath)}" placeholder="/destination">
    </div>
    <div class="fm-form-actions">
      <button class="fm-btn fm-btn-cancel">Cancel</button>
      <button class="fm-btn fm-btn-primary" id="fmCopySubmit">Copy All</button>
    </div>
  `);
  document.getElementById('fmCopySubmit').addEventListener('click', async () => {
    const dest = document.getElementById('fmCopyDest').value.trim();
    if (!dest) return;
    try {
      const sources = paths.map(p => p);
      const conflicts = await API.file.checkConflicts({ sources, dest });
      if (conflicts.hasConflicts) {
        fmShowConflictModal(conflicts.conflicts, paths.length, 'copy', async (strategy) => {
          try {
            for (const p of paths) {
              await API.file.copyto({ source: p, destination: dest, strategy });
            }
            closeFmModal(); await fmLoadDirectory(); fmRefreshBin();
            fmShowToast(`Copied ${paths.length} items`, 'success');
          } catch (e) { fmShowToast(e.message, 'error'); }
        });
      } else {
        for (const p of paths) {
          await API.file.copyto({ source: p, destination: dest, overwrite: false });
        }
        closeFmModal(); await fmLoadDirectory();
        fmShowToast(`Copied ${paths.length} items`, 'success');
      }
    } catch (e) { fmShowToast(e.message, 'error'); closeFmModal(); }
  });
}

/* ── Conflict Resolution Modal ── */
function fmShowConflictModal(conflicts, totalCount, operation, callback) {
  const overlay = document.getElementById('fmConflictOverlay');
  const desc = document.getElementById('fmConflictDesc');
  const list = document.getElementById('fmConflictList');
  const compareList = document.getElementById('fmConflictCompareList');
  const strategy = document.getElementById('fmConflictStrategy');

  desc.textContent = `${conflicts.length} file(s) conflict out of ${totalCount} total.`;
  strategy.value = 'skip';

  list.innerHTML = conflicts.map(c => `
    <div class="fm-conflict-row">
      <span class="fm-conflict-name">${escapeHtml(c.name)}</span>
      <span class="fm-conflict-info">Source: ${formatSizeStr(c.sourceSize)} &middot; Dest: ${formatSizeStr(c.destSize)}</span>
      <span class="fm-conflict-badge">${c.different ? 'Different' : 'Same'}</span>
    </div>
  `).join('');

  compareList.innerHTML = conflicts.map(c => `
    <div class="fm-compare-row">
      <div class="fm-compare-col">
        <div class="fm-compare-label">Source</div>
        <div class="fm-compare-detail">${escapeHtml(c.sourcePath || c.source || c.name)}</div>
        <div class="fm-compare-detail">${formatSizeStr(c.sourceSize)} &middot; ${c.sourceModifiedFormatted || (c.sourceModified ? new Date(c.sourceModified).toLocaleString() : '')}</div>
      </div>
      <div class="fm-compare-vs">→</div>
      <div class="fm-compare-col">
        <div class="fm-compare-label">Destination</div>
        <div class="fm-compare-detail">${escapeHtml(c.destPath || c.dest || c.name)}</div>
        <div class="fm-compare-detail">${formatSizeStr(c.destSize)} &middot; ${c.destModifiedFormatted || (c.destModified ? new Date(c.destModified).toLocaleString() : '')}</div>
      </div>
    </div>
  `).join('');

  overlay.style.display = 'flex';

  const tabs = overlay.querySelectorAll('.fm-tab');
  const tabPanels = overlay.querySelectorAll('.fm-tab-panel');
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabPanels.forEach(p => p.style.display = 'none');
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).style.display = '';
    };
  });

  document.getElementById('fmConflictApply').onclick = () => {
    overlay.style.display = 'none';
    callback(strategy.value);
  };
  document.getElementById('fmConflictCancel').onclick = () => {
    overlay.style.display = 'none';
  };
  document.getElementById('fmConflictClose').onclick = () => {
    overlay.style.display = 'none';
  };
}

/* ── Bin Sidebar ── */
async function fmLoadBin() {
  try {
    const data = await API.file.getBin();
    const batches = data.batches || [];
    const listEl = document.getElementById('fmBinList');
    const emptyEl = document.getElementById('fmBinEmpty');
    const actionsEl = document.getElementById('fmBinActions');

    if (!batches.length) {
      listEl.innerHTML = '';
      emptyEl.style.display = '';
      actionsEl.style.display = 'none';
      return;
    }

    emptyEl.style.display = 'none';
    actionsEl.style.display = '';
    let html = '';
    for (const batch of batches) {
      const files = batch.files || [];
      const timeStr = batch.deletedAt || batch.timestamp || '';
      html += `<div class="fm-bin-batch" data-batch-id="${escapeAttr(batch.batchId)}">
        <div class="fm-bin-batch-header">
          <span class="fm-bin-batch-time">${timeStr ? escapeHtml(new Date(timeStr).toLocaleString()) : 'Unknown'}</span>
          <span class="fm-bin-batch-count">${files.length} file(s)</span>
        </div>
        <div class="fm-bin-batch-files">`;
      for (const entry of files) {
        const fname = entry.name || entry.fileName || '';
        html += `<div class="fm-bin-file">
          <span class="fm-bin-file-name">${escapeHtml(fname)}</span>
          <span class="fm-bin-file-size">${formatSizeStr(entry.size || 0)}</span>
          <div class="fm-bin-file-actions">
            <button class="fm-btn fm-btn-sm fm-bin-restore" data-batch="${escapeAttr(batch.batchId)}" data-file="${escapeAttr(fname)}" title="Restore">↩</button>
            <button class="fm-btn fm-btn-sm fm-btn-danger fm-bin-delete" data-batch="${escapeAttr(batch.batchId)}" data-file="${escapeAttr(fname)}" title="Delete permanently">✕</button>
          </div>
        </div>`;
      }
      html += '</div></div>';
    }
    listEl.innerHTML = html;
  } catch (e) { console.warn('fmLoadBin:', e); }
}

function fmRefreshBin() {
  fmLoadBin().catch(() => {});
}

async function fmRestoreBinItem(batchId, fileName) {
  try {
    await API.file.restoreBin({ batchId, fileName });
    fmShowToast('File restored', 'success');
    fmRefreshBin();
    fmLoadDirectory();
  } catch (e) { fmShowToast(e.message, 'error'); }
}

async function fmPermanentDeleteBinItem(batchId, fileName) {
  try {
    await API.file.permanentDeleteBin({ batchId, fileName });
    fmShowToast('File permanently deleted', 'success');
    fmRefreshBin();
  } catch (e) { fmShowToast(e.message, 'error'); }
}

async function fmEmptyBin() {
  try {
    await API.file.emptyBin();
    fmShowToast('Bin emptied', 'success');
    fmRefreshBin();
  } catch (e) { fmShowToast(e.message, 'error'); }
}

function fmToggleBin() {
  const container = document.getElementById('fmBinContainer');
  const header = document.getElementById('fmBinToggle');
  header.classList.toggle('open');
  if (container.style.display === 'none') {
    container.style.display = '';
    fmLoadBin();
  } else {
    container.style.display = 'none';
  }
}

/* ── Batch Rename ── */
function fmShowBatchRename(paths) {
  const names = paths.map(p => p.split('/').pop());
  const previewId = 'fmBatchRenamePreview';

  function computeNewName(name, opts) {
    let result = name;
    if (opts.findText && opts.replaceText !== undefined) {
      result = result.split(opts.findText).join(opts.replaceText);
    }
    if (opts.prefix) result = opts.prefix + result;
    if (opts.suffix) {
      const dot = result.lastIndexOf('.');
      if (dot > 0) result = result.slice(0, dot) + opts.suffix + result.slice(dot);
      else result = result + opts.suffix;
    }
    if (opts.caseMode === 'lower') result = result.toLowerCase();
    if (opts.caseMode === 'upper') result = result.toUpperCase();
    return result;
  }

  function renderPreview() {
    const opts = {
      findText: document.getElementById('fmBatchFind')?.value || '',
      replaceText: document.getElementById('fmBatchReplace')?.value || '',
      prefix: document.getElementById('fmBatchPrefix')?.value || '',
      suffix: document.getElementById('fmBatchSuffix')?.value || '',
      caseMode: document.getElementById('fmBatchCase')?.value || '',
    };
    const previewEl = document.getElementById(previewId);
    if (!previewEl) return;
    const seen = new Set();
    previewEl.innerHTML = names.map(name => {
      const newName = computeNewName(name, opts);
      const changed = newName !== name;
      const conflict = seen.has(newName);
      if (changed) seen.add(newName);
      const cls = conflict ? 'fm-rename-conflict' : (changed ? 'fm-rename-changed' : '');
      return `<div class="fm-rename-row ${cls}">
        <span class="fm-rename-old">${escapeHtml(name)}</span>
        <span class="fm-rename-arrow">→</span>
        <span class="fm-rename-new">${escapeHtml(newName || '—')}</span>
        ${conflict ? '<span class="fm-rename-warn">⚠ duplicate</span>' : ''}
      </div>`;
    }).join('');
  }

  openFmModal('✏ Batch Rename', `
    <div class="fm-rename-opts">
      <div class="fm-rename-field">
        <label class="fm-form-label">Find</label>
        <input class="fm-form-input" id="fmBatchFind" placeholder="text to find" oninput="fmBatchRenamePreview()">
      </div>
      <div class="fm-rename-field">
        <label class="fm-form-label">Replace</label>
        <input class="fm-form-input" id="fmBatchReplace" placeholder="replacement text" oninput="fmBatchRenamePreview()">
      </div>
      <div class="fm-rename-row2">
        <div class="fm-rename-field">
          <label class="fm-form-label">Prefix</label>
          <input class="fm-form-input" id="fmBatchPrefix" placeholder="prefix" oninput="fmBatchRenamePreview()">
        </div>
        <div class="fm-rename-field">
          <label class="fm-form-label">Suffix</label>
          <input class="fm-form-input" id="fmBatchSuffix" placeholder="suffix (before ext)" oninput="fmBatchRenamePreview()">
        </div>
      </div>
      <div class="fm-rename-field">
        <label class="fm-form-label">Case</label>
        <select class="fm-form-select" id="fmBatchCase" onchange="fmBatchRenamePreview()">
          <option value="">No change</option>
          <option value="lower">Lowercase</option>
          <option value="upper">Uppercase</option>
        </select>
      </div>
    </div>
    <div class="fm-rename-count">${names.length} item(s) selected</div>
    <div class="fm-rename-preview" id="${previewId}"></div>
    <div class="fm-form-actions">
      <button class="fm-btn fm-btn-cancel">Cancel</button>
      <button class="fm-btn fm-btn-primary" id="fmBatchRenameSubmit">✏ Rename All</button>
    </div>
  `);

  window.fmBatchRenamePreview = renderPreview;
  renderPreview();

  document.getElementById('fmBatchRenameSubmit').addEventListener('click', async () => {
    const opts = {
      findText: document.getElementById('fmBatchFind').value,
      replaceText: document.getElementById('fmBatchReplace').value,
      prefix: document.getElementById('fmBatchPrefix').value,
      suffix: document.getElementById('fmBatchSuffix').value,
      caseMode: document.getElementById('fmBatchCase').value,
    };
    const results = { renamed: 0, skipped: 0, errors: [] };
    const usedNames = new Set();

    for (const p of paths) {
      const name = p.split('/').pop();
      const newName = computeNewName(name, opts);
      if (!newName || newName === name) { results.skipped++; continue; }
      if (usedNames.has(newName)) { results.skipped++; continue; }
      usedNames.add(newName);
      const parent = p.substring(0, p.lastIndexOf('/')) || '/';
      try {
        await API.file.rename({ path: p, newName });
        results.renamed++;
      } catch (e) {
        results.errors.push(`${escapeHtml(name)}: ${escapeHtml(e.message)}`);
      }
    }

    closeFmModal();
    await fmLoadDirectory();
    const msg = `Renamed ${results.renamed} item(s)` +
      (results.skipped > 0 ? `, ${results.skipped} skipped` : '') +
      (results.errors.length > 0 ? `, ${results.errors.length} error(s)` : '');
    fmShowToast(msg, results.errors.length > 0 ? 'error' : 'success');
  });
}

/* ── Diff View ── */
async function fmShowDiff(paths) {
  if (paths.length !== 2) {
    fmShowToast('Select exactly 2 files to compare', 'error');
    return;
  }
  const pathA = paths[0], pathB = paths[1];
  /* Verify both are files (not directories) */
  const entries = document.querySelectorAll('.fm-entry');
  const types = {};
  entries.forEach(el => { types[el.dataset.path] = el.dataset.type; });
  if (types[pathA] === 'directory' || types[pathB] === 'directory') {
    fmShowToast('Cannot compare directories', 'error');
    return;
  }

  try {
    const result = await API.file.diff({ source: pathA, target: pathB });
    const { source, target, hunks } = result;

    let html = `<div class="fm-diff-header"><span>${escapeHtml(source)}</span><span class="fm-diff-vs">vs</span><span>${escapeHtml(target)}</span></div>`;

    if (!hunks || hunks.length === 0) {
      html += '<div class="fm-diff-empty">Files are identical</div>';
    } else {
      let oldLine = 1, newLine = 1;
      for (const hunk of hunks) {
        if (hunk.type === 'equal') {
          for (const line of hunk.lines) {
            html += `<div class="fm-diff-line fm-diff-equal"><span class="fm-diff-num">${oldLine++}</span><span class="fm-diff-num">${newLine++}</span><span class="fm-diff-text">${escapeHtml(line)}</span></div>`;
          }
        } else if (hunk.type === 'add') {
          for (const line of hunk.lines) {
            html += `<div class="fm-diff-line fm-diff-add"><span class="fm-diff-num"></span><span class="fm-diff-num">${newLine++}</span><span class="fm-diff-text">+ ${escapeHtml(line)}</span></div>`;
          }
        } else if (hunk.type === 'remove') {
          for (const line of hunk.lines) {
            html += `<div class="fm-diff-line fm-diff-remove"><span class="fm-diff-num">${oldLine++}</span><span class="fm-diff-num"></span><span class="fm-diff-text">- ${escapeHtml(line)}</span></div>`;
          }
        } else if (hunk.type === 'replace') {
          for (const line of hunk.removed) {
            html += `<div class="fm-diff-line fm-diff-remove"><span class="fm-diff-num">${oldLine++}</span><span class="fm-diff-num"></span><span class="fm-diff-text">- ${escapeHtml(line)}</span></div>`;
          }
          for (const line of hunk.added) {
            html += `<div class="fm-diff-line fm-diff-add"><span class="fm-diff-num"></span><span class="fm-diff-num">${newLine++}</span><span class="fm-diff-text">+ ${escapeHtml(line)}</span></div>`;
          }
        }
      }
    }

    openFmModal('⇄ File Comparison', `
      <div class="fm-diff-container">${html}</div>
      <div class="fm-form-actions">
        <button class="fm-btn fm-btn-cancel">Close</button>
      </div>
    `);
  } catch (e) {
    fmShowToast(e.message || 'Diff failed', 'error');
  }
}

/* ── Clipboard (Cut/Copy/Paste) ── */
function fmClipboardCopy(paths) {
  fmState.clipboard = { action: 'copy', paths: Array.from(paths) };
  document.getElementById('fmCtxPaste').style.display = '';
  fmShowToast(`Copied ${paths.length} item(s) to clipboard`, 'success');
}

function fmClipboardCut(paths) {
  fmState.clipboard = { action: 'cut', paths: Array.from(paths) };
  document.getElementById('fmCtxPaste').style.display = '';
  fmShowToast(`Cut ${paths.length} item(s) to clipboard`, 'success');
}

async function fmClipboardPaste() {
  if (!fmState.clipboard || !fmState.clipboard.paths.length) return;
  const { action, paths } = fmState.clipboard;
  const dest = fmState.currentPath;
  const results = [];

  try {
    const conflicts = await API.file.checkConflicts({ sources: paths, dest });
    if (conflicts.hasConflicts) {
      fmShowConflictModal(conflicts.conflicts, paths.length, action === 'copy' ? 'copy' : 'move', async (strategy) => {
        const innerResults = [];
        for (const src of paths) {
          try {
            if (action === 'copy') {
              await API.file.copyto({ source: src, destination: dest, strategy });
            } else {
              await API.file.moveto({ source: src, destination: dest, strategy });
            }
            innerResults.push({ src, ok: true });
          } catch (e) {
            innerResults.push({ src, ok: false, error: e.message });
          }
        }
        fmState.clipboard = null;
        document.getElementById('fmCtxPaste').style.display = 'none';
        try { await fmLoadDirectory(); } catch (e) { console.warn('fmClipboardPaste: reload failed', e); }
        const ok = innerResults.filter(r => r.ok).length;
        const fail = innerResults.filter(r => !r.ok).length;
        if (fail > 0) {
          fmShowToast(`${action === 'copy' ? 'Copied' : 'Moved'} ${ok}, ${fail} failed`, 'error');
        } else {
          fmShowToast(`${action === 'copy' ? 'Copied' : 'Moved'} ${ok} item(s)`, 'success');
        }
      });
      return;
    }
  } catch (e) { fmShowToast(e.message, 'error'); return; }

  for (const src of paths) {
    try {
      if (action === 'copy') {
        await API.file.copyto({ source: src, destination: dest, overwrite: false });
      } else {
        await API.file.moveto({ source: src, destination: dest, overwrite: false });
      }
      results.push({ src, ok: true });
    } catch (e) {
      results.push({ src, ok: false, error: e.message });
    }
  }
    fmState.clipboard = null;
    document.getElementById('fmCtxPaste').style.display = 'none';
    try { await fmLoadDirectory(); } catch (e) { console.warn('fmClipboardPaste: reload failed', e); }
  const ok = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok).length;
  if (fail > 0) {
    fmShowToast(`${action === 'copy' ? 'Copied' : 'Moved'} ${ok}, ${fail} failed`, 'error');
  } else {
    fmShowToast(`${action === 'copy' ? 'Copied' : 'Moved'} ${ok} item(s)`, 'success');
  }
}

/* ── Keyboard Shortcuts ── */
document.addEventListener('keydown', (e) => {
  if (document.getElementById('fmEditorOverlay')?.style.display === 'flex') return;
  if (document.getElementById('fmModalOverlay')?.style.display === 'flex') return;
  if (document.getElementById('dashboardPage')?.style.display === 'none') return;
  if (document.getElementById('viewFiles')?.style.display === 'none') return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  const mod = e.ctrlKey || e.metaKey;
  const sel = getSelectedPaths();
  const first = sel.length > 0 ? sel[0] : null;

  if (mod && e.key === 'c' && e.shiftKey) { e.preventDefault(); if (sel.length) fmClipboardCopy(sel); }
  else if (mod && e.key === 'x' && e.shiftKey) { e.preventDefault(); if (sel.length) fmClipboardCut(sel); }
  else if (mod && e.key === 'v' && e.shiftKey) { e.preventDefault(); fmClipboardPaste(); }
  else if (mod && e.key === 'd') { e.preventDefault(); if (sel.length) fmShowDelete(sel); }
  else if (mod && e.key === 'a') { e.preventDefault(); selectAll(); }
  else if (mod && e.key === 'e') { e.preventDefault(); if (first) fmOpenEditor(first); }
  else   if (mod && e.key === 'r' && e.shiftKey) { e.preventDefault(); if (sel.length) fmShowBatchRename(sel); }
  else if (mod && e.key === 'r') { e.preventDefault(); if (first) fmShowRename(first, first.split('/').pop()); }
  else if (mod && e.key === 'o') { e.preventDefault(); if (first) { const el = document.querySelector(`.fm-entry[data-path="${CSS.escape(first)}"]`); if (el) fmEntryOpen(el); } }
  else if (mod && e.key === 'm') { e.preventDefault(); if (sel.length) fmShowMoveToBatch(sel); }
  else if (mod && e.key === 'c') { e.preventDefault(); if (sel.length) fmShowCopyToBatch(sel); }
  else   if (mod && e.key === 't') { e.preventDefault(); fmShowCreate(); }
  else if (mod && e.key === 'n') { e.preventDefault(); fmShowCreateFolder(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelectionUp(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); moveSelectionDown(); }
  else if (e.key === 'Delete') { e.preventDefault(); if (sel.length) fmShowDelete(sel); }
  else if (e.key === 'F2') { e.preventDefault(); if (first) fmShowRename(first, first.split('/').pop()); }
  else if (e.key === 'F5') { e.preventDefault(); fmLoadDirectory(); }
});

function selectAll() {
  fmState.selected.clear();
  const entries = document.querySelectorAll('.fm-entry');
  entries.forEach(el => {
    fmState.selected.add(el.dataset.path);
    el.classList.add('selected');
  });
  fmUpdateStatus();
}

function getSelectedPaths() {
  return [...fmState.selected];
}

function moveSelectionDown() {
  const entries = Array.from(document.querySelectorAll('.fm-entry'));
  if (entries.length === 0) return;
  const sel = getSelectedPaths();
  if (sel.length === 0) { entries[0].click(); return; }
  const last = sel[sel.length - 1];
  const idx = entries.findIndex(el => el.dataset.path === last);
  if (idx >= 0 && idx < entries.length - 1) entries[idx + 1].click();
}

function moveSelectionUp() {
  const entries = Array.from(document.querySelectorAll('.fm-entry'));
  if (entries.length === 0) return;
  const sel = getSelectedPaths();
  if (sel.length === 0) { entries[entries.length - 1].click(); return; }
  const first = sel[0];
  const idx = entries.findIndex(el => el.dataset.path === first);
  if (idx > 0) entries[idx - 1].click();
}

function fmShowCreateFolder() {
  const typeOpts = `<option value="file">File</option><option value="directory" selected>Folder</option>`;
  const contentRow = `<div class="fm-form-group" id="fmCreateContentGroup" style="display:none"><label class="fm-form-label">Content</label><textarea class="fm-form-textarea" id="fmCreateContent"></textarea></div>`;
  openFmModal('+ New', `
    <div class="fm-form-group"><label class="fm-form-label">Name</label><input class="fm-form-input" id="fmCreateName" placeholder="new_folder" autofocus></div>
    <div class="fm-form-group"><label class="fm-form-label">Type</label><select class="fm-form-select" id="fmCreateType">${typeOpts}</select></div>
    ${contentRow}
    <div class="fm-form-error" id="fmCreateError"></div>
    <div class="fm-form-actions"><button class="fm-btn fm-btn-cancel">Cancel</button><button class="fm-btn fm-btn-primary" id="fmCreateSubmit">Create</button></div>
  `);
  document.getElementById('fmCreateSubmit').addEventListener('click', async () => {
    const name = document.getElementById('fmCreateName').value.trim();
    const err = document.getElementById('fmCreateError');
    if (!name) { err.textContent = 'Name is required'; err.style.display = 'block'; return; }
    try {
      await API.file.create({ parentPath: fmState.currentPath, name, type: 'directory', content: '' });
      closeFmModal(); await fmLoadDirectory();
    } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
  });
}

window.initFileManager = initFileManager;
window.closeFmModal = closeFmModal;
window.closeFmPreview = closeFmPreview;
window.fmToggleBin = fmToggleBin;
window.fmEmptyBin = fmEmptyBin;

/* ─── Git Integration ─── */
var fmGitOpen = false;
async function fmInitGit() {
  try {
    document.getElementById('fmGitFiles').addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-git-stage]');
      if (btn) { fmGitStage(decodeURIComponent(btn.getAttribute('data-git-stage'))); return; }
      btn = ev.target.closest('[data-git-unstage]');
      if (btn) { fmGitUnstage(decodeURIComponent(btn.getAttribute('data-git-unstage'))); }
    });
    var status = await API.file.gitStatus(fmState.currentPath);
    var btn = document.getElementById('fmGitBtn');
    if (status && status.isRepo) {
      if (btn) btn.style.color = 'var(--accent-cyan)';
    } else {
      if (btn) btn.style.color = '';
    }
  } catch (e) { console.warn('fmInitGit:', e); }
}

async function fmToggleGit() {
  fmGitOpen = !fmGitOpen;
  var panel = document.getElementById('fmGitPanel');
  var btn = document.getElementById('fmGitBtn');
  if (fmGitOpen) {
    panel.style.display = 'block';
    btn.classList.add('active');
    fmGitRefresh();
  } else {
    panel.style.display = 'none';
    btn.classList.remove('active');
  }
}

async function fmGitRefresh() {
  try {
    var status = await API.file.gitStatus(fmState.currentPath);
    var filesEl = document.getElementById('fmGitFiles');
    if (!status || !status.isRepo) {
      document.getElementById('fmGitBranch').textContent = '⬡ Not a git repository';
      filesEl.innerHTML = '<div class="fm-git-clean">This directory is not a git repository. Initialize one with: <code>git init</code></div>';
      document.getElementById('fmGitMsg').disabled = true;
      return;
    }
    document.getElementById('fmGitBranch').textContent = '⬡ ' + status.branch;
    document.getElementById('fmGitMsg').disabled = false;
    if (!status.files.length) {
      filesEl.innerHTML = '<div class="fm-git-clean">Nothing to commit, working tree clean</div>';
    } else {
      filesEl.innerHTML = status.files.map(function (f) {
        var cls = f.status.includes('?') ? 'untracked' : f.status.includes('M') ? 'modified' : f.status.includes('D') ? 'deleted' : f.status.includes('A') ? 'added' : '';
        var staged = f.status.includes('M') && f.status.length === 2 && f.status[0] === 'M';
        var fileEnc = encodeURIComponent(f.file);
        return '<div class="fm-git-file ' + cls + '">'
          + '<span class="fm-git-file-status">' + escapeHtml(f.status) + '</span>'
          + '<span class="fm-git-file-name">' + escapeHtml(f.file) + '</span>'
          + '<div class="fm-git-file-actions">'
          + (!staged ? '<button class="fm-btn fm-btn-sm" data-git-stage="' + fileEnc + '">+ Stage</button>' : '<button class="fm-btn fm-btn-sm" data-git-unstage="' + fileEnc + '">− Unstage</button>')
          + '</div></div>';
      }).join('');
    }
  } catch (e) { fmShowToast(e.message, 'error'); }
}

async function fmGitStage(file) {
  try { await API.file.gitStage(fmState.currentPath, file); fmGitRefresh(); } catch (e) { fmShowToast(e.message, 'error'); }
}

async function fmGitUnstage(file) {
  try { await API.file.gitUnstage(fmState.currentPath, file); fmGitRefresh(); } catch (e) { fmShowToast(e.message, 'error'); }
}

async function fmGitCommit() {
  var msg = document.getElementById('fmGitMsg').value.trim();
  if (!msg) { fmShowToast('Enter a commit message', 'error'); return; }
  try {
    await API.file.gitCommit(fmState.currentPath, msg);
    document.getElementById('fmGitMsg').value = '';
    fmShowToast('Committed!', 'success');
    fmGitRefresh();
  } catch (e) { fmShowToast(e.message, 'error'); }
}

async function fmGitPush() {
  try { await API.file.gitPush(fmState.currentPath); fmShowToast('Pushed!', 'success'); } catch (e) { fmShowToast(e.message, 'error'); }
}

async function fmGitPull() {
  try { await API.file.gitPull(fmState.currentPath); fmShowToast('Pulled!', 'success'); fmGitRefresh(); } catch (e) { fmShowToast(e.message, 'error'); }
}

document.getElementById('fmGitBtn')?.addEventListener('click', fmToggleGit);

// Check git on load and navigation
var _origLoadDirectory = fmLoadDirectory;
fmLoadDirectory = async function() {
  await _origLoadDirectory();
  fmInitGit();
};
