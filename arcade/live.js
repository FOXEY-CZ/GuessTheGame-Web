/* FOXEY Arcade Live Duels 1.2 — secure, no wallet or save mutations.
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
let snapshot=null,loadingDashboard=false,loadingState=false,loadingStateId=null,lastDashboard=0,lastPing=0;
let navigate=null,previousInvites=-1;
let stats=null,statsLoading=false,lastStats=0;
let realtimeChannel=null,realtimeClient=null,realtimeConnected=false,lastState=0;
let seriesData=null,seriesBusy=false,seriesBusyId=null,lastSeries=0;
let headFriendId=null,headData=null,headBusy=false,lastHead=0;
const modeName=m=>m==='speed'?tr('⚡ Rychlostní','⚡ Speed'):
  m==='mystery'?tr('🧩 Mystery','🧩 Mystery'):tr('⚔️ Klasika','⚔️ Classic');
const storageKey=owner=>'foxey.arcade.live.last.'+owner;
function networkStatus(message){text('liveRealtimeStatus',message);}
function renderHeadToHead(){
  const rows=$('liveHeadToHeadRows'),details=$('liveHeadToHeadStats');
  if(!rows?.replaceChildren||!details?.replaceChildren)return;
  rows.replaceChildren();details.replaceChildren();
  if(!uid){text('liveHeadToHeadStatus',
    tr('Přihlas se pro historii zápasů.','Sign in for match history.'));return;}
  if(!headFriendId){
    text('liveHeadToHeadStatus',tr(
      'Vyber kamaráda tlačítkem „Vzájemné zápasy“.',
      'Select a friend using the Head-to-head button.'));
    return;
  }
  if(!headData){
    text('liveHeadToHeadStatus',tr('☁️ Načítám historii…','☁️ Loading history…'));
    return;
  }
  text('liveHeadToHeadStatus',tr('🎮 Vzájemné zápasy s ','🎮 Matches against ')+
    label(headData.friend));
  const d=headData.summary||{};
  for(const [name,value] of [
    [tr('Zápasy','Matches'),d.played],
    [tr('Výhry','Wins'),d.wins],[tr('Prohry','Losses'),d.losses],
    [tr('Remízy','Draws'),d.draws],
    [tr('Body','Points'),String(d.points_scored??0)+' : '+String(d.points_conceded??0)]]){
    const n=elem('span','',name+': ');n.append(elem('strong','',String(value??0)));
    details.append(n);
  }
  const list=Array.isArray(headData.history)?headData.history:[];
  if(!list.length){
    rows.append(elem('p','small',tr(
      'Zatím nemáte dokončený žádný vzájemný živý zápas.',
      'You have not completed any live head-to-head match yet.')));
  }
  for(const item of list){
    if(!UUID.test(item.match_id))continue;
    const r=elem('div','live-history-row');
    const left=elem('div','live-history-main');
    const date=item.finished_at?
      new Date(item.finished_at).toLocaleDateString(
        window.FOXEY_I18N?.getLocale?.()==='en'?'en-US':'cs-CZ'):'—';
    left.append(elem('strong','',modeName(item.mode)+
      (item.series_id?tr(' · série #',' · series #')+item.series_game_no:'')));
    left.append(elem('span','live-history-note',date+' · '+
      (item.result==='win'?tr('Výhra','Win'):item.result==='loss'?
        tr('Prohra','Loss'):tr('Remíza','Draw'))));
    r.append(left,elem('span','live-history-result '+(item.result||'draw'),
      String(item.my_score)+' : '+String(item.opponent_score)));
    rows.append(r);
  }
}
async function refreshHeadToHead(force=false){
  if(!uid||!headFriendId||headBusy)return;
  if(!force&&Date.now()-lastHead<20000)return;
  headBusy=true;const owner=uid,stamp=epoch,friendId=headFriendId;
  try{
    const data=await call('arcade_live_head_to_head',{
      p_friend_id:friendId,p_limit:20
    });
    if(isCurrent(owner,stamp)&&headFriendId===friendId){
      headData=data;lastHead=Date.now();renderHeadToHead();
    }
  }catch(e){
    if(isCurrent(owner,stamp)&&headFriendId===friendId)
      text('liveHeadToHeadStatus',
        tr('⚠️ Historie se nenačetla: ','⚠️ History unavailable: ')+safeError(e));
  }finally{headBusy=false;}
}
function viewHeadToHead(friendId){
  if(!uid||!UUID.test(friendId))return;
  if(friendId!==headFriendId){headData=null;lastHead=0;}
  headFriendId=friendId;renderHeadToHead();
  navigate?.('community');
  $('liveHeadToHeadPanel')?.scrollIntoView?.({behavior:'smooth',block:'start'});
  void refreshHeadToHead(true);
}
function renderSeries(){
  const root=$('liveSeriesSummary');if(!root?.replaceChildren)return;
  root.replaceChildren();
  const m=active;
  root.classList.toggle('hidden',!m?.series_id);
  if(!m?.series_id)return;
  if(!seriesData||seriesData.series_id!==m.series_id){
    root.append(elem('p','live-series-meta',tr(
      '🏆 Načítám stav série…','🏆 Loading series score…')));
    return;
  }
  const d=seriesData;
  const top=elem('div','live-series-score');
  const first=label(d.first_player),second=label(d.second_player);
  top.append(elem('span','',first),
    elem('strong','',d.first_wins+' : '+d.second_wins),
    elem('span','',second));
  root.append(top);
  const target=Number(d.target_wins)||2;
  const meta=tr('Série na ','First to ')+target+
    tr(' vítězství · ',' wins · ')+modeName(d.mode)+
    tr(' · remízy: ',' · draws: ')+String(d.draws||0);
  root.append(elem('div','live-series-meta',meta));
  if(d.state==='finished'){
    const mine=d.winner_id&&d.winner_id===uid;
    root.append(elem('strong','',d.winner_id?
      (mine?tr('🏆 Vyhrál jsi celou sérii!','🏆 You won the series!'):
        tr('🏅 Sérii vyhrál soupeř.','🏅 Your opponent won the series.')):
      tr('🤝 Série skončila remízou.','🤝 The series ended in a draw.')));
  }else if(d.state==='active'){
    root.append(elem('strong','',tr('🎮 Série právě probíhá','🎮 Series in progress')));
  }else{
    root.append(elem('strong','',tr('Série byla ukončena.','Series ended.')));
  }
  const games=elem('div','live-series-games');
  for(const g of (Array.isArray(d.games)?d.games:[])){
    if(!UUID.test(g.match_id))continue;
    const el=elem('span','live-series-game'+
      (g.match_id===m.match_id?' current':''),
      '#'+g.game_no+' · '+(g.state==='finished'?
        g.first_score+':'+g.second_score:
        g.state==='running'?tr('Hraje se','Playing'):
        g.state==='lobby'?tr('Lobby','Lobby'):
        g.state==='invited'?tr('Pozvánka','Invite'):g.state));
    games.append(el);
  }
  root.append(games);
}
async function refreshSeries(force=false){
  const id=active?.series_id;
  if(!uid||!api||!UUID.test(id))return;
  if(seriesBusy&&seriesBusyId===id)return;
  if(!force&&seriesData?.series_id===id&&Date.now()-lastSeries<4000)return;
  const owner=uid,stamp=epoch;seriesBusy=true;seriesBusyId=id;
  try{
    const data=await call('arcade_live_series_state',{p_series_id:id});
    if(isCurrent(owner,stamp)&&active?.series_id===id){
      const previous=seriesData?.state;
      seriesData=data;lastSeries=Date.now();renderArena();
      if(previous!==data.state&&data.state==='finished')
        void refreshHeadToHead(true);
    }
  }catch(e){
    if(isCurrent(owner,stamp)&&active?.series_id===id)
      text('liveStatus',tr('⚠️ Stav série: ','⚠️ Series status: ')+safeError(e));
  }finally{
    if(seriesBusyId===id){seriesBusy=false;seriesBusyId=null;}
  }
}
async function nextSeriesRound(){
  const id=active?.series_id;
  if(!uid||!UUID.test(id)||busy)return;
  busy=true;const owner=uid,stamp=epoch;renderArena();
  try{
    const result=await call('arcade_live_series_next',{p_series_id:id});
    if(!isCurrent(owner,stamp))return;
    if(result.state==='finished'){
      await refreshSeries(true);
      status(tr('🏆 Série už má vítěze.','🏆 The series has a winner.'));
    }else if(UUID.test(result.match_id)){
      status(tr('✅ Další zápas série je připraven!',
        '✅ The next series match is ready!'));
      await refreshDashboard(true);
      await openMatch(result.match_id);
    }
  }catch(e){
    if(isCurrent(owner,stamp))
      status(tr('⚠️ Další zápas: ','⚠️ Next game: ')+safeError(e));
  }finally{if(isCurrent(owner,stamp)){busy=false;renderArena();}}
}
function disconnectRealtime(){
  const old=realtimeChannel,client=realtimeClient;
  realtimeChannel=null;realtimeClient=null;realtimeConnected=false;
  if(old&&client?.removeChannel)void client.removeChannel(old).catch?.(()=>{});
  networkStatus(tr('☁️ Kontroluji připojení…','☁️ Checking connection…'));
}
async function connectRealtime(owner,stamp){
  const client=api;
  if(!client?.channel||!client?.realtime?.setAuth)return;
  try{
    await client.realtime.setAuth();
    if(!isCurrent(owner,stamp)||realtimeChannel)return;
    const channel=client.channel('arcade-live:user:'+owner,{config:{private:true}});
    realtimeChannel=channel;realtimeClient=client;
    channel.on('broadcast',{event:'refresh'},payload=>{
      if(!isCurrent(owner,stamp))return;
      const id=payload?.payload?.match_id;
      if(!UUID.test(id))return;
      if(activeId===id)void refreshState();
      void refreshDashboard(true);
      if(page==='community')void refreshStats(true);
      window.FOXEY_ARCADE_SOCIAL?.refreshInbox?.();
    }).subscribe(state=>{
      if(!isCurrent(owner,stamp)||realtimeChannel!==channel)return;
      realtimeConnected=state==='SUBSCRIBED';
      networkStatus(realtimeConnected?
        tr('🟢 Realtime připojeno','🟢 Realtime connected'):
        tr('🟡 Obnovování přes server','🟡 Server polling fallback'));
      if(realtimeConnected){
        void refreshDashboard(true);
        if(activeId)void refreshState();
      }
    });
  }catch(_){
    if(isCurrent(owner,stamp))networkStatus(tr(
      '🟡 Realtime nedostupné · bezpečné obnovení funguje',
      '🟡 Realtime unavailable · safe polling active'));
  }
}
function renderStats(){
  const summary=$('liveStatsSummary'),rank=$('liveLeaderboard');
  if(!summary?.replaceChildren||!rank?.replaceChildren)return;
  summary.replaceChildren();rank.replaceChildren();
  if(!uid){
    summary.append(elem('span','',tr('Přihlas se pro PvP statistiky.','Sign in for PvP stats.')));
    return;
  }
  if(!stats){
    summary.append(elem('span','',tr('☁️ Načítám výsledky PvP…','☁️ Loading PvP standings…')));
    return;
  }
  const me=stats.self;
  if(me){
    for(const [name,value] of [
      [tr('Zápasy','Matches'),me.played],
      [tr('Výhry','Wins'),me.wins],
      [tr('Prohry','Losses'),me.losses],
      [tr('Remízy','Draws'),me.draws],
      [tr('Úspěšnost','Accuracy'),String(me.accuracy)+' %']]){
      const item=elem('span','',name+': ');
      item.append(elem('strong','',Number.isFinite(Number(value))?String(value):String(value)));
      summary.append(item);
    }
  }
  const legend=elem('div','live-leaderboard-row live-leaderboard-legend');
  for(const name of [tr('Hráč','Player'),tr('Výhry','Wins'),
    tr('Zápasy','Matches'),tr('Úspěšnost výher','Win rate')]){
    legend.append(elem('span','',name));
  }
  rank.append(legend);
  const rows=Array.isArray(stats.leaderboard)?stats.leaderboard:[];
  for(let i=0;i<rows.length;i++){
    const item=rows[i];if(!item?.profile?.user_id)continue;
    const row=elem('div','live-leaderboard-row'+
      (item.profile.user_id===uid?' live-leaderboard-self':''));
    row.append(elem('span','live-player-name',String(i+1)+'. '+label(item.profile)));
    row.append(elem('span','',String(item.wins)),elem('span','',String(item.played)),
      elem('span','',String(item.win_rate)+' %'));
    rank.append(row);
  }
}
async function refreshStats(force=false){
  if(!uid||!api||statsLoading)return;
  if(!force&&Date.now()-lastStats<20000)return;
  const owner=uid,stamp=epoch;statsLoading=true;
  try{
    const data=await call('arcade_live_stats');
    if(!isCurrent(owner,stamp))return;
    stats=data;lastStats=Date.now();renderStats();
  }catch(e){
    if(isCurrent(owner,stamp))text('liveStatsSummary',
      tr('⚠️ Statistiky nejsou dostupné: ','⚠️ Stats unavailable: ')+safeError(e));
  }finally{if(isCurrent(owner,stamp))statsLoading=false;}
}

const people=()=>Array.isArray(snapshot?.friends)?snapshot.friends:[];
const matches=()=>Array.isArray(snapshot?.matches)?snapshot.matches:[];
// Match rows arrive newest first. A finished game's latest rematch can be
// pending, running, accepted or explicitly declined by the other player.
const latestRematch=m=>m?.state==='finished'?
  matches().find(x=>x.rematch_of===m.match_id):null;
const pendingRematch=m=>{
  const latest=latestRematch(m);
  return latest&&['invited','lobby','running'].includes(latest.state)?latest:null;
};
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
    const actions=elem('div','live-item-actions');
    actions.append(btn(tr('⚡ Pozvat 1v1','⚡ Invite 1v1'),
      ()=>void invite(p.user_id),'primary',busy),
      btn(tr('📜 Vzájemné zápasy','📜 Head-to-head'),
      ()=>viewHeadToHead(p.user_id),'secondary',busy));
    row.append(who,actions);
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
    const myPoints=m.role==='host'?m.host_score:m.guest_score;
    const oppPoints=m.role==='host'?m.guest_score:m.host_score;
    const seriesLabel=m.series_id?
      tr('🏆 Série · zápas ','🏆 Series · game ')+m.series_game_no+' · ':null;
    const rematchLabel=m.rematch_of&&m.state==='invited'?
      (m.role==='guest'?tr('🔄 Žádost o odvetu','🔄 Rematch requested'):
        tr('🔄 Čeká na odvetu','🔄 Rematch pending')):
      m.rematch_of&&m.state==='declined'?
      (m.role==='host'?tr('❌ Odveta byla odmítnuta','❌ Rematch declined'):
        tr('❌ Odvetu jsi odmítl','❌ You declined the rematch')):null;
    head.append(elem('strong','',label(m.opponent)),
      elem('span','',(seriesLabel||'')+
        (rematchLabel||translation[m.state]||m.state)+' · '+modeName(m.mode)));
    if(m.state==='finished')head.append(elem('span','',
      tr('Skóre ','Score ')+myPoints+' : '+oppPoints));
    row.append(head,btn(m.state==='invited'&&m.role==='guest'?
      (m.rematch_of?tr('🔄 Rozhodnout o odvetě','🔄 Respond to rematch'):
        tr('📩 Odpovědět','📩 Respond')):tr('Zobrazit','View'),
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
  // Keep the arena visible while its participant-only state is loading.
  arena.classList.toggle('hidden',!m&&!activeId);
  controls.replaceChildren();question.replaceChildren();options.replaceChildren();
  if(!m){
    renderSeries();
    if(activeId){
      text('liveArenaMode','');
      text('liveArenaOpponent','');
      text('liveArenaStatus',tr('☁️ Načítám lobby…','☁️ Loading lobby…'));
      text('liveCountdown','');text('liveRound','');
    }
    return;
  }
  const host=m.role==='host';
  text('liveArenaMode',modeName(m.mode)+
    (m.series_id?tr(' · Série #',' · Series #')+m.series_game_no:''));
  text('liveArenaOpponent',tr('Soupeř: ','Opponent: ')+label(m.opponent));
  text('liveScoreHost',String(host?m.host_score:m.guest_score));
  text('liveScoreGuest',String(host?m.guest_score:m.host_score));
  text('liveRound',m.state==='running'?
    tr('Otázka ','Question ')+(m.question_index+1)+' / 10':'');
  const states={
    invited:m.rematch_of?
      (host?tr('🔄 Požádal jsi o odvetu. Čeká se na rozhodnutí soupeře.',
                 '🔄 You requested a rematch. Waiting for your opponent.'):
        tr('🔄 Kamarád tě žádá o odvetu. Chceš ji přijmout?',
           '🔄 Your friend requests a rematch. Do you accept?')):
      (host?tr('📨 Pozvánka odeslána. Čekáme na přijetí.','📨 Waiting for opponent to accept.'):
        tr('📨 Kamarád tě zve do živého 1v1!','📨 Your friend invited you to a live 1v1!')),
    lobby:tr('🕹️ Lobby: oba hráči musí potvrdit připravenost.','🕹️ Lobby: both players must get ready.'),
    running:m.my_answered?
      tr('✅ Odpověď uložená. Čekáme na soupeře nebo konec kola.','✅ Answer saved. Waiting for the other player or timer.'):
      tr('🔥 Odpověz před vypršením času.','🔥 Answer before the timer ends.'),
    finished:tr('🏆 Zápas dokončen.','🏆 Match complete.'),
    declined:m.rematch_of?
      (host?tr('❌ Odveta byla odmítnuta.','❌ The rematch was declined.'):
        tr('❌ Odvetu jsi odmítl.','❌ You declined the rematch.')):
      tr('Pozvánka odmítnuta.','Invite declined.'),
    cancelled:tr('Zápas zrušen.','Match canceled.'),
    expired:tr('Zápas vypršel.','Match expired.')};
  text('liveArenaStatus',states[m.state]||m.state);
  if(m.state==='invited'&&!host){
    controls.append(btn(m.rematch_of?tr('✅ Přijmout odvetu','✅ Accept rematch'):
      tr('✅ Přijmout','✅ Accept'),
      ()=>void respond(true),'primary',busy),
      btn(m.rematch_of?tr('❌ Odmítnout odvetu','❌ Decline rematch'):
        tr('✕ Odmítnout','✕ Decline'),()=>void respond(false),'secondary',busy));
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
    // Best-of series is mutually agreed once; a later round uses lobby/Ready,
    // not a new rematch invitation on every finished round.
    if(m.series_id){
      if(!seriesData||seriesData.series_id!==m.series_id){
        question.append(elem('p','small',tr(
          '🏆 Počítám stav celé série…','🏆 Calculating the series score…')));
      }else if(seriesData.state==='active'){
        const nextId=seriesData.latest_match_id;
        if(nextId!==m.match_id&&UUID.test(nextId)){
          controls.append(btn(tr('▶️ Připojit se k další hře série',
            '▶️ Join next series match'),
            ()=>void openMatch(nextId),'primary',busy));
        }else{
          controls.append(btn(tr('▶️ Další zápas série','▶️ Next series game'),
            ()=>void nextSeriesRound(),'primary',busy));
        }
      }else if(seriesData.state==='finished'){
        question.append(elem('p','small',tr(
          '🏆 Série byla dokončena. Výsledek najdeš nad skóre zápasu.',
          '🏆 Series finished. See the series result above the match score.')));
      }
    }else{
    const pending=pendingRematch(m);
    const latest=latestRematch(m);
    if(!pending&&latest?.state==='declined'&&latest.role==='host'){
      question.append(elem('p','live-rematch-result',tr(
        '❌ Odveta byla odmítnuta. Soupeř tvoji žádost nepřijal.',
        '❌ The rematch was declined. Your opponent did not accept.')));
    }
    if(!pending){
      controls.append(btn(tr('🔄 Požádat o odvetu','🔄 Request rematch'),
        ()=>void rematch(),'primary',busy));
    }else if(pending.state==='invited'&&pending.role==='guest'){
      question.append(elem('p','live-rematch-prompt',tr(
        '🔄 Soupeř žádá o odvetu. Chceš ji přijmout?',
        '🔄 Your opponent requests a rematch. Do you accept?')));
      controls.append(btn(tr('✅ Přijmout odvetu','✅ Accept rematch'),
        ()=>void answerRematchRequest(pending.match_id,true),'primary',busy),
        btn(tr('❌ Odmítnout odvetu','❌ Decline rematch'),
        ()=>void answerRematchRequest(pending.match_id,false),'secondary',busy));
    }else if(pending.state==='invited'){
      question.append(elem('p','live-rematch-prompt',tr(
        '⏳ Požádal jsi o odvetu. Čekáme na soupeře.',
        '⏳ You requested a rematch. Waiting for your opponent.')));
      controls.append(btn(tr('👀 Zobrazit čekající odvetu','👀 View pending rematch'),
        ()=>void openMatch(pending.match_id),'secondary',busy));
    }else{
      controls.append(btn(tr('▶️ Pokračovat v odvetě','▶️ Open rematch'),
        ()=>void openMatch(pending.match_id),'primary',busy));
    }
    }
  }
  if(['invited','lobby','running'].includes(m.state)){
    controls.append(btn(tr('⛔ Ukončit zápas','⛔ End match'),()=>void cancelMatch(),
      'secondary',busy));
  }
  controls.append(btn(tr('← Zpět na přátele','← Back to friends'),()=>{
    activeId=null;active=null;
    try{window.sessionStorage.removeItem(storageKey(uid));}catch(_){}
    renderArena();
  }));
  renderSeries();
  updateTimer();
}
async function refreshDashboard(force=false){
  if(!api||!uid||loadingDashboard||navigator.onLine===false)return;
  if(!force&&Date.now()-lastDashboard<6500)return;
  loadingDashboard=true;const owner=uid,stamp=epoch;
  try{
    const result=await call('arcade_live_dashboard');
    if(!isCurrent(owner,stamp))return;
    const previousMatches=matches();
    snapshot=result;lastDashboard=Date.now();
    const newlyRejected=matches().some(m=>m.rematch_of&&m.role==='host'&&
      m.state==='declined'&&previousMatches.some(x=>
        x.match_id===m.match_id&&x.state==='invited'));
    if(newlyRejected){
      status(tr('❌ Odveta byla odmítnuta.','❌ The rematch was declined.'));
      window.FOXEY_ARCADE_SOCIAL?.refreshInbox?.();
    }
    renderList();
    // An opponent's pending request changes the controls on an already-open
    // finished-match result. Re-render without navigating away or losing it.
    if(active?.state==='finished')renderArena();
    if(active?.series_id)void refreshSeries();
    if(headFriendId&&Date.now()-lastHead>20000)void refreshHeadToHead();
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
  if(!activeId||!api||!uid)return;
  // A pending fetch for another match must not swallow an explicit lobby open.
  if(loadingState&&loadingStateId===activeId)return;
  loadingState=true;loadingStateId=activeId;
  const owner=uid,stamp=epoch,id=activeId;
  try{
    const m=await call('arcade_live_state',{p_match_id:id});
    if(isCurrent(owner,stamp)&&activeId===id){
      const oldState=active?.state;
      if(active?.series_id!==m.series_id){
        seriesData=null;lastSeries=0;
      }
      active=m;lastState=Date.now();renderArena();
      if(m.series_id)void refreshSeries(true);
      if(m.state!==oldState&&m.state==='finished')void refreshStats(true);
      if(['finished','declined','expired','cancelled'].includes(m.state)
         &&m.state!==oldState)void refreshDashboard(true);
    }
  }catch(e){
    if(isCurrent(owner,stamp)&&activeId===id){
      const error=tr('⚠️ Lobby se nepodařilo načíst: ','⚠️ Could not load lobby: ')+safeError(e);
      status(error);text('liveArenaStatus',error);
    }
  }finally{
    if(loadingStateId===id){loadingState=false;loadingStateId=null;lastState=Date.now();}
  }
}
async function openMatch(id,doNav=true){
  if(!UUID.test(id)||!uid){
    status(tr('⚠️ Pro otevření lobby se přihlas.','⚠️ Sign in to open the lobby.'));
    return false;
  }
  activeId=id;active=null;
  try{window.sessionStorage.setItem(storageKey(uid),id);}catch(_){}
  if(doNav)navigate?.('community');
  renderArena();
  // The arena is below the friend list. The old bell action opened it off-screen.
  // Reveal it immediately, not after a possibly slow authenticated RPC.
  const arena=$('liveArena');
  arena?.scrollIntoView?.({behavior:'smooth',block:'start'});
  arena?.focus?.({preventScroll:true});
  await refreshState();
  return active?.match_id===id;
}
async function invite(friendId){
  if(!uid||!UUID.test(friendId)||busy)return;
  const owner=uid,stamp=epoch;busy=true;renderList();
  status(tr('⚡ Posílám pozvánku…','⚡ Sending invite…'));
  const mode=['classic','speed','mystery'].includes($('liveModeSelect')?.value)?
    $('liveModeSelect').value:'classic';
  const target=[2,3].includes(Number($('liveSeriesSelect')?.value))?
    Number($('liveSeriesSelect').value):1;
  const key='foxey.live.operation.'+owner+'.'+friendId+'.'+mode+'.'+target;
  let operation;
  try{
    operation=window.sessionStorage.getItem(key);
    if(!UUID.test(operation)){operation=crypto.randomUUID();window.sessionStorage.setItem(key,operation);}
    const result=target===1?
      await call('arcade_live_invite_mode',{
        p_friend_id:friendId,p_operation:operation,p_mode:mode
      }):
      await call('arcade_live_series_create',{
        p_friend_id:friendId,p_operation:operation,p_mode:mode,
        p_target_wins:target
      });
    if(!isCurrent(owner,stamp))return;
    window.sessionStorage.removeItem(key);
    status(target===1?tr('✅ Pozvánka odeslána!','✅ Invite sent!'):
      tr('🏆 Pozvánka do série byla odeslána!',
        '🏆 Best-of series invitation sent!'));
    await refreshDashboard(true);
    await openMatch(result.match_id);
    window.FOXEY_ARCADE_SOCIAL?.refreshInbox?.();
  }catch(e){if(isCurrent(owner,stamp))status(tr('⚠️ Pozvánka: ','⚠️ Invite: ')+safeError(e));}
  finally{if(isCurrent(owner,stamp)){busy=false;renderList();renderArena();}}
}
async function answerRematchRequest(matchId,accept){
  if(!uid||!UUID.test(matchId)||busy)return;
  const owner=uid,stamp=epoch;busy=true;renderArena();
  try{
    const outcome=await call('arcade_live_respond',{
      p_match_id:matchId,p_accept:accept
    });
    if(!isCurrent(owner,stamp))return;
    await refreshDashboard(true);
    if(accept){
      status(tr('✅ Odveta přijata! Oba se připravte.',
        '✅ Rematch accepted! Both players should ready up.'));
      await openMatch(matchId);
    }else{
      status(tr('❌ Odvetu jsi odmítl. Soupeř dostane oznámení.',
        '❌ You declined the rematch. Your opponent will be notified.'));
      renderArena();
    }
    window.FOXEY_ARCADE_SOCIAL?.refreshInbox?.();
  }catch(e){
    if(isCurrent(owner,stamp)){
      const msg=tr('⚠️ Odpověď na odvetu: ','⚠️ Rematch response: ')+safeError(e);
      status(msg);text('liveArenaStatus',msg);
    }
  }finally{
    if(isCurrent(owner,stamp)){busy=false;renderList();renderArena();}
  }
}
async function rematch(){
  if(!uid||!activeId||active?.state!=='finished'||busy)return;
  const owner=uid,stamp=epoch,finishedId=activeId;
  const key='foxey.live.rematch.'+owner+'.'+finishedId;
  busy=true;renderArena();
  try{
    let operation=window.sessionStorage.getItem(key);
    if(!UUID.test(operation)){
      operation=crypto.randomUUID();window.sessionStorage.setItem(key,operation);
    }
    const result=await call('arcade_live_rematch',{
      p_finished_match:finishedId,p_operation:operation
    });
    if(!isCurrent(owner,stamp))return;
    window.sessionStorage.removeItem(key);
    status(result.needs_acceptance?
      tr('🔄 Soupeř už tě požádal o odvetu. Vyber Přijmout nebo Odmítnout.',
        '🔄 Your opponent already requested a rematch. Accept or decline.'):
      result.existing?
        tr('⏳ Žádost o odvetu už čeká na odpověď.',
           '⏳ Rematch request is already pending.'):
        tr('✅ Žádost o odvetu odeslána!','✅ Rematch request sent!'));
    await refreshDashboard(true);
    await openMatch(result.match_id);
  }catch(e){
    if(isCurrent(owner,stamp)){
      const msg=tr('⚠️ Odveta: ','⚠️ Rematch: ')+safeError(e);
      status(msg);text('liveArenaStatus',msg);
      await refreshDashboard(true);
    }
  }finally{
    if(isCurrent(owner,stamp)){busy=false;renderArena();}
  }
}
async function mutate(name,args,message){
  if(!activeId||!uid||busy)return;
  const owner=uid,stamp=epoch;busy=true;renderArena();
  try{
    await call(name,args);
    if(!isCurrent(owner,stamp))return;
    if(message)status(message);
    await refreshState();await refreshDashboard(true);
    if(active?.series_id)void refreshSeries(true);
    if(active?.state==='finished'){
      void refreshStats(true);
      if(headFriendId)void refreshHeadToHead(true);
    }
    window.FOXEY_ARCADE_SOCIAL?.refreshInbox?.();
  }catch(e){if(isCurrent(owner,stamp))status(tr('⚠️ Akce: ','⚠️ Action: ')+safeError(e));}
  finally{if(isCurrent(owner,stamp)){busy=false;renderArena();}}
}
const respond=accept=>mutate('arcade_live_respond',{p_match_id:activeId,p_accept:accept},
  accept?
    (active?.rematch_of?tr('✅ Odveta přijata.','✅ Rematch accepted.'):
      tr('✅ Pozvánka přijata.','✅ Invite accepted.')):
    (active?.rematch_of?
      tr('❌ Odvetu jsi odmítl. Soupeř dostane oznámení.',
         '❌ You declined the rematch. Your opponent will be notified.'):
      tr('Pozvánka odmítnuta.','Invite declined.')));
const setReady=ready=>mutate('arcade_live_ready',{p_match_id:activeId,p_ready:ready});
const answer=(index,choice)=>mutate('arcade_live_answer',
  {p_match_id:activeId,p_index:index,p_choice:choice});
const cancelMatch=()=>mutate('arcade_live_cancel',{p_match_id:activeId});
function connect(client,user){
  const next=user?.id||null,previous=uid;
  const changed=next!==uid;
  if(changed){
    disconnectRealtime();
    if(previous)try{window.sessionStorage.removeItem(storageKey(previous));}catch(_){}
    epoch++;snapshot=null;stats=null;statsLoading=false;lastStats=0;
    seriesData=null;seriesBusy=false;seriesBusyId=null;lastSeries=0;
    headFriendId=null;headData=null;headBusy=false;lastHead=0;
    active=null;activeId=null;previousInvites=-1;lastDashboard=0;lastPing=0;lastState=0;
    loadingDashboard=false;loadingState=false;loadingStateId=null;busy=false;
  }
  api=client||null;uid=next;
  renderList();renderArena();renderStats();renderHeadToHead();
  if(uid){
    void ping();void refreshDashboard(true);void refreshStats(true);
    if(!realtimeChannel)void connectRealtime(uid,epoch);
    if(changed){
      const link=new URLSearchParams(location.search).get('live');
      let last=null;
      try{last=window.sessionStorage.getItem(storageKey(uid));}catch(_){}
      const id=UUID.test(link)?link:UUID.test(last)?last:null;
      if(id)void openMatch(id,UUID.test(link));
    }
  }else networkStatus(tr('🔐 Přihlas se pro Realtime','🔐 Sign in for Realtime'));
}
function onPage(next){
  page=next;
  if(next==='community'&&uid){
    void ping();void refreshDashboard(true);void refreshStats();
    if(activeId)void refreshState();
    if(active?.series_id)void refreshSeries(true);
    if(headFriendId)void refreshHeadToHead();
  }
}
function setNavigation(cb){navigate=cb;}
$('liveRefresh')?.addEventListener('click',()=>{
  void ping();void refreshDashboard(true);void refreshStats(true);
  if(activeId)void refreshState();
  if(active?.series_id)void refreshSeries(true);
  if(headFriendId)void refreshHeadToHead(true);
});
$('liveHeadToHeadRefresh')?.addEventListener('click',
  ()=>void refreshHeadToHead(true));
window.setInterval?.(()=>{
  updateTimer();
  if(!uid||document.visibilityState==='hidden'||navigator.onLine===false)return;
  void ping();
  const now=Date.now();
  if(page==='community'){
    if(activeId&&now-lastState>(realtimeConnected?7000:2500))void refreshState();
    if(active?.series_id&&now-lastSeries>8000)void refreshSeries();
    if(headFriendId&&now-lastHead>30000)void refreshHeadToHead();
    if(now-lastDashboard>(realtimeConnected?12000:5000))void refreshDashboard(true);
    if(now-lastStats>30000)void refreshStats();
  }else if(now-lastDashboard>20000){
    void refreshDashboard(true);
  }
},1000);
function resumeConnection(){
  if(!uid||navigator.onLine===false)return;
  void ping();void refreshDashboard(true);void refreshStats(true);
  if(activeId)void refreshState();
  if(active?.series_id)void refreshSeries(true);
  if(headFriendId)void refreshHeadToHead(true);
  if(!realtimeChannel)void connectRealtime(uid,epoch);
}
window.addEventListener('focus',resumeConnection);
window.addEventListener('online',()=>{
  networkStatus(tr('🔄 Obnovuji připojení…','🔄 Reconnecting…'));
  resumeConnection();
});
window.addEventListener('offline',()=>{
  realtimeConnected=false;
  networkStatus(tr('🔴 Offline · skóre bezpečně na serveru','🔴 Offline · score stays on server'));
});
document.addEventListener?.('visibilitychange',()=>{
  if(document.visibilityState==='visible')resumeConnection();
});
window.addEventListener('foxey-arcade:locale-changed',()=>{
  renderList();renderArena();renderStats();renderHeadToHead();
});
window.FOXEY_ARCADE_LIVE=Object.freeze({
  connect,onPage,setNavigation,invite,openMatch,refresh:refreshDashboard,
  refreshStats,viewHeadToHead
});
renderList();renderArena();renderStats();renderHeadToHead();
})();