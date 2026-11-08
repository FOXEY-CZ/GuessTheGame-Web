'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('arcade/index.html','utf8');
const js=fs.readFileSync('arcade/app.js','utf8');
const source=fs.readFileSync('arcade/missions.js','utf8');
for(const id of ['page-missions','homeMissionList','dailyMissionList','weeklyMissionList',
 'missionsRefresh','homeMissionStatus','missionsStatus','dailyMissionCountdown']){
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
const api={rpc:async(name)=>{
 rpcCount++;
 assert.equal(name,'arcade_global_missions');
 const earned=first?[{code:'daily_play',shards:5}]:[];
 first=false;
 return {data:{ok:true,missions,new_rewards:earned},error:null};
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
  const progress=elements.get('dailyMissionList').children[1].children[1].children[3].children[0];
  assert.equal(progress.style.width,'60%');
  await ui.refresh();await settle();
  assert.equal(awards,1,'status refresh must not credit twice');
  locale='en';window.events['foxey-arcade:locale-changed']();
  assert.equal(elements.get('dailyMissionList').children[0].children[1].children[0].textContent,'First Game');
  ui.connect(null,null);
  assert.ok(elements.get('missionsStatus').textContent.includes('Sign in'));
  assert.equal(elements.get('dailyMissionList').children.length,1);
  console.log('PASS: mission render, daily/weekly grouping, progress, auto credit signal, refresh safety, translation and logout isolation');
})().catch(err=>{console.error(err);process.exitCode=1;});
