/* Quizoria 1.3: account-specific progress and server-verified milestone rewards.
 * No score, milestone eligibility or wallet credit is calculated on the client. */
(()=>{
  'use strict';
  const root=document.getElementById('quizoriaProgression');
  if(!root)return;
  const $=id=>document.getElementById(id);
  const create=(tag,cls,txt)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(txt!==undefined)el.textContent=txt;
    return el;
  };
  const localeText={
    cs:{
      heading:'🏆 Tvůj postup',subtitle:'Každá kategorie má vlastní statistiky. XP a měny zůstávají společné pro FOXEY Arcade.',
      refresh:'↻ Obnovit',loading:'Načítám ověřené statistiky…',
      logIn:'Přihlas se pro zobrazení statistik.',error:'⚠️ Statistiky se nepodařilo načíst.',
      badges:'🎖️ Milníky Quizorie',claimed:'Vyzvednuto',ready:'Vyzvednout',locked:'Zamčeno',
      games:'Kvízů',accuracy:'Úspěšnost',best:'Nejlepší skóre',
      perfect:'Bez chyby',wins:'Výhry',skill:'Úroveň znalostí',
      video:'🎮 Videohry',memes:'😂 Memy',million:'💰 Milionová výzva',
      checkpoint:'Nejvyšší otázka',outOf:'z',completed:'splněno',
      reward:'Odměna',claiming:'Vyzvedávám ověřenou odměnu…',
      granted:'✅ Odměna připsána do FOXEY Arcade:',duplicate:'Tento odznak už máš vyzvednutý.',
      claimError:'⚠️ Odměnu se nepodařilo vyzvednout.',
      unauthorized:'Odměny nejsou na účtu zatím aktivní. Prověř stav odměn na hlavní stránce Arcade.',
      caption:'Odznaky lze vyzvednout jen jednou. Podmínky a skutečné odměny ověřuje server.',
      categoryLevel:'Kategorie se hodnotí samostatně. Nejde o globální level Arcade.'
    },
    en:{
      heading:'🏆 Your Progress',subtitle:'Each category has its own statistics. XP and currencies are shared across FOXEY Arcade.',
      refresh:'↻ Refresh',loading:'Loading verified statistics…',
      logIn:'Sign in to view your statistics.',error:'⚠️ Could not load statistics.',
      badges:'🎖️ Quizoria Milestones',claimed:'Claimed',ready:'Claim reward',locked:'Locked',
      games:'Quizzes',accuracy:'Accuracy',best:'Best Score',
      perfect:'Perfect',wins:'Wins',skill:'Knowledge level',
      video:'🎮 Video Games',memes:'😂 Memes',million:'💰 Million Challenge',
      checkpoint:'Highest Question',outOf:'of',completed:'completed',
      reward:'Reward',claiming:'Claiming your verified reward…',
      granted:'✅ Reward added to FOXEY Arcade:',duplicate:'This milestone was already claimed.',
      claimError:'⚠️ Could not claim this reward.',
      unauthorized:'Rewards are not yet active for this account. Check the main Arcade reward status.',
      caption:'Every badge can be claimed only once. Eligibility and actual wallet rewards are checked by the server.',
      categoryLevel:'Category knowledge levels are separate from the global Arcade level.'
    }
  };
  let lang='cs',api=null,userId=null,data=null,requestId=0,busy=false,afterClaim=null;
  const tr=k=>localeText[lang][k]||k;
  const num=v=>new Intl.NumberFormat(lang==='cs'?'cs-CZ':'en-US').format(Number(v)||0);
  const safe=(v,min=0)=>Math.max(min,Number.isFinite(+v)?+v:0);
  function status(msg,error=false){
    const el=$('quizoriaProgressStatus');el.textContent=msg||'';
    el.classList.toggle('error',!!error);
  }
  function renderCategories(){
    const parent=$('quizoriaCategoryStats');parent.replaceChildren();
    if(!data?.categories)return;
    const catalog=[
      {id:'video_games',label:'video',theme:'video'},
      {id:'memes',label:'memes',theme:'memes'},
      {id:'million',label:'million',theme:'million'}
    ];
    for(const item of catalog){
      const c=data.categories[item.id]||{};
      const isMillion=item.id==='million';
      const games=safe(c.games),correct=safe(c.correct),answered=safe(c.answered);
      const percent=answered>0?Math.round(correct/answered*100):0;
      const best=safe(c.best),level=safe(c.skill_level,1);
      const outer=create('article','qp-stat-card qp-'+item.theme);
      const header=create('div','qp-stat-title');
      header.append(create('strong','',tr(item.label)),
        create('span','qp-level',tr('skill')+' '+num(level)));
      const tiles=create('div','qp-stat-grid');
      const values=[
        [tr('games'),num(games)],
        [isMillion?tr('wins'):tr('accuracy'),
          isMillion?num(c.wins):String(percent)+' %'],
        [isMillion?tr('checkpoint'):tr('perfect'),
          isMillion?num(c.highest_stage)+'/15':num(c.perfect)],
        [tr('best'),num(best)]
      ];
      for(const [label,val] of values){
        const tile=create('div','qp-stat-cell');
        tile.append(create('span','',label),create('b','',val));
        tiles.append(tile);
      }
      outer.append(header,tiles);parent.append(outer);
    }
  }
  function renderBadges(){
    const parent=$('quizoriaMilestones');parent.replaceChildren();
    const badges=Array.isArray(data?.milestones)?data.milestones:[];
    const unlocked=badges.filter(x=>x.claimed).length;
    $('quizoriaMilestoneCount').textContent=num(unlocked)+' / '+num(badges.length);
    for(const b of badges){
      const progress=Math.min(safe(b.progress),safe(b.target,1));
      const target=safe(b.target,1);
      const claimed=b.claimed===true, ready=progress>=target&&!claimed;
      const card=create('article','qp-milestone'+(claimed?' is-claimed':ready?' is-ready':' is-locked'));
      const icon=create('span','qp-badge-icon',String(b.icon||'🏅'));
      icon.setAttribute('aria-hidden','true');
      const main=create('div','qp-badge-body');
      main.append(create('strong','',b['name_'+lang]||''),
        create('small','',b['description_'+lang]||''));
      const progressRow=create('div','qp-badge-progress');
      const track=create('div','qp-badge-track');
      const fill=create('span','');
      fill.style.width=(100*progress/target)+'%';track.append(fill);
      progressRow.append(track,create('span','',num(progress)+' / '+num(target)));
      const reward=[];
      if(b.reward_xp>0)reward.push('✨ '+num(b.reward_xp)+' XP');
      if(b.reward_crowns>0)reward.push('👑 '+num(b.reward_crowns));
      if(b.reward_shards>0)reward.push('💎 '+num(b.reward_shards));
      const award=create('small','qp-badge-reward',tr('reward')+': '+reward.join(' · '));
      main.append(progressRow,award);
      const action=create('button','qp-badge-action',tr(claimed?'claimed':ready?'ready':'locked'));
      action.type='button';
      action.disabled=!ready||busy;
      if(ready){
        action.dataset.code=String(b.code||'');
        action.addEventListener('click',()=>void claim(b.code));
      }
      card.append(icon,main,action);
      parent.append(card);
    }
  }
  function render(){
    $('quizoriaProgressTitle').textContent=tr('heading');
    $('quizoriaProgressSub').textContent=tr('subtitle');
    $('quizoriaProgressRefresh').textContent=tr('refresh');
    $('quizoriaMilestoneTitle').textContent=tr('badges');
    $('quizoriaProgressFoot').textContent=tr('caption')+' '+tr('categoryLevel');
    $('quizoriaProgressRefresh').disabled=busy||!userId;
    if(!data){
      $('quizoriaCategoryStats').replaceChildren();
      $('quizoriaMilestones').replaceChildren();
      $('quizoriaMilestoneCount').textContent='—';
      return;
    }
    renderCategories();renderBadges();
  }
  async function refresh(silent=false){
    if(!api||!userId){
      data=null;render();status(tr('logIn'));return;
    }
    const mine=userId,seq=++requestId;
    if(!silent)status(tr('loading'));
    try{
      const {data:result,error}=await api.rpc('quizoria_progress');
      if(error||result?.ok!==true||!result?.categories||!Array.isArray(result?.milestones))
        throw error||Error('progress_invalid');
      if(seq!==requestId||mine!==userId)return;
      data=result;render();if(!silent)status('');
    }catch(e){
      if(seq!==requestId||mine!==userId)return;
      if(!silent)status(tr('error')+' '+(e?.message||''),true);
      console.warn('Quizoria progress fetch failed',e);
    }
  }
  async function claim(code){
    if(busy||!userId||!api||!data||typeof code!=='string')return;
    if(!data.milestones?.some(x=>x.code===code&&x.progress>=x.target&&!x.claimed))return;
    busy=true;render();status(tr('claiming'));
    const mine=userId;
    try{
      const {data:receipt,error}=await api.rpc('quizoria_claim_milestone',{p_code:code});
      if(error||receipt?.ok!==true)throw error||Error('claim_invalid');
      if(mine!==userId)return;
      status(receipt.already_claimed?tr('duplicate'):
        tr('granted')+' ✨ '+num(receipt.xp)+' XP · 👑 '+num(receipt.crowns)+
        (receipt.shards?' · 💎 '+num(receipt.shards):''));
      // Refresh only verified account stats, never adjust UI wallet locally.
      await refresh(true);
      if(!receipt.already_claimed){
        try{afterClaim?.();}catch(e){console.warn('Quizoria wallet refresh unavailable',e);}
        try{navigator.vibrate?.([30,45,30]);}catch(_){}
      }
    }catch(e){
      if(mine===userId){
        status((String(e?.message||'').includes('verified_rewards_not_active')?
          tr('unauthorized'):tr('claimError')+' '+(e?.message||'')),true);
      }
    }finally{busy=false;render();}
  }
  $('quizoriaProgressRefresh').addEventListener('click',()=>void refresh());
  window.QUIZORIA_PROGRESS=Object.freeze({
    connect(client,user){
      const next=user?.id||null;
      if(userId===next&&api===client)return;
      userId=next;api=client;data=null;requestId++;busy=false;
      render();if(next)void refresh();
      else status(tr('logIn'));
    },
    setLocale(next){lang=next==='en'?'en':'cs';render();},
    refresh(){return refresh(true);},
    setAfterClaim(callback){afterClaim=typeof callback==='function'?callback:null;}
  });
  render();
})();