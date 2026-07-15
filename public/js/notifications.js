let nState = { entries: [], unread: 0, open: false };
window.initNotifications = async function () { loadNotifCount(); setInterval(loadNotifCount, 30000); };
async function loadNotifCount() {
  try { var d = await API.notifications.list(true); nState.unread = d.unread || 0; updateBadge(); } catch {}
}
function updateBadge() {
  var b = document.getElementById('notifBadge');
  if (!b) return;
  b.textContent = nState.unread || '';
  b.style.display = nState.unread ? 'flex' : 'none';
}
async function toggleNotifPanel() {
  nState.open = !nState.open;
  var panel = document.getElementById('notifPanel');
  if (nState.open) {
    var d = await API.notifications.list(false);
    nState.entries = d.entries || [];
    panel.style.display = 'block';
    renderNotifs();
  } else {
    panel.style.display = 'none';
  }
}
function esc(s) { if(!s) return ''; return String(s).replace(/[&<>]/g, function(c){ return '&#'+c.charCodeAt(0)+';'; }); }
function renderNotifs() {
  var el = document.getElementById('notifList');
  if (!nState.entries.length) { el.innerHTML = '<div class="notif-empty">No notifications</div>'; return; }
  el.innerHTML = nState.entries.map(function(n) {
    var icon = n.type === 'warning' ? '⚠' : n.type === 'error' ? '🔴' : n.type === 'success' ? '✅' : 'ℹ';
    return '<div class="notif-item' + (n.read ? '' : ' unread') + '" onclick="notifMarkRead(\'' + n.id + '\')">'
      + '<span class="notif-icon">' + icon + '</span>'
      + '<div class="notif-body"><span class="notif-title">' + esc(n.title) + '</span>'
      + '<span class="notif-msg">' + esc(n.message) + '</span></div>'
      + '</div>';
  }).join('');
}
async function notifMarkRead(id) {
  try { await API.notifications.markRead(id); nState.unread = Math.max(0, nState.unread - 1); updateBadge(); } catch {}
}
async function notifMarkAllRead() {
  try { await API.notifications.markAllRead(); nState.unread = 0; updateBadge(); loadNotifCount(); } catch {}
}
