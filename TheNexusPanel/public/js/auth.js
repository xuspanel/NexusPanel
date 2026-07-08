function showError(id,msg){var el=document.getElementById(id);el.textContent=msg;el.classList.add('show')}
async function doLogin(e){e.preventDefault();
  var btn=e.target.querySelector('button');btn.disabled=true;btn.textContent='Signing in...';
  try{var r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('loginEmail').value,password:document.getElementById('loginPassword').value})});var d=await r.json();if(!r.ok)throw new Error(d.error);window.location.href='/'}catch(err){showError('loginError',err.message);btn.disabled=false;btn.textContent='Sign In'}}
async function doRegister(e){e.preventDefault();
  var btn=e.target.querySelector('button');btn.disabled=true;btn.textContent='Creating...';
  try{var r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('regName').value,email:document.getElementById('regEmail').value,password:document.getElementById('regPassword').value})});var d=await r.json();if(!r.ok)throw new Error(d.error);window.location.href='/'}catch(err){showError('regError',err.message);btn.disabled=false;btn.textContent='Create Account'}}
