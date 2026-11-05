/* FOXEY Arcade — central platform shell, deliberately separate from game logic.
 * Browser-safe Supabase publishable key only. Never mutate Guess the Game saves.
 * Unreleased community/wallet features have no backend writes yet. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const cfg = window.FOXEY_ARCADE_CONFIG;
  const AVATARS = Object.freeze({fox:'🦊',robot:'🤖',alien:'👽',crown:'👑'});
  const PAGES = new Set(['home','games','play','community','account','settings']);
  const GAME_URL = '../preview-auth-test.html';
  let supa=null, user=null, profile=null, mode='login', busy=false;
  const show=(id,visible)=>el(id).classList.toggle('hidden',!visible);
  const message=(text)=>{el('accountNotice').textContent=text;};
  function go(page){
    if(!PAGES.has(page))page='home';
    if(page==='play'){
      const frame=el('gameFrame');
      const identity=user?.id||'guest';
      // The frame is same-origin and reads the shared Supabase Auth storage key.
      // Reload only when the signed-in player changes, not on every menu switch.
      if(frame.dataset.player!==identity || frame.getAttribute('src')!==GAME_URL){
        frame.dataset.player=identity;
        frame.setAttribute('src',GAME_URL);
      }
    }
    for(const name of PAGES)show('page-'+name,name===page);
    document.querySelectorAll('.mainnav [data-page]').forEach(button=>{
      const active=button.dataset.page===page;
      button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
    history.replaceState(null,'','#'+(page==='home'?'domu':page));
  }
  function closeGameOnIdentityChange(){
    // Unload an old iframe session on account switch/logout, so another player
    // cannot briefly see the previous user's account/game data.
    const frame=el('gameFrame');
    frame.removeAttribute('src');
    frame.dataset.player='';
  }
  function render(){
    const loggedIn=!!user;
    show('guestAccount',!loggedIn);
    show('playerAccount',loggedIn);
    el('headerName').textContent=loggedIn?(profile?.nickname||'Hráč'):'Host';
    el('headerAvatar').textContent=loggedIn?(AVATARS[profile?.avatar_id]||'🦊'):'🎮';
    el('connectionStatus').textContent=loggedIn?'● Přihlášen':'○ Režim hosta';
    el('tabLogin').classList.toggle('selected',mode==='login');
    el('tabSignup').classList.toggle('selected',mode==='signup');
    el('authSubmit').textContent=mode==='login'?'Přihlásit se':'Vytvořit účet';
    el('authSubmit').disabled=busy;
    el('profileSave').disabled=busy;
    el('signOut').disabled=busy;
    if(loggedIn){
      el('profileAvatar').textContent=AVATARS[profile?.avatar_id]||'🦊';
      el('profileName').textContent=profile?.nickname||'Hráč FOXEY Arcade';
      el('profileEmail').textContent=user.email||'';
      el('nickname').value=profile?.nickname||'';
      el('avatar').value=profile?.avatar_id||'fox';
    }
  }
  function setMode(next){
    if(busy)return;
    mode=next;
    el('password').autocomplete=mode==='signup'?'new-password':'current-password';
    el('password').value='';
    message('');
    render();
  }
  async function getProfile(uid){
    const get=()=>supa.from('arcade_profiles')
      .select('user_id,nickname,avatar_id').eq('user_id',uid).maybeSingle();
    const response=await get();
    if(response.error)throw response.error;
    if(response.data)return response.data;
    // First FOXEY Arcade sign-in: create platform profile without touching
    // existing Guess the Game progress or account password.
    const inserted=await supa.from('arcade_profiles')
      .insert({user_id:uid}).select('user_id,nickname,avatar_id').single();
    if(inserted.data && !inserted.error)return inserted.data;
    // Another tab may have inserted the same row in the meantime.
    const retry=await get();
    if(retry.error||!retry.data)throw retry.error||inserted.error||Error('profile_unavailable');
    return retry.data;
  }
  async function refresh(){
    try{
      const result=await supa.auth.getUser();
      if(result.error)throw result.error;
      user=result.data?.user||null;
      profile=null;
      if(user){
        try{profile=await getProfile(user.id);}
        catch(_){message('⚠️ Účet je přihlášený, ale profil se nyní nepodařilo načíst. Zkus obnovit stránku.');}
      }
    }catch(_){
      user=null;profile=null;
      message('⚠️ Nepodařilo se ověřit přihlášení. Zkontroluj internet.');
    }finally{render();}
  }
  async function authenticate(event){
    event.preventDefault();
    if(busy)return;
    const email=el('email').value.trim(),password=el('password').value;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8||password.length>128){
      message('⚠️ Zkontroluj e-mail a heslo (8–128 znaků).');return;
    }
    if(mode==='signup' && location.protocol==='file:'){
      message('⚠️ Pro potvrzení registrace spusť aplikaci přes HTTP/HTTPS, ne jako soubor.');return;
    }
    busy=true;render();message('🔄 Ověřuji účet…');
    try{
      const response=mode==='signup'
        ? await supa.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}})
        : await supa.auth.signInWithPassword({email,password});
      if(response.error)throw response.error;
      el('password').value='';
      if(response.data?.session && response.data?.user){
        closeGameOnIdentityChange();
        await refresh();message('✅ Úspěšně přihlášeno.');
      }else{
        message('📧 Zkontroluj e-mail a potvrď účet. Odkaz potřebuje povolenou návratovou adresu v Supabase.');
      }
    }catch(e){
      message('⚠️ Přihlášení nebo registrace se nezdařila: '+String(e.message||'chyba').slice(0,120));
    }finally{busy=false;render();}
  }
  async function saveProfile(event){
    event.preventDefault();
    if(!user||busy)return;
    const nickname=el('nickname').value.trim();
    const avatar_id=el('avatar').value;
    if(nickname&&!/^[A-Za-z0-9_]{3,20}$/.test(nickname)){
      message('⚠️ Přezdívka musí mít 3–20 znaků (A–Z, 0–9, _).');return;
    }
    if(!Object.hasOwn(AVATARS,avatar_id))return;
    busy=true;render();message('🔄 Ukládám profil…');
    try{
      const res=await supa.from('arcade_profiles').update({
        nickname:nickname||null,avatar_id,updated_at:new Date().toISOString()
      }).eq('user_id',user.id).select('user_id,nickname,avatar_id').single();
      if(res.error)throw res.error;
      profile=res.data;
      message('✅ Profil FOXEY Arcade uložený.');
    }catch(e){
      const duplicate=String(e.code||'')==='23505';
      message(duplicate?'⚠️ Tuhle přezdívku už někdo používá.': '⚠️ Profil se nepodařilo uložit. Zkus to znovu.');
    }finally{busy=false;render();}
  }
  async function signOut(){
    if(!user||busy)return;
    busy=true;render();
    try{
      const res=await supa.auth.signOut({scope:'local'});
      if(res.error)throw res.error;
      user=null;profile=null;closeGameOnIdentityChange();go('home');
      message('🎮 Odhlášeno. Můžeš hrát jako host.');
    }catch(_){message('⚠️ Odhlášení se nezdařilo.');}
    finally{busy=false;render();}
  }
  document.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',event=>{
    event.preventDefault();go(button.dataset.page);
  }));
  el('tabLogin').addEventListener('click',()=>setMode('login'));
  el('tabSignup').addEventListener('click',()=>setMode('signup'));
  el('authForm').addEventListener('submit',authenticate);
  el('profileForm').addEventListener('submit',saveProfile);
  el('signOut').addEventListener('click',signOut);
  window.addEventListener('hashchange',()=>{
    const target=location.hash.replace(/^#/,'');
    go(target==='domu'?'home':target);
  });
  go(location.hash==='#domu'?'home':location.hash.replace(/^#/,''));
  render();
  if(!cfg||!window.supabase||typeof window.supabase.createClient!=='function'){
    el('connectionStatus').textContent='⚠️ Offline';
    message('⚠️ Nepodařilo se načíst přihlášení. Zkontroluj připojení a obnov stránku.');
    el('authSubmit').disabled=true;
    return;
  }
  supa=window.supabase.createClient(cfg.supabaseUrl,cfg.publishableKey,{
    auth:{storageKey:cfg.sessionKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  refresh();
})();