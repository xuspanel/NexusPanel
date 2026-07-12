let svcState = { services: [], filter: '', loading: false };
window.initServices = async function () {
  var me = await API.me();
  if (me.role !== 'admin') return;
  loadServices();
};
async function loadServices() {
  try {
    svcState.services = await API.services.list();
    renderServices();
  } catch {}
}
function esc(s) { if(!s) return ''; return String(s).replace(/[&<>]/g, function(c){ return '&#'+c.charCodeAt(0)+';'; }); }
function renderServices() {
  var el = document.getElementById('svcList');
  var f = (document.getElementById('svcFilter')?.value || '').toLowerCase();
  var filtered = svcState.services.filter(function(s) {
    return !f || s.name.toLowerCase().includes(f) || s.description.toLowerCase().includes(f);
  });
  if (!filtered.length) { el.innerHTML = '<div class="db-empty">No services found</div>'; return; }
  el.innerHTML = filtered.map(function(s) {
    var activeCls = s.active === 'active' ? 'running' : s.active === 'failed' ? 'stopped' : 'paused';
    return '<div class="svc-row">'
      + '<span class="svc-dot ' + activeCls + '"></span>'
      + '<div class="svc-info">'
      + '<span class="svc-name">' + esc(s.name) + '</span>'
      + '<span class="svc-desc">' + esc(s.description) + '</span>'
      + '</div>'
      + '<span class="svc-state ' + activeCls + '">' + esc(s.sub || s.active) + '</span>'
      + '<div class="svc-actions">'
      + (s.active === 'active' ? '<button class="fm-btn fm-btn-sm" onclick="svcAction(\'' + esc(s.name) + '\',\'stop\')">⏹</button><button class="fm-btn fm-btn-sm" onclick="svcAction(\'' + esc(s.name) + '\',\'restart\')">🔄</button>' : '')
      + (s.active !== 'active' ? '<button class="fm-btn fm-btn-sm" onclick="svcAction(\'' + esc(s.name) + '\',\'start\')">▶</button>' : '')
      + '<button class="fm-btn fm-btn-sm" onclick="svcStatus(\'' + esc(s.name) + '\')">📋</button>'
      + '</div></div>';
  }).join('');
}
async function svcAction(name, act) {
  try { await API.services.action(name, act); loadServices(); } catch(e) { alert(e.message); }
}
async function svcStatus(name) {
  try { var d = await API.services.status(name); alert(d.output || 'No status output'); } catch(e) { alert(e.message); }
}
function svcFilter() { renderServices(); }
