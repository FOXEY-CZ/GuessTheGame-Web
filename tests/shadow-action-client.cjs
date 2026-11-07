'use strict';
// FOXEY Arcade: exercise real client functions without touching live Supabase.
// Call with: node tests/shadow-action-client.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','preview-auth-test.html'),'utf8');
const account=fs.readFileSync(path.join(__dirname,'..','account-test.js'),'utf8');
const extract=(source,from,to)=>{
 const i=source.indexOf(from),j=source.indexOf(to,i);
 assert.ok(i>=0&&j>i,'Cannot locate '+from);
 return source.slice(i,j);
};
const emitSource=extract(html,'  function emitShadowAction(', '  function next(){');
const actionSource=extract(account,'  function onShadowAction(event){',
  '  // Only describe trusted');
const finishSource=extract(account,'  async function onShadowFinish(event){',
  '  // This is a SECOND');
const uid='11111111-1111-4111-8111-111111111111';
const run='22222222-2222-4222-8222-222222222222';
const operation='33333333-3333-4333-8333-333333333333';

const gameFactory=Function('events','uid','run','operation',`
 let session={mode:'classic',verifyRunId:run,verifyUserId:uid,verifyOperation:operation,
 ids:['q001'],idx:0,hint:false,reveal:0,selected:null,gained:0,
 streak:0,maxStreak:0,correct:0,score:0,lives:3,verifyAnswers:[]};
 const byId={q001:{answer:'A',wrong:['B','C','D']}}, options=()=>['A','B','C','D'];
 const window={dispatchEvent:e=>events.push(e)};
 const CustomEvent=function(type,init){this.type=type;this.detail=init.detail;};
 let counter=0;
 const crypto={randomUUID:()=> '22222222-2222-4222-8222-'+String(++counter).padStart(12,'0')};
 const playFeedback=()=>{},burst=()=>{},saveSession=()=>{},game=()=>{},finish=()=>{};
 ${emitSource}
 return {get session(){return session},choose,hint,reveal};
`);
const gameEvents=[];
const classic=gameFactory(gameEvents,uid,run,operation);
classic.hint();classic.choose(0);
assert.deepEqual(gameEvents.map(e=>e.detail.action),['hint','answer']);
assert.equal(gameEvents[1].detail.choice,'A');
assert.equal(classic.session.verifyAnswers[0].hint,true);
const mysteryEvents=[];
const mystery=gameFactory(mysteryEvents,uid,run,operation);
mystery.session.mode='mystery';mystery.reveal();mystery.reveal();
mystery.reveal();mystery.choose(0);
assert.deepEqual(mysteryEvents.map(e=>e.detail.action),['reveal','reveal','answer']);
assert.equal(mystery.session.verifyAnswers[0].reveal,2);
const guestEvents=[];
const guest=gameFactory(guestEvents,uid,null,operation);
guest.hint();guest.choose(0);
assert.equal(guestEvents.length,0,'Offline game must not transmit action events');

const actionFactory=Function('calls','uid',`
 const shadowRuns=new Map(),user={id:uid};
 const client={rpc:async(name,args)=>{
   calls.push({name,args});
   return {data:{ok:true,shadow:true,credited:false},error:null};
 }};
 ${actionSource}
 return {onShadowAction,shadowRuns};
`);
const calls=[],actions=actionFactory(calls,uid);
actions.shadowRuns.set(operation,{uid,serverIssued:true,
 request:Promise.resolve({run_id:run}),actionQueue:Promise.resolve(),actionFailed:false});
for(const e of gameEvents)actions.onShadowAction(e);

const finishFactory=Function('uid','consistent',`
 const statuses=[],progress=[],calls=[],shadowRuns=new Map();
 const user={id:uid},formatShadowRewardPreview=()=>({cz:'preview-ok',en:'preview-ok'});
 const shadowStatus=cs=>statuses.push(cs),shadowProgressStatus=cs=>progress.push(cs);
 const client={rpc:async(name,args)=>{
   calls.push(name);
   if(name==='arcade_verify_complete')
     return {data:{ok:true,shadow:true,credited:false,score:30,correct:3},error:null};
   if(name==='arcade_verify_action_summary_shadow')
     return {data:{ok:true,shadow:true,credited:false,consistent},error:null};
   if(name==='arcade_verify_progress_shadow')
     return {data:{ok:true,shadow:true,credited:false},error:null};
   throw Error('unknown RPC: '+name);
 }};
 ${finishSource}
 return {onShadowFinish,statuses,progress,calls,shadowRuns};
`);
async function main(){
 await actions.shadowRuns.get(operation).actionQueue;
 assert.deepEqual(calls.map(c=>c.args.p_action),['hint','answer']);
 assert.equal(actions.shadowRuns.get(operation).actionFailed,false);
 for(const consistent of [true,false]){
   const target=finishFactory(uid,consistent);
   let actionSettled=false;
   target.shadowRuns.set(operation,{uid,serverIssued:true,
     request:Promise.resolve({run_id:run}),
     actionQueue:Promise.resolve().then(()=>{actionSettled=true;}),
     actionFailed:false});
   await target.onShadowFinish({detail:{operation,run_id:run,user_id:uid,
     score:30,correct:3,answers:[]}});
   assert.equal(actionSettled,true,'Finish should await action queue');
   assert.equal(target.calls[0],'arcade_verify_complete');
   assert.ok(target.calls.includes('arcade_verify_action_summary_shadow'));
   assert.equal(target.calls.includes('arcade_verify_progress_shadow'),consistent,
     'Inconsistent chronology must not trigger progression simulation');
   assert.ok(target.statuses.some(s=>consistent
     ?s.includes('✅ Server ověřil odpovědi')
     :s.includes('není kompletní')));
 }
 console.log('PASS: hints, mystery reveals, offline isolation, action queue, fail-closed summary');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
