'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','preview-auth-test.html'),'utf8');
const from=html.indexOf('  async function start(mode){');
const to=html.indexOf('  function game(){',from);
assert.ok(from>=0&&to>from,'Game start source missing');
const startSource=html.slice(from,to);
const fallbackIds=Array.from({length:10},(_,i)=>'q'+String(i+1).padStart(3,'0'));
const generatedIds=fallbackIds.slice().reverse();
const runId='22222222-2222-4222-8222-222222222222';
const uid='11111111-1111-4111-8111-111111111111';
const operation='33333333-3333-4333-8333-333333333333';
const factory=Function('opts',[
  'let session=null,quizLaunchPending=false;',
  'const events=[],games=[],toasts=[];',
  'const window={GTGServerVerification:{available:()=>opts.available,begin:opts.begin},',
  '  dispatchEvent:e=>events.push(e)};',
  'const CustomEvent=function(type,init){this.type=type;this.detail=init.detail;};',
  'const crypto={randomUUID:()=>opts.operation};',
  'const profile={recentIds:[]};',
  'const byId=Object.fromEntries(opts.ids.map(id=>[id,{id}]));',
  'const lang="cs",utcDate=()=> "2026-11-07",date=()=> "2026-11-07";',
  'const hash=()=>12345,level=()=>4,makeIds=()=>opts.ids.slice();',
  'const T=k=>k,fmt=v=>v;',
  'const toast=x=>toasts.push(x),saveProfile=()=>{},saveSession=()=>{};',
  'const game=()=>games.push(session.ids.slice());',
  'const startChallenge=()=>games.push("challenge");',
  'let lastMode="classic";',
  'const setTimeout=()=>null;',
  startSource,
  'return {start,get session(){return session;},events,games,toasts};'
].join('\n'));
async function main(){
  const server={run_id:runId,user_id:uid,question_ids:generatedIds};
  const normal=factory({available:true,begin:async()=>server,ids:fallbackIds,operation});
  await normal.start('classic');
  assert.deepEqual(normal.session.ids,generatedIds,'Server IDs must control the game');
  assert.equal(normal.session.verifyRunId,runId);
  assert.equal(normal.session.verifyUserId,uid);
  assert.equal(normal.events[0].detail.run_id,runId);
  assert.deepEqual(normal.games[0],generatedIds);
  const guest=factory({available:false,begin:()=>{throw Error('No guest RPC');},ids:fallbackIds,operation});
  await guest.start('classic');
  assert.deepEqual(guest.session.ids,fallbackIds);
  assert.equal(guest.session.verifyRunId,null);
  const offline=factory({available:true,begin:async()=>null,ids:fallbackIds,operation});
  await offline.start('classic');
  assert.deepEqual(offline.session.ids,fallbackIds);
  const bad=factory({available:true,begin:async()=>({...server,question_ids:['q999']}),ids:fallbackIds,operation});
  await bad.start('classic');
  assert.deepEqual(bad.session.ids,fallbackIds);
  let resolveRun;
  const pending=new Promise(resolve=>{resolveRun=resolve;});
  const fast=factory({available:true,begin:()=>pending,ids:fallbackIds,operation});
  const one=fast.start('classic'),two=fast.start('classic');
  resolveRun(server);await Promise.all([one,two]);
  assert.equal(fast.games.length,1,'Double click must only create one run');
  console.log('PASS: server-issued IDs, guest/offline fallback, invalid IDs, double-click');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
