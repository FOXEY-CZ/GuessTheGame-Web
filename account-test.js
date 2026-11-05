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
  const oldSyncKeys = ['gtg.syncTest.v1.cloudSync', 'gtg.v2.cloudSync'];
  const oldSyncAPI = 'https://ivfhfdrjkktfueeqdgej.supabase.co/functions/v1/gtg36-sync';
  const linkPattern = /^GTGS1:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}):([0-9a-f]{64})$/i;
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
  let authChecking = true, legacyPrepared = null, mergePrepared = null;
  let recoveryActive = false, recoveryBusy = false;
  if(!game || !cfg || !window.supabase || typeof window.supabase.createClient !== 'function'){
    el('authStatus').textContent = '❌ ' + 'Přihlašovací knihovna se nenačetla. Zkontroluj připojení a obnov stránku.';
    el('authShowSignup').disabled = true;el('authShowLogin').disabled = true;
    return;
  }
  client = window.supabase.createClient(cfg.url,cfg.publishableKey,{
    auth:{storageKey:cfg.storageKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  // Do not call other Supabase methods within this synchronous auth callback.
  // PASSWORD_RECOVERY proves the user followed a valid reset link.
  if (typeof client.auth.onAuthStateChange === 'function') {
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        recoveryActive = true;
        el('authRecoveryStatus').textContent = msg(
          '✅ Odkaz ověřen. Zvol nové heslo.', '✅ Reset link verified. Choose a new password.');
        render();
      }
    });
  }
  const setFeedback = (cz,en) => {feedback=msg(cz,en);render();};
  function render(){
    show('authGuest',!user && !formMode);
    show('authForm',!user && !!formMode);
    show('authAccount',!!user);
    show('authForgotPassword',!user && formMode==='login');
    show('authPasswordLabel',formMode!=='reset');
    show('authPasswordInput',formMode!=='reset');
    show('authRecoveryOverlay',recoveryActive);
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
    el('authSubmit').disabled=busy || authChecking;
    el('authShowSignup').disabled=authChecking;
    el('authShowLogin').disabled=authChecking;
    el('authRecoverySave').disabled=recoveryBusy;
    el('authRecoveryCancel').disabled=recoveryBusy;
    el('authImportLegacy').disabled=busy || deletionInProgress;
    const guest=load(guestKey);
    show('authGuestMergePanel',!!user && !!state && !firstChoice && isProfile(guest) &&
      serial(guest)!==serial(game.getEmptyProfile()));
    el('authMergeGuest').disabled=busy || deletionInProgress || !user || !state || firstChoice || !!conflict;
    el('authMergeGuest').textContent = mergePrepared
      ? msg('✅ POTVRDIT SLOUČENÍ','✅ CONFIRM MERGE')
      : msg('ZKONTROLOVAT SLOUČENÍ','PREVIEW MERGE');
    const legacy = oldSyncKeys.map(load).find(x => x && typeof x.id === 'string' && typeof x.token === 'string');
    el('authLegacyAvailable').textContent = legacy
      ? msg('☁️ Na tomto prohlížeči je dostupné dřívější propojení. Kód nemusíš vkládat.', '☁️ Existing link detected in this browser. No need to paste the code.')
      : msg('Pokud máš propojovací kód z jiného zařízení, můžeš ho vložit níže.', 'Paste a linking code from another device if you have one.');
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
  async function createAccountSave(choice, importedProfile = null){
    if(!user || busy || !firstChoice)return;
    const guest=load(guestKey);
    const profile=choice==='legacy' && isProfile(importedProfile)
      ? importedProfile
      : choice==='guest' && isProfile(guest) ? guest : game.getEmptyProfile();
    if(!isProfile(profile))return setFeedback('❌ Neplatný místní postup.','❌ Invalid local progress.');
    busy=true;render();
    try{
      const {data,error}=await client.from('gtg36_account_progress')
        .insert({user_id:user.id,profile}).select('profile,revision').single();
      if(error)throw error;
      acceptRemote(data);
      legacyPrepared=null;el('authLegacyCode').value='';el('authLegacyStatus').textContent='';
      setFeedback('✅ Postup účtu je připravený. Hostův postup zůstal zálohovaný.','✅ Account progress is ready. Guest progress remains backed up.');
    }catch(e){
      const exists=await readRemote().catch(()=>null);
      if(exists)acceptRemote(exists);
      setFeedback('⚠️ Založení cloudu se nezdařilo: '+String(e.message||'error').slice(0,80),
                  '⚠️ Failed to create cloud save: '+String(e.message||'error').slice(0,80));
    }finally{busy=false;render();}
  }

  // Optional migration: COPY the old cloud profile into a new authenticated
  // account, never delete the old profile/link automatically.
  function getLegacyCode(){
    const typed=el('authLegacyCode').value.trim();
    if(typed)return typed;
    for(const key of oldSyncKeys){
      const saved=load(key);
      if(saved && typeof saved.id==='string' && typeof saved.token==='string')
        return 'GTGS1:'+saved.id+':'+saved.token;
    }
    return '';
  }
  async function importLegacy(){
    if(!user || !firstChoice || busy || deletionInProgress)return;
    const raw=getLegacyCode();
    const matches=linkPattern.exec(raw);
    if(!matches){
      el('authLegacyStatus').textContent=msg('❌ Nemám platný propojovací kód GTGS1.', '❌ No valid GTGS1 linking code.');
      return;
    }
    busy=true;render();
    try{
      const response=await fetch(oldSyncAPI,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        cache:'no-store',
        body:JSON.stringify({action:'load',id:matches[1].toLowerCase(),token:matches[2].toLowerCase()})
      });
      const value=await response.json();
      if(!response.ok || !value.ok || !isProfile(value.profile))throw Error('unavailable');
      const fingerprint=serial(value.profile);
      if(!legacyPrepared || legacyPrepared.code!==raw || legacyPrepared.snapshot!==fingerprint){
        legacyPrepared={code:raw,snapshot:fingerprint};
        el('authLegacyStatus').textContent=msg(
          '☁️ Nalezeno '+value.profile.xp+' XP. Klepni znovu na PŘEVÉST pro potvrzení. Původní cloud zůstane uložený.',
          '☁️ Found '+value.profile.xp+' XP. Tap IMPORT again to confirm. The original cloud copy will remain.');
      }else{
        busy=false;render();
        await createAccountSave('legacy',clone(value.profile));
      }
    }catch(e){
      legacyPrepared=null;
      el('authLegacyStatus').textContent=msg('⚠️ Starší cloud není dostupný nebo kód neplatí. Nic se nezměnilo.',
        '⚠️ Old cloud unavailable or invalid code. Nothing changed.');
    }finally{busy=false;render();}
  }

  async function mergeGuestIntoAccount(){
    if(!user || !state || busy || firstChoice || conflict || deletionInProgress)return;
    const guest=load(guestKey);
    if(!isProfile(guest)){
      el('authMergePreview').textContent=msg('🎮 Nenalezen žádný platný postup hosta.','🎮 No valid guest progress found.');
      return;
    }
    if(!window.GTGAccountMerge || navigator.onLine===false){
      el('authMergePreview').textContent=msg('📴 Pro sloučení musíš být online.','📴 You must be online to merge.');
      return;
    }
    busy=true;render();
    const id=user.id;
    try{
      const row=await readRemote();
      if(!user || user.id!==id || !row || !isProfile(row.profile) || !Number.isSafeInteger(row.revision))
        throw Error('account_changed');
      // Never overwrite unsynced account changes. A separate sync must settle first.
      if(serial(row.profile)!==serial(game.getProfile())){
        mergePrepared=null;
        el('authMergePreview').textContent=msg(
          '⚠️ Účet má neuložené nebo novější změny. Nejdřív stiskni SYNCHRONIZOVAT NYNÍ.',
          '⚠️ Account has unsaved or newer changes. Press SYNC NOW first.');
        return;
      }
      const result=window.GTGAccountMerge.merge(row.profile,guest);
      if(!isProfile(result))throw Error('bad_merge');
      const cloudSnapshot=serial(row.profile),guestSnapshot=serial(guest);
      if(serial(result)===cloudSnapshot){
        mergePrepared=null;
        el('authMergePreview').textContent=msg(
          '✅ Účet už obsahuje tento postup. Není co přidat. Hostův postup zůstává zachovaný.',
          '✅ Account already has this progress. Nothing new to merge. Guest save is preserved.');
        return;
      }
      const expected=mergePrepared && mergePrepared.revision===row.revision &&
        mergePrepared.cloud===cloudSnapshot && mergePrepared.guest===guestSnapshot &&
        mergePrepared.userId===id;
      if(!expected){
        mergePrepared={userId:id,revision:row.revision,cloud:cloudSnapshot,guest:guestSnapshot};
        el('authMergePreview').textContent=msg(
          '☁️ Účet: '+row.profile.xp+' XP · Host: '+guest.xp+' XP → Po sloučení: '+result.xp+
          ' XP. Odznaky a vzhledy se sjednotí, odměny se nesčítají. Klepni znovu na POTVRDIT SLOUČENÍ.',
          '☁️ Account: '+row.profile.xp+' XP · Guest: '+guest.xp+' XP → Merged: '+result.xp+
          ' XP. Unlocks are combined, rewards are not added. Tap CONFIRM MERGE again.');
        return;
      }
      // Keep an unchanged copy of the previous cloud profile before a write.
      if(!store(accountKey(id)+'.beforeMerge', {profile:row.profile,revision:row.revision,createdAt:new Date().toISOString()}))
        throw Error('backup_unavailable');
      const {data,error}=await client.from('gtg36_account_progress')
        .update({profile:result,revision:row.revision+1,updated_at:new Date().toISOString()})
        .eq('user_id',id).eq('revision',row.revision).select('revision').maybeSingle();
      if(error || !data)throw error || Error('conflict');
      state={revision:data.revision,base:serial(result),lastSyncedAt:new Date().toISOString()};
      setActiveProfile(result);
      cacheAccount();
      mergePrepared=null;
      el('authMergePreview').textContent=msg(
        '✅ Sloučeno! Účet má '+result.xp+' XP. Původní hostův postup i záloha účtu zůstaly zachované.',
        '✅ Merged! Account has '+result.xp+' XP. Original guest save and account backup were preserved.');
      setFeedback('✅ Postup hosta bezpečně sloučený s účtem.','✅ Guest progress safely merged into account.');
    }catch(e){
      mergePrepared=null;
      el('authMergePreview').textContent=msg(
        '⚠️ Sloučení se nepodařilo, nic nebylo přepsáno. Synchronizuj a zkus to znovu.',
        '⚠️ Merge failed; nothing was overwritten. Sync and try again.');
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
    user=nextUser;firstChoice=false;state=null;conflict=null;conflictArmed='';formMode='';mergePrepared=null;
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
    if(applying || (authChecking && !user))return;
    if(user){cacheAccount();schedule();}
    else store(guestKey,game.getProfile());
  }
  function chooseForm(mode){
    formMode=mode;
    el('authFormTitle').textContent=mode==='signup'
      ? msg('Vytvoření účtu','Create account')
      : mode==='reset' ? msg('Obnova hesla','Reset password') : msg('Přihlášení','Sign in');
    el('authSubmit').textContent=mode==='signup'
      ? msg('VYTVOŘIT ÚČET','CREATE ACCOUNT')
      : mode==='reset' ? msg('ODESLAT OBNOVOVACÍ ODKAZ','SEND RESET EMAIL') : msg('PŘIHLÁSIT SE','SIGN IN');
    el('authFormStatus').textContent='';
    el('authPasswordInput').value='';
    render();
  }
  async function submitAuth(){
    if(busy || user || !formMode)return;
    const email=el('authEmailInput').value.trim();
    const password=el('authPasswordInput').value;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
       (formMode!=='reset' && (password.length<8 || password.length>128))){
      el('authFormStatus').textContent=msg(
        'Zadej platný e-mail a pro přihlášení heslo dlouhé alespoň 8 znaků.',
        'Enter a valid email and, for sign-in, a password of at least 8 characters.');
      return;
    }
    captureGuest();busy=true;render();
    try{
      if(formMode==='reset'){
        const {error}=await client.auth.resetPasswordForEmail(email,{
          redirectTo:location.origin+location.pathname
        });
        if(error)throw error;
        formMode='';
        el('authPasswordInput').value='';
        setFeedback(
          '📧 Pokud k adrese existuje účet, dorazí odkaz na obnovu. Zkontroluj také spam.',
          '📧 If an account exists, a reset link will arrive. Check your spam folder too.');
        return;
      }
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
    }finally{busy=false;render();if(user&&state)schedule();}
  }

  async function saveRecoveredPassword(){
    if(!recoveryActive || recoveryBusy)return;
    const password=el('authNewPassword').value;
    const repeated=el('authNewPasswordAgain').value;
    if(password.length<8 || password.length>128 || password!==repeated){
      el('authRecoveryStatus').textContent=msg(
        '❌ Hesla se musí shodovat a mít alespoň 8 znaků.',
        '❌ Passwords must match and be at least 8 characters long.');
      return;
    }
    recoveryBusy=true;render();
    try{
      const {error}=await client.auth.updateUser({password});
      if(error)throw error;
      el('authNewPassword').value='';
      el('authNewPasswordAgain').value='';
      recoveryActive=false;
      setFeedback('✅ Heslo změněno. Herní postup zůstal zachovaný.',
        '✅ Password changed. Your game progress was preserved.');
    }catch(_){
      el('authRecoveryStatus').textContent=msg(
        '⚠️ Heslo se nepodařilo změnit. Zkus to znovu nebo požádej o nový odkaz.',
        '⚠️ Could not change the password. Retry or request another reset link.');
    }finally{recoveryBusy=false;render();}
  }
  async function cancelRecovery(){
    if(!recoveryActive || recoveryBusy)return;
    recoveryBusy=true;render();
    try{
      const {error}=await client.auth.signOut({scope:'local'});
      if(error)throw error;
      clearTimeout(timer);
      user=null;state=null;firstChoice=false;conflict=null;mergePrepared=null;formMode='';
      recoveryActive=false;
      el('authNewPassword').value='';el('authNewPasswordAgain').value='';
      const guest=load(guestKey);
      setActiveProfile(isProfile(guest)?guest:game.getEmptyProfile());
      setFeedback('Obnova zrušena. Pokračuješ jako host.',
        'Recovery cancelled. You are playing as guest.');
    }catch(_){
      el('authRecoveryStatus').textContent=msg(
        '⚠️ Odhlášení se nezdařilo. Zkus znovu.',
        '⚠️ Could not sign out. Please try again.');
    }finally{recoveryBusy=false;render();}
  }
  async function logout(){
    if(!user||busy)return;
    cacheAccount();busy=true;render();
    try{
      const {error}=await client.auth.signOut({scope:'local'});
      if(error)throw error;
      clearTimeout(timer);
      user=null;state=null;firstChoice=false;conflict=null;conflictArmed='';mergePrepared=null;
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
  el('authForgotPassword').addEventListener('click',()=>chooseForm('reset'));
  el('authRecoverySave').addEventListener('click',saveRecoveredPassword);
  el('authRecoveryCancel').addEventListener('click',cancelRecovery);
  el('authSyncNow').addEventListener('click',()=>syncNow());
  el('authImportGuest').addEventListener('click',()=>createAccountSave('guest'));
  el('authStartFresh').addEventListener('click',()=>createAccountSave('fresh'));
  el('authImportLegacy').addEventListener('click',importLegacy);
  el('authLegacyCode').addEventListener('input',()=>{
    legacyPrepared=null;el('authLegacyStatus').textContent='';
  });
  el('authChooseCloud').addEventListener('click',()=>resolveConflict('cloud'));
  el('authChooseLocal').addEventListener('click',()=>resolveConflict('local'));
  el('authLogout').addEventListener('click',logout);
  el('authMergeGuest').addEventListener('click',mergeGuestIntoAccount);
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
  // Do not interpret the last account save as guest progress on an
  // unauthenticated/offline reload. Previous guest snapshots remain separate.
  function restoreGuest(){
    const guest=load(guestKey);
    if(isProfile(guest))setActiveProfile(guest);
    else store(guestKey,game.getProfile());
  }
  client.auth.getUser().then(async ({data,error})=>{
    if(!error && data && data.user){
      await activate(data.user);
    }else{
      restoreGuest();
    }
  }).catch(()=>{
    restoreGuest();
    setFeedback('⚠️ Přihlášení teď nelze ověřit. Účet zůstává uložený pro pozdější přihlášení, můžeš hrát jako host.',
                '⚠️ Cannot verify sign-in right now. Account data remains cached; you can play as guest.');
  }).finally(()=>{
    authChecking=false;
    render();
  });
})();