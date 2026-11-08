/* FOXEY Arcade UI 2.0 — presentation-only challenges, settings and mobile navigation.
 * Uses owner-scoped read-only challenge RPC. Never writes XP, wallet, saves or run state. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const locale=(cs,en)=>window.FOXEY_I18N?.getLocale?.()==='en'?en:cs;
  const maxCards=4;
  const validUUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let api=null,userId=null,goPage=null,currentPage='home';
  let records=[],loading=false,revision=0,hasMore=false,ready=false,error='';
  let moreOpen=false;
  function setText(id,value){const e=$(id);if(e)e.textContent=value;}
  function make(tag,cls,value){
    const e=document.createElement(tag);
    if(cls)e.className=cls;
    if(value!==undefined)e.textContent=value;
    return e;
  }
  function group(entry){
    if(entry?.both_done||entry?.status==='finished'||entry?.status==='expired')return 'results';
    const mineDone=entry.role==='creator'?entry.creator_done===true:entry.challenger_done===true;
    return mineDone?'waiting':'play';
  }
  function challengeLink(id,action){
    const url=new URL('../secure-quiz-beta.html',location.href);
    url.searchParams.set(action,id);
    return url.toString();
  }
  function resultsLine(row){
    const mine=row.your_score,other=row.opponent_score;
    if(row.status==='expired'&&!row.both_done)
      return locale('Výzva vypršela. Historie zůstává uložená.','Challenge expired. History is still saved.');
    if(!row.both_done||!Number.isFinite(mine)||!Number.isFinite(other))
      return locale('Výsledek se ještě ověřuje.','The result is being verified.');
    const outcome=row.winner==='tie'?locale('🤝 Remíza','🤝 Tie'):
      row.winner==='you'?locale('🏆 Výhra','🏆 Victory'):
      locale('🎮 Výsledek','🎮 Result');
    return outcome+' · '+locale('Ty ','You ')+mine+
      ' · '+locale('Soupeř ','Opponent ')+other;
  }
  async function copyChallengeLink(id,button){
    const link=challengeLink(id,'challenge');
    try{
      await navigator.clipboard.writeText(link);
      button.textContent=locale('✓ Zkopírováno','✓ Copied');
    }catch(_){
      // Clipboard permission can be unavailable on mobile: expose the actual
      // URL in an editable/selectable field, not a dead or misleading button.
      const field=make('input','challenge-invite-field');
      field.type='text';field.readOnly=true;field.value=link;
      field.setAttribute('aria-label',locale('Odkaz na výzvu','Challenge invite URL'));
      button.replaceWith(field);field.focus();field.select();
    }
  }
  function openHistory(){
    window.FOXEY_ARCADE_NOTIFICATIONS?.open?.();
  }
  async function showVerifiedResult(row,button,article){
    if(!api||!userId||!row.both_done||!validUUID.test(row.challenge_id))return;
    const uid=userId,stamp=revision;
    button.disabled=true;
    try{
      // The server checks ownership. Do not trust any result from the card
      // itself for marking a read receipt or changing account state.
      const status=await api.rpc('arcade_async_challenge_status',{
        p_challenge_id:row.challenge_id
      });
      if(status.error||status.data?.ok!==true||!status.data?.both_done||
         !['creator','challenger'].includes(status.data.role))
        throw Error(status.error?.message||'result_not_ready');
      if(uid!==userId||stamp!==revision)return;
      const seen=await api.rpc('arcade_async_challenge_mark_seen',{
        p_challenge_id:row.challenge_id
      });
      if(seen.error||seen.data?.seen!==true)
        throw Error(seen.error?.message||'result_not_marked');
      if(uid!==userId||stamp!==revision)return;
      row.unread=false;
      const copy={...row,...status.data};
      article.querySelector('.challenge-card-status').textContent=
        locale('✓ Výsledek přečten','✓ Result viewed');
      article.querySelector('.challenge-card-result').textContent=resultsLine(copy);
      button.textContent=locale('✓ Zobrazeno','✓ Viewed');
      void window.FOXEY_ARCADE_NOTIFICATIONS?.refresh?.();
    }catch(_){
      if(uid===userId&&stamp===revision){
        button.textContent=locale('⚠️ Zkusit znovu','⚠️ Retry');
      }
    }finally{
      if(uid===userId&&stamp===revision)button.disabled=false;
    }
  }
  function card(row,section){
    const article=make('article','challenge-dashboard-card');
    const heading=make('h3','', (row.role==='creator'?
      locale('⚔️ Odeslaná','⚔️ Sent'):locale('🎮 Přijatá','🎮 Received'))+
      ' · '+(row.mode==='mystery'?'Mystery':'Classic')+
      (row.unread?locale(' · NOVÉ',' · NEW'):''));
    const message=make('p','challenge-card-status',
      section==='play'?locale('▶️ Můžeš pokračovat','▶️ Ready to resume'):
      section==='waiting'?locale('⏳ Čeká se na soupeře','⏳ Waiting for opponent'):
      row.status==='expired'?locale('⌛ Vypršelo','⌛ Expired'):
      locale('🏁 Dokončeno','🏁 Completed'));
    const desc=make('p',section==='results'?'challenge-card-result':'',section==='results'?resultsLine(row):
      section==='play'?locale('Partie je uložená a můžeš navázat.','Your run is saved and ready.'):
      locale('Tvoje část už je hotová.','Your part is already done.'));
    const controls=make('div','challenge-card-actions');
    if(section==='play'){
      const resume=make('a','primary',locale('▶️ Pokračovat','▶️ Resume'));
      resume.href=challengeLink(row.challenge_id,'resume');
      resume.target='_blank';resume.rel='noopener noreferrer';
      controls.append(resume);
    }
    if(section==='waiting'&&row.role==='creator'){
      const share=make('button','secondary',locale('📋 Sdílet','📋 Share'));
      share.type='button';
      share.addEventListener('click',()=>void copyChallengeLink(row.challenge_id,share));
      controls.append(share);
    }
    if(section==='results'){
      const review=make('button','secondary',row.both_done?
        locale('🏆 Zobrazit výsledek','🏆 View result'):
        locale('📦 Historie ve zvonečku','📦 History in bell'));
      review.type='button';
      review.addEventListener('click',()=>{
        if(row.both_done)void showVerifiedResult(row,review,article);
        else openHistory();
      });
      controls.append(review);
    }else if(section==='waiting'){
      const open=make('button','secondary',locale('🔔 Stav výzvy','🔔 Challenge status'));
      open.type='button';open.addEventListener('click',openHistory);
      controls.append(open);
    }
    article.append(heading,message,desc,controls);
    return article;
  }
  function renderChallenges(){
    const signedIn=!!userId;
    const parts={play:[],waiting:[],results:[]};
    for(const row of records){
      if(!row||!validUUID.test(row.challenge_id)||
        !['creator','challenger'].includes(row.role))continue;
      parts[group(row)].push(row);
    }
    const count=id=>parts[id].length+(hasMore?'+':'');
    for(const [key,element] of [['play','challengeCountPlay'],
      ['waiting','challengeCountWaiting'],['results','challengeCountResults']]){
      setText(element,signedIn&&ready?String(count(key)):'—');
    }
    const empty={
      play:locale('Žádná rozehraná výzva. Novou vytvoříš nahoře.',
                  'No challenge to resume. Create one above.'),
      waiting:locale('Zatím na nikoho nečekáš.','No one to wait for right now.'),
      results:locale('Až dohrajete oba, výsledek se ukáže tady.',
                     'Results appear here after both finish.')
    };
    for(const [groupName,id] of [['play','challengeListPlay'],
      ['waiting','challengeListWaiting'],['results','challengeListResults']]){
      const list=$(id);if(!list)continue;
      list.replaceChildren();
      if(!ready||!signedIn||!parts[groupName].length){
        list.append(make('p','challenge-dashboard-empty',signedIn?
          (!ready?locale('Načítání…','Loading…'):empty[groupName]):
          locale('Přihlas se pro vlastní výzvy.','Sign in to view your challenges.')));
        continue;
      }
      for(const row of parts[groupName].slice(0,maxCards))list.append(card(row,groupName));
      if(parts[groupName].length>maxCards||hasMore){
        const note=make('p','small',
          locale('Další výzvy a celý archiv najdeš ve zvonečku.',
                 'More challenges and the full archive are available in the bell.'));
        list.append(note);
      }
    }
    setText('challengeLaunchStatus',!signedIn?
      locale('🔐 Přihlas se, aby se načetly tvé výzvy.',
             '🔐 Sign in to load your challenges.'):
      loading?locale('☁️ Načítám aktuální výzvy…','☁️ Loading challenges…'):
      error?locale('⚠️ Nepodařilo se načíst výzvy. Zkus Obnovit.',
                   '⚠️ Could not load challenges. Try Refresh.'):
      ready?locale('✅ Výzvy se načítají z účtu. Starší dokončené výsledky zůstávají v archivu.',
                    '✅ Your account challenges are synced. Older results stay archived.'):
      locale('Otevři výzvy a načti přehled.','Open challenges to load the overview.'));
    const refresh=$('challengeRefresh');
    if(refresh)refresh.disabled=loading||!signedIn;
  }
  async function refreshChallenges(){
    if(!api||!userId||loading)return;
    if(navigator.onLine===false){error='offline';renderChallenges();return;}
    const id=userId,stamp=++revision;
    loading=true;error='';renderChallenges();
    try{
      const {data,error:rpcError}=await api.rpc('arcade_async_challenge_history',{
        p_limit:30,p_offset:0,p_archived:false
      });
      if(rpcError||data?.ok!==true||!Array.isArray(data.items)||
        data.archived!==false||typeof data.has_more!=='boolean')
        throw Error(rpcError?.message||'challenge_list_invalid');
      if(id!==userId||stamp!==revision)return;
      records=data.items;
      hasMore=data.has_more;
      ready=true;
    }catch(e){
      if(id===userId&&stamp===revision)error=String(e?.message||'network_error').slice(0,160);
    }finally{
      if(id===userId&&stamp===revision){loading=false;renderChallenges();}
    }
  }
  function setMore(open,returnFocus=false){
    moreOpen=!!open;
    const sheet=$('mobileMoreMenu');
    if(sheet)sheet.classList.toggle('hidden',!moreOpen);
    const toggle=$('mobileMoreToggle');
    if(toggle)toggle.setAttribute('aria-expanded',String(moreOpen));
    document.body?.classList?.toggle('arcade-more-open',moreOpen);
    if(moreOpen)$('mobileMoreClose')?.focus?.();
    else if(returnFocus)toggle?.focus?.();
  }
  function onPage(page){
    currentPage=page;
    setMore(false,false);
    const main=page==='play'?'games':page;
    const isMore=['account','missions','shop','settings'].includes(page);
    document.querySelectorAll('.arcade-mobile-dock button[data-page]').forEach(button=>{
      const active=button.dataset.page===main;
      button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
    const more=$('mobileMoreToggle');
    if(more){
      more.classList.toggle('active',isMore);
      if(isMore)more.setAttribute('aria-current','page');
      else more.removeAttribute('aria-current');
    }
    if(page==='challenges')void refreshChallenges();
  }
  function setNavigation(navigate){
    if(typeof navigate==='function')goPage=navigate;
  }
  function connect(client,user){
    const nextId=user?.id||null;
    if(nextId!==userId){
      ++revision;records=[];ready=false;hasMore=false;error='';loading=false;
    }
    api=client||null;userId=nextId;
    renderChallenges();
    if(nextId&&currentPage==='challenges')void refreshChallenges();
  }
  $('challengeRefresh')?.addEventListener('click',()=>void refreshChallenges());
  $('challengeInboxButton')?.addEventListener('click',openHistory);
  $('settingsOpenBell')?.addEventListener('click',openHistory);
  $('settingsOpenGame')?.addEventListener('click',()=>goPage?.('play'));
  $('settingsOpenAccount')?.addEventListener('click',()=>goPage?.('account'));
  $('mobileMoreToggle')?.addEventListener('click',()=>setMore(!moreOpen));
  $('mobileMoreClose')?.addEventListener('click',()=>setMore(false,true));
  $('mobileMoreShade')?.addEventListener('click',()=>setMore(false,true));
  document.addEventListener('keydown',event=>{
    if(!moreOpen)return;
    if(event.key==='Escape'){event.preventDefault();setMore(false,true);return;}
    if(event.key!=='Tab')return;
    const sheet=$('mobileMoreMenu');
    const targets=[...sheet.querySelectorAll('button:not([disabled])')];
    if(!targets.length)return;
    const first=targets[0],last=targets[targets.length-1];
    if(event.shiftKey&&document.activeElement===first){
      event.preventDefault();last.focus();
    }else if(!event.shiftKey&&document.activeElement===last){
      event.preventDefault();first.focus();
    }
  });
  window.addEventListener('foxey-arcade:locale-changed',renderChallenges);
  window.addEventListener('focus',()=>{
    if(userId&&currentPage==='challenges')void refreshChallenges();
  });
  window.FOXEY_ARCADE_UI2=Object.freeze({
    connect,onPage,setNavigation,refreshChallenges
  });
  renderChallenges();
})();
