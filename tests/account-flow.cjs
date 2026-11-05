/* Deterministic offline smoke tests for Guess the Game account preview.
 * No real accounts, network requests, Supabase keys, or user saves involved. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('account-test.js','utf8');
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
    setProfile:p=>{gameProfile=clone(p);storage.set('gtg.accountTest.v1.profile',JSON.stringify(gameProfile));emit('gtg-profile-saved')},
    resetProgress:()=>{gameProfile=profile(0);storage.set('gtg.accountTest.v1.profile',JSON.stringify(gameProfile));emit('gtg-profile-saved')}
  };
  const auth={
    getUser:async()=>{if(authFails)throw Error('network_down');return {data:{user:authenticatedUser},error:null}},
    signUp:async({email})=>{authenticatedUser={id:email.startsWith('legacy')?'cccccccc-cccc-4ccc-8ccc-cccccccccccc':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email};return {data:{session:{access_token:'fake'},user:authenticatedUser},error:null}},
    signInWithPassword:async({email})=>{authenticatedUser={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email};return {data:{session:{access_token:'fake'},user:authenticatedUser},error:null}},
    signOut:async()=>{authenticatedUser=null;return {error:null}}
  };
  const from=()=>{
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
    supabase:{createClient:()=>({auth,from})},
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

  // No deletion without exact confirmation phrase; deletion only of cloud save.
  await c.click('deleteProgressStart');
  c.input('deleteProgressPhrase','NOT YET');
  assert.equal(c.el('deleteProgressFinal').disabled,true);
  c.input('deleteProgressPhrase','SMAZAT');
  assert.equal(c.el('deleteProgressFinal').disabled,false);
  await c.click('deleteProgressFinal');
  assert.equal(db.has(c.user.id),false);
  assert.ok(c.user,'Auth identity remains after game data deletion');
  console.log('PASS account-flow: guest, signup, cloud sync, cross-browser, logout, offline isolation, legacy copy, guarded deletion');
})().catch(error=>{console.error(error);process.exitCode=1;});