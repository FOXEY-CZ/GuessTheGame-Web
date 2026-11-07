/* FOXEY Arcade — shared signed-in notification bell for all embedded games.
 * Owner-scoped Supabase RPC only. Never receives private question keys,
 * never changes XP/wallets, never interrupts the active game iframe. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const choose=(cs,en)=>window.FOXEY_I18N?.getLocale?.()==='en'?en:cs;
  let api=null,userId=null,items=[],unread=0,loading=false,seq=0,opened=false;
  const text=(id,value)=>{const node=$(id);if(node)node.textContent=value};
  const show=(id,yes)=>{const node=$(id);if(node)node.classList.toggle('hidden',!yes)};
  const challengeUrl=id=>{
    const url=new URL('../secure-quiz-beta.html',location.href);
    url.searchParams.set('challenge',id);
    return url.toString();
  };
  function resultLine(entry){
    if(!entry.both_done)return choose('⏳ Zatím čeká na dohrání.','⏳ Waiting for both players.');
    const mine=entry.your_score,other=entry.opponent_score;
    if(!Number.isFinite(mine)||!Number.isFinite(other))return choose('Výsledek se ověřuje.','Result is being verified.');
    if(entry.winner==='tie')return choose('🤝 Remíza: ','🤝 Tie: ')+mine+' XP';
    const win=entry.winner==='you';
    return (win?choose('🏆 Vyhrál jsi! ','🏆 You won! '):
      choose('🎮 Prohrál jsi. ','🎮 You lost. '))+
      choose('Ty ','You ')+mine+' XP · '+choose('soupeř ','opponent ')+other+' XP';
  }
  function label(entry){
    switch(entry.status){
      case 'finished':return choose('🏁 Dokončeno','🏁 Completed');
      case 'expired':return choose('⌛ Prošlá','⌛ Expired');
      case 'waiting':return choose('⏳ Čeká na soupeře','⏳ Waiting for opponent');
      case 'creator_playing':return choose('🎮 Vytvořená, rozehraná','🎮 Creator playing');
      case 'challenger_playing':return choose('⚔️ Soupeř hraje','⚔️ Opponent playing');
      default:return choose('⚔️ Výzva','⚔️ Challenge');
    }
  }
  function render(){
    const count=unread>99?'99+':String(unread);
    text('arcadeBellCount',count);
    show('arcadeBellCount',unread>0);
    const bell=$('arcadeBell');
    if(bell){
      bell.setAttribute('aria-label',choose('Upozornění FOXEY Arcade','FOXEY Arcade notifications')+' ('+unread+')');
      bell.setAttribute('title',choose('Upozornění a výzvy','Notifications and challenges'));
    }
    text('arcadeNoticeTitle',choose('🔔 Oznámení FOXEY Arcade','🔔 FOXEY Arcade notifications'));
    text('arcadeNoticeClose','✕');
    text('arcadeNoticeRefresh',choose('🔄 Obnovit','🔄 Refresh'));
    const box=$('arcadeNoticeList');if(!box)return;
    box.replaceChildren();
    if(!userId){
      text('arcadeNoticeStatus',choose('Přihlas se a uvidíš své výzvy ze všech her.','Sign in to see your challenges from every game.'));
      return;
    }
    text('arcadeNoticeStatus',unread>0?
      choose('🔔 Nové výsledky: ','🔔 Unread results: ')+unread:
      choose('Zatím žádný nový výsledek.','No unread results.'));
    if(!items.length){
      const p=document.createElement('p');p.className='arcade-notice-empty';
      p.textContent=choose('Zatím nemáš žádné serverové výzvy.','No server challenges yet.');
      box.append(p);return;
    }
    for(const entry of items){
      const card=document.createElement('article');
      card.className='arcade-notice-card'+(entry.unread?' unread':'');
      const title=document.createElement('strong');
      title.textContent=(entry.role==='creator'?
        choose('⚔️ Odeslaná','⚔️ Sent'):
        choose('🎮 Přijatá','🎮 Received'))+
        ' · '+(entry.mode==='mystery'?'Mystery':'Classic')+
        (entry.unread?' · '+choose('NOVÝ VÝSLEDEK','NEW RESULT'):'');
      const sub=document.createElement('span');
      sub.className='arcade-notice-sub';
      sub.textContent=label(entry);
      const score=document.createElement('p');score.className='arcade-notice-score';
      score.textContent=resultLine(entry);
      const actions=document.createElement('div');actions.className='arcade-notice-actions';
      const open=document.createElement('button');open.type='button';open.className='secondary';
      open.textContent=entry.both_done?
        choose('🏆 Otevřít výsledek','🏆 Open result'):
        choose('👀 Zkontrolovat stav','👀 Check status');
      open.addEventListener('click',()=>void openResult(entry.challenge_id));
      actions.append(open);
      if(entry.role==='creator'){
        const copy=document.createElement('button');copy.type='button';copy.className='secondary';
        copy.textContent=choose('📋 Kopírovat odkaz','📋 Copy invite link');
        copy.addEventListener('click',()=>void copyInvite(entry.challenge_id));
        actions.append(copy);
      }
      card.append(title,sub,score,actions);box.append(card);
    }
  }
  async function refresh(){
    if(!api||!userId||loading||navigator.onLine===false)return;
    loading=true;
    const id=userId,stamp=seq;
    try{
      const {data,error}=await api.rpc('arcade_async_challenge_inbox',{p_limit:40});
      if(error||data?.ok!==true||!Array.isArray(data.items)||
        !Number.isInteger(data.unread)||data.unread<0)
        throw Error(error?.message||'history_request_failed');
      if(id!==userId||stamp!==seq)return;
      items=data.items.filter(v=>typeof v?.challenge_id==='string'&&
        (v.role==='creator'||v.role==='challenger'));
      unread=data.unread;
      render();
    }catch(err){
      if(id===userId&&stamp===seq){
        text('arcadeNoticeStatus',choose('⚠️ Historie se nenačetla: ','⚠️ Could not load history: ')+
          String(err?.message||'network_error').slice(0,160));
      }
    }finally{loading=false;}
  }
  async function openResult(challengeId){
    if(!api||!userId||typeof challengeId!=='string')return;
    const id=userId,stamp=seq;
    try{
      const {data,error}=await api.rpc('arcade_async_challenge_status',{
        p_challenge_id:challengeId
      });
      if(error||data?.ok!==true||data.role==='invitee')
        throw Error(error?.message||'challenge_not_yours');
      if(id!==userId||stamp!==seq)return;
      text('arcadeNoticeDetail',resultLine(data));
      if(data.both_done){
        const res=await api.rpc('arcade_async_challenge_mark_seen',{
          p_challenge_id:challengeId
        });
        if(res.error||res.data?.seen!==true)
          throw Error(res.error?.message||'mark_seen_failed');
        await refresh();
      }
    }catch(err){
      if(id===userId)text('arcadeNoticeDetail',
        choose('⚠️ Výsledek se nepodařilo zobrazit: ','⚠️ Could not open result: ')+
        String(err?.message||'network_error').slice(0,160));
    }
  }
  async function copyInvite(challengeId){
    const url=challengeUrl(challengeId);
    try{
      await navigator.clipboard.writeText(url);
      text('arcadeNoticeDetail',choose('✅ Odkaz zkopírován.','✅ Invite link copied.'));
    }catch(_){
      const field=$('arcadeNoticeCopyField');
      if(field){field.value=url;show('arcadeNoticeCopyField',true);field.focus();field.select();}
      text('arcadeNoticeDetail',choose('Zkopíruj označený odkaz.','Copy the selected link.'));
    }
  }
  function open(){
    opened=true;
    show('arcadeNoticeOverlay',true);
    render();
    $('arcadeNoticeClose')?.focus?.();
    void refresh();
  }
  function close(){
    opened=false;
    show('arcadeNoticeOverlay',false);
    $('arcadeBell')?.focus?.();
  }
  function connect(client,user){
    const nextId=user?.id||null;
    if(nextId!==userId){
      seq++;items=[];unread=0;
      text('arcadeNoticeDetail','');
      show('arcadeNoticeCopyField',false);
    }
    api=client||null;userId=nextId;
    render();
    if(userId)void refresh();
  }
  $('arcadeBell')?.addEventListener('click',open);
  $('arcadeNoticeClose')?.addEventListener('click',close);
  $('arcadeNoticeShade')?.addEventListener('click',close);
  $('arcadeNoticeRefresh')?.addEventListener('click',()=>void refresh());
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&opened)close();
  });
  window.addEventListener('focus',()=>{if(userId)void refresh();});
  window.addEventListener('foxey-arcade:locale-changed',render);
  window.setInterval(()=>{
    if(userId&&document.visibilityState!=='hidden')void refresh();
  },45000);
  window.FOXEY_ARCADE_NOTIFICATIONS=Object.freeze({connect,refresh,open,close});
  render();
})();
