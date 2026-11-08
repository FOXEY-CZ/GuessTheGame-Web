'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('arcade/index.html','utf8');
const js=fs.readFileSync('arcade/app.js','utf8');
for(const id of ['homeLevelFill','accountLevelFill','homeLevelBar','accountLevelBar',
  'homeAchievementGrid','accountAchievementGrid','arcadeAchievementToast']){
  assert.ok(html.includes('id="'+id+'"'), 'missing achievement UI '+id);
}
const start=js.indexOf('  const achievementsEnglish=');
const end=js.indexOf('  function renderArcadeProgress(){',start);
assert.ok(start>0 && end>start, 'isolated achievements handlers missing');
const extracted=js.slice(start,end);
assert.ok(extracted.includes("supa.rpc('arcade_global_achievements')"));
assert.ok(!extracted.includes("from('arcade_wallets').update"));
assert.ok(!extracted.includes("from('arcade_achievement_unlocks').update"));
// Privacy regression: no stale achievements from a previous account should be
// shown after explicit sign-out, even with an in-flight server response.
const logoutStart=js.indexOf('  async function signOut(){');
const logoutEnd=js.indexOf('  // Explicitly connect existing SPA router',logoutStart);
assert.ok(logoutStart>=0&&logoutEnd>logoutStart,'sign-out handler missing');
const logout=js.slice(logoutStart,logoutEnd);
assert.ok(logout.includes("++achievementSeq;achievements=null;achievementStatus='guest'"),
  'logout must invalidate pending achievement reads and clear cached account rewards');
assert.ok(logout.includes("el('arcadeAchievementToast')?.classList.add('hidden')"),
  'logout must clear previous-account achievement popup');
const nodes=new Map();
function domElement(tag='div'){
 return {
  tag,className:'',textContent:'',children:[],style:{},attrs:{},
  classList:{add(){},remove(){}},
  append(...children){this.children.push(...children);},
  replaceChildren(...children){this.children=children;},
  setAttribute(k,v){this.attrs[k]=v;},
 };
}
const el=id=>{
 if(!nodes.has(id))nodes.set(id,domElement());
 return nodes.get(id);
};
let locale='cs', walletReloads=0, rpcCount=0;
let serverRows=[
 {code:'level_5',icon:'🥉',name_cs:'Bronzová liška',
  name_en:'Bronze Fox',description_cs:'Dosáhni levelu 5.',
  description_en:'Reach level 5.',progress:4,target:5,
  reward_shards:15,reward_chests:1,unlocked:false},
 {code:'first_game',icon:'🎮',name_cs:'První krok',
  name_en:'First Steps',description_cs:'Dohraj partii.',
  description_en:'Finish a game.',progress:1,target:1,
  reward_shards:5,reward_chests:0,unlocked:true}
];
let newUnlocks=[];
const scope=vm.runInNewContext(`(function(){
  const el=globalThis.el;
  const document=globalThis.document;
  const window=globalThis.window;
  const supa=globalThis.supa;
  const safeNum=globalThis.safeNum;
  const loadSharedWallet=globalThis.loadSharedWallet;
  const setTimeout=globalThis.setTimeout;
  const clearTimeout=globalThis.clearTimeout;
  let user={id:'test-user'},profile={arcade_xp:390};
  let achievements=null,achievementStatus='guest',
      achievementSeq=0,achToastTimer=null;
  ${extracted}
  return {loadAchievements,renderAchievements,
    setXp:x=>{profile.arcade_xp=x;},
    setUser:x=>{user=x;},getStatus:()=>achievementStatus};
})();`,{
  el,document:{createElement:domElement},
  window:{FOXEY_I18N:{getLocale:()=>locale}},
  supa:{rpc:async(name)=>{
    rpcCount++;assert.equal(name,'arcade_global_achievements');
    return {data:{ok:true,achievements:serverRows,new_achievements:newUnlocks},error:null};
  }},
  safeNum:n=>Number.isSafeInteger(n)&&n>=0?n:0,
  loadSharedWallet:()=>{walletReloads++;},
  setTimeout:()=>1,clearTimeout:()=>{},
});
(async()=>{
 await scope.loadAchievements();
 assert.equal(scope.getStatus(),'ready');
 assert.equal(el('accountAchievementGrid').children.length,2);
 assert.equal(el('homeAchievementGrid').children.length,2);
 assert.equal(el('homeLevelProgress').textContent,'90 / 100 XP');
 assert.equal(el('homeLevelFill').style.width,'90%');
 assert.equal(el('accountAchievementCount').textContent,'1 / 2');
 assert.equal(walletReloads,0,'read-only dashboard must not credit wallets');

 locale='en';scope.renderAchievements();
 assert.equal(el('accountAchievementGrid').children[0].children[1].children[0].textContent,
   'Bronze Fox');
 scope.setXp(510);scope.renderAchievements();
 assert.equal(el('accountLevelFill').style.width,'10%');

 serverRows=serverRows.map(x=>x.code==='level_5'?
   {...x,progress:5,unlocked:true}:x);
 newUnlocks=[{code:'level_5',name_cs:'Bronzová liška',shards:15,free_chests:1}];
 await scope.loadAchievements();
 assert.equal(el('accountAchievementCount').textContent,'2 / 2');
 assert.equal(walletReloads,1,'new server award triggers trusted wallet reload');
 assert.equal(el('arcadeAchievementToast').classList!=null,true);
 newUnlocks=[];
 await scope.loadAchievements();
 assert.equal(walletReloads,1,'already-earned achievements cannot be reawarded');
 assert.equal(rpcCount,3);
 scope.setUser(null);scope.renderAchievements();
 assert.match(el('homeAchievementStatus').textContent,/Sign in/);
 assert.equal(el('homeAchievementGrid').children.length,0,'guest must never see previous player achievements');
 assert.equal(el('accountAchievementGrid').children.length,0,'guest must not inherit a previous account cache');
 console.log('PASS: global achievements status, XP level meter, bilingual cards, one-time server unlock and guest state');
})().catch(err=>{console.error(err);process.exitCode=1;});
