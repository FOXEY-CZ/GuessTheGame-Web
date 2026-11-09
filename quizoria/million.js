/* Quizoria Million Challenge 1.0 — server-authoritative standalone competition.
 * The client only renders verified RPC responses. It never calculates payouts. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const root=$('quizoriaMillionPanel');
  if(!root)return;
  const steps=[100,200,300,500,1000,2000,4000,8000,16000,32000,
               64000,125000,250000,500000,1000000];
  const dict={
    cs:{
      launch:'▶ Spustit Milionovou výzvu',resume:'⏯ Pokračovat v soutěži',
      fresh:'▶ Nová soutěž',title:'💰 Milionová výzva',
      subtitle:'15 otázek. Tři nápovědy. Jedno velké finále.',
      back:'← Zpět na výběr',loading:'🛡️ Připojuji se k bezpečné soutěži…',
      question:'Otázka',prize:'Hraješ o',banked:'Můžeš odejít s',
      checkpoint:'Jistá výhra',questionCategory:'🎮 Videohry',
      ready:'Vyber jednu odpověď. Po potvrzení ji už nepůjde změnit.',
      fifty:'✂️ 50:50',audience:'👥 Tip publika',swap:'🔄 Výměna otázky',
      cashout:'💼 Odebrat výhru',next:'Další otázka →',
      correct:'✅ Správná odpověď!',wrong:'❌ Nesprávná odpověď!',
      rightAnswer:'Správně bylo:',won:'🏆 MILION!',
      lost:'Soutěž skončila',cashed:'Odcházíš s výhrou',
      expired:'Soutěž vypršela',result:'Tvoje soutěžní výhra',
      earned:'Ověřená odměna FOXEY Arcade',noCredit:'Bez další odměny do společné peněženky.',
      capped:'Denní limit odměn už byl vyčerpán.',unavailable:'Odměny zatím nejsou pro účet aktivní.',
      simulated:'Simulovaný tip publika (nejde o hlasování skutečných hráčů)',
      network:'⚠️ Požadavek se nepodařilo potvrdit. Použij „Opakovat požadavek“.',
      retry:'↻ Opakovat požadavek', ladder:'🏆 Žebříček částek',
      another:'▶ Hrát znovu',soundOn:'🔊 Zvuky zapnuté',soundOff:'🔇 Zvuky vypnuté',
      quitConfirm:'Opravdu odejít se současnou soutěžní výhrou {sum}? Partie bude dokončena.',
      payNote:'Soutěžní částky nejsou skutečné korunky. Odměny do Arcade připisuje pouze server.',
      signedOut:'Přihlas se do FOXEY Arcade, aby šla soutěž spustit.',
      activeHint:'Rozehraná soutěž je uložená na serveru a lze se k ní později vrátit.',
      continue:'Pokračovat',busy:'Pracuji s ověřeným výsledkem…',
      pickTitle:'🎯 Vyber kategorii soutěže',pickIntro:'Každá kategorie má vlastní otázky a rozehranou soutěž.',
      startCategory:'▶ Zahájit soutěž',resumeCategory:'⏯ Pokračovat v soutěži',
      savedCategory:'Uloženo · otázka',newCategory:'Zatím neodehráno — můžeš začít.',
      backToCategory:'← Zpět na kategorie',changeCategory:'Vybrat kategorii',
      sourceLabel:'Zdroj obrázku',
      empty:'Milionová výzva zatím nebyla spuštěná.',audienceTip:'Nápověda publika'
    },
    en:{
      launch:'▶ Play Million Challenge',resume:'⏯ Resume Challenge',
      fresh:'▶ New challenge',title:'💰 Million Challenge',
      subtitle:'15 questions. Three lifelines. One big finale.',
      back:'← Back to menu',loading:'🛡️ Connecting to secure challenge…',
      question:'Question',prize:'Playing for',banked:'You can walk with',
      checkpoint:'Guaranteed prize',questionCategory:'🎮 Video Games',
      ready:'Choose one answer. Once confirmed, it cannot be changed.',
      fifty:'✂️ 50:50',audience:'👥 Audience tip',swap:'🔄 Swap question',
      cashout:'💼 Walk away',next:'Next question →',
      correct:'✅ Correct answer!',wrong:'❌ Wrong answer!',
      rightAnswer:'Correct answer:',won:'🏆 ONE MILLION!',
      lost:'Challenge over',cashed:'You walked away with',
      expired:'Challenge expired',result:'Your challenge prize',
      earned:'Verified FOXEY Arcade reward',noCredit:'No extra reward credited to the shared wallet.',
      capped:'Daily reward limit reached.',unavailable:'Rewards are not enabled for this account.',
      simulated:'Simulated audience prediction (not votes by real players)',
      network:'⚠️ The request could not be confirmed. Use “Retry request”.',
      retry:'↻ Retry request',ladder:'🏆 Prize ladder',
      another:'▶ Play again',soundOn:'🔊 Sound on',soundOff:'🔇 Sound off',
      quitConfirm:'Walk away with your current challenge prize of {sum}? This ends the run.',
      payNote:'Contest amounts are not real crowns. Arcade rewards are credited only by the server.',
      signedOut:'Sign in to FOXEY Arcade to play this challenge.',
      activeHint:'Your active challenge is saved on the server and can be resumed later.',
      continue:'Continue',busy:'Verifying your action…',
      pickTitle:'🎯 Choose a quiz category',pickIntro:'Each category has its own questions and saved run.',
      startCategory:'▶ Start challenge',resumeCategory:'⏯ Resume challenge',
      savedCategory:'Saved · question',newCategory:'No challenge yet — ready to start.',
      backToCategory:'← Back to categories',changeCategory:'Choose category',
      sourceLabel:'Image source',
      empty:'No Million Challenge run yet.',audienceTip:'Audience lifeline'
    }
  };
  let locale='cs', client=null,uid=null,run=null,opened=false;
  let selectedCategory='video-games',pickerOpen=true,lastAnsweredQuestion=null;
  let busy=false,pending=null,awaitNext=false,feedback=null;
  let muted=false,audioCtx=null,requestNumber=0;
  const tr=key=>dict[locale][key]||key;
  const categoryNames={
    cs:{'video-games':'🎮 Videohry','memes':'😂 Memy','movies':'🎬 Filmy a seriály','music':'🎵 Hudba'},
    en:{'video-games':'🎮 Video Games','memes':'😂 Memes','movies':'🎬 Movies & Series','music':'🎵 Music'}
  };
  const currentName=()=>categoryNames[locale][selectedCategory]||selectedCategory;
  const money=n=>new Intl.NumberFormat(locale==='cs'?'cs-CZ':'en-US')
    .format(Math.max(0,Number(n)||0));
  try{muted=localStorage.getItem('quizoria.million.sound.v1')==='off';}catch(_){}
  function tone(kind){
    if(muted)return;
    try{
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)return;
      if(!audioCtx)audioCtx=new Audio();
      if(audioCtx.state==='suspended')void audioCtx.resume();
      const notes=kind==='win'?[523,659,784,1046]:
        kind==='correct'?[587,784]:kind==='wrong'?[350,260]:[440];
      notes.forEach((hz,i)=>{
        const oscillator=audioCtx.createOscillator(),gain=audioCtx.createGain();
        const t=audioCtx.currentTime+i*.13;
        oscillator.type=kind==='wrong'?'triangle':'sine';
        oscillator.frequency.value=hz;
        gain.gain.setValueAtTime(.0001,t);
        gain.gain.exponentialRampToValueAtTime(.11,t+.015);
        gain.gain.exponentialRampToValueAtTime(.0001,t+.19);
        oscillator.connect(gain);gain.connect(audioCtx.destination);
        oscillator.start(t);oscillator.stop(t+.21);
      });
    }catch(_){}
    try{navigator.vibrate?.(kind==='wrong'?[90,55,90]:[30]);}catch(_){}
  }
  function writeStatus(value,error=false){
    const node=$('millionStatus');
    node.textContent=value||'';
    node.classList.toggle('error',error);
  }
  function showPanel(show){
    const wasOpen=opened;
    opened=show;
    if(show)$('modePanel')?.classList.add('hidden');
    else if(wasOpen&&uid)$('modePanel')?.classList.remove('hidden');
    root.classList.toggle('hidden',!show);
    document.body?.classList.toggle('quiz-playing',show&&!pickerOpen&&run?.status==='active');
    document.body?.classList.toggle('quiz-finished',show&&!pickerOpen&&!!run&&run.status!=='active');
    if(show)root.scrollIntoView?.({block:'start',behavior:'smooth'});
    updateLaunch();
  }
  function updateLaunch(){
    const button=$('quizoriaMillionLaunch');
    if(!button)return;
    button.textContent=tr('launch');
    button.disabled=busy||!uid;
  }
  function showReward(reward){
    const node=$('millionReward');
    if(!node)return;
    if(!reward){node.textContent=tr('noCredit');return;}
    if(reward.reason==='credited'){
      node.textContent=tr('earned')+': ✨ +'+money(reward.xp)+
        ' XP · 👑 +'+money(reward.crowns)+(reward.shards?' · 💎 +'+reward.shards:'');
    }else if(reward.reason==='daily_limit')node.textContent=tr('capped');
    else if(reward.reason==='not_activated')node.textContent=tr('unavailable');
    else node.textContent=tr('noCredit');
  }
  const make=(tag,cls,txt)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(txt!==undefined)el.textContent=txt;
    return el;
  };
  function renderLadder(){
    const node=$('millionLadderList');node.replaceChildren();
    steps.forEach((amount,i)=>{
      const row=make('div','million-ladder-row',String(i+1).padStart(2,'0')+' · '+money(amount));
      row.classList.toggle('active',!!run&&run.status==='active'&&run.stage===i);
      row.classList.toggle('cleared',!!run&&i<run.stage);
      row.classList.toggle('checkpoint',i===4||i===9||i===14);
      node.prepend(row);
    });
  }
  function localizeStatic(){
    const ids={
      millionTitle:'title',millionSubtitle:'subtitle',
      millionFifty:'fifty',
      millionAudience:'audience',millionSwap:'swap',
      millionCashout:'cashout',millionNext:'next',
      millionRetry:'retry',millionAnother:'another',
      millionLadderLabel:'ladder',millionLegalNote:'payNote',
      millionAudienceNote:'simulated'
    };
    for(const [id,key] of Object.entries(ids)){
      if($(id))$(id).textContent=tr(key);
    }
    $('millionSound').textContent=tr(muted?'soundOff':'soundOn');
    $('millionPickTitle').textContent=tr('pickTitle');
    $('millionPickIntro').textContent=tr('pickIntro');
    for(const button of root.querySelectorAll('[data-million-category]')){
      button.textContent=categoryNames[locale][button.dataset.millionCategory]||button.dataset.millionCategory;
    }
    render();
  }
  function renderPicker(){
    $('millionCategory').textContent=currentName();
    root.querySelectorAll('[data-million-category]').forEach(button=>{
      const selected=button.dataset.millionCategory===selectedCategory;
      button.classList.toggle('is-selected',selected);
      button.setAttribute('aria-pressed',String(selected));
      button.disabled=busy;
    });
    const active=run?.category===selectedCategory&&run.status==='active';
    $('millionSelectedState').textContent=active?
      tr('savedCategory')+' '+Math.min(run.stage+1,15)+' / 15':
      tr('newCategory');
    $('millionBeginSelected').textContent=tr(active?'resumeCategory':'startCategory');
    $('millionBeginSelected').disabled=busy||!uid;
    $('millionCategoryPicker').classList.toggle('hidden',!pickerOpen);
    $('millionGameContent').classList.toggle('hidden',pickerOpen);
    $('millionBack').textContent=tr(pickerOpen?'back':'backToCategory');
  }
  function displayAnswer(choice,q){
    const idx=Array.isArray(q?.options)?q.options.indexOf(choice):-1;
    const labels=Array.isArray(q?.option_labels)?q.option_labels:[];
    return idx>=0&&labels[idx]?.[locale]?labels[idx][locale]:String(choice||'');
  }
  function renderMedia(q){
    const media=$('millionQuestionMedia');
    const visual=$('millionVisual'),img=$('millionImage'),clue=$('millionClue'),credit=$('millionImageCredit');
    const symbol=String(q?.visual||'');
    const imageUrl=String(q?.image_url||'');
    const picture=imageUrl.startsWith('https://commons.wikimedia.org/wiki/Special:FilePath/');
    const source=String(q?.source_url||'');
    const hint=String(q?.['clue_'+locale]||'');
    const hasMedia=!!symbol||picture||!!hint;
    media.classList.toggle('hidden',!hasMedia);
    visual.classList.toggle('hidden',!symbol);visual.textContent=symbol;
    img.classList.toggle('hidden',!picture);
    if(picture&&img.dataset.src!==imageUrl){img.dataset.src=imageUrl;img.src=imageUrl;}
    if(!picture){img.removeAttribute('src');delete img.dataset.src;}
    clue.classList.toggle('hidden',!hint);clue.textContent=hint;
    credit.classList.toggle('hidden',!(picture&&source.startsWith('https://commons.wikimedia.org/wiki/File:')));
    credit.textContent=tr('sourceLabel');
    if(source.startsWith('https://commons.wikimedia.org/wiki/File:'))credit.href=source;
  }
  function render(){
    renderPicker();
    if(opened){
      document.body?.classList.toggle('quiz-playing',!pickerOpen&&!!run&&run.status==='active');
      document.body?.classList.toggle('quiz-finished',!pickerOpen&&!!run&&run.status!=='active');
    }
    updateLaunch();if(!run){return;}
    $('millionCurrentStage').textContent=tr('question')+' '+Math.min(run.stage+1,15)+' / 15';
    $('millionPrize').textContent=tr('prize')+' '+money(steps[Math.min(run.stage,14)]);
    $('millionBanked').textContent=tr('banked')+' '+money(run.banked);
    $('millionCheckpoint').textContent=tr('checkpoint')+': '+
      money(run.stage>=10?32000:run.stage>=5?1000:0);
    $('millionProgressFill').style.width=(Math.max(0,run.stage)/15*100)+'%';
    $('millionProgressFill').parentElement.setAttribute('aria-valuenow',String(run.stage));
    $('millionFifty').disabled=busy||!!pending||run.used?.fifty;
    $('millionAudience').disabled=busy||!!pending||run.used?.audience;
    $('millionSwap').disabled=busy||!!pending||run.used?.swap;
    $('millionCashout').disabled=busy||!!pending;
    $('millionRetry').classList.toggle('hidden',!pending);
    $('millionNext').classList.toggle('hidden',!awaitNext);
    $('millionAnother').classList.toggle('hidden',run.status==='active');
    $('millionQuestionArea').classList.toggle('hidden',run.status!=='active'||awaitNext);
    $('millionLifelines').classList.toggle('hidden',run.status!=='active'||awaitNext);
    $('millionCashout').classList.toggle('hidden',run.status!=='active'||awaitNext);
    $('millionFinal').classList.toggle('hidden',run.status==='active');
    $('millionNext').disabled=busy||!!pending;
    $('millionAnother').disabled=busy||!!pending;
    renderLadder();
    const feedbackNode=$('millionFeedback');
    feedbackNode.classList.toggle('hidden',!feedback);
    feedbackNode.classList.toggle('correct',!!feedback?.correct);
    feedbackNode.classList.toggle('incorrect',feedback?.correct===false);
    if(feedback){
      feedbackNode.textContent=(feedback.correct?tr('correct'):tr('wrong'))+
        (feedback.correct?'':' '+tr('rightAnswer')+' '+feedback.answer);
    }
    if(run.status!=='active'){
      const title=run.status==='won'?tr('won'):
        run.status==='lost'?tr('lost'):
        run.status==='cashed'?tr('cashed'):tr('expired');
      $('millionFinalTitle').textContent=title;
      $('millionFinalPrize').textContent=tr('result')+': '+money(run.payout);
      showReward(run.reward);
      return;
    }
    if(feedback&&awaitNext)return;
    const q=run.question;
    renderMedia(q);
    $('millionQuestion').textContent=q?.[locale]||tr('loading');
    const options=$('millionOptions');options.replaceChildren();
    const hidden=new Set(Array.isArray(q?.hidden)?q.hidden:[]);
    (Array.isArray(q?.options)?q.options:[]).forEach((answer,i)=>{
      const button=make('button','million-option');
      button.type='button';
      const letter=make('span','million-option-letter','ABCD'[i]||'?');
      const content=make('span','million-option-content',hidden.has(answer)?'—':displayAnswer(answer,q));
      button.append(letter,content);
      button.disabled=hidden.has(answer)||busy||!!pending;
      if(!button.disabled)button.addEventListener('click',()=>void act('answer',answer));
      options.append(button);
    });
    const tip=$('millionAudienceResult');tip.replaceChildren();
    if(Array.isArray(q?.audience)){
      tip.classList.remove('hidden');
      q.audience.forEach(item=>{
        const row=make('div','million-audience-row');
        const name=make('span','',displayAnswer(item.choice,q));
        const meter=make('div','million-audience-meter');
        const fill=make('div','million-audience-fill');
        fill.style.width=Math.max(0,Math.min(100,Number(item.percent)||0))+'%';
        meter.append(fill);
        const val=make('b','',String(item.percent)+' %');
        row.append(name,meter,val);tip.append(row);
      });
    }else tip.classList.add('hidden');
    $('millionAudienceNote').classList.toggle('hidden',!Array.isArray(q?.audience));
  }
  async function loadState(category=selectedCategory){
    if(!client||!uid)return;
    const seq=++requestNumber;
    try{
      const {data,error}=await client.rpc('quizoria_million_state_category',{p_category:category});
      if(error||data?.ok!==true)throw error||Error('state_unavailable');
      if(seq!==requestNumber||category!==selectedCategory)return;
      run=data.has_run?data:null;
      if(opened)render();else updateLaunch();
    }catch(err){console.warn('Quizoria million state unavailable',err);}
  }
  async function openPicker(){
    if(!uid){writeStatus(tr('signedOut'),true);return;}
    pickerOpen=true;showPanel(true);render();
    await loadState(selectedCategory);
  }
  async function switchCategory(category){
    if(busy||pending||!categoryNames.cs[category])return;
    selectedCategory=category;run=null;feedback=null;awaitNext=false;
    requestNumber++;render();writeStatus(tr('loading'));
    await loadState(category);
    writeStatus('');
  }
  async function start(forceNew=false){
    if(busy||!client||!uid){writeStatus(tr('signedOut'),true);return;}
    pickerOpen=false;
    if(!forceNew&&run?.status==='active'){
      showPanel(true);
      if(pending){
        writeStatus(tr('network'),true);
        render();
      }else{
        writeStatus(tr('loading'));render();
        await loadState();writeStatus(run?.status==='active'?tr('activeHint'):'');
      }
      return;
    }
    pickerOpen=false;
    busy=true;pending=null;feedback=null;awaitNext=false;lastAnsweredQuestion=null;
    showPanel(true);writeStatus(tr('loading'));
    render();
    const seq=++requestNumber;
    try{
      const {data,error}=await client.rpc('quizoria_million_begin_category',{
        p_operation:crypto.randomUUID(),p_category:selectedCategory
      });
      if(error||data?.ok!==true||!data.has_run)throw error||Error('invalid_state');
      if(seq!==requestNumber)return;
      run=data;
      writeStatus(run.status==='active'?tr('activeHint'):'');
      tone('tap');
    }catch(err){
      writeStatus(tr('network')+' ('+(err?.message||'network')+')',true);
    }finally{busy=false;render();}
  }
  async function act(action,choice=null,retry=false){
    if(!client||!uid||!run||busy)return;
    if(!retry&&pending)return;
    if(!retry)pending={
      p_run_id:run.run_id,p_event_id:crypto.randomUUID(),p_action:action,p_choice:choice
    };
    if(!pending)return;
    const request={...pending};
    if(action==='answer'&&!retry)lastAnsweredQuestion=run.question;
    busy=true;writeStatus(tr('busy'));render();
    const seq=++requestNumber;
    try{
      const {data,error}=await client.rpc('quizoria_million_act',request);
      if(error||data?.ok!==true)throw error||Error('invalid_response');
      if(seq!==requestNumber)return;
      pending=null;run=data;writeStatus(run.status==='active'?tr('activeHint'):'');
      if(run.status!=='active')void window.QUIZORIA_PROGRESS?.refresh?.();
      if(data.answered){
        feedback={correct:data.was_correct===true,
          answer:displayAnswer(data.correct_answer,lastAnsweredQuestion||run.question)};
        awaitNext=data.was_correct===true&&data.status==='active';
        tone(data.was_correct?(data.status==='won'?'win':'correct'):'wrong');
      }else if(action==='cashout'){feedback=null;tone('win');}
      else{feedback=null;tone('tap');}
    }catch(err){
      writeStatus(tr('network')+' ('+(err?.message||'error')+')',true);
    }finally{busy=false;render();}
  }
  function close(){
    if(busy)return;
    showPanel(false);feedback=null;awaitNext=false;
    // A run is kept on the server. Returning to Arcade never forfeits it.
  }
  $('quizoriaMillionLaunch')?.addEventListener('click',()=>void openPicker());
  root.querySelectorAll('[data-million-category]').forEach(button=>{
    button.addEventListener('click',()=>void switchCategory(button.dataset.millionCategory));
  });
  $('millionBeginSelected')?.addEventListener('click',()=>void start());
  $('millionBack')?.addEventListener('click',()=>{
    if(pickerOpen)close();
    else void openPicker();
  });
  $('millionFifty')?.addEventListener('click',()=>void act('fifty'));
  $('millionAudience')?.addEventListener('click',()=>void act('audience'));
  $('millionSwap')?.addEventListener('click',()=>void act('swap'));
  $('millionCashout')?.addEventListener('click',()=>{
    if(!run||busy)return;
    if(window.confirm(tr('quitConfirm').replace('{sum}',money(run.banked))))
      void act('cashout');
  });
  $('millionRetry')?.addEventListener('click',()=>void act('',null,true));
  $('millionNext')?.addEventListener('click',()=>{
    if(!awaitNext||pending||busy)return;
    awaitNext=false;feedback=null;render();
  });
  $('millionAnother')?.addEventListener('click',()=>void openPicker());
  $('millionImage')?.addEventListener('error',()=>{
    $('millionImage').classList.add('hidden');
    $('millionImageCredit').classList.remove('hidden');
  });
  $('millionSound')?.addEventListener('click',()=>{
    muted=!muted;
    try{localStorage.setItem('quizoria.million.sound.v1',muted?'off':'on');}catch(_){}
    $('millionSound').textContent=tr(muted?'soundOff':'soundOn');
    if(!muted)tone('tap');
  });
  window.QUIZORIA_MILLION=Object.freeze({
    connect(supa,user){
      const next=user?.id||null;
      if(uid===next&&client===supa)return;
      uid=next;client=supa;run=null;busy=false;pending=null;pickerOpen=true;selectedCategory='video-games';
      feedback=null;awaitNext=false;requestNumber++;
      if(!uid){showPanel(false);updateLaunch();return;}
      void loadState();
    },
    setLocale(next){locale=next==='en'?'en':'cs';localizeStatic();},
    onMenu(){if(!opened)updateLaunch();},
    isOpen(){return opened;}
  });
  try{locale=localStorage.getItem('foxey.arcade.locale.v1')==='en'?'en':'cs';}catch(_){}
  localizeStatic();
})();
