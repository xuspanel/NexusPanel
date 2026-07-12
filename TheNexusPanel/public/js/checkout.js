/* checkout.js — TheNexusPanel checkout */

(async function () {
  try {
    var res = await fetch('/api/cart');
    var data = await res.json();
    if (!data.items || !data.items.length) {
      document.getElementById('checkoutSummary').innerHTML = '<p>Your cart is empty.</p><a href="/pricing" class="n-btn n-btn-primary">Browse Plans</a>';
      return;
    }
    document.getElementById('checkoutSummary').innerHTML =
      '<h3>Order Summary</h3>' +
      data.items.map(function (item) {
        return '<div class="n-checkout-item"><span>' + esc(item.name) + ' x ' + item.quantity + '</span><span>$' + (item.price * item.quantity) + '</span></div>';
      }).join('') +
      '<div class="n-checkout-total">Total: <strong>$' + data.total + '</strong></div>';
  } catch (e) {
    document.getElementById('checkoutSummary').innerHTML = '<p class="n-error">Failed to load cart</p>';
  }
})();

function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }

async function placeOrder() {
  var btn = document.getElementById('checkoutBtn');
  var msg = document.getElementById('checkoutMsg');
  if (btn) btn.disabled = true;
  try {
    var cr = await fetch('/api/cart');
    var cart = await cr.json();
    if (!cart.items || !cart.items.length) throw new Error('Cart is empty');
    var res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart.items }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Order failed');
    await fetch('/api/cart', { method: 'DELETE' });
    window.location.href = '/orders';
  } catch (e) {
    if (msg) { msg.textContent = e.message; msg.className = 'n-form-msg n-form-error'; }
    if (btn) btn.disabled = false;
  }
}
