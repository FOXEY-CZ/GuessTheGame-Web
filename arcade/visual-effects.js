/* FOXEY Arcade 2.7 — Visual Effects controller.
 * No Supabase calls, no local/cross-account storage, no currency/XP mutations.
 * XP UI only reflects an amount validated by the existing server refresh in app.js. */
(() => {
  'use strict';
  const doc=document;
  const root=doc.querySelector('.layout');
  const toast=doc.getElementById('arcadeXpToast');
  const amount=doc.getElementById('arcadeXpToastAmount');
  const caption=doc.getElementById('arcadeXpToastCaption');
  if(!root||!toast||!amount||!caption)return;
  const reduced=()=>doc.documentElement.classList.contains('arcade-motion-minimal')
    ||!!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const desktopPointer=()=>!!window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches;
  const lightSelector=[
    '.ng-feature','.ng-quick-link','.ng-library-tile',
    '.gamecard','.sr-hero','.reward-chest',
    '.settings-card','.pc-shortcut'
  ].join(',');
  for(const card of root.querySelectorAll(lightSelector)){
    card.classList.add('fx-light-card');
  }
  let pointerPending=null,pointerFrame=0;
  root.addEventListener('pointermove',event=>{
    if(reduced()||!desktopPointer()||event.pointerType==='touch')return;
    const card=event.target?.closest?.('.fx-light-card');
    if(!card||!root.contains(card))return;
    pointerPending={card,x:event.clientX,y:event.clientY};
    if(pointerFrame)return;
    pointerFrame=window.requestAnimationFrame?.(()=>{
      pointerFrame=0;
      const pending=pointerPending;
      pointerPending=null;
      if(!pending||reduced())return;
      const box=pending.card.getBoundingClientRect();
      if(box.width<=0||box.height<=0)return;
      pending.card.style.setProperty('--fx-x',Math.max(0,Math.min(box.width,pending.x-box.left))+'px');
      pending.card.style.setProperty('--fx-y',Math.max(0,Math.min(box.height,pending.y-box.top))+'px');
    })||0;
  },{passive:true});

  let dismissTimer=null;
  const numberIds=['headerArcadeXp','homeArcadeXp','accountArcadeXp','profileStatXp'];
  const trackIds=['homeLevelFill','accountLevelFill'];
  const clear=()=>{
    if(dismissTimer!==null){clearTimeout(dismissTimer);dismissTimer=null;}
    toast.classList.add('hidden');
    toast.classList.remove('fx-xp-show','fx-level-up');
    for(const id of numberIds)doc.getElementById(id)?.classList.remove('fx-xp-flash');
    for(const id of trackIds)doc.getElementById(id)?.classList.remove('fx-xp-track-flash');
  };
  const xpAwarded=({gain,level,levelUp=false}={})=>{
    if(!Number.isSafeInteger(gain)||gain<=0||!Number.isSafeInteger(level)||level<1)return;
    clear();
    const en=window.FOXEY_I18N?.getLocale?.()==='en';
    amount.textContent='+'+gain.toLocaleString(en?'en-US':'cs-CZ')+' XP';
    caption.textContent=levelUp
      ?(en?'🎖️ New level '+level+'!':'🎖️ Nová úroveň '+level+'!')
      :(en?'Verified Arcade progress':'Ověřený postup Arcade');
    toast.classList.toggle('fx-level-up',levelUp===true);
    toast.classList.remove('hidden');
    if(!reduced()){
      toast.classList.add('fx-xp-show');
      for(const id of numberIds)doc.getElementById(id)?.classList.add('fx-xp-flash');
      for(const id of trackIds)doc.getElementById(id)?.classList.add('fx-xp-track-flash');
    }
    dismissTimer=setTimeout(clear,4100);
  };
  window.FOXEY_ARCADE_FX=Object.freeze({xpAwarded,clear});
})();