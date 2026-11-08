'use strict';
// In-app challenge history, result notice and ownership UX mock.
// Run: node tests/secure-async-history-client.cjs
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','secure-quiz-beta.html'),'utf8');
assert.ok(html.includes('id="historyBell"'));
assert.ok(html.includes('id="historyList"'));
assert.ok(!html.includes('window.GTG_QUESTIONS='));
const raw=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(m=>m[1]).filter(Boolean).at(-1);
const script=raw.replace(/^\s*\(\(\) => \{/,'return (() => {')
 .replace(/\}\)\(\);\s*$/,
   'return {refreshHistory,openHistoryResult,renderHistory,goToHistory,closeHistoryOverlay,\n  setTestGame:g=>{game=g;},
  setTestCurrent:c=>{current=c;},
  sendQuestionReport,toggleReport,
  getState:()=>({historyUnread,historyItems,me,game,current})};\n})();');
assert.ok(script.includes('return {refreshHistory'));
const challenge='11111111-1111-4111-8111-111111111111';
const other='44444444-4444-4444-8444-444444444444';
const owner='22222222-2222-4222-8222-222222222222';
const friend='33333333-3333-4333-8333-333333333333';
class E {
  constructor(id=''){this.id=id;this.textContent='';this.value='';this.className='';
    this.dataset={};this.disabled=false;this.children=[];this.listeners={};this.attributes={};
    this.hidden=false;
    this.classList={toggle:(name,turn)=>{if(name==='hidden')this.hidden=!!turn;},
      add:(name)=>{if(name==='hidden')this.hidden=true;},
      remove:(name)=>{if(name==='hidden')this.hidden=false;},
      contains:(name)=>name==='hidden'&&this.hidden};
  }
  addEventListener(name,listener){this.listeners[name]=listener;}
  setAttribute(key,val){this.attributes[key]=val;}
  append(...args){this.children.push(...args);}
  replaceChildren(...args){this.children=[...args];}
  querySelectorAll(){return [];}
  querySelector(k){return this[k]||(this[k]=new E(k));}
  focus(){}select(){}scrollIntoView(){}
}
function instance(uid, initiallyFinished=true){
  let isFinished=initiallyFinished;
  const elements=new Map();
  const get=id=>{if(!elements.has(id))elements.set(id,new E(id));return elements.get(id);};
  const doc={documentElement:{lang:'cs'},title:'FOXEY Arcade · Guess the Game',
    visibilityState:'visible',getElementById:get,createElement:tag=>new E(tag)};
  const intervals=[],listeners={};const reads=new Map(),archived=new Map(),rpcCalls=[],reportCalls=[];
  function entries(){
    const seen=reads.get(challenge)||false;
    return [{
      challenge_id:challenge,role:uid===owner?'creator':'challenger',
      mode:'classic',created_at:'2026-11-07T20:00:00.000Z',
      expires_at:'2026-11-14T20:00:00.000Z',
      both_done:isFinished,unread:isFinished&&!seen,status:isFinished?'finished':'waiting',
      ...(isFinished?{your_score:uid===owner?10:7,opponent_score:uid===owner?7:10,
        winner:uid===owner?'you':'opponent'}:{})
    },{
      challenge_id:other,role:'creator',mode:'mystery',
      created_at:'2026-11-07T19:00:00.000Z',
      expires_at:'2026-11-14T19:00:00.000Z',
      both_done:false,unread:false,status:'waiting'
    }];
  }
  const api={
    auth:{getSession:async()=>({data:{session:{user:{id:uid}}},error:null})},
    rpc:async(name,args)=>{
      rpcCalls.push(name);
      if(name==='arcade_async_challenge_history'){
        assert.equal(args.p_limit,40);
        assert.equal(args.p_offset,0);
        const items=entries().filter(e=>!!archived.get(e.challenge_id)===args.p_archived);
        return {data:{ok:true,items,unread:isFinished&&!reads.get(challenge)&&
          !archived.get(challenge)?1:0,archived:args.p_archived,has_more:false,total:items.length},
          error:null};
      }
      if(name==='arcade_quiz_report_question'){
        reportCalls.push(args);
        return {data:{ok:true,credited:false,already_reported:false,report_id:challenge},error:null};
      }
      if(name==='arcade_async_challenge_archive'){
        if(args.p_challenge_id!==challenge)throw Error('unexpected_archive_target');
        archived.set(challenge,args.p_archived);
        if(args.p_archived&&isFinished)reads.set(challenge,true);
        return {data:{ok:true,challenge_id:challenge,archived:args.p_archived},error:null};
      }
      if(name==='arcade_async_challenge_status'){
        assert.ok([challenge,other].includes(args.p_challenge_id));
        if(args.p_challenge_id===other)
          return {data:{ok:true,role:'creator',both_done:false},error:null};
        const item=entries()[0];return {data:{ok:true,...item},error:null};
      }
      if(name==='arcade_async_challenge_mark_seen'){
        assert.equal(args.p_challenge_id,challenge);
        reads.set(challenge,true);
        return {data:{ok:true,seen:true},error:null};
      }
      throw Error('Unexpected RPC '+name);
    }
  };
  const win={GTGAuthConfig:{url:'https://example.invalid',
    publishableKey:'mock_publishable',storageKey:'mock_login'},
    supabase:{createClient:()=>api},
    location:{href:'https://foxey-cz.github.io/GuessTheGame-Web/secure-quiz-beta.html'},
    addEventListener:(name,callback)=>{listeners[name]=callback;},
    setInterval:(callback,ms)=>{intervals.push({callback,ms});return intervals.length;}
  };
  const browserStorage={getItem:()=>null,setItem:()=>{}};
  const navigator={onLine:true,clipboard:{writeText:async()=>{}}};
  const app=new Function('window','document','navigator','localStorage','crypto','URL',script)(
    win,doc,navigator,browserStorage,{randomUUID:()=>challenge},URL);
  return {app,get,doc,intervals,listeners,rpcCalls,reads,archived,reportCalls,
    finishChallenge:()=>{isFinished=true;}};
}
async function settle(){for(let i=0;i<12;i++)await Promise.resolve();}
async function main(){
  // A new result appears while the creator still has the site open.
  const waiting=instance(owner,false);
  await settle();
  assert.equal(waiting.app.getState().historyUnread,0);
  assert.ok(!waiting.app.getState().historyItems[0].both_done);
  assert.ok(!waiting.app.getState().historyItems[0].hasOwnProperty('your_score'));
  waiting.finishChallenge();
  waiting.intervals[0].callback();
  await settle();
  assert.equal(waiting.app.getState().historyUnread,1);
  assert.equal(waiting.get('historyBellCount').textContent,'1');
  assert.ok(!waiting.rpcCalls.includes('arcade_async_challenge_mark_seen'));
  assert.ok(waiting.get('historyNotice').textContent.includes('nepřečtených'));

  const first=instance(owner);
  await settle();
  assert.equal(first.app.getState().me.id,owner);
  assert.equal(first.app.getState().historyUnread,1);
  assert.equal(first.get('historyBellCount').textContent,'1');
  assert.ok(first.doc.title.startsWith('(1)'));
  assert.equal(first.app.getState().historyItems.length,2);
  assert.equal(first.get('historyList').children.length,2);
  // The bell is ALWAYS clickable during the active quiz. Viewing the shared
  // inbox must not discard the round, answer choices or pending RPC state.
  const activeRound={id:challenge,idx:5,finished:false,resultShown:false,
    answers:[{choice:'A'}],lives:2};
  first.app.setTestGame(activeRound);
  first.app.setTestCurrent({id:'s904'});
  first.app.toggleReport();
  assert.equal(first.get('reportForm').hidden,false);
  first.get('reportReason').value='wrong_answer';
  first.get('reportDetails').value='FS22 and FS25 look too similar';
  await first.app.sendQuestionReport();
  await settle();
  assert.equal(first.reportCalls.length,1);
  assert.deepEqual(first.reportCalls[0],{
    p_run_id:challenge,p_question_index:5,
    p_reason:'wrong_answer',p_details:'FS22 and FS25 look too similar'
  });
  assert.ok(first.get('reportStatus').textContent.includes('Děkuju'));
  assert.equal(first.app.getState().game,activeRound);
  assert.equal(first.app.getState().game.idx,5);
  // A report cannot generate another answer event or advance a game.
  assert.ok(!first.rpcCalls.includes('arcade_verify_action_shadow'));
  first.app.goToHistory();
  assert.equal(first.app.getState().game,activeRound);
  assert.equal(first.get('historyOverlay').hidden,false);
  assert.equal(first.get('historyOverlayList').children.length,2);
  first.app.closeHistoryOverlay();
  assert.equal(first.get('historyOverlay').hidden,true);
  assert.equal(first.app.getState().game,activeRound);
  assert.equal(first.app.getState().game.idx,5);
  const finished=first.get('historyList').children[0];
  assert.ok(finished.children[2].textContent.includes('Vyhráváš'));
  const pending=first.get('historyList').children[1];
  assert.ok(!pending.children[2].textContent.includes('XP'));
  assert.ok(!first.rpcCalls.includes('arcade_async_challenge_mark_seen'));
  // Repeated automatic refreshes must NOT dismiss unread results.
  assert.equal(first.intervals.length,1);
  assert.equal(first.intervals[0].ms,45000);
  first.intervals[0].callback();await settle();
  assert.equal(first.app.getState().historyUnread,1);
  assert.ok(!first.rpcCalls.includes('arcade_async_challenge_mark_seen'));
  first.doc.visibilityState='hidden';
  const called=first.rpcCalls.length;
  first.intervals[0].callback();await settle();
  assert.equal(first.rpcCalls.length,called);
  first.doc.visibilityState='visible';
  first.listeners.focus();await settle();
  assert.ok(first.rpcCalls.length>called);

  await first.app.openHistoryResult(challenge);
  await settle();
  assert.equal(first.app.getState().historyUnread,0);
  assert.equal(first.get('historyBellCount').textContent,'0');
  assert.equal(first.doc.title,'FOXEY Arcade · Guess the Game');
  assert.ok(first.get('historyDetail').textContent.includes('Vyhráváš'));
  assert.equal(first.reads.get(challenge),true);
  // A finished result can be archived without disturbing the active game.
  const dismiss=first.get('historyList').children[0].children[0].children[1];
  assert.equal(dismiss.textContent,'✕');
  await dismiss.listeners.click();await settle();
  assert.equal(first.archived.get(challenge),true);
  assert.equal(first.app.getState().historyItems.length,1);
  assert.equal(first.app.getState().game,activeRound);
  first.get('historyArchiveToggle').listeners.click();await settle();
  assert.equal(first.app.getState().historyItems.length,1);
  const restore=first.get('historyList').children[0].children[0].children[1];
  // In this fake DOM the first child is the heading; restore is its 2nd child.
  assert.equal(restore.textContent,'↩');
  await restore.listeners.click();await settle();
  assert.equal(first.archived.get(challenge),false);
  first.get('historyArchiveToggle').listeners.click();await settle();
  assert.equal(first.app.getState().historyItems.length,2);

  // The other player's unread state is separate from the first player's.
  const second=instance(friend);
  await settle();
  assert.equal(second.app.getState().historyUnread,1);
  assert.ok(second.get('historyList').children[0].children[2].textContent.includes('Soupeř vyhrál'));
  await second.app.openHistoryResult(challenge);
  await settle();
  assert.equal(second.app.getState().historyUnread,0);
  assert.ok(second.get('historyDetail').textContent.includes('Soupeř vyhrál'));
  assert.equal(second.reads.get(challenge),true);

  // Language switch renders translated UI without losing server record.
  const languageButton=second.get('lang');
  languageButton.listeners.click();
  assert.equal(second.doc.documentElement.lang,'en');
  assert.ok(second.get('historyList').children[0].children[2].textContent.includes('Opponent wins'));
  assert.equal(second.get('historyBell').attributes['aria-label'],'My challenges; unread results: 0');
  assert.ok(!first.rpcCalls.includes('arcade_verify_progress_shadow'));
  assert.ok(!second.rpcCalls.includes('arcade_sync_legacy'));
  console.log('PASS: secure quiz notification archive and restore, no lost game, independent read receipts');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
