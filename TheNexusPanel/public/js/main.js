/* main.js — TheNexusPanel marketing site */

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
