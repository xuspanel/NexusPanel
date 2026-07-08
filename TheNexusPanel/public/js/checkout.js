(async function(){
  var el=document.getElementById('checkoutSummary');
  try{
    var r=await fetch('/api/cart',{credentials:'same-origin'});
    if(!r.ok){el.innerHTML='<div class="n-empty">Could not load cart. <a href="/cart">Go to cart</a></div>';return}
    var d=await r.json();
    if(!d.items||!d.items.length){el.innerHTML='<div class="n-empty">Your cart is empty. <a href="/pricing">Browse plans</a></div>';return}
    var html='<h3>Order Summary</h3>';
    d.items.forEach(function(i){html+='<div class="n-cart-item"><div><strong>'+i.name+'</strong></div><div>$'+i.price+' x '+i.quantity+'</div></div>'});
    html+='<div class="n-cart-total">Total: $'+d.total+'</div>';
    el.innerHTML=html;
    window._cartItems=d.items;
  }catch(e){el.innerHTML='<div class="n-empty">Could not load cart. <a href="/cart">Go to cart</a></div>'}
})();
async function placeOrder(){
  var btn=document.getElementById('checkoutBtn');
  if(!window._cartItems||!window._cartItems.length){showMsg('Your cart is empty. Add items first.','error');return}
  btn.disabled=true;btn.textContent='Processing...';
  try{
    var r=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({items:window._cartItems})});
    var d=await r.json();
    if(!r.ok)throw new Error(d.error);
    await fetch('/api/cart',{method:'DELETE',credentials:'same-origin'});
    showMsg('Order placed! License keys generated. <a href="/licenses" style="color:#10b981">View your licenses</a>','success');
    btn.textContent='Done';
  }catch(e){showMsg(e.message,'error');btn.disabled=false;btn.textContent='Place Order'}
}
function showMsg(msg,type){var el=document.getElementById('checkoutMsg');el.className='n-form-msg '+type;el.innerHTML=msg}
