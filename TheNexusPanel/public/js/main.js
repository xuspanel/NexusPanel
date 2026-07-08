(function(){
  // Cookies consent
  if(!localStorage.getItem('nxp_cookies')){
    document.getElementById('nCookies').style.display='block';
  }
  window.acceptCookies=function(){localStorage.setItem('nxp_cookies','accepted');document.getElementById('nCookies').style.display='none'};
  window.denyCookies=function(){localStorage.setItem('nxp_cookies','denied');document.getElementById('nCookies').style.display='none'};

  // Add to cart from any page
  window.addToCart=async function(plan,price,maxDomains,months){
    try{
      var r=await fetch('/api/auth/me');
      var d=await r.json();
      if(!d.user){window.location.href='/login';return}
      await fetch('/api/cart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:plan,price:price,maxDomains:maxDomains,months:months,quantity:1})});
      updateCartBadge();
      showToast(plan+' plan added to cart! <a href="/cart" style="color:#fff">View Cart</a>');
    }catch(e){showToast('Please sign in to add items to cart. <a href="/login" style="color:#fff">Sign In</a>')}
  };

  // Toast notification
  function showToast(msg){
    var t=document.createElement('div');
    t.className='n-toast';
    t.innerHTML=msg;
    t.style.cssText='position:fixed;bottom:24px;right:24px;background:var(--accent);color:#fff;padding:12px 20px;border-radius:var(--radius-sm);font-size:14px;font-weight:600;z-index:10000;box-shadow:0 8px 32px rgba(6,182,212,0.3);animation:nToastIn 0.4s ease';
    document.body.appendChild(t);
    setTimeout(function(){t.remove()},4000);
    var style=document.createElement('style');
    style.textContent='@keyframes nToastIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}';
    document.head.appendChild(style);
  }

  // Cart badge
  async function updateCartBadge(){
    try{var r=await fetch('/api/cart');var d=await r.json();var b=document.getElementById('cartBadge');if(b){b.textContent=d.count||'0';b.style.display=d.count?'flex':'none'}}catch(e){}
  }
  updateCartBadge();

  // Scroll reveal
  var observer=new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(e.isIntersecting){e.target.style.opacity='1';e.target.style.transform='translateY(0)'}
    });
  },{threshold:0.1});

  document.querySelectorAll('.n-feature-card,.n-price-card,.n-doc-card,.n-order-card').forEach(function(el){
    el.style.opacity='0';el.style.transform='translateY(20px)';el.style.transition='all 0.6s ease';
    observer.observe(el);
  });
})();
