let procState = { procs: [], sort: 'cpu' };
window.initProcesses = async function () {
  var me = await API.me();
  if (me.role !== 'admin') return;
  loadProcesses();
  setInterval(loadProcesses, 5000);
};
async function loadProcesses() {
  try { procState.procs = await API.processes.list(); renderProcesses(); } catch {}
}
function esc(s) { if(!s) return ''; return String(s).replace(/[&<>]/g, function(c){ return '&#'+c.charCodeAt(0)+';'; }); }
function formatBytes(kb) { if(kb>1048576) return (kb/1048576).toFixed(2)+'G'; if(kb>1024) return (kb/1024).toFixed(1)+'M'; return kb+'K'; }
function renderProcesses() {
  var el = document.getElementById('procList');
  var procs = procState.procs.slice(0, 50);
  el.innerHTML = '<div class="proc-header"><span class="proc-col pid">PID</span><span class="proc-col user">User</span><span class="proc-col cpu">CPU%</span><span class="proc-col mem">MEM%</span><span class="proc-col cmd">Command</span><span class="proc-col act">Actions</span></div>'
    + procs.map(function(p) {
      return '<div class="proc-row">'
        + '<span class="proc-col pid">' + p.pid + '</span>'
        + '<span class="proc-col user">' + esc(p.user) + '</span>'
        + '<span class="proc-col cpu" style="color:' + (p.cpu>50?'#ef4444':p.cpu>20?'#f59e0b':'var(--text-secondary)') + '">' + p.cpu.toFixed(1) + '</span>'
        + '<span class="proc-col mem" style="color:' + (p.mem>20?'#ef4444':p.mem>10?'#f59e0b':'var(--text-secondary)') + '">' + p.mem.toFixed(1) + '</span>'
        + '<span class="proc-col cmd" title="' + esc(p.command) + '">' + esc(p.command.substring(0, 60)) + '</span>'
        + '<span class="proc-col act"><button class="fm-btn fm-btn-sm fm-btn-danger" onclick="procKill(' + p.pid + ')">🗑</button></span>'
        + '</div>';
    }).join('');
}
async function procKill(pid) {
  if (!confirm('Kill process ' + pid + '?')) return;
  try { await API.processes.kill(pid); loadProcesses(); } catch(e) { alert(e.message); }
}
