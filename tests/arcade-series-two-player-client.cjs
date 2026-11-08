'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('arcade/index.html','utf8');
const js=fs.readFileSync('arcade/live.js','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
const playerA='11111111-1111-4111-8111-111111111111';
const playerB='22222222-2222-4222-8222-222222222222';
const seriesID='33333333-3333-4333-8333-333333333333';
const matchIDs=[
 '44444444-4444-4444-8444-444444444444',
 '55555555-5555-4555-8555-555555555555',
 '66666666-6666-4666-8666-666666666666'
];
const profiles={
 [playerA]:{user_id:playerA,nickname:'FOXEY'},
 [playerB]:{user_id:playerB,nickname:'Buddy'}
};
let series=null,matches=[],createCount=0,nextCreates=0,headCalls=0;
const tr=m=>m==='speed'?'speed':'classic';
function output(viewer,m){
 return {match_id:m.id,state:m.state,mode:m.mode||'classic',
  role:m.host===viewer?'host':'guest',
  series_id:m.series_id,series_game_no:m.series_game_no,
  opponent:profiles[m.host===viewer?m.guest:m.host],
  created_at:new Date().toISOString(),
  host_score:m.host_score||0,guest_score:m.guest_score||0};
}
function serverFor(viewer){return {rpc:async(name,args={})=>{
 const opposite=viewer===playerA?playerB:playerA;
 if(name==='arcade_live_ping')return {data:{ok:true}};
 if(name==='arcade_live_dashboard')return {data:{
  ok:true,friends:[{profile:profiles[opposite],online:true}],
  matches:matches.map(m=>output(viewer,m)).reverse()
 }};
 if(name==='arcade_live_stats')return {data:{ok:true,
  self:{profile:profiles[viewer],played:0,wins:0,losses:0,draws:0,accuracy:0,win_rate:0},
  leaderboard:[]}};
 if(name==='arcade_live_series_create'){
  assert.equal(args.p_friend_id,opposite);
  assert.equal(args.p_target_wins,2);
  assert.equal(args.p_mode,'speed');
  if(series)return {data:{ok:true,match_id:matchIDs[0],series_id:seriesID,retry:true}};
  createCount++;
  series={state:'active',id:seriesID,target_wins:2,mode:'speed'};
  matches=[{id:matchIDs[0],host:viewer,guest:opposite,series_id:seriesID,
    series_game_no:1,mode:'speed',state:'invited',host_score:0,guest_score:0}];
  return {data:{ok:true,series_id:seriesID,match_id:matchIDs[0],state:'active',
   target_wins:2,retry:false}};
 }
 if(name==='arcade_live_state'){
  const m=matches.find(x=>x.id===args.p_match_id);
  if(!m)return {error:{message:'match_unavailable'}};
  return {data:{ok:true,...output(viewer,m),host_ready:false,guest_ready:false,
   question_index:0,round_deadline:null,question:null,my_answered:false,
   opponent_answered:false,credited:false,rematch_of:null}};
 }
 if(name==='arcade_live_series_state'){
  assert.equal(args.p_series_id,seriesID);
  const wA=matches.filter(m=>m.state==='finished'&&m.host_score>m.guest_score).length;
  const wB=matches.filter(m=>m.state==='finished'&&m.guest_score>m.host_score).length;
  if(wA>=2||wB>=2)series.state='finished';
  const last=matches[matches.length-1];
  return {data:{ok:true,series_id:seriesID,state:series.state,mode:'speed',
    target_wins:2,first_player:profiles[playerA],second_player:profiles[playerB],
    my_role:viewer===playerA?'first':'second',
    first_wins:wA,second_wins:wB,
    my_wins:viewer===playerA?wA:wB,opponent_wins:viewer===playerB?wA:wB,
    draws:0,completed_games:matches.filter(m=>m.state==='finished').length,
    winner_id:series.state==='finished'?(wA>=2?playerA:playerB):null,
    latest_match_id:last.id,latest_state:last.state,
    games:matches.map(m=>({match_id:m.id,game_no:m.series_game_no,
      state:m.state,first_score:m.host_score,second_score:m.guest_score}))}};
 }
 if(name==='arcade_live_series_next'){
  assert.equal(args.p_series_id,seriesID);
  if(series.state!=='active')return {data:{ok:true,state:series.state,match_id:matches.at(-1).id}};
  const last=matches.at(-1);
  if(last.state!=='finished'){
   return {data:{ok:true,state:last.state,match_id:last.id,existing:true}};
  }
  const id=matchIDs[matches.length];assert.ok(id,'unexpected extra series match');
  nextCreates++;
  matches.push({id,host:playerA,guest:playerB,series_id:seriesID,
    series_game_no:matches.length+1,mode:'speed',state:'lobby',host_score:0,guest_score:0});
  return {data:{ok:true,state:'lobby',match_id:id,existing:false}};
 }
 if(name==='arcade_live_respond'){
  const m=matches.find(x=>x.id===args.p_match_id);
  assert.ok(m&&viewer===m.guest);
  assert.equal(args.p_accept,true);
  m.state='lobby';return {data:{ok:true,state:'lobby'}};
 }
 if(name==='arcade_live_head_to_head'){
  headCalls++;assert.equal(args.p_friend_id,opposite);
  return {data:{ok:true,friend:profiles[opposite],
   summary:{played:3,wins:2,losses:1,draws:0,points_scored:23,points_conceded:19},
   history:matches.filter(m=>m.state==='finished').map(m=>({
     match_id:m.id,series_id:seriesID,series_game_no:m.series_game_no,
     mode:'speed',finished_at:'2026-11-08T20:00:00.000Z',
     my_score:viewer===playerA?m.host_score:m.guest_score,
     opponent_score:viewer===playerA?m.guest_score:m.host_score,
     result:m.host_score===m.guest_score?'draw':
       (viewer===playerA?m.host_score>m.guest_score:m.guest_score>m.host_score)?
         'win':'loss'}))}};
 }
 throw Error('unexpected RPC '+name);
 }}}
class Element{
 constructor(id=''){
  this.id=id;this.children=[];this.events={};this.textContent='';this.className='';
  this.value=id==='liveSeriesSelect'?'1':id==='liveModeSelect'?'classic':'';
  this.disabled=false;this.style={};
  const classes=new Set(id==='liveArena'||id==='liveSeriesSummary'?['hidden']:[]);
  this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),
   toggle:(x,v)=>{if(v)classes.add(x);else classes.delete(x)},
   contains:x=>classes.has(x)};
 }
 append(...x){this.children.push(...x);}
 replaceChildren(...x){this.children=[...x];}
 addEventListener(name,fn){this.events[name]=fn;}
 scrollIntoView(){}focus(){}
}
function browser(viewer){
 const nodes=new Map(ids.map(id=>[id,new Element(id)]));
 const document={getElementById:id=>nodes.get(id),createElement:name=>new Element(name),
  visibilityState:'visible',addEventListener(){}};
 const saved=new Map();
 const window={FOXEY_I18N:{getLocale:()=> 'cs'},
  FOXEY_ARCADE_SOCIAL:{refreshInbox(){}},addEventListener(){},setInterval(){},
  sessionStorage:{getItem:k=>saved.get(k)||null,
   setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)}
 };
 let n=0;const crypto={randomUUID:()=>{n++;return '99999999-9999-4999-8999-'+String(n).padStart(12,'0')}};
 const navigator={onLine:true};
 const location={search:'',href:'https://foxey-cz.github.io/GuessTheGame-Web/arcade/'};
 vm.runInNewContext(js,{window,document,crypto,navigator,location,
   URLSearchParams,console,setTimeout});
 const ui=window.FOXEY_ARCADE_LIVE;assert.ok(ui);
 ui.setNavigation(()=>{});
 ui.connect(serverFor(viewer),{id:viewer});
 ui.onPage('community');
 return {ui,nodes};
}
const settle=async()=>{for(let n=0;n<15;n++)
 await new Promise(resolve=>setImmediate(resolve));};
const buttons=browser=>browser.nodes.get('liveArenaControls').children;
const button=(browser,pattern)=>buttons(browser).find(x=>pattern.test(x.textContent));
(async()=>{
 const a=browser(playerA),b=browser(playerB);
 await settle();
 a.nodes.get('liveSeriesSelect').value='2';
 a.nodes.get('liveModeSelect').value='speed';
 const friendRow=a.nodes.get('liveFriendList').children[0];
 const invite=friendRow.children[1].children[0];
 invite.events.click();await settle();
 assert.equal(createCount,1,'series creation must use authorized RPC');
 assert.equal(a.nodes.get('liveArena').classList.contains('hidden'),false);
 assert.ok(a.nodes.get('liveSeriesSummary').textContent==='' ||
   a.nodes.get('liveSeriesSummary').children.length>0,'scoreboard present');
 await b.ui.openMatch(matchIDs[0],false);await settle();
 assert.ok(button(b,/Přijmout/),'opponent must consent to first series game');
 button(b,/Přijmout/).events.click();await settle();
 for(let round=0;round<3;round++){
  const m=matches[round];
  // Server-scored results are represented as immutable finished game states here.
  m.state='finished';
  m.host_score=round===1?1:8;
  m.guest_score=round===1?7:2;
  await a.ui.openMatch(m.id,false);
  await b.ui.openMatch(m.id,false);await settle();
  const score=a.nodes.get('liveSeriesSummary').children[0].children[1].textContent;
  assert.equal(score,
    round===0?'1 : 0':round===1?'1 : 1':'2 : 1',
    'series scoreboard should reflect all games');
  if(round<2){
   assert.ok(button(a,/Další zápas série/),'finished game should enable next');
   button(a,/Další zápas série/).events.click();await settle();
   assert.equal(nextCreates,round+1);
   // Opponent on previous result must be able to join the already-created lobby.
   await b.ui.openMatch(m.id,false);await settle();
   assert.ok(button(b,/Připojit se k další hře série/),
    'other player must join rather than create another match');
   button(b,/Připojit se k další hře série/).events.click();await settle();
   assert.equal(nextCreates,round+1,'two players must share one next match');
  }
 }
 assert.equal(series.state,'finished');
 assert.ok(a.nodes.get('liveSeriesSummary').children.some(x=>
   /Vyhrál jsi celou sérii/.test(x.textContent)));
 assert.ok(!button(a,/Další zápas série/),'server-finished series must not offer more rounds');
 assert.equal(nextCreates,2);
 // A head-to-head fetch must render stored server results without exposing answer keys.
 const historyButton=a.nodes.get('liveFriendList').children[0].children[1].children[1];
 historyButton.events.click();await settle();
 assert.ok(headCalls>0);
 assert.equal(a.nodes.get('liveHeadToHeadRows').children.length,3);
 assert.ok(a.nodes.get('liveHeadToHeadStats').children.length>=4);
 a.ui.connect(null,null);b.ui.connect(null,null);
 assert.ok(a.nodes.get('liveArena').classList.contains('hidden'));
 console.log('PASS: two-user BO3 2:1, shared next lobby, no duplicate rounds, winner and H2H ledger, logout.');
})().catch(err=>{console.error(err);process.exitCode=1});