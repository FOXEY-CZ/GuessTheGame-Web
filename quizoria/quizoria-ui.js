/* Quizoria 1.0 — accessible category picker, no modification of game state. */
(()=>{
  'use strict';
  const catalog=window.QUIZORIA_CATALOG;
  const root=document.getElementById('quizoriaCategories');
  if(!root||!catalog)return;
  const $=id=>document.getElementById(id);
  const create=(tag,cls,value)=>{
    const element=document.createElement(tag);
    if(cls)element.className=cls;
    if(value!==undefined)element.textContent=value;
    return element;
  };
  let lang='cs',active=catalog.defaultCategory,onOpenModes=null;
  const words={
    cs:{quickTitle:'Rychlá hra',quickDesc:'Pusť se rovnou do 10 otázek z videoher. Pravidla a uložený postup zůstávají stejné.',
      quickStart:'▶ Hrát hned',quickResume:'⏯ Pokračovat',
      memeFeatured:'Guess the Meme',memeFeaturedSub:'Obrázkové otázky, denní kvíz a výzvy s přáteli',memeFeaturedLaunch:'▶ Hrát memy',
      moviesFeatured:'Filmy a seriály',moviesFeaturedSub:'96 otázek, emoji indicie a filmové souboje',moviesFeaturedLaunch:'▶ Hrát filmy',
      futureSummary:'✨ Další připravované režimy',rewardsSummary:'💎 XP, odměny a synchronizace',
      modesTitle:'🧠 Herní režimy',modesDesc:'Vyber si režim pro kategorii Videohry. Další režimy budeme postupně přidávat.',
      categoryTitle:'🎮 Kategorie',categoryDesc:'Tři hratelné kategorie: Videohry, Memy a Filmy a seriály.',
      socialTitle:'⚔️ Výzvy s přáteli',socialDesc:'Pošli kamarádovi výzvu nebo ho pozvi do živého souboje.',
      survival:'Přežití',survivalSub:'Odpovídej bez chyb a překonávej své rekordy.',
      endless:'Nekonečný kvíz',endlessSub:'Hraj tak dlouho, jak budeš chtít.',
      header:'Vyber si svůj kvízový svět',sub:'Videohry, Memy nebo Filmy a seriály — vyber si svůj svět.',
      active:'HRATELNÉ',planned:'PŘIPRAVUJEME',selected:'Vybraná kategorie',
      modeIntro:'🎯 Další režimy · Videohry',
      note:'Videohry, Memy i Filmy a seriály mají vlastní serverově ověřované otázky a savy.',
      millionaire:'💰 Milionová výzva',millionaireSub:'15 otázek · záchytné body · tři nápovědy',
      future:'BRZY',play:'HRÁT',button:'🎮 Vybrat režim'},
    en:{quickTitle:'Quick Game',quickDesc:'Jump straight into 10 video game questions. Your rules and existing progress stay the same.',
      quickStart:'▶ Play now',quickResume:'⏯ Resume',
      memeFeatured:'Guess the Meme',memeFeaturedSub:'Picture trivia, daily quizzes and friend challenges',memeFeaturedLaunch:'▶ Play Memes',
      moviesFeatured:'Movies & Series',moviesFeaturedSub:'96 trivia questions, emoji clues and friend duels',moviesFeaturedLaunch:'▶ Play Movies',
      futureSummary:'✨ More coming modes',rewardsSummary:'💎 XP, rewards & sync',
      modesTitle:'🧠 Game Modes',modesDesc:'Choose a mode for Video Games. More modes will be added over time.',
      categoryTitle:'🎮 Categories',categoryDesc:'Three playable categories: Video Games, Memes and Movies & Series.',
      socialTitle:'⚔️ Friend Challenges',socialDesc:'Send a friend a challenge or invite them to a live duel.',
      survival:'Survival',survivalSub:'Keep answering correctly and beat your records.',
      endless:'Endless Quiz',endlessSub:'Play for as long as you like.',
      header:'Choose your quiz world',sub:'Choose Video Games, Memes or Movies & Series.',
      active:'PLAYABLE',planned:'COMING SOON',selected:'Selected category',
      modeIntro:'🎯 More modes · Video Games',
      note:'Video Games, Memes and Movies & Series each have securely verified questions and saves.',
      millionaire:'💰 Million Challenge',millionaireSub:'15 questions · checkpoints · three lifelines',
      future:'SOON',play:'PLAY',button:'🎮 Choose a mode'}
  };
  function render(){
    const t=words[lang];
    for(const [id,key] of Object.entries({
      quizoriaQuickTitle:'quickTitle',quizoriaQuickDescription:'quickDesc',
      quizoriaQuickStart:'quickStart',quizoriaQuickContinue:'quickResume',
      quizoriaFutureSummary:'futureSummary',quizoriaRewardsSummary:'rewardsSummary',
      quizoriaModesTitle:'modesTitle',quizoriaModesDescription:'modesDesc',
      quizoriaCategorySectionTitle:'categoryTitle',
      quizoriaCategorySectionDescription:'categoryDesc',
      quizoriaSocialTitle:'socialTitle',quizoriaSocialDescription:'socialDesc',
      quizoriaSurvivalTitle:'survival',quizoriaSurvivalSubtitle:'survivalSub',
      quizoriaEndlessTitle:'endless',quizoriaEndlessSubtitle:'endlessSub',
      quizoriaMemeFeatureTitle:'memeFeatured',quizoriaMemeFeatureDescription:'memeFeaturedSub',
      quizoriaMemeFeatureLaunch:'memeFeaturedLaunch',
      quizoriaMovieFeatureTitle:'moviesFeatured',quizoriaMovieFeatureDescription:'moviesFeaturedSub',
      quizoriaMovieFeatureLaunch:'moviesFeaturedLaunch'
    })){
      const target=$(id);if(target)target.textContent=t[key];
    }
    for(const id of ['quizoriaMillionBadge','quizoriaSurvivalBadge',
      'quizoriaEndlessBadge']){
      const target=$(id);if(target)target.textContent=t.future;
    }
    $('quizoriaCategoriesTitle').textContent=t.header;
    $('quizoriaCategoriesIntro').textContent=t.sub;
    $('quizoriaCategoryNote').textContent=t.note;
    $('quizoriaModeIntro').textContent=t.modeIntro;
    $('quizoriaMillionTitle').textContent=t.millionaire;
    $('quizoriaMillionSubtitle').textContent=t.millionaireSub;
    $('quizoriaMillionBadge').textContent=t.play;
    root.replaceChildren();
    for(const category of catalog.categories){
      const available=category.state==='available',selected=available&&category.id===active;
      const element=create(available?'button':'article','quizoria-category'+
        (selected?' selected':'')+(available?' is-available':' is-planned'));
      if(available){
        element.type='button';
        element.dataset.categoryId=category.id;
        element.setAttribute('aria-pressed',String(selected));
        element.setAttribute('aria-label',category[lang].name+
          (selected?' · '+t.selected:''));
        element.addEventListener('click',()=>{
          active=category.id;
          render();
          onOpenModes?.(category.id);
        });
      }else element.setAttribute('aria-disabled','true');
      const icon=create('span','quizoria-category-icon',category.icon);
      icon.setAttribute('aria-hidden','true');
      const info=create('span','quizoria-category-info');
      const label=create('strong','',category[lang].name);
      const desc=create('small','',category[lang].description);
      info.append(label,desc);
      const status=create('span','quizoria-category-status '+(available?'live':'future'),
        available?(selected?'✓ '+t.active:t.active):t.planned);
      element.append(icon,info,status);
      root.append(element);
    }
  }
  window.QUIZORIA_UI=Object.freeze({
    setLocale(next){lang=next==='en'?'en':'cs';render();},
    setOpenModes(fn){if(typeof fn==='function')onOpenModes=fn;},
    selectCategory(id){if(catalog.getCategory(id)?.state==='available'){active=id;render();}},
    currentCategory(){return active;},
    canPlayMode(mode){return catalog.canPlay(active,mode);}
  });
  render();
})();