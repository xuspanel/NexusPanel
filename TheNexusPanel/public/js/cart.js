(async function(){
  try{var r=await fetch('/api/cart');var d=await r.json();renderCart(d)}catch(e){}
})();
function renderCart(d){
  var el=document.getElementById('cartContent');
  if(!d.items||!d.items.length){el.innerHTML='<div class="n-empty">Your cart is empty. <a href="/pricing">Browse plans</a></div>';return}
  var html='';
  d.items.forEach(function(i,idx){
    html+='<div class="n-cart-item"><div><strong>'+i.name+'</strong><br><span style="color:var(--text3);font-size:12px">'+i.maxDomains+' domain'+(i.maxDomains>1?'s':'')+' · '+i.months+' months</span></div><div>$'+i.price+' x '+i.quantity+' <button class="n-btn n-btn-sm n-btn-ghost" onclick="removeCart(\''+i.id+'\')">✕</button></div></div>';
  });
  html+='<div class="n-cart-total">Total: $'+d.total+'</div>';
  el.innerHTML=html;
  document.getElementById('cartActions').style.display='block';
}
async function removeCart(id){
  await fetch('/api/cart/'+id,{method:'DELETE'});
  location.reload();
}
