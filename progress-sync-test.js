/* Guess the Game 3.6 - optional account-free progress sync.
   Linking code is a bearer credential; do not publish it. No sync without opt-in. */
(() => {
  'use strict';
  const game = window.GTGSync;
  if (!game) return;
  const api = 'https://ivfhfdrjkktfueeqdgej.supabase.co/functions/v1/gtg36-sync';
  const storageKey = 'gtg.syncTest.v1.cloudSync';
  const pattern = /^GTGS1:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}):([0-9a-f]{64})$/i;
  const el = id => document.getElementById(id);
  const cs = () => game.language() === 'cs';
  const msg = (cz, en) => cs() ? cz : en;
  const serial = data => JSON.stringify(data, (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value))
      return Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]]));
    return value;
  });
  const valid = p => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
    for (const k of ['xp','played','bestScore','totalCorrect','bestStreak'])
      if (!Number.isSafeInteger(p[k]) || p[k] < 0 || p[k] > 100000000) return false;
    for (const k of ['shards','crowns','perfectRuns','freeChests','chestsOpened'])
      if (p[k] != null && (!Number.isSafeInteger(p[k]) || p[k] < 0 || p[k] > 100000000)) return false;
    return serial(p).length < 40000;
  };
  const linkCode = l => 'GTGS1:' + l.id + ':' + l.token;
  const parseCode = s => {
    const m = pattern.exec(s.trim());
    return m ? {id: m[1].toLowerCase(), token: m[2].toLowerCase()} : null;
  };
  let link = null, busy = false, timer = null, conflict = null;
  let prompt = '', confirmCode = '', confirmResolution = '', confirmDisconnect = false;
  let deleting = false;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && parseCode(linkCode(saved)) && Number.isSafeInteger(saved.revision) &&
        typeof saved.base === 'string') link = saved;
  } catch (_) {}
  const persist = () => {
    try {
      if (link) localStorage.setItem(storageKey, JSON.stringify(link));
      else localStorage.removeItem(storageKey);
    } catch (_) {}
  };
  function status(cz, en) { prompt = msg(cz, en); refresh(); }
  function markSynced(target = link) {
    if (!target || target !== link) return;
    target.lastSyncedAt = new Date().toISOString();
    persist();
  }
  function refresh() {
    // Present either onboarding or a compact linked-state card.
    el('syncSetup').classList.toggle('hidden', !!link);
    el('syncLinked').classList.toggle('hidden', !link);
    if (link) el('syncLinkedCode').value = linkCode(link);
    const last = link && link.lastSyncedAt ? new Date(link.lastSyncedAt) : null;
    el('syncLastSuccess').textContent = !link ? '' : (last && !isNaN(last.getTime())
      ? msg('Poslední úspěšná synchronizace: ', 'Last successful sync: ')
          + last.toLocaleString(cs() ? 'cs-CZ' : 'en-US', {dateStyle:'short',timeStyle:'short'})
      : msg('Zatím bez potvrzené synchronizace.', 'No successful sync confirmed yet.'));
    el('syncStatus').textContent = prompt || (link
      ? msg('✅ Propojeno. Synchronizuje se při připojení.', '✅ Linked. Syncs when online.')
      : msg('Zatím není propojeno. Místní postup zůstává zachován.', 'Not linked. Local progress stays here.'));
    el('syncCreate').disabled = busy || !!link;
    el('syncCreate').textContent = link
      ? msg('✅ PROPOJENO', '✅ LINKED')
      : msg('VYTVOŘIT PROPOJENÍ', 'CREATE LINK');
    el('syncConnect').disabled = busy || !!link;
    el('syncNow').disabled = busy || !link;
    el('syncCopy').disabled = !link;
    el('syncDisconnect').disabled = busy || !link;
    el('syncConflict').classList.toggle('hidden', !conflict);
    el('syncCloud').disabled = busy || !conflict;
    el('syncDevice').disabled = busy || !conflict;
  }
  async function request(data) {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetch(api, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(data), signal: abort.signal, cache: 'no-store'
      });
      const value = await response.json();
      if (!response.ok || !value.ok) throw Error(value.error || 'connection_failed');
      return value;
    } finally { clearTimeout(timeout); }
  }
  function schedule() {
    if (!link || deleting) return;
    clearTimeout(timer);
    timer = setTimeout(syncNow, 1800);
  }
  async function create() {
    if (link || busy) return;
    const local = game.getProfile();
    if (!valid(local)) { status('❌ Místní profil nelze synchronizovat.', '❌ Local profile cannot be synced.'); return; }
    if (window.GTGAndroid && typeof window.GTGAndroid.syncRequest !== 'function') {
      status('❌ Tato APK nemá funkční synchronizační modul. Nainstaluj novější Sync Test.', '❌ This APK lacks a working sync module. Install the latest Sync Test.');
      return;
    }
    busy = true;
    status('⏳ Vytvářím propojovací kód…', '⏳ Creating the linking code…');
    try {
      const created = await request({action:'create',profile:local});
      if (!parseCode('GTGS1:' + created.id + ':' + created.token) ||
          !Number.isSafeInteger(created.revision)) throw Error('invalid_response');
      link = {id:created.id,token:created.token,revision:created.revision,base:serial(local)};
      markSynced();
      status('✅ Propojení vytvořeno! Kód je v nastavení níže. Uchovej ho v soukromí.', '✅ Link created! The code is in the settings below. Keep it private.');
      el('syncManage').open = true;
      el('syncLinkedCode').value = linkCode(link);
      el('syncLinkedCode').scrollIntoView({block:'center',behavior:'smooth'});
    } catch (error) {
      const reason = String(error && error.message || 'unknown_error').slice(0,80).replace(/[^a-zA-Z0-9_ -]/g,'');
      status('❌ Kód se nepodařilo vytvořit (' + reason + '). Zkus zkontrolovat internet.', '❌ Could not create code (' + reason + '). Check your internet connection.');
    }
    finally { busy = false; refresh(); }
  }
  async function connect() {
    if (link || busy) return;
    const raw = el('syncCode').value.trim();
    const parsed = parseCode(raw);
    if (!parsed) { status('❌ Neplatný kód propojení.', '❌ Invalid link code.'); return; }
    busy = true; refresh();
    try {
      const remote = await request({action:'load', ...parsed});
      if (!valid(remote.profile) || !Number.isSafeInteger(remote.revision)) throw Error('invalid_remote');
      const local = game.getProfile();
      if (serial(local) !== serial(remote.profile) && confirmCode !== raw) {
        confirmCode = raw;
        status('⚠️ Cloud má ' + remote.profile.xp + ' XP, zařízení ' + local.xp + ' XP. Zazálohuj místní postup a klepni na PROPOJIT znovu pro jeho nahrazení.',
               '⚠️ Cloud has ' + remote.profile.xp + ' XP, device ' + local.xp + ' XP. Back up local progress, then tap LINK again to replace it.');
        return;
      }
      link = { ...parsed, revision:remote.revision, base:serial(remote.profile) };
      markSynced();
      game.setProfile(remote.profile);
      // Keep the linking code visible rather than silently clearing it.
      el('syncCode').value = linkCode(link);
      confirmCode = '';
      status('✅ Zařízení propojeno, postup načten.', '✅ Device linked and progress loaded.');
    } catch (_) { status('❌ Cloud se nepodařilo načíst. Místní data zůstala.', '❌ Cloud unavailable. Local data was not changed.'); }
    finally { busy = false; refresh(); }
  }
  async function syncNow() {
    if (!link || busy || deleting) return;
    if (navigator.onLine === false) {
      status('📴 Offline – změny jsou uložené v zařízení, přenesou se po připojení.', '📴 Offline – progress is saved locally and will sync when online.');
      return;
    }
    const identity = link;
    busy = true;
    status('🔄 Probíhá synchronizace…', '🔄 Sync in progress…');
    try {
      const remote = await request({action:'load',id:identity.id,token:identity.token});
      if (identity !== link) return;
      if (!valid(remote.profile) || !Number.isSafeInteger(remote.revision)) throw Error('invalid_remote');
      const local = game.getProfile();
      const localSnapshot = serial(local), cloudSnapshot = serial(remote.profile);
      if (remote.revision !== identity.revision) {
        if (localSnapshot === identity.base) {
          if (!game.canApply()) {
            status('☁️ Nový postup čeká na návrat do menu.', '☁️ New cloud progress will load when you return to the menu.');
            return;
          }
          identity.revision = remote.revision; identity.base = cloudSnapshot; markSynced(identity);
          conflict = null; game.setProfile(remote.profile);
          status('✅ Novější postup načtený z cloudu.', '✅ New progress loaded from cloud.');
          return;
        }
        if (cloudSnapshot === identity.base || cloudSnapshot === localSnapshot) {
          identity.revision = remote.revision; identity.base = cloudSnapshot; persist();
        } else {
          conflict = {revision:remote.revision,profile:remote.profile};
          confirmResolution = '';
          status('⚠️ Rozdílný postup: cloud ' + remote.profile.xp + ' XP, zařízení ' + local.xp + ' XP. Vyber verzi níže.',
                 '⚠️ Different progress: cloud ' + remote.profile.xp + ' XP, device ' + local.xp + ' XP. Choose below.');
          return;
        }
      }
      const current = game.getProfile();
      if (serial(current) !== identity.base) {
        if (!valid(current)) throw Error('invalid_local');
        const saved = await request({
          action:'save',id:identity.id,token:identity.token,
          expectedRevision:identity.revision,profile:current
        });
        identity.revision = saved.revision; identity.base = serial(current);markSynced(identity);
        conflict = null;
        status('✅ Postup uložený do cloudu.', '✅ Progress saved to cloud.');
        if (serial(game.getProfile()) !== identity.base) schedule();
      } else {
        conflict = null;markSynced(identity);
        status('✅ Postup je synchronizovaný.', '✅ Progress is synced.');
      }
    } catch (error) {
      if (error && error.message === 'conflict') schedule();
      status('⚠️ Synchronizace se nezdařila. Místní postup je zachovaný.', '⚠️ Sync failed. Local progress is preserved.');
    } finally {busy = false; refresh();}
  }
  async function resolve(preference) {
    if (!conflict || !link || busy) return;
    if (confirmResolution !== preference) {
      confirmResolution = preference;
      status('⚠️ Klepni na stejnou volbu ještě jednou pro potvrzení.', '⚠️ Tap the same choice again to confirm.');
      return;
    }
    busy = true; refresh();
    try {
      const remote = await request({action:'load',id:link.id,token:link.token});
      if (!valid(remote.profile)) throw Error('invalid_remote');
      if (preference === 'cloud') {
        link.revision = remote.revision;link.base = serial(remote.profile);markSynced();
        conflict = null;game.setProfile(remote.profile);
      } else {
        const local = game.getProfile();
        if (!valid(local)) throw Error('invalid_local');
        const saved = await request({
          action:'save',id:link.id,token:link.token,
          expectedRevision:remote.revision,profile:local
        });
        link.revision = saved.revision;link.base = serial(local);markSynced();conflict = null;
        if (serial(game.getProfile()) !== link.base) schedule();
      }
      confirmResolution = '';
      status('✅ Vybraný postup byl zachován.', '✅ Selected progress was kept.');
    } catch (_) {status('⚠️ Stav se změnil, zkus znovu synchronizovat.', '⚠️ Progress changed. Try syncing again.');}
    finally {busy = false;refresh();}
  }
  async function copyCode() {
    if (!link) return;
    const code = linkCode(link);
    const field = el('syncLinkedCode');
    // Show the same code we copy. Clipboard success must not leave the field blank.
    field.value = code;
    field.scrollIntoView({block:'center',behavior:'smooth'});
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code);
        status('📋 Kód zkopírován. Chraň ho jako heslo.', '📋 Code copied. Keep it private.');
        return;
      }
    } catch (_) {}
    field.focus();field.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_) {}
    status(copied ? '📋 Kód zkopírován.' : 'Označený kód zkopíruj ručně.',
           copied ? '📋 Code copied.' : 'Copy the selected code manually.');
  }
  function disconnect() {
    if (!link || busy) return;
    if (!confirmDisconnect) {
      confirmDisconnect = true;
      status('⚠️ Klepni znovu pro odpojení. Cloud zůstane uložený; kód si předem uschovej.',
             '⚠️ Tap again to disconnect. Cloud data remains; save the code first.');
      return;
    }
    link = null; conflict = null; confirmDisconnect = false;
    clearTimeout(timer); persist(); el('syncCode').value = ''; el('syncLinkedCode').value = ''; el('syncManage').open = false;
    status('Odpojeno. Místní XP zůstávají.', 'Disconnected. Local XP remain.');
  }

  // Destructive action is separate from sync controls; never delete on a single tap.
  function updateDeleteConfirmation(){
    const phrase = cs() ? 'SMAZAT' : 'DELETE';
    const typed = el('deleteProgressPhrase').value.trim().toLocaleUpperCase();
    el('deleteProgressFinal').disabled = deleting || busy || typed !== phrase;
  }
  function closeDeleteConfirmation(){
    if(deleting)return;
    el('deleteProgressConfirm').classList.add('hidden');
    el('deleteProgressPhrase').value='';
    el('deleteProgressStatus').textContent='';
    updateDeleteConfirmation();
  }
  function openDeleteConfirmation(){
    if(deleting || busy)return;
    el('deleteProgressConfirm').classList.remove('hidden');
    el('deleteProgressPhrase').value='';
    el('deleteProgressStatus').textContent='';
    updateDeleteConfirmation();
    el('deleteProgressConfirm').scrollIntoView({behavior:'smooth',block:'center'});
  }
  async function deleteAllProgress(){
    if(deleting || busy)return;
    if(el('deleteProgressPhrase').value.trim().toLocaleUpperCase() !== (cs() ? 'SMAZAT' : 'DELETE'))return;
    deleting = true;clearTimeout(timer); el('deleteProgressFinal').disabled=true;
    el('deleteProgressCancel').disabled=true;
    el('deleteProgressStart').disabled=true;
    el('deleteProgressStatus').textContent=msg('⏳ Mažu připojený cloudový profil a místní postup…','⏳ Removing cloud profile and local progress…');
    try{
      // If cloud deletion fails, preserve everything, including the local link and XP.
      // Deleting the server copy requires the current device's private capability token.
      if(link){
        if(navigator.onLine===false)throw Error('offline');
        await request({action:'delete',id:link.id,token:link.token});
      }
      link=null;conflict=null;prompt='';
      clearTimeout(timer);persist();
      el('syncCode').value='';
      el('syncLinkedCode').value='';
      el('syncManage').open=false;
      game.resetProgress();
      closeDeleteAfterSuccess();
      status('🗑️ Postup na tomto zařízení a připojený cloudový profil byly smazány.','🗑️ Local progress and linked cloud profile were deleted.');
    }catch(e){
      // A failed network operation must never erase or reset local data.
      const error=String(e&&e.message||'connection_failed').slice(0,60).replace(/[^a-zA-Z0-9_ -]/g,'');
      el('deleteProgressStatus').textContent=msg('⚠️ Mazání se nezdařilo ('+error+'). Nic místního nebylo smazáno.','⚠️ Deletion failed ('+error+'). Local progress was preserved.');
    }finally{
      deleting=false;
      el('deleteProgressCancel').disabled=false;
      el('deleteProgressStart').disabled=false;
      updateDeleteConfirmation();
      refresh();
      if(link) schedule();
    }
  }
  function closeDeleteAfterSuccess(){
    el('deleteProgressConfirm').classList.add('hidden');
    el('deleteProgressPhrase').value='';
    el('deleteProgressStatus').textContent='';
  }

  el('syncCreate').addEventListener('click', create);
  el('syncConnect').addEventListener('click', connect);
  el('syncNow').addEventListener('click', syncNow);
  el('syncCopy').addEventListener('click', copyCode);
  el('syncDisconnect').addEventListener('click', disconnect);
  el('syncCloud').addEventListener('click', () => resolve('cloud'));
  el('syncDevice').addEventListener('click', () => resolve('device'));
  el('syncCode').addEventListener('input', () => {confirmCode = '';});
  el('deleteProgressStart').addEventListener('click',openDeleteConfirmation);
  el('deleteProgressCancel').addEventListener('click',closeDeleteConfirmation);
  el('deleteProgressPhrase').addEventListener('input',updateDeleteConfirmation);
  el('deleteProgressFinal').addEventListener('click',deleteAllProgress);
  window.addEventListener('gtg-profile-screen', () => {refresh();schedule();});
  window.addEventListener('gtg-home-screen', schedule);
  window.addEventListener('gtg-profile-saved', schedule);
  window.addEventListener('online', schedule);
  document.addEventListener('visibilitychange', () => {if (!document.hidden) schedule();});
  setInterval(() => {if (link && !document.hidden) schedule();}, 60000);
  refresh();
  if (link) schedule();
})();
