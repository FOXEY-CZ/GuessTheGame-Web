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
      musicFeatured:'Hudba a rap',musicFeaturedSub:'96 hudebních otázek · CZ/SK rap a světová hudba',musicFeaturedLaunch:'▶ Hrát hudbu',
      generalFeatured:'Všeobecné znalosti',generalFeaturedSub:'180+ otázek · zeměpis, historie, věda, technologie',generalFeaturedLaunch:'▶ Hrát znalosti',
      futureSummary:'✨ Další připravované režimy',rewardsSummary:'💎 XP, odměny a synchronizace',
      modesTitle:'🧠 Herní režimy',modesDesc:'Vyber si režim pro kategorii Videohry. Další režimy budeme postupně přidávat.',
      categoryTitle:'🎮 Kategorie',categoryDesc:'Všech pět kategorií je hratelných — včetně Všeobecných znalostí.',
      socialTitle:'⚔️ Výzvy s přáteli',socialDesc:'Pošli kamarádovi výzvu nebo ho pozvi do živého souboje.',
      survival:'Přežití',survivalSub:'Odpovídej bez chyb a překonávej své rekordy.',
      endless:'Nekonečný kvíz',endlessSub:'Hraj tak dlouho, jak budeš chtít.',
      header:'Vyber si svůj kvízový svět',sub:'Pět kvízových světů: Videohry, Memy, Filmy, Hudba a Vědomosti.',
      active:'HRATELNÉ',planned:'PŘIPRAVUJEME',selected:'Vybraná kategorie',
      modeIntro:'🎯 Další režimy · Videohry',
      note:'Pět hratelných kategorií se zabezpečenými otázkami, savy a společnými měnami.',
      millionaire:'💰 Milionová výzva',millionaireSub:'15 otázek · záchytné body · tři nápovědy',
      future:'BRZY',play:'HRÁT',button:'🎮 Vybrat režim'},
    en:{quickTitle:'Quick Game',quickDesc:'Jump straight into 10 video game questions. Your rules and existing progress stay the same.',
      quickStart:'▶ Play now',quickResume:'⏯ Resume',
      memeFeatured:'Guess the Meme',memeFeaturedSub:'Picture trivia, daily quizzes and friend challenges',memeFeaturedLaunch:'▶ Play Memes',
      moviesFeatured:'Movies & Series',moviesFeaturedSub:'96 trivia questions, emoji clues and friend duels',moviesFeaturedLaunch:'▶ Play Movies',
      musicFeatured:'Music & Rap',musicFeaturedSub:'96 music questions · CZ/SK rap and international artists',musicFeaturedLaunch:'▶ Play Music',
      generalFeatured:'General Knowledge',generalFeaturedSub:'180+ questions · geography, history, science and technology',generalFeaturedLaunch:'▶ Play Trivia',
      futureSummary:'✨ More coming modes',rewardsSummary:'💎 XP, rewards & sync',
      modesTitle:'🧠 Game Modes',modesDesc:'Choose a mode for Video Games. More modes will be added over time.',
      categoryTitle:'🎮 Categories',categoryDesc:'All five quiz categories are now playable, including General Knowledge.',
      socialTitle:'⚔️ Friend Challenges',socialDesc:'Send a friend a challenge or invite them to a live duel.',
      survival:'Survival',survivalSub:'Keep answering correctly and beat your records.',
      endless:'Endless Quiz',endlessSub:'Play for as long as you like.',
      header:'Choose your quiz world',sub:'Five quiz worlds: Video Games, Memes, Movies, Music and Knowledge.',
      active:'PLAYABLE',planned:'COMING SOON',selected:'Selected category',
      modeIntro:'🎯 More modes · Video Games',
      note:'Five playable categories with server-verified questions, saves and shared currencies.',
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
      // Survival and Endless own their localized live labels.
      // Keep both controls playable during the category shell rerender.
      quizoriaMemeFeatureTitle:'memeFeatured',quizoriaMemeFeatureDescription:'memeFeaturedSub',
      quizoriaMemeFeatureLaunch:'memeFeaturedLaunch',
      quizoriaMovieFeatureTitle:'moviesFeatured',quizoriaMovieFeatureDescription:'moviesFeaturedSub',
      quizoriaMovieFeatureLaunch:'moviesFeaturedLaunch',
      quizoriaMusicFeatureTitle:'musicFeatured',quizoriaMusicFeatureDescription:'musicFeaturedSub',quizoriaMusicFeatureLaunch:'musicFeaturedLaunch',
      quizoriaGeneralFeatureTitle:'generalFeatured',quizoriaGeneralFeatureDescription:'generalFeaturedSub',quizoriaGeneralFeatureLaunch:'generalFeaturedLaunch'
    })){
      const target=$(id);if(target)target.textContent=t[key];
    }
    // Both Survival and Endless are live, including after switching languages.
    $('quizoriaSurvivalBadge').textContent=t.play;
    $('quizoriaEndlessBadge').textContent=t.play;
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