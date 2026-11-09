/* Quizoria 1.2 — Guess the General.
 * Authenticated, server-owned runs, event-idempotent answers, saved games,
 * shared daily question sets and two-player link challenges. */
(()=>{
'use strict';
const engine=window.QUIZORIA_CATEGORY_ENGINE;
if(!engine?.config('general'))return;
const $=id=>document.getElementById(id);
const root=$('quizoriaGeneralPanel');
if(!root)return;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const modes=engine.config('general').modes.filter(mode=>mode!=='friend');
const dict={
  cs:{
    title:'🌍 Všeobecné znalosti',sub:'Zeměpis, historie, věda a technologie v jednom kvízu!',
    back:'← Zpět do Quizorie',intro:'Vyber téma, přečti indicii a odpověz. Správnost kontroluje server.',
    category:'🌍 Znalosti a zajímavosti',new:'▶ Hrát',resume:'⏯ Pokračovat',
    modes:['🌍 Všeobecný mix','🗺️ Zeměpis','🏛️ Historie','🔬 Věda','💻 Technologie','🟢 Nováček','🟠 Znalec','🔥 Expert','📅 Denní znalosti'],
    subs:['10 otázek ze čtyř témat','10 zeměpisných otázek','10 historických otázek','10 otázek z vědy a přírody','10 otázek o technice a IT','10 lehčích otázek','10 středně těžkých otázek','10 nejtěžších otázek','Stejných 5 otázek pro všechny (UTC)'],
    saves:'💾 Rozehrané a nedávné hry',none:'Žádná rozehraná partie. Vyber režim a začni!',
    challenge:'⚔️ Znalostní výzva s kamarádem',
    challengeDesc:'Vytvoř výzvu, pošli odkaz a oba odehrajete stejných 10 otázek. Skóre se porovná po dohrání obou.',
    create:'⚔️ Vytvořit výzvu',join:'🎮 Přijmout odkaz / ID',copy:'📋 Kopírovat',
    check:'🏆 Zkontrolovat souboj',share:'Sdílet výzvu',shareReady:'Odkaz je připravený ke sdílení.',
    joined:'Výzva načtena, všichni mají stejné otázky.',
    loading:'🛡️ Ověřuji serverovou partii…',loadError:'⚠️ Požadavek se nepodařil.',
    retry:'↻ Opakovat požadavek',question:'Otázka',points:'Body',
    credits:'Více o tématu (Wikipedia)',imageError:'Indicie není dostupná.',
    linkImage:'Více o tématu',
    correct:'✅ Správně!',wrong:'❌ To není správně.',right:'Správná odpověď:',
    next:'Další otázka →',finished:'🏆 Konec kvízu!',
    result:'Tvůj výsledek',score:'bodů',playAgain:'🎮 Další kvíz',
    earned:'Odměna do Arcade',noReward:'Bez další odměny do společné peněženky.',
    cap:'Dosažen limit denních odměn.',notEnabled:'Odměny nejsou momentálně pro účet aktivní.',
    waiting:'⏳ Soupeř ještě nedohrál. Skóre se odhalí až po obou hráčích.',
    needsFriend:'⏳ Čekáme, až se kamarád připojí.',
    battle:'Výsledek souboje',creator:'Zakladatel',challenger:'Soupeř',
    win:'🏆 Vyhrál zakladatel!',lose:'🏆 Vyhrál soupeř!',tie:'🤝 Remíza!',
    noChallenge:'Zatím nemáš vybranou výzvu.',emptyInvite:'Vlož odkaz nebo ID výzvy.',
    signedOut:'Nejdřív se přihlas do FOXEY Arcade.',
    dailyNote:'Denní kvíz: 2 zeměpisné, po jedné z historie, vědy a techniky (UTC).',
    save:'Rozehraný kvíz je na serveru a zůstane zachovaný i po zavření stránky.',
    invalid:'Server vrátil neplatnou odpověď.',playFirst:'Vyber možnost odpovědi.',
    mime:'Vlastní vzdělávací otázky a emoji indicie. Odpovědi ověřuje server. Body nejsou skutečné peníze.',
    sharePlaying:'Hraješ výzvu s kamarádem. Pošli mu odkaz.',shareCopy:'📋 Zkopírovat odkaz',
    copyDone:'Odkaz zkopírován.',hint:'Původní emoji indicie a textové otázky.',
    latest:'Nedávno dokončeno',active:'Rozehráno'
  },
  en:{
    title:'🌍 General Knowledge',sub:'Geography, history, science and technology in one quiz!',
    back:'← Back to Quizoria',intro:'Pick a subject and use the clue. Every answer is checked by the server.',
    category:'🌍 Knowledge & Trivia',new:'▶ Play',resume:'⏯ Resume',
    modes:['🌍 Knowledge Mix','🗺️ Geography','🏛️ History','🔬 Science','💻 Technology','🟢 Beginner','🟠 Skilled','🔥 Expert','📅 Daily Knowledge'],
    subs:['10 questions across four subjects','10 geography questions','10 history questions','10 science and nature questions','10 technology and IT questions','10 easier questions','10 medium-difficulty questions','10 hardest questions','Same 5 daily questions for everyone (UTC)'],
    saves:'💾 Saved and recent runs',none:'No saved runs yet. Choose a mode to begin!',
    challenge:'⚔️ Challenge a Friend',challengeDesc:'Create a challenge, share the link and both play the same 10 questions. Results appear once both finish.',
    create:'⚔️ Create Challenge',join:'🎮 Join with link / ID',copy:'📋 Copy',
    check:'🏆 Check Match',share:'Share Challenge',shareReady:'Your challenge link is ready to share.',
    joined:'Challenge loaded. Both players get identical questions.',
    loading:'🛡️ Checking your server-verified game…',loadError:'⚠️ The server request failed.',
    retry:'↻ Retry request',question:'Question',points:'Points',
    credits:'Read about this topic (Wikipedia)',imageError:'Clue unavailable.',
    linkImage:'Read more about the topic',
    correct:'✅ Correct!',wrong:'❌ Not quite.',right:'Correct answer:',
    next:'Next question →',finished:'🏆 Quiz finished!',
    result:'Your result',score:'points',playAgain:'🎮 Another quiz',
    earned:'Arcade reward',noReward:'No additional wallet reward credited.',
    cap:'You reached the daily reward cap.',notEnabled:'Rewards are not currently available for this account.',
    waiting:'⏳ Waiting for the opponent. Scores appear after both finish.',
    needsFriend:'⏳ Waiting for a friend to join.',
    battle:'Match result',creator:'Creator',challenger:'Challenger',
    win:'🏆 Creator wins!',lose:'🏆 Challenger wins!',tie:'🤝 Tie!',
    noChallenge:'No challenge selected yet.',emptyInvite:'Paste an invitation link or ID.',
    signedOut:'Sign in to FOXEY Arcade first.',dailyNote:'Daily quiz: 2 geography plus one each from history, science and technology (UTC).',
    save:'Your run is safely stored on the server, even after closing this page.',
    invalid:'The server sent an invalid response.',playFirst:'Choose an answer.',
    mime:'Original educational trivia and emoji clues. Answers are verified by the server; points are not real money.',
    sharePlaying:'You are playing a friend challenge. Share the link.',shareCopy:'📋 Copy invite link',
    copyDone:'Link copied.',hint:'Original emoji clues and text questions.',
    latest:'Recently completed',active:'In progress'
  }
};
let lang='cs',api=null,uid=null,runs=[],run=null,pending=null,
    locked=false,opened=false,playing=false,feedback=null,awaitNext=false,
    mode=null,challenge=null,challengeId=null,lastQuestion=null,
    beginPending=null,serial=0,autoHandled=null;
const t=k=>dict[lang][k]||k;
function hide(id,yes){$(id)?.classList.toggle('hidden',!!yes)}
function status(msg,error=false){
 const e=$('generalStatus');if(!e)return;
 e.textContent=msg||'';
 e.classList.toggle('error',error);
}
function make(tag,cls,text){
 const node=document.createElement(tag);if(cls)node.className=cls;
 if(text!==undefined)node.textContent=text;return node;
}
function sourceLink(q){
 const link=$('generalImageCredit');
 const url=String(q?.source_url||'');
 if(!link)return;
 link.href=url.startsWith('https://en.wikipedia.org/wiki/Special:Search?search=')?url:'https://en.wikipedia.org/';
 link.textContent=t('credits');
 hide('generalImageCredit',!feedback);
 $('generalImageOpen').href=link.href;
}
function open(){
 if(!uid){status(t('signedOut'),true);return;}
 opened=true;playing=false;feedback=null;awaitNext=false;
 root.classList.remove('hidden');
 $('modePanel')?.classList.add('hidden');
 document.body.classList.remove('quiz-playing','quiz-finished');
 hide('generalLobby',false);hide('generalPlay',true);
 updateSaved();
 root.scrollIntoView?.({behavior:'smooth',block:'start'});
 void refreshRuns();
}
function close(){
 if(locked)return;
 if(playing){playing=false;feedback=null;awaitNext=false;showLobby();return;}
 opened=false;playing=false;
 root.classList.add('hidden');
 document.body.classList.remove('quiz-playing','quiz-finished');
 $('modePanel')?.classList.remove('hidden');
 window.QUIZORIA_UI?.selectCategory?.('general');
 $('hubTabCategories')?.click?.();
}
function showLobby(){
 playing=false;feedback=null;awaitNext=false;
 hide('generalLobby',false);hide('generalPlay',true);
 document.body.classList.remove('quiz-playing','quiz-finished');
 updateSaved();
}
function showGame(){
 if(!run?.has_run){status(t('invalid'),true);return;}
 playing=true;opened=true;
 hide('generalLobby',true);hide('generalPlay',false);
 document.body.classList.toggle('quiz-playing',!run.finished);
 document.body.classList.toggle('quiz-finished',!!run.finished);
 renderGame();
 $('generalPlay').scrollIntoView?.({behavior:'smooth',block:'start'});
}
function updateSaved(){
 const node=$('generalSavedList');node?.replaceChildren();
 if(!node)return;
 let seen=0;
 for(const item of runs){
  if(!item?.run_id||!uuid.test(item.run_id))continue;
  if(item.finished&&seen>=6)continue;
  seen++;
  const wrapper=make('div','general-save-row');
  const idx=modes.indexOf(item.mode);
  const title=idx>=0?t('modes')[idx]:t('challenge');
  const note=make('div','general-save-copy');
  note.append(make('strong','',title),make('small','',
    (item.finished?t('latest'):t('active'))+
    ' · '+String(item.stage||0)+'/'+String(item.total||10)+
    ' · '+String(item.score||0)+' '+t('score')));
  const button=make('button','general-save-open',t(item.finished?'latest':'resume'));
  button.disabled=locked;
  button.addEventListener('click',()=>void resume(item.run_id));
  wrapper.append(note,button);node.append(wrapper);
 }
 if(!seen)node.append(make('p','general-help',t('none')));
}
function rewardText(){
 if(!run?.reward)return t('noReward');
 if(run.reward.reason==='credited'){
  return t('earned')+': ✨ '+run.reward.xp+' XP · 👑 '+run.reward.crowns+
    (run.reward.shards?' · 💎 '+run.reward.shards:'');
 }
 if(run.reward.reason==='daily_limit'||run.reward.reason==='duplicate_daily')return t('cap');
 if(run.reward.reason==='not_activated')return t('notEnabled');
 return t('noReward');
}
function renderGame(){
 if(!playing||!run)return;
 hide('generalTopShare',!run.challenge_id);
 $('generalStage').textContent=t('question')+' '+Math.min(run.stage+1,run.total)+' / '+run.total;
 $('generalScore').textContent=t('points')+': '+run.score;
 $('generalProgressFill').style.width=(100*Math.min(run.total,run.stage)/Math.max(1,run.total))+'%';
 $('generalProgressTrack').setAttribute('aria-valuenow',String(run.stage));
 hide('generalRetry',!pending);
 hide('generalNext',!awaitNext);
 hide('generalQuestionArea',run.finished);
 hide('generalFinal',!run.finished);
 if(run.finished){
  $('generalFinalTitle').textContent=t('finished');
  $('generalFinalScore').textContent=t('result')+': '+run.score+' / '+(run.total*10)+' '+t('score');
  $('generalReward').textContent=rewardText();
  if(run.challenge_id){
   challengeId=run.challenge_id;
   $('generalFinalMatch').classList.remove('hidden');
   $('generalFinalMatch').textContent=t('waiting');
   void pollChallenge(true);
  }else hide('generalFinalMatch',true);
  return;
 }
 const q=feedback&&awaitNext?lastQuestion:run.question;
 if(!q){status(t('invalid'),true);return;}
 $('generalPrompt').textContent=q['prompt_'+lang]||t('loading');
 $('generalVisual').textContent=String(q.visual||'🎬');
 $('generalClue').textContent=q['clue_'+lang]||'';
 $('generalMediaType').textContent=({
  geography:lang==='en'?'🗺️ GEOGRAPHY':'🗺️ ZEMĚPIS',
  history:lang==='en'?'🏛️ HISTORY':'🏛️ HISTORIE',
  science:lang==='en'?'🔬 SCIENCE':'🔬 VĚDA',
  technology:lang==='en'?'💻 TECHNOLOGY':'💻 TECHNOLOGIE'
 })[q.media_type]||'🌍';
 sourceLink(q);
 const grid=$('generalOptions');grid.replaceChildren();
 const opts=Array.isArray(q.options)?q.options:[];
 opts.forEach((option,index)=>{
  const button=make('button','general-option');
  button.type='button';
  button.append(make('b','general-letter','ABCD'[index]||'?'),
    make('span','',option?.[lang]||'—'));
  button.disabled=locked||!!pending||awaitNext;
  if(awaitNext&&feedback){
    button.classList.toggle('was-correct',index===feedback.correctIndex);
    button.classList.toggle('was-wrong',index===feedback.picked&&!feedback.ok);
  }
  if(!button.disabled)button.addEventListener('click',()=>void answer(index));
  grid.append(button);
 });
 hide('generalFeedback',!feedback);
 if(feedback){
  const opts=Array.isArray(lastQuestion?.options)?lastQuestion.options:[];
  const right=opts[feedback.correctIndex]?.[lang]||'';
  $('generalFeedback').textContent=t(feedback.ok?'correct':'wrong')+
   (feedback.ok?'':' '+t('right')+' '+right);
  $('generalFeedback').classList.toggle('good',feedback.ok);
  $('generalFeedback').classList.toggle('bad',!feedback.ok);
 }
 $('generalNext').disabled=locked||!!pending;
}
async function refreshRuns(){
 if(!uid||!api)return;
 const current=uid,seq=++serial;
 try{
  const {data,error}=await engine.rpc(api,'general','my_runs');
  if(error||data?.ok!==true||!Array.isArray(data.runs))throw error||Error('bad_runs');
  if(uid!==current||seq!==serial)return;
  runs=data.runs;updateSaved();
 }catch(err){console.warn('Quizoria general saved runs unavailable',err);}
}
async function begin(modeName){
 if(!uid||!api){status(t('signedOut'),true);return;}
 if(locked)return;
 locked=true;status(t('loading'));updateSaved();
 if(!beginPending||beginPending.type!=='begin'||beginPending.mode!==modeName)
  beginPending={type:'begin',mode:modeName,operation:crypto.randomUUID()};
 try{
  const {data,error}=await engine.rpc(api,'general','begin',{
    p_mode:modeName,p_operation:beginPending.operation
  });
  if(error||data?.ok!==true||!data.has_run)throw error||Error('begin_failed');
  beginPending=null;
  if(pending?.p_run_id!==data.run_id)pending=null;
  run=data;mode=modeName;feedback=null;awaitNext=false;status(t('save'));
  showGame();
  void refreshRuns();
 }catch(err){status(t('loadError')+' '+(err?.message||''),true);}
 finally{locked=false;if(playing)renderGame();updateSaved();}
}
async function resume(id){
 if(locked||!uid||!api||!uuid.test(String(id||'')))return;
 locked=true;status(t('loading'));
 try{
  const {data,error}=await engine.rpc(api,'general','resume',{p_run_id:id});
  if(error||data?.ok!==true||!data.has_run)throw error||Error('resume_failed');
  if(pending?.p_run_id!==data.run_id)pending=null;
  run=data;mode=data.mode;feedback=null;awaitNext=false;
  showGame();status(t('save'));
 }catch(err){status(t('loadError')+' '+(err?.message||''),true);}
 finally{locked=false;if(playing)renderGame();}
}
async function answer(index,retry=false){
 if(!run||locked||run.finished||!uid||!api)return;
 if(!retry&&pending)return;
 if(!retry){
  lastQuestion=run.question;
  pending={p_run_id:run.run_id,p_event_id:crypto.randomUUID(),p_choice:index};
 }
 if(!pending)return;
 locked=true;status(t('loading'));
 const request={...pending};
 const previous=lastQuestion||run.question;
 renderGame();
 try{
  const {data,error}=await engine.rpc(api,'general','answer',request);
  if(error||data?.ok!==true||data.answered!==true)throw error||Error('invalid_reply');
  pending=null;
  run=data;feedback={ok:data.was_correct===true,correctIndex:data.correct_option,picked:request.p_choice};
  lastQuestion=previous;awaitNext=!data.finished;
  status(data.finished?'':t('save'));
  if(data.finished){void refreshRuns();void window.QUIZORIA_PROGRESS?.refresh?.();}
  try{navigator.vibrate?.(data.was_correct?[28]:[60,35,60]);}catch(_){}
 }catch(err){status(t('loadError')+' '+(err?.message||''),true);}
 finally{locked=false;renderGame();}
}
function next(){
 if(!awaitNext||pending||locked)return;
 awaitNext=false;feedback=null;lastQuestion=null;renderGame();
}
function inviteUrl(id){
 const url=new URL(window.location.href);
 url.searchParams.delete('challenge');
 url.searchParams.delete('friend_challenge');
 url.searchParams.delete('view');url.searchParams.delete('resume');
 url.searchParams.set('general_challenge',id);
 return url.toString();
}
function showInvite(id){
 challengeId=id;
 const value=inviteUrl(id);
 $('generalInviteLink').value=value;
 hide('generalInviteDisplay',false);
 status(t('shareReady'));
}
async function createChallenge(){
 if(locked||!uid||!api)return;
 locked=true;status(t('loading'));
 if(!beginPending||beginPending.type!=='create')
   beginPending={type:'create',operation:crypto.randomUUID()};
 try{
  const {data,error}=await engine.rpc(api,'general','challenge_create',{
    p_operation:beginPending.operation
  });
  if(error||data?.ok!==true||!uuid.test(data.challenge_id))throw error||Error('challenge_create');
  beginPending=null;challengeId=data.challenge_id;showInvite(challengeId);
  run=data;mode='friend';feedback=null;awaitNext=false;showGame();
  void refreshRuns();
 }catch(err){status(t('loadError')+' '+(err?.message||''),true);}
 finally{locked=false;if(playing)renderGame();}
}
function parseInvite(str){
 let value=String(str||'').trim();
 try{value=new URL(value).searchParams.get('general_challenge')||value;}catch(_){}
 return uuid.test(value)?value:null;
}
async function joinChallenge(value){
 if(locked||!uid||!api)return;
 const id=parseInvite(value);
 if(!id){status(t('emptyInvite'),true);return;}
 locked=true;status(t('loading'));
 try{
  const {data,error}=await engine.rpc(api,'general','challenge_join',{
    p_challenge_id:id,p_operation:crypto.randomUUID()
  });
  if(error||data?.ok!==true||!data.has_run)throw error||Error('challenge_join');
  challengeId=id;run=data;mode='friend';
  beginPending=null;feedback=null;awaitNext=false;
  showInvite(id);
  showGame();status(t('joined'));
  void refreshRuns();
 }catch(err){status(t('loadError')+' '+(err?.message||''),true);}
 finally{locked=false;if(playing)renderGame();}
}
async function pollChallenge(silent=false){
 if(!api||!uid||!uuid.test(String(challengeId||'')))return;
 try{
  const {data,error}=await engine.rpc(api,'general','challenge_status',{
    p_challenge_id:challengeId
  });
  if(error||data?.ok!==true)throw error||Error('match_status');
  challenge=data;
  let message;
  if(!data.joined)message=t('needsFriend');
  else if(!data.both_done)message=t('waiting');
  else{
    const winner=data.winner==='creator'?'win':data.winner==='challenger'?'lose':'tie';
    message=t(winner)+' '+t('creator')+': '+data.creator_score+
      ' · '+t('challenger')+': '+data.challenger_score;
  }
  $('generalMatchStatus').textContent=message;
  if(run?.finished&&run?.challenge_id)$('generalFinalMatch').textContent=message;
  if(!silent)status(message);
 }catch(err){if(!silent)status(t('loadError')+' '+(err?.message||''),true);}
}
function localize(){
 const mapping={
  generalTitle:'title',generalSubtitle:'sub',generalBack:'back',generalIntro:'intro',
  generalCategory:'category',generalSavedTitle:'saves',generalChallengeTitle:'challenge',
  generalChallengeDesc:'challengeDesc',generalChallengeCreate:'create',
  generalChallengeJoin:'join',generalInviteCopy:'copy',generalMatchCheck:'check',
  generalNext:'next',generalRetry:'retry',generalAnother:'playAgain',
  generalImageOpen:'linkImage',generalImageError:'imageError',
  generalDailyNote:'dailyNote',generalLegal:'mime',
  generalTopShareText:'sharePlaying',generalTopShareCopy:'shareCopy'
 };
 for(const [id,key] of Object.entries(mapping))if($(id))$(id).textContent=t(key);
 modes.forEach((m,i)=>{
  $('generalMode_'+m).textContent=t('modes')[i];
  $('generalModeSub_'+m).textContent=t('subs')[i];
 });
 updateSaved();if(playing)renderGame();
}
root.querySelectorAll('[data-general-mode]').forEach(button=>{
 button.addEventListener('click',()=>void begin(button.dataset.generalMode));
});
$('generalBack').addEventListener('click',close);
$('generalNext').addEventListener('click',next);
$('generalRetry').addEventListener('click',()=>void answer(0,true));
$('generalAnother').addEventListener('click',showLobby);
$('generalChallengeCreate').addEventListener('click',()=>void createChallenge());
$('generalChallengeJoin').addEventListener('click',()=>void joinChallenge($('generalInviteInput').value));
$('generalMatchCheck').addEventListener('click',()=>void pollChallenge());
$('generalInviteCopy').addEventListener('click',async()=>{
 const url=$('generalInviteLink').value;
 try{await navigator.clipboard.writeText(url);status(t('copyDone'));}
 catch(_){$('generalInviteLink').focus();$('generalInviteLink').select();}
});
$('generalTopShareCopy')?.addEventListener('click',async()=>{
 const id=run?.challenge_id||challengeId;
 if(!id)return;
 const url=inviteUrl(id);
 try{await navigator.clipboard.writeText(url);status(t('copyDone'));}
 catch(_){
   playing=false;showLobby();showInvite(id);
   $('generalInviteLink')?.focus?.();$('generalInviteLink')?.select?.();
 }
});
window.QUIZORIA_GENERAL=Object.freeze({
 connect(client,user){
  const next=user?.id||null;
  if(uid===next&&api===client)return;
  uid=next;api=client;run=null;pending=null;runs=[];feedback=null;
  locked=false;playing=false;opened=false;serial++;autoHandled=null;
  root.classList.add('hidden');
  if(uid)void refreshRuns();
 },
 afterAuth(){
  if(!uid)return;
  const params=new URL(window.location.href).searchParams;
  const invite=parseInvite(params.get('general_challenge'));
  if(invite&&autoHandled!==uid+':'+invite){
    autoHandled=uid+':'+invite;open();void joinChallenge(invite);
  }else if(params.get('view')==='general')open();
 },
 openCategory:open,
 setLocale(next){lang=next==='en'?'en':'cs';localize();},
 isOpen(){return opened;}
});
localize();
})();