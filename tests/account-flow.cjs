/* Deterministic offline smoke tests for Guess the Game account preview.
 * No real accounts, network requests, Supabase keys, or user saves involved. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('account-merge.js','utf8') + '\n' + fs.readFileSync('account-test.js','utf8');
const html = fs.readFileSync('preview-auth-test.html','utf8');
const db = new Map();
const oldId='aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb', oldToken='f'.repeat(64);
const oldProfile = profile(135);
let oldLoads=0;
function profile(xp){return {xp,played:1,bestScore:12,totalCorrect:1,bestStreak:1,shards:0,crowns:0};}
const clone=v=>JSON.parse(JSON.stringify(v));
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));};
function browser({name='browser',initialXP=0,storage=new Map(),initialUser=null,authFails=false}={}){
  const events=new Map(), dom=new Map(), timers=new Map();
  let gameProfile=profile(initialXP), authenticatedUser=initialUser, timerId=0;
  const getEl=id=>{
    if(!dom.has(id)){
      const classes=new Set(['authForm','authAccount','authFirstChoice','authConflict','deleteProgressConfirm'].includes(id)?['hidden']:[]);
      dom.set(id,{
        value:'',textContent:'',disabled:false,open:false,
        classList:{add:s=>classes.add(s),remove:s=>classes.delete(s),contains:s=>classes.has(s),toggle:(s,v)=>v?classes.add(s):classes.delete(s)},
        scrollIntoView(){},focus(){},select(){},
        addEventListener:(kind,cb)=>events.set(id+':'+kind,cb)
      });
    }
    return dom.get(id);
  };
  const emit=name=>{const cb=events.get('window:'+name);if(cb)cb();};
  const game={
    language:()=> 'cs',
    canApply:()=>true,
    getProfile:()=>clone(gameProfile),
    getEmptyProfile:()=>profile(0),
    setArcadeAvatar:id=>{game.arcadeAvatar=id;},
    setArcadeWallet:wallet=>{game.sharedWallet=wallet;},
    setArcadeTheme:theme=>{game.sharedTheme=theme;},
    setProfile:p=>{gameProfile=clone(p);storage.set('gtg.accountTest.v1.profile',JSON.stringify(gameProfile));emit('gtg-profile-saved')},
    resetProgress:()=>{gameProfile=profile(0);storage.set('gtg.accountTest.v1.profile',JSON.stringify(gameProfile));emit('gtg-profile-saved')}
  };
  const auth={
    getUser:async()=>{if(authFails)throw Error('network_down');return {data:{user:authenticatedUser},error:null}},
    signUp:async({email})=>{authenticatedUser={id:email.startsWith('legacy')?'cccccccc-cccc-4ccc-8ccc-cccccccccccc':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email};return {data:{session:{access_token:'fake'},user:authenticatedUser},error:null}},
    signInWithPassword:async({email})=>{authenticatedUser={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email};return {data:{session:{access_token:'fake'},user:authenticatedUser},error:null}},
    signOut:async()=>{authenticatedUser=null;return {error:null}},
    resetPasswordForEmail:async(email,{redirectTo})=>{
      auth.lastReset={email,redirectTo};return {error:null};
    },
    updateUser:async({password})=>{auth.updatedPassword=password;return {error:null}},
    onAuthStateChange:cb=>{auth.emitAuth=cb;return {data:{subscription:{unsubscribe(){}}}}}
  };
  const from=(table)=>{
    if(table==='arcade_profiles'){
      const stub={select:()=>stub,eq:()=>stub,
        maybeSingle:async()=>({data:{avatar_id:'fox'},error:null})};
      return stub;
    }
    assert.equal(table,'gtg36_account_progress','Game must query its own save or Arcade avatar');
    let action='read',data=null,where={};
    const builder={
      select:()=>builder,
      eq:(k,v)=>{where[k]=v;return builder},
      insert:(v)=>{action='insert';data=v;return builder},
      update:(v)=>{action='update';data=v;return builder},
      delete:()=>{action='delete';return builder},
      maybeSingle:async()=>{
        const row=db.get(where.user_id);
        if(action==='read')return {data:row?clone(row):null,error:null};
        if(action==='update'){
          if(!row||row.revision!==where.revision)return {data:null,error:null};
          const updated={profile:clone(data.profile),revision:row.revision+1};
          db.set(where.user_id,updated);
          return {data:{revision:updated.revision},error:null};
        }
        throw Error('Unexpected maybeSingle action '+action);
      },
      single:async()=>{
        if(action!=='insert')throw Error('Unexpected single action');
        if(db.has(data.user_id))return {data:null,error:{message:'duplicate'}};
        const row={profile:clone(data.profile),revision:1};
        db.set(data.user_id,row);
        return {data:clone(row),error:null};
      },
      then:(resolve,reject)=>{
        if(action!=='delete')throw Error('Unexpected then action');
        db.delete(where.user_id);
        return Promise.resolve({error:null}).then(resolve,reject);
      }
    };
    return builder;
  };
  const win={
    GTGSync:game,
    GTGAuthConfig:{url:'https://fake.supabase.co',publishableKey:'fake',storageKey:'fakeAuth'},
    supabase:{createClient:()=>({auth,from,rpc:async(name)=>({
      data:name==='arcade_sync_legacy'?{shards:0,crowns:0}:null,error:null
    })})},
    addEventListener:(k,cb)=>events.set('window:'+k,cb)
  };
  const doc={getElementById:getEl,addEventListener:(k,cb)=>events.set('document:'+k,cb),hidden:false};
  const localStorage={
    getItem:k=>storage.get(k)||null,
    setItem:(k,v)=>storage.set(k,String(v)),
    removeItem:k=>storage.delete(k)
  };
  const mockFetch=async (url,options)=>{
    assert.match(url,/gtg36-sync/);
    const body=JSON.parse(options.body);oldLoads++;
    if(body.action==='load' && body.id===oldId && body.token===oldToken)
      return {ok:true,json:async()=>({ok:true,revision:3,profile:clone(oldProfile)})};
    return {ok:false,json:async()=>({ok:false,error:'not_found'})};
  };
  vm.runInNewContext(source,{
    window:win, document:doc, localStorage,navigator:{onLine:true},
    location:{origin:'https://test.example',pathname:'/preview-auth-test.html'},
    fetch:mockFetch, Date, Promise, JSON, console,
    setInterval:()=>0,
    setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id},
    clearTimeout:id=>timers.delete(id),
    // no cross-browser access or real network
  },{filename:'account-test.js'});
  const api={
    name,storage,el:getEl,events,auth,
    async click(id){const cb=events.get(id+':click');assert.ok(cb,'Missing '+id+' handler');await cb();await flush()},
    input(id,value){getEl(id).value=value;events.get(id+':input')?.()},
    setXP(xp){gameProfile.xp=xp;storage.set('gtg.accountTest.v1.profile',JSON.stringify(gameProfile));emit('gtg-profile-saved')},
    getXP:()=>gameProfile.xp,
    get user(){return authenticatedUser},
    async settle(){await flush()},
    async runTimers(){const work=[...timers.values()];timers.clear();for(const fn of work){await fn();await flush()}}
  };
  return api;
}
(async()=>{
  // Pure merge invariants: no doubling of XP, currencies, or consumable rewards.
  const sandbox={window:{}};
  vm.runInNewContext(fs.readFileSync('account-merge.js','utf8'),sandbox);
  const merge=sandbox.window.GTGAccountMerge.merge;
  const cloudBase={...profile(100),shards:5,crowns:7,badgeState:{first:true},
    cosmetics:{themes:['classic'],avatars:['alien'],theme:'classic',avatar:'alien'},
    dailyClaimed:'2026-11-05'};
  const guestBase={...profile(80),shards:15,crowns:9,badgeState:{veteran25:true},
    cosmetics:{themes:['classic','retro'],avatars:['alien','fox'],theme:'retro',avatar:'fox'},
    dailyClaimed:'2026-11-05'};
  const mergedProfile=merge(cloudBase,guestBase);
  assert.equal(mergedProfile.xp,100,'XP must never be summed');
  assert.equal(mergedProfile.shards,15,'shards must never be summed');
  assert.equal(mergedProfile.crowns,9,'crowns must never be summed');
  assert.equal(mergedProfile.badgeState.first,true);
  assert.equal(mergedProfile.badgeState.veteran25,true);
  assert.ok(mergedProfile.cosmetics.avatars.includes('fox'));
  assert.equal(mergedProfile.dailyClaimed,'2026-11-05');
  assert.equal(JSON.stringify(merge(mergedProfile,guestBase)),JSON.stringify(mergedProfile),'merge must be idempotent');

  for(const id of ['authLegacyAvailable','authImportLegacy','authLegacyCode','authLegacyStatus'])
    assert.ok(html.includes('id="'+id+'"'),'Missing UI id '+id);
  const a=browser({name:'Chrome',initialXP:40});
  await a.settle();
  assert.equal(a.el('authGuest').classList.contains('hidden'),false);
  await a.click('authShowSignup');
  a.input('authEmailInput','player@example.test');
  a.input('authPasswordInput','password12345');
  await a.click('authSubmit');
  assert.equal(a.el('authFirstChoice').classList.contains('hidden'),false);
  await a.click('authImportGuest');
  assert.equal(db.get(a.user.id).profile.xp,40,'guest progress must be transferred');
  a.setXP(62);
  await a.click('authSyncNow');
  assert.equal(db.get(a.user.id).profile.xp,62,'account progress must sync');
  await a.click('authLogout');
  assert.equal(a.getXP(),40,'logout restores guest progress');
  assert.equal(a.user,null);

  // Account login in a different browser loads the same server-owned progression.
  const b=browser({name:'Firefox'});
  await b.settle();
  await b.click('authShowLogin');
  b.input('authEmailInput','player@example.test');
  b.input('authPasswordInput','password12345');
  await b.click('authSubmit');
  await b.runTimers();
  assert.equal(b.getXP(),62,'cross-browser account progress must load');
  b.setXP(84);
  await b.click('authSyncNow');
  assert.equal(db.get(b.user.id).profile.xp,84);

  // Offline reload must NOT convert the last account save into guest progress.
  const offline=browser({name:'Offline Chrome',initialXP:62,storage:b.storage,authFails:true});
  await offline.settle();
  assert.equal(offline.getXP(),0,'offline guest must be separate from cached account');
  assert.equal(db.get(b.user.id).profile.xp,84);

  // Guest merge into an EXISTING account must preview, never add XP together,
  // retain original guest save, and be idempotent on repeat.
  const merged=browser({name:'Account merge',initialXP:126});
  await merged.settle();
  await merged.click('authShowLogin');
  merged.input('authEmailInput','player@example.test');
  merged.input('authPasswordInput','password12345');
  await merged.click('authSubmit');
  await merged.runTimers();
  assert.equal(merged.getXP(),84,'existing account loaded before merge');
  await merged.click('authMergeGuest');
  assert.equal(db.get(merged.user.id).profile.xp,84,'preview must not change cloud XP');
  assert.match(merged.el('authMergePreview').textContent,/84 XP.*126 XP.*126 XP/,'preview shows both saves and result');
  await merged.click('authMergeGuest');
  assert.equal(db.get(merged.user.id).profile.xp,126,'merge conservatively keeps maximum XP');
  assert.equal(merged.getXP(),126,'merged result immediately visible');
  assert.equal(JSON.parse(merged.storage.get('gtg.accountTest.v1.guestProfile')).xp,126,'original guest preserved');
  assert.equal(JSON.parse(merged.storage.get('gtg.accountTest.v1.accountCache.'+merged.user.id+'.beforeMerge')).profile.xp,84,'old account backup preserved');
  const mergeRevision=db.get(merged.user.id).revision;
  await merged.click('authMergeGuest');
  assert.equal(db.get(merged.user.id).revision,mergeRevision,'repeat merge must not save or duplicate rewards');
  await merged.click('authLogout');
  assert.equal(merged.getXP(),126,'guest remains intact after logging out from merged account');

  // Old GTGS1 cloud saves can be copied (never destroyed) into a NEW account.
  const cStorage=new Map();
  cStorage.set('gtg.syncTest.v1.cloudSync',JSON.stringify({id:oldId,token:oldToken,revision:3,base:'{}'}));
  const c=browser({name:'Legacy migration',initialXP:10,storage:cStorage});
  await c.settle();
  await c.click('authShowSignup');
  c.input('authEmailInput','legacy@example.test');
  c.input('authPasswordInput','password12345');
  await c.click('authSubmit');
  await c.click('authImportLegacy');
  assert.match(c.el('authLegacyStatus').textContent,/135 XP/,'first click previews XP');
  assert.equal(c.getXP(),10,'preview must not overwrite guest progress');
  await c.click('authImportLegacy');
  assert.equal(db.get(c.user.id).profile.xp,135,'confirmed legacy copy imports XP');
  assert.equal(cStorage.has('gtg.syncTest.v1.cloudSync'),true,'original link stays');
  assert.equal(oldProfile.xp,135,'old cloud data preserved');
  assert.ok(oldLoads>=2,'old cloud revalidated before committing');

  // Password recovery must request an email without demanding the old password.
  const p=browser({name:'Recovery',initialXP:77});
  await p.settle();
  await p.click('authShowLogin');
  await p.click('authForgotPassword');
  assert.equal(p.el('authPasswordInput').classList.contains('hidden'),true,
    'request form must not require an existing password');
  p.input('authEmailInput','player@example.test');
  await p.click('authSubmit');
  assert.equal(p.auth.lastReset.email,'player@example.test');
  assert.equal(p.auth.lastReset.redirectTo,'https://test.example/preview-auth-test.html',
    'reset email must return to playable test page');
  assert.equal(p.getXP(),77,'reset email must preserve guest progress');
  p.auth.emitAuth('PASSWORD_RECOVERY',{user:{id:'fake-recovery-user'}});
  assert.equal(p.el('authRecoveryOverlay').classList.contains('hidden'),false,
    'verified recovery link must open password editor');
  p.input('authNewPassword','differentA123');
  p.input('authNewPasswordAgain','differentB123');
  await p.click('authRecoverySave');
  assert.equal(p.auth.updatedPassword,undefined,'mismatched new passwords must be rejected');
  p.input('authNewPasswordAgain','differentA123');
  await p.click('authRecoverySave');
  assert.equal(p.auth.updatedPassword,'differentA123',
    'new password should be sent only after verified reset link');
  assert.equal(p.el('authRecoveryOverlay').classList.contains('hidden'),true);
  assert.equal(p.getXP(),77,'password reset must not alter XP');

  // No deletion without exact confirmation phrase; deletion only of cloud save.
  await c.click('deleteProgressStart');
  c.input('deleteProgressPhrase','NOT YET');
  assert.equal(c.el('deleteProgressFinal').disabled,true);
  c.input('deleteProgressPhrase','SMAZAT');
  assert.equal(c.el('deleteProgressFinal').disabled,false);
  await c.click('deleteProgressFinal');
  assert.equal(db.has(c.user.id),false);
  assert.ok(c.user,'Auth identity remains after game data deletion');
  console.log('PASS account-flow: guest, signup, cloud sync, cross-browser, logout, offline isolation, existing account safe merge, legacy copy, guarded deletion, verified password recovery');
})().catch(error=>{console.error(error);process.exitCode=1;});