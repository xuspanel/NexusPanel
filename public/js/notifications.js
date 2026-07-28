(function () {
  var state = { entries: [], unread: 0, open: false };

  function $(id) { return document.getElementById(id); }

  async function loadNotifCount() {
    try {
      var d = await API.notifications.list(true);
      state.unread = d.unread || 0;
      updateBadge();
    } catch {}
  }

  function updateBadge() {
    var b = $('notifBadge');
    if (!b) return;
    b.textContent = state.unread || '';
    b.style.display = state.unread ? 'flex' : 'none';
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/[&<>]/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
  }

  function renderNotifs() {
    var el = $('notifList');
    if (!el) return;
    if (!state.entries.length) {
      el.innerHTML = '<div class="notif-empty">No notifications</div>';
      return;
    }
    el.innerHTML = state.entries.map(function (n) {
      var icon = n.type === 'warning' ? '⚠' : n.type === 'error' ? '🔴' : n.type === 'success' ? '✅' : 'ℹ';
      return '<div class="notif-item' + (n.read ? '' : ' unread') + '" data-notif-id="' + esc(n.id) + '">'
        + '<span class="notif-icon">' + icon + '</span>'
        + '<div class="notif-body"><span class="notif-title">' + esc(n.title) + '</span>'
        + '<span class="notif-msg">' + esc(n.message) + '</span></div>'
        + '</div>';
    }).join('');
  }

  async function toggleNotifPanel() {
    state.open = !state.open;
    var panel = $('notifPanel');
    if (state.open) {
      var d = await API.notifications.list(false);
      state.entries = d.entries || [];
      panel.style.display = 'block';
      renderNotifs();
    } else {
      panel.style.display = 'none';
    }
  }

  async function markRead(id) {
    try {
      await API.notifications.markRead(id);
      state.unread = Math.max(0, state.unread - 1);
      updateBadge();
    } catch {}
  }

  async function markAllRead() {
    try {
      await API.notifications.markAllRead();
      state.unread = 0;
      updateBadge();
      loadNotifCount();
    } catch {}
  }

  document.addEventListener('DOMContentLoaded', function () {
    loadNotifCount();
    setInterval(loadNotifCount, 30000);

    var bell = $('notifBell');
    if (bell) bell.addEventListener('click', toggleNotifPanel);

    var markAll = $('notifMarkAllBtn');
    if (markAll) markAll.addEventListener('click', markAllRead);

    var list = $('notifList');
    if (list) {
      list.addEventListener('click', function (e) {
        var item = e.target.closest('[data-notif-id]');
        if (item) markRead(item.getAttribute('data-notif-id'));
      });
    }

    document.addEventListener('click', function (e) {
      if (state.open && !e.target.closest('.notif-bell-wrap')) {
        state.open = false;
        var panel = $('notifPanel');
        if (panel) panel.style.display = 'none';
      }
    });
  });
})();
