/* FOXEY Arcade — isolated password recovery callback.
 * Never let the launcher router rewrite Supabase recovery URL fragments. */
(() => {
  'use strict';
  const status=document.getElementById('resetStatus');
  const form=document.getElementById('resetForm');
  const submit=document.getElementById('resetSubmit');
  const back=document.getElementById('resetBack');
  const cfg=window.FOXEY_ARCADE_CONFIG;
  let verified=false;
  let saving=false;
  const tell=text=>{status.textContent=text;};
  const cleanUrl=()=>{
    // Never leave one-time auth tokens or recovery errors in the address bar.
    const u=new URL(location.href);
    for(const key of ['auth','code','token_hash','type','error','error_code','error_description'])
      u.searchParams.delete(key);
    history.replaceState(null,'',u.pathname+u.search);
  };
  const hashParams=new URLSearchParams(location.hash.slice(1));
  const hasAuthError=hashParams.has('error')||hashParams.has('error_code')||
    new URLSearchParams(location.search).has('error');
  if(hasAuthError){
    tell('⚠️ Odkaz je neplatný nebo vypršel. Vrať se k přihlášení a požádej o nový.');
    cleanUrl();
    return;
  }
  if(!cfg||!window.supabase?.createClient){
    tell('⚠️ Přihlášení teď není dostupné. Zkus stránku znovu načíst.');
    return;
  }
  const client=window.supabase.createClient(cfg.supabaseUrl,cfg.publishableKey,{
    auth:{storageKey:cfg.sessionKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  client.auth.onAuthStateChange((event,session)=>{
    if(event!=='PASSWORD_RECOVERY'||!session?.user)return;
    verified=true;
    form.classList.remove('hidden');
    tell('✅ Odkaz ověřen. Teď si zvol nové heslo.');
    cleanUrl();
    document.getElementById('resetNewPassword').focus();
  });
  // A plain visit to reset.html (or an expired link) must never offer a
  // password form, even if another tab has a normal signed-in session.
  setTimeout(()=>{
    if(!verified)tell('⚠️ Obnovovací odkaz se nepodařilo ověřit. Vyžádej si nový odkaz v přihlašování.');
  },12000);
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!verified||saving)return;
    const password=document.getElementById('resetNewPassword').value;
    const confirmation=document.getElementById('resetConfirmPassword').value;
    if(password.length<8||password.length>128){tell('⚠️ Heslo musí mít 8–128 znaků.');return;}
    if(password!==confirmation){tell('⚠️ Hesla se neshodují.');return;}
    saving=true;submit.disabled=true;
    try{
      const update=await client.auth.updateUser({password});
      if(update.error)throw update.error;
      verified=false;
      form.classList.add('hidden');
      document.getElementById('resetNewPassword').value='';
      document.getElementById('resetConfirmPassword').value='';
      tell('✅ Heslo bylo změněno. Nyní se přihlas novým heslem.');
      back.textContent='→ Přejít na přihlášení';
      // No other app data is modified, only the Supabase Auth password.
      const signOut=await client.auth.signOut({scope:'local'});
      if(signOut.error)tell('✅ Heslo bylo změněno. Pro bezpečnost se odhlas a přihlas novým heslem.');
    }catch(_){
      tell('⚠️ Heslo se nepodařilo změnit. Zkontroluj odkaz a zkus to znovu.');
    }finally{saving=false;submit.disabled=false;}
  });
})();
