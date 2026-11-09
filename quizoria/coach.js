/* Quizoria 2.0 — personalized training routes, category skill board.
 * Read-only client of verified quizoria_progress aggregates.
 * Launches EXISTING vetted server modes. No new scoring, payouts or save format. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const coach=$('quizoriaCoach'),skill=$('quizoriaSkillBoard');
const catalog=window.QUIZORIA_CATALOG;
if(!coach||!skill||!catalog||!window.QUIZORIA_PROGRESS?.subscribe)return;
const nameKey=id=>id==='video-games'?'video_games':id;
const topics=catalog.categories.filter(c=>c.state==='available'&&
  ['video-games','memes','movies','music','general'].includes(c.id));
const categories=new Set(topics.map(c=>c.id));
const modes=new Set(['easy','medium','hard','daily']);
const target={
  'video-games':{start:id=>'soloStart_'+id},
  memes:{api:'QUIZORIA_MEMES',selector:'[data-meme-mode]'},
  movies:{api:'QUIZORIA_MOVIES',selector:'[data-movie-mode]'},
  music:{api:'QUIZORIA_MUSIC',selector:'[data-music-mode]'},
  general:{api:'QUIZORIA_GENERAL',selector:'[data-general-mode]'}
};
const dict={
 cs:{
  heading:'🧭 Co si zahrát dál?',intro:'Tři rychlé herní cesty podle tvých ověřených výsledků. Každá hra má vlastní serverový save.',
  refresh:'↻ Aktualizovat',duels:'⚔️ Chci souboj s kamarádem → Výzvy',
  guest:'Přihlas se a odemkneš rychlé spuštění i osobní doporučení.',
  waiting:'☁️ Statistiky se načítají. Zatím si můžeš vybrat některý z připravených kvízů.',
  ready:'✅ Doporučení vycházejí z ověřených statistik tvého účtu.',
  none:'Vyzkoušej první kvízy a doporučení se přizpůsobí tvým výsledkům.',
  practice:'🎯 Procvičit',practiceIntro:'Začni novou kategorií nebo potrénuj oblast, která ti zatím jde hůř.',
  challenge:'🔥 Posunout hranice',challengeIntro:'Otestuj těžší otázky ve své silnější kategorii.',
  daily:'📅 Dnešní kvíz',dailyIntro:'Denní serverová sada otázek v jedné z pěti kategorií.',
  play:'▶ Hrát',login:'Přihlas se',unplayed:'Zatím nehráno',
  sample:'Zatím málo odpovědí pro spolehlivé porovnání.',
  accuracy:'Úspěšnost',quizzes:'kvízů',answers:'odpovědí',
  boardTitle:'📊 Moje znalosti podle kategorií',
  boardDesc:'Srovnání tvých pěti kvízových světů podle ověřených odpovědí. V každém můžeš hned spustit některou obtížnost.',
  boardLoading:'☁️ Čekám na ověřené výsledky serveru.',boardGuest:'Přihlas se pro srovnání kategorií.',
  boardNote:'Žebříček je orientační; kategorie s méně než pěti odpověďmi se zatím nehodnotí.',
  mastered:'Silná stránka',focus:'Prostor ke zlepšení',new:'Nová oblast',
  starter:'Začátečník',learning:'Na cestě',solid:'Zkušený',excellent:'Expert',
  difficulty:{easy:'🟢 Snadné',medium:'🟠 Střední',hard:'🔥 Těžké',daily:'📅 Denní'},
  launchFail:'Tento režim se teď nepodařilo otevřít. Zkus ho vybrat přímo v kategorii.',
  gameBusy:'Nejdřív dokonči nebo opusť rozehranou partii.'
 },
 en:{
  heading:'🧭 What should you play next?',intro:'Three quick paths based on your verified results. Every quiz uses its own server-side save.',
  refresh:'↻ Refresh',duels:'⚔️ Play a friend → Challenges',
  guest:'Sign in to get quick launches and personal recommendations.',
  waiting:'☁️ Loading stats. You can still pick one of the suggested quizzes.',
  ready:'✅ Recommendations use verified statistics from your account.',
  none:'Play your first quizzes to unlock personalized recommendations.',
  practice:'🎯 Practice',practiceIntro:'Try a new category or improve a topic that needs more practice.',
  challenge:'🔥 Level up',challengeIntro:'Try harder questions in one of your stronger categories.',
  daily:'📅 Daily quiz',dailyIntro:'Today’s server-generated question set in one of five categories.',
  play:'▶ Play',login:'Sign in',unplayed:'Not played yet',
  sample:'Not enough answers for a reliable comparison yet.',
  accuracy:'Accuracy',quizzes:'quizzes',answers:'answers',
  boardTitle:'📊 Your knowledge by category',
  boardDesc:'Compare your five quiz worlds using verified answers. Start any difficulty directly from here.',
  boardLoading:'☁️ Waiting for verified server results.',boardGuest:'Sign in to compare your categories.',
  boardNote:'This ranking is indicative; categories with fewer than five answers are not ranked.',
  mastered:'Strongest topic',focus:'Room to improve',new:'New category',
  starter:'Beginner',learning:'Learning',solid:'Skilled',excellent:'Expert',
  difficulty:{easy:'🟢 Easy',medium:'🟠 Medium',hard:'🔥 Hard',daily:'📅 Daily'},
  launchFail:'Could not open this mode. Try selecting it from the category itself.',
  gameBusy:'Finish or leave the current quiz before starting another.'
 }
};
let language='cs';
let snapshot={signedIn:false,verified:false,categories:{}};
const tr=key=>dict[language][key]||key;
const create=(tag,cls,content)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(content!==undefined)el.textContent=content;
  return el;
};
const stat=id=>{
 const s=snapshot.categories[nameKey(id)]||{};
 const nonNegative=x=>Number.isSafeInteger(x)&&x>=0?x:0;
 const answered=nonNegative(s.answered),correct=Math.min(answered,nonNegative(s.correct));
 return {
  answered,correct,games:nonNegative(s.games),best:nonNegative(s.best),
  skill:Math.max(1,nonNegative(s.skill_level)),
  accuracy:answered?Math.round(100*correct/answered):null
 };
};
const topic=id=>topics.find(x=>x.id===id);
const displayName=id=>{
 const t=topic(id);
 return (t?.icon||'🧠')+' '+(t?.[language]?.name||id);
};
const number=n=>n.toLocaleString(language==='cs'?'cs-CZ':'en-US');
function pickPlan(){
 const entries=topics.map(t=>({id:t.id,...stat(t.id)}));
 const sampled=entries.filter(x=>x.answered>=5);
 const unplayed=entries.filter(x=>x.games===0);
 const practice=unplayed[0]||
   [...sampled].sort((a,b)=>a.accuracy-b.accuracy||a.games-b.games)[0]||
   entries[0];
 const practicedMode=practice.answered<5||practice.accuracy<65?'easy':'medium';
 const strongest=[...sampled].sort((a,b)=>b.accuracy-a.accuracy||b.answered-a.answered)[0];
 const challenge=strongest||entries.find(x=>x.id!==practice.id)||entries[0];
 const day=Math.floor(Date.now()/86400000);
 const daily=entries[((day%entries.length)+entries.length)%entries.length];
 return [
  {kind:'practice',category:practice.id,mode:practicedMode,
   sub:practice.games===0?tr('unplayed'):practice.answered>=5?
     tr('accuracy')+': '+practice.accuracy+' %':tr('sample')},
  {kind:'challenge',category:challenge.id,mode:strongest?'hard':'medium',
   sub:strongest?tr('accuracy')+': '+strongest.accuracy+' %':tr('sample')},
  {kind:'daily',category:daily.id,mode:'daily',sub:tr('dailyIntro')}
 ];
}
function addLauncher(container,category,mode,label,cls=''){
 const button=create('button','q2-launch '+cls,label);
 button.type='button';
 button.dataset.coachCategory=category;
 button.dataset.coachMode=mode;
 button.disabled=!snapshot.signedIn;
 container.append(button);
 return button;
}
function renderCoach(){
 $('quizoriaCoachTitle').textContent=tr('heading');
 $('quizoriaCoachSubtitle').textContent=tr('intro');
 $('quizoriaCoachRefresh').textContent=tr('refresh');
 $('quizoriaCoachRefresh').disabled=!snapshot.signedIn;
 $('quizoriaCoachDuels').textContent=tr('duels');
 $('quizoriaCoachDuels').disabled=!snapshot.signedIn;
 $('quizoriaCoachStatus').textContent=!snapshot.signedIn?tr('guest'):
   !snapshot.verified?tr('waiting'):
   topics.every(t=>stat(t.id).games===0)?tr('none'):tr('ready');
 const root=$('quizoriaCoachCards');root.replaceChildren();
 const plans=pickPlan();
 for(const plan of plans){
  const t=topic(plan.category);
  const card=create('article','q2-coach-card q2-'+plan.kind);
  const name=create('span','q2-plan-category',displayName(plan.category));
  const head=create('h4','',tr(plan.kind));
  const desc=create('p','',tr(plan.kind+'Intro'));
  const meta=create('small','q2-coach-meta',plan.sub);
  const actions=create('div','q2-coach-actions');
  addLauncher(actions,plan.category,plan.mode,
    tr('play')+' · '+tr('difficulty')[plan.mode]);
  card.append(name,head,desc,meta,actions);
  root.append(card);
 }
}
function renderBoard(){
 $('quizoriaSkillTitle').textContent=tr('boardTitle');
 $('quizoriaSkillDesc').textContent=tr('boardDesc');
 const status=$('quizoriaSkillStatus');
 status.textContent=!snapshot.signedIn?tr('boardGuest'):
   !snapshot.verified?tr('boardLoading'):tr('boardNote');
 const root=$('quizoriaSkillGrid');root.replaceChildren();
 if(!snapshot.verified)return;
 const entries=topics.map(t=>({id:t.id,...stat(t.id)}))
  .sort((a,b)=>{
   const ar=a.answered>=5,br=b.answered>=5;
   if(ar!==br)return Number(br)-Number(ar);
   if(ar&&br&&a.accuracy!==b.accuracy)return b.accuracy-a.accuracy;
   return b.games-a.games;
  });
 const qualified=entries.filter(x=>x.answered>=5);
 const strongest=qualified[0]?.id;
 const weakest=qualified.at(-1)?.id;
 for(const row of entries){
  const reliable=row.answered>=5;
  const card=create('article','q2-skill-card');
  const header=create('div','q2-skill-row');
  const name=create('strong','',displayName(row.id));
  const badge=create('span','q2-skill-badge',row.games===0?tr('new'):
   reliable&&row.id===strongest?tr('mastered'):
   reliable&&row.id===weakest&&strongest!==weakest?tr('focus'):
   row.accuracy>=85?tr('excellent'):
   row.accuracy>=70?tr('solid'):
   row.accuracy>=50?tr('learning'):tr('starter'));
  header.append(name,badge);
  const facts=create('div','q2-skill-facts');
  facts.append(create('span','',tr('accuracy')+': '+
    (row.answered?row.accuracy+' %':'—')),
   create('span','',number(row.games)+' '+tr('quizzes')),
   create('span','',number(row.answered)+' '+tr('answers')));
  const track=create('div','q2-skill-track');
  track.setAttribute('role','progressbar');
  track.setAttribute('aria-label',displayName(row.id)+' · '+tr('accuracy'));
  track.setAttribute('aria-valuemin','0');
  track.setAttribute('aria-valuemax','100');
  if(row.answered)track.setAttribute('aria-valuenow',String(row.accuracy));
  const fill=create('span','');
  fill.style.width=(row.accuracy||0)+'%';track.append(fill);
  const actions=create('div','q2-skill-actions');
  for(const mode of modes)
    if(catalog.canPlay(row.id,mode))addLauncher(actions,row.id,mode,
      tr('difficulty')[mode],'q2-mode-'+mode);
  card.append(header,facts,track,actions);root.append(card);
 }
}
function render(){renderCoach();renderBoard();}
function launch(category,mode){
 if(!snapshot.signedIn||!categories.has(category)||!modes.has(mode)||
    !catalog.canPlay(category,mode))return;
 const status=$('quizoriaCoachStatus');
 const setError=message=>{if(status)status.textContent=message;};
 if(document.body.classList.contains('quiz-playing')||
    document.getElementById('modePanel')?.classList.contains('hidden')){
  setError(tr('gameBusy'));return;
 }
 let button;
 if(category==='video-games'){
  document.getElementById('hubTabSolo')?.click?.();
  button=document.getElementById('soloStart_'+mode);
 }else{
  const config=target[category],engine=window[config.api];
  if(!engine?.openCategory)return void setError(tr('launchFail'));
  engine.openCategory();
  const buttons=document.querySelectorAll(config.selector);
  button=[...buttons].find(x=>x.dataset[category==='memes'?'memeMode':
    category==='movies'?'movieMode':category==='music'?'musicMode':'generalMode']===mode);
 }
 if(button&&!button.disabled)button.click();
 else setError(tr('launchFail'));
}
coach.addEventListener('click',event=>{
 const btn=event.target.closest?.('button[data-coach-category][data-coach-mode]');
 if(btn)launch(btn.dataset.coachCategory,btn.dataset.coachMode);
});
skill.addEventListener('click',event=>{
 const btn=event.target.closest?.('button[data-coach-category][data-coach-mode]');
 if(btn)launch(btn.dataset.coachCategory,btn.dataset.coachMode);
});
$('quizoriaCoachDuels').addEventListener('click',()=>$('hubTabChallenges')?.click());
$('quizoriaCoachRefresh').addEventListener('click',()=>{
 void window.QUIZORIA_PROGRESS?.refresh?.();
});
window.QUIZORIA_COACH=Object.freeze({
 setLocale(next){language=next==='en'?'en':'cs';render();}
});
window.QUIZORIA_PROGRESS.subscribe(next=>{
 snapshot=next&&typeof next==='object'?next:{signedIn:false,verified:false,categories:{}};
 render();
});
})();