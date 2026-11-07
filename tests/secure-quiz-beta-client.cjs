'use strict';
// Isolated DOM + Supabase RPC simulation. Never contacts the network or live wallet.
// Run from repository root: node tests/secure-quiz-beta-client.cjs
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','secure-quiz-beta.html'),'utf8');
assert.ok(!html.includes('GTG_QUESTIONS'),'Secure beta must not embed the legacy answer bank');
assert.ok(!html.includes('service_role'),'Service-role secrets must never be in frontend');
assert.ok(!html.includes('arcade_verify_progress_shadow'),'Beta must not mint shadow rewards');
assert.ok(!html.includes('arcade_sync_legacy'),'Beta must not mint live rewards');
const js=[...html.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/g)]
  .map(match=>match[1]).filter(Boolean).at(-1);
assert.ok(js&&js.includes('arcade_quiz_current_question_shadow'),'Expected server card API');
const exposed=js.replace(/^\\s*\\(\\(\\) => \\{/,'return (() => {')
 .replace(/\\}\\)\\(\\);\\s*$/,'return {start,hint,reveal,answer,next,getState:()=>({game,current,me})};\\n})();');
assert.ok(exposed.includes('return {start,hint'),'Could not build isolated game harness');
const elements=new Map();
class Element {
  constructor(id=''){
    this.id=id;this.textContent='';this.disabled=false;this.className='';
    this.style={};this.dataset={};this.children=[];this.listeners={};
    this.classList={toggle(){},add(){},remove(){}};
  }
  setAttribute(){}
  addEventListener(name,callback){this.listeners[name]=callback;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  querySelectorAll(){return this.id==='modes'?modeButtons:[];}
  querySelector(tag){return this[tag]||(this[tag]=new Element());}
}
const modeButtons=Array.from({length:6},(_,i)=>new Element('mode'+i));
const doc={documentElement:{lang:'cs'},getElementById(id){
 if(!elements.has(id))elements.set(id,new Element(id));
 return elements.get(id);
},createElement(tag){return new Element(tag);}};
const ids=Array.from({length:10},(_,i)=>'q'+String(i+1).padStart(3,'0'));
const rid='22222222-2222-4222-8222-222222222222';
const uid='11111111-1111-4111-8111-111111111111';
const calls=[];
let serverIndex=0,serverLives=3,serverScore=0,serverCorrect=0;
let acceptedAnswers=0,hintUsed=false;
const api={
 auth:{getSession:async()=>({data:{session:{user:{id:uid}}},error:null})},
 rpc:async(name,args)=>{
   calls.push(name);
   if(name==='arcade_verify_begin_server')
     return {data:{ok:true,server_issued:true,run_id:rid,question_ids:ids},error:null};
   if(name==='arcade_quiz_current_question_shadow'){
     assert.equal(args.p_index,serverIndex);
     return {data:{ok:true,shadow:true,credited:false,run_id:rid,
       index:serverIndex,id:ids[serverIndex],difficulty:'easy',
       cs:'Otázka '+serverIndex,en:'Question '+serverIndex,
       options:['Correct '+serverIndex,'Wrong '+serverIndex,'X','Y']},error:null};
   }
   if(name==='arcade_verify_action_shadow'){
     if(args.p_action==='hint'){
       hintUsed=true;
       return {data:{ok:true,shadow:true,credited:false,
         event_id:args.p_event_id,action:'hint',hintCs:'Nápověda',hintEn:'Hint'},error:null};
     }
     if(args.p_action==='answer'){
       assert.equal(args.p_question_index,serverIndex);
       const win=args.p_choice==='Correct '+serverIndex;
       const points=win?(hintUsed?7:10):0;
       if(win){serverScore+=points;serverCorrect++;}else serverLives--;
       const result={ok:true,shadow:true,credited:false,
         event_id:args.p_event_id,action:'answer',was_correct:win,
         correct_answer:'Correct '+serverIndex,points_awarded:points,
         score:serverScore,correct:serverCorrect,lives:serverLives,
         finished:serverLives===0||serverIndex===9};
       serverIndex++;hintUsed=false;acceptedAnswers++;
       return {data:result,error:null};
     }
     throw Error('Unexpected action: '+name);
   }
   if(name==='arcade_verify_complete'){
     assert.equal(args.p_answers.length,acceptedAnswers);
     return {data:{ok:true,score:serverScore,correct:serverCorrect,
       lives:serverLives},error:null};
   }
   if(name==='arcade_verify_action_summary_shadow')
     return {data:{ok:true,consistent:true},error:null};
   throw Error('Unexpected RPC '+name);
 }
};
const mockWindow={
 GTGAuthConfig:{url:'https://example.invalid',publishableKey:'test',storageKey:'test'},
 supabase:{createClient:()=>api},addEventListener(){}
};
const mockStorage={getItem:()=>null,setItem(){}};
async function main(){
 const game=new Function('window','document','localStorage','navigator','crypto',exposed)(
   mockWindow,doc,mockStorage,{onLine:true},{randomUUID:()=>rid});
 await Promise.resolve();await Promise.resolve();
 assert.ok(game.getState().me,'Same-origin sign-in must be discovered');
 await game.start('classic');
 assert.equal(game.getState().current.cs,'Otázka 0');
 await game.hint();
 await game.answer('Wrong 0');
 assert.equal(game.getState().game.lives,2);
 await game.next();
 await game.answer('Wrong 1');
 await game.next();
 await game.answer('Wrong 2');
 assert.ok(game.getState().game.finished);
 await game.next();
 assert.ok(calls.includes('arcade_verify_complete'));
 assert.ok(calls.includes('arcade_verify_action_summary_shadow'));
 assert.equal(elements.get('finalScore').textContent,'0');
 assert.equal(acceptedAnswers,3);
 console.log('PASS: answer-blind cards, hint, server actions, three-strikes, final audit, no payouts');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
