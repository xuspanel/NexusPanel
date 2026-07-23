/* Container exec terminal -- standalone xterm-based terminal for docker exec */
/* Depends on xterm.js and xterm-addon-fit loaded via global libs */

var dockerExecTerm = null;
var dockerExecFit = null;
var dockerExecWS = null;
var dockerExecContainerId = null;

function dockerExecOpen(id) {
  var overlay = document.getElementById('dockerExecModal');
  var title = document.getElementById('dockerExecTitle');
  var container = document.getElementById('dockerExecTerminal');
  overlay.style.display = 'flex';
  title.textContent = 'Terminal: ' + id.substring(0, 12);
  dockerExecContainerId = id;

  container.innerHTML = '<div class="docker-exec-picker" id="dockerExecPicker">'
    + '<label>Shell: <select id="dockerExecShell" class="fm-input" style="width:auto">'
    + '<option value="/bin/sh">/bin/sh</option>'
    + '<option value="/bin/bash">/bin/bash</option>'
    + '</select></label>'
    + '<button class="fm-btn fm-btn-primary" id="dockerExecConnectBtn">Connect</button>'
    + '</div>'
    + '<div id="dockerExecXterm" style="display:none;height:400px"></div>'
    + '<div id="dockerExecStatus" class="docker-exec-status"></div>';
}

function dockerExecConnect() {
  if (dockerExecWS) { dockerExecWS.close(); dockerExecWS = null; }

  var shell = document.getElementById('dockerExecShell');
  var cmd = shell ? shell.value : '/bin/sh';
  var id = dockerExecContainerId;
  if (!id) return;

  document.getElementById('dockerExecPicker').style.display = 'none';
  var xtermDiv = document.getElementById('dockerExecXterm');
  xtermDiv.style.display = 'block';
  var statusEl = document.getElementById('dockerExecStatus');

  /* Create xterm */
  if (dockerExecTerm) { try { dockerExecTerm.dispose(); } catch (_) {} dockerExecTerm = null; }

  dockerExecTerm = new Terminal({
    cols: 80, rows: 20,
    cursorBlink: true,
    cursorStyle: 'block',
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
    theme: {
      background: '#0d1117', foreground: '#c9d1d9', cursor: '#c9d1d9',
      selectionBackground: '#264f78',
      black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
      blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
      brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364', brightYellow: '#e3b341',
      brightBlue: '#79c0ff', brightMagenta: '#d2a8ff', brightCyan: '#56d4dd', brightWhite: '#f0f6fc'
    },
    allowTransparency: true
  });

  dockerExecTerm.open(xtermDiv);

  /* Fit addon if available */
  if (typeof FitAddon !== 'undefined') {
    dockerExecFit = new FitAddon.FitAddon();
    dockerExecTerm.loadAddon(dockerExecFit);
    setTimeout(function() { try { dockerExecFit.fit(); } catch (_) {} }, 100);
  }

  dockerExecTerm.focus();
  statusEl.textContent = 'Connecting...';

  /* WebSocket */
  var proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  var wsUrl = proto + '//' + window.location.host + '/ws/docker';
  dockerExecWS = new WebSocket(wsUrl);

  dockerExecWS.onopen = function() {
    statusEl.textContent = 'Connected';
    dockerExecWS.send(JSON.stringify({ type: 'exec', containerId: id, cmd: [cmd] }));
  };

  dockerExecWS.onmessage = function(ev) {
    var msg = JSON.parse(ev.data);
    if (msg.type === 'exec-output' && dockerExecTerm) {
      dockerExecTerm.write(atob(msg.data));
    } else if (msg.type === 'exec-end' && dockerExecTerm) {
      dockerExecTerm.write('\r\n\x1b[1;33m[Process exited]\x1b[0m');
      statusEl.textContent = 'Disconnected';
    } else if (msg.type === 'exec-error' && dockerExecTerm) {
      dockerExecTerm.write('\r\n\x1b[1;31mError: ' + msg.error + '\x1b[0m');
      statusEl.textContent = 'Error';
    }
  };

  dockerExecWS.onerror = function() {
    statusEl.textContent = 'WebSocket error';
  };

  dockerExecWS.onclose = function() {
    statusEl.textContent = 'Disconnected';
    dockerExecWS = null;
  };

  /* Terminal input → WS */
  dockerExecTerm.onData(function(data) {
    if (dockerExecWS && dockerExecWS.readyState === WebSocket.OPEN) {
      dockerExecWS.send(JSON.stringify({ type: 'exec-input', containerId: id, data: btoa(data) }));
    }
  });

  /* Terminal resize → WS */
  dockerExecTerm.onResize(function(dims) {
    if (dockerExecWS && dockerExecWS.readyState === WebSocket.OPEN) {
      dockerExecWS.send(JSON.stringify({ type: 'exec-resize', containerId: id, cols: dims.cols, rows: dims.rows, execId: '' }));
    }
  });

  /* Window resize → fit */
  window.addEventListener('resize', function() {
    if (dockerExecFit) {
      try { dockerExecFit.fit(); } catch (_) {}
    }
  });
}

function dockerExecDisconnect() {
  if (dockerExecWS) { dockerExecWS.close(); dockerExecWS = null; }
  if (dockerExecTerm) { try { dockerExecTerm.dispose(); } catch (_) {} dockerExecTerm = null; dockerExecFit = null; }
  document.getElementById('dockerExecPicker').style.display = 'block';
  document.getElementById('dockerExecXterm').style.display = 'none';
  document.getElementById('dockerExecStatus').textContent = '';
}

function dockerCloseExec() {
  dockerExecDisconnect();
  dockerExecContainerId = null;
  document.getElementById('dockerExecModal').style.display = 'none';
}
