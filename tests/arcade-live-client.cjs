'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('arcade/index.html','utf8');
const client=fs.readFileSync('arcade/live.js','utf8');
const app=fs.readFileSync('arcade/app.js','utf8');
const friends=fs.readFileSync('arcade/friends.js','utf8');
const game=fs.readFileSync('secure-quiz-beta.html','utf8');
const css=fs.readFileSync('arcade/styles.css','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
assert.equal(ids.length,new Set(ids).size,'duplicate HTML id');
const required=['liveTitle','liveRefresh','liveStatus','liveFriendList','liveMatchList','liveArena','liveArenaStatus','liveArenaOpponent','liveScoreHost','liveScoreGuest','liveRound','liveCountdown','liveQuestion','liveOptions','liveArenaControls'];
for(const id of required)assert.ok(ids.includes(id),'Missing '+id);
assert.ok(html.includes('live.js?v='));
assert.ok(app.includes('FOXEY_ARCADE_LIVE?.connect(supa,user)'));
assert.ok(app.includes('FOXEY_ARCADE_LIVE?.connect(supa,null)'));
assert.ok(app.includes('FOXEY_ARCADE_LIVE?.onPage(page)'));
assert.ok(friends.includes("entry.kind==='live_invite'"));
assert.ok(friends.includes('FOXEY_ARCADE_LIVE?.invite(p.user_id)'));
assert.ok(game.includes('⚡ Pozvánka na živý souboj'));
assert.ok(css.includes('.live-option'));
assert.ok(!client.includes('innerHTML') && !client.includes('service_role'));
assert.ok(!/\.from\(['"]arcade_(?:wallet|profile|live)/.test(client),
  'live module must use guarded server RPCs rather than raw tables');
class Node{
 constructor(id=''){
  this.id=id;this.children=[];this.events={};this.textContent='';this.className='';
  this.value='';this.disabled=false;this.style={};this.scrollCalls=0;
  const names=new Set(id==='liveArena'?['hidden']:[]);
  this.classList={add:x=>names.add(x),remove:x=>names.delete(x),
   toggle:(x,v)=>{if(v)names.add(x);else names.delete(x);},
   contains:x=>names.has(x)};
 }
 append(...xs){this.children.push(...xs);}
 replaceChildren(...xs){this.children=[...xs];}
 addEventListener(name,fn){this.events[name]=fn;}
 scrollIntoView(){this.scrollCalls++;}
 focus(){}
}
const nodes=new Map(ids.map(id=>[id,new Node(id)]));
const document={getElementById:id=>nodes.get(id),createElement:tag=>new Node(tag),visibilityState:'visible'};
const self='11111111-1111-4111-8111-111111111111';
const friend='22222222-2222-4222-8222-222222222222';
const match='33333333-3333-4333-8333-333333333333';
const op='44444444-4444-4444-8444-444444444444';
const p={user_id:friend,nickname:'Buddy'};
let state='invited',hostReady=false,guestReady=false,answered=false,score=0,created=false;
const calls=[];
const api={rpc:async(name,args={})=>{
 calls.push({name,args});
 if(name==='arcade_live_ping')return {data:{ok:true}};
 if(name==='arcade_live_dashboard')return {data:{ok:true,
    friends:[{profile:p,online:true}],
    matches:created?[{match_id:match,state,role:'host',opponent:p,
       host_score:score,guest_score:0}]:[]}};
 if(name==='arcade_live_invite'){
  assert.equal(args.p_friend_id,friend);assert.match(args.p_operation,/^[0-9a-f-]{36}$/i);
  created=true;return {data:{ok:true,match_id:match,state:'invited',retry:false}};
 }
 if(name==='arcade_live_state')return {data:{ok:true,match_id:match,state,
  role:'host',opponent:p,host_ready:hostReady,guest_ready:guestReady,
  question_index:0,round_deadline:new Date(Date.now()+25000).toISOString(),
  question:state==='running'?{index:0,id:'test1',cs:'Jaká hra?',en:'Which game?',
  options:['Option A','Option B','Option C','Option D']}:null,
  my_answered:answered,opponent_answered:false,host_score:score,guest_score:0,credited:false}};
 if(name==='arcade_live_ready'){
  assert.equal(args.p_ready,true);hostReady=true;guestReady=true;state='running';
  return {data:{ok:true,state}};
 }
 if(name==='arcade_live_answer'){
  assert.equal(args.p_index,0);assert.equal(args.p_choice,'Option A');
  answered=true;score=1;return {data:{ok:true}};
 }
 if(name==='arcade_live_cancel'){state='cancelled';return {data:{ok:true,state}};}
 throw Error('Unexpected RPC: '+name);
}};
const storage=new Map();
const window={FOXEY_I18N:{getLocale:()=> 'cs'},FOXEY_ARCADE_SOCIAL:{refreshInbox(){}},
  addEventListener(){},setInterval(){},sessionStorage:{
   getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
const location={search:'',href:'https://foxey-cz.github.io/GuessTheGame-Web/arcade/'};
const crypto={randomUUID:()=>op};
vm.runInNewContext(client,{document,window,location,crypto,URLSearchParams,console,setTimeout});
const ui=window.FOXEY_ARCADE_LIVE;
assert.ok(ui,'missing client public API');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 ui.setNavigation(()=>{});
 ui.connect(api,{id:self});ui.onPage('community');
 await settle();await settle();
 assert.equal(nodes.get('liveFriendList').children.length,1);
 assert.ok(nodes.get('liveFriendList').children[0].children[0].children[1].textContent.includes('Online'));
 const button=nodes.get('liveFriendList').children[0].children[1];
 button.events.click();await settle();await settle();await settle();
 assert.ok(created,'invite not sent');
 assert.ok(calls.some(c=>c.name==='arcade_live_invite'));
 assert.equal(nodes.get('liveArena').classList.contains('hidden'),false);
 assert.ok(nodes.get('liveArena').scrollCalls>=1,
   'opening a live match must reveal its arena below the friend list');
 const ready=nodes.get('liveArenaControls').children[0];
 // In the host waiting state there is no ready control yet; simulate guest acceptance.
 state='lobby';await ui.openMatch(match,false);await settle();
 const ready2=nodes.get('liveArenaControls').children[0];
 assert.ok(ready2.textContent.includes('připraven'));
 ready2.events.click();await settle();await settle();
 assert.equal(nodes.get('liveOptions').children.length,4);
 nodes.get('liveOptions').children[0].events.click();await settle();await settle();
 assert.ok(answered,'answer should go through server RPC');
 assert.equal(nodes.get('liveScoreHost').textContent,'1');
 ui.connect(null,null);
 assert.equal(nodes.get('liveArena').classList.contains('hidden'),true);
 assert.ok(calls.every(c=>c.name.startsWith('arcade_live_')),'unexpected API');
 console.log('PASS: live invite, guest lobby, ready, options, server-scored answer, sign-out isolation.');
})().catch(e=>{console.error(e);process.exitCode=1;});