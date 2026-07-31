const SERVER = window.location.hostname;
let emailInit = false;
let _state = {
  view: 'list',
  selectedUser: null,
  selectedFolder: 'INBOX',
  selectedMessageId: null,
  messages: [],
  folders: [],
  composeAttachments: [],
  page: 1,
  limit: 20,
  totalMessages: 0,
  totalPages: 0,
};

async function initEmails() {
  if (!emailInit) {
    emailInit = true;
    document.getElementById('emailCreateBtn').setAttribute('aria-label', 'Create email account');
    document.getElementById('emailRefreshBtn').setAttribute('aria-label', 'Refresh email accounts');
    document.getElementById('emailRetryBtn').setAttribute('aria-label', 'Retry loading');
    document.getElementById('emailRefreshBtn').addEventListener('click', loadEmails);
    document.getElementById('emailRetryBtn').addEventListener('click', loadEmails);
    document.getElementById('emailSearchInput').addEventListener('input', debounce(filterEmailList, 250));
    document.getElementById('emailCreateBtn').addEventListener('click', openCreateModal);
    document.getElementById('emailCreateClose').addEventListener('click', closeCreateModal);
    document.getElementById('emailCreateCancel').addEventListener('click', closeCreateModal);
    document.getElementById('emailCreateModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeCreateModal(); });
    document.getElementById('emailPwdToggle').addEventListener('click', togglePassword);
    document.getElementById('emailCreateForm').addEventListener('submit', submitCreate);
    document.querySelectorAll('input[name="quota"]').forEach(r => {
      r.addEventListener('change', () => {
        document.getElementById('emailQuotaCustom').style.display = r.value === 'custom' ? 'flex' : 'none';
      });
    });

    document.getElementById('ecBackBtn').setAttribute('aria-label', 'Back to email accounts');
    document.getElementById('ecComposeBtn').setAttribute('aria-label', 'Compose new message');
    document.getElementById('ecRefreshBtn').setAttribute('aria-label', 'Refresh messages');
    document.getElementById('ecRetryBtn').setAttribute('aria-label', 'Retry loading messages');
    document.getElementById('ecBackBtn').addEventListener('click', backToAccounts);
    document.getElementById('ecComposeBtn').addEventListener('click', openCompose);
    document.getElementById('ecComposeCancel').addEventListener('click', closeCompose);
    document.getElementById('ecComposeForm').addEventListener('submit', submitSend);
    document.getElementById('ecRefreshBtn').addEventListener('click', refreshFolder);
    document.getElementById('ecRetryBtn').addEventListener('click', refreshFolder);
    document.getElementById('ecSearchInput').setAttribute('aria-label', 'Search messages');
    document.getElementById('ecSearchInput').addEventListener('input', debounce(filterMessages, 250));
    document.getElementById('ecMsgBackBtn').addEventListener('click', showMessageList);
    document.getElementById('ecMsgDeleteBtn').addEventListener('click', deleteCurrentMessage);
    document.getElementById('ecMsgReplyBtn').addEventListener('click', openReply);
    document.getElementById('ecMsgReplyAllBtn').addEventListener('click', openReplyAll);
    document.getElementById('ecMsgForwardBtn').addEventListener('click', openForward);
    document.getElementById('ecAttachBtn').addEventListener('click', () => document.getElementById('ecAttachInput').click());
    document.getElementById('ecAttachInput').addEventListener('change', handleAttachFiles);
    document.getElementById('ecToggleCcBcc').addEventListener('click', toggleCcBcc);
    document.getElementById('ecMsgNotSpamBtn').addEventListener('click', moveToInbox);

    document.querySelectorAll('.ec-nav-item').forEach(item => {
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-selected', item.dataset.folder === 'INBOX' ? 'true' : 'false');
      item.addEventListener('click', () => switchFolder(item.dataset.folder));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (document.getElementById('ecComposeView').style.display !== 'none') closeCompose();
        else if (document.getElementById('ecMessageView').style.display !== 'none') showMessageList();
        else if (document.getElementById('emailCreateModal').style.display !== 'none') closeCreateModal();
        else backToAccounts();
      }
    });
  }
  await loadEmails();
}

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function escHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h';
  const days = Math.floor(hours / 24);
  if (days < 7) return days + 'd';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

let _allAccounts = [];
let _domains = [];

/* ─── Account List ─── */

async function loadEmails() {
  showLoading();
  try {
    _allAccounts = await API.emails.list();
    renderAccountList(_allAccounts);
    const total = _allAccounts.length;
    const withMail = _allAccounts.filter(a => a.hasMaildir).length;
    document.getElementById('emailBreadcrumb').textContent = total + ' account' + (total !== 1 ? 's' : '') + (withMail > 0 ? ' — ' + withMail + ' with mail' : '');
    showContent();
  } catch (err) {
    showError(err.message);
  }
}

function filterEmailList() { renderAccountList(_allAccounts); }

function renderAccountList(accounts) {
  const grid = document.getElementById('emailGrid');
  const search = document.getElementById('emailSearchInput').value.toLowerCase();
  const filtered = search ? accounts.filter(a => a.email.toLowerCase().includes(search) || a.username.toLowerCase().includes(search) || (a.name && a.name.toLowerCase().includes(search))) : accounts;
  if (filtered.length === 0) {
    grid.innerHTML = '<div class="db-empty">' + (search ? 'No accounts match your search' : 'No email accounts found') + '</div>';
    return;
  }
  grid.innerHTML = filtered.map(a => {
    const initial = a.username.charAt(0).toUpperCase();
    const statusDot = a.hasMaildir ? '<span class="email-status-dot email-status-active" title="Active mailbox"></span>' : '<span class="email-status-dot email-status-inactive" title="No mailbox yet"></span>';
    const domain = a.email.split('@')[1] || window.location.hostname;
    const safeUser = escHtml(a.username);
    const safeName = escHtml(a.name !== a.username ? a.name : a.username);
    const safeEmail = escHtml(a.email);
    const safeHome = escHtml(a.home);
    const safeDomain = escHtml(domain);
    return `<div class="email-card" data-username="${safeUser}">
      <div class="email-card-glow"></div>
      <div class="email-card-top">
        <div class="email-avatar" style="background:${avatarColor(a.username)}">${initial}</div>
        <div class="email-card-info">
          <div class="email-card-name">${statusDot}<span>${safeName}</span></div>
          <div class="email-card-address">${safeEmail}</div>
        </div>
        <div class="email-card-actions">
          <button class="email-action-btn" data-email="${safeEmail}" title="Copy address" aria-label="Copy email address">📋</button>
          ${a.hasMaildir ? `<button class="email-action-btn email-config-btn" title="Email configuration" aria-label="Show email configuration">⚙️</button>` : ''}
        </div>
      </div>
      <div class="email-card-body"><div class="email-stat-row">
        <div class="email-stat"><span class="email-stat-value">${a.hasMaildir ? a.messageCount : '—'}</span><span class="email-stat-label">messages</span></div>
        <div class="email-stat"><span class="email-stat-value">${a.hasMaildir ? a.folderCount : '—'}</span><span class="email-stat-label">folders</span></div>
        <div class="email-stat"><span class="email-stat-value">${a.hasMaildir ? a.diskUsage : '—'}</span><span class="email-stat-label">disk</span></div>
        <div class="email-stat"><span class="email-stat-value">${a.canLogin ? '✓' : '✗'}</span><span class="email-stat-label">login</span></div>
      </div></div>
      <div class="email-card-footer">
        <span class="email-footer-item" title="Home directory">📁 ${safeHome}</span>
        <span class="email-footer-item" title="Disk usage">💾 ${a.hasMaildir ? a.diskUsage : '0 B'}</span>
      </div>
      ${a.hasMaildir ? `
      <div class="email-config-panel" style="display:none;">
        <div class="email-config-title">📧 Email Configuration</div>
        <table class="email-config-table">
          <tr><td class="ecfg-label">Server</td><td class="ecfg-value">${safeDomain}</td></tr>
          <tr><td class="ecfg-label">Username</td><td class="ecfg-value ecfg-highlight">${safeEmail}</td></tr>
          <tr><td class="ecfg-label">Password</td><td class="ecfg-value">Your account password</td></tr>
          <tr><td colspan="2" class="ecfg-section">📩 Incoming (IMAP)</td></tr>
          <tr><td class="ecfg-label">Server</td><td class="ecfg-value ecfg-mono">${safeDomain}</td></tr>
          <tr><td class="ecfg-label">Port</td><td class="ecfg-value ecfg-mono">993</td></tr>
          <tr><td class="ecfg-label">Security</td><td class="ecfg-value">SSL/TLS</td></tr>
          <tr><td class="ecfg-label">Auth</td><td class="ecfg-value">Normal password</td></tr>
          <tr><td colspan="2" class="ecfg-section">📩 Incoming (POP3)</td></tr>
          <tr><td class="ecfg-label">Server</td><td class="ecfg-value ecfg-mono">${safeDomain}</td></tr>
          <tr><td class="ecfg-label">Port</td><td class="ecfg-value ecfg-mono">995</td></tr>
          <tr><td class="ecfg-label">Security</td><td class="ecfg-value">SSL/TLS</td></tr>
          <tr><td class="ecfg-label">Auth</td><td class="ecfg-value">Normal password</td></tr>
          <tr><td colspan="2" class="ecfg-section">📤 Outgoing (SMTP)</td></tr>
          <tr><td class="ecfg-label">Server</td><td class="ecfg-value ecfg-mono">${safeDomain}</td></tr>
          <tr><td class="ecfg-label">Port</td><td class="ecfg-value ecfg-mono">587</td></tr>
          <tr><td class="ecfg-label">Security</td><td class="ecfg-value">STARTTLS</td></tr>
          <tr><td class="ecfg-label">Auth</td><td class="ecfg-value">Normal password</td></tr>
          <tr><td colspan="2" class="ecfg-section-alt">Alternative SMTP</td></tr>
          <tr><td class="ecfg-label">Port</td><td class="ecfg-value ecfg-mono">465</td></tr>
          <tr><td class="ecfg-label">Security</td><td class="ecfg-value">SSL/TLS</td></tr>
        </table>
      </div>
      <div class="email-card-inbox-btn" data-username="${safeUser}" role="button" tabindex="0" aria-label="Open email client for ${safeEmail}"><span class="inbox-btn-icon" aria-hidden="true">📥</span><span class="inbox-btn-label">Open Email Client</span><span class="inbox-btn-arrow" aria-hidden="true">→</span></div>
      ` : ''}
    </div>`;
  }).join('');
  grid.querySelectorAll('.email-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(btn.dataset.email).then(() => { btn.textContent = '✓'; setTimeout(() => { btn.textContent = '📋'; }, 1500); });
    });
  });
  grid.querySelectorAll('.email-card-inbox-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openEmailClient(btn.dataset.username); });
  });
  grid.querySelectorAll('.email-config-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.email-card');
      const panel = card.querySelector('.email-config-panel');
      const isOpen = panel.style.display !== 'none';
      panel.style.display = isOpen ? 'none' : '';
      btn.style.opacity = isOpen ? '' : '1';
    });
  });
}

/* ─── Email Client ─── */

async function openEmailClient(username) {
  _state.selectedUser = username;
  _state.selectedFolder = 'INBOX';
  _state.view = 'client';
  document.getElementById('emailContent').style.display = 'none';
  document.getElementById('emailClientView').style.display = 'flex';
  await loadFolders();
  await loadMessages();
  await loadQuota();
}

async function loadFolders() {
  try {
    _state.folders = await API.emails.folders(_state.selectedUser);
    _state.folders.forEach(f => {
      const badge = document.getElementById('ecBadge' + f.name);
      if (badge) {
        badge.textContent = f.unread || '';
        badge.setAttribute('data-count', f.unread);
        badge.style.display = f.unread > 0 ? 'inline-block' : 'none';
      }
    });
  } catch (e) { /* folder badges just won't show */ }
}

async function loadMessages() {
  document.getElementById('ecLoading').style.display = 'flex';
  document.getElementById('ecMessageList').style.display = 'none';
  document.getElementById('ecMessageView').style.display = 'none';
  document.getElementById('ecComposeView').style.display = 'none';
  document.getElementById('ecError').style.display = 'none';
  const searchQuery = document.getElementById('ecSearchInput').value.trim();
  try {
    const res = await API.emails.inbox(_state.selectedUser, _state.selectedFolder, _state.page, _state.limit, searchQuery || undefined);
    _state.messages = res.messages || res;
    _state.totalMessages = res.total || _state.messages.length;
    _state.totalPages = res.totalPages || 1;
    renderMessageList(_state.messages);
    const folderName = _state.selectedFolder === 'INBOX' ? 'Inbox' : _state.selectedFolder;
    const unread = _state.messages.filter(m => m.unread).length;
    document.getElementById('ecFolderName').textContent = folderName;
    document.getElementById('ecFolderCount').textContent = _state.totalMessages + ' message' + (_state.totalMessages !== 1 ? 's' : '') + (unread > 0 ? ', ' + unread + ' unread' : '');
    document.getElementById('ecLoading').style.display = 'none';
    document.getElementById('ecMessageList').style.display = 'flex';
  } catch (err) {
    document.getElementById('ecLoading').style.display = 'none';
    document.getElementById('ecError').style.display = 'flex';
    document.getElementById('ecErrorText').textContent = err.message;
  }
}

function refreshFolder() {
  _state.page = 1;
  if (_state.selectedUser) { loadMessages(); loadFolders(); }
}

function switchFolder(folder) {
  _state.selectedFolder = folder;
  _state.selectedMessageId = null;
  _state.page = 1;
  document.querySelectorAll('.ec-nav-item').forEach(i => {
    i.classList.toggle('ec-nav-active', i.dataset.folder === folder);
    i.setAttribute('aria-selected', i.dataset.folder === folder ? 'true' : 'false');
  });
  loadMessages();
  loadQuota();
}

function filterMessages() {
  _state.page = 1;
  loadMessages();
}

function renderMessageList(messages) {
  const list = document.getElementById('ecMessageList');
  const search = document.getElementById('ecSearchInput').value.toLowerCase();
  const filtered = search ? messages.filter(m =>
    (m.subject && m.subject.toLowerCase().includes(search)) ||
    (m.from && m.from.name && m.from.name.toLowerCase().includes(search)) ||
    (m.from && m.from.address && m.from.address.toLowerCase().includes(search)) ||
    (m.snippet && m.snippet.toLowerCase().includes(search))
  ) : messages;
  if (filtered.length === 0) {
    list.innerHTML = renderBulkBar() + '<div class="db-empty">' + (search ? 'No messages match your search' : 'This folder is empty') + '</div>';
    return;
  }
  let html = renderBulkBar();
  html += filtered.map(m => {
    const initial = m.from && m.from.name ? m.from.name.charAt(0).toUpperCase() : (m.from && m.from.address ? m.from.address.charAt(0).toUpperCase() : '?');
    const senderName = m.from && m.from.name ? m.from.name : (m.from && m.from.address ? m.from.address : 'Unknown');
    const senderAddr = m.from && m.from.address ? m.from.address : '';
    const attachIcon = m.hasAttachments ? ' <span class="msg-attach-icon">📎</span>' : '';
    return `<div class="msg-row ${m.unread ? 'msg-unread' : ''}" data-id="${m.id}">
      <div class="msg-row-check"><input type="checkbox" class="msg-checkbox" data-id="${m.id}" aria-label="Select message"></div>
      <div class="msg-row-left"><div class="msg-avatar" style="background:${avatarColor(senderAddr || senderName)}">${initial}</div></div>
      <div class="msg-row-body">
        <div class="msg-row-top"><span class="msg-sender">${escHtml(senderName)}</span><span class="msg-date">${timeAgo(m.date)}</span></div>
        <div class="msg-subject">${escHtml(m.subject)}${attachIcon}</div>
        <div class="msg-snippet">${escHtml(m.snippet)}</div>
      </div>
      ${m.unread ? '<div class="msg-unread-dot"></div>' : ''}
    </div>`;
  }).join('');
  html += renderPagination();
  list.innerHTML = html;
  list.querySelectorAll('.msg-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.msg-row-check')) return;
      openMessage(row.dataset.id);
    });
  });
  list.querySelectorAll('.msg-checkbox').forEach(cb => {
    cb.addEventListener('change', updateBulkBar);
  });
  list.querySelectorAll('.ec-page-btn').forEach(btn => {
    btn.addEventListener('click', () => goToPage(parseInt(btn.dataset.page, 10)));
  });
  setupBulkActions();
}

function renderBulkBar() {
  return `<div class="ec-bulk-bar" id="ecBulkBar" style="display:none;">
    <input type="checkbox" id="ecBulkSelectAll" aria-label="Select all messages">
    <span><span class="ec-bulk-count" id="ecBulkCount">0</span> selected</span>
    <div class="ec-bulk-actions">
      <button class="ec-bulk-btn" id="ecBulkDelete" aria-label="Delete selected messages">🗑️ Delete</button>
      <button class="ec-bulk-btn ec-bulk-btn-danger" id="ecBulkTrash" aria-label="Move selected to trash">📥 Trash</button>
    </div>
  </div>`;
}

function setupBulkActions() {
  const selectAll = document.getElementById('ecBulkSelectAll');
  if (selectAll) {
    selectAll.addEventListener('change', () => {
      document.querySelectorAll('.msg-checkbox').forEach(cb => cb.checked = selectAll.checked);
      updateBulkBar();
    });
  }
  const deleteBtn = document.getElementById('ecBulkDelete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const ids = getSelectedIds();
      if (ids.length === 0 || !confirm('Permanently delete ' + ids.length + ' message(s)?')) return;
      try {
        for (const id of ids) {
          await API.emails.delete(_state.selectedUser, { messageId: id, folder: _state.selectedFolder });
        }
        loadMessages();
        loadFolders();
        loadQuota();
      } catch (err) {
        alert('Bulk delete failed: ' + err.message);
      }
    });
  }
  const trashBtn = document.getElementById('ecBulkTrash');
  if (trashBtn) {
    trashBtn.addEventListener('click', async () => {
      const ids = getSelectedIds();
      if (ids.length === 0 || !confirm('Move ' + ids.length + ' message(s) to Trash?')) return;
      try {
        for (const id of ids) {
          await API.emails.delete(_state.selectedUser, { messageId: id, folder: _state.selectedFolder });
        }
        loadMessages();
        loadFolders();
        loadQuota();
      } catch (err) {
        alert('Bulk move to trash failed: ' + err.message);
      }
    });
  }
}

function getSelectedIds() {
  return Array.from(document.querySelectorAll('.msg-checkbox:checked')).map(cb => cb.dataset.id);
}

function updateBulkBar() {
  const bar = document.getElementById('ecBulkBar');
  const count = document.getElementById('ecBulkCount');
  const checked = document.querySelectorAll('.msg-checkbox:checked').length;
  if (checked > 0) {
    bar.style.display = 'flex';
    count.textContent = checked;
  } else {
    bar.style.display = 'none';
  }
}

function renderPagination() {
  const { page, totalPages, totalMessages, limit } = _state;
  if (totalPages <= 1) return '';
  const range = 3;
  let pages = [];
  for (let i = Math.max(1, page - range); i <= Math.min(totalPages, page + range); i++) {
    pages.push(i);
  }
  let html = '<div class="ec-pagination">';
  html += '<span class="ec-page-info">' + ((page - 1) * limit + 1) + '–' + Math.min(page * limit, totalMessages) + ' of ' + totalMessages + '</span>';
  html += '<div class="ec-page-btns">';
  if (page > 1) html += '<button class="ec-page-btn" data-page="' + (page - 1) + '">‹ Prev</button>';
  for (const p of pages) {
    html += '<button class="ec-page-btn' + (p === page ? ' ec-page-active' : '') + '" data-page="' + p + '">' + p + '</button>';
  }
  if (page < totalPages) html += '<button class="ec-page-btn" data-page="' + (page + 1) + '">Next ›</button>';
  html += '</div></div>';
  return html;
}

function goToPage(p) {
  if (p < 1 || p > _state.totalPages) return;
  _state.page = p;
  loadMessages();
}

/* ─── Message Reader ─── */

async function openMessage(msgId) {
  _state.selectedMessageId = msgId;
  document.getElementById('ecMessageList').style.display = 'none';
  document.getElementById('ecMessageView').style.display = 'flex';
  document.getElementById('ecComposeView').style.display = 'none';
  document.getElementById('ecMsgEnvelope').innerHTML = '<div class="db-loading" style="display:flex;"><div class="db-loading-spinner"></div></div>';
  document.getElementById('ecMsgBody').innerHTML = '';
  document.getElementById('ecMsgAttachments').style.display = 'none';

  const isTrash = _state.selectedFolder === 'Trash';
  const isSpam = _state.selectedFolder === 'Spam';
  const deleteBtn = document.getElementById('ecMsgDeleteBtn');
  const notSpamBtn = document.getElementById('ecMsgNotSpamBtn');
  deleteBtn.textContent = isTrash ? '🗑️ Delete Permanently' : '🗑️ Delete';
  deleteBtn.title = isTrash ? 'Permanently delete' : 'Move to Trash';
  if (notSpamBtn) notSpamBtn.style.display = isSpam ? '' : 'none';

  try {
    const msg = await API.emails.message(_state.selectedUser, msgId, _state.selectedFolder);
    renderMessage(msg);
  } catch (err) {
    document.getElementById('ecMsgEnvelope').innerHTML = '<div class="db-error" style="display:flex;">⚠️ <span>' + escHtml(err.message) + '</span></div>';
  }
}

function renderMessage(msg) {
  _currentMsg = msg;
  const fromName = msg.from && msg.from.name ? msg.from.name : (msg.from && msg.from.address ? msg.from.address : 'Unknown');
  const fromAddr = msg.from && msg.from.address ? '&lt;' + escHtml(msg.from.address) + '&gt;' : '';
  const toName = msg.to && msg.to.name ? msg.to.name : (msg.to && msg.to.address ? msg.to.address : '');
  const toAddr = msg.to && msg.to.address ? '&lt;' + escHtml(msg.to.address) + '&gt;' : '';
  const dateStr = msg.date ? new Date(msg.date).toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : '';

  let bodyHtml = '';
  if (msg.htmlBody) bodyHtml = renderSafeHtml(msg.htmlBody);
  else if (msg.textBody) bodyHtml = '<pre class="msg-text-body">' + escHtml(msg.textBody) + '</pre>';
  else bodyHtml = '<div class="db-empty">No content</div>';

  document.getElementById('ecMsgEnvelope').innerHTML = `
    <div class="msg-envelope-avatar" style="background:${avatarColor(fromAddr || fromName)}">${fromName.charAt(0).toUpperCase()}</div>
    <div class="msg-envelope-info">
      <div class="msg-envelope-subject">${escHtml(msg.subject)}</div>
      <div class="msg-envelope-details">
        <div class="msg-envelope-from"><span class="msg-envelope-label">From</span><span class="msg-envelope-name">${escHtml(fromName)}</span> <span class="msg-envelope-addr">${fromAddr}</span></div>
        <div class="msg-envelope-to"><span class="msg-envelope-label">To</span><span class="msg-envelope-name">${escHtml(toName)}</span> <span class="msg-envelope-addr">${toAddr}</span></div>
        ${msg.cc ? '<div class="msg-envelope-cc"><span class="msg-envelope-label">CC</span><span class="msg-envelope-name">' + escHtml(msg.cc.name || msg.cc.address) + '</span> <span class="msg-envelope-addr">&lt;' + escHtml(msg.cc.address) + '&gt;</span></div>' : ''}
      </div>
      <div class="msg-envelope-date">${escHtml(dateStr)}</div>
    </div>`;
  document.getElementById('ecMsgBody').innerHTML = bodyHtml;

  if (msg.attachments && msg.attachments.length > 0) {
    const attDiv = document.getElementById('ecMsgAttachments');
    attDiv.style.display = 'block';
    attDiv.innerHTML = '<div class="msg-attachments-title">📎 Attachments (' + msg.attachments.length + ')</div><div class="msg-attachments-list">' +
      msg.attachments.map(a => {
        const sizeStr = a.size ? formatBytes(a.size) : '—';
        const isImage = a.contentType && a.contentType.startsWith('image/');
        const icon = isImage ? '🖼️' : '📄';
        return `<div class="msg-attachment">
          <span class="msg-attach-icon" style="margin:0;font-size:20px;">${icon}</span>
          <div class="msg-attach-info"><span class="msg-attach-name">${escHtml(a.filename)}</span><span class="msg-attach-meta">${a.contentType} — ${sizeStr}</span></div>
          ${a.content ? '<button class="msg-attach-dl" data-filename="' + escHtml(a.filename) + '" data-content="' + a.content + '" data-mime="' + a.contentType + '">⬇️ Download</button>' : ''}
        </div>`;
      }).join('') + '</div>';
    attDiv.querySelectorAll('.msg-attach-dl').forEach(btn => {
      btn.addEventListener('click', () => {
        try {
          const binary = atob(btn.dataset.content);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: btn.dataset.mime });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = btn.dataset.filename; a.click();
          URL.revokeObjectURL(url);
        } catch (e) { btn.textContent = '❌ Error'; setTimeout(() => { btn.textContent = '⬇️ Download'; }, 2000); }
      });
    });
  } else {
    document.getElementById('ecMsgAttachments').style.display = 'none';
  }
}

async function deleteCurrentMessage() {
  if (!_state.selectedMessageId || !_state.selectedUser) return;
  const isTrash = _state.selectedFolder === 'Trash';
  if (!confirm(isTrash ? 'Permanently delete this message?' : 'Move this message to Trash?')) return;
  try {
    await API.emails.delete(_state.selectedUser, { messageId: _state.selectedMessageId, folder: _state.selectedFolder, permanent: isTrash || undefined });
    _state.selectedMessageId = null;
    showMessageList();
    loadMessages();
    loadFolders();
    loadQuota();
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

async function moveToInbox() {
  if (!_state.selectedMessageId || !_state.selectedUser) return;
  try {
    await API.emails.move(_state.selectedUser, { messageId: _state.selectedMessageId, fromFolder: _state.selectedFolder, toFolder: 'INBOX' });
    _state.selectedMessageId = null;
    showMessageList();
    loadMessages();
    loadFolders();
    loadQuota();
  } catch (err) {
    alert('Failed to move: ' + err.message);
  }
}

function showMessageList() {
  _state.selectedMessageId = null;
  document.getElementById('ecMessageView').style.display = 'none';
  document.getElementById('ecComposeView').style.display = 'none';
  document.getElementById('ecMessageList').style.display = 'flex';
}

/* ─── Compose ─── */

let _composeFiles = [];
let _currentMsg = null;
let _quill = null;

function initQuill() {
  if (_quill) return;
  const container = document.getElementById('ecComposeBody');
  if (!container || typeof Quill === 'undefined') return;
  _quill = new Quill(container, {
    theme: 'snow',
    modules: {
      toolbar: [
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['blockquote', 'code-block'],
        [{ 'header': [1, 2, 3, false] }],
        ['link'],
        ['clean']
      ]
    },
    placeholder: 'Write your message...',
  });
}

function stripHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || d.innerText || '';
}

function openCompose(prefill) {
  _composeFiles = [];
  if (!prefill) _currentMsg = null;
  document.getElementById('ecComposeError').style.display = 'none';
  document.getElementById('ecComposeAttachList').innerHTML = '';
  document.getElementById('ecComposeStatus').textContent = '';
  document.getElementById('ecComposeSend').querySelector('.btn-text').textContent = 'Send Message';
  document.getElementById('ecComposeSend').querySelector('.btn-text').style.display = '';
  document.getElementById('ecComposeSend').querySelector('.btn-spinner').style.display = 'none';
  document.getElementById('ecComposeSend').disabled = false;
  document.getElementById('ecCcBccFields').style.display = 'none';
  document.getElementById('ecToggleCcBcc').textContent = 'CC/BCC';
  document.getElementById('ecComposeTo').value = '';
  document.getElementById('ecComposeCc').value = '';
  document.getElementById('ecComposeBcc').value = '';
  document.getElementById('ecComposeSubject').value = '';
  document.getElementById('ecMessageList').style.display = 'none';
  document.getElementById('ecMessageView').style.display = 'none';
  document.getElementById('ecComposeView').style.display = 'flex';
  initQuill();
  _quill.setText('');
  if (prefill) {
    if (prefill.to) document.getElementById('ecComposeTo').value = prefill.to;
    if (prefill.cc) { document.getElementById('ecComposeCc').value = prefill.cc; toggleCcBcc(); }
    if (prefill.bcc) { document.getElementById('ecComposeBcc').value = prefill.bcc; if (document.getElementById('ecCcBccFields').style.display === 'none') toggleCcBcc(); }
    if (prefill.subject) document.getElementById('ecComposeSubject').value = prefill.subject;
    if (prefill.body) _quill.root.innerHTML = prefill.body;
  }
  document.getElementById('ecComposeTo').focus();
}

function toggleCcBcc() {
  const container = document.getElementById('ecCcBccFields');
  const toggle = document.getElementById('ecToggleCcBcc');
  const hidden = container.style.display === 'none';
  container.style.display = hidden ? '' : 'none';
  toggle.textContent = hidden ? 'CC/BCC ▲' : 'CC/BCC';
}

function closeCompose() {
  _composeFiles = [];
  document.getElementById('ecComposeView').style.display = 'none';
  if (_state.selectedMessageId) {
    document.getElementById('ecMessageView').style.display = 'flex';
  } else {
    document.getElementById('ecMessageList').style.display = 'flex';
  }
}

function formatQuotedDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getMsgText(msg) {
  if (msg.textBody) return msg.textBody;
  if (msg.htmlBody) return msg.htmlBody.replace(/<style[^>]*>[^<]*<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return '';
}

function getMsgHtml(msg) {
  if (msg.htmlBody) return renderSafeHtml(msg.htmlBody);
  if (msg.textBody) return escHtml(msg.textBody).replace(/\n/g, '<br>');
  return '';
}

function buildReplyBody(msg) {
  const date = formatQuotedDate(msg.date);
  const fromName = msg.from && msg.from.name ? escHtml(msg.from.name) : (msg.from && msg.from.address ? escHtml(msg.from.address) : 'Unknown');
  const html = getMsgHtml(msg);
  return '<br><br><p>On ' + date + ', ' + fromName + ' wrote:</p><blockquote style="border-left:2px solid #ccc;margin:0 0 0 8px;padding:0 0 0 12px;color:#999;">' + html + '</blockquote>';
}

function buildForwardBody(msg) {
  const date = formatQuotedDate(msg.date);
  const fromName = msg.from && msg.from.name ? escHtml(msg.from.name) : (msg.from && msg.from.address ? escHtml(msg.from.address) : 'Unknown');
  const fromAddr = msg.from && msg.from.address ? '&lt;' + escHtml(msg.from.address) + '&gt;' : '';
  const toName = msg.to && msg.to.name ? escHtml(msg.to.name) : (msg.to && msg.to.address ? escHtml(msg.to.address) : '');
  const toAddr = msg.to && msg.to.address ? '&lt;' + escHtml(msg.to.address) + '&gt;' : '';
  const html = getMsgHtml(msg);
  let fwd = '<br><br>';
  fwd += '<div style="border-left:2px solid #666;padding-left:12px;color:#999;">';
  fwd += '<p><strong>Subject:</strong> ' + escHtml(msg.subject || '(No Subject)') + '</p>';
  fwd += '<p><strong>Date:</strong> ' + date + '</p>';
  fwd += '<p><strong>From:</strong> ' + fromName + ' ' + fromAddr + '</p>';
  fwd += '<p><strong>To:</strong> ' + toName + ' ' + toAddr + '</p>';
  if (msg.cc && msg.cc.address) fwd += '<p><strong>CC:</strong> ' + escHtml(msg.cc.name || msg.cc.address) + ' &lt;' + escHtml(msg.cc.address) + '&gt;</p>';
  fwd += '<hr style="border:none;border-top:1px solid #444;">';
  fwd += html;
  fwd += '</div>';
  return fwd;
}

function getReplyTo(msg) {
  if (_state.selectedFolder === 'Sent' && msg.to && msg.to.address) return msg.to.address;
  return msg.from && msg.from.address ? msg.from.address : '';
}

function getReplyAllTo(msg) {
  const addrs = [];
  let ccStr = '';
  if (_state.selectedFolder === 'Sent') {
    if (msg.to && msg.to.address) addrs.push(msg.to.address);
    if (msg.cc && msg.cc.address) ccStr = msg.cc.address;
  } else {
    if (msg.from && msg.from.address) addrs.push(msg.from.address);
    if (msg.cc && msg.cc.address) ccStr = msg.cc.address;
  }
  return { to: addrs.join(', '), cc: ccStr };
}

function openReply() {
  if (!_currentMsg) return;
  const addr = getReplyTo(_currentMsg);
  if (!addr) return;
  const subject = _currentMsg.subject && !_currentMsg.subject.startsWith('Re:') ? 'Re: ' + _currentMsg.subject : _currentMsg.subject;
  openCompose({
    to: addr,
    subject: subject,
    body: buildReplyBody(_currentMsg),
  });
}

function openReplyAll() {
  if (!_currentMsg) return;
  const { to, cc } = getReplyAllTo(_currentMsg);
  if (!to) return;
  const subject = _currentMsg.subject && !_currentMsg.subject.startsWith('Re:') ? 'Re: ' + _currentMsg.subject : _currentMsg.subject;
  openCompose({
    to: to,
    cc: cc || undefined,
    subject: subject,
    body: buildReplyBody(_currentMsg),
  });
}

function openForward() {
  if (!_currentMsg) return;
  const subject = _currentMsg.subject && !_currentMsg.subject.startsWith('Fwd:') ? 'Fwd: ' + _currentMsg.subject : _currentMsg.subject;
  openCompose({
    to: '',
    subject: subject,
    body: buildForwardBody(_currentMsg),
  });
}

function handleAttachFiles(e) {
  const files = e.target.files;
  for (const file of files) {
    _composeFiles.push(file);
    const chip = document.createElement('div');
    chip.className = 'compose-attach-chip';
    chip.innerHTML = `<span>📎 ${escHtml(file.name)} (${formatBytes(file.size)})</span><button type="button" class="compose-attach-remove" data-name="${escHtml(file.name)}">✕</button>`;
    chip.querySelector('.compose-attach-remove').addEventListener('click', () => {
      _composeFiles = _composeFiles.filter(f => f.name !== file.name);
      chip.remove();
    });
    document.getElementById('ecComposeAttachList').appendChild(chip);
  }
  e.target.value = '';
}

async function submitSend(e) {
  e.preventDefault();
  const errEl = document.getElementById('ecComposeError');
  errEl.style.display = 'none';
  document.getElementById('ecComposeStatus').textContent = '';

  const to = document.getElementById('ecComposeTo').value.trim();
  const cc = document.getElementById('ecComposeCc').value.trim();
  const bcc = document.getElementById('ecComposeBcc').value.trim();
  const subject = document.getElementById('ecComposeSubject').value.trim();
  const body = _quill ? _quill.root.innerHTML : '';

  if (!to) { showComposeErr('Recipient (To) is required'); return; }
  if (!subject) { showComposeErr('Subject is required'); return; }

  const btn = document.getElementById('ecComposeSend');
  btn.disabled = true;
  btn.querySelector('.btn-text').style.display = 'none';
  btn.querySelector('.btn-spinner').style.display = 'inline-block';
  document.getElementById('ecComposeStatus').textContent = 'Sending...';

  try {
    const attachments = [];
    for (const file of _composeFiles) {
      const base64 = await fileToBase64(file);
      attachments.push({ filename: file.name, contentType: file.type || 'application/octet-stream', content: base64 });
    }
    await API.emails.send(_state.selectedUser, { to, cc: cc || undefined, bcc: bcc || undefined, subject, body, html: true, attachments: attachments.length > 0 ? attachments : undefined });
    _composeFiles = [];
    document.getElementById('ecComposeStatus').textContent = '✅ Message sent!';
    setTimeout(() => {
      closeCompose();
      if (_state.selectedFolder === 'Sent') loadMessages();
      loadFolders();
      loadQuota();
    }, 800);
  } catch (err) {
    showComposeErr(err.message);
    btn.disabled = false;
    btn.querySelector('.btn-text').style.display = '';
    btn.querySelector('.btn-spinner').style.display = 'none';
    document.getElementById('ecComposeStatus').textContent = '';
  }
}

function showComposeErr(msg) {
  const el = document.getElementById('ecComposeError');
  el.textContent = msg;
  el.style.display = 'block';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ─── Quota ─── */

async function loadQuota() {
  try {
    const q = await API.emails.quota(_state.selectedUser);
    const usedStr = q.usedFormatted || formatBytes(q.used);
    const limitStr = q.limitFormatted || 'Unlimited';
    document.getElementById('ecQuotaText').textContent = usedStr + ' / ' + limitStr;
    document.getElementById('ecQuotaFill').style.width = (q.percentage || 0) + '%';
  } catch (e) {
    document.getElementById('ecQuotaText').textContent = '—';
    document.getElementById('ecQuotaFill').style.width = '0%';
  }
}

/* ─── Navigation ─── */

function backToAccounts() {
  _state.view = 'list';
  _state.selectedUser = null;
  _state.selectedFolder = 'INBOX';
  _state.selectedMessageId = null;
  document.getElementById('emailClientView').style.display = 'none';
  document.getElementById('emailContent').style.display = 'block';
  document.querySelectorAll('.ec-nav-item').forEach(i => {
    i.classList.toggle('ec-nav-active', i.dataset.folder === 'INBOX');
    i.setAttribute('aria-selected', i.dataset.folder === 'INBOX' ? 'true' : 'false');
  });
  loadEmails();
}

/* ─── Create Modal ─── */

async function openCreateModal() {
  document.getElementById('emailCreateForm').reset();
  document.getElementById('emailCreateError').style.display = 'none';
  document.getElementById('emailQuotaCustom').style.display = 'none';
  document.getElementById('emailCreateSubmit').disabled = false;
  document.getElementById('emailCreateSubmit').querySelector('.btn-text').style.display = '';
  document.getElementById('emailCreateSubmit').querySelector('.btn-spinner').style.display = 'none';
  document.getElementById('emailCreateName').focus();
  document.getElementById('emailCreateModal').style.display = 'flex';
  if (_domains.length === 0) {
    try { _domains = await API.emails.domains(); } catch (e) { _domains = ['localhost']; }
  }
  document.getElementById('emailCreateDomain').innerHTML = _domains.map(d => '<option value="' + escHtml(d) + '">' + escHtml(d) + '</option>').join('');
}

function closeCreateModal() { document.getElementById('emailCreateModal').style.display = 'none'; }

function togglePassword() {
  const input = document.getElementById('emailCreatePassword');
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function submitCreate(e) {
  e.preventDefault();
  const errEl = document.getElementById('emailCreateError');
  errEl.style.display = 'none';
  const username = document.getElementById('emailCreateName').value.trim();
  const domain = document.getElementById('emailCreateDomain').value;
  const password = document.getElementById('emailCreatePassword').value;
  const quotaEl = document.querySelector('input[name="quota"]:checked');
  let quota = 'unlimited';
  if (!username || username.length < 2) { showFormError('Please enter an email name (at least 2 characters)'); return; }
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) { showFormError('Email name can only contain letters, numbers, dots, hyphens, and underscores'); return; }
  if (!password || password.length < 6) { showFormError('Password must be at least 6 characters'); return; }
  if (quotaEl && quotaEl.value === 'custom') {
    const qVal = parseFloat(document.getElementById('emailCreateQuota').value);
    const qUnit = document.getElementById('emailQuotaUnit').value;
    if (!qVal || qVal < 1) { showFormError('Please enter a valid quota size'); return; }
    quota = String(Math.round(qUnit === 'GB' ? qVal * 1024 : qVal));
  }
  const btn = document.getElementById('emailCreateSubmit');
  btn.disabled = true;
  btn.querySelector('.btn-text').textContent = 'Creating...';
  btn.querySelector('.btn-text').style.display = 'none';
  btn.querySelector('.btn-spinner').style.display = 'inline-block';
  try {
    await API.emails.create({ username, domain, password, quota: String(quota) });
    closeCreateModal();
    await loadEmails();
  } catch (err) {
    showFormError(err.message);
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Create Account';
    btn.querySelector('.btn-text').style.display = '';
    btn.querySelector('.btn-spinner').style.display = 'none';
  }
}

function showFormError(msg) {
  const el = document.getElementById('emailCreateError');
  el.textContent = msg;
  el.style.display = 'block';
}

/* ─── Helpers ─── */

const _avatarColors = {};
function avatarColor(key) {
  if (_avatarColors[key]) return _avatarColors[key];
  const colors = [
    'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(6,182,212,0.05))',
    'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.05))',
    'linear-gradient(135deg, rgba(234,179,8,0.2), rgba(234,179,8,0.05))',
    'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.05))',
    'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.05))',
    'linear-gradient(135deg, rgba(249,115,22,0.2), rgba(249,115,22,0.05))',
    'linear-gradient(135deg, rgba(236,72,153,0.2), rgba(236,72,153,0.05))',
  ];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash) + key.charCodeAt(i);
  _avatarColors[key] = colors[Math.abs(hash) % colors.length];
  return _avatarColors[key];
}

function renderSafeHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  const allowedTags = new Set(['p','br','b','i','u','strong','em','a','ul','ol','li','h1','h2','h3','h4','h5','h6','blockquote','pre','code','span','div','table','tr','td','th','thead','tbody','img','hr','sub','sup','small','del','ins','mark']);
  const allowedAttrs = new Set(['href','src','alt','title','target','rel','class','width','height','align']);
  function sanitize(el) {
    if (el.nodeType === 3) return;
    if (el.nodeType === 1) {
      if (!allowedTags.has(el.tagName.toLowerCase())) {
        const parent = el.parentNode;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
        return;
      }
      [...el.attributes].forEach(attr => {
        if (!allowedAttrs.has(attr.name)) el.removeAttribute(attr.name);
      });
      if (el.tagName.toLowerCase() === 'a') {
        let href = el.getAttribute('href');
        if (href) {
          href = href.trim();
          if (href.startsWith('javascript:') || href.startsWith('vbscript:') || href.startsWith('data:')) el.removeAttribute('href');
          else if (!href.startsWith('http') && !href.startsWith('mailto') && !href.startsWith('#') && !href.startsWith('/')) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
        }
      }
      if (el.tagName.toLowerCase() === 'img') {
        const src = el.getAttribute('src');
        if (src && (src.startsWith('javascript:') || src.startsWith('vbscript:') || src.startsWith('data:'))) el.removeAttribute('src');
      }
      [...el.childNodes].forEach(sanitize);
    }
  }
  [...div.childNodes].forEach(sanitize);
  return div.innerHTML;
}

function showLoading() {
  document.getElementById('emailLoading').style.display = 'flex';
  document.getElementById('emailContent').style.display = 'none';
  document.getElementById('emailError').style.display = 'none';
}

function showContent() {
  document.getElementById('emailLoading').style.display = 'none';
  document.getElementById('emailContent').style.display = 'block';
  document.getElementById('emailError').style.display = 'none';
}

function showError(msg) {
  document.getElementById('emailLoading').style.display = 'none';
  document.getElementById('emailContent').style.display = 'none';
  document.getElementById('emailError').style.display = 'flex';
  document.getElementById('emailErrorText').textContent = msg;
}

window.initEmails = initEmails;
