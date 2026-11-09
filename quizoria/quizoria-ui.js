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
    cs:{header:'Vyber si svůj kvízový svět',sub:'Každá kategorie dostane vlastní otázky. První hratelnou kategorií jsou Videohry.',
      active:'HRATELNÉ',planned:'PŘIPRAVUJEME',selected:'Vybraná kategorie',
      modeIntro:'🎯 Režimy a rozehrané partie pro kategorii Videohry',
      note:'Další kategorie připravujeme. Zatím používáme stávající bezpečně ověřované otázky z Guess the Game.',
      millionaire:'💰 Milionová výzva',millionaireSub:'15 otázek, záchytné body a nápovědy. Brzy v Quizorii.',
      future:'BRZY',button:'🎮 Vybrat režim'},
    en:{header:'Choose your quiz world',sub:'Each category will have its own question bank. Video Games is the first playable category.',
      active:'PLAYABLE',planned:'COMING SOON',selected:'Selected category',
      modeIntro:'🎯 Modes and saved runs for Video Games',
      note:'More categories are in development. For now, the original Guess the Game questions remain securely verified by the server.',
      millionaire:'💰 Million Challenge',millionaireSub:'15 questions, checkpoints and lifelines. Coming to Quizoria.',
      future:'SOON',button:'🎮 Choose a mode'}
  };
  function render(){
    const t=words[lang];
    $('quizoriaCategoriesTitle').textContent=t.header;
    $('quizoriaCategoriesIntro').textContent=t.sub;
    $('quizoriaCategoryNote').textContent=t.note;
    $('quizoriaModeIntro').textContent=t.modeIntro;
    $('quizoriaMillionTitle').textContent=t.millionaire;
    $('quizoriaMillionSubtitle').textContent=t.millionaireSub;
    $('quizoriaMillionBadge').textContent=t.future;
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
          onOpenModes?.();
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
    currentCategory(){return active;},
    canPlayMode(mode){return catalog.canPlay(active,mode);}
  });
  render();
})();