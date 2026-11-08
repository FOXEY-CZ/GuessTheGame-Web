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
const js=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match=>match[1]).filter(Boolean).at(-1);
assert.ok(js&&js.includes('arcade_quiz_current_question_shadow'),'Expected server card API');
const exposed=js.replace(/^\s*\(\(\) => \{/,'return (() => {')
 .replace(/\}\)\(\);\s*$/,'return {start,hint,reveal,answer,next,selectGameHub,getState:()=>({game,current,me})};\n})();');
assert.ok(exposed.includes('return {start,hint'),'Could not build isolated game harness');
const elements=new Map();
class Element {
  constructor(id=''){
    this.id=id;this.textContent='';this.disabled=false;this.className='';
    this.style={};this.dataset={};this.children=[];this.listeners={};
    const classes=new Set();
    if(['historyOverlay','achievementsOverlay','missionsOverlay'].includes(id))classes.add('hidden');
    this.classList={
      toggle:(name,force)=>{const enabled=force===undefined?!classes.has(name):force;
        if(enabled)classes.add(name);else classes.delete(name);return enabled;},
      add:(...items)=>items.forEach(x=>classes.add(x)),
      remove:(...items)=>items.forEach(x=>classes.delete(x)),
      contains:name=>classes.has(name)
    };
  }
  setAttribute(){}
  addEventListener(name,callback){this.listeners[name]=callback;}
  click(){return this.listeners.click?.();}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  querySelectorAll(){
    if(this.id==='modes')return modeButtons;
    if(this.id==='gamePanel')return [
      ...(elements.get('options')?.children||[]),
      ...['hintButton','revealButton','nextButton','retryButton']
        .map(id=>elements.get(id)).filter(Boolean)
    ];
    return [];
  }
  querySelector(tag){return this[tag]||(this[tag]=new Element());}
}
const modeButtons=Array.from({length:6},(_,i)=>new Element('mode'+i));
const doc={documentElement:{lang:'cs'},listeners:{},
  addEventListener(name,fn){this.listeners[name]=fn;},
  getElementById(id){
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
   if(name==='arcade_verify_begin_secure_server')
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
 // Shared-game UX: one active section at a time; changing sections never
 // changes the authenticated player, answers, saves or run state.
 const sole=elements.get('gameHubSolo'),chall=elements.get('gameHubChallenges'),
   hist=elements.get('gameHubHistory');
 assert.equal(sole.classList.contains('hidden'),false,'Solo tab must be the default');
 assert.equal(chall.classList.contains('hidden'),true);
 game.selectGameHub('challenges');
 assert.equal(elements.get('modeTitle').textContent,'Soukromé výzvy');
 assert.equal(sole.classList.contains('hidden'),true);
 assert.equal(chall.classList.contains('hidden'),false);
 assert.equal(game.getState().game,null,'choosing a tab cannot start or reset a game');
 game.selectGameHub('history');
 assert.equal(elements.get('modeTitle').textContent,'Historie výzev');
 assert.equal(hist.classList.contains('hidden'),false);
 assert.equal(chall.classList.contains('hidden'),true);
 game.selectGameHub('solo');
 assert.equal(elements.get('modeTitle').textContent,'Vyber režim');
 assert.equal(sole.classList.contains('hidden'),false);
 await game.start('classic');
 assert.equal(game.getState().current.cs,'Otázka 0');
 const firstButtons=elements.get('options').children;
 assert.equal(firstButtons.length,4,'First question must show four choices');
 assert.ok(firstButtons.every(btn=>!btn.disabled),'Choices should unlock after the first question loads');
 assert.ok(firstButtons.every(btn=>typeof btn.listeners.click==='function'),
   'All four answer buttons must be clickable before using a hint');
 // Regression for mobile bug: previously first-render buttons had no click
 // listener because they were created while start() held busy=true.
 assert.equal(calls.filter(name=>name==='arcade_verify_action_shadow').length,0);
 await firstButtons[1].listeners.click();
 assert.equal(acceptedAnswers,1,'A direct click without hint must submit the first answer');
 assert.equal(game.getState().game.lives,2);
 await game.next();
 await game.hint();
 // Keyboard shortcut must reuse the exact answer button's server action.
 let prevented=false;
 doc.listeners.keydown({
   key:'2',target:{tagName:'INPUT'},preventDefault(){prevented=true;}
 });
 assert.equal(acceptedAnswers,1,'typing in a field must not submit an answer');
 doc.listeners.keydown({
   key:'2',target:{tagName:'BODY'},preventDefault(){prevented=true;}
 });
 for(let i=0;i<10;i++)await Promise.resolve();
 assert.equal(prevented,true);
 assert.equal(acceptedAnswers,2,'pressing 2 must select the second server-backed answer');
 await game.next();
 await game.answer('Wrong 2');
 assert.ok(game.getState().game.finished);
 await game.next();
 assert.ok(calls.includes('arcade_verify_complete'));
 assert.ok(calls.includes('arcade_verify_action_summary_shadow'));
 assert.equal(elements.get('finalScore').textContent,'0');
 assert.equal(acceptedAnswers,3);
 console.log('PASS: first-answer click WITHOUT hint, 4 active buttons, hint, three-strikes, audit, no payouts');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
