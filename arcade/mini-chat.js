/* FOXEY Arcade Mini Chat 1.1 — authenticated friend-only in-game messages.
 * Never writes game state; uses the existing server-authorized chat RPCs. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const standalone=/\/secure-quiz-beta\.html$/i.test(location.pathname);
const tr=(cs,en)=>standalone?
  (document.documentElement.lang==='en'?en:cs):
  window.FOXEY_I18N?.getLocale?.()==='en'?en:cs;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const node=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;};
let api=null,uid=null,rev=0,page='home',liveOpponent=null,liveState=null;
let opened=false,friendId=null,contactList=[],items=[],busy=false,loading=false,pending=null;
let lastInbox=0,lastMessages=0,standaloneUnread=0;
const root=node('div','arcade-mini-chat hidden');
root.setAttribute('aria-label','Mini chat FOXEY Arcade');
const toggle=node('button','arcade-mini-toggle','💬');
toggle.type='button';toggle.setAttribute('aria-expanded','false');
toggle.setAttribute('aria-label','Otevřít mini chat');toggle.title='Chat během hraní';
const badge=node('span','arcade-mini-count hidden','0');
toggle.append(badge);
const panel=node('section','arcade-mini-panel hidden');
panel.setAttribute('aria-label','Chat během hraní');
const head=node('div','arcade-mini-head');
const title=node('strong','',tr('💬 Chat ve hře','💬 In-game chat'));
const close=node('button','arcade-mini-close','✕');
close.type='button';close.setAttribute('aria-label','Zavřít chat');
head.append(title,close);
const chooser=node('select','arcade-mini-friends');
chooser.setAttribute('aria-label','Vyber přítele pro chat');
const status=node('p','arcade-mini-status','');
status.setAttribute('role','status');
const thread=node('div','arcade-mini-thread');
thread.setAttribute('role','log');thread.setAttribute('aria-live','polite');
const form=node('form','arcade-mini-form');
const input=node('input','arcade-mini-input');
input.type='text';input.maxLength=1000;input.autocomplete='off';
input.setAttribute('aria-label','Text zprávy');
const send=node('button','arcade-mini-send','➤');
send.type='submit';send.setAttribute('aria-label','Odeslat zprávu');
form.append(input,send);panel.append(head,chooser,status,thread,form);
root.append(toggle,panel);
function setStatus(value){status.textContent=value;}
function current(owner,stamp){return uid===owner&&rev===stamp;}
const active=()=>!!uid&&(page==='play'||(page==='community'&&
  ['invited','lobby','running'].includes(liveState)&&UUID.test(liveOpponent||'')));
function mount(){
  const host=standalone?document.body:(page==='play'?$('page-play'):$('liveArena'));
  if(host&&root.parentElement!==host)host.append(root);
  const visible=active();
  root.classList.toggle('hidden',!visible);
  if(!visible&&opened)closePanel();
  const count=Number(window.FOXEY_ARCADE_CHAT?.getUnread?.()??standaloneUnread);
  badge.textContent=count>99?'99+':String(Math.max(0,count));
  badge.classList.toggle('hidden',count<1);
  toggle.setAttribute('aria-label',count?tr('Otevřít chat, nepřečtené: ','Open chat, unread: ')+count:
    tr('Otevřít chat','Open chat'));
}
function closePanel(){opened=false;panel.classList.add('hidden');toggle.setAttribute('aria-expanded','false');}
function renderContacts(){
  chooser.replaceChildren();
  const empty=node('option','',tr('Vyber kamaráda','Choose a friend'));empty.value='';
  chooser.append(empty);
  for(const c of contactList){
    const f=c?.friend;if(!UUID.test(f?.user_id||''))continue;
    const opt=node('option','',(f.nickname||'Hráč').slice(0,36));
    opt.value=f.user_id;chooser.append(opt);
  }
  chooser.value=contactList.some(c=>c?.friend?.user_id===friendId)?friendId:'';
  const selected=!!chooser.value;
  input.disabled=!selected||busy;send.disabled=!selected||busy;
  input.placeholder=selected?tr('Napiš zprávu…','Write a message…'):
    tr('Nejdřív vyber přítele','Choose a friend first');
}
function renderMessages(){
  thread.replaceChildren();
  if(!friendId){thread.append(node('p','arcade-mini-placeholder',
    tr('Vyber přítele a můžete si psát při hraní.','Choose a friend to chat while playing.')));return;}
  if(!items.length){thread.append(node('p','arcade-mini-placeholder',
    tr('Zatím žádné zprávy.','No messages yet.')));return;}
  const wasBottom=thread.scrollHeight-thread.scrollTop-thread.clientHeight<50;
  for(const m of items){
    const mine=m.sender_id===uid;
    const entry=node('div','arcade-mini-message '+(mine?'mine':'theirs'));
    entry.append(node('span','',String(m.body||'').slice(0,1000)));
    const time=node('small','');
    try{time.textContent=new Intl.DateTimeFormat(
      window.FOXEY_I18N?.getLocale?.()==='en'?'en':'cs',
      {hour:'2-digit',minute:'2-digit'}).format(new Date(m.created_at));}catch(_){}
    entry.append(time);thread.append(entry);
  }
  if(wasBottom||items.length<45)thread.scrollTop=thread.scrollHeight;
}
async function fetchInbox(){
  if(!uid||!api)return;
  const owner=uid,stamp=rev;
  try{
    const {data,error}=await api.rpc('arcade_chat_inbox');
    if(error||data?.ok!==true||!Array.isArray(data.conversations))throw Error('inbox_failed');
    if(!current(owner,stamp))return;
    contactList=data.conversations.filter(c=>UUID.test(c?.friend?.user_id||'')).slice(0,150);
    lastInbox=Date.now();
    standaloneUnread=Math.max(0,Number(data.unread)||0);
    mount();
    if(friendId&&!contactList.some(c=>c.friend.user_id===friendId)){
      friendId=null;items=[];pending=null;renderMessages();
    }
    renderContacts();
  }catch(_){if(current(owner,stamp))setStatus(tr('Nepodařilo se načíst přátele.','Could not load friends.'));}
}
async function fetchMessages(){
  if(!uid||!api||!friendId||loading)return;
  const owner=uid,stamp=rev,friend=friendId;
  loading=true;
  try{
    const {data,error}=await api.rpc('arcade_chat_history',{
      p_friend_id:friend,p_before_id:null,p_limit:50
    });
    if(error||data?.ok!==true||!Array.isArray(data.messages))throw Error('history_failed');
    if(!current(owner,stamp)||friendId!==friend)return;
    items=data.messages.filter(m=>(m.sender_id===uid||m.sender_id===friend)&&
      Number.isSafeInteger(Number(m.id)));
    lastMessages=Date.now();
    setStatus('');renderMessages();
    if(opened&&document.visibilityState!=='hidden'){
      const latest=items.filter(m=>m.sender_id===friend)
        .reduce((n,m)=>Math.max(n,Number(m.id)||0),0);
      if(latest){
        const {data:ack,error:ackError}=await api.rpc('arcade_chat_mark_read',{
          p_friend_id:friend,p_until_id:latest
        });
        if(!ackError&&ack?.ok===true&&current(owner,stamp))
          void window.FOXEY_ARCADE_CHAT?.refresh?.();
      }
    }
  }catch(_){if(current(owner,stamp)&&friendId===friend)
    setStatus(tr('Zprávy se nepodařilo načíst.','Could not load messages.'));}
  finally{loading=false;}
}
async function choose(id){
  const requested=UUID.test(id||'')?id:null;
  if(requested&&!contactList.some(c=>c?.friend?.user_id===requested))return;
  if(friendId!==requested){friendId=requested;items=[];pending=null;}
  chooser.value=friendId||'';renderContacts();renderMessages();
  if(friendId)await fetchMessages();
}
async function open(friend=null){
  if(!active())return;
  opened=true;panel.classList.remove('hidden');toggle.setAttribute('aria-expanded','true');
  setStatus(tr('Načítám chat…','Loading chat…'));
  await fetchInbox();
  if(!opened)return;
  const target=UUID.test(friend||'')?friend:
    (page==='community'&&UUID.test(liveOpponent||'')?liveOpponent:friendId);
  if(target&&contactList.some(c=>c?.friend?.user_id===target))await choose(target);
  else if(!friendId&&contactList.length===1)await choose(contactList[0].friend.user_id);
  else if(friendId)await fetchMessages();
  if(opened&&friendId)input.focus();
  if(!friendId)setStatus('');
}
async function submit(ev){
  ev?.preventDefault?.();
  if(!api||!uid||!friendId||busy||navigator.onLine===false)return;
  const body=input.value.trim();if(!body||body.length>1000)return;
  if(!contactList.some(c=>c?.friend?.user_id===friendId))return;
  const owner=uid,stamp=rev,friend=friendId;
  if(!pending||pending.friend!==friend||pending.body!==body)
    pending={friend,body,operation:crypto.randomUUID()};
  busy=true;renderContacts();
  try{
    const {data,error}=await api.rpc('arcade_chat_send',{
      p_friend_id:friend,p_body:body,p_operation:pending.operation
    });
    if(error||data?.ok!==true)throw Error('send_failed');
    if(!current(owner,stamp)||friendId!==friend)return;
    if(input.value.trim()===body)input.value='';
    pending=null;setStatus('');
    await fetchMessages();
    void fetchInbox();void window.FOXEY_ARCADE_CHAT?.refresh?.();
  }catch(_){if(current(owner,stamp)&&friendId===friend)
    setStatus(tr('Zpráva se neodeslala. Zkus to znovu.','Message not sent. Please retry.'));}
  finally{busy=false;renderContacts();}
}
toggle.addEventListener('click',()=>{if(opened)closePanel();else void open();});
close.addEventListener('click',closePanel);
chooser.addEventListener('change',()=>void choose(chooser.value));
form.addEventListener('submit',ev=>void submit(ev));
window.addEventListener('foxey-arcade:chat-unread',mount);
window.addEventListener('foxey-arcade:chat-refresh',()=>{
  if(opened){void fetchMessages();void fetchInbox();}
});
window.addEventListener('foxey-arcade:presence',()=>{
  if(opened&&page==='community'&&friendId===liveOpponent){
    // Presence is displayed by the native Friends/Chat panels.
    mount();
  }
});
window.addEventListener('foxey-arcade:locale-changed',()=>{
  title.textContent=tr('💬 Chat ve hře','💬 In-game chat');
  renderContacts();if(opened)renderMessages();
});
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&opened)closePanel();
});
window.setInterval?.(()=>{
  if(!opened||!uid||document.visibilityState==='hidden'||navigator.onLine===false)return;
  if(Date.now()-lastMessages>9000)void fetchMessages();
  if(Date.now()-lastInbox>30000)void fetchInbox();
},3000);
window.FOXEY_MINI_CHAT=Object.freeze({
  connect(client,user){
    const next=user?.id||null;
    if(next!==uid){
      rev++;uid=next;api=client||null;
      friendId=null;contactList=[];items=[];pending=null;busy=false;loading=false;standaloneUnread=0;
      lastInbox=0;lastMessages=0;closePanel();renderContacts();renderMessages();
    }else api=client||null;
    mount();
  },
  onPage(next){page=next;mount();},
  setLiveMatch(opponent,state){
    liveOpponent=UUID.test(opponent||'')?opponent:null;
    liveState=state||null;mount();
  },
  openTo(friend){void open(friend);}
});
mount();
})();