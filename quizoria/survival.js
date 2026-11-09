/* Quizoria Survival 2.1: server-owned endless-style gauntlet.
 * Three lives, 60 questions, progressive difficulty, resumable per category.
 * Never reads question answers, calculates rewards or writes saves locally. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const root=$('quizoriaSurvivalPanel');
if(!root)return;
const config=[
 {id:'video-games',icon:'🎮',cs:'Videohry',en:'Video Games'},
 {id:'memes',icon:'😂',cs:'Memy a internet',en:'Memes & Internet'},
 {id:'movies',icon:'🎬',cs:'Filmy a seriály',en:'Movies & Series'},
 {id:'music',icon:'🎵',cs:'Hudba',en:'Music'},
 {id:'general',icon:'🌍',cs:'Všeobecné znalosti',en:'General Knowledge'},
 {id:'mix',icon:'🎲',cs:'Všechna témata',en:'All Topics'}
];
const allowed=new Set(config.map(c=>c.id));
const dictionary={
 cs:{
  back:'← Zpět do Quizorie',title:'❤️ Přežití',intro:'3 životy, 60 otázek a stále těžší otázky. Po každé odpovědi se postup bezpečně uloží na server.',
  category:'🎮 Vyber tematický svět',bestStage:'🧭 Rekord otázek',bestScore:'🏆 Nejvíc bodů',bestStreak:'🔥 Nejdelší série',
  start:'▶ Spustit novou partii',resume:'⏯ Pokračovat v rozehrané',
  rules:'❤️ 3 životy · 🟢 1–20 snadné · 🟠 21–40 střední · 🔥 41–60 těžké. Třetí chyba končí hru. Odměny se ověřují až při skončení.',
  leaderboard:'🏆 Žebříček hráčů',history:'💾 Moje partie',question:'Otázka',hearts:'Životy',score:'Body',streak:'Série',
  correct:'✅ Správná odpověď!',wrong:'❌ Špatná odpověď.',right:'Správně bylo:',
  next:'Další otázka →',retry:'↻ Zkusit znovu',
  finished:'💔 Konec Přežití!',won:'🏆 Přežil jsi všech 60 otázek!',expired:'⌛ Tato partie vypršela',
  final:'Výsledek bezpečně zaznamenal server.',playAgain:'🎮 Zpět k výběru',
  loading:'☁️ Načítám ověřenou partii…',saved:'💾 Postup se automaticky ukládá na účet.',
  error:'⚠️ Nepodařilo se spojit se serverem. Opakuj poslední akci.',
  signIn:'🔐 Nejdřív se přihlas do FOXEY Arcade.',
  active:'Rozehráno',completed:'Dokončeno',noHistory:'Zatím tu nemáš žádnou partii.',
  emptyBoard:'Žebříček čeká na první dokončený pokus.',
  noReward:'Tentokrát žádná odměna do společné peněženky.',
  rewarded:'🎁 Odměna připsána:',rewardLimit:'🎁 Denní nebo hodinový limit odměn. Rekord se započítá.',
  notActive:'🎁 Odměny nejsou pro účet aktivované. Rekord se započítá.',
  noThreshold:'🎁 Pro odměnu je potřeba alespoň 5 zodpovězených otázek a 3 správné odpovědi.',
  tryLater:'Po chvíli to zkus znovu.',scoreUnits:'bodů',
  easy:'🟢 Snadné',medium:'🟠 Střední',hard:'🔥 Těžké',
  source:'Zdroj obrázku',waiting:'☁️ Načítám hráče a rekordy…',
  tryResume:'▶ Pokračovat',openFinished:'🏆 Výsledek',
  invalid:'⚠️ Server poslal neplatnou odpověď.',level:'Obtížnost',
  modeBusy:'Právě probíhá jiná herní akce.',loginFirst:'Nejdřív se přihlas.'
 },
 en:{
  back:'← Back to Quizoria',title:'❤️ Survival',intro:'3 lives, 60 questions, increasing difficulty. Each answer is safely saved on the server.',
  category:'🎮 Choose your quiz world',bestStage:'🧭 Best stage',bestScore:'🏆 Highest score',bestStreak:'🔥 Longest streak',
  start:'▶ Start a new run',resume:'⏯ Resume saved run',
  rules:'❤️ 3 lives · 🟢 1–20 easy · 🟠 21–40 medium · 🔥 41–60 hard. Your third mistake ends the run. Rewards are verified at the end.',
  leaderboard:'🏆 Leaderboard',history:'💾 My saved runs',question:'Question',hearts:'Lives',score:'Points',streak:'Streak',
  correct:'✅ Correct answer!',wrong:'❌ Wrong answer.',right:'Correct answer:',
  next:'Next question →',retry:'↻ Try again',
  finished:'💔 Survival over!',won:'🏆 You survived all 60 questions!',expired:'⌛ This run expired',
  final:'Your result was saved and verified by the server.',playAgain:'🎮 Back to categories',
  loading:'☁️ Loading verified game…',saved:'💾 Your progress is automatically saved to your account.',
  error:'⚠️ Could not contact the server. Retry the last action.',
  signIn:'🔐 Sign in to FOXEY Arcade first.',
  active:'In progress',completed:'Finished',noHistory:'No saved runs yet.',
  emptyBoard:'The leaderboard is waiting for its first completed run.',
  noReward:'No additional wallet reward this time.',
  rewarded:'🎁 Reward credited:',rewardLimit:'🎁 Hourly or daily reward cap reached. Your record still counts.',
  notActive:'🎁 Rewards are not activated for this account. Your record still counts.',
  noThreshold:'🎁 Answer at least five questions, three correctly, to earn a reward.',
  tryLater:'Please retry shortly.',scoreUnits:'points',
  easy:'🟢 Easy',medium:'🟠 Medium',hard:'🔥 Hard',
  source:'Image source',waiting:'☁️ Loading saved records…',
  tryResume:'▶ Resume',openFinished:'🏆 Result',
  invalid:'⚠️ The server sent an invalid response.',level:'Difficulty',
  modeBusy:'Another action is in progress.',loginFirst:'Sign in first.'
 }
};
let lang='cs',api=null,uid=null,selected='mix',opened=false;
let lobby=null,run=null,locked=false,lobbySeq=0,actionSeq=0;
let feedback=null,shownQuestion=null,advance=false,pending=null,beginOperation=null;
const t=key=>dictionary[lang][key]||key;
const fmt=n=>new Intl.NumberFormat(lang==='cs'?'cs-CZ':'en-US').format(Number(n)||0);
const safe=n=>Number.isSafeInteger(n)&&n>=0?n:0;
const hide=(id,value)=>$(id)?.classList.toggle('hidden',!!value);
const make=(tag,cls,text)=>{
 const el=document.createElement(tag);if(cls)el.className=cls;
 if(text!==undefined)el.textContent=text;
 return el;
};
function status(message,error=false){
 const el=$('survivalStatus');if(!el)return;
 el.textContent=message||'';
 el.classList.toggle('error',!!error);
}
function selectedName(id){
 const c=config.find(item=>item.id===id);
 return(c?.icon||'🎮')+' '+(c?.[lang]||id);
}
function difficulty(stage){
 return stage<20?t('easy'):stage<40?t('medium'):t('hard');
}
function isValidRun(value){
 return value?.ok===true&&value?.has_run===true&&typeof value.run_id==='string'&&
  allowed.has(value.category)&&Number.isSafeInteger(value.stage)&&
  value.stage>=0&&value.stage<=60&&Number.isSafeInteger(value.lives)&&
  value.lives>=0&&value.lives<=3&&typeof value.finished==='boolean';
}
function rewardText(){
 const reward=run?.reward;
 if(!reward)return t('noReward');
 if(reward.reason==='credited'){
  return t('rewarded')+' ✨ '+fmt(safe(reward.xp))+' XP'+
   (safe(reward.crowns)?' · 👑 '+fmt(reward.crowns):'');
 }
 if(reward.reason==='daily_limit')return t('rewardLimit');
 if(reward.reason==='not_activated')return t('notActive');
 if(reward.reason==='below_threshold')return t('noThreshold');
 return t('noReward');
}
function renderCategoryPicker(){
 const list=$('survivalCategories');list.replaceChildren();
 for(const c of config){
  const button=make('button','survival-category'+(selected===c.id?' is-active':''),selectedName(c.id));
  button.type='button';
  button.dataset.survivalCategory=c.id;
  button.setAttribute('aria-pressed',String(selected===c.id));
  button.disabled=locked;
  list.append(button);
 }
}
function renderLobby(){
 if(!opened)return;
 renderCategoryPicker();
 const best=lobby?.best;
 $('survivalBestStage').textContent=best?fmt(safe(best.stage))+' / 60':'—';
 $('survivalBestScore').textContent=best?fmt(safe(best.score)):'—';
 $('survivalBestStreak').textContent=best?fmt(safe(best.streak)):'—';
 const active=lobby?.active;
 hide('survivalResume',!isValidRun(active)||active.expired||active.finished);
 $('survivalStart').disabled=locked||!uid;
 $('survivalResume').disabled=locked||!uid;
 const board=$('survivalLeaderboard');board.replaceChildren();
 const players=Array.isArray(lobby?.leaderboard)?lobby.leaderboard:[];
 if(!players.length)board.append(make('li','survival-list-empty',t('emptyBoard')));
 else for(const [i,entry] of players.entries()){
  const item=make('li','survival-board-item');
  item.append(make('b','',String(i+1)+'.'),
   make('span','',String(entry.nickname||'Hráč').slice(0,60)),
   make('strong','',fmt(safe(entry.score))+' · '+fmt(safe(entry.stage))+'/60'));
  board.append(item);
 }
 const history=$('survivalHistory');history.replaceChildren();
 const runs=Array.isArray(lobby?.runs)?lobby.runs:[];
 if(!runs.length)history.append(make('p','survival-list-empty',t('noHistory')));
 else for(const item of runs){
  const row=make('div','survival-saved-item');
  const isActive=!item.finished&&new Date(item.expires_at)>new Date();
  row.append(make('strong','',isActive?t('active'):t('completed')),
    make('span','',fmt(safe(item.stage))+'/60 · '+fmt(safe(item.score))+' '+t('scoreUnits')));
  const button=make('button','secondary',isActive?t('tryResume'):t('openFinished'));
  button.type='button';button.dataset.survivalRun=String(item.run_id||'');
  button.disabled=locked;row.append(button);history.append(row);
 }
}
function renderVisual(q){
 const element=$('survivalVisual'),source=$('survivalSource');
 element.replaceChildren();hide('survivalVisual',true);hide('survivalSource',true);
 const value=String(q?.visual||'');
 const commons=value.startsWith('https://commons.wikimedia.org/wiki/Special:FilePath/');
 if(commons){
  const img=make('img','survival-image');
  img.alt=q['prompt_'+lang]||t('question');
  img.loading='eager';img.referrerPolicy='no-referrer';
  img.src=value;
  img.addEventListener('error',()=>{img.classList.add('hidden');});
  element.append(img);hide('survivalVisual',false);
 }else if(value&&!value.startsWith('https://')&&!value.startsWith('http://')){
  element.append(make('span','survival-emoji',value.slice(0,100)));
  hide('survivalVisual',false);
 }
 const url=String(q?.source_url||'');
 if(url.startsWith('https://commons.wikimedia.org/')){
  source.href=url;source.textContent=t('source')+
   (q.author?' · '+String(q.author).slice(0,50):'');
  hide('survivalSource',false);
 }
}
function renderQuestion(){
 if(!run||run.finished||run.expired)return;
 const q=advance&&shownQuestion?shownQuestion:run.question;
 if(!q||!Array.isArray(q.options)||q.options.length!==4){
  status(t('invalid'),true);return;
 }
 const currentStage=advance?Math.max(0,run.stage-1):run.stage;
 $('survivalCategoryHint').textContent=selectedName(q.category||selected);
 $('survivalDifficulty').textContent=difficulty(currentStage);
 $('survivalPrompt').textContent=String(q['prompt_'+lang]||q.prompt_cs||'');
 $('survivalClue').textContent=String(q['clue_'+lang]||'');
 renderVisual(q);
 const options=$('survivalOptions');options.replaceChildren();
 for(const [index,answer] of q.options.entries()){
  const button=make('button','survival-option');
  button.type='button';button.disabled=locked||advance||!!pending;
  button.dataset.survivalChoice=String(index);
  button.append(make('b','',String.fromCharCode(65+index)),
    make('span','',String(answer?.[lang]||answer?.cs||'—')));
  if(advance&&feedback){
   button.classList.toggle('is-correct',index===feedback.correctIndex);
   button.classList.toggle('is-incorrect',!feedback.ok&&index===feedback.choice);
  }
  options.append(button);
 }
 hide('survivalFeedback',!feedback);
 if(feedback){
  const answer=shownQuestion?.options?.[feedback.correctIndex];
  $('survivalFeedback').textContent=t(feedback.ok?'correct':'wrong')+
    (!feedback.ok?' '+t('right')+' '+String(answer?.[lang]||answer?.cs||''):'');
  $('survivalFeedback').classList.toggle('good',feedback.ok);
  $('survivalFeedback').classList.toggle('bad',!feedback.ok);
 }
 hide('survivalNext',!advance);
 hide('survivalRetry',!pending);
 $('survivalNext').disabled=locked;
 $('survivalRetry').disabled=locked;
}
function renderGame(){
 if(!opened||!run)return;
 hide('survivalLobby',true);hide('survivalPlay',false);
 const finished=run.finished||run.expired;
 hide('survivalQuestionArea',finished);hide('survivalFinal',!finished);
 const stage=safe(run.stage);
 $('survivalStage').textContent=fmt(Math.min(stage+(finished?0:1),60))+' / 60';
 $('survivalScore').textContent=fmt(safe(run.score));
 $('survivalStreak').textContent=fmt(safe(run.streak));
 $('survivalHearts').textContent='❤️'.repeat(Math.max(0,Math.min(3,run.lives)))+
    '🖤'.repeat(3-Math.max(0,Math.min(3,run.lives)));
 $('survivalProgressFill').style.width=(100*stage/60)+'%';
 $('survivalProgressTrack').setAttribute('aria-valuenow',String(stage));
 if(finished){
  const won=run.finished&&stage===60&&run.lives>0;
  $('survivalFinalIcon').textContent=won?'🏆':run.expired?'⌛':'💔';
  $('survivalFinalTitle').textContent=t(won?'won':run.expired?'expired':'finished');
  $('survivalFinalSummary').textContent=t('final')+' '+fmt(stage)+'/60 · '+
     fmt(safe(run.correct))+' '+t('correct').replace(/[✅!]/g,'').trim()+' · '+
     fmt(safe(run.score))+' '+t('scoreUnits');
  $('survivalReward').textContent=rewardText();
  return;
 }
 renderQuestion();
}
function render(){
 if(!opened)return;
 hide('survivalLobby',!!run);hide('survivalPlay',!run);
 if(run)renderGame();else renderLobby();
}
async function refreshLobby(silent=false){
 if(!uid||!api)return;
 const mine=uid,category=selected,seq=++lobbySeq;
 if(!silent)status(t('waiting'));
 try{
  const {data,error}=await api.rpc('quizoria_survival_lobby',{p_category:category});
  if(error||data?.ok!==true||data.category!==category)throw error||Error('bad_lobby');
  if(uid!==mine||selected!==category||seq!==lobbySeq)return;
  lobby=data;render();
  if(!silent)status(t('saved'));
 }catch(err){
  if(uid===mine&&selected===category&&seq===lobbySeq)
   status(t('error')+' ('+String(err?.message||'network')+')',true);
 }
}
function selectCategory(category){
 if(locked||run||!allowed.has(category))return;
 selected=category;lobby=null;beginOperation=null;render();
 void refreshLobby();
}
async function begin(){
 if(!uid||!api||locked)return;
 locked=true;render();
 const mine=uid,cat=selected,serial=++actionSeq;
 if(!beginOperation)beginOperation=crypto.randomUUID();
 const operation=beginOperation;
 status(t('loading'));
 try{
  const {data,error}=await api.rpc('quizoria_survival_begin',{
    p_category:cat,p_operation:operation
  });
  if(error||!isValidRun(data)||data.category!==cat)throw error||Error('invalid_run');
  if(uid!==mine||serial!==actionSeq)return;
  run=data;beginOperation=null;feedback=null;shownQuestion=null;advance=false;
  status(t('saved'));
 }catch(err){
  if(uid===mine&&serial===actionSeq)
   status(t('error')+' ('+String(err?.message||'network')+')',true);
 }finally{locked=false;render();}
}
async function resume(id){
 if(!uid||!api||locked||!id)return;
 locked=true;render();const mine=uid,serial=++actionSeq;
 status(t('loading'));
 try{
  const {data,error}=await api.rpc('quizoria_survival_resume',{p_run_id:id});
  if(error||!isValidRun(data)||data.category!==selected)throw error||Error('invalid_run');
  if(uid!==mine||serial!==actionSeq)return;
  run=data;feedback=null;shownQuestion=null;advance=false;pending=null;
  status(t('saved'));
 }catch(err){
  if(uid===mine&&serial===actionSeq)
   status(t('error')+' ('+String(err?.message||'network')+')',true);
 }finally{locked=false;render();}
}
async function answer(choice,retry=false){
 if(!run||!uid||!api||locked||advance||run.finished||run.expired)return;
 if(!Number.isSafeInteger(choice)||choice<0||choice>3)return;
 if(pending&&!retry)return;
 const mine=uid,runId=run.run_id,serial=++actionSeq;
 if(!retry)pending={choice,event:crypto.randomUUID(),question:run.question};
 locked=true;render();
 status(t('loading'));
 try{
  const {data,error}=await api.rpc('quizoria_survival_answer',{
    p_run_id:runId,p_event_id:pending.event,p_choice:pending.choice
  });
  if(error||!isValidRun(data)||typeof data.was_correct!=='boolean'||
     !Number.isSafeInteger(data.correct_option))
   throw error||Error('invalid_answer');
  if(uid!==mine||serial!==actionSeq)return;
  shownQuestion=pending.question;
  feedback={ok:data.was_correct,correctIndex:data.correct_option,choice:pending.choice};
  run=data;pending=null;advance=!run.finished&&!run.expired;
  status(run.finished?t('final'):t('saved'));
  try{navigator.vibrate?.(data.was_correct?[25]:[55,30,55]);}catch(_){}
  if(run.finished){
   void refreshLobby(true);
   if(run.reward?.reason==='credited'){
    try{
     if(window.parent&&window.parent!==window)
      window.parent.postMessage({type:'foxey-arcade:rewards-credited'},window.location.origin);
    }catch(_){}
   }
  }
 }catch(err){
  if(uid===mine&&serial===actionSeq)
   status(t('error')+' ('+String(err?.message||'network')+')',true);
 }finally{locked=false;render();}
}
function next(){
 if(!advance||locked||!run)return;
 advance=false;feedback=null;shownQuestion=null;render();
}
function close(){
 if(locked)return;
 opened=false;run=null;pending=null;feedback=null;advance=false;shownQuestion=null;
 root.classList.add('hidden');document.body.classList.remove('quiz-survival-active');
 $('modePanel')?.classList.remove('hidden');
 $('quizoriaSurvivalLaunch')?.focus?.();
}
function open(){
 if(!uid){status(t('signIn'),true);return;}
 if(opened)return;
 // The menu owns the active source of game navigation.
 if($('modePanel')?.classList.contains('hidden'))return;
 opened=true;run=null;pending=null;feedback=null;advance=false;shownQuestion=null;
 root.classList.remove('hidden');$('modePanel')?.classList.add('hidden');
 document.body.classList.remove('quiz-playing','quiz-finished');
 document.body.classList.add('quiz-survival-active');
 render();void refreshLobby();
 const minimal=document.documentElement.classList.contains('arcade-motion-minimal')||
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 root.scrollIntoView?.({behavior:minimal?'auto':'smooth',block:'start'});
}
function localize(){
 $('quizoriaSurvivalTitle').textContent=t('title');
 $('quizoriaSurvivalSubtitle').textContent=lang==='en'
  ?'3 lives · 60 questions · increasing difficulty · leaderboards'
  :'3 životy · 60 otázek · rostoucí obtížnost · rekordy';
 $('quizoriaSurvivalLaunch').textContent=lang==='en'?'❤️ Play Survival':'❤️ Spustit Přežití';
 $('survivalBack').textContent=t('back');
 $('survivalTitle').textContent=t('title');
 $('survivalIntro').textContent=t('intro');
 $('survivalCategoryTitle').textContent=t('category');
 for(const [id,key] of Object.entries({
  survivalBestStageLabel:'bestStage',survivalBestScoreLabel:'bestScore',
  survivalBestStreakLabel:'bestStreak',survivalStart:'start',survivalResume:'resume',
  survivalRules:'rules',survivalLeaderboardTitle:'leaderboard',
  survivalHistoryTitle:'history',survivalStageLabel:'question',
  survivalHeartsLabel:'hearts',survivalScoreLabel:'score',
  survivalStreakLabel:'streak',survivalRetry:'retry',
  survivalNext:'next',survivalPlayAgain:'playAgain'}))$(id).textContent=t(key);
 render();
}
$('survivalBack')?.addEventListener('click',close);
$('survivalCategories')?.addEventListener('click',event=>{
 const item=event.target.closest?.('button[data-survival-category]');
 if(item)selectCategory(item.dataset.survivalCategory);
});
$('survivalStart')?.addEventListener('click',()=>void begin());
$('survivalResume')?.addEventListener('click',()=>{
 if(lobby?.active?.run_id)void resume(lobby.active.run_id);
});
$('survivalHistory')?.addEventListener('click',event=>{
 const button=event.target.closest?.('button[data-survival-run]');
 if(button)void resume(button.dataset.survivalRun);
});
$('survivalOptions')?.addEventListener('click',event=>{
 const button=event.target.closest?.('button[data-survival-choice]');
 if(button)void answer(Number(button.dataset.survivalChoice));
});
$('survivalRetry')?.addEventListener('click',()=>{
 if(pending)void answer(pending.choice,true);
});
$('survivalNext')?.addEventListener('click',next);
$('survivalPlayAgain')?.addEventListener('click',()=>{
 run=null;pending=null;feedback=null;advance=false;shownQuestion=null;
 render();void refreshLobby();
});
// The shared Arcade motion preference also applies to Quizoria standalone.
try{
 if(localStorage.getItem('foxey.arcade.motion.v1')==='reduce')
  document.documentElement.classList.add('arcade-motion-minimal');
}catch(_){}
document.addEventListener('keydown',event=>{
 if(!opened||!run||run.finished||run.expired||locked||advance||pending)return;
 if(document.activeElement?.matches?.('input,textarea,[contenteditable="true"]'))return;
 const value=Number(event.key);
 if(Number.isInteger(value)&&value>=1&&value<=4){
  event.preventDefault();void answer(value-1);
 }
});
window.QUIZORIA_SURVIVAL=Object.freeze({
 connect(client,user){
  const nextUid=user?.id||null;
  if(uid===nextUid&&api===client)return;
  uid=nextUid;api=client;run=null;lobby=null;pending=null;
  locked=false;opened=false;feedback=null;advance=false;shownQuestion=null;
  beginOperation=null;lobbySeq++;actionSeq++;
  root.classList.add('hidden');
  document.body.classList.remove('quiz-survival-active');
 },
 afterAuth(){
  if(uid&&new URL(window.location.href).searchParams.get('view')==='survival')open();
 },
 setLocale(next){lang=next==='en'?'en':'cs';localize();},
 open,isOpen(){return opened;}
});
localize();
})();