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
   `return {refreshHistory,openHistoryResult,renderHistory,goToHistory,closeHistoryOverlay,\n  setTestGame:g=>{game=g;},
  setTestCurrent:c=>{current=c;},
  sendQuestionReport,toggleReport,refreshLiveRewards,showLiveRewardReceipt,finish,
  openGameAchievements,closeGameAchievements,refreshGameAchievements,
  openGameMissions,closeGameMissions,refreshGameMissions,
  getState:()=>({historyUnread,historyItems,me,game,current})};\n})();`);
assert.ok(script.includes('return {refreshHistory'));
const challenge='11111111-1111-4111-8111-111111111111';
const other='44444444-4444-4444-8444-444444444444';
const owner='22222222-2222-4222-8222-222222222222';
const friend='33333333-3333-4333-8333-333333333333';
class E {
  constructor(id=''){this.id=id;this.textContent='';this.value='';this.className='';
    this.dataset={};this.disabled=false;this.children=[];this.listeners={};this.attributes={};
    this.style={};
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
  const rewards={ok:true,available:true,enabled:false,xp:0,level:1,
    shards:71,crowns:52,paid_today:0,daily_limit:8};
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
      if(name==='arcade_verify_complete'){
        assert.equal(args.p_run_id,challenge);
        return {data:{ok:true,score:90,correct:9,lives:2},error:null};
      }
      if(name==='arcade_verify_action_summary_shadow'){
        assert.equal(args.p_run_id,challenge);
        return {data:{ok:true,consistent:true},error:null};
      }
      if(name==='arcade_verified_rewards_claim'){
        assert.equal(args.p_run_id,challenge);
        rewards.xp+=90;rewards.level=1;rewards.shards+=6;rewards.crowns+=1;
        return {data:{ok:true,credited:true,run_id:challenge,
          xp:90,shards:6,crowns:1,level:1,xp_total:rewards.xp},error:null};
      }
      if(name==='arcade_secure_singleplayer_in_progress'){
        return {data:{ok:true,credited:false,items:[]},error:null};
      }
      if(name==='arcade_verified_rewards_status'){
        return {data:{...rewards},error:null};
      }
      if(name==='arcade_verified_rewards_auto_activate'){
        assert.equal(args,undefined);
        rewards.enabled=true;
        return {data:{...rewards,legacy_import_frozen:true},error:null};
      }
      if(name==='arcade_verified_rewards_reconcile'){
        assert.deepEqual(args,{p_limit:10});
        return {data:{ok:true,recovered:0,failed:0},error:null};
      }
      if(name==='arcade_global_missions'){
        return {data:{ok:true,daily_start:'2026-11-08',
          weekly_start:'2026-11-02',new_rewards:[],new_streak_rewards:[],
          rotation_enabled:false,streak:{
            current:3,best:3,active_today:true,next_milestone:7,
            milestones:[{days:3,shards:10,crowns:0,free_chests:0},
              {days:7,shards:0,crowns:0,free_chests:1},
              {days:14,shards:30,crowns:0,free_chests:0},
              {days:30,shards:40,crowns:1,free_chests:2}]},
          missions:[{code:'daily_play',period:'daily',icon:'🎮',
            name_cs:'První partie',name_en:'First Game',
            description_cs:'Dohraj jednu hru.',description_en:'Finish one game.',
            target:1,progress:0,reward_shards:5,reward_crowns:0,
            reward_chests:0,completed:false},
          {code:'weekly_marathon',period:'weekly',icon:'🔥',
            name_cs:'Maratonec',name_en:'Marathon',
            description_cs:'Dohraj 20 her.',description_en:'Finish 20 games.',
            target:20,progress:3,reward_shards:0,reward_crowns:0,
            reward_chests:1,completed:false}]},error:null};
      }
      if(name==='arcade_global_achievements'){
        return {data:{ok:true,xp:390,level:4,achievements:[{
          code:'first_game',icon:'🎮',name_cs:'První krok',name_en:'First Steps',
          description_cs:'Dohraj první partii.',description_en:'Finish first run.',
          progress:0,target:1,reward_shards:5,reward_chests:0,unlocked:false
        },{
          code:'level_5',icon:'🥉',name_cs:'Bronzová liška',name_en:'Bronze Fox',
          description_cs:'Dosáhni levelu 5.',description_en:'Reach level 5.',
          progress:4,target:5,reward_shards:15,reward_chests:1,unlocked:false
        }],new_achievements:[]},error:null};
      }
      if(name==='arcade_async_challenge_history'){
        assert.equal(args.p_limit,10);
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
    confirm:()=>true,
    addEventListener:(name,callback)=>{listeners[name]=callback;},
    setInterval:(callback,ms)=>{intervals.push({callback,ms});return intervals.length;}
  };
  const browserStorage={getItem:()=>null,setItem:()=>{}};
  const navigator={onLine:true,clipboard:{writeText:async()=>{}}};
  const app=new Function('window','document','navigator','localStorage','crypto','URL',script)(
    win,doc,navigator,browserStorage,{randomUUID:()=>challenge},URL);
  return {app,get,doc,intervals,listeners,rpcCalls,reads,archived,reportCalls,rewards,
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
  assert.equal(first.rewards.enabled,true);
  assert.ok(first.get('liveRewardsSummary').textContent.includes('Aktivní'));
  assert.ok(first.rpcCalls.includes('arcade_verified_rewards_auto_activate'));
  assert.ok(first.rpcCalls.includes('arcade_verified_rewards_reconcile'));
  assert.ok(!html.includes('id="liveRewardsEnable"'));
  assert.ok(!first.rpcCalls.includes('arcade_verified_rewards_enroll'));
  first.app.showLiveRewardReceipt({
    ok:true,credited:true,xp:80,shards:6,crowns:1,level:1,xp_total:80
  },'');
  assert.ok(first.get('liveRewardSummary').textContent.includes('+80 XP'));
  assert.equal(first.get('noReward').hidden,true);
  // Achievement drawer is available in the middle of a game and leaves
  // the current round and options untouched.
  assert.ok(html.includes('id="achievementsButton"'));
  assert.ok(first.rpcCalls.includes('arcade_global_achievements'));
  first.app.openGameAchievements();await settle();
  assert.equal(first.get('achievementsOverlay').hidden,false);
  assert.equal(first.get('achievementsList').children.length,2);
  assert.equal(first.get('achievementsLevel').textContent,'🎖️ Level 4');
  assert.equal(first.get('achievementHeaderCount').textContent,'0/2');
  first.app.closeGameAchievements();
  assert.equal(first.get('achievementsOverlay').hidden,true);
  first.app.showLiveRewardReceipt({
    ok:true,credited:true,xp:90,shards:5,crowns:0,level:5,xp_total:480,
    new_achievements:[{code:'level_5',icon:'🥉',name_cs:'Bronzová liška',
      name_en:'Bronze Fox',shards:15,free_chests:1}]
  },'');
  assert.equal(first.get('achievementUnlockBanner').hidden,false);
  assert.ok(first.get('achievementUnlockDescription').textContent.includes('Bronzová liška'));
  assert.ok(html.includes('id="missionsButton"'));
  first.app.openGameMissions();await settle();
  assert.equal(first.get('missionsOverlay').hidden,false);
  assert.equal(first.get('gameDailyMissions').children.length,1);
  assert.equal(first.get('gameWeeklyMissions').children.length,1);
  assert.equal(first.get('missionHeaderCount').textContent,'0/2');
  assert.equal(first.get('gameStreakRewards').children.length,4);
  assert.ok(first.get('gameStreakFill').style.width.startsWith('42.'));
  assert.ok(first.get('gameStreakCount').textContent.includes('3'));
  assert.ok(first.get('gameMissionRotationHint').textContent.includes('9. 11.'));
  first.app.closeGameMissions();
  assert.equal(first.get('missionsOverlay').hidden,true);
  first.app.showLiveRewardReceipt({
    ok:true,credited:true,xp:90,shards:5,crowns:0,level:5,xp_total:480,
    new_missions:[{code:'daily_play',icon:'🎮',name_cs:'První partie',
      name_en:'First Game',shards:5,crowns:0,free_chests:0}],
    new_streak_rewards:[{days:3,shards:10,crowns:0,free_chests:0}]
  },'');
  assert.equal(first.get('missionUnlockBanner').hidden,false);
  assert.ok(first.get('missionUnlockDescription').textContent.includes('První partie'));
  assert.equal(first.get('streakUnlockBanner').hidden,false);
  assert.ok(first.get('streakUnlockDescription').textContent.includes('💎 +10'));
  assert.ok(!first.rpcCalls.includes('arcade_sync_legacy'));
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
  // End-to-end mock flow: a finished server-verified game claims live
  // rewards and keeps visible score separate from the actual XP earned.
  const paid=instance(owner);await settle();
  assert.ok(paid.rpcCalls.includes('arcade_verified_rewards_auto_activate'));
  paid.app.setTestGame({id:challenge,mode:'easy',ids:Array(10).fill('s001'),
    idx:9,score:90,correct:9,lives:2,answers:[{choice:'A'}],
    finished:true,resultShown:false,challenge:null});
  await paid.app.finish();await settle();
  assert.equal(paid.app.getState().game.resultShown,true);
  assert.ok(paid.rpcCalls.includes('arcade_verify_complete'));
  assert.ok(paid.rpcCalls.includes('arcade_verify_action_summary_shadow'));
  assert.ok(paid.rpcCalls.includes('arcade_verified_rewards_claim'));
  assert.equal(paid.get('finalScore').textContent,'90');
  assert.ok(paid.get('liveRewardSummary').textContent.includes('+90 XP'));
  assert.equal(paid.get('noReward').hidden,true);
  console.log('PASS: secure quiz notifications + no-click auto-migration and real reward claim, isolated history');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
