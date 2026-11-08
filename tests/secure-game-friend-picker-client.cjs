'use strict';
// Two-player identity test for direct friend picker embedded in secured game.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('secure-quiz-beta.html','utf8');
const js=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
 .map(m=>m[1]).filter(Boolean).at(-1)
 .replace(/^\s*\(\(\) => \{/,'return (() => {')
 .replace(/\}\)\(\);\s*$/,'return {refreshGameFriends,challengeGameFriend,inviteGameFriendLive,getState:()=>({game,current,me})};\n})();');
const user='11111111-1111-4111-8111-111111111111';
const friend='22222222-2222-4222-8222-222222222222';
const run='33333333-3333-4333-8333-333333333333';
const challenge='44444444-4444-4444-8444-444444444444';
const operation='55555555-5555-4555-8555-555555555555';
const ids=Array.from({length:10},(_,i)=>'q'+String(i+1));
class Element{
 constructor(id=''){
  this.id=id;this.textContent='';this.className='';this.style={};this.children=[];
  this.value='';this.disabled=false;this.events={};this.listeners={};
  const classes=new Set(['historyOverlay','achievementsOverlay','missionsOverlay']
    .includes(id)?['hidden']:[]);
  this.classList={
   add:n=>classes.add(n),remove:n=>classes.delete(n),
   toggle:(n,v)=>v?classes.add(n):classes.delete(n),
   contains:n=>classes.has(n)
  };
 }
 append(...x){this.children.push(...x)}
 replaceChildren(...x){this.children=[...x]}
 setAttribute(){}
 addEventListener(name,fn){this.events[name]=fn;this.listeners[name]=fn}
 querySelectorAll(){return []}
 querySelector(){return new Element('sub')}
 scrollIntoView(){}focus(){}click(){return this.events.click?.()}
}
const nodes=new Map();
const document={
 getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id)},
 createElement:tag=>new Element(tag),documentElement:{lang:'cs'},
 addEventListener(){},body:new Element('body'),visibilityState:'visible'
};
let dashboardCalls=0,createCalls=0,livePayload=null;
const api={
 auth:{getSession:async()=>({data:{session:{user:{id:user}}},error:null})},
 rpc:async(name,args={})=>{
  if(name==='arcade_friends_dashboard'){
   dashboardCalls++;
   return {data:{ok:true,friends:[
    {profile:{user_id:friend,nickname:'Buddy',avatar_id:'fox'}},
    {profile:{user_id:user,nickname:'Should not show me'}}
   ]},error:null};
  }
  if(name==='arcade_friend_challenge_create'){
   createCalls++;
   assert.equal(args.p_friend_id,friend);
   assert.equal(args.p_mode,'classic');
   assert.equal(args.p_operation,operation);
   return {data:{ok:true,targeted:true,challenge_id:challenge,
      run_id:run,mode:'classic',question_ids:ids,role:'creator'},error:null};
  }
  if(name==='arcade_quiz_current_question_shadow'){
   assert.equal(args.p_run_id,run);assert.equal(args.p_index,0);
   return {data:{ok:true,shadow:true,credited:false,run_id:run,index:0,id:ids[0],
    difficulty:'easy',cs:'Která hra?',en:'Which game?',options:['A','B','C','D']},error:null};
  }
  // Unrelated optional widgets are allowed to fail without affecting sign-in.
  return {data:null,error:{message:'unavailable_in_test'}};
 }
};
const parent={postMessage:(v,origin)=>{livePayload={...v,origin}}};
const window={GTGAuthConfig:{url:'https://example.invalid',publishableKey:'pub',storageKey:'test'},
 supabase:{createClient:()=>api},parent,location:{href:'https://foxey-cz.github.io/GuessTheGame-Web/secure-quiz-beta.html',origin:'https://foxey-cz.github.io'},
 addEventListener(){},setInterval(){}};
const store=new Map();
const localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
const nav={onLine:true};
(async()=>{
 const game=new Function('window','document','localStorage','navigator','crypto','URL',js)(
  window,document,localStorage,nav,{randomUUID:()=>operation},URL);
 for(let i=0;i<10;i++)await Promise.resolve();
 assert.equal(game.getState().me.id,user);
 await game.refreshGameFriends();
 const friends=nodes.get('gameFriendsList').children;
 assert.equal(friends.length,1,'only actual accepted friends appear');
 assert.equal(friends[0].children[0].textContent,'Buddy');
 const buttons=friends[0].children[1].children;
 assert.equal(buttons.length,2);
 buttons[1].events.click();
 assert.deepEqual(livePayload,{
  type:'foxey-arcade:invite-live-friend',friend_id:friend,
  origin:'https://foxey-cz.github.io'
 });
 assert.equal(createCalls,0,'live intent must not mint another game or wallet entry');
 await game.challengeGameFriend(friend);
 assert.equal(createCalls,1,'private friend invite uses only secured RPC once');
 assert.equal(game.getState().game.challenge.id,challenge);
 assert.equal(game.getState().current.cs,'Která hra?');
 assert.equal(store.has('foxey.arcade.game.friend.operation.'+user+'.'+friend),false,
  'operation ID cleared only after successful server response');
 await game.challengeGameFriend(friend);
 assert.equal(createCalls,1,'cannot start a second invite during active game');
 assert.ok(dashboardCalls>=1);
 console.log('PASS: in-game friend list, direct invite, live intent, secure quiz and no duplicate run.');
})().catch(e=>{console.error(e);process.exitCode=1});