/* FOXEY Arcade Live Duels 1.0 — secure, no wallet or save mutations.
 * Server RPCs exclusively own questions, time windows, answers and scores. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const tr=(cs,en)=>window.FOXEY_I18N?.getLocale?.()==='en'?en:cs;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text=(id,value)=>{if($(id))$(id).textContent=value;};
function elem(tag,cls,value){
  const e=document.createElement(tag);if(cls)e.className=cls;
  if(value!==undefined)e.textContent=String(value);return e;
}
function btn(label,cb,cls='secondary',disabled=false){
  const e=elem('button',cls,label);e.type='button';e.disabled=disabled;
  e.addEventListener('click',cb);return e;
}
let api=null,uid=null,epoch=0,page='home',busy=false,activeId=null,active=null;
let snapshot=null,loadingDashboard=false,loadingState=false,lastDashboard=0,lastPing=0;
let navigate=null,previousInvites=-1;
const people=()=>Array.isArray(snapshot?.friends)?snapshot.friends:[];
const matches=()=>Array.isArray(snapshot?.matches)?snapshot.matches:[];
const label=p=>(p?.nickname||tr('Hráč','Player')).slice(0,40);
const status=s=>text('liveStatus',s);
function safeError(e){return String(e?.message||'network_error').slice(0,115);}
async function call(name,args){
  if(!api||!uid)throw Error('not_authenticated');
  const {data,error}=await api.rpc(name,args);
  if(error||data?.ok!==true)throw Error(error?.message||name+'_failed');
  return data;
}
function isCurrent(owner,stamp){return !!owner&&uid===owner&&epoch===stamp;}
async function ping(){
  if(!uid||document.visibilityState==='hidden')return;
  const now=Date.now();if(now-lastPing<14000)return;
  lastPing=now;
  try{await call('arcade_live_ping');}catch(_){}
}
function renderList(){
  const root=$('liveFriendList'),recent=$('liveMatchList');
  if(!root||!recent)return;
  root.replaceChildren();recent.replaceChildren();
  if(!uid){
    root.append(elem('p','friends-empty',tr('Přihlas se pro online souboje.','Sign in to play live.')));
    recent.append(elem('p','friends-empty',tr('Nejsi přihlášený.','Please sign in.')));
    return;
  }
  if(!snapshot){
    root.append(elem('p','friends-empty',tr('Načítání…','Loading…')));return;
  }
  if(!people().length)root.append(elem('p','friends-empty',
    tr('Nejdřív si přidej kamaráda v sekci Přátelé.','Add a friend first.')));
  for(const f of people()){
    const p=f.profile||{};if(!UUID.test(p.user_id))continue;
    const row=elem('article','live-item');
    const who=elem('div','live-person');
    who.append(elem('strong','',label(p)),elem('span','live-presence',
      f.online?tr('🟢 Online','🟢 Online'):tr('⚪ Offline','⚪ Offline')));
    row.append(who,btn(tr('⚡ Pozvat 1v1','⚡ Invite 1v1'),
      ()=>void invite(p.user_id),'primary',busy));
    root.append(row);
  }
  if(!matches().length)recent.append(elem('p','friends-empty',
    tr('Žádné živé zápasy.','No live matches yet.')));
  for(const m of matches()){
    if(!UUID.test(m.match_id))continue;
    const row=elem('article','live-item');
    const head=elem('div','live-person');
    const translation={
      invited:tr('📨 Pozvánka','📨 Invitation'),lobby:tr('🕹️ Lobby','🕹️ Lobby'),
      running:tr('🔥 Právě se hraje','🔥 In progress'),finished:tr('🏆 Dokončeno','🏆 Finished'),
      declined:tr('✕ Odmítnuto','✕ Declined'),cancelled:tr('⛔ Zrušeno','⛔ Cancelled'),
      expired:tr('⌛ Vypršelo','⌛ Expired')};
    head.append(elem('strong','',label(m.opponent)),
      elem('span','',translation[m.state]||m.state));
    row.append(head,btn(m.state==='invited'&&m.role==='guest'?
      tr('📩 Odpovědět','📩 Respond'):tr('Zobrazit','View'),
      ()=>openMatch(m.match_id),'secondary',busy));
    recent.append(row);
  }
}
function updateTimer(){
  if(!active||active.state!=='running'||!active.round_deadline){
    text('liveCountdown','');return;
  }
  const ms=Math.max(0,Date.parse(active.round_deadline)-Date.now());
  text('liveCountdown',tr('⏱️ Zbývá ','⏱️ Time left ')+Math.ceil(ms/1000)+' s');
}
function renderArena(){
  const arena=$('liveArena'),controls=$('liveArenaControls'),question=$('liveQuestion'),options=$('liveOptions');
  if(!arena||!controls||!question||!options)return;
  const m=active;
  arena.classList.toggle('hidden',!m);
  controls.replaceChildren();question.replaceChildren();options.replaceChildren();
  if(!m)return;
  const host=m.role==='host';
  text('liveArenaOpponent',tr('Soupeř: ','Opponent: ')+label(m.opponent));
  text('liveScoreHost',String(host?m.host_score:m.guest_score));
  text('liveScoreGuest',String(host?m.guest_score:m.host_score));
  text('liveRound',m.state==='running'?
    tr('Otázka ','Question ')+(m.question_index+1)+' / 10':'');
  const states={
    invited:host?tr('📨 Pozvánka odeslána. Čekáme na přijetí.','📨 Waiting for opponent to accept.'):
      tr('📨 Kamarád tě zve do živého 1v1!','📨 Your friend invited you to a live 1v1!'),
    lobby:tr('🕹️ Lobby: oba hráči musí potvrdit připravenost.','🕹️ Lobby: both players must get ready.'),
    running:m.my_answered?
      tr('✅ Odpověď uložená. Čekáme na soupeře nebo konec kola.','✅ Answer saved. Waiting for the other player or timer.'):
      tr('🔥 Odpověz před vypršením času.','🔥 Answer before the timer ends.'),
    finished:tr('🏆 Zápas dokončen.','🏆 Match complete.'),
    declined:tr('Pozvánka odmítnuta.','Invite declined.'),
    cancelled:tr('Zápas zrušen.','Match canceled.'),
    expired:tr('Zápas vypršel.','Match expired.')};
  text('liveArenaStatus',states[m.state]||m.state);
  if(m.state==='invited'&&!host){
    controls.append(btn(tr('✅ Přijmout','✅ Accept'),
      ()=>void respond(true),'primary',busy),
      btn(tr('✕ Odmítnout','✕ Decline'),()=>void respond(false),'secondary',busy));
  }
  if(m.state==='lobby'){
    const ready=host?m.host_ready:m.guest_ready;
    controls.append(btn(ready?tr('✓ Připraven!','✓ Ready!'):tr('✅ Jsem připraven','✅ Ready'),
      ()=>void setReady(!ready),ready?'secondary':'primary',busy));
    question.append(elem('p','small',tr(
      'Ty: '+(ready?'✅':'⌛')+' · Soupeř: '+((host?m.guest_ready:m.host_ready)?'✅':'⌛'),
      'You: '+(ready?'✅':'⌛')+' · Opponent: '+((host?m.guest_ready:m.host_ready)?'✅':'⌛'))));
  }
  if(m.state==='running'&&m.question){
    const q=m.question;
    question.append(elem('h3','',window.FOXEY_I18N?.getLocale?.()==='en'?q.en:q.cs));
    const list=Array.isArray(q.options)?q.options:[];
    for(const choice of list){
      if(typeof choice!=='string')continue;
      const b=btn(choice,()=>void answer(q.index,choice),'live-option',busy||m.my_answered);
      options.append(b);
    }
  }
  if(m.state==='finished'){
    const myScore=host?m.host_score:m.guest_score,oppScore=host?m.guest_score:m.host_score;
    const result=myScore===oppScore?tr('🤝 Remíza!','🤝 Draw!'):
      myScore>oppScore?tr('🏆 Vyhrál jsi!','🏆 You won!'):
        tr('🎮 Tentokrát vyhrál soupeř.','🎮 Your opponent won.');
    question.append(elem('h3','',result));
    question.append(elem('p','small',tr('Tvoje skóre ','Your score ')+myScore+
      ' : '+oppScore+tr(' soupeř',' opponent')));
  }
  if(['invited','lobby','running'].includes(m.state)){
    controls.append(btn(tr('⛔ Ukončit zápas','⛔ End match'),()=>void cancelMatch(),
      'secondary',busy));
  }
  controls.append(btn(tr('← Zpět na přátele','← Back to friends'),()=>{
    activeId=null;active=null;renderArena();
  }));
  updateTimer();
}
async function refreshDashboard(force=false){
  if(!api||!uid||loadingDashboard)return;
  if(!force&&Date.now()-lastDashboard<6500)return;
  loadingDashboard=true;const owner=uid,stamp=epoch;
  try{
    const result=await call('arcade_live_dashboard');
    if(!isCurrent(owner,stamp))return;
    snapshot=result;lastDashboard=Date.now();
    renderList();
    const count=matches().filter(m=>m.state==='invited'&&m.role==='guest').length;
    text('liveInviteCount',count?String(count):'');
    if(previousInvites>=0&&count>previousInvites)
      window.FOXEY_ARCADE_SOCIAL?.refreshInbox?.();
    previousInvites=count;
    if(!activeId&&!loadingState){
      const live=matches().find(m=>m.state==='running'||m.state==='lobby');
      if(live&&UUID.test(live.match_id))void openMatch(live.match_id,false);
    }
  }catch(e){if(isCurrent(owner,stamp))status(tr('⚠️ Nelze načíst zápasy: ','⚠️ Cannot load matches: ')+safeError(e));}
  finally{loadingDashboard=false;}
}
async function refreshState(){
  if(!activeId||!api||!uid||loadingState)return;
  loadingState=true;
  const owner=uid,stamp=epoch,id=activeId;
  try{
    const m=await call('arcade_live_state',{p_match_id:id});
    if(isCurrent(owner,stamp)&&activeId===id){
      active=m;renderArena();
      if(['finished','declined','expired','cancelled'].includes(m.state))
        void refreshDashboard(true);
    }
  }catch(e){
    if(isCurrent(owner,stamp)&&activeId===id)status(tr('⚠️ Stav souboje: ','⚠️ Match status: ')+safeError(e));
  }finally{loadingState=false;}
}
async function openMatch(id,doNav=true){
  if(!UUID.test(id)||!uid)return;
  activeId=id;active=null;renderArena();
  if(doNav)navigate?.('community');
  await refreshState();
}
async function invite(friendId){
  if(!uid||!UUID.test(friendId)||busy)return;
  const owner=uid,stamp=epoch;busy=true;renderList();
  status(tr('⚡ Posílám pozvánku…','⚡ Sending invite…'));
  const key='foxey.live.operation.'+owner+'.'+friendId;
  let operation;
  try{
    operation=window.sessionStorage.getItem(key);
    if(!UUID.test(operation)){operation=crypto.randomUUID();window.sessionStorage.setItem(key,operation);}
    const result=await call('arcade_live_invite',{p_friend_id:friendId,p_operation:operation});
    if(!isCurrent(owner,stamp))return;
    window.sessionStorage.removeItem(key);
    status(tr('✅ Pozvánka odeslána!','✅ Invite sent!'));
    await refreshDashboard(true);
    await openMatch(result.match_id);
    window.FOXEY_ARCADE_SOCIAL?.refreshInbox?.();
  }catch(e){if(isCurrent(owner,stamp))status(tr('⚠️ Pozvánka: ','⚠️ Invite: ')+safeError(e));}
  finally{if(isCurrent(owner,stamp)){busy=false;renderList();renderArena();}}
}
async function mutate(name,args,message){
  if(!activeId||!uid||busy)return;
  const owner=uid,stamp=epoch;busy=true;renderArena();
  try{
    await call(name,args);
    if(!isCurrent(owner,stamp))return;
    if(message)status(message);
    await refreshState();await refreshDashboard(true);
    window.FOXEY_ARCADE_SOCIAL?.refreshInbox?.();
  }catch(e){if(isCurrent(owner,stamp))status(tr('⚠️ Akce: ','⚠️ Action: ')+safeError(e));}
  finally{if(isCurrent(owner,stamp)){busy=false;renderArena();}}
}
const respond=accept=>mutate('arcade_live_respond',{p_match_id:activeId,p_accept:accept},
  accept?tr('✅ Pozvánka přijata.','✅ Invite accepted.'):tr('Pozvánka odmítnuta.','Invite declined.'));
const setReady=ready=>mutate('arcade_live_ready',{p_match_id:activeId,p_ready:ready});
const answer=(index,choice)=>mutate('arcade_live_answer',
  {p_match_id:activeId,p_index:index,p_choice:choice});
const cancelMatch=()=>mutate('arcade_live_cancel',{p_match_id:activeId});
function connect(client,user){
  const next=user?.id||null;
  if(next!==uid){
    epoch++;snapshot=null;active=null;activeId=null;previousInvites=-1;lastDashboard=0;lastPing=0;
    loadingDashboard=false;loadingState=false;busy=false;
  }
  api=client||null;uid=next;
  renderList();renderArena();
  if(uid){
    void ping();void refreshDashboard(true);
    const link=new URLSearchParams(location.search).get('live');
    if(UUID.test(link))void openMatch(link);
  }
}
function onPage(next){
  page=next;
  if(next==='community'&&uid){void ping();void refreshDashboard(true);if(activeId)void refreshState();}
}
function setNavigation(cb){navigate=cb;}
$('liveRefresh')?.addEventListener('click',()=>{void ping();void refreshDashboard(true);if(activeId)void refreshState();});
window.setInterval?.(()=>{
  if(!uid||document.visibilityState==='hidden')return;
  void ping();
  if(page==='community'){
    if(activeId)void refreshState();
    void refreshDashboard();
  }else if(Date.now()-lastDashboard>15000){
    void refreshDashboard(true);
  }
},2000);
window.addEventListener('focus',()=>{if(uid){void ping();void refreshDashboard(true);if(activeId)void refreshState();}});
window.addEventListener('foxey-arcade:locale-changed',()=>{renderList();renderArena();});
window.FOXEY_ARCADE_LIVE=Object.freeze({connect,onPage,setNavigation,invite,openMatch,refresh:refreshDashboard});
renderList();renderArena();
})();