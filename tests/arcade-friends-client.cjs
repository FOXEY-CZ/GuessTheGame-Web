'use strict';
// Friends UI should only pass opaque IDs to authenticated server RPCs.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('arcade/index.html','utf8');
const app=fs.readFileSync('arcade/app.js','utf8');
const code=fs.readFileSync('arcade/friends.js','utf8');
const notices=fs.readFileSync('arcade/notifications.js','utf8');
const game=fs.readFileSync('secure-quiz-beta.html','utf8');
const css=fs.readFileSync('arcade/styles.css','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(ids.length,new Set(ids).size,'duplicate HTML IDs');
for(const id of ['page-community','friendsRefresh','myFriendCode','copyFriendCode',
 'friendsSearchForm','friendsSearchInput','friendsSearchButton','friendsSearchResults',
 'friendsIncomingList','friendsOutgoingList','friendsList','friendsBlockedList',
 'friendProfilePanel','friendProfileActions','arcadeSocialBellList','arcadeSocialNext',
 'arcadeSocialPrev','arcadeBell']){
 assert.ok(ids.includes(id),'Missing UI element '+id);
}
assert.ok(app.includes('FOXEY_ARCADE_SOCIAL?.connect(supa,user)'));
assert.ok(app.includes('FOXEY_ARCADE_SOCIAL?.onPage(page)'));
assert.ok(app.includes('FOXEY_ARCADE_SOCIAL?.setNavigation(go)'));
assert.ok(html.includes('friends.js?v='));
assert.ok(notices.includes('foxey-arcade:social-unread'));
assert.ok(game.includes("urlParams.get('friend_challenge')"));
assert.ok(game.includes('void joinAsyncChallenge()'));
assert.ok(game.includes('if(data.retry===true)'));
assert.ok(css.includes('.friends-code-card'));
assert.ok(!code.includes('innerHTML'));
assert.ok(!code.includes('service_role'));
assert.ok(!/\.from\(['"]arcade_wallet/.test(code));
class Node{
 constructor(id=''){
  this.id=id;this.children=[];this.events={};this.textContent='';
  this.className='';this.style={};this.attrs={};this.disabled=false;this.value='';
  const names=new Set(id==='friendProfilePanel'?['hidden']:[]);
  this.classList={
   add:x=>names.add(x),remove:x=>names.delete(x),
   toggle:(x,v)=>{if(v)names.add(x);else names.delete(x);},
   contains:x=>names.has(x)
  };
 }
 append(...xs){this.children.push(...xs);}
 replaceChildren(...xs){this.children=[...xs];}
 addEventListener(k,fn){this.events[k]=fn;}
 setAttribute(k,v){this.attrs[k]=v;}
 scrollIntoView(){}
}
const nodes=new Map(ids.map(id=>[id,new Node(id)]));
const document={getElementById:id=>nodes.get(id),createElement:k=>new Node(k),visibilityState:'visible'};
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const request='33333333-3333-4333-8333-333333333333';
const notif='44444444-4444-4444-8444-444444444444';
const challenge='55555555-5555-4555-8555-555555555555';
const profileA={user_id:a,nickname:'FOXEY',avatar_id:'fox',level:5,
 arcade_xp:434,achievements:3,verified_games:1};
const profileB={user_id:b,nickname:'Buddy',avatar_id:'robot',level:2,
 arcade_xp:130,achievements:1,verified_games:2};
let state='pending',nUnread=1,archiveCount=0,assigned='',bellUnread=[];
let copied='',seen=false,requestSent=false;
const rpcCalls=[];
const api={rpc:async(name,args)=>{
 rpcCalls.push({name,args});
 if(name==='arcade_friends_dashboard'){
  return {data:{ok:true,my_code:'FX-ABCDEF123456',
    friends:state==='accepted'?[{request_id:request,profile:profileB}]:[],
    incoming:state==='pending'?[{request_id:request,profile:profileB}]:[],
    outgoing:[],blocked:[]}};
 }
 if(name==='arcade_social_inbox'){
  assert.equal(args.p_limit,10);
  return {data:{ok:true,items:[{notification_id:notif,
    kind:'friend_challenge',subject_id:challenge,
    actor:profileB,unread:true,challenge_ready:true}],unread:nUnread,
    archived:false,has_more:false,total:1}};
 }
 if(name==='arcade_friends_search'){
  assert.equal(args.p_query,'Buddy');
  return {data:{ok:true,results:[profileB]}};
 }
 if(name==='arcade_friend_public_profile'){
  assert.equal(args.p_user_id,b);return {data:{ok:true,profile:profileB}};
 }
 if(name==='arcade_friend_respond'){
  assert.equal(args.p_request_id,request);assert.equal(args.p_accept,true);
  state='accepted';return {data:{ok:true,state}};
 }
 if(name==='arcade_friend_challenge_create'){
  assert.equal(args.p_friend_id,b);assert.equal(args.p_mode,'classic');
  assert.match(args.p_operation,/^[0-9a-f-]{36}$/i);
  return {data:{ok:true,challenge_id:challenge,run_id:request,targeted:true}};
 }
 if(name==='arcade_social_notification_seen'){
  assert.equal(args.p_notification_id,notif);nUnread=0;seen=true;
  return {data:{ok:true,seen:true}};
 }
 if(name==='arcade_social_notification_archive'){
  archiveCount++;
  return {data:{ok:true,archived:true}};
 }
 throw Error('Unexpected RPC '+name);
}};
const window={
 FOXEY_I18N:{getLocale:()=> 'cs'},
 FOXEY_ARCADE_NOTIFICATIONS:{refresh:()=>{}},
 addEventListener(){},
 setInterval(){},
 dispatchEvent:event=>{if(event.type==='foxey-arcade:social-unread')bellUnread.push(event.detail.unread);}
};
const location={href:'https://foxey-cz.github.io/GuessTheGame-Web/arcade/',
 assign:url=>{assigned=url}};
const navigator={onLine:true,clipboard:{writeText:async text=>{copied=text}}};
const crypto={randomUUID:()=>request};
const CustomEvent=class{constructor(type,opts){this.type=type;this.detail=opts.detail}};
vm.runInNewContext(code,{window,document,location,URL,navigator,crypto,CustomEvent,console});
const ui=window.FOXEY_ARCADE_SOCIAL;
assert.ok(ui);
const settle=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 ui.setNavigation(()=>{});
 ui.connect(api,{id:a});
 await settle();await settle();
 assert.equal(nodes.get('myFriendCode').textContent,'FX-ABCDEF123456');
 assert.equal(nodes.get('friendsIncomingList').children.length,1);
 assert.equal(nodes.get('friendsCount').textContent,'0');
 assert.ok(bellUnread.includes(1));
 nodes.get('copyFriendCode').events.click();await settle();
 assert.equal(copied,'FX-ABCDEF123456');
 nodes.get('friendsSearchInput').value='Buddy';
 await nodes.get('friendsSearchForm').events.submit({preventDefault(){}});
 assert.equal(nodes.get('friendsSearchResults').children.length,1);
 // Explicit consent: accepting is an RPC made by the signed-in recipient.
 const incoming=nodes.get('friendsIncomingList').children[0];
 const buttons=incoming.children[1].children;
 await buttons[1].events.click(); // accept
 await settle();await settle();await settle();
 assert.equal(state,'accepted');
 assert.equal(nodes.get('friendsCount').textContent,'1');
 // Challenge friend, receive a server-bound receipt, then open the creator run.
 const friendCard=nodes.get('friendsList').children[0];
 await friendCard.children[1].children[1].events.click();
 assert.ok(assigned.includes('resume='+challenge));
 assert.ok(rpcCalls.some(x=>x.name==='arcade_friend_challenge_create'));
 // Bell opens only participant-authorized challenge link, marks notification read.
 assigned='';
 const invite=nodes.get('arcadeSocialBellList').children[0].children[2].children[0];
 invite.events.click();await settle();await settle();
 assert.ok(seen);
 assert.ok(assigned.includes('friend_challenge='+challenge));
 assert.equal(bellUnread[bellUnread.length-1],0);
 // No cross-account stale state after switching to anonymous mode.
 ui.connect(null,null);
 assert.equal(nodes.get('myFriendCode').textContent,'—');
 assert.equal(nodes.get('friendsCount').textContent,'—');
 assert.equal(bellUnread[bellUnread.length-1],0);
 assert.ok(rpcCalls.every(x=>[
  'arcade_friends_dashboard','arcade_social_inbox','arcade_friends_search',
  'arcade_friend_respond','arcade_friend_public_profile',
  'arcade_friend_challenge_create','arcade_social_notification_seen'
 ].includes(x.name)),'unexpected privileged RPC');
 console.log('PASS: owner-scoped friends, requests, public profiles, challenge deep links, social bell and logout');
})().catch(e=>{console.error(e);process.exitCode=1});
