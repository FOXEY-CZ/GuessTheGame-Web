'use strict';
// Offline two-identity client regression for friend-only Chat 1.0.
// No real auth, messages, wallet, network or payments are touched.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('arcade/index.html','utf8');
const script=fs.readFileSync('arcade/chat.js','utf8');
const app=fs.readFileSync('arcade/app.js','utf8');
const friends=fs.readFileSync('arcade/friends.js','utf8');
const notifications=fs.readFileSync('arcade/notifications.js','utf8');
assert.ok(html.includes('src="./chat.js?v='),'chat must be loaded in the launcher');
for(const id of ['friendsPaneChat','chatConversationList','chatThread',
 'chatComposeForm','chatMessageInput','chatSend','chatFriendName','chatLoadOlder',
 'chatUnreadSummary','arcadeNoticeGoChat'])
 assert.ok(html.includes('id="'+id+'"'),'chat UI missing '+id);
assert.equal((html.match(/data-social-chat\b/g)||[]).length,2,
 'Chat must appear in BOTH shared Friends and Challenges tabs');
for(const token of ["window.FOXEY_ARCADE_CHAT?.connect(supa,user)",
 "window.FOXEY_ARCADE_CHAT?.connect(supa,null)",
 "window.FOXEY_ARCADE_CHAT?.onPage(page)"])
 assert.ok(app.includes(token),'login/logout/page integration missing '+token);
assert.ok(friends.includes("tr('💬 Napsat','💬 Message')"),
 'friends must have direct Message action');
assert.ok(notifications.includes("'foxey-arcade:chat-unread'"),
 'global bell must count unread chat messages');
assert.ok(!script.includes(".from("),'chat must use only owner-authorized RPCs');
assert.ok(!script.includes(".innerHTML"),'messages must never render untrusted HTML');

const me='11111111-1111-4111-8111-111111111111';
const peer='22222222-2222-4222-8222-222222222222';
const other='33333333-3333-4333-8333-333333333333';
const uuids=[me,peer,other];
class El{
 constructor(id=''){this.id=id;this.children=[];this.events={};this.textContent='';
   this.value='';this.disabled=false;this.scrollTop=0;this.scrollHeight=100;
   this.className='';this.attrs={};this.focused=false;this.isConnected=true;
   const classes=new Set(['chatComposeForm','chatChallengeFriend','chatBack',
     'chatLoadOlder'].includes(id)?['hidden']:[]);
   this.classList={
     add:n=>classes.add(n),remove:n=>classes.delete(n),contains:n=>classes.has(n),
     toggle:(n,v)=>{const yes=v===undefined?!classes.has(n):v;
       if(yes)classes.add(n);else classes.delete(n);return yes;}
   };
 }
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 setAttribute(n,value){this.attrs[n]=String(value);}
 addEventListener(n,cb){this.events[n]=cb;}
 focus(){this.focused=true;}
}
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
const elements=new Map(ids.map(id=>[id,new El(id)]));
const unreadIndicators=Array.from({length:4},()=>new El('badge'));
const doc={
 getElementById:id=>elements.get(id),
 createElement:t=>new El(t),visibilityState:'visible',
 querySelectorAll:s=>s==='.arcade-chat-unread'?unreadIndicators:[],
};
const e=id=>elements.get(id);
const listeners={};
let realtimeHandler=null,realtimeStatus=null,unreadEvents=[],sendCalls=0,readCalls=0;
let notices=[{id:1,sender_id:peer,body:'Hello',created_at:'2026-11-09T00:00:00Z'}];
let lastRead=0,deferPeerHistory=false,resolveDeferredPeer=null;
const api={
 rpc:async(name,args={})=>{
   if(name==='arcade_chat_inbox'){
      const unseen=notices.filter(x=>x.sender_id===peer&&x.id>lastRead).length;
      return {data:{ok:true,unread:unseen,conversations:[{
        friend:{user_id:peer,nickname:'Buddy',avatar_id:'fox'},
        unread:unseen,last_message:notices.at(-1)||null
      },{
        friend:{user_id:other,nickname:'Another friend',avatar_id:'fox'},
        unread:0,last_message:null
      }]},error:null};
   }
   if(name==='arcade_chat_history'){
      if(args.p_friend_id===other)
        return {data:{ok:true,messages:[],has_more:false},error:null};
      assert.equal(args.p_friend_id,peer);
      if(deferPeerHistory)
        return new Promise(resolve=>{resolveDeferredPeer=resolve;});
      const msgs=notices.filter(x=>args.p_before_id==null||x.id<args.p_before_id);
      return {data:{ok:true,messages:msgs,has_more:false},error:null};
   }
   if(name==='arcade_chat_mark_read'){
      readCalls++;assert.equal(args.p_friend_id,peer);
      lastRead=Math.max(lastRead,args.p_until_id);
      return {data:{ok:true,read_through:lastRead},error:null};
   }
   if(name==='arcade_chat_send'){
      sendCalls++;
      assert.equal(args.p_friend_id,peer);
      assert.ok(uuids.includes(args.p_operation)===false);
      const msg={id:2,sender_id:me,body:args.p_body,
        created_at:'2026-11-09T01:00:00Z'};
      notices.push(msg);
      return {data:{ok:true,message:msg},error:null};
   }
   throw Error('unexpected RPC '+name);
 },
 realtime:{setAuth:async()=>{}},
 channel:(name,options)=>{
   assert.equal(name,'arcade-chat:user:'+me);
   assert.equal(options.config.private,true);
   return {
     on(type,opts,cb){assert.equal(type,'broadcast');assert.equal(opts.event,'chat:new');
       realtimeHandler=cb;return this;},
     subscribe(cb){realtimeStatus=cb;cb('SUBSCRIBED');return this;}
   };
 },
 removeChannel:async()=>{}
};
const window={
 FOXEY_I18N:{getLocale:()=> 'cs'},
 FOXEY_ARCADE_SOCIAL:{showChat:()=>{}},
 addEventListener:(n,f)=>{listeners[n]=f;},
 dispatchEvent:event=>{if(event.type==='foxey-arcade:chat-unread')
   unreadEvents.push(event.detail.unread);},
 setInterval:()=>{}
};
const CustomEvent=class{constructor(type,opts){this.type=type;this.detail=opts.detail}};
const crypto={randomUUID:()=> '77777777-7777-4777-8777-777777777777'};
vm.runInNewContext(script,{window,document:doc,navigator:{onLine:true},
  crypto,console,CustomEvent,Intl,Date});
const ui=window.FOXEY_ARCADE_CHAT;
const settle=async()=>{for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));};
(async()=>{
 ui.connect(api,{id:me});await settle();
 assert.equal(ui.getUnread(),1,'incoming chat must show unread badge');
 assert.equal(e('chatConversationList').children.length,2);
 assert.equal(unreadIndicators[0].textContent,'1');
 ui.onPage('community');
 ui.onPaneActive(true);
 await ui.openFriend(peer);await settle();
 assert.equal(e('chatFriendName').textContent,'Buddy');
 assert.equal(e('chatThread').children.length,1);
 assert.equal(readCalls>0,true,'opened conversation should mark incoming messages read');
 await settle();
 assert.equal(ui.getUnread(),0,'opening message should clear unread badge');
 e('chatMessageInput').value='<script>alert(1)</script>';
 await e('chatComposeForm').events.submit({preventDefault(){}});
 await settle();
 assert.equal(sendCalls,1);
 assert.equal(e('chatMessageInput').value,'','successful send clears own draft');
 assert.equal(e('chatThread').children.length,2);
 assert.equal(e('chatThread').children[1].children[0].textContent,'<script>alert(1)</script>',
   'untrusted text must stay literal text, not HTML markup');
 notices.push({id:3,sender_id:peer,body:'See you!',created_at:'2026-11-09T01:01:00Z'});
 realtimeHandler({payload:{friend_id:peer,message_id:3}});
 await settle();
 assert.equal(e('chatThread').children.length,3,'realtime must update selected conversation');
 ui.onPaneActive(false);ui.onPage('home');
 notices.push({id:4,sender_id:peer,body:'While away',created_at:'2026-11-09T01:02:00Z'});
 realtimeHandler({payload:{friend_id:peer,message_id:4}});
 await settle();
 assert.equal(ui.getUnread(),1,'background messages remain unread');
 // Slow message load for friend A may not block friend B or leak A's thread
 // into B's view once the delayed A request finally completes.
 ui.onPage('community');ui.onPaneActive(true);await settle();
 deferPeerHistory=true;
 const slow=ui.openFriend(peer);
 await settle();
 assert.ok(resolveDeferredPeer,'delayed friend A request must be outstanding');
 const fast=ui.openFriend(other);
 await fast;await settle();
 assert.equal(e('chatFriendName').textContent,'Another friend');
 deferPeerHistory=false;
 resolveDeferredPeer({data:{ok:true,messages:notices,has_more:false},error:null});
 await slow;await settle();
 assert.equal(e('chatFriendName').textContent,'Another friend',
   'stale friend A result must not replace B after switching');
 assert.ok(e('chatThread').children.every(x=>
   !x.children?.some(y=>y.textContent==='While away')),
   'private messages from A must never display in selected B thread');
 ui.connect(null,null);await settle();
 assert.equal(ui.getUnread(),0,'signout clears account-specific unread count');
 assert.equal(e('chatConversationList').children[0].textContent,'Pro chat se přihlas.');
 assert.ok(!e('chatComposeForm').classList.contains('hidden')===false);
 assert.ok(unreadEvents.includes(1)&&unreadEvents.includes(0));
 console.log('PASS: private Chat tab, realtime, send, HTML-safe render, unread/read and logout isolation.');
})().catch(err=>{console.error(err);process.exitCode=1});