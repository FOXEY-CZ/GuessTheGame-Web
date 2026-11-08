'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('arcade/index.html','utf8');
const js=fs.readFileSync('arcade/app.js','utf8');
const source=fs.readFileSync('arcade/missions.js','utf8');
for(const id of ['page-missions','homeMissionList','dailyMissionList','weeklyMissionList',
 'missionsRefresh','homeMissionStatus','missionsStatus','dailyMissionCountdown',
 'streakPanelTitle','streakCurrentCount','homeStreakCount','homeStreakHint',
 'streakStatus','streakMilestones','streakProgressFill','missionRotationInfo']){
 assert.ok(html.includes('id="'+id+'"'),'Missing mission UI '+id);
}
assert.ok(html.includes('./missions.js?v='));
assert.ok(js.includes('FOXEY_ARCADE_MISSIONS?.connect(supa,user)'));
assert.ok(js.includes('FOXEY_ARCADE_MISSIONS?.onPage(page)'));
assert.ok(js.includes('FOXEY_ARCADE_MISSIONS?.refresh()'));
assert.ok(!source.includes('.update(')&&!source.includes('.insert(')&&
 !source.includes('.delete('),'Mission UI must not directly mint rewards');
class Node {
 constructor(id=''){this.id=id;this.children=[];this.textContent='';
 this.className='';this.attrs={};this.style={};this.disabled=false;this.events={};}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 addEventListener(key,callback){this.events[key]=callback;}
 setAttribute(k,v){this.attrs[k]=v;}
}
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
assert.equal(ids.length,new Set(ids).size,'Mission page created duplicate IDs');
const elements=new Map(ids.map(id=>[id,new Node(id)]));
const document={
 getElementById:id=>elements.get(id),
 createElement:tag=>new Node(tag),
 visibilityState:'visible'
};
let locale='cs',awards=0,rpcCount=0;
const window={
  FOXEY_I18N:{getLocale:()=>locale},
  events:{},
  addEventListener(k,fn){this.events[k]=fn;},
  dispatchEvent(event){if(event.type==='foxey-arcade:missions-awarded')awards++;}
};
const missions=[
{code:'daily_play',period:'daily',icon:'🎮',
 name_cs:'První partie',name_en:'First Game',description_cs:'Dohraj jednu hru.',
 description_en:'Finish a game.',progress:1,target:1,completed:true,
 reward_shards:5,reward_crowns:0,reward_chests:0},
{code:'daily_correct',period:'daily',icon:'🧠',
 name_cs:'Herní znalec',name_en:'Game Knowledge',description_cs:'Odpověz správně.',
 description_en:'Correct answers.',progress:9,target:15,completed:false,
 reward_shards:10,reward_crowns:0,reward_chests:0},
{code:'weekly_marathon',period:'weekly',icon:'🔥',
 name_cs:'Maratonec',name_en:'Marathon',description_cs:'Odehraj 20 her.',
 description_en:'Play 20 games.',progress:3,target:20,completed:false,
 reward_shards:0,reward_crowns:0,reward_chests:1}
];
let first=true;
const streak={current:3,best:3,active_today:true,
 start_date:'2026-11-06',last_played:'2026-11-08',next_milestone:7,
 milestones:[{days:3,shards:10,crowns:0,free_chests:0},
 {days:7,shards:0,crowns:0,free_chests:1},
 {days:14,shards:30,crowns:0,free_chests:0},
 {days:30,shards:40,crowns:1,free_chests:2}]};
const api={rpc:async(name)=>{
 rpcCount++;
 assert.equal(name,'arcade_global_missions');
 const earned=first?[{code:'daily_play',shards:5}]:[];
 first=false;
 return {data:{ok:true,missions,new_rewards:earned,rotation_enabled:false,streak,new_streak_rewards:[]},error:null};
}};
const global={
 window,document,navigator:{onLine:true},Event:class Event{constructor(type){this.type=type;}},
 console
};
vm.runInNewContext(source,global);
const ui=window.FOXEY_ARCADE_MISSIONS;
assert.ok(ui);
const settle=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  ui.connect(api,{id:'player-A'});
  await settle();
  assert.equal(rpcCount,1);
  assert.equal(awards,1);
  assert.equal(elements.get('dailyMissionList').children.length,2);
  assert.equal(elements.get('weeklyMissionList').children.length,1);
  assert.equal(elements.get('homeMissionList').children.length,3);
  assert.ok(elements.get('homeMissionStatus').textContent.includes('1 / 3'));
  assert.equal(elements.get('streakCurrentCount').textContent,'3 dny');
  assert.ok(elements.get('homeStreakCount').textContent.includes('3 dny'));
  assert.equal(elements.get('streakMilestones').children.length,4);
  assert.ok(elements.get('streakProgressFill').style.width.startsWith('42.'));
  assert.ok(elements.get('missionRotationInfo').textContent.includes('9. 11.'));
  assert.ok(elements.get('streakMilestones').children[0].className.includes('complete'));
  const progress=elements.get('dailyMissionList').children[1].children[1].children[3].children[0];
  assert.equal(progress.style.width,'60%');
  await ui.refresh();await settle();
  assert.equal(awards,1,'status refresh must not credit twice');
  locale='en';window.events['foxey-arcade:locale-changed']();
  assert.equal(elements.get('dailyMissionList').children[0].children[1].children[0].textContent,'First Game');
  ui.connect(null,null);
  assert.ok(elements.get('missionsStatus').textContent.includes('Sign in'));
  assert.equal(elements.get('dailyMissionList').children.length,1);
  assert.equal(elements.get('streakMilestones').children.length,0);
  console.log('PASS: mission render, daily/weekly grouping, progress, auto credit signal, refresh safety, translation and logout isolation');
})().catch(err=>{console.error(err);process.exitCode=1;});
