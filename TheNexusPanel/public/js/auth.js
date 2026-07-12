/* auth.js — TheNexusPanel auth forms */

async function api(method, path, body) {
  var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  var res = await fetch(path, opts);
  var data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function doLogin(e) {
  e.preventDefault();
  var errEl = document.getElementById('loginError');
  var btn = document.querySelector('#loginForm button[type=submit]');
  if (errEl) errEl.style.display = 'none';
  if (btn) btn.disabled = true;
  try {
    await api('POST', '/api/auth/login', {
      email: document.getElementById('loginEmail').value.trim(),
      password: document.getElementById('loginPassword').value,
    });
    window.location.href = '/licenses';
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
    if (btn) btn.disabled = false;
  }
  return false;
}

async function doRegister(e) {
  e.preventDefault();
  var errEl = document.getElementById('regError');
  var btn = document.querySelector('#regForm button[type=submit]');
  if (errEl) errEl.style.display = 'none';
  if (btn) btn.disabled = true;
  try {
    await api('POST', '/api/auth/register', {
      name: document.getElementById('regName').value.trim(),
      email: document.getElementById('regEmail').value.trim(),
      password: document.getElementById('regPassword').value,
    });
    window.location.href = '/licenses';
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
    if (btn) btn.disabled = false;
  }
  return false;
}
