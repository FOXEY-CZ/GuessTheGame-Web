'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('arcade/index.html','utf8');
const app=fs.readFileSync('arcade/app.js','utf8');
const css=fs.readFileSync('arcade/styles.css','utf8');
const start=app.indexOf('  let shopRewardReturnFocus=');
const end=app.indexOf('  const fmt=n=>',start);
assert.ok(start>0&&end>start,'chest result controller missing');
assert.ok(html.indexOf('id="shopChestResult"')<html.indexOf('class="reward-chest-grid"'),
 'chest status should appear above controls, not at the bottom');
for(const id of ['shopRewardOverlay','shopRewardReveal','shopRewardArt','shopRewardName',
 'shopRewardDone','shopRewardInventory','shopRewardClose'])
 assert.ok(html.includes('id="'+id+'"'),id+' missing');
assert.ok(css.includes('.shop-reward-overlay{position:fixed'),
 'winning reward must appear immediately in viewport');
assert.ok(html.indexOf('id="shopRewardOverlay"')>html.indexOf('</main>'),
 'winning overlay must live outside transformed/hidden shop page');
const classes=()=>{const c=new Set(['hidden']);return {
 add:x=>c.add(x),remove:x=>c.delete(x),
 toggle:(x,on)=>on?c.add(x):c.delete(x),contains:x=>c.has(x)
}};
const elements=new Map();
function el(id){
 if(!elements.has(id))elements.set(id,{id,classList:classes(),
   textContent:'',focused:false,isConnected:true,focus(){this.focused=true}});
 return elements.get(id);
}
const previousFocus={isConnected:true,focused:false,focus(){this.focused=true}};
const bodyClasses=classes();
const document={activeElement:previousFocus,body:{classList:bodyClasses}};
const store=new Map();
const sessionStorage={
 getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)
};
let calls=0,reward='space-cat',walletLoads=0;
const supa={rpc:async(name,args)=>{
 assert.equal(name,'arcade_open_cosmetic_chest');
 assert.equal(args.p_tier,'basic');
 assert.equal(args.p_operation,'77777777-7777-4777-8777-777777777777');
 calls++;
 return reward==='error'?{error:{message:'insufficient_funds'}}:
  {data:{avatar:reward},error:null};
}};
const contextSource='(()=>{'+
 "let user={id:'11111111-1111-4111-8111-111111111111'};"+
 "let sharedWallet={free_chests:1},sharedCosmetics={owned_avatars:[]},walletBusy=false;"+
 "const supa=__supa,document=__document,sessionStorage=__store,el=__el;"+
 "const crypto={randomUUID:()=> '77777777-7777-4777-8777-777777777777'};"+
 "const THEME_IDS=new Set();"+
 "const AVATAR_CATALOG={'space-cat':{name:'Space Cat'},'pixel-fox':{name:'Pixel Fox'}};"+
 "const showAvatar=(id,target)=>{target.rewardId=id;};"+
 "const renderWallet=()=>{};const loadSharedWallet=async()=>{__walletLoaded();};"+
 "const notifyThemeUpdate=()=>{};"+
 app.slice(start,end)+
 'return {performShop,previewChestReward,closeChestReward,getBusy:()=>walletBusy};})()';
const VM=vm.runInNewContext(contextSource,{
 __supa:supa,__document:document,__store:sessionStorage,__el:el,
 __walletLoaded:()=>{walletLoads++},Promise
});
(async()=>{
 VM.previewChestReward();
 assert.equal(calls,0,'preview must not call purchase RPC');
 assert.equal(walletLoads,0,'preview must not touch wallet');
 assert.equal(store.size,0,'preview cannot create a charge operation');
 assert.equal(el('shopRewardTitle').textContent,'👀 Ukázka odměny');
 assert.equal(el('shopRewardRarity').textContent,'DEMO · NEZÍSKÁNO');
 assert.equal(el('shopRewardOverlay').classList.contains('hidden'),false);
 assert.equal(el('shopRewardInventory').classList.contains('hidden'),true);
 VM.closeChestReward();
 await VM.performShop('chest');
 assert.equal(calls,1,'one authorized server chest request');
 assert.equal(walletLoads,1,'reload wallet after server reward');
 assert.equal(el('shopRewardArt').rewardId,'space-cat');
 assert.equal(el('shopRewardName').textContent,'Space Cat');
 assert.equal(el('shopRewardOverlay').classList.contains('hidden'),false);
 assert.ok(bodyClasses.contains('arcade-reward-open'));
 assert.equal(el('shopRewardDone').focused,true);
 assert.ok(el('shopChestResult').textContent.includes('Odemčen avatar'));
 assert.equal(store.size,0,'clear operation only after server confirmation');
 VM.closeChestReward();
 assert.equal(el('shopRewardOverlay').classList.contains('hidden'),true);
 assert.equal(previousFocus.focused,true);
 reward='error';
 await VM.performShop('chest');
 assert.equal(el('shopRewardOverlay').classList.contains('hidden'),true);
 assert.ok(el('shopChestResult').textContent.includes('Nemáš dost krystalů'));
 assert.equal(store.size,1,'failed operation must retain the id for retry');
 console.log('PASS: 0-RPC chest demo, real centered reward, server avatar, visible error and safe retries.');
})().catch(e=>{console.error(e);process.exitCode=1});