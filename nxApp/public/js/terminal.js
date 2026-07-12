let term = null;
let ws = null;
let termInit = false;
let termReady = false;
let nanoMode = false;

const NANO_ACTIONS = [
  { label: 'Save', keys: '^O', ctrl: 'o', desc: 'WriteOut' },
  { label: 'Exit', keys: '^X', ctrl: 'x', desc: 'Exit' },
  { label: 'Cut', keys: '^K', ctrl: 'k', desc: 'Cut Text' },
  { label: 'Uncut', keys: '^U', ctrl: 'u', desc: 'Paste' },
  { label: 'Where', keys: '^W', ctrl: 'w', desc: 'Search' },
  { label: 'Cancel', keys: '^C', ctrl: 'c', desc: 'Cancel' },
  { label: 'Go To', keys: '^_', ctrl: '_', desc: 'Go To Line' },
  { label: 'Speller', keys: '^T', ctrl: 't', desc: 'Spell Check' },
  { label: 'Justify', keys: '^J', ctrl: 'j', desc: 'Justify' },
  { label: 'Read', keys: '^R', ctrl: 'r', desc: 'Read File' },
  { label: 'PrevPg', keys: '^Y', ctrl: 'y', desc: 'Prev Page' },
  { label: 'NextPg', keys: '^V', ctrl: 'v', desc: 'Next Page' },
  { label: 'Help', keys: '^G', ctrl: 'g', desc: 'Help' },
];

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function initTerminal() {
  if (!termInit) {
    termInit = true;
    document.getElementById('termPresetToggle').addEventListener('click', () => {
      document.getElementById('termPresetPanel').classList.toggle('open');
    });
    document.getElementById('termNanoToggle').addEventListener('click', () => {
      nanoMode = !nanoMode;
      document.getElementById('termNanoBar').classList.toggle('open', nanoMode);
      if (nanoMode) document.getElementById('termPresetPanel').classList.remove('open');
    });
    document.getElementById('termReconnectBtn').addEventListener('click', connectTerminal);
    document.getElementById('termReconnectBtn2').addEventListener('click', connectTerminal);
    document.getElementById('termClearBtn').addEventListener('click', () => { if (term) term.clear(); });
    document.getElementById('termAddPresetBtn').addEventListener('click', showAddPreset);
    document.getElementById('termPresetCancel').addEventListener('click', hidePresetForm);
    document.getElementById('termPresetSave').addEventListener('click', savePreset);
    document.getElementById('termPresetSearch').addEventListener('input', filterPresets);
    document.getElementById('termNanoClose').addEventListener('click', () => {
      nanoMode = false;
      document.getElementById('termNanoBar').classList.remove('open');
    });

    document.querySelectorAll('.term-nano-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!termReady) return;
        const ctrl = btn.dataset.ctrl;
        if (!ctrl) return;
        const codes = { o: 15, x: 24, k: 11, u: 21, w: 23, c: 3, _: 31, t: 20, j: 10, r: 18, y: 25, v: 22, g: 7 };
        const code = codes[ctrl];
        if (code !== undefined && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data: btoa(String.fromCharCode(code)) }));
          term.focus();
        }
      });
    });
  }
  await loadPresets();
  connectTerminal();
}

async function loadPresets() {
  try {
    const presets = await API.terminal.presets();
    renderTermPresets(presets);
  } catch (_) {}
}

function renderTermPresets(presets) {
  const list = document.getElementById('termPresetList');
  list.innerHTML = presets.map(p => `
    <div class="term-preset-item" data-id="${escHtml(p.id)}">
      <button class="term-preset-btn" data-cmd="${escHtml(p.cmd)}">${escHtml(p.label)}</button>
      <button class="term-preset-del" data-id="${escHtml(p.id)}" title="Delete preset">&times;</button>
    </div>
  `).join('');

  list.querySelectorAll('.term-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      if (termReady && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data: btoa(cmd + '\n') }));
        term.focus();
      }
    });
  });

  list.querySelectorAll('.term-preset-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Delete this preset?')) {
        await API.terminal.deletePreset(btn.dataset.id);
        await loadPresets();
      }
    });
  });
}

function filterPresets() {
  const q = document.getElementById('termPresetSearch').value.toLowerCase();
  document.querySelectorAll('.term-preset-item').forEach(el => {
    const btn = el.querySelector('.term-preset-btn');
    el.style.display = btn && btn.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

function showAddPreset() {
  document.getElementById('termPresetForm').classList.add('open');
  document.getElementById('termPresetLabel').value = '';
  document.getElementById('termPresetCmd').value = '';
  document.getElementById('termPresetLabel').focus();
}

function hidePresetForm() {
  document.getElementById('termPresetForm').classList.remove('open');
}

async function savePreset() {
  const label = document.getElementById('termPresetLabel').value.trim();
  const cmd = document.getElementById('termPresetCmd').value.trim();
  if (!label || !cmd) { alert('Label and command are required.'); return; }
  try {
    await API.terminal.addPreset(label, cmd);
    hidePresetForm();
    await loadPresets();
  } catch (err) {
    alert('Failed to save preset: ' + err.message);
  }
}

async function connectTerminal() {
  showTermLoading();
  if (ws) {
    try { ws.close(); } catch (_) {}
    ws = null;
  }
  if (term) {
    try { term.dispose(); } catch (_) {}
    term = null;
  }
  termReady = false;

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = protocol + '//' + location.host + '/ws/terminal';

  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    showTermError('WebSocket connection failed: ' + err.message);
    return;
  }

  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'ready') {
        initXterm();
        ws.send(JSON.stringify({ type: 'create', cols: 80, rows: 24 }));
      } else if (msg.type === 'created') {
        termReady = true;
        showTermContent();
        term.focus();
      } else if (msg.type === 'data') {
        if (term) {
          const decoded = atob(msg.data);
          term.writeUtf8 ? term.writeUtf8(decoded) : term.write(decoded);
        }
      } else if (msg.type === 'exit') {
        termReady = false;
      } else if (msg.type === 'error') {
        showTermError(msg.error);
      }
    } catch (_) {}
  };

  ws.onerror = () => {
    showTermError('WebSocket error. Check server connection.');
  };

  ws.onclose = (evt) => {
    termReady = false;
    if (evt.code !== 1000 && evt.code !== 4001) {
      showTermError('Connection lost (code ' + evt.code + '). Click Reconnect.');
    } else if (evt.code === 4001) {
      showTermError('Session expired. Please refresh the page.');
    }
  };
}

function initXterm() {
  if (term) return;
  const container = document.getElementById('termContainer');
  term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'block',
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
    theme: {
      background: '#0c0e17',
      foreground: '#cdd6f4',
      cursor: '#f5e0dc',
      selectionBackground: '#45475a',
      black: '#45475a',
      red: '#f38ba8',
      green: '#a6e3a1',
      yellow: '#f9e2af',
      blue: '#89b4fa',
      magenta: '#f5c2e7',
      cyan: '#94e2d5',
      white: '#bac2de',
      brightBlack: '#585b70',
      brightRed: '#f38ba8',
      brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af',
      brightBlue: '#89b4fa',
      brightMagenta: '#f5c2e7',
      brightCyan: '#94e2d5',
      brightWhite: '#a6adc8',
    },
    allowTransparency: true,
    cols: 80,
    rows: 24,
  });

  term.open(container);

  term.onData((data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data: btoa(data) }));
    }
  });

  term.onResize(({ cols, rows }) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  });
}

function showTermLoading() {
  document.getElementById('termLoading').style.display = 'flex';
  document.getElementById('termContent').style.display = 'none';
  document.getElementById('termError').style.display = 'none';
}

function showTermContent() {
  document.getElementById('termLoading').style.display = 'none';
  document.getElementById('termContent').style.display = 'flex';
  document.getElementById('termError').style.display = 'none';
}

function showTermError(msg) {
  document.getElementById('termLoading').style.display = 'none';
  document.getElementById('termContent').style.display = 'none';
  document.getElementById('termError').style.display = 'flex';
  document.getElementById('termErrorText').textContent = msg || 'Unknown error';
}

window.initTerminal = initTerminal;
