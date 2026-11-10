/* Quizoria Endless 2.2 — secured independent mode.
 * Every answer, rating, score and reward is returned by server RPC.
 * No local saves, no answer keys and no payment logic on client. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const panel=$('quizoriaEndlessPanel');
if(!panel)return;
const CATEGORIES=[
 {id:'video-games',icon:'🎮',cs:'Videohry',en:'Video Games'},
 {id:'memes',icon:'😂',cs:'Memy',en:'Memes'},
 {id:'movies',icon:'🎬',cs:'Filmy a seriály',en:'Movies & Series'},
 {id:'music',icon:'🎵',cs:'Hudba',en:'Music'},
 {id:'general',icon:'🌍',cs:'Všeobecné znalosti',en:'General Knowledge'},
 {id:'mix',icon:'🎲',cs:'Všechna témata',en:'All Topics'}
];
const allowed=new Set(CATEGORIES.map(x=>x.id));
const texts={
cs:{
 modeTitle:'Nekonečný kvíz · Endless',modeSub:'Bez životů · adaptivní obtížnost · série · ukládání',modeStart:'♾️ Spustit nekonečný kvíz',
 back:'← Zpět do Quizorie',title:'Nekonečný kvíz',
 intro:'Hraj bez životů a pevného konce. Obtížnost se přizpůsobí odpovědím a každý krok se automaticky uloží.',
 category:'🎮 Vyber si kategorii',bestStage:'🧠 Nejvíc otázek',bestScore:'🏆 Rekord bodů',bestStreak:'🔥 Nejdelší série',
 start:'♾️ Nová partie od začátku',resume:'▶️ Pokračovat v rozehrané',
 activeHint:'💾 Nová partie nesmaže rozehranou. Starou můžeš kdykoliv otevřít v Moje partie.',
 rules:'🟢 / 🟠 / 🔥 Obtížnost se automaticky mění. Za sérii získáváš více bodů. Uložení je po každé odpovědi. Pokud partii dobrovolně ukončíš po alespoň 20 otázkách a 12 správných, můžeš získat 15 XP; od 50 otázek a 30 správných až 30 XP + 1 korunku. Platí serverové limity.',
 leaderboard:'🏆 Žebříček dokončených partií',history:'💾 Moje partie',stage:'Otázka',score:'Body',streak:'🔥 Série / násobič',accuracy:'Úspěšnost',
 rating:'Adaptivní obtížnost',easy:'🟢 Snadné',medium:'🟠 Střední',hard:'🔥 Těžké',
 retry:'↻ Opakovat požadavek',next:'Další otázka →',correct:'✅ Správně!',wrong:'❌ Špatně.',correctWas:'Správná odpověď:',
 saved:'💾 Odpověď uložena na server.',loading:'☁️ Načítám data ze serveru…',bad:'⚠️ Server vrátil neplatnou odpověď.',
 error:'⚠️ Nepodařilo se spojit se serverem. Opakuj akci.',
 login:'🔐 Nejprve se přihlas.',inProgress:'Rozehráno',finished:'Dokončeno',
 noHistory:'Zatím tu nemáš žádnou partii.',noLeaders:'Zatím nikdo nedokončil partii.',
 open:'▶️ Pokračovat',result:'🏆 Výsledek',
 saveExit:'💾 Uložit a odejít',finish:'🏁 Ukončit a vyhodnotit',
 finishConfirm:'Opravdu chceš ukončit tuto partii? Její výsledek se uloží do žebříčku, ale nebude v ní už možné pokračovat.',
 finalTitle:'🏆 Partie dokončena!',finalText:'Ověřený výsledek je uložen na serveru.',
 again:'♾️ Zpět k výběru kategorií',
 noReward:'Za tuto partii se nepřipsala žádná odměna.',
 credited:'🎁 Připsáno:',limit:'🎁 Limit odměn byl dosažen; rekord zůstává uložený.',
 noActivation:'🎁 Odměny nejsou aktivované; rekord je uložený.',
 threshold:'🎁 Pro odměnu potřebuješ alespoň 20 otázek a 12 správných.',
 source:'Zdroj obrázku',unit:'bodů',answered:'odpovědí'
},
en:{
 modeTitle:'Endless Quiz',modeSub:'No lives · adaptive difficulty · streaks · cloud saves',modeStart:'♾️ Play Endless Quiz',
 back:'← Back to Quizoria',title:'Endless Quiz',
 intro:'Play without lives or a fixed ending. Difficulty adapts to your answers and every step is automatically saved.',
 category:'🎮 Choose your category',bestStage:'🧠 Most questions',bestScore:'🏆 Highest score',bestStreak:'🔥 Longest streak',
 start:'♾️ New run from question one',resume:'▶️ Resume saved run',
 activeHint:'💾 A new run will not delete the previous one. You can resume it under My saved runs.',
 rules:'🟢 / 🟠 / 🔥 Difficulty changes automatically. Correct streaks increase your points. Each answer is saved. Finish after at least 20 questions and 12 correct for up to 15 XP; after 50 questions and 30 correct, up to 30 XP + 1 crown. Server reward caps apply.',
 leaderboard:'🏆 Completed-run leaderboard',history:'💾 My saved runs',stage:'Question',score:'Score',streak:'🔥 Streak / multiplier',accuracy:'Accuracy',
 rating:'Adaptive difficulty',easy:'🟢 Easy',medium:'🟠 Medium',hard:'🔥 Hard',
 retry:'↻ Retry request',next:'Next question →',correct:'✅ Correct!',wrong:'❌ Incorrect.',correctWas:'Correct answer:',
 saved:'💾 Answer saved to the server.',loading:'☁️ Loading verified data…',bad:'⚠️ Invalid server response.',
 error:'⚠️ Could not contact the server. Retry your last action.',
 login:'🔐 Please sign in first.',inProgress:'In progress',finished:'Finished',
 noHistory:'You have no saved runs yet.',noLeaders:'No one has finished a run yet.',
 open:'▶️ Resume',result:'🏆 Results',
 saveExit:'💾 Save and leave',finish:'🏁 Finish and score',
 finishConfirm:'Finish this run? Your result will be saved to the leaderboard, but you will no longer be able to resume it.',
 finalTitle:'🏆 Run completed!',finalText:'Your verified result was saved on the server.',
 again:'♾️ Back to categories',
 noReward:'No wallet reward was earned in this run.',
 credited:'🎁 Credited:',limit:'🎁 Reward limit reached; your record still counts.',
 noActivation:'🎁 Rewards are not activated; your record still counts.',
 threshold:'🎁 Answer at least 20 questions with 12 correct to earn a reward.',
 source:'Image source',unit:'points',answered:'answers'
}
};
let lang='cs',api=null,uid=null,opened=false,selected='mix',lobby=null,run=null,busy=false;
let pending=null,feedback=null,shown=null,advance=false,operation=null,lobbySeq=0,actionSeq=0;
const t=k=>texts[lang][k]||k;
const fmt=n=>new Intl.NumberFormat(lang==='cs'?'cs-CZ':'en-US').format(Number(n)||0);
const safe=n=>Number.isSafeInteger(n)&&n>=0?n:0;
const make=(tag,cl,text)=>{
 const x=document.createElement(tag);if(cl)x.className=cl;
 if(text!==undefined)x.textContent=text;
 return x;
};
const hide=(id,yes)=>$(id)?.classList.toggle('hidden',!!yes);
function status(message,error=false){const n=$('endlessStatus');n.textContent=message||'';n.classList.toggle('error',error);}
function name(category){const q=CATEGORIES.find(c=>c.id===category);return(q?.icon||'🎲')+' '+(q?.[lang]||category);}
function level(difficulty){return t(['easy','medium','hard'].includes(difficulty)?difficulty:'easy');}
function validRun(v){return v?.ok===true&&v.has_run===true&&typeof v.run_id==='string'&&
 allowed.has(v.category)&&Number.isSafeInteger(v.stage)&&v.stage>=0&&
 Number.isSafeInteger(v.rating)&&v.rating>=0&&v.rating<=100&&
 typeof v.finished==='boolean';}
function rewardLine(){
 const r=run?.reward;
 if(!r)return t('noReward');
 if(r.reason==='credited'){
  return t('credited')+' ✨ '+fmt(safe(r.xp))+' XP'+(safe(r.crowns)?' · 👑 '+fmt(safe(r.crowns)):'');
 }
 if(r.reason==='daily_limit')return t('limit');
 if(r.reason==='not_activated')return t('noActivation');
 if(r.reason==='below_threshold')return t('threshold');
 return t('noReward');
}
function renderCategories(){
 const root=$('endlessCategories');root.replaceChildren();
 for(const category of CATEGORIES){
  const button=make('button','endless-category'+(selected===category.id?' is-active':''),name(category.id));
  button.type='button';button.disabled=busy;button.dataset.endlessCategory=category.id;
  button.setAttribute('aria-pressed',String(selected===category.id));
  root.append(button);
 }
}
function renderLobby(){
 renderCategories();
 const b=lobby?.best;
 $('endlessBestStage').textContent=b?fmt(safe(b.stage)):'—';
 $('endlessBestScore').textContent=b?fmt(safe(b.score)):'—';
 $('endlessBestStreak').textContent=b?fmt(safe(b.streak)):'—';
 const active=lobby?.active,canResume=validRun(active)&&!active.finished;
 hide('endlessResume',!canResume);hide('endlessActiveHint',!canResume);
 $('endlessStart').disabled=busy||!uid;$('endlessResume').disabled=busy||!uid;
 const leaders=$('endlessLeaderboard');leaders.replaceChildren();
 const data=Array.isArray(lobby?.leaderboard)?lobby.leaderboard:[];
 if(!data.length)leaders.append(make('li','endless-empty',t('noLeaders')));
 else for(const [idx,p] of data.entries()){
  const item=make('li','endless-leader');
  item.append(make('b','',String(idx+1)+'.'),
   make('span','',String(p.nickname||'Hráč').slice(0,60)),
   make('strong','',fmt(safe(p.score))+' · '+fmt(safe(p.stage))+' '+t('answered')));
  leaders.append(item);
 }
 const history=$('endlessHistory');history.replaceChildren();
 const runs=Array.isArray(lobby?.runs)?lobby.runs:[];
 if(!runs.length)history.append(make('p','endless-empty',t('noHistory')));
 else for(const saved of runs){
  const item=make('div','endless-saved');
  item.append(make('strong','',saved.finished?t('finished'):t('inProgress')),
   make('span','',fmt(safe(saved.stage))+' '+t('answered')+' · '+fmt(safe(saved.score))+' '+t('unit')));
  const button=make('button','secondary',saved.finished?t('result'):t('open'));
  button.type='button';button.dataset.endlessRun=String(saved.run_id||'');
  button.disabled=busy;item.append(button);history.append(item);
 }
}
function visual(q){
 const view=$('endlessVisual'),link=$('endlessSource');
 view.replaceChildren();hide('endlessVisual',true);hide('endlessSource',true);
 const value=String(q?.visual||'');
 if(value.startsWith('https://commons.wikimedia.org/wiki/Special:FilePath/')){
  const img=make('img','endless-image');img.src=value;img.loading='eager';
  img.alt=String(q?.['prompt_'+lang]||t('title'));
  img.referrerPolicy='no-referrer';
  img.addEventListener('error',()=>{img.classList.add('hidden');});
  view.append(img);hide('endlessVisual',false);
 }else if(value&&!value.startsWith('https://')&&!value.startsWith('http://')){
  view.append(make('span','endless-emoji',value.slice(0,100)));
  hide('endlessVisual',false);
 }
 const source=String(q?.source_url||'');
 if(source.startsWith('https://commons.wikimedia.org/')){
  link.href=source;link.textContent=t('source')+(q.author?' · '+String(q.author).slice(0,40):'');
  hide('endlessSource',false);
 }
}
function renderQuestion(){
 const q=advance&&shown?shown:run?.question;
 if(!q||!Array.isArray(q.options)||q.options.length!==4){status(t('bad'),true);return;}
 $('endlessCategoryHint').textContent=name(q.category||selected);
 $('endlessQuestionLevel').textContent=level(q.difficulty);
 $('endlessPrompt').textContent=String(q['prompt_'+lang]||q.prompt_cs||'');
 $('endlessClue').textContent=String(q['clue_'+lang]||'');
 visual(q);
 const options=$('endlessOptions');options.replaceChildren();
 for(const [i,answer] of q.options.entries()){
  const button=make('button','endless-option');
  button.type='button';button.dataset.endlessChoice=String(i);button.disabled=busy||advance||!!pending;
  button.append(make('b','',String.fromCharCode(65+i)),
   make('span','',String(answer?.[lang]||answer?.cs||'—')));
  if(advance&&feedback){
   button.classList.toggle('is-correct',i===feedback.correct);
   button.classList.toggle('is-wrong',!feedback.ok&&i===feedback.choice);
  }
  options.append(button);
 }
 hide('endlessFeedback',!feedback);
 if(feedback){
  const answer=shown?.options?.[feedback.correct];
  $('endlessFeedback').textContent=t(feedback.ok?'correct':'wrong')+
   (feedback.ok?'':' '+t('correctWas')+' '+String(answer?.[lang]||answer?.cs||''));
  $('endlessFeedback').classList.toggle('good',feedback.ok);
  $('endlessFeedback').classList.toggle('bad',!feedback.ok);
 }
 hide('endlessRetry',!pending);hide('endlessNext',!advance);
 $('endlessRetry').disabled=busy;$('endlessNext').disabled=busy;
}
function renderPlay(){
 if(!run)return;
 hide('endlessLobby',true);hide('endlessPlay',false);
 hide('endlessFinal',!run.finished);hide('endlessQuestionArea',run.finished);
 hide('endlessSaveExit',run.finished);hide('endlessFinish',run.finished);
 $('endlessStage').textContent=fmt(safe(run.stage)+(run.finished?0:1));
 $('endlessScore').textContent=fmt(safe(run.score));
 const multiplier=Number.isSafeInteger(run.multiplier)&&run.multiplier>=1&&run.multiplier<=5
    ?run.multiplier:1+Math.min(4,Math.floor(safe(run.streak)/3));
 $('endlessStreak').textContent=fmt(safe(run.streak))+' · ×'+multiplier;
 $('endlessAccuracy').textContent=safe(run.stage)?Math.round(safe(run.correct)*100/safe(run.stage))+' %':'—';
 $('endlessRatingFill').style.width=safe(run.rating)+'%';
 $('endlessRatingTrack').setAttribute('aria-valuenow',String(safe(run.rating)));
 $('endlessDifficulty').textContent=level(run.question?.difficulty||'easy');
 $('endlessSaveExit').disabled=busy;$('endlessFinish').disabled=busy||!!pending;
 if(run.finished){
  $('endlessFinalSummary').textContent=t('finalText')+' · '+fmt(safe(run.stage))+' '+t('answered')+
    ' · '+fmt(safe(run.score))+' '+t('unit')+' · '+fmt(safe(run.best_streak))+' 🔥';
  $('endlessReward').textContent=rewardLine();
  return;
 }
 renderQuestion();
}
function render(){if(!opened)return;hide('endlessLobby',!!run);hide('endlessPlay',!run);if(run)renderPlay();else renderLobby();}
async function refreshLobby(){
 if(!uid||!api)return;
 const owner=uid,category=selected,serial=++lobbySeq;
 status(t('loading'));
 try{
  const {data,error}=await api.rpc('quizoria_endless_lobby',{p_category:category});
  if(error||data?.ok!==true||data.category!==category)throw error||Error('invalid_lobby');
  if(uid!==owner||selected!==category||serial!==lobbySeq)return;
  lobby=data;render();status('');
 }catch(e){if(uid===owner&&serial===lobbySeq)status(t('error')+' ('+String(e?.message||'network')+')',true);}
}
function select(category){
 if(busy||run||!allowed.has(category))return;
 selected=category;lobby=null;operation=null;render();void refreshLobby();
}
async function begin(){
 if(!uid||!api||busy)return;
 busy=true;render();status(t('loading'));
 if(!operation)operation=crypto.randomUUID();
 const owner=uid,category=selected,serial=++actionSeq;
 try{
  const {data,error}=await api.rpc('quizoria_endless_begin',{p_category:category,p_operation:operation});
  if(error||!validRun(data)||data.category!==category)throw error||Error('invalid_begin');
  if(uid!==owner||serial!==actionSeq)return;
  run=data;operation=null;pending=null;feedback=null;shown=null;advance=false;status('');
 }catch(e){if(uid===owner&&serial===actionSeq)status(t('error')+' ('+String(e?.message||'network')+')',true);}
 finally{busy=false;render();}
}
async function resume(runId){
 if(!uid||!api||busy||!runId)return;
 busy=true;render();status(t('loading'));
 const owner=uid,serial=++actionSeq,category=selected;
 try{
  const {data,error}=await api.rpc('quizoria_endless_resume',{p_run_id:runId});
  if(error||!validRun(data)||data.category!==category)throw error||Error('invalid_run');
  if(uid!==owner||serial!==actionSeq)return;
  run=data;pending=null;feedback=null;shown=null;advance=false;status('');
 }catch(e){if(uid===owner&&serial===actionSeq)status(t('error')+' ('+String(e?.message||'network')+')',true);}
 finally{busy=false;render();}
}
async function answer(choice,retry=false){
 if(!run||run.finished||busy||advance||!uid||!api||(!retry&&pending))return;
 if(!Number.isSafeInteger(choice)||choice<0||choice>3)return;
 if(retry&&!pending)return;
 if(!retry)pending={choice,event:crypto.randomUUID(),question:run.question};
 busy=true;render();status(t('loading'));
 const owner=uid,serial=++actionSeq,runId=run.run_id;
 try{
  const {data,error}=await api.rpc('quizoria_endless_answer',{
   p_run_id:runId,p_event_id:pending.event,p_choice:pending.choice
  });
  if(error||!validRun(data)||typeof data.was_correct!=='boolean'||
      !Number.isSafeInteger(data.correct_option)||data.correct_option<0||data.correct_option>3)
   throw error||Error('invalid_answer');
  if(uid!==owner||serial!==actionSeq)return;
  shown=pending.question;
  feedback={ok:data.was_correct,correct:data.correct_option,choice:pending.choice};
  run=data;pending=null;advance=true;status(t('saved'));
  try{navigator.vibrate?.(data.was_correct?[20]:[50]);}catch(_){}
 }catch(e){if(uid===owner&&serial===actionSeq)status(t('error')+' ('+String(e?.message||'network')+')',true);}
 finally{busy=false;render();}
}
function next(){
 if(!advance||busy||!run)return;
 advance=false;feedback=null;shown=null;render();
}
async function finish(){
 if(!run||run.finished||busy||pending||!uid||!api)return;
 if(window.confirm&&!window.confirm(t('finishConfirm')))return;
 busy=true;render();status(t('loading'));
 const owner=uid,runId=run.run_id,serial=++actionSeq;
 try{
  const {data,error}=await api.rpc('quizoria_endless_finish',{p_run_id:runId});
  if(error||!validRun(data)||!data.finished)throw error||Error('invalid_finish');
  if(uid!==owner||serial!==actionSeq)return;
  run=data;feedback=null;shown=null;pending=null;advance=false;status('');
  void refreshLobby();
  if(run.reward?.reason==='credited'){
   try{if(window.parent&&window.parent!==window)
    window.parent.postMessage({type:'foxey-arcade:rewards-credited'},window.location.origin);
   }catch(_){}
  }
 }catch(e){if(uid===owner&&serial===actionSeq)status(t('error')+' ('+String(e?.message||'network')+')',true);}
 finally{busy=false;render();}
}
function close(){
 if(busy)return;
 opened=false;run=null;pending=null;feedback=null;shown=null;advance=false;operation=null;
 panel.classList.add('hidden');$('modePanel')?.classList.remove('hidden');
 document.body.classList.remove('quiz-endless-active');
 $('quizoriaEndlessLaunch')?.focus?.();
}
function open(){
 if(!uid){status(t('login'),true);return;}
 if(opened||$('modePanel')?.classList.contains('hidden'))return;
 opened=true;run=null;lobby=null;pending=null;feedback=null;shown=null;advance=false;
 panel.classList.remove('hidden');$('modePanel')?.classList.add('hidden');
 document.body.classList.remove('quiz-playing','quiz-finished');
 document.body.classList.add('quiz-endless-active');
 render();void refreshLobby();
 const reduced=document.documentElement.classList.contains('arcade-motion-minimal')||
   window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 panel.scrollIntoView?.({behavior:reduced?'auto':'smooth',block:'start'});
}
function locale(){
 $('quizoriaEndlessTitle').textContent=t('modeTitle');
 $('quizoriaEndlessSubtitle').textContent=t('modeSub');
 $('quizoriaEndlessLaunch').textContent=t('modeStart');
 $('endlessBack').textContent=t('back');
 $('endlessTitle').textContent=t('title');$('endlessIntro').textContent=t('intro');
 for(const [id,key] of Object.entries({
  endlessCategoryTitle:'category',endlessBestStageLabel:'bestStage',
  endlessBestScoreLabel:'bestScore',endlessBestStreakLabel:'bestStreak',
  endlessStart:'start',endlessResume:'resume',endlessActiveHint:'activeHint',
  endlessRules:'rules',endlessLeaderboardTitle:'leaderboard',
  endlessHistoryTitle:'history',endlessStageLabel:'stage',
  endlessScoreLabel:'score',endlessStreakLabel:'streak',
  endlessAccuracyLabel:'accuracy',endlessRatingLabel:'rating',
  endlessRetry:'retry',endlessNext:'next',endlessSaveExit:'saveExit',
  endlessFinish:'finish',endlessFinalTitle:'finalTitle',endlessAgain:'again'
 }))$(id).textContent=t(key);
 render();
}
$('endlessBack').addEventListener('click',close);
$('endlessCategories').addEventListener('click',event=>{
 const b=event.target.closest?.('button[data-endless-category]');
 if(b)select(b.dataset.endlessCategory);
});
$('endlessStart').addEventListener('click',()=>void begin());
$('endlessResume').addEventListener('click',()=>{if(lobby?.active?.run_id)void resume(lobby.active.run_id);});
$('endlessHistory').addEventListener('click',event=>{
 const b=event.target.closest?.('button[data-endless-run]');
 if(b)void resume(b.dataset.endlessRun);
});
$('endlessOptions').addEventListener('click',event=>{
 const b=event.target.closest?.('button[data-endless-choice]');
 if(b)void answer(Number(b.dataset.endlessChoice));
});
$('endlessRetry').addEventListener('click',()=>{if(pending)void answer(pending.choice,true);});
$('endlessNext').addEventListener('click',next);
$('endlessSaveExit').addEventListener('click',close);
$('endlessFinish').addEventListener('click',()=>void finish());
$('endlessAgain').addEventListener('click',()=>{
 run=null;pending=null;feedback=null;shown=null;advance=false;operation=null;
 render();void refreshLobby();
});
document.addEventListener('keydown',event=>{
 if(!opened||!run||run.finished||busy||pending||advance)return;
 if(document.activeElement?.matches?.('input,textarea,[contenteditable="true"]'))return;
 const key=Number(event.key);
 if(Number.isInteger(key)&&key>=1&&key<=4){event.preventDefault();void answer(key-1);}
});
try{
 if(localStorage.getItem('foxey.arcade.motion.v1')==='reduce')
  document.documentElement.classList.add('arcade-motion-minimal');
}catch(_){}
window.QUIZORIA_ENDLESS=Object.freeze({
 connect(client,user){
  const nextUid=user?.id||null;
  if(uid===nextUid&&api===client)return;
  uid=nextUid;api=client;run=null;lobby=null;pending=null;feedback=null;shown=null;
  opened=false;busy=false;advance=false;operation=null;actionSeq++;lobbySeq++;
  panel.classList.add('hidden');document.body.classList.remove('quiz-endless-active');
 },
 afterAuth(){
  if(uid&&new URL(window.location.href).searchParams.get('view')==='endless')open();
 },
 setLocale(next){lang=next==='en'?'en':'cs';locale();},
 open,isOpen(){return opened;}
});
locale();
})();