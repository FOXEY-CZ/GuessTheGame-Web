'use strict';
/* UI 2.0 smoke test: no real network or currency operations. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('arcade/index.html','utf8');
const source=fs.readFileSync('arcade/ui2.js','utf8');
const app=fs.readFileSync('arcade/app.js','utf8');
const css=fs.readFileSync('arcade/styles.css','utf8');
const keys=['mobileDock','mobileMoreMenu','mobileMoreToggle','mobileMoreShade','mobileMoreClose',
  'challengeRefresh','challengeInboxButton','challengeListPlay','challengeListWaiting',
  'challengeListResults','challengeCountPlay','challengeCountWaiting','challengeCountResults',
  'challengeLaunchStatus','settingsOpenBell','settingsOpenGame','settingsOpenAccount',
  'arcadeLanguage','launchChallenge','gameFrame','arcadeBell'];
for(const k of keys)assert.ok(html.includes('id="'+k+'"'),k+' element missing');
assert.ok(app.includes('FOXEY_ARCADE_UI2?.onPage(page)'));
assert.ok(app.includes('FOXEY_ARCADE_UI2?.connect(supa,user)'));
assert.ok(app.includes('FOXEY_ARCADE_UI2?.setNavigation(go)'));
assert.ok(html.includes('./ui2.js?v='));
assert.ok(css.includes('.arcade-mobile-dock{position:fixed'));
assert.ok(css.includes('env(safe-area-inset-bottom'));
assert.ok(!source.includes('innerHTML'));
assert.ok(!source.includes('service_role'));
assert.ok(!source.includes('.update(') && !source.includes('.insert(') &&
  !source.includes('.delete('),'challenge dashboard must be read-only');

class Element {
  constructor(id=''){
    this.id=id;this.children=[];this.attrs={};this.events={};this.className='';
    this.dataset={};this.disabled=false;this.textContent='';this.focused=false;
    this.hidden=id==='mobileMoreMenu';
    this.classList={
      toggle:(key,force)=>{
        if(key==='hidden')this.hidden=!!force;
        if(key==='active')this.active=!!force;
      },contains:key=>key==='hidden'?this.hidden:!!this.active
    };
  }
  addEventListener(name,cb){this.events[name]=cb;}
  append(...kids){this.children.push(...kids);}
  replaceChildren(...kids){this.children=[...kids];}
  setAttribute(k,v){this.attrs[k]=v;}
  removeAttribute(k){delete this.attrs[k];}
  focus(){this.focused=true;}
  select(){this.selected=true;}
  replaceWith(v){this.replacedWith=v;}
  querySelector(selector){
    const cls=selector.startsWith('.')?selector.slice(1):selector;
    const scan=node=>{
      if(typeof node.className==='string'&&node.className.split(' ').includes(cls))return node;
      for(const child of node.children||[]){const match=scan(child);if(match)return match;}
      return null;
    };
    return scan(this);
  }
  querySelectorAll(selector){
    if(this.id==='mobileMoreMenu' && selector==='button:not([disabled])')
      return [elements.get('mobileMoreClose')];
    return [];
  }
}
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(ids.length,new Set(ids).size,'Duplicate DOM ID');
const elements=new Map(ids.map(id=>[id,new Element(id)]));
const mobile=['home','games','challenges','shop'].map(x=>{
  const e=new Element('mobile-'+x);e.dataset.page=x;return e;
});
const document={
  getElementById:id=>elements.get(id),
  createElement:tag=>new Element(tag),
  body:{classList:{toggle(){}}},
  activeElement:null,
  querySelectorAll:selector=>{
    assert.equal(selector,'.arcade-mobile-dock button[data-page]');
    return mobile;
  },
  events:{},
  addEventListener(name,fn){this.events[name]=fn;}
};
let locale='cs',openBellCount=0,bellRefresh=0,nav=[];
const window={
  FOXEY_I18N:{getLocale:()=>locale},
  FOXEY_ARCADE_NOTIFICATIONS:{open(){openBellCount++;},refresh(){bellRefresh++;}},
  events:{},
  addEventListener(name,fn){this.events[name]=fn;}
};
const navigator={onLine:true,clipboard:{writeText:async()=>{}}};
const location={href:'https://foxey-cz.github.io/GuessTheGame-Web/arcade/'};
vm.runInNewContext(source,{window,document,navigator,location,URL,console});
const ui=window.FOXEY_ARCADE_UI2;
assert.ok(ui,'UI 2.0 module must initialize');

const records=[
  {challenge_id:'11111111-1111-4111-8111-111111111111',role:'creator',
    status:'creator_playing',creator_done:false,challenger_done:false,both_done:false,mode:'classic'},
  {challenge_id:'22222222-2222-4222-8222-222222222222',role:'challenger',
    status:'challenger_playing',creator_done:true,challenger_done:false,both_done:false,mode:'mystery'},
  {challenge_id:'33333333-3333-4333-8333-333333333333',role:'creator',
    status:'waiting',creator_done:true,challenger_done:false,both_done:false,mode:'classic'},
  {challenge_id:'44444444-4444-4444-8444-444444444444',role:'creator',
    status:'finished',creator_done:true,challenger_done:true,both_done:true,
    winner:'you',your_score:95,opponent_score:72,mode:'classic'},
  {challenge_id:'55555555-5555-4555-8555-555555555555',role:'challenger',
    status:'expired',creator_done:true,challenger_done:false,both_done:false,mode:'mystery'}
];
let reads=0;const rpcNames=[];
const api={rpc:async(name,args)=>{
  rpcNames.push(name);
  if(name==='arcade_async_challenge_status'){
    assert.equal(args.p_challenge_id,records[3].challenge_id);
    return {data:{ok:true,role:'creator',both_done:true,winner:'you',
      your_score:95,opponent_score:72},error:null};
  }
  if(name==='arcade_async_challenge_mark_seen'){
    assert.equal(args.p_challenge_id,records[3].challenge_id);
    return {data:{ok:true,seen:true},error:null};
  }
  assert.equal(name,'arcade_async_challenge_history');
  assert.equal(args.p_limit,30);
  assert.equal(args.p_offset,0);
  assert.equal(args.p_archived,false);
  reads++;
  return {data:{ok:true,items:records,archived:false,has_more:false},error:null};
}};
const settle=()=>new Promise(resolve=>setImmediate(resolve));

(async()=>{
  ui.setNavigation(page=>{nav.push(page);ui.onPage(page);});
  ui.connect(api,{id:'player-A'});
  ui.onPage('challenges');
  await settle();
  assert.equal(reads,1);
  assert.equal(elements.get('challengeCountPlay').textContent,'2');
  assert.equal(elements.get('challengeCountWaiting').textContent,'1');
  assert.equal(elements.get('challengeCountResults').textContent,'2');
  assert.equal(elements.get('challengeListPlay').children.length,2);
  assert.equal(elements.get('challengeListWaiting').children.length,1);
  assert.equal(elements.get('challengeListResults').children.length,2);
  const resume=elements.get('challengeListPlay').children[0].children[3].children[0];
  assert.equal(resume.tagName,undefined);
  assert.equal(resume.target,'_blank');
  assert.ok(resume.href.includes('resume=11111111-1111-4111-8111-111111111111'));
  const result=elements.get('challengeListResults').children[0];
  const resultAction=result.children[3].children[0];
  resultAction.events.click();
  await settle();
  assert.equal(resultAction.textContent,'✓ Zobrazeno');
  assert.equal(bellRefresh,1,'viewing a result must update red unread badge');
  assert.equal(result.querySelector('.challenge-card-status').textContent,
    '✓ Výsledek přečten');
  assert.equal(openBellCount,0,'direct result should not force a second navigation');
  elements.get('challengeInboxButton').events.click();
  assert.equal(openBellCount,1);
  elements.get('settingsOpenBell').events.click();
  assert.equal(openBellCount,2);
  elements.get('settingsOpenGame').events.click();
  elements.get('settingsOpenAccount').events.click();
  assert.deepEqual(nav,['play','account']);
  assert.equal(elements.get('mobileMoreToggle').attrs['aria-current'],'page');
  elements.get('mobileMoreToggle').events.click();
  assert.equal(elements.get('mobileMoreMenu').hidden,false);
  assert.equal(elements.get('mobileMoreToggle').attrs['aria-expanded'],'true');
  ui.onPage('home');
  assert.equal(elements.get('mobileMoreMenu').hidden,true);
  assert.equal(elements.get('mobileMoreToggle').attrs['aria-expanded'],'false');
  assert.equal(mobile[0].attrs['aria-current'],'page');
  locale='en';window.events['foxey-arcade:locale-changed']();
  assert.ok(elements.get('challengeListResults').children[0].children[2].textContent.includes('Victory'));
  // Logout: a new or anonymous identity cannot see the previous user's results.
  ui.connect(null,null);
  assert.equal(elements.get('challengeCountPlay').textContent,'—');
  assert.equal(elements.get('challengeListResults').children.length,1);
  assert.ok(!elements.get('challengeListResults').children[0].textContent.includes('Victory'));
  // Delayed network responses after signout must be ignored.
  let finishLate;
  const deferred={rpc:()=>new Promise(resolve=>{finishLate=resolve;})};
  ui.connect(deferred,{id:'player-A'});
  ui.onPage('challenges');
  ui.connect(null,null);
  finishLate({data:{ok:true,items:records,archived:false,has_more:false},error:null});
  await settle();
  assert.equal(elements.get('challengeCountResults').textContent,'—');
  assert.ok(rpcNames.every(name=>[
    'arcade_async_challenge_history','arcade_async_challenge_status',
    'arcade_async_challenge_mark_seen'
  ].includes(name)));
  console.log('PASS: mobile More nav, live categorized challenges, resume links, settings actions, account separation and read-only safety');
})().catch(err=>{console.error(err);process.exitCode=1;});
