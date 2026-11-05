/* Guess the Game 3.6 — isolated web account test.
 * Supabase Auth owns credentials. Guest progression is local only.
 * Existing linking-code tests and production data are never touched. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const game = window.GTGSync;
  const cfg = window.GTGAuthConfig;
  const prefix = 'gtg.accountTest.v1.';
  const guestKey = prefix + 'guestProfile';
  const accountKey = id => prefix + 'accountCache.' + id;
  const cs = () => game.language() === 'cs';
  const msg = (cz, en) => cs() ? cz : en;
  const serial = value => JSON.stringify(value, (key, part) => {
    if (part && typeof part === 'object' && !Array.isArray(part))
      return Object.fromEntries(Object.keys(part).sort().map(k => [k,part[k]]));
    return part;
  });
  const clone = v => JSON.parse(JSON.stringify(v));
  const isProfile = p => p && typeof p === 'object' && !Array.isArray(p)
    && ['xp','played','bestScore','totalCorrect','bestStreak'].every(k =>
      Number.isSafeInteger(p[k]) && p[k] >= 0 && p[k] < 100000000)
    && serial(p).length < 39000;
  const load = key => {try{return JSON.parse(localStorage.getItem(key) || 'null');}catch(_){return null;}};
  const store = (key,value) => {try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(_){return false;}};
  const drop = key => {try{localStorage.removeItem(key);}catch(_){}};
  const show = (id,on) => el(id).classList.toggle('hidden',!on);
  let client = null, user = null, state = null, busy = false, applying = false;
  let formMode = '', firstChoice = false, conflict = null, conflictArmed = '';
  let timer = null, feedback = '', deletionInProgress = false;
  if(!game || !cfg || !window.supabase || typeof window.supabase.createClient !== 'function'){
    el('authStatus').textContent = '❌ ' + 'Přihlašovací knihovna se nenačetla. Zkontroluj připojení a obnov stránku.';
    el('authShowSignup').disabled = true;el('authShowLogin').disabled = true;
    return;
  }
  client = window.supabase.createClient(cfg.url,cfg.publishableKey,{
    auth:{storageKey:cfg.storageKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  const setFeedback = (cz,en) => {feedback=msg(cz,en);render();};
  function render(){
    show('authGuest',!user && !formMode);
    show('authForm',!user && !!formMode);
    show('authAccount',!!user);
    el('authStatus').textContent = feedback || (user
      ? msg('✅ Přihlášený hráč — cloudové ukládání.','✅ Signed in — cloud saving.')
      : msg('🎮 Režim hosta — jen místní ukládání.','🎮 Guest mode — local saving only.'));
    if(user){
      el('authSignedEmail').textContent = '👤 ' + (user.email || msg('Účet','Account'));
      el('authSyncStatus').textContent = busy
        ? msg('🔄 Probíhá operace…','🔄 Working…')
        : conflict
          ? msg('⚠️ Rozdílný postup: cloud '+conflict.profile.xp+' XP, toto zařízení '+game.getProfile().xp+' XP.','⚠️ Different progress: cloud '+conflict.profile.xp+' XP, this device '+game.getProfile().xp+' XP.')
          : firstChoice
            ? msg('☁️ Účet ještě nemá uložený postup. Vyber možnost níže.','☁️ No cloud save yet. Choose how to start below.')
            : state
              ? msg('✅ Účet propojený — automatická synchronizace je zapnutá.','✅ Account linked — automatic sync enabled.')
              : msg('⏳ Kontroluji cloudové uložiště…','⏳ Checking cloud storage…');
      const when=state && state.lastSyncedAt ? new Date(state.lastSyncedAt) : null;
      el('authLastSynced').textContent = when && !isNaN(when)
        ? msg('Poslední synchronizace: ','Last sync: ') + when.toLocaleString(cs()?'cs-CZ':'en-US',{dateStyle:'short',timeStyle:'short'})
        : msg('Zatím bez potvrzené synchronizace.','No confirmed sync yet.');
    }
    show('authFirstChoice',!!user && firstChoice);
    show('authConflict',!!user && !!conflict);
    el('authSyncNow').disabled = busy || !state || !!conflict || firstChoice;
    for(const id of ['authImportGuest','authStartFresh','authChooseCloud','authChooseLocal','authLogout'])
      el(id).disabled=busy || deletionInProgress;
    el('authSubmit').disabled=busy;
  }
  function captureGuest(){
    const existing=load(guestKey);
    if(!isProfile(existing))store(guestKey,game.getProfile());
  }
  function cacheAccount(){
    if(!user || !state)return;
    store(accountKey(user.id),{profile:game.getProfile(),revision:state.revision,base:state.base,lastSyncedAt:state.lastSyncedAt});
  }
  function setActiveProfile(p){
    applying=true;
    try{game.setProfile(clone(p));}finally{applying=false;}
    cacheAccount();
  }
  function acceptRemote(row){
    if(!row || !isProfile(row.profile) || !Number.isSafeInteger(row.revision))throw Error('bad_remote');
    state={revision:row.revision,base:serial(row.profile),lastSyncedAt:new Date().toISOString()};
    firstChoice=false;conflict=null;conflictArmed='';
    setActiveProfile(row.profile);
    cacheAccount();
    render();
  }
  async function readRemote(){
    if(!user)throw Error('not_authenticated');
    const {data,error}=await client.from('gtg36_account_progress')
      .select('profile,revision,updated_at').eq('user_id',user.id).maybeSingle();
    if(error)throw error;
    return data;
  }
  async function createAccountSave(choice){
    if(!user || busy || !firstChoice)return;
    const guest=load(guestKey);
    const profile=choice==='guest' && isProfile(guest) ? guest : game.getEmptyProfile();
    if(!isProfile(profile))return setFeedback('❌ Neplatný místní postup.','❌ Invalid local progress.');
    busy=true;render();
    try{
      const {data,error}=await client.from('gtg36_account_progress')
        .insert({user_id:user.id,profile}).select('profile,revision').single();
      if(error)throw error;
      acceptRemote(data);
      setFeedback('✅ Postup účtu je připravený. Hostův postup zůstal zálohovaný.','✅ Account progress is ready. Guest progress remains backed up.');
    }catch(e){
      const exists=await readRemote().catch(()=>null);
      if(exists)acceptRemote(exists);
      setFeedback('⚠️ Založení cloudu se nezdařilo: '+String(e.message||'error').slice(0,80),
                  '⚠️ Failed to create cloud save: '+String(e.message||'error').slice(0,80));
    }finally{busy=false;render();}
  }
  async function activate(nextUser){
    if(!nextUser || !nextUser.id)return;
    if(user && user.id===nextUser.id)return;
    if(user && user.id!==nextUser.id){
      cacheAccount();
      state=null;conflict=null;
    }
    captureGuest();
    user=nextUser;firstChoice=false;state=null;conflict=null;conflictArmed='';formMode='';
    render();
    const cached=load(accountKey(user.id));
    if(cached && isProfile(cached.profile) && Number.isSafeInteger(cached.revision)
       && typeof cached.base==='string'){
      state={revision:cached.revision,base:cached.base,lastSyncedAt:cached.lastSyncedAt||null};
      setActiveProfile(cached.profile);
    }
    try{
      const row=await readRemote();
      if(!user || user.id!==nextUser.id)return;
      if(!row){
        // A deleted server save must never be silently recreated from an old cache.
        state=null;firstChoice=true;conflict=null;
        render();return;
      }
      if(!state)acceptRemote(row);
      else await syncNow(row);
    }catch(e){setFeedback('⚠️ Cloud je nedostupný, místní data zachována.','⚠️ Cloud unavailable; local data preserved.');}
  }
  async function syncNow(preloaded){
    if(!user || !state || busy || firstChoice || conflict || deletionInProgress)return;
    if(navigator.onLine===false){
      setFeedback('📴 Offline. Postup zůstává uložený v prohlížeči.','📴 Offline. Progress is saved in this browser.');
      return;
    }
    const identity=user.id;
    busy=true;setFeedback('🔄 Synchronizuji…','🔄 Syncing…');
    try{
      const remote=preloaded || await readRemote();
      if(!user || user.id!==identity)return;
      if(!remote){
        state=null;firstChoice=true;
        setFeedback('⚠️ Cloudový postup byl odstraněn. Vyber nové založení.','⚠️ Cloud save was removed. Choose how to start again.');
        return;
      }
      if(!isProfile(remote.profile) || !Number.isSafeInteger(remote.revision))throw Error('bad_remote');
      const local=game.getProfile(), localJSON=serial(local), cloudJSON=serial(remote.profile);
      if(localJSON===cloudJSON){
        state={revision:remote.revision,base:cloudJSON,lastSyncedAt:new Date().toISOString()};
        cacheAccount();
        setFeedback('✅ Synchronizováno.','✅ Synced.');
        return;
      }
      if(localJSON===state.base){
        if(!game.canApply()){
          setFeedback('☁️ Nový postup čeká na návrat do menu.','☁️ Cloud progress will load when you return to the menu.');
          return;
        }
        acceptRemote(remote);
        setFeedback('✅ Novější postup načtený z cloudu.','✅ Latest progress loaded from cloud.');
        return;
      }
      if(cloudJSON===state.base){
        const {data,error}=await client.from('gtg36_account_progress')
          .update({profile:local,revision:remote.revision+1,updated_at:new Date().toISOString()})
          .eq('user_id',identity).eq('revision',remote.revision)
          .select('revision').maybeSingle();
        if(error)throw error;
        if(!data)throw Error('conflict');
        state={revision:data.revision,base:localJSON,lastSyncedAt:new Date().toISOString()};
        cacheAccount();
        setFeedback('✅ Postup uložený do účtu.','✅ Progress saved to your account.');
        return;
      }
      conflict=remote;conflictArmed='';
      setFeedback('⚠️ Obě zařízení změnila postup. Vyber verzi k zachování.','⚠️ Both devices changed progress. Choose which one to keep.');
    }catch(e){
      setFeedback('⚠️ Synchronizace selhala. Místní data zůstávají.','⚠️ Sync failed. Local progress is preserved.');
    }finally{busy=false;render();}
  }
  async function resolveConflict(mode){
    if(!user||!conflict||busy)return;
    if(conflictArmed!==mode){
      conflictArmed=mode;
      setFeedback('⚠️ Klepni na stejnou volbu ještě jednou pro potvrzení.','⚠️ Tap the same choice once more to confirm.');
      return;
    }
    busy=true;render();
    try{
      const latest=await readRemote();
      if(!latest)throw Error('missing');
      if(latest.revision!==conflict.revision)throw Error('changed');
      if(mode==='cloud'){
        if(!game.canApply())throw Error('game_in_progress');
        acceptRemote(latest);
      }else{
        const local=game.getProfile();
        if(!isProfile(local))throw Error('bad_local');
        const {data,error}=await client.from('gtg36_account_progress')
          .update({profile:local,revision:latest.revision+1,updated_at:new Date().toISOString()})
          .eq('user_id',user.id).eq('revision',latest.revision)
          .select('revision').maybeSingle();
        if(error || !data)throw error||Error('conflict');
        state={revision:data.revision,base:serial(local),lastSyncedAt:new Date().toISOString()};
        cacheAccount();conflict=null;conflictArmed='';
      }
      setFeedback('✅ Vybraný postup je uložený.','✅ Selected progress saved.');
    }catch(e){
      conflict=null;conflictArmed='';
      setFeedback('⚠️ Postup se mezitím změnil. Zkus synchronizovat znovu.','⚠️ Progress changed. Try syncing again.');
    }finally{busy=false;render();}
  }
  function schedule(){
    if(!user||!state||firstChoice||busy||conflict||deletionInProgress)return;
    clearTimeout(timer);
    timer=setTimeout(()=>syncNow(),1800);
  }
  function profileChanged(){
    if(applying)return;
    if(user){cacheAccount();schedule();}
    else store(guestKey,game.getProfile());
  }
  function chooseForm(mode){
    formMode=mode;
    el('authFormTitle').textContent=mode==='signup'
      ? msg('Vytvoření účtu','Create account')
      : msg('Přihlášení','Sign in');
    el('authSubmit').textContent=mode==='signup'
      ? msg('VYTVOŘIT ÚČET','CREATE ACCOUNT')
      : msg('PŘIHLÁSIT SE','SIGN IN');
    el('authFormStatus').textContent='';
    el('authPasswordInput').value='';
    render();
  }
  async function submitAuth(){
    if(busy || user || !formMode)return;
    const email=el('authEmailInput').value.trim();
    const password=el('authPasswordInput').value;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<8 || password.length>128){
      el('authFormStatus').textContent=msg('Zadej platný e-mail a heslo dlouhé alespoň 8 znaků.','Enter a valid email and a password of at least 8 characters.');
      return;
    }
    captureGuest();busy=true;render();
    try{
      const result=formMode==='signup'
        ? await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}})
        : await client.auth.signInWithPassword({email,password});
      if(result.error)throw result.error;
      el('authPasswordInput').value='';
      if(result.data && result.data.session && result.data.user){
        await activate(result.data.user);
        setFeedback('✅ Úspěšně přihlášeno.','✅ Signed in.');
      }else{
        formMode='';
        setFeedback('📧 Zkontroluj e-mail, potvrď registraci a potom se tady přihlas. Pokud odkaz otevře jinou stránku, vrať se sem.',
                    '📧 Confirm the registration email, then return here to sign in.');
      }
    }catch(e){
      const code=String(e&&e.message||'auth_failed').slice(0,120);
      el('authFormStatus').textContent=msg('❌ Přihlášení/registrace: ','❌ Authentication: ')+code;
    }finally{busy=false;render();}
  }
  async function logout(){
    if(!user||busy)return;
    cacheAccount();busy=true;render();
    try{
      const {error}=await client.auth.signOut({scope:'local'});
      if(error)throw error;
      clearTimeout(timer);
      user=null;state=null;firstChoice=false;conflict=null;conflictArmed='';
      formMode='';busy=false;
      setActiveProfile(load(guestKey) || game.getEmptyProfile());
      store(guestKey,game.getProfile());
      setFeedback('🎮 Odhlášeno. Pokračuješ jako host.','🎮 Signed out. Continuing as guest.');
    }catch(e){
      setFeedback('⚠️ Odhlášení se nezdařilo.','⚠️ Could not sign out.');
    }finally{busy=false;render();}
  }
  function showDelete(){
    if(busy||deletionInProgress)return;
    show('deleteProgressConfirm',true);
    el('deleteProgressPhrase').value='';
    el('deleteProgressStatus').textContent='';
    updateDelete();
  }
  function updateDelete(){
    el('deleteProgressFinal').disabled = busy || deletionInProgress
      || el('deleteProgressPhrase').value.trim().toLocaleUpperCase() !== msg('SMAZAT','DELETE');
  }
  async function deleteProgress(){
    if(busy||deletionInProgress || el('deleteProgressFinal').disabled)return;
    deletionInProgress=true;busy=true;render();updateDelete();
    try{
      if(user){
        const {error}=await client.from('gtg36_account_progress').delete().eq('user_id',user.id);
        if(error)throw error;
        drop(accountKey(user.id));
        state=null;conflict=null;firstChoice=true;
        setActiveProfile(game.getEmptyProfile());
        // Delete only game progress. Supabase Auth login remains.
      }else{
        game.resetProgress();
        store(guestKey,game.getProfile());
      }
      show('deleteProgressConfirm',false);
      el('deleteProgressPhrase').value='';
      setFeedback('🗑️ Herní postup byl smazán.','🗑️ Game progress deleted.');
    }catch(e){
      el('deleteProgressStatus').textContent=msg('⚠️ Mazání se nezdařilo; postup zůstal zachován.','⚠️ Could not delete; progress preserved.');
    }finally{deletionInProgress=false;busy=false;updateDelete();render();}
  }
  el('authShowSignup').addEventListener('click',()=>chooseForm('signup'));
  el('authShowLogin').addEventListener('click',()=>chooseForm('login'));
  el('authCancel').addEventListener('click',()=>{formMode='';render();});
  el('authSubmit').addEventListener('click',submitAuth);
  el('authSyncNow').addEventListener('click',()=>syncNow());
  el('authImportGuest').addEventListener('click',()=>createAccountSave('guest'));
  el('authStartFresh').addEventListener('click',()=>createAccountSave('fresh'));
  el('authChooseCloud').addEventListener('click',()=>resolveConflict('cloud'));
  el('authChooseLocal').addEventListener('click',()=>resolveConflict('local'));
  el('authLogout').addEventListener('click',logout);
  el('deleteProgressStart').addEventListener('click',showDelete);
  el('deleteProgressCancel').addEventListener('click',()=>{show('deleteProgressConfirm',false);el('deleteProgressPhrase').value='';});
  el('deleteProgressPhrase').addEventListener('input',updateDelete);
  el('deleteProgressFinal').addEventListener('click',deleteProgress);
  window.addEventListener('gtg-profile-saved',profileChanged);
  window.addEventListener('gtg-profile-screen',render);
  window.addEventListener('gtg-home-screen',schedule);
  window.addEventListener('online',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  setInterval(()=>{if(user&&!document.hidden)schedule();},60000);
  render();
  // Restore an authenticated session only after verifying it with Auth.
  client.auth.getUser().then(({data,error})=>{
    if(!error && data && data.user)activate(data.user);
    else if(!load(guestKey))store(guestKey,game.getProfile());
  }).catch(()=>{
    if(!load(guestKey))store(guestKey,game.getProfile());
    setFeedback('⚠️ Ověření přihlášení není dostupné. Host může hrát lokálně.',
                '⚠️ Could not verify account. Guest can still play locally.');
  });
})();