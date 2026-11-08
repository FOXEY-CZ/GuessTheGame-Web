'use strict';
// Offline two-browser challenge simulation. No real credentials, user data or payouts.
// Run from repo root: node tests/secure-async-challenge-client.cjs
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','secure-quiz-beta.html'),'utf8');
assert.ok(!html.includes('GTG_QUESTIONS'));
assert.ok(!html.includes('arcade_verify_progress_shadow'));
const raw=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(x=>x[1]).filter(Boolean).at(-1);
const js=raw.replace(/^\s*\(\(\) => \{/,'return (() => {')
  .replace(/\}\)\(\);\s*$/,
    'return {createAsyncChallenge,joinAsyncChallenge,checkAsyncChallenge,next,hint,answer,getState:()=>({game,current,me})};\n})();');
assert.ok(js.includes('return {createAsyncChallenge'));

const ids=Array.from({length:10},(_,i)=>'s'+String(i+1).padStart(3,'0'));
const challenge='11111111-1111-4111-8111-111111111111';
const owner='22222222-2222-4222-8222-222222222222';
const guest='33333333-3333-4333-8333-333333333333';
const runs=new Map(), called=[];
let ownerDone=false,guestDone=false;
let opCount=0;
function resultFor(uid){
 const isOwner=uid===owner;
 return {
  ok:true,challenge_id:challenge,role:isOwner?'creator':'challenger',
  ready:ownerDone,joined:runs.has(guest),creator_done:ownerDone,
  challenger_done:guestDone,both_done:ownerDone&&guestDone,
  ...(ownerDone&&guestDone?{
    your_score:runs.get(uid).score,
    opponent_score:runs.get(isOwner?guest:owner).score,
    winner:runs.get(uid).score>runs.get(isOwner?guest:owner).score?
      'you':runs.get(uid).score===runs.get(isOwner?guest:owner).score?'tie':'opponent'
  }:{})
 };
}
function apiFor(uid){
 return {
  auth:{getSession:async()=>({data:{session:{user:{id:uid}}},error:null})},
  rpc:async(name,args)=>{
    called.push(name);
    if(name==='arcade_async_challenge_create'){
      assert.equal(uid,owner);assert.equal(args.p_mode,'classic');
      const rid='aaaaaaa1-aaaa-4aaa-aaaa-aaaaaaaaaaa1';
      runs.set(owner,{id:rid,idx:0,score:0,correct:0,lives:3,hint:false,answers:[],submitted:false});
      return {data:{ok:true,role:'creator',challenge_id:challenge,run_id:rid,
        mode:'classic',question_ids:ids},error:null};
    }
    if(name==='arcade_async_challenge_join'){
      assert.equal(uid,guest);assert.ok(ownerDone);
      assert.equal(args.p_challenge_id,challenge);
      const rid='bbbbbbb1-bbbb-4bbb-bbbb-bbbbbbbbbbb1';
      runs.set(guest,{id:rid,idx:0,score:0,correct:0,lives:3,hint:false,answers:[],submitted:false});
      return {data:{ok:true,role:'challenger',challenge_id:challenge,run_id:rid,
        mode:'classic',question_ids:ids},error:null};
    }
    if(name==='arcade_verify_begin_secure_server')
      throw Error('Challenge must use private challenge RPC');
    if(name==='arcade_quiz_current_question_shadow'){
      const run=runs.get(uid);
      assert.equal(args.p_run_id,run.id);assert.equal(args.p_index,run.idx);
      return {data:{ok:true,shadow:true,credited:false,run_id:run.id,
        index:run.idx,id:ids[run.idx],difficulty:'easy',
        cs:'Otázka '+run.idx,en:'Question '+run.idx,
        options:['Correct '+run.idx,'Wrong '+run.idx,'X','Y']},error:null};
    }
    if(name==='arcade_verify_action_shadow'){
      const run=runs.get(uid);
      assert.equal(args.p_run_id,run.id);
      if(args.p_action==='hint'){
        run.hint=true;
        return {data:{ok:true,shadow:true,credited:false,event_id:args.p_event_id,
          action:'hint',hintCs:'Nápověda',hintEn:'Hint'},error:null};
      }
      if(args.p_action==='answer'){
        const win=args.p_choice==='Correct '+run.idx;
        const award=win?(run.hint?7:10):0;
        if(win){run.score+=award;run.correct++;}else run.lives--;
        run.answers.push({choice:args.p_choice,hint:run.hint,reveal:0});
        const feedback={ok:true,shadow:true,credited:false,event_id:args.p_event_id,
          action:'answer',was_correct:win,correct_answer:'Correct '+run.idx,
          points_awarded:award,score:run.score,correct:run.correct,lives:run.lives,
          finished:run.lives===0||run.idx===9};
        run.idx++;run.hint=false;
        return {data:feedback,error:null};
      }
    }
    if(name==='arcade_verify_complete'){
      const run=runs.get(uid);
      assert.equal(args.p_run_id,run.id);
      assert.deepEqual(args.p_answers,run.answers);
      run.submitted=true;
      return {data:{ok:true,score:run.score,correct:run.correct,lives:run.lives},error:null};
    }
    if(name==='arcade_verify_action_summary_shadow'){
      assert.ok(runs.get(uid).submitted);
      return {data:{ok:true,consistent:true},error:null};
    }
    if(name==='arcade_async_challenge_finalize'){
      assert.equal(args.p_challenge_id,challenge);
      assert.equal(args.p_run_id,runs.get(uid).id);
      assert.ok(runs.get(uid).submitted);
      if(uid===owner)ownerDone=true;else guestDone=true;
      return {data:resultFor(uid),error:null};
    }
    if(name==='arcade_async_challenge_status'){
      assert.equal(args.p_challenge_id,challenge);
      return {data:resultFor(uid),error:null};
    }
    throw Error('Unexpected RPC '+name);
  }
 };
}
class E{
 constructor(id=''){this.id=id;this.textContent='';this.value='';this.disabled=false;
  this.className='';this.dataset={};this.style={};this.children=[];this.listeners={};
  this.classList={toggle(){},add(){},remove(){},contains(){return false;}};}
 addEventListener(n,cb){this.listeners[n]=cb;}
 setAttribute(){} append(...args){this.children.push(...args);}
 replaceChildren(...args){this.children=[...args];}
 querySelectorAll(){return [];}
 querySelector(k){return this[k]||(this[k]=new E(k));}
 focus(){} select(){}
}
function instance(uid,href){
 const elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,new E(id));return elements.get(id);};
 const doc={documentElement:{lang:'cs'},getElementById:get,createElement:(tag)=>new E(tag)};
 const mockWindow={
  GTGAuthConfig:{url:'https://example.invalid',publishableKey:'publishable-mock',storageKey:'key'},
  supabase:{createClient:()=>apiFor(uid)},
  location:{href},addEventListener(){}
 };
 const local=new Map();
 const storage={
  getItem:key=>local.get(key)||null,setItem:(key,value)=>local.set(key,value)
 };
 const fakeNavigator={onLine:true,clipboard:{writeText:async()=>{}}};
 const game=new Function('window','document','localStorage','navigator','crypto','URL',js)(
   mockWindow,doc,storage,fakeNavigator,
   {randomUUID:()=>String(++opCount).padStart(8,'0')+'-0000-4000-8000-000000000000'},
   URL);
 return {game,get,elements};
}
async function main(){
 const a=instance(owner,'https://foxey-cz.github.io/GuessTheGame-Web/secure-quiz-beta.html');
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(a.game.getState().me.id,owner);
 await a.game.createAsyncChallenge();
 assert.equal(a.game.getState().game.challenge.role,'creator');
 assert.equal(a.game.getState().game.ids[0],ids[0]);
 await a.game.answer('Wrong 0');await a.game.next();
 await a.game.answer('Wrong 1');await a.game.next();
 await a.game.answer('Wrong 2');await a.game.next();
 assert.ok(ownerDone);
 assert.equal(a.get('asyncResult').classList!==null,true);
 assert.ok(a.get('asyncShare').value.includes('?challenge='+challenge));
 assert.ok(!a.get('asyncResultMessage').textContent.includes('XP'));

 const b=instance(guest,a.get('asyncShare').value);
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(b.get('asyncInvite').value,challenge);
 await b.game.joinAsyncChallenge();
 assert.equal(b.game.getState().game.ids.join(','),a.game.getState().game.ids.join(','));
 await b.game.hint();
 await b.game.answer('Correct 0');await b.game.next();
 await b.game.answer('Wrong 1');await b.game.next();
 await b.game.answer('Wrong 2');await b.game.next();
 await b.game.answer('Wrong 3');await b.game.next();
 assert.ok(guestDone);
 assert.equal(runs.get(guest).score,7);
 assert.ok(b.get('asyncResultMessage').textContent.includes('Vyhráváš'));
 await a.game.checkAsyncChallenge();
 assert.ok(a.get('asyncResultMessage').textContent.includes('Soupeř vyhrál'));
 assert.ok(called.includes('arcade_async_challenge_finalize'));
 assert.ok(!called.includes('arcade_verify_progress_shadow'));
 assert.ok(!called.includes('arcade_sync_legacy'));
 console.log('PASS: two browser users, private challenge link, same questions, verified results, no payouts');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
