'use strict';
// Six-mode solo continue UI and server-owned progress, across devices.
// Run in repo root: node tests/secure-singleplayer-continue-client.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','secure-quiz-beta.html'),'utf8');
const modes=['classic','mystery','daily','easy','medium','hard'];
assert.ok(!html.includes('window.GTG_QUESTIONS='));
assert.ok(!html.includes('service_role'));
for(const mode of modes){
  assert.ok(html.includes('id="soloStart_'+mode+'"'));
  assert.ok(html.includes('id="soloContinue_'+mode+'"'));
  assert.ok(html.includes('data-mode-card="'+mode+'"'));
  assert.ok(html.includes('data-solo-continue="'+mode+'"'));
}
const raw=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
 .map(x=>x[1]).filter(Boolean).at(-1);
const code=raw.replace(/^\s*\(\(\) => \{/,'return (() => {')
 .replace(/\}\)\(\);\s*$/,
 'return {start,resumeSolo,refreshSoloModes,modeScreen,hint,reveal,answer,next,\n'+
 ' getState:()=>({game,current,me,soloProgressByMode})};\n})();');
assert.ok(code.includes('return {start,resumeSolo'));
const owner='22222222-2222-4222-8222-222222222222';
const outsider='33333333-3333-4333-8333-333333333333';
const runs=new Map(),callLog=[];let counter=0;
const uuid=()=>{
  counter++;
  return String(counter).padStart(8,'0')+'-0000-4000-8000-000000000000';
};
function active(uid){
  const out=[];
  for(const run of runs.values()){
    if(run.uid!==uid||run.submitted||run.expired||run.challenge)continue;
    const old=out.findIndex(e=>e.mode===run.mode);
    const entry={run_id:run.id,mode:run.mode,
      question_count:run.questionIds.length,
      next_index:run.index,score:run.score,correct:run.correct,
      lives:run.lives,finished:run.finished};
    if(old>=0)out.splice(old,1);
    out.push(entry);
  }
  return out;
}
function newRun(uid,mode){
  const id=uuid(),length=mode==='daily'?5:10;
  const r={id,uid,mode,questionIds:Array.from({length},(_,i)=>
    's'+String(i+1).padStart(3,'0')),
    index:0,score:0,correct:0,lives:3,hint:null,
    reveals:[],answers:[],finished:false,submitted:false,
    expired:false,challenge:false};
  runs.set(id,r);return r;
}
function api(uid){
 return {
  auth:{getSession:async()=>({data:{session:{user:{id:uid}}},error:null})},
  rpc:async(name,args)=>{
   callLog.push({name,uid});
   if(name==='arcade_async_challenge_inbox')
     return {data:{ok:true,items:[],unread:0},error:null};
   if(name==='arcade_secure_singleplayer_in_progress')
     return {data:{ok:true,shadow:true,credited:false,items:active(uid)},error:null};
   if(name==='arcade_verify_begin_secure_server'){
     const run=newRun(uid,args.p_mode);
     return {data:{ok:true,server_issued:true,run_id:run.id,
       question_ids:run.questionIds},error:null};
   }
   if(name==='arcade_secure_singleplayer_resume'){
     const r=runs.get(args.p_run_id);
     if(!r||r.uid!==uid)
       return {data:null,error:{message:'run_not_yours'}};
     if(r.expired)return {data:null,error:{message:'run_expired'}};
     if(r.submitted)return {data:null,error:{message:'singleplayer_secure_run_required'}};
     return {data:{ok:true,shadow:true,credited:false,resumed:true,
       run_id:r.id,mode:r.mode,question_ids:r.questionIds,
       next_index:r.index,score:r.score,correct:r.correct,lives:r.lives,
       answers:r.answers.map(a=>({...a})),finished:r.finished,
       submitted:false,hint_used:!!r.hint,hint:r.hint,
       reveals:r.reveals.map(x=>({...x}))},error:null};
   }
   if(name==='arcade_quiz_current_question_shadow'){
     const r=runs.get(args.p_run_id);
     assert.ok(r);assert.equal(r.uid,uid);
     assert.equal(args.p_index,r.index);
     assert.ok(!r.finished);
     return {data:{ok:true,shadow:true,credited:false,run_id:r.id,
       index:r.index,id:r.questionIds[r.index],difficulty:'easy',
       cs:'Otázka '+r.index,en:'Question '+r.index,genre:'adventure',
       options:['Right '+r.index,'Wrong '+r.index,'X','Y']},error:null};
   }
   if(name==='arcade_verify_action_shadow'){
     const r=runs.get(args.p_run_id);
     assert.ok(r);assert.equal(r.uid,uid);assert.equal(args.p_question_index,r.index);
     const base={ok:true,shadow:true,credited:false,
       event_id:args.p_event_id,action:args.p_action};
     if(args.p_action==='hint'){
       r.hint={cs:'Uložená nápověda',en:'Saved hint'};
       return {data:{...base,hintCs:r.hint.cs,hintEn:r.hint.en},error:null};
     }
     if(args.p_action==='reveal'){
       const clue={cs:'Indicie '+r.reveals.length,en:'Clue '+r.reveals.length};
       r.reveals.push(clue);
       return {data:{...base,revealCs:clue.cs,revealEn:clue.en},error:null};
     }
     if(args.p_action==='answer'){
       const index=r.index,win=args.p_choice==='Right '+index;
       const pts=win?(r.mode==='mystery'?20-5*r.reveals.length:
         r.hint?7:10):0;
       if(win){r.score+=pts;r.correct++;}else r.lives--;
       r.answers.push({choice:args.p_choice,hint:!!r.hint,reveal:r.reveals.length});
       r.index++;r.hint=null;r.reveals=[];
       r.finished=r.lives===0||r.index===r.questionIds.length;
       return {data:{...base,was_correct:win,
         correct_answer:'Right '+index,points_awarded:pts,
         score:r.score,correct:r.correct,lives:r.lives,
         finished:r.finished},error:null};
     }
     throw Error('unexpected action');
   }
   if(name==='arcade_verify_complete'){
     const r=runs.get(args.p_run_id);
     assert.ok(r.finished);assert.deepEqual(args.p_answers,r.answers);
     r.submitted=true;
     return {data:{ok:true,score:r.score,correct:r.correct,lives:r.lives},error:null};
   }
   if(name==='arcade_verify_action_summary_shadow'){
     const r=runs.get(args.p_run_id);
     return {data:{ok:true,consistent:r.submitted},error:null};
   }
   throw Error('Unexpected RPC '+name);
  }
 };
}
class E {
 constructor(id=''){this.id=id;this.value='';this.textContent='';this.disabled=false;
   this.style={};this.dataset={};this.children=[];this.listeners={};this.attrs={};
   this.hidden=id.startsWith('soloContinue_')||id.startsWith('soloProgress_');
   this.classList={
     toggle:(key,val)=>{if(key==='hidden')this.hidden=!!val;},
     add:key=>{if(key==='hidden')this.hidden=true;},
     remove:key=>{if(key==='hidden')this.hidden=false;},
     contains:key=>key==='hidden'&&this.hidden
   };
 }
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,v){this.listeners[k]=v;}
 append(...x){this.children.push(...x);}
 replaceChildren(...x){this.children=x;}
 querySelectorAll(){return [];}
 querySelector(x){return this[x]||(this[x]=new E(x));}
 focus(){}select(){}scrollIntoView(){}
}
function browser(uid=owner){
 const elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,new E(id));return elements.get(id)};
 const document={documentElement:{lang:'cs'},title:'FOXEY Arcade',visibilityState:'visible',
   getElementById:get,createElement:t=>new E(t),addEventListener(){}};
 const storage=new Map();
 const win={
   GTGAuthConfig:{url:'https://example.invalid',publishableKey:'mock',storageKey:'mock'},
   supabase:{createClient:()=>api(uid)},
   location:{href:'https://foxey-cz.github.io/GuessTheGame-Web/secure-quiz-beta.html'},
   addEventListener(){},setInterval(){}
 };
 const navigator={onLine:true,clipboard:{writeText:async()=>{}}};
 const app=new Function('window','document','localStorage','navigator','crypto','URL',code)(
   win,document,{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
   navigator,{randomUUID:uuid},URL);
 return {app,get,document};
}
async function settle(){for(let i=0;i<20;i++)await Promise.resolve()}
async function main(){
 const b=browser(owner);await settle();
 for(const m of modes){
   assert.equal(b.get('soloContinue_'+m).hidden,true,
     'No resume button before a run exists');
   assert.equal(b.get('soloStart_'+m).textContent,'🆕 Nová hra');
 }
 const onModes=b.get('modes').listeners.click;
 assert.equal(typeof onModes,'function');
 // Real delegated click on the visible New Game control.
 onModes({target:{closest:selector=>
   selector==='button[data-mode]'?{dataset:{mode:'classic'}}:null}});
 await settle();
 const initial=b.app.getState().game.id;
 await b.app.hint();
 const fresh=browser(owner);await settle();
 assert.equal(fresh.get('soloContinue_classic').hidden,false);
 assert.equal(fresh.get('soloContinue_mystery').hidden,true);
 assert.ok(fresh.get('soloProgress_classic').textContent.includes('Otázka 1/10'));
 // Real delegated click on the visible Continue control.
 fresh.get('modes').listeners.click({target:{closest:selector=>
   selector==='button[data-solo-continue]'?
     {dataset:{soloContinue:'classic'}}:null}});
 await settle();
 assert.equal(fresh.app.getState().game.id,initial);
 assert.equal(fresh.app.getState().current.hint.cs,'Uložená nápověda');
 await fresh.app.answer('Right 0');
 await fresh.app.next();
 assert.equal(runs.get(initial).score,7);
 const again=browser(owner);await settle();
 assert.ok(again.get('soloProgress_classic').textContent.includes('Otázka 2/10'));
 await again.app.resumeSolo('classic');
 assert.equal(again.app.getState().game.idx,1);
 assert.equal(again.app.getState().game.score,7);
 assert.equal(again.app.getState().game.answers.length,1);
 assert.equal(again.app.getState().game.lives,3);
 assert.equal([...runs.values()].length,1,'Continue must not create new runs');
 // Choosing New Game starts a separate run in that exact mode.
 const newGame=browser(owner);await settle();
 await newGame.app.start('classic');
 const second=newGame.app.getState().game.id;
 assert.notEqual?.(second,initial);
 assert.ok(second!==initial);
 const updated=browser(owner);await settle();
 assert.equal(updated.app.getState().soloProgressByMode.classic.run_id,second);
 // Mystery: two clues are restored without re-charging the player.
 const mystery=browser(owner);await settle();await mystery.app.start('mystery');
 const mysteryId=mystery.app.getState().game.id;
 await mystery.app.reveal();await mystery.app.reveal();
 const mysteryReturn=browser(owner);await settle();
 assert.equal(mysteryReturn.get('soloContinue_mystery').hidden,false);
 await mysteryReturn.app.resumeSolo('mystery');
 assert.equal(mysteryReturn.app.getState().game.id,mysteryId);
 assert.equal(mysteryReturn.app.getState().current.reveals.length,2);
 // Daily challenge is five questions, separately resumable.
 const daily=browser(owner);await settle();await daily.app.start('daily');
 const dailyId=daily.app.getState().game.id;
 const dailyBack=browser(owner);await settle();
 assert.ok(dailyBack.get('soloProgress_daily').textContent.includes('1/5'));
 await dailyBack.app.resumeSolo('daily');
 assert.equal(dailyBack.app.getState().game.id,dailyId);
 assert.equal(dailyBack.app.getState().game.ids.length,5);
 // Server errors never permit another user's account to see progress.
 const stranger=browser(outsider);await settle();
 assert.equal(stranger.get('soloContinue_classic').hidden,true);
 assert.equal(stranger.get('soloContinue_mystery').hidden,true);
 // A completed game removes its continue button, but not other modes.
 const ended=browser(owner);await settle();
 await ended.app.resumeSolo('classic');
 await ended.app.answer('Wrong 0');await ended.app.next();
 await ended.app.answer('Wrong 1');await ended.app.next();
 await ended.app.answer('Wrong 2');await ended.app.next();
 assert.ok(runs.get(second).submitted);
 ended.app.modeScreen();await ended.app.refreshSoloModes();
 assert.equal(ended.get('soloContinue_classic').hidden,false,
   'The older unfinished game remains eligible after explicitly starting a new one');
 assert.equal(ended.app.getState().soloProgressByMode.classic.run_id,initial);
 assert.equal(ended.get('soloContinue_mystery').hidden,false);
 assert.equal(ended.get('soloContinue_daily').hidden,false);
 assert.ok(!callLog.some(x=>/payout|wallet|credit/i.test(x.name)));
 console.log('PASS: six mode cards; new/continue per mode; hints, Mystery, daily, cross-device, score & lives, no payouts');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
