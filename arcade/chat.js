/* FOXEY Arcade Chat 1.0
 * Private friend-only DM UI. Messages live in an RPC-only private Supabase
 * schema. Realtime broadcasts contain opaque refresh IDs, no message text.
 * All text is rendered via textContent (never innerHTML). */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const tr=(cs,en)=>window.FOXEY_I18N?.getLocale?.()==='en'?en:cs;
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const safeText=(value,max=1000)=>String(value??'').slice(0,max);
  const toCount=x=>Math.max(0,Math.min(9999,Number.isFinite(Number(x))?Math.floor(Number(x)):0));
  let api=null,uid=null,epoch=0,selectedId=null,conversations=[],messages=[];
  let paneActive=false,pageActive=false,loadingInbox=false,loadingThread=false,
      threadLoadingFriend=null;
  let sending=false,hasMore=false,unread=0,pending=null,lastRead=new Map();
  let channel=null,channelClient=null,online=false,threadRevision=0;
  const nowTime=iso=>{
    try{return new Intl.DateTimeFormat(window.FOXEY_I18N?.getLocale?.()==='en'?'en':'cs',
      {hour:'2-digit',minute:'2-digit'}).format(new Date(iso));}
    catch(_){return '';}
  };
  const create=(tag,cls,value)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(value!==undefined)el.textContent=value;
    return el;
  };
  const setStatus=value=>{const el=$('chatStatus');if(el)el.textContent=value;};
  const validOwner=(id,rev)=>id===uid&&rev===epoch;
  function friendlyError(err){
    const code=String(err?.message||err||'').slice(0,120);
    if(code.includes('chat_not_friends'))return tr(
      'Už nejste přátelé nebo je jeden z vás blokovaný.',
      'You are no longer friends, or one of you is blocked.');
    if(code.includes('chat_rate_limited'))return tr(
      'Zprávy posíláš příliš rychle. Zkus to za pár sekund.',
      'You are sending too fast. Try again in a few seconds.');
    if(code.includes('chat_invalid_length'))return tr(
      'Zpráva musí mít 1 až 1 000 znaků.','Message must be 1–1,000 characters.');
    return tr('Zprávu se nepodařilo načíst nebo odeslat. Zkus to znovu.',
      'Could not load or send the message. Please try again.');
  }
  function badge(){
    const num=unread>99?'99+':String(unread);
    for(const el of document.querySelectorAll?.('.arcade-chat-unread')||[]){
      el.textContent=num;el.classList.toggle('hidden',unread<1);
    }
    const summary=$('chatUnreadSummary');
    if(summary)summary.textContent=unread?tr('Nepřečtené: ','Unread: ')+num:'';
    try{window.dispatchEvent?.(new CustomEvent('foxey-arcade:chat-unread',{
      detail:{unread}
    }));}catch(_){}
  }
  function resetThread(){
    messages=[];hasMore=false;selectedId=null;threadRevision++;
    $('chatMessageInput').value='';
    renderThread();
  }
  function renderConversations(){
    const root=$('chatConversationList');
    if(!root?.replaceChildren)return;
    root.replaceChildren();
    if(!uid){root.append(create('p','arcade-chat-placeholder',tr(
      'Pro chat se přihlas.','Sign in to chat.')));return;}
    if(!conversations.length){root.append(create('p','arcade-chat-placeholder',tr(
      'Zatím nemáš žádné přátele. Najdi je v záložce Přátelé.',
      'You have no friends yet. Add them in the Friends tab.')));return;}
    for(const item of conversations){
      const f=item?.friend;
      if(!f||!UUID.test(f.user_id))continue;
      const btn=create('button','arcade-chat-person'+
        (f.user_id===selectedId?' is-active':''));
      btn.type='button';btn.setAttribute('aria-pressed',f.user_id===selectedId?'true':'false');
      const name=create('strong','',safeText(f.nickname||'Hráč',36));
      name.setAttribute('data-no-i18n',''); // User-chosen nickname must remain untouched.
      const avatar=create('span','arcade-chat-avatar','🦊');
      avatar.setAttribute('aria-hidden','true');
      const body=create('span','arcade-chat-person-body');
      const latest=item.last_message;
      const preview=safeText(latest?.body||tr('Začni konverzaci…','Start a conversation…'),95);
      const snippet=create('span','arcade-chat-preview',preview);
      if(latest?.body)snippet.setAttribute('data-no-i18n','');
      body.append(name,snippet);
      btn.append(avatar,body);
      const count=toCount(item.unread);
      if(count){const pill=create('span','arcade-chat-count',count>99?'99+':String(count));
        pill.setAttribute('aria-label',tr('Nepřečtené zprávy: ','Unread messages: ')+count);
        btn.append(pill);}
      btn.addEventListener('click',()=>void openFriend(f.user_id));
      root.append(btn);
    }
  }
  function renderThread(){
    const root=$('chatThread'),selected=conversations.find(c=>c?.friend?.user_id===selectedId);
    const friend=selected?.friend;
    if(!root?.replaceChildren)return;
    $('chatFriendName').textContent=friend?.nickname||tr(
      'Vyber si kamaráda','Choose a friend');
    if(friend)$('chatFriendName').setAttribute('data-no-i18n','');
    else $('chatFriendName').removeAttribute?.('data-no-i18n');
    $('chatFriendStatus').textContent=selectedId?tr(
      'Soukromá konverzace · jen potvrzení přátelé',
      'Private conversation · accepted friends only'):
      tr('Zprávy vidíte jen vy dva.','Only the two of you can see your messages.');
    const active=!!uid&&!!selectedId&&!!friend;
    $('friendsPaneChat')?.classList.toggle('has-conversation',active);
    $('chatComposeForm').classList.toggle('hidden',!active);
    $('chatChallengeFriend').classList.toggle('hidden',!active);
    $('chatBack').classList.toggle('hidden',!active);
    $('chatSend').disabled=!active||sending;
    $('chatMessageInput').disabled=!active||sending;
    $('chatLoadOlder').classList.toggle('hidden',!active||!hasMore);
    root.replaceChildren();
    if(!active){
      root.append(create('p','arcade-chat-placeholder',tr(
        'Vyber kamaráda ze seznamu. Napsat můžeš jen potvrzeným přátelům.',
        'Choose someone from your friends. Only accepted friends can chat.')));
      return;
    }
    if(!messages.length){
      root.append(create('p','arcade-chat-placeholder',loadingThread?
        tr('Načítám zprávy…','Loading messages…'):
        tr('Zatím žádné zprávy. Napiš první! 💬','No messages yet. Say hello! 💬')));
      return;
    }
    for(const msg of messages){
      const mine=msg.sender_id===uid;
      const entry=create('article','arcade-chat-bubble'+(mine?' mine':' theirs'));
      const messageBody=create('p','arcade-chat-body',safeText(msg.body));
      messageBody.setAttribute('data-no-i18n','');
      entry.append(messageBody);
      const time=create('time','arcade-chat-timestamp',nowTime(msg.created_at));
      if(msg.created_at)time.setAttribute('datetime',safeText(msg.created_at,40));
      entry.append(time);root.append(entry);
    }
    root.scrollTop=root.scrollHeight;
  }
  async function refreshInbox(){
    if(!api||!uid||loadingInbox)return;
    const owner=uid,stamp=epoch;
    loadingInbox=true;
    try{
      const {data,error}=await api.rpc('arcade_chat_inbox');
      if(error||data?.ok!==true||!Array.isArray(data.conversations))
        throw Error(error?.message||'chat_inbox_failed');
      if(!validOwner(owner,stamp))return;
      conversations=data.conversations.filter(c=>UUID.test(c?.friend?.user_id))
        .slice(0,150);
      unread=toCount(data.unread);
      if(selectedId&&!conversations.some(c=>c.friend.user_id===selectedId))
        resetThread();
      badge();renderConversations();renderThread();
      if(paneActive&&pageActive&&!selectedId)setStatus(tr(
        'Vyber konverzaci nebo napiš kamarádovi ze záložky Přátelé.',
        'Choose a conversation or message a friend from Friends.'));
    }catch(err){
      if(validOwner(owner,stamp))setStatus(friendlyError(err));
    }finally{
      if(validOwner(owner,stamp))loadingInbox=false;
    }
  }
  async function markRead(){
    if(!uid||!api||!selectedId||!paneActive||!pageActive||
       document.visibilityState==='hidden')return;
    const latest=messages.filter(m=>m.sender_id===selectedId)
      .reduce((n,m)=>Math.max(n,Number(m.id)||0),0);
    if(!latest||latest<=(lastRead.get(selectedId)||0))return;
    const friend=selectedId,owner=uid,stamp=epoch;
    try{
      const {data,error}=await api.rpc('arcade_chat_mark_read',{
        p_friend_id:friend,p_until_id:latest
      });
      if(error||data?.ok!==true)throw Error(error?.message||'chat_mark_read_failed');
      if(validOwner(owner,stamp)&&selectedId===friend){
        lastRead.set(friend,latest);
        void refreshInbox();
      }
    }catch(_){/* Keep it unread and retry on the next refresh. */}
  }
  async function refreshThread(older=false){
    if(!uid||!api||!selectedId)return;
    // A slow request for friend A must not block opening friend B.
    if(loadingThread&&threadLoadingFriend===selectedId)return;
    const owner=uid,stamp=epoch,friend=selectedId,revision=threadRevision;
    const cursor=older&&messages.length?Number(messages[0].id):null;
    const oldHeight=$('chatThread')?.scrollHeight||0;
    const oldTop=$('chatThread')?.scrollTop||0;
    loadingThread=true;threadLoadingFriend=friend;
    if(!older&&!messages.length)renderThread();
    try{
      const {data,error}=await api.rpc('arcade_chat_history',{
        p_friend_id:friend,p_before_id:cursor,p_limit:50
      });
      if(error||data?.ok!==true||!Array.isArray(data.messages))
        throw Error(error?.message||'chat_history_failed');
      if(!validOwner(owner,stamp)||friend!==selectedId||revision!==threadRevision)return;
      const incoming=data.messages.filter(m=>Number.isSafeInteger(Number(m.id)) &&
        [uid,friend].includes(m.sender_id));
      if(older){
        const unique=new Map([...incoming,...messages].map(m=>[Number(m.id),m]));
        messages=[...unique.values()].sort((a,b)=>Number(a.id)-Number(b.id));
      }else messages=incoming;
      hasMore=data.has_more===true;
      setStatus('');
      renderThread();
      if(older&&$('chatThread'))$('chatThread').scrollTop=
        oldTop+(($('chatThread').scrollHeight||0)-oldHeight);
      void markRead();
    }catch(err){
      if(validOwner(owner,stamp)&&friend===selectedId){
        setStatus(friendlyError(err));renderThread();
      }
    }finally{
      if(validOwner(owner,stamp)&&threadLoadingFriend===friend){
        loadingThread=false;threadLoadingFriend=null;
      }
    }
  }
  async function openFriend(friendId){
    if(!uid||!api||!UUID.test(friendId))return;
    if(!conversations.some(c=>c?.friend?.user_id===friendId)){
      await refreshInbox();
      if(!conversations.some(c=>c?.friend?.user_id===friendId)){
        setStatus(tr('Psaní je možné jen s potvrzenými přáteli.',
          'You can only message accepted friends.'));
        return;
      }
    }
    if(selectedId!==friendId){
      selectedId=friendId;messages=[];hasMore=false;threadRevision++;
      $('chatMessageInput').value='';pending=null;
    }
    window.FOXEY_ARCADE_SOCIAL?.showChat?.();
    renderConversations();renderThread();
    await refreshThread();
    $('chatMessageInput')?.focus?.();
  }
  async function send(event){
    event?.preventDefault?.();
    if(!uid||!selectedId||!api||sending||navigator.onLine===false)return;
    const text=$('chatMessageInput').value.trim();
    if(!text||text.length>1000){setStatus(tr('Zpráva musí mít 1 až 1 000 znaků.',
      'Messages must be between 1 and 1,000 characters.'));return;}
    const owner=uid,stamp=epoch,friend=selectedId;
    if(!pending||pending.friend!==friend||pending.text!==text)
      pending={friend,text,id:crypto.randomUUID()};
    const operation=pending.id;
    sending=true;renderThread();
    try{
      const {data,error}=await api.rpc('arcade_chat_send',{
        p_friend_id:friend,p_body:text,p_operation:operation
      });
      if(error||data?.ok!==true||!data.message)
        throw Error(error?.message||'chat_send_failed');
      if(!validOwner(owner,stamp)||selectedId!==friend)return;
      if($('chatMessageInput').value.trim()===text)$('chatMessageInput').value='';
      pending=null;setStatus('');
      // Authoritative reread, not a locally fabricated "sent" message.
      sending=false;
      await refreshThread();
      void refreshInbox();
    }catch(err){
      if(validOwner(owner,stamp)&&selectedId===friend)setStatus(friendlyError(err));
    }finally{
      if(validOwner(owner,stamp)){sending=false;renderThread();}
    }
  }
  function disconnectRealtime(){
    const old=channel,client=channelClient;
    channel=null;channelClient=null;online=false;
    if(old&&client?.removeChannel){
      try{void client.removeChannel(old).catch?.(()=>{});}catch(_){}
    }
  }
  async function startRealtime(owner,stamp){
    const client=api;
    if(!client?.channel||!client?.realtime?.setAuth)return;
    try{
      await client.realtime.setAuth();
      if(!validOwner(owner,stamp)||channel)return;
      const next=client.channel('arcade-chat:user:'+owner,{config:{private:true}});
      channel=next;channelClient=client;
      next.on('broadcast',{event:'chat:new'},payload=>{
        if(!validOwner(owner,stamp))return;
        const friend=payload?.payload?.friend_id;
        if(!UUID.test(friend))return;
        void refreshInbox();
        if(pageActive&&paneActive&&selectedId===friend)void refreshThread();
      }).subscribe(state=>{
        if(!validOwner(owner,stamp)||channel!==next)return;
        online=state==='SUBSCRIBED';
        if(online){void refreshInbox();
          if(pageActive&&paneActive&&selectedId)void refreshThread();}
      });
    }catch(_){online=false;/* The polling fallback remains active. */}
  }
  function connect(client,user){
    const newId=user?.id||null;
    if(uid!==newId){
      ++epoch;disconnectRealtime();
      uid=newId;api=client||null;conversations=[];unread=0;selectedId=null;
      paneActive=false;pageActive=false;loadingInbox=false;loadingThread=false;
      threadLoadingFriend=null;
      sending=false;messages=[];hasMore=false;pending=null;lastRead.clear();
      threadRevision++;
      $('chatMessageInput').value='';
      setStatus(uid?tr('Načítám konverzace…','Loading conversations…'):
        tr('Přihlas se pro zprávy.','Sign in to chat.'));
      badge();renderConversations();renderThread();
    }else api=client||null;
    if(uid&&api){void refreshInbox();void startRealtime(uid,epoch);}
  }
  function onPage(page){
    pageActive=page==='community';
    if(pageActive&&paneActive){
      void refreshInbox();
      if(selectedId)void refreshThread();
    }
  }
  function onPaneActive(active){
    paneActive=!!active;
    if(paneActive){
      void refreshInbox();
      if(pageActive&&selectedId){void refreshThread();void markRead();}
    }
  }
  $('chatRefresh')?.addEventListener('click',()=>{
    void refreshInbox();if(selectedId)void refreshThread();
  });
  $('chatComposeForm')?.addEventListener('submit',event=>void send(event));
  $('chatLoadOlder')?.addEventListener('click',()=>void refreshThread(true));
  $('chatBack')?.addEventListener('click',()=>{
    // On narrow phones, hide a selected conversation without leaving Chat.
    resetThread();renderConversations();
  });
  $('chatChallengeFriend')?.addEventListener('click',()=>{
    if(selectedId)void window.FOXEY_ARCADE_SOCIAL?.inviteFriend?.(selectedId);
  });
  $('chatMessageInput')?.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){
      event.preventDefault();void send();
    }
  });
  window.addEventListener('focus',()=>{
    if(uid&&document.visibilityState!=='hidden'){
      void refreshInbox();
      if(pageActive&&paneActive&&selectedId)void refreshThread();
    }
  });
  window.addEventListener('foxey-arcade:locale-changed',()=>{
    renderConversations();renderThread();badge();
  });
  window.setInterval?.(()=>{
    if(uid&&document.visibilityState!=='hidden'){
      void refreshInbox();
      if(pageActive&&paneActive&&selectedId)void refreshThread();
    }
  },40000);
  window.FOXEY_ARCADE_CHAT=Object.freeze({
    connect,onPage,onPaneActive,openFriend,refresh:refreshInbox,
    getUnread:()=>unread
  });
  badge();renderConversations();renderThread();
})();