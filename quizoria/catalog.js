/* Quizoria 1.0 — versioned, presentation-only category registry.
 * Existing server modes and user saves retain all their original IDs.
 * New categories MUST NOT become playable until secure server question banks
 * and reward/multiplayer validation explicitly support their category IDs. */
(()=>{
  'use strict';
  const categories=[
    {id:'video-games',icon:'🎮',state:'available',
      allowedModes:['classic','mystery','daily','easy','medium','hard'],
      cs:{name:'Videohry',description:'Hry podle indicií, obtížností a tajemných nápověd.'},
      en:{name:'Video Games',description:'Identify games from clues, difficulties and mystery hints.'}},
    {id:'memes',icon:'😂',state:'available',allowedModes:['classic','easy','medium','hard','daily','friend'],
      cs:{name:'Memy',description:'Poznávej legendární memy, hlášky a jejich pointy podle obrázků.'},
      en:{name:'Memes',description:'Recognize famous memes, captions and punchlines from pictures.'}},
    {id:'movies',icon:'🎬',state:'available',allowedModes:['classic','films','series','easy','medium','hard','daily','friend'],
      cs:{name:'Filmy a seriály',description:'Poznávej filmy, seriály, postavy a filmové světy.'},
      en:{name:'Movies & Series',description:'Recognize movies, shows, characters and fictional worlds.'}},
    {id:'music',icon:'🎵',state:'available',allowedModes:['classic','czsk','world','easy','medium','hard','daily','friend'],
      cs:{name:'Hudba',description:'Interpreti, hudební zajímavosti a alba.'},
      en:{name:'Music',description:'Artists, music trivia and albums.'}},
    {id:'general',icon:'🌍',state:'available',allowedModes:['classic','geography','history','science','technology','easy','medium','hard','daily','friend'],
      cs:{name:'Všeobecné znalosti',description:'Zeměpis, historie, věda a zajímavosti.'},
      en:{name:'General Knowledge',description:'Geography, history, science and trivia.'}}
  ].map(category=>Object.freeze({
    ...category,
    allowedModes:Object.freeze(category.allowedModes),
    cs:Object.freeze(category.cs),
    en:Object.freeze(category.en)
  }));
  const frozen=Object.freeze(categories);
  window.QUIZORIA_CATALOG=Object.freeze({
    version:'1.6',
    categories:frozen,
    defaultCategory:'video-games',
    getCategory(id){return frozen.find(item=>item.id===id)||null;},
    canPlay(categoryId,mode){
      const category=frozen.find(item=>item.id===categoryId);
      return category?.state==='available'&&category.allowedModes.includes(mode);
    }
  });
})();