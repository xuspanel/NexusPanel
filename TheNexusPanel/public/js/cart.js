/* cart.js — TheNexusPanel cart page */

(async function () {
  var content = document.getElementById('cartContent');
  var actions = document.getElementById('cartActions');
  try {
    var res = await fetch('/api/cart');
    var data = await res.json();
    if (!data.items || !data.items.length) {
      content.innerHTML = '<div class="n-empty">Your cart is empty.</div><div style="text-align:center;margin-top:16px"><a href="/pricing" class="n-btn n-btn-primary">Browse Plans</a></div>';
      return;
    }
    content.innerHTML = '<div class="n-cart-items">' +
      data.items.map(function (item) {
        return '<div class="n-cart-item">' +
          '<div class="n-cart-item-info">' +
          '<strong>' + esc(item.name) + '</strong> — ' + item.maxDomains + ' domain' + (item.maxDomains > 1 ? 's' : '') + ' — ' + item.months + ' months' +
          '</div>' +
          '<div class="n-cart-item-price">$' + item.price + ' x ' + item.quantity + '</div>' +
          '<button class="n-cart-remove" onclick="removeItem(\'' + item.id + '\')">✕</button>' +
          '</div>';
      }).join('') +
      '<div class="n-cart-total">Total: <strong>$' + data.total + '</strong></div></div>';
    if (actions) actions.style.display = 'block';
  } catch (e) {
    content.innerHTML = '<div class="n-error">Failed to load cart. <button onclick="location.reload()" class="n-btn n-btn-sm">Retry</button></div>';
  }
})();

function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }

async function removeItem(id) {
  try {
    await fetch('/api/cart/' + id, { method: 'DELETE' });
    location.reload();
  } catch (e) { alert('Failed to remove item'); }
}
