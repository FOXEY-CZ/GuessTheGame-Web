/* Quizoria 2.1.1 Survival Effects.
 * Presentation-only feedback, triggered exclusively by server-confirmed
 * Survival events. No questions, balances, rewards or saves are modified. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const toast=$('survivalFxToast');
const icon=$('survivalFxIcon');
const title=$('survivalFxTitle');
const subtitle=$('survivalFxSubtitle');
const newRecord=$('survivalNewRecord');
const hearts=$('survivalHearts');
const streak=$('survivalStreak');
const question=$('survivalQuestionArea');
const tierBadge=$('survivalDifficulty');
const final=$('survivalFinal');
const reward=$('survivalReward');
if(!toast||!icon||!title||!subtitle||!newRecord||
   !hearts||!streak||!question||!tierBadge||!final||!reward)return;

const translations={
 cs:{
  heart:['💔','Ztracený život',n=>'Zbývá '+n+(n===1?' život':' životů')],
  streak:['🔥','Skvělá série!',n=>n+' správných odpovědí za sebou'],
  tierMedium:['⚡','Nová obtížnost!','🟠 Přicházejí středně těžké otázky'],
  tierHard:['🔥','Expertní obtížnost!','🔥 Přicházejí nejtěžší otázky'],
  record:['🏆','Nový osobní rekord!',v=>'Skóre '+v.score+' · otázka '+v.stage+'/60'],
  recordBadge:v=>'🏆 Nový osobní rekord! '+v.score+' bodů · '+v.stage+'/60',
  reward:['🎁','Odměna připsána!',v=>'+'+v.xp+' XP'+(v.crowns>0?' · +'+v.crowns+' 👑':'')]
 },
 en:{
  heart:['💔','Life lost!',n=>n+(n===1?' life':' lives')+' remaining'],
  streak:['🔥','Amazing streak!',n=>n+' correct answers in a row'],
  tierMedium:['⚡','Difficulty increased!','🟠 Medium questions ahead'],
  tierHard:['🔥','Expert difficulty!','🔥 The hardest questions are coming'],
  record:['🏆','New personal best!',v=>'Score '+v.score+' · question '+v.stage+'/60'],
  recordBadge:v=>'🏆 New personal best! '+v.score+' points · '+v.stage+'/60',
  reward:['🎁','Reward credited!',v=>'+'+v.xp+' XP'+(v.crowns>0?' · +'+v.crowns+' 👑':'')]
 }
};
let lang='cs',queue=[],active=null,toastTimer=null,recordData=null;
const animations=new Set();
const safe=value=>Number.isSafeInteger(value)&&value>=0?value:0;
const number=value=>safe(value).toLocaleString(lang==='en'?'en-US':'cs-CZ');
const reduced=()=>document.documentElement.classList.contains('arcade-motion-minimal')||
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

function renderToast(){
 if(!active)return;
 const words=translations[lang][active.kind];
 icon.textContent=words[0];
 title.textContent=words[1];
 const arg=active.kind==='record'
  ?{score:number(active.data.score),stage:number(active.data.stage)}
  :active.kind==='reward'
    ?{xp:number(active.data.xp),crowns:number(active.data.crowns)}
    :active.data;
 subtitle.textContent=typeof words[2]==='function'?words[2](arg):words[2];
 toast.className='survival-fx-toast svfx-'+(
  active.kind==='tierMedium'||active.kind==='tierHard'?'tier':active.kind);
 toast.setAttribute('aria-label',title.textContent+' '+subtitle.textContent);
}
function playQueue(){
 if(active||!queue.length)return;
 active=queue.shift();
 renderToast();
 const duration=active.kind==='tierMedium'||active.kind==='tierHard'?2700:2400;
 toastTimer=window.setTimeout(()=>{
  toast.classList.add('hidden');
  active=null;toastTimer=null;
  playQueue();
 },reduced()?2000:duration);
}
function notify(kind,data){
 queue.push({kind,data});
 playQueue();
}
function transient(node,cls,duration=1400){
 if(!node||reduced())return;
 node.classList.remove(cls);
 // Force the new animation to start at the verified event, not on render.
 void node.offsetWidth;
 node.classList.add(cls);
 const timer=window.setTimeout(()=>{
  animations.delete(record);node.classList.remove(cls);
 },duration);
 const record={timer,node,cls};animations.add(record);
}
function clear(){
 queue=[];active=null;
 if(toastTimer!==null)window.clearTimeout(toastTimer);
 toastTimer=null;
 toast.className='survival-fx-toast hidden';
 toast.removeAttribute('aria-label');
 for(const item of animations){
  window.clearTimeout(item.timer);
  item.node.classList.remove(item.cls);
 }
 animations.clear();
 recordData=null;
 newRecord.classList.add('hidden');
 final.classList.remove('svfx-new-record');
 reward.classList.remove('svfx-reward-reveal');
}

function answerConfirmed({before,after,wasCorrect}={}){
 if(!before||!after||before.run_id!==after.run_id||
    !Number.isSafeInteger(before.stage)||!Number.isSafeInteger(after.stage)||
    after.stage!==before.stage+1||typeof wasCorrect!=='boolean')return;
 const heartsBefore=before.lives,heartsAfter=after.lives;
 if(!wasCorrect&&Number.isSafeInteger(heartsBefore)&&
    Number.isSafeInteger(heartsAfter)&&heartsAfter===heartsBefore-1){
  transient(hearts,'svfx-heart-loss',1450);
  notify('heart',safe(heartsAfter));
  return;
 }
 if(wasCorrect&&after.streak>before.streak&&
    Number.isSafeInteger(after.streak)&&
    (after.streak===3||after.streak===5||
      (after.streak>=10&&after.streak%5===0))){
  transient(streak,'svfx-streak-rise',1300);
  notify('streak',after.streak);
 }
}
function questionAdvanced({stage}={}){
 if(stage!==20&&stage!==40)return;
 transient(question,'svfx-tier-change',1500);
 transient(tierBadge,'svfx-tier-badge',1300);
 notify(stage===20?'tierMedium':'tierHard',null);
}
function finishConfirmed({result,baseline}={}){
 if(!result||result.finished!==true)return;
 // Personal bests compare two server-sourced snapshots for this run:
 // the pre-run lobby best and the server-verified finished receipt.
 const prior=baseline&&['score','stage','streak'].every(k=>
    Number.isSafeInteger(baseline[k])&&baseline[k]>=0)?baseline:null;
 const resultScore=safe(result.score),resultStage=safe(result.stage);
 const resultStreak=safe(result.best_streak);
 if(prior&&(resultScore>prior.score||resultStage>prior.stage||
    resultStreak>prior.streak)){
  recordData={score:resultScore,stage:resultStage};
  newRecord.classList.remove('hidden');
  final.classList.add('svfx-new-record');
  newRecord.textContent=translations[lang].recordBadge({
   score:number(resultScore),stage:number(resultStage)
  });
  notify('record',recordData);
 }
 // A credited reward must already exist on the server response. No
 // graphics imply a payout for a daily cap or ineligible account.
 const r=result.reward;
 if(r?.reason==='credited'&&
    (safe(r.xp)>0||safe(r.crowns)>0)){
  reward.classList.add('svfx-reward-reveal');
  notify('reward',{xp:safe(r.xp),crowns:safe(r.crowns)});
 }
}
function setLocale(next){
 lang=next==='en'?'en':'cs';
 if(active)renderToast();
 if(recordData)newRecord.textContent=translations[lang].recordBadge({
   score:number(recordData.score),stage:number(recordData.stage)
 });
}
window.QUIZORIA_SURVIVAL_FX=Object.freeze({
 answerConfirmed,questionAdvanced,finishConfirmed,setLocale,clear
});
})();
