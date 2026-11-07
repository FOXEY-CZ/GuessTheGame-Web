'use strict';
// Shared FOXEY Arcade header bell and account-scoped history, independent
// from iframe games, wallet operations and user-controlled score data.
// Run: node tests/arcade-global-notifications-client.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const code=fs.readFileSync(path.join(__dirname,'..','arcade','notifications.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','arcade','index.html'),'utf8');
const styles=fs.readFileSync(path.join(__dirname,'..','arcade','styles.css'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'..','arcade','app.js'),'utf8');
assert.ok(html.includes('id="arcadeBell"'));
assert.ok(html.includes('id="arcadeNoticeOverlay"'));
assert.ok(html.includes('notifications.js?v='));
assert.ok(styles.includes('.topbar{position:sticky'));
assert.ok(app.includes('FOXEY_ARCADE_NOTIFICATIONS?.connect(supa,user)'));
assert.ok(app.includes('FOXEY_ARCADE_NOTIFICATIONS?.connect(supa,null)'));
assert.ok(!code.includes('innerHTML'),'Server history must be rendered as text');
assert.ok(!code.includes('service_role'));
const uu=['22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333'];
const cid='11111111-1111-4111-8111-111111111111';
const activeId='44444444-4444-4444-8444-444444444444';
class E{
  constructor(id=''){this.id=id;this.textContent='';this.value='';this.children=[];
    this.className='';this.listeners={};this.attrs={};this.hidden=id==='arcadeNoticeOverlay';
    this.classList={toggle:(k,t)=>{if(k==='hidden')this.hidden=!!t},
      contains:k=>k==='hidden'?this.hidden:false};
  }
  setAttribute(k,v){this.attrs[k]=v}
  addEventListener(k,v){this.listeners[k]=v}
  replaceChildren(...args){this.children=[...args]}
  append(...args){this.children.push(...args)}
  focus(){}select(){}
}
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
const elements=new Map(ids.map(id=>[id,new E(id)]));
const $=id=>elements.get(id);
const document={getElementById:$,
  createElement:tag=>new E(tag),visibilityState:'visible',
  addEventListener:(type,fn)=>{document.listeners[type]=fn},listeners:{}};
const events={};let interval=null;
const window={FOXEY_I18N:{getLocale:()=>window.locale},locale:'cs',
  addEventListener:(type,fn)=>{events[type]=fn},
  setInterval:(fn,ms)=>{assert.equal(ms,45000);interval=fn;return 1;}};
const navigator={onLine:true,clipboard:{writeText:async()=>{}}};
const location={href:'https://foxey-cz.github.io/GuessTheGame-Web/arcade/'};
function apiFor(uid){
  const reads=new Map();
  const calls=[];
  return {
    reads,calls,
    rpc:async(name,args)=>{
      calls.push(name);
      if(name==='arcade_async_challenge_inbox'){
        assert.deepEqual(args,{p_limit:40});
        return {data:{ok:true,unread:reads.get(cid)?0:1,
          items:[{challenge_id:cid,role:uid===uu[0]?'creator':'challenger',
            mode:'classic',status:'finished',both_done:true,unread:!reads.get(cid),
            your_score:uid===uu[0]?20:13,opponent_score:uid===uu[0]?13:20,
            winner:uid===uu[0]?'you':'opponent'},
            {challenge_id:activeId,role:uid===uu[0]?'creator':'challenger',
             mode:'mystery',status:uid===uu[0]?'creator_playing':'challenger_playing',
             creator_done:uid===uu[1],challenger_done:false,
             both_done:false,unread:false}]},error:null};
      }
      if(name==='arcade_async_challenge_status'){
        assert.equal(args.p_challenge_id,cid);
        return {data:{ok:true,role:uid===uu[0]?'creator':'challenger',
          both_done:true,your_score:uid===uu[0]?20:13,
          opponent_score:uid===uu[0]?13:20,
          winner:uid===uu[0]?'you':'opponent'},error:null};
      }
      if(name==='arcade_async_challenge_mark_seen'){
        assert.equal(args.p_challenge_id,cid);
        reads.set(cid,true);return {data:{ok:true,seen:true},error:null};
      }
      throw Error('Unexpected RPC '+name);
    }
  };
}
async function settle(){for(let i=0;i<20;i++)await Promise.resolve();}
async function main(){
  const shared=new Function('window','document','navigator','location','URL',code)(
    window,document,navigator,location,URL);
  assert.equal(shared,undefined);
  const notifications=window.FOXEY_ARCADE_NOTIFICATIONS;
  assert.ok(notifications?.connect);
  assert.equal($('arcadeNoticeOverlay').hidden,true);
  notifications.open();
  assert.equal($('arcadeNoticeOverlay').hidden,false);
  assert.ok($('arcadeNoticeStatus').textContent.includes('Přihlas'));
  notifications.close();
  const first=apiFor(uu[0]);
  notifications.connect(first,{id:uu[0]});
  await settle();
  assert.equal($('arcadeBellCount').textContent,'1');
  assert.equal($('arcadeBellCount').hidden,false);
  assert.equal($('arcadeNoticeList').children.length,2);
  assert.ok($('arcadeNoticeList').children[0].children[2].textContent.includes('Vyhrál'));
  const activeCard=$('arcadeNoticeList').children[1];
  const resume=activeCard.children[3].children[0];
  assert.ok(resume.textContent.includes('Pokračovat'));
  assert.ok(resume.href.includes('secure-quiz-beta.html'));
  assert.ok(resume.href.includes('resume='+activeId));
  assert.equal(resume.target,'_blank');
  assert.equal(resume.rel,'noopener noreferrer');
  assert.ok(!activeCard.children[2].textContent.includes('XP'));
  const count=first.calls.length;
  interval();await settle();
  assert.ok(first.calls.length>count,'account-wide poll must run in any embedded game');
  assert.ok(!first.calls.includes('arcade_async_challenge_mark_seen'),
    'Polling must not mark notifications as read');
  notifications.open();await settle();
  const card=$('arcadeNoticeList').children[0];
  const resultButton=card.children[3].children[0];
  await resultButton.listeners.click();await settle();
  assert.equal($('arcadeBellCount').hidden,true);
  assert.equal($('arcadeBellCount').textContent,'0');
  assert.ok($('arcadeNoticeDetail').textContent.includes('Vyhrál'));
  assert.equal(first.reads.get(cid),true);
  assert.ok(!first.calls.includes('arcade_sync_legacy'));
  assert.ok(!first.calls.includes('arcade_verify_progress_shadow'));
  notifications.close();
  assert.equal($('arcadeNoticeOverlay').hidden,true);
  const second=apiFor(uu[1]);
  notifications.connect(second,{id:uu[1]});
  await settle();
  assert.equal($('arcadeBellCount').textContent,'1','other account unread must remain independent');
  assert.ok($('arcadeNoticeList').children[0].children[2].textContent.includes('Prohrál'));
  window.locale='en';events['foxey-arcade:locale-changed']();
  assert.ok($('arcadeNoticeList').children[0].children[2].textContent.includes('You lost'));
  notifications.connect(second,null);
  assert.equal($('arcadeBellCount').hidden,true);
  assert.ok($('arcadeNoticeStatus').textContent.includes('Sign in'));
  assert.equal($('arcadeNoticeList').children.length,0,
    'logout must clear other account history without affecting game');
  console.log('PASS: Arcade-wide bell, two accounts, unread polling, own read receipts, logout, no wallet writes');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
