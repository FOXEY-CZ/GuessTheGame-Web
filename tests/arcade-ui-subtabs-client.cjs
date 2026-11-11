'use strict';
// UI-only regression: categorizing Arcade panels must never modify
// account data, purchases, gameplay, or the legacy inventory renderer.
const fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../arcade/index.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../arcade/app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../arcade/styles.css'),'utf8');

const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
assert.equal(ids.length,new Set(ids).size,'HTML IDs must be unique');
const account=['overview','achievements','inventory','stats'],shop=['chests','themes','avatars'];
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
for(const [prefix,keys] of [['account',account],['shop',shop]]){
 assert.ok(html.includes('id="'+prefix+'Tabs"'),prefix+' nav missing');
 for(const key of keys){
   const id=prefix+'Tab'+cap(key),panel=prefix+'Panel'+cap(key);
   assert.ok(html.includes('id="'+id+'"'),id+' missing');
   assert.ok(html.includes('id="'+panel+'"'),panel+' missing');
   assert.ok(html.includes('aria-controls="'+panel+'"'),id+' missing linkage');
   assert.ok(html.includes('aria-labelledby="'+id+'"'),panel+' missing linkage');
 }
}
const sections=[];const sectionIds=[];
for(const hit of html.matchAll(/<\/?section\b[^>]*>/g)){
 const tag=hit[0];
 if(tag.startsWith('</')){
   assert.ok(sections.length>0,'section closes without open');
   sections.pop();
 }else{
   const id=tag.match(/\bid="([^"]+)"/)?.[1]||'anonymous';
   if(/^(shopPanel|accountPanel)/.test(id)){
     assert.ok(sections.includes(id.startsWith('shop')?'page-shop':'page-account'),
       'subpanel should belong to its page');
     sectionIds.push(id);
   }
   sections.push(id);
 }
}
assert.deepEqual(sections,[],'All page sections must be closed');
assert.equal(sectionIds.length,7,'Expected 7 categorised sections');
assert.match(html,/id="accountPanelOverview"[\s\S]*?id="profileForm"/);
assert.match(html,/id="accountPanelAchievements"[\s\S]*?id="accountAchievementGrid"/);
assert.match(html,/id="accountPanelInventory"[\s\S]*?id="inventoryGrid"/);
assert.match(html,/id="accountPanelStats"[\s\S]*?id="accountXp"/);
assert.match(html,/id="shopPanelChests"[\s\S]*?id="shopOpenChest"/);
assert.match(html,/id="shopPanelThemes"[\s\S]*?id="shopThemes"/);
assert.match(html,/id="shopPanelAvatars"[\s\S]*?id="claimPrestige"/);
assert.ok(css.includes('#playerAccount.accountpanel{width:100%'));
assert.ok(css.includes('.arcade-subtab.is-active{'));

const from=app.indexOf('  const SUBTAB_GROUPS=Object.freeze(');
const to=app.indexOf('  // All play entries open the standalone secure quiz',from);
assert.ok(from>=0&&to>from,'subtab handlers missing');
const block=app.slice(from,to);
assert.ok(!block.includes('supa.rpc('),'tab changes must not call server APIs');
assert.ok(!block.includes('gameFrame'),'tab changes cannot change game state');
assert.ok(!block.includes('sharedWallet='),'tab changes cannot alter wallets');
const nodes=new Map();
class FakeEl{
 constructor(id){this.id=id;this.hidden=false;this.tabIndex=0;this.dataset={};
  this.attrs={};this.focused=false;this.listeners={};
  this.classList={toggle:(v,condition)=>{if(v==='hidden')this.hidden=condition;}};
 }
 setAttribute(k,v){this.attrs[k]=v;}
 focus(){this.focused=true;}
 addEventListener(type,fn){this.listeners[type]=fn;}
 querySelectorAll(sel){
  assert.equal(sel,'button[role="tab"]');
  const prefix=this.id==='accountTabs'?'account':'shop';
  return (prefix==='account'?account:shop).map(key=>nodes.get(prefix+'Tab'+cap(key)));
 }
}
for(const id of ids)nodes.set(id,new FakeEl(id));
for(const [prefix,values] of [['account',account],['shop',shop]]){
 for(const key of values)nodes.get(prefix+'Tab'+cap(key)).dataset[prefix+'Tab']=key;
}
const state=vm.runInNewContext(`(()=>{
 const el=__get;
 let accountTab='overview',shopTab='chests';
 ${block}
 return {bindSubtabs,selectSubtab,active:()=>({accountTab,shopTab})};
})()`,{__get:id=>nodes.get(id)});
state.bindSubtabs('account');state.bindSubtabs('shop');
assert.equal(state.active().accountTab,'overview');
assert.equal(state.active().shopTab,'chests');
assert.equal(nodes.get('accountPanelOverview').hidden,false);
assert.equal(nodes.get('accountPanelAchievements').hidden,true);
assert.equal(nodes.get('shopPanelChests').hidden,false);
assert.equal(nodes.get('shopPanelThemes').hidden,true);

// Click navigation, check hidden sections, roving tabIndex and aria-selected.
nodes.get('accountTabInventory').listeners.click();
assert.equal(state.active().accountTab,'inventory');
assert.equal(nodes.get('accountPanelOverview').hidden,true);
assert.equal(nodes.get('accountPanelInventory').hidden,false);
assert.equal(nodes.get('accountTabInventory').attrs['aria-selected'],'true');
assert.equal(nodes.get('accountTabOverview').attrs['aria-selected'],'false');
assert.equal(nodes.get('accountTabOverview').tabIndex,-1);
let prevented=false;
nodes.get('accountTabInventory').listeners.keydown({
 key:'ArrowRight',preventDefault(){prevented=true}
});
assert.ok(prevented,'keyboard navigation should prevent page scroll');
assert.equal(state.active().accountTab,'stats');
assert.ok(nodes.get('accountTabStats').focused);
nodes.get('shopTabAvatars').listeners.click();
assert.equal(state.active().shopTab,'avatars');
assert.equal(nodes.get('shopPanelAvatars').hidden,false);
assert.equal(nodes.get('shopPanelChests').hidden,true);
state.selectSubtab('account','bogus');
assert.equal(state.active().accountTab,'stats','invalid tab must be ignored');
assert.ok(app.includes("if(button.dataset.page==='account'&&button.dataset.accountTab)"),
 'Home achievement shortcut must select profile achievements tab');
assert.ok(app.includes('el(\'shopOpenChest\').addEventListener'));
assert.ok(app.includes('el(\'profileForm\').addEventListener'));
console.log('PASS: profile/shop categories, no missing panels, mobile CSS, mouse/keyboard tabs and retained wallet/game actions');
