let term = null;
let ws = null;
let termInit = false;
let termReady = false;
let nanoMode = false;
let currentVersion = 'classic';
let proFontSize = 14;

const VERSION_KEY = 'nexus-terminal-version';
const PRO_FONT_KEY = 'nexus-terminal-pro-font';

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

function getSelectedVersion() {
  return localStorage.getItem(VERSION_KEY);
}

function setSelectedVersion(version, persist) {
  currentVersion = version;
  if (persist !== false) {
    localStorage.setItem(VERSION_KEY, version);
  }
  updateVersionToggle();
}

function updateVersionToggle() {
  document.querySelectorAll('.term-version-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.version === currentVersion);
  });
}

function showTermChooser() {
  const modal = document.getElementById('termChooserModal');
  if (!modal) return;
  modal.style.display = 'flex';
  const remember = document.getElementById('termChooserRemember');
  if (remember) remember.checked = true;
}

function hideTermChooser() {
  const modal = document.getElementById('termChooserModal');
  if (modal) modal.style.display = 'none';
}

function chooseTerminalVersion(version) {
  const remember = document.getElementById('termChooserRemember');
  setSelectedVersion(version, remember ? remember.checked : true);
  hideTermChooser();
  applyTerminalVersion();
}

function initVersionToggle() {
  const toggle = document.getElementById('termVersionToggle');
  if (!toggle) return;
  toggle.querySelectorAll('.term-version-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const version = btn.dataset.version;
      if (version === currentVersion) return;
      setSelectedVersion(version);
      applyTerminalVersion();
    });
  });

  document.querySelectorAll('.term-chooser-card').forEach(card => {
    card.addEventListener('click', () => {
      chooseTerminalVersion(card.dataset.version);
    });
  });
}

async function initTerminal() {
  if (!termInit) {
    termInit = true;
    proFontSize = parseInt(localStorage.getItem(PRO_FONT_KEY), 10) || 14;
    initVersionToggle();
    initClassicEvents();
    initProEvents();
  }

  const saved = getSelectedVersion();
  if (!saved) {
    showTermChooser();
    return;
  }
  setSelectedVersion(saved);
  applyTerminalVersion();
}

function applyTerminalVersion() {
  if (currentVersion === 'pro') {
    showProShell();
    connectTerminal();
  } else {
    showClassicShell();
    connectTerminal();
  }
}

function showClassicShell() {
  const classic = document.getElementById('termContent');
  const pro = document.getElementById('termProContent');
  if (classic) classic.style.display = 'flex';
  if (pro) pro.style.display = 'none';
}

function showProShell() {
  const classic = document.getElementById('termContent');
  const pro = document.getElementById('termProContent');
  if (classic) classic.style.display = 'none';
  if (pro) pro.style.display = 'flex';
}

function initClassicEvents() {
  const presetToggle = document.getElementById('termPresetToggle');
  if (presetToggle) {
    presetToggle.addEventListener('click', () => {
      document.getElementById('termPresetPanel').classList.toggle('open');
    });
  }
  const nanoToggle = document.getElementById('termNanoToggle');
  if (nanoToggle) {
    nanoToggle.addEventListener('click', () => {
      nanoMode = !nanoMode;
      document.getElementById('termNanoBar').classList.toggle('open', nanoMode);
      if (nanoMode) document.getElementById('termPresetPanel').classList.remove('open');
    });
  }
  const reconnect = document.getElementById('termReconnectBtn');
  if (reconnect) reconnect.addEventListener('click', connectTerminal);
  const reconnect2 = document.getElementById('termReconnectBtn2');
  if (reconnect2) reconnect2.addEventListener('click', connectTerminal);
  const clearBtn = document.getElementById('termClearBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => { if (term) term.clear(); });
  const addPreset = document.getElementById('termAddPresetBtn');
  if (addPreset) addPreset.addEventListener('click', showAddPreset);
  const cancelPreset = document.getElementById('termPresetCancel');
  if (cancelPreset) cancelPreset.addEventListener('click', hidePresetForm);
  const savePresetBtn = document.getElementById('termPresetSave');
  if (savePresetBtn) savePresetBtn.addEventListener('click', savePreset);
  const presetSearch = document.getElementById('termPresetSearch');
  if (presetSearch) presetSearch.addEventListener('input', () => filterPresets(''));
  const nanoClose = document.getElementById('termNanoClose');
  if (nanoClose) {
    nanoClose.addEventListener('click', () => {
      nanoMode = false;
      document.getElementById('termNanoBar').classList.remove('open');
    });
  }

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

function initProEvents() {
  const clearBtn = document.getElementById('termProClear');
  if (clearBtn) clearBtn.addEventListener('click', () => { if (term) term.clear(); });
  const reconnect = document.getElementById('termProReconnect');
  if (reconnect) reconnect.addEventListener('click', connectTerminal);
  const presetToggle = document.getElementById('termProPresets');
  if (presetToggle) {
    presetToggle.addEventListener('click', () => {
      document.getElementById('termProPresetPanel').classList.toggle('open');
    });
  }
  const addPreset = document.getElementById('termProAddPresetBtn');
  if (addPreset) addPreset.addEventListener('click', showAddPreset);
  const cancelPreset = document.getElementById('termProPresetCancel');
  if (cancelPreset) cancelPreset.addEventListener('click', hidePresetForm);
  const savePresetBtn = document.getElementById('termProPresetSave');
  if (savePresetBtn) savePresetBtn.addEventListener('click', savePreset);
  const presetSearch = document.getElementById('termProPresetSearch');
  if (presetSearch) presetSearch.addEventListener('input', () => filterPresets('pro'));

  const fontInc = document.getElementById('termProFontInc');
  if (fontInc) {
    fontInc.addEventListener('click', () => adjustProFontSize(1));
  }
  const fontDec = document.getElementById('termProFontDec');
  if (fontDec) {
    fontDec.addEventListener('click', () => adjustProFontSize(-1));
  }

  const palette = document.getElementById('termProPalette');
  if (palette) palette.addEventListener('click', () => alert('Command palette coming in Phase 2'));
  const search = document.getElementById('termProSearch');
  if (search) search.addEventListener('click', () => alert('In-terminal search coming in Phase 2'));
  const theme = document.getElementById('termProTheme');
  if (theme) theme.addEventListener('click', () => alert('Theme switcher coming in Phase 2'));

  window.addEventListener('resize', () => {
    if (currentVersion === 'pro' && term) {
      try { term.fit(); } catch (_) {}
    }
  });
}

function adjustProFontSize(delta) {
  proFontSize = Math.max(10, Math.min(24, proFontSize + delta));
  localStorage.setItem(PRO_FONT_KEY, proFontSize);
  if (term) {
    term.options.fontSize = proFontSize;
    try { term.fit(); } catch (_) {}
  }
  updateProStatusDims();
}

async function loadPresets() {
  try {
    const presets = await API.terminal.presets();
    renderTermPresets(presets, '');
    renderTermPresets(presets, 'pro');
  } catch (_) {}
}

function renderTermPresets(presets, suffix) {
  const listId = suffix === 'pro' ? 'termProPresetList' : 'termPresetList';
  const list = document.getElementById(listId);
  if (!list) return;
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

function filterPresets(suffix) {
  const searchId = suffix === 'pro' ? 'termProPresetSearch' : 'termPresetSearch';
  const input = document.getElementById(searchId);
  const q = input ? input.value.toLowerCase() : '';
  const listId = suffix === 'pro' ? 'termProPresetList' : 'termPresetList';
  document.querySelectorAll('#' + listId + ' .term-preset-item').forEach(el => {
    const btn = el.querySelector('.term-preset-btn');
    el.style.display = btn && btn.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

function showAddPreset() {
  const suffix = currentVersion === 'pro' ? 'pro' : '';
  const formId = suffix ? 'termProPresetForm' : 'termPresetForm';
  const labelId = suffix ? 'termProPresetLabel' : 'termPresetLabel';
  const cmdId = suffix ? 'termProPresetCmd' : 'termPresetCmd';
  document.getElementById(formId).classList.add('open');
  document.getElementById(labelId).value = '';
  document.getElementById(cmdId).value = '';
  document.getElementById(labelId).focus();
}

function hidePresetForm() {
  const suffix = currentVersion === 'pro' ? 'pro' : '';
  const formId = suffix ? 'termProPresetForm' : 'termPresetForm';
  document.getElementById(formId).classList.remove('open');
}

async function savePreset() {
  const suffix = currentVersion === 'pro' ? 'pro' : '';
  const labelId = suffix ? 'termProPresetLabel' : 'termPresetLabel';
  const cmdId = suffix ? 'termProPresetCmd' : 'termPresetCmd';
  const label = document.getElementById(labelId).value.trim();
  const cmd = document.getElementById(cmdId).value.trim();
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
        updateProStatusConn(true);
      } else if (msg.type === 'data') {
        if (term) {
          const decoded = atob(msg.data);
          term.writeUtf8 ? term.writeUtf8(decoded) : term.write(decoded);
        }
      } else if (msg.type === 'exit') {
        termReady = false;
        updateProStatusConn(false);
      } else if (msg.type === 'error') {
        showTermError(msg.error);
        updateProStatusConn(false);
      }
    } catch (_) {}
  };

  ws.onerror = () => {
    showTermError('WebSocket error. Check server connection.');
    updateProStatusConn(false);
  };

  ws.onclose = (evt) => {
    termReady = false;
    updateProStatusConn(false);
    if (evt.code !== 1000 && evt.code !== 4001) {
      showTermError('Connection lost (code ' + evt.code + '). Click Reconnect.');
    } else if (evt.code === 4001) {
      showTermError('Session expired. Please refresh the page.');
    }
  };
}

function initXterm() {
  if (term) return;
  const container = document.getElementById(currentVersion === 'pro' ? 'termProContainer' : 'termContainer');
  if (!container) return;
  term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'block',
    fontSize: currentVersion === 'pro' ? proFontSize : 14,
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
  try { term.fit(); } catch (_) {}

  term.onData((data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data: btoa(data) }));
    }
  });

  term.onResize(({ cols, rows }) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
    updateProStatusDims();
  });

  updateProStatusDims();
}

function updateProStatusConn(connected) {
  const el = document.getElementById('termProStatusConn');
  if (!el) return;
  if (connected) {
    el.innerHTML = '<span class="term-pro-status-dot term-pro-status-ok"></span>connected';
  } else {
    el.innerHTML = '<span class="term-pro-status-dot term-pro-status-err"></span>disconnected';
  }
}

function updateProStatusDims() {
  const el = document.getElementById('termProStatusDims');
  if (!el || !term) return;
  el.textContent = term.cols + 'x' + term.rows;
}

function showTermLoading() {
  document.getElementById('termLoading').style.display = 'flex';
  document.getElementById('termError').style.display = 'none';
}

function showTermContent() {
  document.getElementById('termLoading').style.display = 'none';
  document.getElementById('termError').style.display = 'none';
}

function showTermError(msg) {
  document.getElementById('termLoading').style.display = 'none';
  document.getElementById('termError').style.display = 'flex';
  document.getElementById('termErrorText').textContent = msg || 'Unknown error';
}

window.initTerminal = initTerminal;
