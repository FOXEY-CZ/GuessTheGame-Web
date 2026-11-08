'use strict';
/* Multi-game Arcade: old responses must not overwrite a newly selected friend's
 * head-to-head history or leak through sign-out. No server calls except mocks. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('arcade/index.html','utf8');
const js=fs.readFileSync('arcade/live.js','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
const self='11111111-1111-4111-8111-111111111111';
const alice='22222222-2222-4222-8222-222222222222';
const bob='33333333-3333-4333-8333-333333333333';
const carol='44444444-4444-4444-8444-444444444444';
const profiles={[alice]:{user_id:alice,nickname:'Alice'},[bob]:{user_id:bob,nickname:'Bob'},
 [carol]:{user_id:carol,nickname:'Carol'}};
const pending=new Map();
class Node{
 constructor(id=''){
  this.id=id;this.textContent='';this.children=[];this.events={};
  this.className='';this.value='';
  const classes=new Set();
  this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),
    toggle:(x,on)=>on?classes.add(x):classes.delete(x),
    contains:x=>classes.has(x)};
 }
 replaceChildren(...items){this.children=[...items];}
 append(...items){this.children.push(...items);}
 addEventListener(name,listener){this.events[name]=listener;}
 scrollIntoView(){}focus(){}
}
const nodes=new Map(ids.map(id=>[id,new Node(id)]));
const document={getElementById:id=>nodes.get(id),createElement:id=>new Node(id),
  visibilityState:'visible',addEventListener(){}};
const local=new Map();
const window={FOXEY_I18N:{getLocale:()=> 'cs'},addEventListener(){},
  setInterval(){},sessionStorage:{
    getItem:key=>local.get(key)||null,setItem:(key,value)=>local.set(key,value),
    removeItem:key=>local.delete(key)
  }};
const api={rpc:async(name,args={})=>{
 if(name==='arcade_live_ping')return {data:{ok:true}};
 if(name==='arcade_live_dashboard')return {data:{ok:true,
   friends:Object.values(profiles).map(profile=>({profile,online:true})),matches:[]}};
 if(name==='arcade_live_stats')return {data:{ok:true,self:null,leaderboard:[]}};
 if(name==='arcade_live_head_to_head'){
  const id=args.p_friend_id;
  return new Promise(resolve=>{
    const items=pending.get(id)||[];items.push(resolve);pending.set(id,items);
  });
 }
 throw Error('unexpected RPC '+name);
}};
const location={href:'https://foxey-cz.github.io/GuessTheGame-Web/arcade/',search:''};
vm.runInNewContext(js,{window,document,location,console,
  URLSearchParams,navigator:{onLine:true},crypto:{randomUUID:()=>self},setTimeout});
const ui=window.FOXEY_ARCADE_LIVE;
ui.setNavigation(()=>{});
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve))};
function resolveHistory(id){
 const resolves=pending.get(id);
 assert.ok(resolves?.length,'no in-flight request for '+id);
 pending.delete(id);
 for(const resolve of resolves)resolve({data:{ok:true,friend:profiles[id],
  summary:{played:1,wins:1,losses:0,draws:0,points_scored:10,points_conceded:8},
  history:[{match_id:id,mode:'classic',
    my_score:10,opponent_score:8,result:'win',
    finished_at:'2026-11-08T20:00:00Z'}]}});
}
(async()=>{
 ui.connect(api,{id:self});
 await flush();
 ui.viewHeadToHead(alice);
 await flush();
 ui.viewHeadToHead(bob);
 await flush();
 assert.ok(pending.has(alice)&&pending.has(bob),
   'switching friend must launch new request even while old request runs');
 resolveHistory(bob);await flush();
 assert.ok(nodes.get('liveHeadToHeadStatus').textContent.includes('Bob'));
 assert.equal(nodes.get('liveHeadToHeadRows').children.length,1);
 resolveHistory(alice);await flush();
 assert.ok(nodes.get('liveHeadToHeadStatus').textContent.includes('Bob'),
   'stale Alice response must not overwrite Bob result');
 const old=nodes.get('liveHeadToHeadRows').children[0].children[1].textContent;
 ui.viewHeadToHead(carol);await flush();
 assert.ok(pending.has(carol));
 ui.connect(null,null);
 resolveHistory(carol);await flush();
 assert.equal(nodes.get('liveHeadToHeadRows').children.length,0,
   'sign-out must wipe displayed friend history');
 assert.ok(nodes.get('liveHeadToHeadStatus').textContent.includes('Přihlas se'),
   'sign-out must not allow an in-flight friend result to reappear');
 console.log('PASS: friend A/B race, stale results ignored, sign-out isolation of H2H history.');
})().catch(e=>{console.error(e);process.exitCode=1});