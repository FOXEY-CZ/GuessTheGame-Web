/* FOXEY Arcade Friends 1.0 — owner-scoped social APIs.
 * All friend requests, invite targets, and read receipts are enforced by
 * Supabase. This client cannot read emails, mint currencies, or alter saves. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const english=()=>window.FOXEY_I18N?.getLocale?.()==='en';
  const tr=(cs,en)=>english()?en:cs;
  const validId=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const avatarEmoji={fox:'🦊',robot:'🤖',alien:'👽',crown:'👑',glitch:'🌈',
   'pixel-fox':'🦊','neon-ghost':'👻','space-cat':'🐈','cyber-fox':'🦊',
   'arcade-dragon':'🐉','legend-fox':'🦊'};
  let api=null,uid=null,revision=0,busy=false,loading=false;
  let dashboard=null,searchResults=[],searchStatus='',selected=null;
  let socialItems=[],socialUnread=0,socialHasMore=false,
      socialArchived=false,socialOffset=0,socialLoading=false;
  let navigate=null,currentPage='home',socialResponding=false,friendsPane='people';
  const safeList=value=>Array.isArray(value)?value:[];
  function node(tag,cls,content){
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(content!==undefined)el.textContent=content;
    return el;
  }
  function setText(id,value){if($(id))$(id).textContent=value;}
  const playerName=p=>typeof p?.nickname==='string'&&p.nickname.trim()
    ?p.nickname:tr('Hráč','Player');
  const badge=p=>avatarEmoji[p?.avatar_id]||'🎮';
  function publicInfo(p){
    const wrap=node('div','friends-player');
    const icon=node('div','friends-avatar',badge(p));
    icon.setAttribute('aria-hidden','true');
    const right=node('div','friends-player-info');
    right.append(node('strong','',playerName(p)),
      node('span','',tr('Level ','Level ')+Math.max(1,Number(p?.level)||1)+
        ' · '+Math.max(0,Number(p?.arcade_xp)||0)+' XP'));
    wrap.append(icon,right);
    return wrap;
  }
  function action(label,fn,cls='secondary'){
    const btn=node('button',cls,label);btn.type='button';
    btn.disabled=busy;btn.addEventListener('click',fn);
    return btn;
  }
  function status(message){setText('friendsStatus',message);}
  function openPane(which){
    if(!['people','chat','live'].includes(which))return;
    friendsPane=which;
    $('friendsPanePeople')?.classList.toggle('hidden',which!=='people');
    $('friendsPaneChat')?.classList.toggle('hidden',which!=='chat');
    $('friendsPaneLive')?.classList.toggle('hidden',which!=='live');
    window.FOXEY_ARCADE_CHAT?.onPaneActive?.(
      which==='chat'&&currentPage==='community');
    for(const btn of document.querySelectorAll?.('.arcade-social-tabs [data-social-live]')||[]){
      const active=which==='live'&&currentPage==='community';
      btn.classList.toggle('is-active',active);
      btn.setAttribute('aria-current',active?'page':'false');
    }
    for(const btn of document.querySelectorAll?.('.arcade-social-tabs [data-social-chat]')||[]){
      const active=which==='chat'&&currentPage==='community';
      btn.classList.toggle('is-active',active);
      btn.setAttribute('aria-current',active?'page':'false');
    }
    for(const btn of document.querySelectorAll?.('.arcade-social-tabs [data-friends-view]')||[]){
      const active=which==='people'&&currentPage==='community';
      btn.classList.toggle('is-active',active);
      btn.setAttribute('aria-current',active?'page':'false');
    }
  }
  function showLive(){
    if(currentPage!=='community')navigate?.('community');
    openPane('live');
  }
  function showChat(friendId=null){
    if(currentPage!=='community')navigate?.('community');
    openPane('chat');
    if(validId.test(friendId||''))
      void window.FOXEY_ARCADE_CHAT?.openFriend?.(friendId);
  }
  function onChange(){window.FOXEY_ARCADE_NOTIFICATIONS?.refresh?.();}
  async function call(name,args){
    if(!api||!uid)throw Error('not_authenticated');
    const {data,error}=await api.rpc(name,args);
    if(error||data?.ok!==true)throw Error(error?.message||name+'_failed');
    return data;
  }
  async function mutate(name,args,success){
    if(!uid||!api||busy)return;
    const owner=uid,stamp=revision;
    busy=true;
    status(tr('☁️ Ukládám změnu…','☁️ Saving change…'));
    try{
      await call(name,args);
      if(uid!==owner||revision!==stamp)return;
      status(success||tr('✅ Uloženo.','✅ Saved.'));
      await refresh(true);
      if(uid===owner)await refreshInbox();
      onChange();
    }catch(err){
      if(uid===owner&&revision===stamp)
        status(tr('⚠️ Akce se nepodařila: ','⚠️ Action failed: ')+
          String(err?.message||'network_error').slice(0,105));
    }finally{
      if(uid===owner&&revision===stamp){busy=false;render();}
    }
  }
  function profileButton(p){
    return action(tr('👤 Profil','👤 Profile'),()=>void viewProfile(p.user_id));
  }
  function personCard(p,kind,item){
    if(!p||!validId.test(p.user_id))return null;
    const card=node('article','friends-card');
    const info=publicInfo(p);
    if(kind==='friend'){
      const present=window.FOXEY_ARCADE_LIVE?.getFriendPresence?.(p.user_id);
      info.querySelector('.friends-player-info')?.append(node('span','friends-presence '+
        (present===true?'is-online':'is-offline'),present===null||present===undefined?
        tr('◌ Zjišťuji stav…','◌ Checking status…'):
        present?tr('🟢 Online','🟢 Online'):tr('⚪ Offline','⚪ Offline')));
    }
    card.append(info);
    const buttons=node('div','friends-actions');
    buttons.append(profileButton(p));
    if(kind==='search'){
      const current=safeList(dashboard?.friends).some(x=>x.profile?.user_id===p.user_id);
      const sent=safeList(dashboard?.outgoing).some(x=>x.profile?.user_id===p.user_id);
      const incoming=safeList(dashboard?.incoming).some(x=>x.profile?.user_id===p.user_id);
      if(current){
        buttons.append(action(tr('⚔️ Vyzvat','⚔️ Challenge'),
          ()=>void invite(p.user_id),'primary'));
        buttons.append(action(tr('⚡ Živý souboj','⚡ Live duel'),
          ()=>void window.FOXEY_ARCADE_LIVE?.invite(p.user_id)));
      }
      else if(sent)buttons.append(node('span','friends-state',tr('⏳ Žádost odeslána','⏳ Pending')));
      else if(incoming)buttons.append(action(tr('📩 Žádost přijata','📩 View request'),
        ()=>openRequests()));
      else buttons.append(action(tr('➕ Přidat','➕ Add friend'),
        ()=>void mutate('arcade_friend_request',{p_user_id:p.user_id},
          tr('✅ Žádost odeslána!','✅ Friend request sent!')),'primary'));
    }else if(kind==='incoming'){
      buttons.append(action(tr('✓ Přijmout','✓ Accept'),
        ()=>void mutate('arcade_friend_respond',{
          p_request_id:item.request_id,p_accept:true
        },tr('🤝 Teď jste přátelé!','🤝 You are now friends!')),'primary'));
      buttons.append(action(tr('✕ Odmítnout','✕ Decline'),
        ()=>void mutate('arcade_friend_respond',{
          p_request_id:item.request_id,p_accept:false
        },tr('Žádost odmítnuta.','Request declined.'))));
    }else if(kind==='outgoing'){
      buttons.append(node('span','friends-state',tr('⏳ Čeká na přijetí','⏳ Awaiting reply')));
      buttons.append(action(tr('Zrušit','Cancel'),
        ()=>void mutate('arcade_friend_remove',{p_user_id:p.user_id},
          tr('Žádost zrušena.','Request canceled.'))));
    }else if(kind==='friend'){
      buttons.append(action(tr('💬 Napsat','💬 Message'),
        ()=>showChat(p.user_id),'primary'));
      buttons.append(action(tr('⚔️ Vyzvat','⚔️ Challenge'),
        ()=>void invite(p.user_id),'primary'));
    }else if(kind==='blocked'){
      buttons.append(action(tr('Odblokovat','Unblock'),
        ()=>void mutate('arcade_friend_block',{p_user_id:p.user_id,p_block:false},
          tr('Hráč odblokován.','Player unblocked.'))));
    }
    card.append(buttons);
    return card;
  }
  function drawList(id,items,kind,emptyMessage){
    const root=$(id);if(!root?.replaceChildren)return;
    const result=safeList(items).map(item=>
      personCard(item.profile||item,kind,item)).filter(Boolean);
    if(!result.length)root.replaceChildren(node('p','friends-empty',emptyMessage));
    else root.replaceChildren(...result);
  }
  function render(){
    const logged=!!uid;
    const signedText=!logged?tr('🔐 Přihlas se pro přátele a přímé výzvy.',
                              '🔐 Sign in for friends and direct challenges.'):
      loading?tr('☁️ Načítám přátele…','☁️ Loading friends…'):
      dashboard?tr('✅ Přátelé se ukládají do tvého účtu.',
                   '✅ Your friends are saved to your account.'):
      tr('Otevři Přátele a načti svůj seznam.','Open Friends to load your list.');
    if(!busy)status(signedText);
    const friends=safeList(dashboard?.friends),incoming=safeList(dashboard?.incoming),
      outgoing=safeList(dashboard?.outgoing),blocked=safeList(dashboard?.blocked);
    setText('friendsCount',logged?String(friends.length):'—');
    setText('friendsIncomingCount',logged?String(incoming.length):'—');
    setText('friendsOutgoingCount',logged?String(outgoing.length):'—');
    setText('friendsRequestSummaryCount',logged?
      String(incoming.length+outgoing.length):'—');
    const quick=$('friendRequestsShortcut');
    quick?.classList?.toggle('hidden',!logged);
    if(quick){
      const count=incoming.length;
      quick.setAttribute('aria-label',tr('Žádosti o přátelství: ','Friend requests: ')+count);
      quick.setAttribute('title',count?
        tr('📩 Čekající žádosti: ','📩 Pending requests: ')+count:
        tr('📩 Žádosti o přátelství','📩 Friend requests'));
      const badge=$('friendRequestsShortcutCount');
      if(badge){
        badge.textContent=count>99?'99+':String(count);
        badge.classList.toggle('hidden',count===0);
      }
    }
    for(const [id,list,type,empty] of [
      ['friendsList',friends,'friend',tr('Ještě nemáš žádné přátele.','No friends yet.')],
      ['friendsIncomingList',incoming,'incoming',tr('Žádná nová žádost.','No new requests.')],
      ['friendsOutgoingList',outgoing,'outgoing',tr('Žádné odeslané žádosti.','No pending outgoing requests.')],
      ['friendsBlockedList',blocked,'blocked',tr('Nikdo není blokovaný.','No blocked players.')]]){
      drawList(id,list,type,logged?empty:tr('Přihlas se.','Sign in.'));
    }
    drawList('friendsSearchResults',searchResults,'search',searchStatus||
      tr('Zadej nick kamaráda. Vyber hráče a klikni na Přidat.',
         'Enter a friend nickname. Select the player and tap Add friend.'));
    for(const id of ['friendsRefresh','friendsSearchButton']){
      const e=$(id);if(e)e.disabled=!logged||busy||loading;
    }
  }
  async function refresh(quiet=false){
    if(!api||!uid||loading)return;
    const owner=uid,stamp=revision;
    loading=true;
    if(!quiet)render();
    try{
      const data=await call('arcade_friends_dashboard');
      if(owner!==uid||stamp!==revision)return;
      dashboard=data;
      render();
    }catch(err){
      if(owner===uid&&stamp===revision){
        status(tr('⚠️ Přátele se nepodařilo načíst: ','⚠️ Could not load friends: ')+
          String(err?.message||'network_error').slice(0,105));
      }
    }finally{
      if(owner===uid&&stamp===revision){loading=false;render();}
    }
  }
  async function search(event){
    event?.preventDefault?.();
    const query=$('friendsSearchInput')?.value.trim()||'';
    if(query.length<3||query.length>30||!api||!uid)return;
    const owner=uid,stamp=revision;
    setText('friendsSearchStatus',tr('🔎 Hledám hráče…','🔎 Searching…'));
    try{
      const data=await call('arcade_friends_search',{p_query:query});
      if(owner!==uid||stamp!==revision)return;
      searchResults=safeList(data.results).filter(x=>validId.test(x.user_id));
      searchStatus=searchResults.length?'':
        tr('Hráč nenalezen. Zkontroluj jeho nick.',
           'Nobody found. Check their nickname.');
      setText('friendsSearchStatus',searchResults.length?
        tr('Nalezeno hráčů: ','Players found: ')+searchResults.length:searchStatus);
      render();
    }catch(err){
      if(owner===uid&&stamp===revision)
        setText('friendsSearchStatus',tr('⚠️ Hledání selhalo: ','⚠️ Search failed: ')+
          String(err?.message||'network_error').slice(0,105));
    }
  }
  async function viewProfile(userId){
    if(!uid||!validId.test(userId))return;
    const owner=uid,stamp=revision;
    const root=$('friendProfilePanel');
    root?.classList.remove('hidden');
    setText('friendProfileTitle',tr('👤 Načítám profil…','👤 Loading profile…'));
    try{
      const data=await call('arcade_friend_public_profile',{p_user_id:userId});
      if(owner!==uid||stamp!==revision)return;
      selected=data.profile;
      renderPublicProfile();
      root?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
    }catch(err){
      if(owner===uid&&stamp===revision)
        setText('friendProfileTitle',tr('⚠️ Profil není dostupný.','⚠️ Profile unavailable.'));
    }
  }
  function renderPublicProfile(){
    const p=selected,root=$('friendProfileContent'),buttons=$('friendProfileActions');
    if(!root?.replaceChildren||!buttons?.replaceChildren||!p)return;
    setText('friendProfileTitle',tr('👤 Veřejný profil','👤 Public profile'));
    const summary=node('div','friends-public-player');summary.append(publicInfo(p));
    const stats=node('div','friends-public-stats');
    for(const [label,value] of [
      [tr('Globální XP','Global XP'),p.arcade_xp],
      [tr('Level','Level'),p.level],
      [tr('Achievementy','Achievements'),p.achievements],
      [tr('Ověřené partie','Verified games'),p.verified_games]]){
      const item=node('div','');
      item.append(node('span','',label),node('strong','',String(Math.max(0,Number(value)||0))));
      stats.append(item);
    }
    root.replaceChildren(summary,stats);
    const connected=safeList(dashboard?.friends).some(x=>x.profile?.user_id===p.user_id);
    const waiting=safeList(dashboard?.outgoing).some(x=>x.profile?.user_id===p.user_id);
    const incoming=safeList(dashboard?.incoming).some(x=>x.profile?.user_id===p.user_id);
    if(connected){
      buttons.append(action(tr('💬 Napsat','💬 Message'),
        ()=>showChat(p.user_id),'primary'));
      buttons.append(action(tr('⚔️ Vyzvat přítele','⚔️ Challenge friend'),
        ()=>void invite(p.user_id),'primary'));
      buttons.append(action(tr('⚡ Živý souboj','⚡ Live duel'),()=>{
        showLive();
        void window.FOXEY_ARCADE_LIVE?.invite(p.user_id);
      }));
      buttons.append(action(tr('Odebrat přítele','Remove friend'),
        ()=>{
          if(window.confirm?.(tr('Opravdu odebrat tohoto přítele?',
                'Are you sure you want to remove this friend?'))!==true)return;
          void mutate('arcade_friend_remove',{p_user_id:p.user_id},
            tr('Přítel odebrán.','Friend removed.'));
        }));
    }else if(waiting){
      buttons.append(node('span','friends-state',tr('⏳ Žádost odeslaná','⏳ Request pending')));
    }else if(incoming){
      buttons.append(node('span','friends-state',
        tr('📩 Přijatou žádost vyřiď výše.','📩 Respond to the incoming request above.')));
    }else if(p.user_id!==uid){
      buttons.append(action(tr('➕ Poslat žádost','➕ Add friend'),
        ()=>void mutate('arcade_friend_request',{p_user_id:p.user_id},
          tr('✅ Žádost odeslána!','✅ Request sent!')),'primary'));
    }
    if(p.user_id!==uid)buttons.append(action(tr('🚫 Blokovat','🚫 Block'),
      ()=>void mutate('arcade_friend_block',{p_user_id:p.user_id,p_block:true},
        tr('Hráč blokován.','Player blocked.'))));
  }
  async function invite(friendId){
    if(!api||!uid||busy||!validId.test(friendId))return;
    const owner=uid,stamp=revision;
    busy=true;status(tr('⚔️ Vytvářím bezpečnou výzvu…',
                        '⚔️ Creating protected challenge…'));
    try{
      // Reuse the same operation ID after a network error. The server will
      // return the original run instead of issuing duplicate friend invites.
      const opKey='foxey.arcade.friend.invite.'+owner+'.'+friendId;
      let operation=null;
      try{operation=window.localStorage?.getItem(opKey)||null;}catch(_){}
      if(!operation||!validId.test(operation)){
        operation=crypto.randomUUID();
        try{window.localStorage?.setItem(opKey,operation);}catch(_){}
      }
      const data=await call('arcade_friend_challenge_create',{
        p_friend_id:friendId,p_operation:operation,p_mode:'classic'
      });
      if(owner!==uid||stamp!==revision)return;
      if(!validId.test(data.challenge_id)||!validId.test(data.run_id)||!data.targeted)
        throw Error('invalid_invite_receipt');
      try{window.localStorage?.removeItem(opKey);}catch(_){}
      // Same-tab navigation is reliable on mobile (no popup blocker).
      // The existing secure quiz resumes this server-created creator run.
      const url=new URL('../secure-quiz-beta.html',location.href);
      url.searchParams.set('v','live-duels-20261108b');
      url.searchParams.set('resume',data.challenge_id);
      location.assign(url.toString());
    }catch(err){
      if(owner===uid&&stamp===revision)
        status(tr('⚠️ Výzvu nelze vytvořit: ','⚠️ Could not create challenge: ')+
          String(err?.message||'network_error').slice(0,100));
    }finally{
      if(owner===uid&&stamp===revision){busy=false;render();}
    }
  }
  function broadcastUnread(){
    try{window.dispatchEvent(new CustomEvent('foxey-arcade:social-unread',{
      detail:{unread:socialUnread}
    }));}catch(_){}
  }
  function openSocialAction(entry){
    if(!validId.test(entry.notification_id))return;
    const owner=uid,stamp=revision;
    // Opening a live invite is a navigation action, not a read-receipt action:
    // always open the lobby immediately even on a slow or failed network.
    if(entry.kind==='live_invite'||entry.kind==='live_rematch_declined'){
      if(!validId.test(entry.subject_id)){
        setText('arcadeSocialBellStatus',tr('⚠️ Neplatný odkaz na lobby.',
          '⚠️ Invalid lobby link.'));
        return;
      }
      window.FOXEY_ARCADE_NOTIFICATIONS?.close?.();
      navigate?.('community');
      if(typeof window.FOXEY_ARCADE_LIVE?.openMatch==='function'){
        void window.FOXEY_ARCADE_LIVE.openMatch(entry.subject_id,false)
          .catch(err=>setText('friendsStatus',
            tr('⚠️ Výsledek zápasu se nepodařilo otevřít: ',
               '⚠️ Could not open the match result: ')+
            String(err?.message||'network_error').slice(0,105)));
      }else{
        setText('friendsStatus',tr('⚠️ Živá lobby se nenačetla. Obnov stránku.',
          '⚠️ Live lobby did not load. Refresh the page.'));
      }
    }
    (async()=>{
      try{
        await call('arcade_social_notification_seen',{
          p_notification_id:entry.notification_id
        });
        if(owner!==uid||stamp!==revision)return;
        if(entry.unread===true){
          entry.unread=false;
          socialUnread=Math.max(0,socialUnread-1);
          renderInbox();
        }
        if(entry.kind==='live_invite'||entry.kind==='live_rematch_declined'){
          // The modal is already closed and result/lobby opened above; refresh badge.
          await refreshInbox();
          return;
        }
        if(entry.kind==='friend_challenge'){
          if(entry.challenge_ready!==true)return;
          const url=new URL('../secure-quiz-beta.html',location.href);
          url.searchParams.set('v','live-duels-20261108b');
          url.searchParams.set('friend_challenge',entry.subject_id);
          location.assign(url.toString());
          return;
        }
        navigate?.('community');
        if(validId.test(entry.actor?.user_id))
          void viewProfile(entry.actor.user_id);
        await refreshInbox();
        void refresh();
      }catch(err){
        if(owner===uid&&stamp===revision)
          setText('arcadeSocialBellStatus',tr('⚠️ Upozornění se nepodařilo otevřít.',
                  '⚠️ Could not open notification.'));
      }
    })();
  }
  async function respondFromBell(entry,accept=true){
    if(!uid||!api||socialResponding||!validId.test(entry.subject_id))return;
    const owner=uid,stamp=revision;
    const isFriend=entry.kind==='friend_request';
    const isLive=entry.kind==='live_invite';
    if(!isFriend&&!isLive)return;
    socialResponding=true;
    try{
      const result=await call(isFriend?'arcade_friend_respond':'arcade_live_respond',
        isFriend?{p_request_id:entry.subject_id,p_accept:accept}:
                 {p_match_id:entry.subject_id,p_accept:accept});
      if(owner!==uid||stamp!==revision)return;
      setText('arcadeSocialBellStatus',accept?
        tr('✅ Pozvánka přijata.','✅ Invitation accepted.'):
        tr('✕ Pozvánka odmítnuta.','✕ Invitation declined.'));
      try{await call('arcade_social_notification_seen',{
        p_notification_id:entry.notification_id
      });}catch(_){}
      // Accepted/explicitly declined invitations leave the main bell, while
      // their receipts remain restorable in the tucked-away history.
      try{await call('arcade_social_notification_archive',{
        p_notification_id:entry.notification_id,p_archived:true
      });}catch(_){}
      if(isLive&&accept){
        window.FOXEY_ARCADE_NOTIFICATIONS?.close?.();
        navigate?.('community');
        void window.FOXEY_ARCADE_LIVE?.openMatch?.(entry.subject_id,false);
      }
      await refreshInbox();
      if(isFriend){await refresh(true);}
      window.FOXEY_ARCADE_NOTIFICATIONS?.refresh?.();
      onChange();
    }catch(err){
      if(owner===uid&&stamp===revision)setText('arcadeSocialBellStatus',
        tr('⚠️ Odpověď se nepodařila: ','⚠️ Could not respond: ')+
        String(err?.message||'network_error').slice(0,100));
    }finally{socialResponding=false;}
  }
  function socialCard(entry){
    const root=node('article','arcade-notice-card'+(entry.unread?' unread':''));
    const p=entry.actor||{};
    const kind=entry.kind;
    const title=kind==='friend_request'?
      tr('📩 Nová žádost o přátelství','📩 Friend request'):
      kind==='friend_accepted'?
      tr('🤝 Žádost přijata','🤝 Friend request accepted'):
      kind==='live_invite'?
        (entry.live_rematch===true?
          tr('🔄 Žádost o odvetu','🔄 Rematch request'):
          [2,3].includes(Number(entry.live_series_target))?
            tr('🏆 Pozvánka do série na ','🏆 Best-of series · first to ')+
              entry.live_series_target+tr(' vítězství',' wins'):
            tr('⚡ Pozvánka do živého 1v1','⚡ Live 1v1 invitation')):
      kind==='live_rematch_declined'?
        tr('❌ Odveta byla odmítnuta','❌ Rematch declined'):
      tr('⚔️ Přímá výzva','⚔️ Direct challenge');
    root.append(node('strong','',title+' · '+playerName(p)));
    const description=kind==='live_invite'?
      (entry.live_rematch===true?
        tr('Soupeř tě žádá o odvetu. Chceš ji přijmout, nebo odmítnout?',
          'Your opponent requests a rematch. Accept or decline?'):
        [2,3].includes(Number(entry.live_series_target))?
          tr('Soupeř tě zve do série na ','Your friend invited you to a first-to-')+
          entry.live_series_target+tr(' vítězství. Potvrď účast v lobby.',
                                     '-wins series. Accept in the lobby.'):
          tr('Kamarád tě zve na souboj v reálném čase.','Your friend invited you to a live duel.')):
      kind==='live_rematch_declined'?
        tr('Soupeř odmítl tvoji žádost o odvetu.',
           'Your opponent declined your rematch request.'):
      kind==='friend_challenge'?
      (entry.challenge_ready?tr('Můžeš zahájit zápas proti příteli.',
                                  'Ready to play your friend.'):
       tr('Čeká se, až vyzyvatel dohraje svou partii.',
          'Waiting for the challenger to finish their run.')):
      kind==='friend_request'?
      tr('Hráč ti poslal žádost. Přijmi ji v Přátelích.',
         'Someone sent you a request. Accept it in Friends.'):
      tr('Teď se můžete navzájem vyzývat.','You can now challenge each other.');
    root.append(node('p','small',description));
    const actions=node('div','friends-actions');
    const button=action(kind==='live_rematch_declined'?
      tr('❌ Zobrazit odmítnutí','❌ View declined rematch'):
      kind==='live_invite'?
        (entry.live_rematch===true?
          tr('🔄 Přijmout / odmítnout','🔄 Accept / decline'):
          [2,3].includes(Number(entry.live_series_target))?
            tr('🏆 Otevřít sérii','🏆 Open series'):
            tr('⚡ Otevřít lobby','⚡ Open lobby')):
      kind==='friend_challenge'?
      entry.challenge_ready?tr('▶️ Hrát','▶️ Play'):tr('⏳ Čeká se','⏳ Waiting'):
      tr('👥 Otevřít přátele','👥 Open Friends'),
      ()=>openSocialAction(entry),'primary');
    if(kind==='friend_challenge'&&!entry.challenge_ready)button.disabled=true;
    actions.append(button);
    if(!socialArchived&&kind==='friend_request'){
      actions.append(action(tr('✓ Přijmout','✓ Accept'),
        ()=>void respondFromBell(entry,true),'primary'));
      actions.append(action(tr('Odmítnout','Decline'),
        ()=>void respondFromBell(entry,false)));
    }
    if(!socialArchived&&kind==='live_invite'){
      actions.append(action(tr('✓ Přijmout','✓ Accept'),
        ()=>void respondFromBell(entry,true),'primary'));
    }
    const hide=action(socialArchived?'↩':'✕',
      ()=>void archiveSocial(entry.notification_id,!socialArchived),
      'arcade-notice-dismiss');
    hide.setAttribute('aria-label',socialArchived?
      tr('Obnovit skryté oznámení','Restore hidden notification'):
      tr('Skrýt oznámení (neodmítá výzvu)','Hide notification (does not decline invitation)'));
    hide.setAttribute('title',socialArchived?
      tr('Vrátit mezi oznámení','Restore to notifications'):
      tr('Skrýt · výzva zůstává aktivní','Hide · invitation remains active'));
    actions.append(hide);
    root.append(actions);
    return root;
  }
  function renderInbox(){
    const list=$('arcadeSocialBellList');
    if(!list?.replaceChildren)return;
    const active=!!uid;
    setText('arcadeSocialBellCount',socialUnread>0?'🔴 '+socialUnread:'');
    const filtered=socialItems.filter(x=>validId.test(x.notification_id));
    if(!active)list.replaceChildren(node('p','arcade-notice-empty',
      tr('Přihlas se pro oznámení přátel.','Sign in for friend notifications.')));
    else if(!filtered.length)list.replaceChildren(node('p','arcade-notice-empty',
      socialArchived?tr('Žádná archivovaná oznámení.','Nothing archived yet.'):
        tr('Zatím žádné pozvánky ani žádosti.','No requests or invites yet.')));
    else list.replaceChildren(...filtered.map(socialCard));
    const prev=$('arcadeSocialPrev'),next=$('arcadeSocialNext');
    for(const [b,visible] of [[prev,socialOffset>0],[next,socialHasMore]]){
      if(b){
        b.classList.toggle('hidden',!visible);
        b.disabled=socialLoading;
      }
    }
    broadcastUnread();
  }
  async function refreshInbox(next=false){
    if(!uid||!api||socialLoading||navigator.onLine===false)return;
    if(next&&!socialHasMore)return;
    const owner=uid,stamp=revision,view=socialArchived;
    socialLoading=true;
    const requestedOffset=next?socialOffset+10:socialOffset;
    try{
      const data=await call('arcade_social_inbox',{
        p_archived:view,p_limit:10,p_offset:requestedOffset
      });
      if(owner!==uid||stamp!==revision||view!==socialArchived)return;
      socialItems=safeList(data.items);
      socialUnread=Math.max(0,Number(data.unread)||0);
      socialHasMore=data.has_more===true;
      socialOffset=requestedOffset;
      renderInbox();
    }catch(err){
      if(owner===uid&&stamp===revision)
        setText('arcadeSocialBellStatus',tr('⚠️ Oznámení se nenačetla.',
           '⚠️ Notifications unavailable.'));
    }finally{
      if(owner===uid&&stamp===revision){socialLoading=false;renderInbox();}
    }
  }
  async function archiveSocial(notificationId,toArchive){
    const owner=uid,stamp=revision;
    try{
      await call('arcade_social_notification_archive',{
        p_notification_id:notificationId,p_archived:toArchive
      });
      if(owner!==uid||stamp!==revision)return;
      socialOffset=0;await refreshInbox();
    }catch(_){
      if(owner===uid&&stamp===revision)
        setText('arcadeSocialBellStatus',tr('⚠️ Archivaci nelze dokončit.',
                                           '⚠️ Could not archive.'));
    }
  }
  function setBellArchived(value){
    socialArchived=!!value;socialOffset=0;socialItems=[];socialHasMore=false;
    renderInbox();void refreshInbox();
  }
  function connect(client,user){
    const nextId=user?.id||null;
    if(nextId!==uid){
      ++revision;dashboard=null;searchResults=[];searchStatus='';
      selected=null;loading=false;busy=false;friendsPane='people';
      if($('friendsRequestsDetails'))$('friendsRequestsDetails').open=false;
      socialItems=[];socialUnread=0;socialHasMore=false;socialOffset=0;
      socialArchived=false;socialLoading=false;
      $('friendProfilePanel')?.classList.add('hidden');
    }
    api=client||null;uid=nextId;
    render();renderInbox();
    if(uid){void refresh();void refreshInbox();}
  }
  function openRequests(){
    if(!uid){
      navigate?.('account');return;
    }
    window.FOXEY_ARCADE_NOTIFICATIONS?.open?.();
    const panel=$('friendsRequestsDetails');
    if(panel){
      panel.open=true;
      panel.scrollIntoView?.({behavior:'smooth',block:'start'});
      $('friendRequestsSummary')?.focus?.();
    }
    void refresh(true);
  }
  function onPage(page){
    currentPage=page;
    if(page==='community'){
      openPane(friendsPane);
      if(uid)void refresh();
    }
  }
  function setNavigation(cb){if(typeof cb==='function')navigate=cb;}
  for(const btn of document.querySelectorAll?.('[data-social-chat]')||[]){
    btn.addEventListener('click',()=>showChat());
  }
  for(const btn of document.querySelectorAll?.('[data-social-live]')||[]){
    btn.addEventListener('click',()=>showLive());
  }
  for(const btn of document.querySelectorAll?.('[data-friends-view]')||[]){
    btn.addEventListener('click',()=>openPane('people'));
  }
  $('friendRequestsShortcut')?.addEventListener('click',openRequests);
  $('friendsSearchForm')?.addEventListener('submit',event=>void search(event));
  $('friendsRefresh')?.addEventListener('click',()=>void refresh());
  $('friendProfileClose')?.addEventListener('click',()=>{
    $('friendProfilePanel')?.classList.add('hidden');selected=null;
  });

  $('arcadeSocialPrev')?.addEventListener('click',()=>{
    if(socialLoading||socialOffset<10)return;
    socialOffset-=10;void refreshInbox();
  });
  $('arcadeSocialNext')?.addEventListener('click',()=>void refreshInbox(true));
  window.addEventListener('focus',()=>{
    if(uid&&document.visibilityState!=='hidden'){
      if(currentPage==='community')void refresh();
      void refreshInbox();
    }
  });
  window.addEventListener('foxey-arcade:presence',()=>{
    if(uid&&currentPage==='community')render();
  });
  window.addEventListener('foxey-arcade:locale-changed',()=>{
    render();renderInbox();if(selected)renderPublicProfile();
  });
  window.setInterval?.(()=>{
    if(uid&&document.visibilityState!=='hidden'){
      void refreshInbox();
      // Keep the compact request badge fresh even away from Friends.
      if(!loading)void refresh(true);
    }
  },45000);
  window.FOXEY_ARCADE_SOCIAL=Object.freeze({
    connect,onPage,setNavigation,refresh,refreshInbox,renderInbox,
    setBellArchived,openPane,showLive,showChat,openRequests,
    inviteFriend:invite,getUnread:()=>socialUnread
  });
  render();renderInbox();
})();
