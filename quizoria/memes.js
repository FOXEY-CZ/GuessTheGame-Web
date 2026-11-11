/* Quizoria 1.2 — Guess the Meme.
 * Authenticated, server-owned runs, event-idempotent answers, saved games,
 * shared daily question sets and two-player link challenges. */
(()=>{
'use strict';
const engine=window.QUIZORIA_CATEGORY_ENGINE;
if(!engine?.config('memes'))return;
const $=id=>document.getElementById(id);
const root=$('quizoriaMemePanel');
if(!root)return;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const modes=engine.config('memes').modes.filter(mode=>mode!=='friend');
const dict={
  cs:{
    title:'😂 Guess the Meme',sub:'Poznáš internetové legendy jen podle obrázku?',
    back:'← Zpět do Quizorie',intro:'Vyber režim, prohlédni obrázek a odpověz. Každou odpověď ověřuje server.',
    category:'😂 Memy a internet',new:'▶ Hrát',resume:'⏯ Pokračovat',
    modes:['🎲 Klasický mix','🟢 Nováček','🟠 Zkušený','🔥 Expert','📅 Denní mem'],
    subs:['10 obrázků z různých obtížností','10 jednodušších otázek','10 středně těžkých otázek','10 těžších internetových souvislostí','Stejných 5 otázek pro všechny (UTC)'],
    saves:'💾 Rozehrané a nedávné hry',none:'Žádná rozehraná partie. Vyber režim a začni!',
    challenge:'⚔️ Meme výzva s kamarádem',
    challengeDesc:'Vytvoř výzvu, pošli odkaz a oba odehrajete stejných 10 otázek. Skóre se porovná po dohrání obou.',
    create:'⚔️ Vytvořit výzvu',join:'🎮 Přijmout odkaz / ID',copy:'📋 Kopírovat',
    check:'🏆 Zkontrolovat souboj',share:'Sdílet výzvu',shareReady:'Odkaz je připravený ke sdílení.',
    joined:'Výzva načtena, všichni mají stejné otázky.',
    loading:'🛡️ Ověřuji serverovou partii…',loadError:'⚠️ Požadavek se nepodařil.',
    retry:'↻ Opakovat požadavek',question:'Otázka',points:'Body',
    credits:'Zdroj obrázku a licence',imageError:'Obrázek se nepodařilo načíst. Otevři zdrojový obrázek.',
    waitingCopyright:'Původní obrázek čeká na ověření autorských práv.',
    skipMedia:'⏭️ Přeskočit otázku bez ztráty bodů',skippedMedia:'⚖️ Obrázek čeká na ověření. Otázka přeskočena bez bodové ztráty.',
    licenseLink:'📜 Znění licence',emojiCredit:'FOXEY Arcade · vlastní emoji otázka',
    linkImage:'Otevřít obrázek na Wikimedia Commons',
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
    dailyNote:'Denní otázky se mění každý den podle UTC.',
    save:'Rozehraný kvíz je na serveru a zůstane zachovaný i po zavření stránky.',
    invalid:'Server vrátil neplatnou odpověď.',playFirst:'Vyber možnost odpovědi.',
    mime:'Jména, obrázky a popisy jsou použité se zdrojovými kredity. Soutěžní body nejsou reálné peníze.',
    sharePlaying:'Hraješ výzvu s kamarádem. Pošli mu odkaz.',shareCopy:'📋 Zkopírovat odkaz',
    copyDone:'Odkaz zkopírován.',hint:'Obrázek má vlastní licenci; pod ním najdeš autora a zdroj.',
    latest:'Nedávno dokončeno',active:'Rozehráno'
  },
  en:{
    title:'😂 Guess the Meme',sub:'Can you recognize legendary memes from pictures?',
    back:'← Back to Quizoria',intro:'Choose a mode, inspect the image and answer. The server verifies each choice.',
    category:'😂 Memes & Internet',new:'▶ Play',resume:'⏯ Resume',
    modes:['🎲 Classic Mix','🟢 Beginner','🟠 Experienced','🔥 Expert','📅 Daily Meme'],
    subs:['10 images across difficulty levels','10 easier questions','10 medium-difficulty questions','10 tougher internet culture questions','Same 5 questions for everyone (UTC)'],
    saves:'💾 Saved and recent runs',none:'No saved runs yet. Choose a mode to begin!',
    challenge:'⚔️ Challenge a Friend',challengeDesc:'Create a challenge, share the link and both play the same 10 questions. Results appear once both finish.',
    create:'⚔️ Create Challenge',join:'🎮 Join with link / ID',copy:'📋 Copy',
    check:'🏆 Check Match',share:'Share Challenge',shareReady:'Your challenge link is ready to share.',
    joined:'Challenge loaded. Both players get identical questions.',
    loading:'🛡️ Checking your server-verified game…',loadError:'⚠️ The server request failed.',
    retry:'↻ Retry request',question:'Question',points:'Points',
    credits:'Image credit and license',imageError:'Image failed to load. Open the source image.',
    waitingCopyright:'This image is temporarily held for copyright review.',
    skipMedia:'⏭️ Skip this question without losing points',skippedMedia:'⚖️ Image under rights review. Question skipped without losing points.',
    licenseLink:'📜 License terms',emojiCredit:'FOXEY Arcade · original emoji question',
    linkImage:'Open the image on Wikimedia Commons',
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
    signedOut:'Sign in to FOXEY Arcade first.',dailyNote:'Daily questions reset each UTC day.',
    save:'Your run is safely stored on the server, even after closing this page.',
    invalid:'The server sent an invalid response.',playFirst:'Choose an answer.',
    mime:'Images and descriptions include source credits. Game points are not real currency.',
    sharePlaying:'You are playing a friend challenge. Share the link.',shareCopy:'📋 Copy invite link',
    copyDone:'Link copied.',hint:'Images retain their own licenses; credits appear beneath each picture.',
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
 const e=$('memeStatus');if(!e)return;
 e.textContent=msg||'';
 e.classList.toggle('error',error);
}
function make(tag,cls,text){
 const node=document.createElement(tag);if(cls)node.className=cls;
 if(text!==undefined)node.textContent=text;return node;
}
function sourceLink(q){
 const link=$('memeImageCredit');
 const source=String(q?.source_url||'');
 const approvedSource=source.startsWith('https://commons.wikimedia.org/wiki/File:')||
  source==='https://foxey-cz.github.io/GuessTheGame-Web/arcade/media-library.html';
 const uri=approvedSource?source:'./arcade/media-library.html';
 if(link){
  link.href=uri;
  link.textContent=q?.media_review_pending?t('waitingCopyright'):
    (q?.image_url||'').startsWith('emoji:')?t('emojiCredit'):
    String(q?.author||'Wikimedia Commons')+' · '+String(q?.license||'')+' · '+t('credits');
 }
 const image=$('memeImageOpen'),commons=String(q?.image_url||'').startsWith('https://commons.wikimedia.org/wiki/Special:FilePath/');
 image.href=approvedSource?source:'./arcade/media-library.html';
 hide('memeImageOpen',!commons||q?.media_review_pending===true);
 const lic=$('memeLicenseLink'),raw=String(q?.license_url||'');
 const safe=raw.startsWith('https://creativecommons.org/')||
   raw==='https://foxey-cz.github.io/GuessTheGame-Web/arcade/media-library.html';
 if(lic){lic.href=safe?raw:'./arcade/media-library.html';lic.textContent=t('licenseLink');}
 hide('memeLicenseLink',!safe||q?.media_review_pending===true);
}
function open(){
 if(!uid){status(t('signedOut'),true);return;}
 opened=true;playing=false;feedback=null;awaitNext=false;
 root.classList.remove('hidden');
 $('modePanel')?.classList.add('hidden');
 document.body.classList.remove('quiz-playing','quiz-finished');
 hide('memeLobby',false);hide('memePlay',true);
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
 window.QUIZORIA_UI?.selectCategory?.('video-games');
 $('hubTabCategories')?.click?.();
}
function showLobby(){
 playing=false;feedback=null;awaitNext=false;
 hide('memeLobby',false);hide('memePlay',true);
 document.body.classList.remove('quiz-playing','quiz-finished');
 updateSaved();
}
function showGame(){
 if(!run?.has_run){status(t('invalid'),true);return;}
 playing=true;opened=true;
 hide('memeLobby',true);hide('memePlay',false);
 document.body.classList.toggle('quiz-playing',!run.finished);
 document.body.classList.toggle('quiz-finished',!!run.finished);
 renderGame();
 $('memePlay').scrollIntoView?.({behavior:'smooth',block:'start'});
}
function updateSaved(){
 const node=$('memeSavedList');node?.replaceChildren();
 if(!node)return;
 let seen=0;
 for(const item of runs){
  if(!item?.run_id||!uuid.test(item.run_id))continue;
  if(item.finished&&seen>=6)continue;
  seen++;
  const wrapper=make('div','meme-save-row');
  const idx=modes.indexOf(item.mode);
  const title=idx>=0?t('modes')[idx]:t('challenge');
  const note=make('div','meme-save-copy');
  note.append(make('strong','',title),make('small','',
    (item.finished?t('latest'):t('active'))+
    ' · '+String(item.stage||0)+'/'+String(item.total||10)+
    ' · '+String(item.score||0)+' '+t('score')));
  const button=make('button','meme-save-open',t(item.finished?'latest':'resume'));
  button.disabled=locked;
  button.addEventListener('click',()=>void resume(item.run_id));
  wrapper.append(note,button);node.append(wrapper);
 }
 if(!seen)node.append(make('p','meme-help',t('none')));
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
 hide('memeTopShare',!run.challenge_id);
 $('memeStage').textContent=t('question')+' '+Math.min(run.stage+1,run.total)+' / '+run.total;
 $('memeScore').textContent=t('points')+': '+run.score;
 $('memeProgressFill').style.width=(100*Math.min(run.total,run.stage)/Math.max(1,run.total))+'%';
 $('memeProgressTrack').setAttribute('aria-valuenow',String(run.stage));
 hide('memeRetry',!pending);
 hide('memeNext',!awaitNext);
 hide('memeQuestionArea',run.finished);
 hide('memeFinal',!run.finished);
 if(run.finished){
  $('memeFinalTitle').textContent=t('finished');
  $('memeFinalScore').textContent=t('result')+': '+run.score+' / '+(run.total*10)+' '+t('score');
  $('memeReward').textContent=rewardText();
  if(run.challenge_id){
   challengeId=run.challenge_id;
   $('memeFinalMatch').classList.remove('hidden');
   $('memeFinalMatch').textContent=t('waiting');
   void pollChallenge(true);
  }else hide('memeFinalMatch',true);
  return;
 }
 const q=feedback&&awaitNext?lastQuestion:run.question;
 if(!q){status(t('invalid'),true);return;}
 $('memePrompt').textContent=q['prompt_'+lang]||t('loading');
 const img=$('memeImage');
 const error=$('memeImageError');
 const src=String(q.image_url||'');
 const commons=src.startsWith('https://commons.wikimedia.org/wiki/Special:FilePath/');
 const emoji=src.startsWith('emoji:');
 const reviewed=q.media_review_pending===true;
 if(commons&&!reviewed){
  if(img.dataset.src!==src){img.dataset.src=src;img.src=src;}
  img.classList.remove('hidden');
  error.classList.remove('meme-image-emoji');
  hide('memeImageError',true);
 }else{
  img.dataset.src=src;
  img.removeAttribute('src');img.classList.add('hidden');
  error.classList.toggle('meme-image-emoji',emoji&&!reviewed);
  error.textContent=reviewed?'🔒 '+t('waitingCopyright'):
   emoji?src.slice(6):t('imageError');
  hide('memeImageError',false);
 }
 hide('memeSkipCopyright',!reviewed||awaitNext||run.finished);
 $('memeSkipCopyright').disabled=locked||!!pending;
 sourceLink(q);
 const grid=$('memeOptions');grid.replaceChildren();
 const opts=Array.isArray(q.options)?q.options:[];
 opts.forEach((option,index)=>{
  const button=make('button','meme-option');
  button.type='button';
  button.append(make('b','meme-letter','ABCD'[index]||'?'),
    make('span','',option?.[lang]||'—'));
  button.disabled=locked||!!pending||awaitNext;
  if(awaitNext&&feedback){
    button.classList.toggle('was-correct',index===feedback.correctIndex);
    button.classList.toggle('was-wrong',index===feedback.picked&&!feedback.ok);
  }
  if(!button.disabled)button.addEventListener('click',()=>void answer(index));
  grid.append(button);
 });
 hide('memeFeedback',!feedback);
 if(feedback){
  const opts=Array.isArray(lastQuestion?.options)?lastQuestion.options:[];
  const right=opts[feedback.correctIndex]?.[lang]||'';
  $('memeFeedback').textContent=feedback.mediaSkipped?t('skippedMedia'):
    t(feedback.ok?'correct':'wrong')+
     (feedback.ok?'':' '+t('right')+' '+right);
  $('memeFeedback').classList.toggle('good',feedback.ok||feedback.mediaSkipped);
  $('memeFeedback').classList.toggle('bad',!feedback.ok&&!feedback.mediaSkipped);
 }
 $('memeNext').disabled=locked||!!pending;
}
async function refreshRuns(){
 if(!uid||!api)return;
 const current=uid,seq=++serial;
 try{
  const {data,error}=await engine.rpc(api,'memes','my_runs');
  if(error||data?.ok!==true||!Array.isArray(data.runs))throw error||Error('bad_runs');
  if(uid!==current||seq!==serial)return;
  runs=data.runs;updateSaved();
 }catch(err){console.warn('Quizoria meme saved runs unavailable',err);}
}
async function begin(modeName){
 if(!uid||!api){status(t('signedOut'),true);return;}
 if(locked)return;
 locked=true;status(t('loading'));updateSaved();
 if(!beginPending||beginPending.type!=='begin'||beginPending.mode!==modeName)
  beginPending={type:'begin',mode:modeName,operation:crypto.randomUUID()};
 try{
  const {data,error}=await engine.rpc(api,'memes','begin',{
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
  const {data,error}=await engine.rpc(api,'memes','resume',{p_run_id:id});
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
  const {data,error}=await engine.rpc(api,'memes','answer',request);
  if(error||data?.ok!==true||data.answered!==true)throw error||Error('invalid_reply');
  pending=null;
  run=data;feedback={ok:data.was_correct===true,correctIndex:data.correct_option,
    picked:request.p_choice,mediaSkipped:data.media_skipped===true};
  lastQuestion=previous;awaitNext=!data.finished;
  status(data.finished?'':t('save'));
  if(data.finished){void refreshRuns();void window.QUIZORIA_PROGRESS?.refresh?.();}
  if(!data.media_skipped)try{navigator.vibrate?.(data.was_correct?[28]:[60,35,60]);}catch(_){}
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
 url.searchParams.set('meme_challenge',id);
 return url.toString();
}
function showInvite(id){
 challengeId=id;
 const value=inviteUrl(id);
 $('memeInviteLink').value=value;
 hide('memeInviteDisplay',false);
 status(t('shareReady'));
}
async function createChallenge(){
 if(locked||!uid||!api)return;
 locked=true;status(t('loading'));
 if(!beginPending||beginPending.type!=='create')
   beginPending={type:'create',operation:crypto.randomUUID()};
 try{
  const {data,error}=await engine.rpc(api,'memes','challenge_create',{
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
 try{value=new URL(value).searchParams.get('meme_challenge')||value;}catch(_){}
 return uuid.test(value)?value:null;
}
async function joinChallenge(value){
 if(locked||!uid||!api)return;
 const id=parseInvite(value);
 if(!id){status(t('emptyInvite'),true);return;}
 locked=true;status(t('loading'));
 try{
  const {data,error}=await engine.rpc(api,'memes','challenge_join',{
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
  const {data,error}=await engine.rpc(api,'memes','challenge_status',{
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
  $('memeMatchStatus').textContent=message;
  if(run?.finished&&run?.challenge_id)$('memeFinalMatch').textContent=message;
  if(!silent)status(message);
 }catch(err){if(!silent)status(t('loadError')+' '+(err?.message||''),true);}
}
function localize(){
 const mapping={
  memeTitle:'title',memeSubtitle:'sub',memeBack:'back',memeIntro:'intro',
  memeCategory:'category',memeSavedTitle:'saves',memeChallengeTitle:'challenge',
  memeChallengeDesc:'challengeDesc',memeChallengeCreate:'create',
  memeChallengeJoin:'join',memeInviteCopy:'copy',memeMatchCheck:'check',
  memeNext:'next',memeRetry:'retry',memeAnother:'playAgain',
  memeImageOpen:'linkImage',memeImageError:'imageError',
  memeSkipCopyright:'skipMedia',memeLicenseLink:'licenseLink',
  memeDailyNote:'dailyNote',memeLegal:'mime',
  memeTopShareText:'sharePlaying',memeTopShareCopy:'shareCopy'
 };
 for(const [id,key] of Object.entries(mapping))if($(id))$(id).textContent=t(key);
 modes.forEach((m,i)=>{
  $('memeMode_'+m).textContent=t('modes')[i];
  $('memeModeSub_'+m).textContent=t('subs')[i];
 });
 updateSaved();if(playing)renderGame();
}
root.querySelectorAll('[data-meme-mode]').forEach(button=>{
 button.addEventListener('click',()=>void begin(button.dataset.memeMode));
});
$('memeBack').addEventListener('click',close);
$('memeNext').addEventListener('click',next);
$('memeRetry').addEventListener('click',()=>void answer(0,true));
$('memeAnother').addEventListener('click',showLobby);
$('memeChallengeCreate').addEventListener('click',()=>void createChallenge());
$('memeChallengeJoin').addEventListener('click',()=>void joinChallenge($('memeInviteInput').value));
$('memeMatchCheck').addEventListener('click',()=>void pollChallenge());
$('memeInviteCopy').addEventListener('click',async()=>{
 const url=$('memeInviteLink').value;
 try{await navigator.clipboard.writeText(url);status(t('copyDone'));}
 catch(_){$('memeInviteLink').focus();$('memeInviteLink').select();}
});
$('memeTopShareCopy')?.addEventListener('click',async()=>{
 const id=run?.challenge_id||challengeId;
 if(!id)return;
 const url=inviteUrl(id);
 try{await navigator.clipboard.writeText(url);status(t('copyDone'));}
 catch(_){
   playing=false;showLobby();showInvite(id);
   $('memeInviteLink')?.focus?.();$('memeInviteLink')?.select?.();
 }
});
$('memeImage').addEventListener('error',()=>{
 if(!$('memeImage').dataset.src?.startsWith('https://commons.wikimedia.org/'))return;
 $('memeImage').classList.add('hidden');
 $('memeImageError').classList.remove('meme-image-emoji');
 $('memeImageError').textContent=t('imageError');
 hide('memeImageError',false);
});
$('memeSkipCopyright').addEventListener('click',()=>{
 if(run?.question?.media_review_pending===true&&!awaitNext&&!locked&&!pending)
  void answer(4);
});
window.QUIZORIA_MEMES=Object.freeze({
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
  const invite=parseInvite(params.get('meme_challenge'));
  if(invite&&autoHandled!==uid+':'+invite){
    autoHandled=uid+':'+invite;open();void joinChallenge(invite);
  }else if(params.get('view')==='memes')open();
 },
 openCategory:open,
 setLocale(next){lang=next==='en'?'en':'cs';localize();},
 isOpen(){return opened;}
});
localize();
})();