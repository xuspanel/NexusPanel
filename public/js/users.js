let usersData = [];
let formOptions = { groups: [], shells: [] };

window.initUsers = async function () {
  try {
    const u = await API.me();
    if (u.role !== 'admin') {
      document.getElementById('usersContent').innerHTML = '<div class="db-error"><span class="db-error-icon">⚠️</span><span>Admin access required</span></div>';
      return;
    }
    formOptions = await API.users.options();
    await loadUsers();
  } catch (err) {
    document.getElementById('usersContent').innerHTML = '<div class="db-error"><span class="db-error-icon">⚠️</span><span>' + escHtml(err.message) + '</span></div>';
  }
};

async function loadUsers() {
  try {
    document.getElementById('usersLoading').style.display = 'flex';
    document.getElementById('usersContent').style.display = 'none';
    document.getElementById('usersError').style.display = 'none';
    usersData = await API.users.list();
    renderUsers();
    document.getElementById('usersLoading').style.display = 'none';
    document.getElementById('usersContent').style.display = 'block';
  } catch (err) {
    document.getElementById('usersLoading').style.display = 'none';
    document.getElementById('usersError').style.display = 'flex';
    document.getElementById('usersErrorText').textContent = err.message;
  }
}

function renderUsers() {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = usersData.map(u => {
    const isAdminUser = u.username === 'root' || u.panelRole === 'admin';
    const cannotDelete = u.username === 'root' || u.username === (document._adminUser || 'admin');

    const shellLabel = u.shell && u.shell.includes('nologin') ? '<span class="u-sh-no">nologin</span>' : escHtml(u.shell || '—');
    const lockedBadge = u.isLocked ? ' <span class="u-locked">Locked</span>' : '';
    const sudoBadge = u.hasSudo ? ' <span class="u-sudo">sudo</span>' : '';
    const panelBadge = u.panelEnabled ? ' <span class="u-panel">Panel</span>' : '';
    const uidClass = u.uid === 0 ? 'u-uid-root' : u.isSystem ? 'u-uid-sys' : '';

    return '<tr>' +
      '<td><span class="user-name">' +
        escHtml(u.username) + lockedBadge + sudoBadge + panelBadge +
      '</span></td>' +
      '<td><span class="' + uidClass + '">' + u.uid + '</span></td>' +
      '<td>' + escHtml(u.groups.slice(0, 4).join(', ')) + (u.groups.length > 4 ? '…' : '') + '</td>' +
      '<td>' + shellLabel + '</td>' +
      '<td>' + escHtml(u.home || '—') + '</td>' +
      '<td>' + (u.lastLogin ? escHtml(u.lastLogin) : '<span class="u-never">Never</span>') + '</td>' +
      '<td class="users-actions">' +
        '<button class="fm-btn fm-btn-secondary fm-btn-sm" onclick="openEditUser(\'' + u.username + '\')" title="Edit user">✏</button>' +
        (cannotDelete ? '' : ' <button class="fm-btn fm-btn-secondary fm-btn-sm users-delete-btn" onclick="deleteUser(\'' + u.username + '\')" title="Delete user">🗑</button>') +
      '</td>' +
      '</tr>';
  }).join('');
}

function populateGroupOptions(selectEl, selected) {
  selectEl.innerHTML = formOptions.groups.map(g =>
    '<option value="' + escHtml(g) + '"' + (selected && selected.includes(g) ? ' selected' : '') + '>' + escHtml(g) + '</option>'
  ).join('');
}

function populateShellOptions(selectEl, current) {
  selectEl.innerHTML = formOptions.shells.map(s =>
    '<option value="' + escHtml(s) + '"' + (s === current ? ' selected' : '') + '>' + escHtml(s) + '</option>'
  ).join('');
}

function openAddUser() {
  document.getElementById('usersFormTitle').textContent = 'Create VPS User';
  document.getElementById('usersFormUsername').value = '';
  document.getElementById('usersFormUsername').disabled = false;
  document.getElementById('usersFormPassword').value = '';
  document.getElementById('usersFormPassword').required = true;
  document.getElementById('usersFormPassword').placeholder = 'Minimum 6 characters';
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
  const u = usersData.find(x => x.username === username);
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
    errEl.style.display = 'none';
    succEl.style.display = 'none';

    try {
      if (isEdit) {
        const body = { shell, groups, sudo, panelRole: createPanel ? 'user' : null, email };
        if (password) body.password = password;
        await API.users.update(username, body);
        if (createPanel !== undefined) body.createPanel = createPanel;
      } else {
        if (!password || password.length < 6) {
          throw new Error('Password must be at least 6 characters');
        }
        if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
          throw new Error('Invalid username. Use letters, numbers, dots, hyphens, underscores.');
        }
        await API.users.create({ username, password, shell, groups, sudo, createPanel, email });
      }
      succEl.textContent = isEdit ? 'User updated successfully' : 'User created successfully';
      succEl.style.display = 'block';
      setTimeout(() => { closeUsersForm(); loadUsers(); }, 1000);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
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
});

async function deleteUser(username) {
  if (!confirm('Delete VPS user "' + username + '"? This will remove their system account, home directory, sudo rules, and panel access.')) return;
  try {
    await API.users.del(username);
    await loadUsers();
  } catch (err) {
    alert(err.message);
  }
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
