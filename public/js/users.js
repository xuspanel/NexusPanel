const usersState = {
  data: [],
  selected: new Set(),
  sort: { field: 'username', order: 'asc' },
  page: 1,
  limit: 50,
  total: 0,
  pages: 1,
  search: '',
  formOptions: { groups: [], shells: [] },
};

document._editingUser = null;
document._adminUser = null;

window.initUsers = async function () {
  try {
    const u = await API.me();
    if (u.role !== 'admin') {
      document.getElementById('usersContent').innerHTML = '<div class="db-error"><span class="db-error-icon">⚠️</span><span>Admin access required</span></div>';
      return;
    }
    document._adminUser = u.username;
    usersState.formOptions = await API.users.options();
    await loadUsers();
  } catch (err) {
    document.getElementById('usersContent').innerHTML = '<div class="db-error"><span class="db-error-icon">⚠️</span><span>' + escHtml(err.message) + '</span></div>';
  }
};

async function loadUsers() {
  const loadingEl = document.getElementById('usersLoading');
  const contentEl = document.getElementById('usersContent');
  const errorEl = document.getElementById('usersError');
  try {
    loadingEl.style.display = 'flex';
    contentEl.style.display = 'none';
    errorEl.style.display = 'none';
    const params = { page: usersState.page, limit: usersState.limit };
    if (usersState.search) params.search = usersState.search;
    if (usersState.sort.field) {
      params.sort = usersState.sort.field;
      params.order = usersState.sort.order;
    }
    const result = await API.users.list(params);
    if (Array.isArray(result)) {
      usersState.data = result;
      usersState.total = result.length;
      usersState.pages = 1;
    } else {
      usersState.data = result.users || [];
      usersState.total = result.total || 0;
      usersState.page = result.page || 1;
      usersState.pages = result.pages || 1;
    }
    usersState.selected.clear();
    renderUsers();
    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
  } catch (err) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'flex';
    document.getElementById('usersErrorText').textContent = err.message;
  }
}

function renderUsers() {
  const tbody = document.getElementById('usersTableBody');
  const allChecked = usersState.data.length > 0 && usersState.selected.size === usersState.data.length;
  tbody.innerHTML = usersState.data.map(u => {
    const cannotDelete = u.username === 'root' || u.username === document._adminUser;
    const isSelected = usersState.selected.has(u.username);

    const shellLabel = u.shell && u.shell.includes('nologin') ? '<span class="u-sh-no">nologin</span>' : escHtml(u.shell || '—');
    const lockedBadge = u.isLocked ? '<span class="u-badge u-badge-red">Locked</span>' : '';
    const sudoBadge = u.hasSudo ? '<span class="u-badge u-badge-amber">sudo</span>' : '';
    const panelBadge = u.panelEnabled ? '<span class="u-badge u-badge-cyan">Panel</span>' : '';
    const tfaBadge = u.twoFactorEnabled ? '<span class="u-badge u-badge-green">2FA</span>' : '';
    const uidClass = u.uid === 0 ? 'u-uid-root' : u.isSystem ? 'u-uid-sys' : '';

    return '<tr class="' + (isSelected ? 'users-row-selected' : '') + '">' +
      '<td><label class="form-checkbox users-select-wrap">' +
        '<input type="checkbox" class="users-select-cb" data-username="' + escHtml(u.username) + '"' + (isSelected ? ' checked' : '') + (cannotDelete ? ' disabled' : '') + '>' +
        '<span class="form-checkbox-mark"></span>' +
      '</label></td>' +
      '<td><span class="user-name">' +
        escHtml(u.username) + lockedBadge + sudoBadge + panelBadge + tfaBadge +
      '</span></td>' +
      '<td><span class="' + uidClass + '">' + u.uid + '</span></td>' +
      '<td>' + escHtml(u.groups.slice(0, 3).join(', ')) + (u.groups.length > 3 ? ' <span class="u-more">+' + (u.groups.length - 3) + '</span>' : '') + '</td>' +
      '<td>' + shellLabel + '</td>' +
      '<td class="u-home-cell">' + escHtml(u.home || '—') + '</td>' +
      '<td>' + (u.lastLogin ? escHtml(u.lastLogin) : '<span class="u-never">Never</span>') + '</td>' +
      '<td class="users-actions">' +
        '<button class="fm-btn fm-btn-secondary fm-btn-sm" data-um-action="edit" data-um-username="' + escHtml(u.username) + '" title="Edit user">✏️</button>' +
        (cannotDelete ? '' : ' <button class="fm-btn fm-btn-secondary fm-btn-sm users-delete-btn" data-um-action="delete" data-um-username="' + escHtml(u.username) + '" title="Delete user">🗑️</button>') +
      '</td>' +
      '</tr>';
  }).join('');

  document.getElementById('usersSelectAll').checked = allChecked;
  renderBulkBar();
  renderPagination();
}

function renderBulkBar() {
  const bar = document.getElementById('usersBulkBar');
  if (!bar) return;
  if (usersState.selected.size > 0) {
    bar.style.display = 'flex';
    document.getElementById('usersBulkCount').textContent = usersState.selected.size + ' selected';
  } else {
    bar.style.display = 'none';
  }
}

function renderPagination() {
  const el = document.getElementById('usersPagination');
  if (!el) return;
  if (usersState.pages <= 1) { el.innerHTML = ''; return; }
  let html = '';
  html += '<button class="fm-btn fm-btn-secondary fm-btn-sm" data-um-page="prev"' + (usersState.page <= 1 ? ' disabled' : '') + '>‹</button>';
  const start = Math.max(1, usersState.page - 2);
  const end = Math.min(usersState.pages, usersState.page + 2);
  if (start > 1) html += '<button class="fm-btn fm-btn-secondary fm-btn-sm" data-um-page="1">1</button>';
  if (start > 2) html += '<span class="users-page-ellipsis">…</span>';
  for (let i = start; i <= end; i++) {
    html += '<button class="fm-btn fm-btn-sm ' + (i === usersState.page ? 'fm-btn-primary' : 'fm-btn-secondary') + '" data-um-page="' + i + '">' + i + '</button>';
  }
  if (end < usersState.pages - 1) html += '<span class="users-page-ellipsis">…</span>';
  if (end < usersState.pages) html += '<button class="fm-btn fm-btn-secondary fm-btn-sm" data-um-page="' + usersState.pages + '">' + usersState.pages + '</button>';
  html += '<button class="fm-btn fm-btn-secondary fm-btn-sm" data-um-page="next"' + (usersState.page >= usersState.pages ? ' disabled' : '') + '>›</button>';
  html += '<span class="users-page-info">' + usersState.total + ' users</span>';
  el.innerHTML = html;
}

function renderSortHeaders() {
  document.querySelectorAll('#viewUsers .users-table th[data-sort]').forEach(th => {
    const field = th.dataset.sort;
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    if (usersState.sort.field === field) {
      icon.textContent = usersState.sort.order === 'asc' ? '▲' : '▼';
      th.classList.add('users-th-active');
    } else {
      icon.textContent = '⇅';
      th.classList.remove('users-th-active');
    }
  });
}

function populateGroupOptions(selectEl, selected) {
  selectEl.innerHTML = usersState.formOptions.groups.map(g =>
    '<option value="' + escHtml(g) + '"' + (selected && selected.includes(g) ? ' selected' : '') + '>' + escHtml(g) + '</option>'
  ).join('');
}

function populateShellOptions(selectEl, current) {
  selectEl.innerHTML = usersState.formOptions.shells.map(s =>
    '<option value="' + escHtml(s) + '"' + (s === current ? ' selected' : '') + '>' + escHtml(s) + '</option>'
  ).join('');
}

function openAddUser() {
  document.getElementById('usersFormTitle').textContent = 'Create VPS User';
  document.getElementById('usersFormUsername').value = '';
  document.getElementById('usersFormUsername').disabled = false;
  document.getElementById('usersFormPassword').value = '';
  document.getElementById('usersFormPassword').required = true;
  document.getElementById('usersFormPassword').placeholder = 'Min 6 chars, 1 uppercase, 1 digit';
  populateShellOptions(document.getElementById('usersFormShell'), '/bin/bash');
  populateGroupOptions(document.getElementById('usersFormGroups'), []);
  document.getElementById('usersFormSudo').checked = false;
  document.getElementById('usersFormPanel').checked = true;
  document.getElementById('usersFormEmail').value = '';
  document.getElementById('usersFormError').style.display = 'none';
  document.getElementById('usersFormSuccess').style.display = 'none';
  document.getElementById('usersFormModal').style.display = 'flex';
  document.getElementById('usersFormUsername').focus();
  document._editingUser = null;
}

async function openEditUser(username) {
  const u = usersState.data.find(x => x.username === username);
  if (!u) return;

  document.getElementById('usersFormTitle').textContent = 'Edit User: ' + username;
  document.getElementById('usersFormUsername').value = username;
  document.getElementById('usersFormUsername').disabled = true;
  document.getElementById('usersFormPassword').value = '';
  document.getElementById('usersFormPassword').required = false;
  document.getElementById('usersFormPassword').placeholder = 'Leave blank to keep current';
  populateShellOptions(document.getElementById('usersFormShell'), u.shell || '/bin/bash');
  populateGroupOptions(document.getElementById('usersFormGroups'), u.groups || []);
  document.getElementById('usersFormSudo').checked = u.hasSudo;
  document.getElementById('usersFormPanel').checked = u.panelEnabled;
  document.getElementById('usersFormEmail').value = u.email || '';
  document.getElementById('usersFormError').style.display = 'none';
  document.getElementById('usersFormSuccess').style.display = 'none';
  document.getElementById('usersFormModal').style.display = 'flex';
  document._editingUser = username;
}

function closeUsersForm() {
  document.getElementById('usersFormModal').style.display = 'none';
  document.getElementById('usersFormSubmit').disabled = false;
  document.getElementById('usersFormSubmit').textContent = 'Save';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('usersForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const isEdit = !!document._editingUser;
    const username = document.getElementById('usersFormUsername').value.trim();
    const password = document.getElementById('usersFormPassword').value;
    const shell = document.getElementById('usersFormShell').value;
    const groups = Array.from(document.getElementById('usersFormGroups').selectedOptions).map(o => o.value);
    const sudo = document.getElementById('usersFormSudo').checked;
    const createPanel = document.getElementById('usersFormPanel').checked;
    const email = document.getElementById('usersFormEmail').value.trim();
    const errEl = document.getElementById('usersFormError');
    const succEl = document.getElementById('usersFormSuccess');
    const submitBtn = document.getElementById('usersFormSubmit');
    errEl.style.display = 'none';
    succEl.style.display = 'none';

    submitBtn.disabled = true;
    submitBtn.textContent = isEdit ? 'Updating...' : 'Creating...';

    try {
      if (isEdit) {
        const body = { shell, groups, sudo, panelRole: createPanel ? 'user' : null, email };
        if (password) body.password = password;
        await API.users.update(username, body);
      } else {
        if (!password || password.length < 6) {
          throw new Error('Password must be at least 6 characters');
        }
        if (!/^[a-zA-Z][a-zA-Z0-9._-]{0,31}$/.test(username)) {
          throw new Error('Invalid username. Must start with a letter, max 32 chars.');
        }
        await API.users.create({ username, password, shell, groups, sudo, createPanel, email });
      }
      succEl.textContent = isEdit ? 'User updated successfully' : 'User created successfully';
      succEl.style.display = 'block';
      setTimeout(() => { closeUsersForm(); loadUsers(); }, 1000);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save';
    }
  });

  document.getElementById('usersFormCancel').addEventListener('click', closeUsersForm);
  document.getElementById('usersFormClose').addEventListener('click', closeUsersForm);
  document.getElementById('usersAddBtn').addEventListener('click', openAddUser);
  document.getElementById('usersRefreshBtn').addEventListener('click', loadUsers);
  document.getElementById('usersRetryBtn').addEventListener('click', loadUsers);

  document.querySelectorAll('.users-form-modal').forEach(el => {
    el.addEventListener('click', (e) => { if (e.target === el) closeUsersForm(); });
  });

  const searchInput = document.getElementById('usersSearchInput');
  if (searchInput) {
    let debounce;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        usersState.search = searchInput.value.trim();
        usersState.page = 1;
        loadUsers();
      }, 300);
    });
  }

  document.getElementById('viewUsers').addEventListener('click', (e) => {
    const target = e.target.closest('[data-um-action]');
    if (target) {
      const action = target.dataset.umAction;
      const username = target.dataset.umUsername;
      if (action === 'edit') openEditUser(username);
      else if (action === 'delete') deleteUser(username);
      return;
    }

    const selectAllCb = e.target.closest('#usersSelectAll');
    if (selectAllCb) {
      const checked = selectAllCb.checked;
      usersState.data.forEach(u => {
        if (u.username !== 'root' && u.username !== document._adminUser) {
          if (checked) usersState.selected.add(u.username);
          else usersState.selected.delete(u.username);
        }
      });
      renderUsers();
      return;
    }

    const selectCb = e.target.closest('.users-select-cb');
    if (selectCb && !selectCb.disabled) {
      const username = selectCb.dataset.username;
      if (selectCb.checked) usersState.selected.add(username);
      else usersState.selected.delete(username);
      renderUsers();
      return;
    }

    const sortTh = e.target.closest('th[data-sort]');
    if (sortTh) {
      const field = sortTh.dataset.sort;
      if (usersState.sort.field === field) {
        usersState.sort.order = usersState.sort.order === 'asc' ? 'desc' : 'asc';
      } else {
        usersState.sort.field = field;
        usersState.sort.order = 'asc';
      }
      usersState.page = 1;
      loadUsers();
      return;
    }

    const pageBtn = e.target.closest('[data-um-page]');
    if (pageBtn && !pageBtn.disabled) {
      const val = pageBtn.dataset.umPage;
      if (val === 'prev') usersState.page = Math.max(1, usersState.page - 1);
      else if (val === 'next') usersState.page = Math.min(usersState.pages, usersState.page + 1);
      else usersState.page = parseInt(val, 10);
      loadUsers();
      return;
    }

    const bulkBtn = e.target.closest('[data-um-bulk]');
    if (bulkBtn) {
      const action = bulkBtn.dataset.umBulk;
      handleBulkAction(action);
      return;
    }
  });
});

async function deleteUser(username) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.innerHTML =
    '<div class="modal" style="max-width:420px;">' +
      '<div class="modal-header">' +
        '<span class="modal-icon">⚠️</span>' +
        '<span class="modal-title">Delete User</span>' +
      '</div>' +
      '<div class="modal-body">' +
        '<p class="users-delete-msg">Are you sure you want to delete <strong>' + escHtml(username) + '</strong>?</p>' +
        '<p class="users-delete-warning">This will remove their system account, home directory, and sudo rules.</p>' +
      '</div>' +
      '<div class="modal-footer">' +
        '<button class="fm-btn fm-btn-secondary users-delete-cancel">Cancel</button>' +
        '<button class="fm-btn fm-btn-danger users-delete-confirm">Delete</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  return new Promise((resolve) => {
    overlay.querySelector('.users-delete-cancel').addEventListener('click', () => { overlay.remove(); resolve(); });
    overlay.querySelector('.users-delete-confirm').addEventListener('click', async () => {
      try {
        overlay.querySelector('.users-delete-confirm').textContent = 'Deleting...';
        overlay.querySelector('.users-delete-confirm').disabled = true;
        await API.users.del(username);
        overlay.remove();
        await loadUsers();
        resolve();
      } catch (err) {
        overlay.remove();
        showUsersToast(err.message, 'error');
        resolve();
      }
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(); } });
  });
}

async function handleBulkAction(action) {
  const usernames = Array.from(usersState.selected);
  if (usernames.length === 0) return;

  if (action === 'delete') {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.innerHTML =
      '<div class="modal" style="max-width:420px;">' +
        '<div class="modal-header"><span class="modal-icon">⚠️</span><span class="modal-title">Bulk Delete</span></div>' +
        '<div class="modal-body">' +
          '<p>Delete <strong>' + usernames.length + '</strong> user(s)?</p>' +
          '<p class="users-delete-warning">This action cannot be undone.</p>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button class="fm-btn fm-btn-secondary users-bulk-cancel">Cancel</button>' +
          '<button class="fm-btn fm-btn-danger users-bulk-confirm">Delete All</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    await new Promise((resolve) => {
      overlay.querySelector('.users-bulk-cancel').addEventListener('click', () => { overlay.remove(); resolve(); });
      overlay.querySelector('.users-bulk-confirm').addEventListener('click', async () => {
        try {
          overlay.querySelector('.users-bulk-confirm').textContent = 'Deleting...';
          overlay.querySelector('.users-bulk-confirm').disabled = true;
          await API.users.bulk('delete', usernames);
          overlay.remove();
          await loadUsers();
          resolve();
        } catch (err) {
          overlay.remove();
          showUsersToast(err.message, 'error');
          resolve();
        }
      });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(); } });
    });
  } else {
    try {
      await API.users.bulk(action, usernames);
      await loadUsers();
    } catch (err) {
      showUsersToast(err.message, 'error');
    }
  }
}

function showUsersToast(message, type) {
  const toast = document.createElement('div');
  toast.className = 'users-toast users-toast-' + (type || 'info');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('users-toast-show'), 10);
  setTimeout(() => { toast.classList.remove('users-toast-show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
