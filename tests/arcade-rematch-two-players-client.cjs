'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('arcade/index.html','utf8');
const script=fs.readFileSync('arcade/live.js','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const original='33333333-3333-4333-8333-333333333333';
const nextIds=[
 '55555555-5555-4555-8555-555555555555',
 '66666666-6666-4666-8666-666666666666',
 '77777777-7777-4777-8777-777777777777'
];
let pending=null,created=0,accepted=0,declined=0;
const counters={a:0,b:0};
const profiles={
 [a]:{user_id:a,nickname:'FOXEY'},
 [b]:{user_id:b,nickname:'Buddy'}
};
function matchFor(viewer,m){
 return {
  match_id:m.id,mode:'classic',rematch_of:m.rematch_of,
  role:m.host===viewer?'host':'guest',state:m.state,
  opponent:profiles[m.host===viewer?m.guest:m.host],
  host_score:m.host_score,guest_score:m.guest_score
 };
}
const finished={id:original,host:a,guest:b,state:'finished',rematch_of:null,host_score:7,guest_score:5};
function apiFor(viewer){
 return {rpc:async(name,args={})=>{
  if(name==='arcade_live_ping')return {data:{ok:true}};
  if(name==='arcade_live_dashboard')return {data:{ok:true,
   friends:[{profile:profiles[viewer===a?b:a],online:true}],
   matches:[...(pending?[matchFor(viewer,pending)]:[]),matchFor(viewer,finished)]}};
  if(name==='arcade_live_stats')return {data:{ok:true,
    self:{profile:profiles[viewer],played:1,wins:viewer===a?1:0,losses:viewer===b?1:0,
     draws:0,answered:10,correct:6,win_rate:viewer===a?100:0,accuracy:60},
    leaderboard:[]}};
  if(name==='arcade_live_state'){
    const m=args.p_match_id===original?finished:pending?.id===args.p_match_id?pending:null;
    if(!m)return {error:{message:'match_unavailable'}};
    return {data:{ok:true,...matchFor(viewer,m),host_ready:false,guest_ready:false,
      question_index:0,round_deadline:null,question:null,
      my_answered:false,opponent_answered:false,credited:false}};
  }
  if(name==='arcade_live_rematch'){
    assert.equal(args.p_finished_match,original);
    if(!pending||!['invited','lobby','running'].includes(pending.state)){
      pending={id:nextIds[created],host:viewer,guest:viewer===a?b:a,
        rematch_of:original,state:'invited',host_score:0,guest_score:0};
      created++;
      return {data:{ok:true,match_id:pending.id,mode:'classic',
        rematch_of:original,existing:false,role:'host',needs_acceptance:false}};
    }
    return {data:{ok:true,match_id:pending.id,mode:'classic',
      rematch_of:original,state:pending.state,existing:true,
      role:pending.host===viewer?'host':'guest',
      needs_acceptance:pending.guest===viewer&&pending.state==='invited'}};
  }
  if(name==='arcade_live_respond'){
    assert.equal(args.p_match_id,pending?.id);
    assert.equal(viewer,pending.guest,'only invited user may respond');
    if(args.p_accept){accepted++;pending.state='lobby';}
    else {declined++;pending.state='declined';}
    return {data:{ok:true,state:pending.state}};
  }
  if(name==='arcade_live_cancel'){
    if(args.p_match_id!==pending?.id)return {error:{message:'invalid_match'}};
    pending.state='cancelled';return {data:{ok:true,state:'cancelled'}};
  }
  throw Error('Unexpected RPC '+name);
 }};
}
class Node{
 constructor(id=''){
  this.id=id;this.children=[];this.events={};this.textContent='';this.className='';
  this.value=id==='liveModeSelect'?'classic':'';this.disabled=false;
  const classes=new Set(id==='liveArena'?['hidden']:[]);
  this.classList={
    add:x=>classes.add(x),remove:x=>classes.delete(x),
    toggle:(x,v)=>{if(v)classes.add(x);else classes.delete(x);},
    contains:x=>classes.has(x)
  };
 }
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=[...items];}
 addEventListener(name,cb){this.events[name]=cb;}
 scrollIntoView(){}focus(){}
}
function client(owner){
 const elements=new Map(ids.map(id=>[id,new Node(id)]));
 const document={
  getElementById:id=>elements.get(id),
  createElement:tag=>new Node(tag),
  addEventListener(){},visibilityState:'visible'
 };
 const storage=new Map();
 const window={
  FOXEY_I18N:{getLocale:()=> 'cs'},
  FOXEY_ARCADE_SOCIAL:{refreshInbox(){}},
  addEventListener(){},setInterval(){},
  sessionStorage:{
   getItem:k=>storage.get(k)||null,
   setItem:(k,v)=>storage.set(k,v),
   removeItem:k=>storage.delete(k)
  }
 };
 let calls=0;
 const crypto={randomUUID:()=>{
  calls++;return '44444444-4444-4444-8444-'+String(calls).padStart(12,'0');
 }};
 const navigator={onLine:true};
 const location={search:'',href:'https://foxey-cz.github.io/GuessTheGame-Web/arcade/'};
 vm.runInNewContext(script,{
  document,window,crypto,navigator,location,URLSearchParams,console,setTimeout
 });
 const ui=window.FOXEY_ARCADE_LIVE;
 ui.setNavigation(()=>{});
 ui.connect(apiFor(owner),{id:owner});
 ui.onPage('community');
 return {ui,elements};
}
const settle=async()=>{for(let n=0;n<7;n++)
 await new Promise(resolve=>setImmediate(resolve));};
const buttons=elements=>elements.get('liveArenaControls').children;
const button=(elements,pattern)=>buttons(elements).find(x=>pattern.test(x.textContent));
(async()=>{
 const host=client(a),guest=client(b);
 await settle();
 await host.ui.openMatch(original,false);
 await guest.ui.openMatch(original,false);
 assert.ok(button(host.elements,/Požádat o odvetu/));
 assert.ok(button(guest.elements,/Požádat o odvetu/));
 // A first request creates exactly one new private live match.
 button(host.elements,/Požádat o odvetu/).events.click();
 await settle();
 assert.equal(created,1);
 assert.ok(host.elements.get('liveArenaStatus').textContent.includes('Čeká'));
 // Simulate stale phone B: its old screen still says "Request rematch".
 button(guest.elements,/Požádat o odvetu/).events.click();
 await settle();
 assert.equal(created,1,'stale second phone must reuse existing invitation');
 assert.ok(button(guest.elements,/Přijmout odvetu/),
   'stale guest rematch must open explicit consent');
 assert.ok(button(guest.elements,/Odmítnout odvetu/));
 assert.equal(accepted,0,'requesting rematch must NOT auto-accept opponent request');
 // Guest refuses; old winner/score is intact, both can request anew.
 button(guest.elements,/Odmítnout odvetu/).events.click();
 await settle();
 assert.equal(declined,1);
 assert.equal(pending.state,'declined');
 await host.ui.openMatch(original,false);
 await guest.ui.openMatch(original,false);
 await host.ui.refresh(true);await guest.ui.refresh(true);
 assert.ok(button(host.elements,/Požádat o odvetu/));
 // B now requests; A should see the consent prompt while viewing old result.
 button(guest.elements,/Požádat o odvetu/).events.click();
 await settle();
 assert.equal(created,2);
 await host.ui.refresh(true);await settle();
 assert.ok(button(host.elements,/Přijmout odvetu/),
   'opponent request must appear as accept button on finished-match results');
 assert.ok(button(host.elements,/Odmítnout odvetu/));
 assert.equal(host.elements.get('liveQuestion').children[2].textContent.includes('rematch'),false);
 button(host.elements,/Přijmout odvetu/).events.click();
 await settle();
 assert.equal(accepted,1);
 assert.equal(pending.state,'lobby');
 assert.equal(created,2,'accepting must not spawn another new duel');
 assert.ok(host.elements.get('liveArenaStatus').textContent.includes('oba hráči'));
 assert.equal(finished.state,'finished');
 assert.equal(finished.host_score,7);
 assert.equal(finished.guest_score,5);
 host.ui.connect(null,null);guest.ui.connect(null,null);
 console.log('PASS: two phones, reciprocal rematch, stale retry reuse, explicit accept/decline, original scores untouched.');
})().catch(err=>{console.error(err);process.exitCode=1;});