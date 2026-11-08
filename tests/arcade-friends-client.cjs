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
assert.ok(html.includes('id="friendsPanePeople"')&&html.includes('id="friendsPaneLive"'),
 'Friends and Live have separate compact panes');
const socialTabs=[...html.matchAll(/<nav class="arcade-social-tabs"[\s\S]*?<\/nav>/g)];
assert.equal(socialTabs.length,2,'social tabs visible in Friends and Challenges');
for(const tab of socialTabs){
 assert.ok(tab[0].includes('data-social-live'),'Live must be reachable from both pages');
 assert.ok(tab[0].includes('data-friends-view="people"'),'Friends must be reachable');
 assert.ok(tab[0].includes('data-page="challenges"'),'Challenge history must be reachable');
}
assert.ok(html.includes('id="shopPreviewChest"'),
 'Players with a completed avatar collection need a free UI demo');
assert.ok(html.includes('➕ Přidat přítele podle nicku'),
 'Nickname should be the default friend discovery method');
assert.ok(html.includes('class="friends-code-card friends-advanced"'),
 'Legacy friend codes should be behind a collapsed Advanced disclosure');
assert.ok(!html.includes('class="shop-header-link"'),
 'Shop icon must not duplicate the persistent bottom Shop button');
assert.ok(game.includes('id="gameShopButton"'),
 'Game must have its own shortcut into shared Arcade Shop');
assert.ok(app.includes("event.data?.type==='foxey-arcade:open-shop'"),
 'Only the shared Arcade Shop handles in-game Shop navigation');
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
let noticeKind='friend_challenge',noticeRematch=false,seriesTarget=null,lobbyOpened='',modalClosed=0,navigatedPage='';
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
    kind:noticeKind,subject_id:noticeKind==='friend_request'?request:challenge,
    actor:profileB,unread:true,challenge_ready:true,
    live_rematch:noticeRematch,live_series_target:seriesTarget}],unread:nUnread,
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
 if(name==='arcade_live_respond'){
  assert.equal(args.p_match_id,challenge);
  assert.equal(args.p_accept,true);
  return {data:{ok:true,state:'lobby'}};
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
 FOXEY_ARCADE_NOTIFICATIONS:{refresh:()=>{},close:()=>{modalClosed++;}},
 FOXEY_ARCADE_LIVE:{openMatch:async(id,doNav)=>{
   assert.equal(doNav,false);lobbyOpened=id;return true;
 }},
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
 ui.setNavigation(page=>{navigatedPage=page;});
 ui.connect(api,{id:a});
 await settle();await settle();
 assert.equal(nodes.get('myFriendCode').textContent,'FX-ABCDEF123456');
 assert.equal(nodes.get('friendsIncomingList').children.length,1);
 assert.equal(nodes.get('friendsCount').textContent,'0');
 ui.onPage('community');
 assert.equal(nodes.get('friendsPanePeople').classList.contains('hidden'),false);
 assert.equal(nodes.get('friendsPaneLive').classList.contains('hidden'),true);
 ui.showLive();
 assert.equal(nodes.get('friendsPanePeople').classList.contains('hidden'),true);
 assert.equal(nodes.get('friendsPaneLive').classList.contains('hidden'),false);
 ui.openPane('people');
 assert.equal(nodes.get('friendsPaneLive').classList.contains('hidden'),true);
 assert.equal(nodes.get('friendsPanePeople').classList.contains('hidden'),false);
 assert.equal(nodes.get('friendsRequestSummaryCount').textContent,'1');
 assert.equal(nodes.get('friendsRequestsDetails').open,true,
   'Incoming requests must not be hidden inside a collapsed menu');
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
 friendCard.children[1].children[1].events.click();
 await settle();await settle();
 assert.ok(assigned.includes('resume='+challenge),
   'targeted challenge should open creator run: '+nodes.get('friendsStatus').textContent);
 assert.ok(rpcCalls.some(x=>x.name==='arcade_friend_challenge_create'));
 // Bell opens only participant-authorized challenge link, marks notification read.
 assigned='';
 const invite=nodes.get('arcadeSocialBellList').children[0].children[2].children[0];
 invite.events.click();await settle();await settle();
 assert.ok(seen);
 assert.ok(assigned.includes('friend_challenge='+challenge));
 assert.equal(bellUnread[bellUnread.length-1],0);
 // Regression: pressing Open lobby must close the modal, navigate and open
 // the match IMMEDIATELY, independently of the async read-receipt RPC.
 noticeKind='live_invite';
 await ui.refreshInbox();await settle();
 const openLobby=nodes.get('arcadeSocialBellList').children[0].children[2].children[0];
 assert.ok(openLobby.textContent.includes('Otevřít lobby'));
 openLobby.events.click();
 assert.equal(modalClosed,1,'Open lobby must close the bell overlay');
 assert.equal(navigatedPage,'community','Open lobby must navigate to Friends');
 assert.equal(lobbyOpened,challenge,'Open lobby must actually open the chosen match');
 await settle();
 // A rematch must be clearly identified in the bell rather than disguised
 // as an ordinary duel invitation. Opening it still requires guest consent.
 noticeRematch=true;
 await ui.refreshInbox();await settle();
 const rematchCard=nodes.get('arcadeSocialBellList').children[0];
 assert.ok(rematchCard.children[0].textContent.includes('Žádost o odvetu'));
 assert.ok(rematchCard.children[1].textContent.includes('přijmout'));
 assert.ok(rematchCard.children[2].children[0].textContent.includes('Přijmout / odmítnout'));
 rematchCard.children[2].children[0].events.click();await settle();
 assert.equal(lobbyOpened,challenge);
 assert.equal(modalClosed,2);
 // Notification to the requester after their rematch is rejected.
 noticeKind='live_rematch_declined';noticeRematch=false;
 await ui.refreshInbox();await settle();
 const declinedCard=nodes.get('arcadeSocialBellList').children[0];
 assert.ok(declinedCard.children[0].textContent.includes('Odveta byla odmítnuta'));
 assert.ok(declinedCard.children[1].textContent.includes('odmítl'));
 assert.ok(declinedCard.children[2].children[0].textContent.includes('Zobrazit odmítnutí'));
 declinedCard.children[2].children[0].events.click();
 assert.equal(lobbyOpened,challenge,'refusal must open the corresponding match');
 assert.equal(modalClosed,3);
 await settle();
 // A BO3/BO5 invitation is labeled distinctly from a one-off live duel.
 noticeKind='live_invite';noticeRematch=false;seriesTarget=3;
 await ui.refreshInbox();await settle();
 const seriesCard=nodes.get('arcadeSocialBellList').children[0];
 assert.ok(seriesCard.children[0].textContent.includes('série na 3 vítězství'));
 assert.ok(seriesCard.children[1].textContent.includes('série na 3 vítězství'));
 assert.ok(seriesCard.children[2].children[0].textContent.includes('Otevřít sérii'));
 // Respond directly from the bell, without opening an extra lobby first.
 const directLive=seriesCard.children[2].children.find(x=>x.textContent.includes('✓ Přijmout'));
 assert.ok(directLive,'live invitation needs an explicit accept button');
 directLive.events.click();await settle();await settle();await settle();
 assert.ok(rpcCalls.some(x=>x.name==='arcade_live_respond'&&x.args.p_accept===true));
 assert.equal(lobbyOpened,challenge,'accepted live invite opens the same match');
 // A friend request can also be accepted within the shared bell.
 noticeKind='friend_request';seriesTarget=null;
 await ui.refreshInbox();await settle();
 const requestCard=nodes.get('arcadeSocialBellList').children[0];
 const directFriend=requestCard.children[2].children.find(x=>x.textContent.includes('✓ Přijmout'));
 assert.ok(directFriend,'friend request must have one-tap acceptance');
 directFriend.events.click();await settle();await settle();await settle();
 assert.ok(rpcCalls.some(x=>x.name==='arcade_friend_respond'&&
   x.args.p_request_id===request));
 // X is intentionally not a rejection: it only moves the notification
 // into its own hidden inbox and leaves friendship/game state untouched.
 const hide=requestCard.children[2].children.at(-1);
 assert.equal(hide.textContent,'✕');
 assert.ok(hide.attrs['aria-label'].includes('neodmítá'));
 hide.events.click();await settle();await settle();
 assert.ok(archiveCount>0,'X must call the existing owner-scoped archive endpoint');
 // No cross-account stale state after switching to anonymous mode.
 ui.connect(null,null);
 assert.equal(nodes.get('myFriendCode').textContent,'—');
 assert.equal(nodes.get('friendsCount').textContent,'—');
 assert.equal(bellUnread[bellUnread.length-1],0);
 assert.ok(rpcCalls.every(x=>[
  'arcade_friends_dashboard','arcade_social_inbox','arcade_friends_search',
  'arcade_friend_respond','arcade_friend_public_profile',
  'arcade_friend_challenge_create','arcade_live_respond',
  'arcade_social_notification_archive','arcade_social_notification_seen'
 ].includes(x.name)),'unexpected privileged RPC');
 console.log('PASS: owner-scoped friends, requests, public profiles, challenge deep links, social bell and logout');
})().catch(e=>{console.error(e);process.exitCode=1});
