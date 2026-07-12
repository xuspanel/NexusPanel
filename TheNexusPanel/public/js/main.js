/* main.js — TheNexusPanel marketing site */
function esc(s) { return String(s || '').replace(/[&<>]/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }

/* Cookie consent */
(function () {
  if (document.cookie.indexOf('nxp_cookies=') !== -1) return;
  document.addEventListener('DOMContentLoaded', function () {
    var banner = document.getElementById('nCookies');
    if (banner) banner.style.display = 'flex';
  });
})();

function acceptCookies() {
  var banner = document.getElementById('nCookies');
  if (banner) banner.style.display = 'none';
  var d = new Date(); d.setFullYear(d.getFullYear() + 1);
  document.cookie = 'nxp_cookies=accepted; path=/; expires=' + d.toUTCString();
}

function denyCookies() {
  var banner = document.getElementById('nCookies');
  if (banner) banner.style.display = 'none';
  document.cookie = 'nxp_cookies=denied; path=/; max-age=86400';
}

/* Cart badge */
function updateCartBadge(count) {
  var badge = document.getElementById('cartBadge');
  if (badge) {
    badge.textContent = count || 0;
    badge.style.display = count > 0 ? 'inline' : 'none';
  }
}

/* Load cart count on page ready */
document.addEventListener('DOMContentLoaded', function () {
  fetch('/api/cart').then(function (r) { return r.json(); }).then(function (d) {
    updateCartBadge(d.count || 0);
  }).catch(function () {});
});

/* Add to cart */
function addToCart(plan, price, maxDomains, months, quantity) {
  fetch('/api/cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: plan, price: price, maxDomains: maxDomains, months: months, quantity: quantity || 1 }),
  }).then(function (r) { return r.json(); }).then(function (d) {
    updateCartBadge(d.count);
    var el = document.getElementById('cartToast');
    if (!el) { el = document.createElement('div'); el.id = 'cartToast'; el.className = 'n-toast'; document.body.appendChild(el); }
    el.textContent = '\u2713 ' + plan + ' added to cart';
    el.classList.add('show');
    setTimeout(function () { el.classList.remove('show'); }, 2500);
  });
}

/* License key validation */
async function checkKey() {
  var input = document.getElementById('validateKey');
  var btn = document.getElementById('validateBtn');
  var result = document.getElementById('validateResult');
  var key = (input.value || '').trim().toUpperCase();

  if (!key) { result.style.display = 'block'; result.innerHTML = '<div class="n-validate-msg n-validate-err">Please enter a license key</div>'; return; }
  if (!/^NX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key)) {
    result.style.display = 'block';
    result.innerHTML = '<div class="n-validate-msg n-validate-err">Invalid key format. Expected: NX-XXXX-XXXX-XXXX</div>';
    return;
  }

  btn.disabled = true; btn.textContent = 'Checking...';
  result.style.display = 'block';
  result.innerHTML = '<div class="n-validate-loading">Verifying license key...</div>';

  try {
    var res = await fetch('/api/validate-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key }),
    });
    var data = await res.json();

    if (data.valid) {
      var lic = data.license;
      var exp = lic.expires_at ? new Date(lic.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Never';
      var daysLeft = lic.expires_at ? Math.ceil((new Date(lic.expires_at) - Date.now()) / 86400000) : null;
      result.innerHTML =
        '<div class="n-validate-msg n-validate-ok">' +
          '<div class="n-validate-icon">&#10003;</div>' +
          '<div class="n-validate-details">' +
            '<strong>License is Active</strong>' +
            '<span>Key: <code>' + esc(lic.key) + '</code></span>' +
            '<span>Domains: ' + (lic.domains && lic.domains.length ? lic.domains.join(', ') : 'None assigned') + ' / ' + lic.max_domains + ' max</span>' +
            '<span>Expires: ' + exp + (daysLeft !== null ? ' (' + daysLeft + ' days)' : '') + '</span>' +
          '</div>' +
        '</div>';
    } else {
      var reason = data.reason || 'unknown';
      var messages = { invalid_key: 'This key does not exist.', expired: 'This license has expired.', suspended: 'This license has been suspended.', revoked: 'This license has been revoked.', domain_limit_exceeded: 'Maximum domains reached for this license.' };
      result.innerHTML = '<div class="n-validate-msg n-validate-err"><strong>Invalid License</strong><br>' + (messages[reason] || 'License is not valid.') + '</div>';
    }
  } catch (e) {
    result.innerHTML = '<div class="n-validate-msg n-validate-err">Could not connect to license server. Please try again.</div>';
  }
  btn.disabled = false; btn.textContent = 'Check Validity';
}
