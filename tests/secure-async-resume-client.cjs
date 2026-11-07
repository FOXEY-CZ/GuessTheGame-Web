'use strict';
// FOXEY Arcade: close/reopen browser, resume from server-owned action trace,
// restore hints/Mystery clues, handle lost RPC reply and finalize exactly once.
// No live network, no credentials and no payout calls.
// Run from repository root: node tests/secure-async-resume-client.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','secure-quiz-beta.html'),'utf8');
assert.ok(html.includes('id="resumePanel"'));
assert.ok(html.includes('arcade_async_challenge_resume'));
assert.ok(!html.includes('window.GTG_QUESTIONS='));
const raw=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(x=>x[1]).filter(Boolean).at(-1);
const code=raw.replace(/^\s*\(\(\) => \{/,'return (() => {')
 .replace(/\}\)\(\);\s*$/,
   'return {createAsyncChallenge,resumeAsyncChallenge,answer,next,hint,reveal,\n'+
   'getState:()=>({game,current,me,pending})};\n})();');
assert.ok(code.includes('return {createAsyncChallenge'));
const owner='22222222-2222-4222-8222-222222222222';
const outsider='33333333-3333-4333-8333-333333333333';
const cid='11111111-1111-4111-8111-111111111111';
const mid='99999999-9999-4999-8999-999999999999';
const id='aaaaaaa1-aaaa-4aaa-aaaa-aaaaaaaaaaa1';
const mrid='aaaaaaa2-aaaa-4aaa-aaaa-aaaaaaaaaaa2';
const ids=Array.from({length:10},(_,i)=>'s'+String(i+1).padStart(3,'0'));
const sharedStorage=new Map(),calls=[],runs=new Map();
let dropReply=false,ops=0,finishCalls=0;
const newRun=(challengeId,runId,mode='classic')=>{
  const record={challengeId,runId,owner,mode,idx:0,score:0,correct:0,
    lives:3,answers:[],hint:null,reveals:[],finished:false,submitted:false,
    finalized:false,expired:false};
  runs.set(challengeId,record);return record;
};
function getRun(cid){const r=runs.get(cid);assert.ok(r);return r}
function apiFor(uid){
  return {
    auth:{getSession:async()=>({data:{session:{user:{id:uid}}},error:null})},
    rpc:async(name,args)=>{
      calls.push({name,uid,args});
      if(name==='arcade_async_challenge_create'){
        assert.equal(uid,owner);assert.equal(args.p_mode,'classic');
        const run=newRun(cid,id);
        return {data:{ok:true,role:'creator',challenge_id:cid,run_id:run.runId,
          mode:run.mode,question_ids:ids},error:null};
      }
      if(name==='arcade_async_challenge_inbox'){
        const items=[...runs.values()].filter(r=>r.owner===uid).map(r=>({
          challenge_id:r.challengeId,role:'creator',mode:r.mode,
          creator_done:r.finalized,challenger_done:false,
          status:r.finalized?'waiting':'creator_playing',both_done:false,unread:false,
          created_at:'2026-11-07T19:00:00.000Z'
        }));
        return {data:{ok:true,items,unread:0},error:null};
      }
      if(name==='arcade_async_challenge_resume'){
        const run=getRun(args.p_challenge_id);
        if(uid!==run.owner)return {data:null,error:{message:'challenge_not_yours'}};
        return {data:{ok:true,shadow:true,credited:false,resumed:true,
          challenge_id:run.challengeId,role:'creator',run_id:run.runId,
          question_ids:ids,mode:run.mode,next_index:run.idx,
          score:run.score,correct:run.correct,lives:run.lives,
          answers:run.answers.map(a=>({...a})),hint_used:!!run.hint,
          hint:run.hint, reveals:run.reveals.slice(),
          finished:run.finished,submitted:run.submitted,
          active:!run.expired&&!run.submitted,expired:run.expired},error:null};
      }
      if(name==='arcade_quiz_current_question_shadow'){
        const run=[...runs.values()].find(r=>r.runId===args.p_run_id);
        assert.ok(run);assert.equal(uid,run.owner);
        assert.equal(args.p_index,run.idx);
        assert.ok(!run.finished);
        return {data:{ok:true,shadow:true,credited:false,run_id:run.runId,
          index:run.idx,id:ids[run.idx],difficulty:'easy',
          cs:'Otázka '+run.idx,en:'Question '+run.idx,
          options:['Correct '+run.idx,'Wrong '+run.idx,'X','Y']},error:null};
      }
      if(name==='arcade_verify_action_shadow'){
        const run=[...runs.values()].find(r=>r.runId===args.p_run_id);
        assert.ok(run);assert.equal(uid,run.owner);
        assert.equal(args.p_question_index,run.idx);
        const base={ok:true,shadow:true,credited:false,
          event_id:args.p_event_id,action:args.p_action};
        if(args.p_action==='hint'){
          assert.equal(run.mode,'classic');assert.equal(run.hint,null);
          run.hint={cs:'Odhalená nápověda',en:'Unlocked hint'};
          return {data:{...base,hintCs:run.hint.cs,hintEn:run.hint.en},error:null};
        }
        if(args.p_action==='reveal'){
          assert.equal(run.mode,'mystery');
          const clue={cs:'Odhalená indicie '+run.reveals.length,
            en:'Unlocked clue '+run.reveals.length};
          run.reveals.push(clue);
          return {data:{...base,revealCs:clue.cs,revealEn:clue.en},error:null};
        }
        if(args.p_action==='answer'){
          const correct=args.p_choice==='Correct '+run.idx;
          const points=correct?(run.mode==='mystery'?20-5*run.reveals.length:
            run.hint?7:10):0;
          if(correct){run.score+=points;run.correct++;}else run.lives--;
          run.answers.push({choice:args.p_choice,hint:!!run.hint,
            reveal:run.reveals.length});
          const feedback={...base,was_correct:correct,
            correct_answer:'Correct '+run.idx,points_awarded:points,
            score:run.score,correct:run.correct,lives:run.lives,
            finished:run.lives===0||run.idx===9};
          run.idx++;run.hint=null;run.reveals=[];
          run.finished=feedback.finished;
          if(dropReply){
            dropReply=false;
            return {data:null,error:{message:'network_reply_lost'}};
          }
          return {data:feedback,error:null};
        }
      }
      if(name==='arcade_verify_complete'){
        const run=[...runs.values()].find(r=>r.runId===args.p_run_id);
        assert.ok(run);assert.equal(uid,run.owner);
        assert.ok(run.finished);
        assert.deepEqual(args.p_answers,run.answers);
        finishCalls++;
        run.submitted=true;
        return {data:{ok:true,score:run.score,correct:run.correct,
          lives:run.lives},error:null};
      }
      if(name==='arcade_verify_action_summary_shadow'){
        const run=[...runs.values()].find(r=>r.runId===args.p_run_id);
        assert.ok(run.submitted);return {data:{ok:true,consistent:true},error:null};
      }
      if(name==='arcade_async_challenge_finalize'){
        const run=getRun(args.p_challenge_id);
        assert.equal(args.p_run_id,run.runId);
        assert.ok(run.submitted);run.finalized=true;
        return {data:{ok:true,both_done:false,role:'creator'},error:null};
      }
      if(name==='arcade_async_challenge_status'){
        return {data:{ok:true,role:'creator',both_done:false},error:null};
      }
      throw Error('Unexpected RPC '+name);
    }
  };
}
class Element{
  constructor(id=''){this.id=id;this.value='';this.textContent='';this.className='';
    this.disabled=false;this.dataset={};this.children=[];this.listeners={};this.style={};
    this.hidden=false;this.attributes={};
    this.classList={toggle:(v,set)=>{if(v==='hidden')this.hidden=!!set;},
      add:v=>{if(v==='hidden')this.hidden=true;},
      remove:v=>{if(v==='hidden')this.hidden=false;},
      contains:v=>v==='hidden'&&this.hidden};
  }
  addEventListener(n,cb){this.listeners[n]=cb}
  setAttribute(a,b){this.attributes[a]=b}
  append(...v){this.children.push(...v)}
  replaceChildren(...v){this.children=v}
  querySelectorAll(){return []}
  querySelector(v){return this[v]||(this[v]=new Element(v))}
  focus(){}select(){}scrollIntoView(){}
}
function instance(uid=owner,storage=sharedStorage,href='https://foxey-cz.github.io/GuessTheGame-Web/secure-quiz-beta.html'){
  const elements=new Map();
  const get=k=>{if(!elements.has(k))elements.set(k,new Element(k));return elements.get(k)};
  const document={documentElement:{lang:'cs'},visibilityState:'visible',
    getElementById:get,createElement:t=>new Element(t),addEventListener(){}};
  const storageAdapter={getItem:key=>storage.get(key)||null,
    setItem:(key,value)=>storage.set(key,String(value)),
    removeItem:key=>storage.delete(key)};
  const window={GTGAuthConfig:{url:'https://example.invalid',
      publishableKey:'mock_publishable',storageKey:'mock'},
    supabase:{createClient:()=>apiFor(uid)},
    location:{href},
    addEventListener(){},setInterval(){}};
  const navigator={onLine:true,clipboard:{writeText:async()=>{}}};
  const app=new Function('window','document','navigator','localStorage','crypto','URL',code)(
    window,document,navigator,storageAdapter,
    {randomUUID:()=>String(++ops).padStart(8,'0')+'-0000-4000-8000-000000000000'},URL);
  return {app,get,storage};
}
async function settle(){for(let i=0;i<20;i++)await Promise.resolve()}
async function main(){
  let first=instance();await settle();
  await first.app.createAsyncChallenge();
  assert.equal(first.app.getState().game.id,id);
  assert.equal(sharedStorage.get('foxey.arcade.active.challenge.v1.'+owner),cid);
  await first.app.hint();
  assert.ok(getRun(cid).hint);
  // Close/reopen before answering: hints restored from committed server log.
  let fresh=instance();await settle();
  assert.equal(fresh.get('resumePanel').hidden,false);
  assert.equal(fresh.app.getState().game,null);
  await fresh.app.resumeAsyncChallenge(cid);
  assert.equal(fresh.app.getState().game.idx,0);
  assert.equal(fresh.app.getState().current.hint.cs,'Odhalená nápověda');
  assert.equal(fresh.app.getState().current.answered,false);
  assert.equal(fresh.get('historyOverlay').hidden,true);
  await fresh.app.answer('Correct 0');await fresh.app.next();
  assert.equal(getRun(cid).score,7);
  assert.equal(fresh.app.getState().game.idx,1);
  // An action can reach Supabase but its reply never reach the phone.
  dropReply=true;await fresh.app.answer('Wrong 1');
  assert.equal(getRun(cid).idx,2);
  assert.ok(fresh.app.getState().pending,'client awaits retry');
  fresh=instance();await settle();
  await fresh.app.resumeAsyncChallenge(cid);
  assert.equal(fresh.app.getState().pending,null);
  assert.equal(fresh.app.getState().game.idx,2);
  assert.equal(fresh.app.getState().game.answers.length,2);
  assert.equal(fresh.app.getState().game.lives,2);
  assert.equal(fresh.app.getState().game.score,7);
  // New device with no local marker can recover using server-owned history.
  const device=instance(owner,new Map());await settle();
  const history=device.get('historyList').children[0];
  assert.ok(history,'history contains active server challenge');
  const actions=history.children[3].children;
  assert.ok(actions[0].textContent.includes('Pokračovat'));
  await actions[0].listeners.click();await settle();
  assert.equal(device.app.getState().game.idx,2);
  assert.equal(device.app.getState().game.answers.length,2);
  // Global FOXEY Arcade opens an explicit resume URL in a new tab.
  const deepLink=instance(owner,new Map(),
    'https://foxey-cz.github.io/GuessTheGame-Web/secure-quiz-beta.html?resume='+cid);
  await settle();
  assert.equal(deepLink.app.getState().game.idx,2);
  assert.equal(deepLink.app.getState().game.answers.length,2);
  // Disconnect just after the last answer, BEFORE finish/submit/finalize.
  await fresh.app.answer('Wrong 2');await fresh.app.next();
  await fresh.app.answer('Wrong 3');
  assert.equal(getRun(cid).finished,true);
  assert.equal(getRun(cid).submitted,false);
  const resumedFinal=instance();await settle();
  await resumedFinal.app.resumeAsyncChallenge(cid);
  assert.equal(resumedFinal.app.getState().game.resultShown,true);
  assert.equal(getRun(cid).submitted,true);
  assert.equal(getRun(cid).finalized,true);
  assert.equal(finishCalls,1);
  assert.equal(resumedFinal.get('finalScore').textContent,'7');
  assert.equal(sharedStorage.has('foxey.arcade.active.challenge.v1.'+owner),false);
  assert.equal(runs.size,1,'no new attempt was created');
  // Permission check: another account cannot use a stolen challenge ID.
  const stranger=instance(outsider);await settle();
  await stranger.app.resumeAsyncChallenge(cid);
  assert.equal(stranger.app.getState().game,null);
  assert.ok(stranger.get('resumeError').textContent.includes('challenge_not_yours'));
  // Restore Mystery hints at precisely the reached clue count.
  const mystery=newRun(mid,mrid,'mystery');
  mystery.reveals=[{cs:'První indicie',en:'First clue'},{cs:'Druhá indicie',en:'Second clue'}];
  sharedStorage.set('foxey.arcade.active.challenge.v1.'+owner,mid);
  const myst=instance();await settle();
  await myst.app.resumeAsyncChallenge(mid);
  assert.equal(myst.app.getState().game.mode,'mystery');
  assert.deepEqual(myst.app.getState().current.reveals,mystery.reveals);
  assert.equal(myst.app.getState().game.idx,0);
  // If the underlying run is expired, no new try and no answer leaks.
  mystery.expired=true;
  const expired=instance();await settle();
  await expired.app.resumeAsyncChallenge(mid);
  assert.equal(expired.app.getState().game,null);
  assert.ok(expired.get('resumeError').textContent.includes('časový limit'));
  assert.equal(sharedStorage.has('foxey.arcade.active.challenge.v1.'+owner),false);
  assert.equal(runs.size,2);
  assert.ok(!calls.some(x=>/wallet|payout|credit/i.test(x.name)));
  console.log('PASS: hint, lost answer reply, history on new device, finalization after refresh, owner-only, Mystery clues, expiry; no duplicate run or payout');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
