/* FOXEY Arcade 2.6 — per-browser motion accessibility preference.
 * Purely visual; never reads credentials, purchases, profiles or game saves. */
(() => {
  'use strict';
  const KEY='foxey.arcade.motion.v1';
  const select=document.getElementById('arcadeMotion');
  const hint=document.getElementById('arcadeMotionHint');
  if(!select||!hint)return;
  const allowed=new Set(['system','reduce']);
  let canStore=true;
  const read=()=>{
    try{
      const saved=localStorage.getItem(KEY);
      return allowed.has(saved)?saved:'system';
    }catch(_){canStore=false;return 'system';}
  };
  const isEnglish=()=>window.FOXEY_I18N?.getLocale?.()==='en';
  let mode=read();
  const render=()=>{
    select.value=mode;
    document.documentElement.classList.toggle('arcade-motion-minimal',mode==='reduce');
    const en=isEnglish();
    hint.textContent=mode==='reduce'
      ?(en?'Animations in the Arcade interface are reduced on this device.'
          :'Animace rozhraní Arcade jsou v tomto zařízení omezené.')
      :(en?'Following device motion preferences, including reduced motion.'
          :'Používá se nastavení pohybu zařízení včetně omezených animací.');
    if(!canStore)hint.textContent+=' '+
      (en?'(This browser cannot save the preference.)'
         :' (Prohlížeč tuto volbu neumožňuje uložit.)');
  };
  const setMode=(value,persist)=>{
    if(!allowed.has(value))return;
    mode=value;
    if(persist){
      try{localStorage.setItem(KEY,value);}
      catch(_){canStore=false;}
    }
    render();
  };
  select.addEventListener('change',()=>setMode(select.value,true));
  window.addEventListener('storage',event=>{
    if(event.key===KEY)setMode(allowed.has(event.newValue)?event.newValue:'system',false);
  });
  window.addEventListener('foxey-arcade:locale-changed',render);
  render();
})();