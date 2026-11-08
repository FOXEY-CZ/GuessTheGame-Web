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
  let navigate=null,currentPage='home';
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
    card.append(publicInfo(p));
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
        ()=>{document.getElementById('friendsIncomingTitle')?.scrollIntoView?.({behavior:'smooth'});}));
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
      buttons.append(action(tr('⚔️ Vyzvat','⚔️ Challenge'),
        ()=>void invite(p.user_id),'primary'));
      buttons.append(action(tr('⚡ Živý souboj','⚡ Live duel'),
        ()=>void window.FOXEY_ARCADE_LIVE?.invite(p.user_id)));
      buttons.append(action(tr('Odebrat','Remove'),
        ()=>void mutate('arcade_friend_remove',{p_user_id:p.user_id},
          tr('Přítel odebrán.','Friend removed.'))));
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
    setText('myFriendCode',dashboard?.my_code||'—');
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
    for(const [id,list,type,empty] of [
      ['friendsList',friends,'friend',tr('Ještě nemáš žádné přátele.','No friends yet.')],
      ['friendsIncomingList',incoming,'incoming',tr('Žádná nová žádost.','No new requests.')],
      ['friendsOutgoingList',outgoing,'outgoing',tr('Žádné odeslané žádosti.','No pending outgoing requests.')],
      ['friendsBlockedList',blocked,'blocked',tr('Nikdo není blokovaný.','No blocked players.')]]){
      drawList(id,list,type,logged?empty:tr('Přihlas se.','Sign in.'));
    }
    drawList('friendsSearchResults',searchResults,'search',searchStatus||
      tr('Zadej přezdívku nebo kód přátel.','Search by nickname or friend code.'));
    for(const id of ['friendsRefresh','friendsSearchButton','copyFriendCode']){
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
        tr('Nikdo nenalezen. Zkontroluj přezdívku nebo FX-kód.',
           'Nobody found. Check their nickname or FX code.');
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
      buttons.append(action(tr('⚔️ Vyzvat přítele','⚔️ Challenge friend'),
        ()=>void invite(p.user_id),'primary'));
      buttons.append(action(tr('⚡ Živý souboj','⚡ Live duel'),
        ()=>void window.FOXEY_ARCADE_LIVE?.invite(p.user_id)));
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
    actions.append(action(socialArchived?
      tr('↩ Obnovit','↩ Restore'):tr('📦 Archivovat','📦 Archive'),
      ()=>void archiveSocial(entry.notification_id,!socialArchived)));
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
      selected=null;loading=false;busy=false;
      socialItems=[];socialUnread=0;socialHasMore=false;socialOffset=0;
      socialArchived=false;socialLoading=false;
      $('friendProfilePanel')?.classList.add('hidden');
    }
    api=client||null;uid=nextId;
    render();renderInbox();
    if(uid){void refresh();void refreshInbox();}
  }
  function onPage(page){
    currentPage=page;
    if(page==='community'&&uid)void refresh();
  }
  function setNavigation(cb){if(typeof cb==='function')navigate=cb;}
  $('friendsSearchForm')?.addEventListener('submit',event=>void search(event));
  $('friendsRefresh')?.addEventListener('click',()=>void refresh());
  $('friendProfileClose')?.addEventListener('click',()=>{
    $('friendProfilePanel')?.classList.add('hidden');selected=null;
  });
  $('copyFriendCode')?.addEventListener('click',async()=>{
    if(!dashboard?.my_code)return;
    try{await navigator.clipboard.writeText(dashboard.my_code);
      status(tr('✓ Kód zkopírován.','✓ Code copied.'));}
    catch(_){status(tr('Kód najdeš nahoře. Označ jej a zkopíruj.',
      'Your code is shown above. Select it to copy.'));}
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
  window.addEventListener('foxey-arcade:locale-changed',()=>{
    render();renderInbox();if(selected)renderPublicProfile();
  });
  window.setInterval?.(()=>{
    if(uid&&document.visibilityState!=='hidden')void refreshInbox();
  },45000);
  window.FOXEY_ARCADE_SOCIAL=Object.freeze({
    connect,onPage,setNavigation,refresh,refreshInbox,renderInbox,
    setBellArchived,getUnread:()=>socialUnread
  });
  render();renderInbox();
})();
