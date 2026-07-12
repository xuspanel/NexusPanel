let cronState = { owner: 'root', entries: [], owners: [] };
window.initCron = async function () {
  var me = await API.me();
  if (me.role !== 'admin') return;
  loadCron();
};
async function loadCron() {
  try {
    cronState.owners = await API.cron.getOwners();
    if (!cronState.owners.length) cronState.owners = ['root'];
    if (!cronState.owners.includes(cronState.owner)) cronState.owner = cronState.owners[0] || 'root';
    cronState.entries = await API.cron.list(cronState.owner);
    renderCron();
  } catch {}
}
function esc(s) { if(!s) return ''; return String(s).replace(/[&<>]/g, function(c){ return '&#'+c.charCodeAt(0)+';'; }); }
function renderCron() {
  var owner = document.getElementById('cronOwnerSel');
  if (owner) owner.innerHTML = cronState.owners.map(function(o) { return '<option value="' + o + '" ' + (o === cronState.owner ? 'selected' : '') + '>' + o + '</option>'; }).join('');
  var el = document.getElementById('cronList');
  if (!cronState.entries.length) { el.innerHTML = '<div class="db-empty">No cron jobs for ' + esc(cronState.owner) + '</div>'; return; }
  el.innerHTML = cronState.entries.map(function(e, i) {
    return '<div class="cron-entry">'
      + '<span class="cron-schedule">' + esc(e.minute + ' ' + e.hour + ' ' + e.dom + ' ' + e.month + ' ' + e.dow) + '</span>'
      + '<span class="cron-cmd">' + esc(e.command) + '</span>'
      + '<div class="cron-actions">'
      + '<button class="fm-btn fm-btn-sm" onclick="cronEdit(' + i + ')">✎</button>'
      + '<button class="fm-btn fm-btn-sm fm-btn-danger" onclick="cronDelete(' + i + ')">🗑</button>'
      + '</div></div>';
  }).join('');
}
async function cronOwnerChange() {
  cronState.owner = document.getElementById('cronOwnerSel').value;
  cronState.entries = await API.cron.list(cronState.owner);
  renderCron();
}
function cronAddForm() {
  document.getElementById('cronModalOverlay').style.display = 'flex';
  document.getElementById('cronModalTitle').textContent = 'Add Cron Job';
  document.getElementById('cronEditIndex').value = '-1';
  document.getElementById('cronMinute').value = '*';
  document.getElementById('cronHour').value = '*';
  document.getElementById('cronDom').value = '*';
  document.getElementById('cronMonth').value = '*';
  document.getElementById('cronDow').value = '*';
  document.getElementById('cronCommand').value = '';
}
function cronEdit(idx) {
  var e = cronState.entries[idx];
  if (!e) return;
  document.getElementById('cronModalOverlay').style.display = 'flex';
  document.getElementById('cronModalTitle').textContent = 'Edit Cron Job';
  document.getElementById('cronEditIndex').value = idx;
  document.getElementById('cronMinute').value = e.minute;
  document.getElementById('cronHour').value = e.hour;
  document.getElementById('cronDom').value = e.dom;
  document.getElementById('cronMonth').value = e.month;
  document.getElementById('cronDow').value = e.dow;
  document.getElementById('cronCommand').value = e.command;
}
async function cronSave() {
  var idx = parseInt(document.getElementById('cronEditIndex').value);
  var entry = {
    minute: document.getElementById('cronMinute').value.trim() || '*',
    hour: document.getElementById('cronHour').value.trim() || '*',
    dom: document.getElementById('cronDom').value.trim() || '*',
    month: document.getElementById('cronMonth').value.trim() || '*',
    dow: document.getElementById('cronDow').value.trim() || '*',
    command: document.getElementById('cronCommand').value.trim(),
  };
  try {
    if (idx < 0) await API.cron.add(cronState.owner, entry);
    else await API.cron.update(cronState.owner, idx, entry);
    document.getElementById('cronModalOverlay').style.display = 'none';
    loadCron();
  } catch (e) { alert(e.message); }
}
async function cronDelete(idx) {
  if (!confirm('Delete this cron job?')) return;
  try { await API.cron.del(cronState.owner, idx); loadCron(); } catch(e) { alert(e.message); }
}
