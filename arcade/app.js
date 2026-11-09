/* FOXEY Arcade — central platform shell, deliberately separate from game logic.
 * Browser-safe Supabase publishable key only. Never mutate Guess the Game saves.
 * All shop purchases and chest draws use server-authorized RPC transactions. */
(() => {
  'use strict';
  // Defense in depth: if the early document redirect is delayed, never let
  // the Arcade SPA router overwrite recovery tokens.
  if(new URLSearchParams(location.search).get('auth')==='recovery'){
    const target=new URL('./reset.html',location.href);
    const params=new URLSearchParams(location.search);
    params.delete('auth');
    target.search=params.toString();
    target.hash=location.hash;
    location.replace(target.href);
    return;
  }
  const el = id => document.getElementById(id);
  const cfg = window.FOXEY_ARCADE_CONFIG;
  const AVATARS = Object.freeze({fox:'🦊',robot:'🤖',alien:'👽',crown:'👑',glitch:'⚡'});
  const AVATAR_CATALOG=Object.freeze({
    fox:{name:'Liška',rarity:'basic'},robot:{name:'Robot',rarity:'basic'},
    alien:{name:'Mimozemšťan',rarity:'basic'},crown:{name:'Koruna',rarity:'basic'},
    glitch:{name:'Glitch',rarity:'legendary'},
    'pixel-fox':{name:'Pixel Fox',rarity:'basic'},
    'neon-ghost':{name:'Neon Ghost',rarity:'basic'},
    'space-cat':{name:'Space Cat',rarity:'basic'},
    'cyber-fox':{name:'Cyber Fox',rarity:'epic'},
    'arcade-dragon':{name:'Arcade Dragon',rarity:'epic'},
    'legend-fox':{name:'Legendární FOXEY',rarity:'legendary'}
  });
  const CHEST_POOLS=Object.freeze({
    basic:['pixel-fox','neon-ghost','space-cat'],
    epic:['cyber-fox','arcade-dragon']
  });
  // Same exact SVG art as Guess the Game, loaded from a trusted static asset.
  const avatarMarkup=id=>window.FOXEY_AVATAR_ART?.[id]||null;
  function showAvatar(id, target){
    const markup=avatarMarkup(id);
    if(markup)target.innerHTML=markup;
    else target.textContent=AVATARS[id]||'🎮';
  }
  const PAGES = new Set(['home','games','play','shop','challenges','missions','community','account','settings']);
  // Secure Quiz Beta is now the DEFAULT Guess the Game experience in Arcade.
  // The legacy quiz stays addressable for old local progress/invite links.
  // Secure quiz keeps its private answer bank; real rewards are opt-in,
  // paid only after server-confirmed action traces and shared wallet locks.
  const GAME_URL = '../secure-quiz-beta.html?v=nickname-friends-game-shop-demo-20261108n';
  const GOOGLE_OAUTH_READY = cfg?.googleOAuthEnabled === true;
  // Remember only whether this page was opened by an OAuth callback, never
  // read, store or log the returned access/refresh token values.
  const RETURNING_FROM_OAUTH = new URLSearchParams(location.hash.slice(1)).has('access_token')
    || new URLSearchParams(location.search).has('code');
  let supa=null, user=null, profile=null, mode='login', busy=false;
  let authView='default', recoveryVerified=false;
  // Read-only snapshot of the signed-in player's Guess the Game cloud save.
  // This is not the future cross-game XP/wallet and never writes any currency.
  let gameProgress=null, progressStatus='guest', progressRevision=null, progressRequest=0;
  // One shared FOXEY Arcade currency wallet (never game-local wallets).
  let sharedWallet=null,sharedCosmetics=null,walletStatus='guest',
      walletBusy=false,walletRequest=0;
  const THEME_IDS=new Set(['classic','retro','royal','ocean']);
  let achievements=null,achievementStatus='guest',achievementSeq=0,achToastTimer=null;
  // Navigation-only state; never changes a saved game or wallet.
  let accountTab='overview',shopTab='chests';
  const walletNumber=v=>Number.isSafeInteger(v)&&v>=0?v:0;
  const ownedAvatars=()=>Array.isArray(sharedCosmetics?.owned_avatars)
    ?sharedCosmetics.owned_avatars.filter(id=>Object.hasOwn(AVATAR_CATALOG,id))
    :['fox','robot','alien','crown'];
  const hasAvatar=id=>ownedAvatars().includes(id);
  const collectionFull=tier=>CHEST_POOLS[tier].every(hasAvatar);
  function notifyAvatarUpdate(){
    const frame=el('gameFrame');
    if(user&&frame.dataset.player===user.id&&frame.contentWindow?.postMessage)
      frame.contentWindow.postMessage({type:'foxey-arcade:avatar-updated',userId:user.id},location.origin);
  }
  function renderPrestige(){
    const played=user&&gameProgress?walletNumber(gameProgress.played):0;
    const unlocked=!!sharedCosmetics&&hasAvatar('legend-fox');
    el('prestigeProgress').textContent=unlocked?'🏆 Legendární avatar je ve tvém inventáři':
      Math.min(played,10)+' / 10 dokončených kvízů';
    if(el('prestigeFill').style)el('prestigeFill').style.width=Math.min(played*10,100)+'%';
    el('claimPrestige').disabled=walletBusy||walletStatus!=='ready'||unlocked||played<10;
    el('claimPrestige').textContent=unlocked?'✓ Odemčeno':played>=10?'🏆 Vyzvednout zdarma':'🔒 Vyžaduje 10 kvízů';
  }
  function renderAvatarInventory(){
    const ready=!!user&&!!sharedCosmetics;
    const ids=ready?ownedAvatars():[];
    el('shopOwnedCount').textContent=ready?ids.length+' avatarů v inventáři':'Přihlas se';
    const art={
      'pixel-fox':'avatarArtPixelFox','neon-ghost':'avatarArtNeonGhost',
      'space-cat':'avatarArtSpaceCat','cyber-fox':'avatarArtCyberFox',
      'arcade-dragon':'avatarArtArcadeDragon','legend-fox':'avatarArtLegendFox'
    };
    for(const [id,target] of Object.entries(art))showAvatar(id,el(target));
    document.querySelectorAll('[data-avatar]').forEach(btn=>{
      const id=btn.dataset.avatar,owned=ready&&ids.includes(id);
      const selected=owned&&profile?.avatar_id===id;
      btn.disabled=walletBusy||!owned||selected;
      btn.textContent=!ready?'Přihlas se':selected?'✓ Používáš':owned?'Použít':'🔒 Neodemčeno';
      const card=btn.closest?.('[data-avatar-card]');
      if(card?.classList)card.classList.toggle('owned',!!owned);
    });
    if(typeof document.createElement!=='function')return;
    const select=el('avatar');
    if(ready&&typeof select.replaceChildren==='function'){
      const options=ids.map(id=>{
        const node=document.createElement('option');
        node.value=id;node.textContent=AVATAR_CATALOG[id].name;
        return node;
      });
      select.replaceChildren(...options);
      select.value=ids.includes(profile?.avatar_id)?profile.avatar_id:'fox';
    }
    const root=el('inventoryGrid');
    if(typeof root.replaceChildren!=='function')return;
    root.replaceChildren();
    el('inventoryCount').textContent=ids.length+' avatarů';
    for(const id of ids){
      const item=document.createElement('article');item.className='inventory-item '+AVATAR_CATALOG[id].rarity;
      const icon=document.createElement('div');icon.className='avatar-art';showAvatar(id,icon);
      const name=document.createElement('strong');name.textContent=AVATAR_CATALOG[id].name;
      const btn=document.createElement('button');btn.type='button';btn.className='secondary';
      btn.disabled=walletBusy||profile?.avatar_id===id;
      btn.textContent=profile?.avatar_id===id?'✓ Používáš':'Použít';
      btn.addEventListener('click',()=>{void equipAvatar(id);});
      item.append(icon,name,btn);root.append(item);
    }
  }
  function renderWallet(){
    const ready=!!user&&!!sharedWallet&&!!sharedCosmetics;
    const shards=ready?fmt(walletNumber(sharedWallet.shards)):'—';
    const crowns=ready?fmt(walletNumber(sharedWallet.crowns)):'—';
    const free=ready?fmt(walletNumber(sharedWallet.free_chests)):'—';
    for(const [id,value] of Object.entries({
      headerShards:shards,headerCrowns:crowns,
      homeSharedShards:shards,homeSharedCrowns:crowns,
      accountSharedShards:shards,accountSharedCrowns:crowns,
      shopShards:shards,shopCrowns:crowns,shopFreeChests:free
    }))el(id).textContent=value;
    const status=!user?'Přihlas se, abys mohl nakupovat a používat společné odměny.'
      :walletStatus==='loading'?'☁️ Načítám společnou peněženku…'
      :walletStatus==='error'?'⚠️ Peněženku se nepodařilo načíst. Zkus Aktualizovat.'
      :walletStatus==='ready'?'✅ Jedna společná peněženka pro všechny hry.'
      :'☁️ Peněženka zatím není načtená.';
    el('shopStatus').textContent=status;
    const shopHint=el('homeShopStatus');
    if(shopHint){
      const freeCount=ready?walletNumber(sharedWallet.free_chests):0;
      shopHint.textContent=!ready?'🎁 Truhly, avatary a motivy pro tvůj účet':
        freeCount>0?'🎁 Máš '+fmt(freeCount)+' '+(freeCount===1?'truhlu zdarma':'truhel zdarma')+' připravených!':
        '💎 Nakupuj za herní měnu ze společné peněženky.';
    }
    if(document.body?.classList){
      for(const id of ['retro','royal','ocean'])
        document.body.classList.toggle('arcade-theme-'+id,
          ready&&sharedCosmetics.equipped_theme===id);
    }
    el('shopRefresh').disabled=walletBusy||!user;
    el('shopOpenChest').disabled=walletBusy||!ready||collectionFull('basic')||
      (walletNumber(sharedWallet.free_chests)===0&&walletNumber(sharedWallet.shards)<100);
    el('shopOpenChest').textContent=ready&&collectionFull('basic')
      ?'✓ Běžná sbírka kompletní'
      :ready&&walletNumber(sharedWallet.free_chests)>0
      ?'🎁 Otevřít zdarma':'🎁 Otevřít za 100 💎';
    el('shopOpenEpicChest').disabled=walletBusy||!ready||collectionFull('epic')||
      walletNumber(sharedWallet.shards)<300;
    el('shopOpenEpicChest').textContent=ready&&collectionFull('epic')
      ?'✓ Epická sbírka kompletní':'💜 Otevřít za 300 💎';
    document.querySelectorAll('[data-theme]').forEach(btn=>{
      const id=btn.dataset.theme;
      const owned=ready&&Array.isArray(sharedCosmetics.owned_themes)
        &&sharedCosmetics.owned_themes.includes(id);
      const equipped=owned&&sharedCosmetics.equipped_theme===id;
      btn.disabled=walletBusy||!ready||!!equipped;
      btn.textContent=!ready?'Přihlas se'
        :equipped?'✓ Používáš'
        :owned?'Použít motiv'
        :id==='retro'?'Koupit za 35 💎'
        :id==='royal'?'Koupit za 20 👑'
        :id==='ocean'?'Koupit za 50 💎':'Použít';
    });
    renderAvatarInventory();
    renderPrestige();
  }
  function notifyThemeUpdate(){
    const frame=el('gameFrame');
    if(!user||frame.dataset.player!==user.id||!frame.contentWindow?.postMessage)return;
    frame.contentWindow.postMessage({type:'foxey-arcade:cosmetic-updated',userId:user.id},location.origin);
  }
  async function loadSharedWallet(){
    const id=user?.id,seq=++walletRequest;
    if(!id||!supa){
      sharedWallet=null;sharedCosmetics=null;walletStatus='guest';renderWallet();return;
    }
    walletStatus='loading';renderWallet();
    try{
      // First call atomically imports historical GTG balances once, then
      // credits only new cumulative game earnings. No browser-side sums.
      const sync=await supa.rpc('arcade_sync_legacy');
      if(sync.error)throw sync.error;
      const init=await supa.rpc('arcade_init_inventory');
      if(init.error)throw init.error;
      const [wr,cr]=await Promise.all([
        supa.from('arcade_wallets')
          .select('shards,crowns,free_chests,chests_opened').eq('user_id',id).maybeSingle(),
        supa.from('arcade_cosmetics')
          .select('owned_themes,equipped_theme,owned_avatars').eq('user_id',id).maybeSingle()
      ]);
      if(!user||user.id!==id||seq!==walletRequest)return;
      if(wr.error)throw wr.error;
      if(cr.error)throw cr.error;
      if(!wr.data||!cr.data)throw Error('wallet_missing');
      sharedWallet=wr.data;sharedCosmetics=cr.data;walletStatus='ready';
    }catch(_){
      if(user?.id!==id||seq!==walletRequest)return;
      sharedWallet=null;sharedCosmetics=null;walletStatus='error';
    }
    if(seq===walletRequest)renderWallet();
  }
  async function equipAvatar(id){
    if(!user||walletBusy||!hasAvatar(id)||!Object.hasOwn(AVATAR_CATALOG,id))return;
    walletBusy=true;renderWallet();
    try{
      const r=await supa.rpc('arcade_equip_avatar',{p_avatar:id});
      if(r.error)throw r.error;
      profile={...profile,avatar_id:id};
      notifyAvatarUpdate();
      el('shopStatus').textContent='✅ '+AVATAR_CATALOG[id].name+' je tvůj aktuální avatar.';
    }catch(_){el('shopStatus').textContent='⚠️ Avatar se nepodařilo nastavit.';}
    finally{walletBusy=false;render();}
  }
  async function claimPrestige(){
    if(!user||walletBusy||!sharedCosmetics||hasAvatar('legend-fox'))return;
    walletBusy=true;renderWallet();
    try{
      const r=await supa.rpc('arcade_claim_prestige');
      if(r.error)throw r.error;
      await loadSharedWallet();
      el('shopStatus').textContent='🏆 Legendární FOXEY odemčen! Najdeš ho v inventáři.';
    }catch(e){
      el('shopStatus').textContent=String(e.message||'').includes('not_eligible')
        ?'🔒 Je potřeba 10 dokončených kvízů.':'⚠️ Odměnu se nepodařilo vyzvednout.';
    }finally{walletBusy=false;render();}
  }
  let shopRewardReturnFocus=null;
  function closeChestReward(){
    const dialog=el('shopRewardOverlay');
    if(!dialog||dialog.classList.contains('hidden'))return;
    dialog.classList.add('hidden');
    document.body?.classList?.remove('arcade-reward-open');
    const previous=shopRewardReturnFocus;
    shopRewardReturnFocus=null;
    if(previous?.isConnected!==false)previous?.focus?.();
  }
  function showChestReward(){
    shopRewardReturnFocus=document.activeElement;
    el('shopRewardOverlay').classList.remove('hidden');
    document.body?.classList?.add('arcade-reward-open');
    el('shopRewardDone')?.focus?.();
  }
  function previewChestReward(){
    // Pure client-side visual demo: zero RPCs, zero wallet writes, no saves.
    // Always labelled preview so no player can mistake it for a prize.
    closeChestReward();
    showAvatar('pixel-fox',el('shopRewardArt'));
    el('shopRewardTitle').textContent='👀 Ukázka odměny';
    el('shopRewardRarity').textContent='DEMO · NEZÍSKÁNO';
    el('shopRewardName').textContent=AVATAR_CATALOG['pixel-fox'].name;
    el('shopRewardCaption').textContent=
      'Jen ukázka zobrazení. Žádný avatar nebyl připsán a nic se neodečetlo.';
    el('shopRewardInventory').classList.add('hidden');
    el('shopRewardDone').textContent='✓ Zavřít ukázku';
    showChestReward();
  }
  async function performShop(kind,theme){
    if(!user||walletBusy||!sharedWallet||!sharedCosmetics||!supa)return;
    if(kind==='theme'&&!THEME_IDS.has(theme))return;
    const id=user.id;
    walletBusy=true;renderWallet();
    const chestKind=kind==='chest'||kind==='epic-chest';
    el('shopChestVisual').classList.toggle('spinning',kind==='chest');
    el('shopEpicVisual').classList.toggle('spinning',kind==='epic-chest');
    const messageBox=el('shopChestResult');
    if(chestKind){
      messageBox.textContent='🎁 Otevírám truhlu…';
      closeChestReward();
    }
    else el('shopStatus').textContent='🔄 Provádím změnu motivu…';
    try{
      let reply;
      if(chestKind){
        // Store operation UUID until the server acknowledges its result.
        const tier=kind==='epic-chest'?'epic':'basic';
        const key='foxey.arcade.v2.pending.'+id+'.'+tier;
        let op=null;
        try{op=sessionStorage.getItem(key);}catch(_){}
        if(!op){op=crypto.randomUUID();try{sessionStorage.setItem(key,op);}catch(_){}}
        reply=await supa.rpc('arcade_open_cosmetic_chest',{
          p_tier:tier,p_operation:op
        });
        if(reply.error)throw reply.error;
        try{sessionStorage.removeItem(key);}catch(_){}
        if(user?.id!==id)return; // Never display another account's reward.
        const avatar=reply.data?.avatar;
        if(!Object.hasOwn(AVATAR_CATALOG,avatar))throw Error('invalid_reward');
        showAvatar(avatar,el('shopRewardArt'));
        el('shopRewardTitle').textContent='🎉 Získal jsi odměnu!';
        el('shopRewardInventory').classList.remove('hidden');
        el('shopRewardDone').textContent='🎉 Super!';
        el('shopRewardName').textContent=AVATAR_CATALOG[avatar].name;
        el('shopRewardRarity').textContent=tier==='epic'?'EPICKÁ ODMĚNA':'NOVÝ AVATAR';
        el('shopRewardCaption').textContent='V inventáři • '+(tier==='epic'?'epická':'běžná')+' sbírka';
        messageBox.textContent='🎉 Odemčen avatar '+AVATAR_CATALOG[avatar].name+'!';
        showChestReward();
      }else{
        const owned=sharedCosmetics.owned_themes.includes(theme);
        if(!owned){
          reply=await supa.rpc('arcade_buy_theme',{p_theme:theme,p_operation:crypto.randomUUID()});
          if(reply.error)throw reply.error;
        }
        reply=await supa.rpc('arcade_equip_theme',{p_theme:theme});
        if(reply.error)throw reply.error;
        notifyThemeUpdate();
        el('shopStatus').textContent='✅ Motiv byl úspěšně vybrán.';
      }
      await loadSharedWallet();
    }catch(e){
      if(user?.id!==id)return;
      const raw=String(e.message||'').toLowerCase();
      const reason=raw.includes('insufficient_funds')?'Nemáš dost krystalů.'
        :raw.includes('collection_complete')?'Tuto sbírku už máš kompletní.'
        :raw.includes('not_authenticated')?'Zkus se znovu přihlásit.':'Operace se nezdařila. Zkus ji zopakovat.';
      if(chestKind)messageBox.textContent='⚠️ '+reason;
      else el('shopStatus').textContent='⚠️ '+reason;
    }finally{
      el('shopChestVisual').classList.remove('spinning');
      el('shopEpicVisual').classList.remove('spinning');
      walletBusy=false;renderWallet();
    }
  }
  const fmt=n=>n.toLocaleString(window.FOXEY_I18N?.getLocale()==='en'?'en-US':'cs-CZ');
  const safeNum=v=>Number.isSafeInteger(v)&&v>=0&&v<100000000?v:0;
  function renderGameProgress(){
    const valid=!!user && !!gameProgress;
    const p=gameProgress||{};
    const stats={
      Xp:valid?fmt(p.xp):'—',
      Level:valid?fmt(1+Math.floor(p.xp/100)):'—',
      Shards:valid?fmt(p.shards):'—',
      Crowns:valid?fmt(p.crowns):'—',
      Played:valid?fmt(p.played):'—'
    };
    for(const [name,value] of Object.entries(stats)){
      const home=el('home'+name);
      if(home)home.textContent=value;
      const account=el('account'+name);
      if(account)account.textContent=value;
    }
    // The header belongs to the platform, never use game XP as global XP.

    const text= !user?'Přihlas se pro načtení cloudového postupu.'
      :progressStatus==='loading'?'☁️ Načítám postup z cloudu…'
      :progressStatus==='error'?'⚠️ Postup se nepodařilo načíst. Zkus Aktualizovat.'
      :progressStatus==='missing'?'☁️ K tomuto účtu zatím nemáme cloudový postup Guess the Game.'
      :progressStatus==='ready'?'✅ Aktuální hodnoty z cloudového postupu Guess the Game.'
      :'☁️ Cloudový postup není načtený.';
    el('homeProgressStatus').textContent=text;
    el('accountProgressStatus').textContent=text;
    renderPrestige();
  }

  const achievementsEnglish=()=>window.FOXEY_I18N?.getLocale?.()==='en';
  function celebrate(message){
    const toast=el('arcadeAchievementToast');if(!toast)return;
    if(achToastTimer)clearTimeout(achToastTimer);
    toast.textContent=message;toast.classList.remove('hidden');
    achToastTimer=setTimeout(()=>{toast.classList.add('hidden');achToastTimer=null;},4500);
  }
  function renderAchievements(){
    const eng=achievementsEnglish(),valid=!!user&&!!profile;
    // Never show a previous player's achievements to a guest or new account.
    const entries=valid&&Array.isArray(achievements?.achievements)?achievements.achievements:[];
    const unlocked=entries.filter(x=>x.unlocked).length;
    const status=!valid?(eng?'Sign in to see achievements.':'Pro achievementy se přihlas.')
      :achievementStatus==='error'?(eng?'Achievements unavailable.':'Achievementy se nepodařilo načíst.')
      :achievementStatus==='loading'?(eng?'Loading achievements…':'Načítám achievementy…')
      :eng?`${unlocked} of ${entries.length} achievements unlocked`
           :`Odemčeno ${unlocked} z ${entries.length} achievementů`;
    for(const id of ['homeAchievementStatus','accountAchievementStatus']){
      if(el(id))el(id).textContent=status;
    }
    if(el('accountAchievementCount'))el('accountAchievementCount').textContent=
      entries.length?`${unlocked} / ${entries.length}`:'—';
    const xp=valid?safeNum(profile.arcade_xp):0,progress=xp%100;
    for(const prefix of ['home','account']){
      if(el(prefix+'LevelProgress'))el(prefix+'LevelProgress').textContent=
        valid?`${progress} / 100 XP`:'—';
      if(el(prefix+'LevelFill')?.style)el(prefix+'LevelFill').style.width=
        (valid?progress:0)+'%';
      el(prefix+'LevelBar')?.setAttribute('aria-valuenow',String(valid?progress:0));
    }
    const createCard=(a)=>{
      const card=document.createElement('article');card.className='achievement-item'+(a.unlocked?' earned':'');
      const icon=document.createElement('span');icon.className='achievement-icon';
      icon.textContent=a.icon||'🏆';icon.setAttribute('aria-hidden','true');
      const body=document.createElement('div');body.className='achievement-details';
      const title=document.createElement('strong');title.className='achievement-name';
      title.textContent=(eng?a.name_en:a.name_cs)||a.code;
      const description=document.createElement('p');description.className='achievement-description';
      description.textContent=(eng?a.description_en:a.description_cs)||'';
      const reward=document.createElement('div');reward.className='achievement-reward';
      reward.textContent=[a.reward_shards>0?'💎 +'+a.reward_shards:'',
        a.reward_chests>0?'🎁 +'+a.reward_chests:''].filter(Boolean).join(' · ');
      const label=document.createElement('span');label.className='achievement-progress-label';
      label.textContent=a.unlocked?(eng?'✓ Unlocked':'✓ Odemčeno'):
        `${a.progress} / ${a.target}`;
      const track=document.createElement('div');track.className='achievement-progress';
      const fill=document.createElement('span');fill.style.width=
        (a.unlocked?100:Math.min(100,100*(Number(a.progress)||0)/Math.max(1,Number(a.target)||1)))+'%';
      track.append(fill);body.append(title,description,reward,label,track);
      card.append(icon,body);return card;
    };
    const home=el('homeAchievementGrid'),account=el('accountAchievementGrid');
    if(!home?.replaceChildren||!account?.replaceChildren)return;
    const nearest=[...entries].sort((a,b)=>
      Number(b.unlocked)-Number(a.unlocked)||
      (Number(b.progress)/Math.max(1,Number(b.target)))-
      (Number(a.progress)/Math.max(1,Number(a.target)))).slice(0,4);
    home.replaceChildren(...nearest.map(createCard));
    account.replaceChildren(...entries.map(createCard));
  }
  async function loadAchievements(){
    const uid=user?.id,seq=++achievementSeq;
    if(!uid||!supa){
      achievements=null;achievementStatus='guest';renderAchievements();return;
    }
    achievementStatus='loading';renderAchievements();
    try{
      const {data,error}=await supa.rpc('arcade_global_achievements');
      if(error||data?.ok!==true||!Array.isArray(data.achievements))
        throw error||Error('achievements_unavailable');
      if(user?.id!==uid||seq!==achievementSeq)return;
      const oldCodes=new Set(
        Array.isArray(achievements?.achievements)?
          achievements.achievements.filter(x=>x.unlocked).map(x=>x.code):[]
      );
      const hadSnapshot=Array.isArray(achievements?.achievements);
      achievements=data;achievementStatus='ready';
      const fresh=Array.isArray(data.new_achievements)?[...data.new_achievements]:[];
      // Newly credited achievements are already committed by the payment RPC;
      // compare with the previous server readout rather than trusting an
      // iframe message to tell us what was awarded.
      if(hadSnapshot){
        for(const a of data.achievements){
          if(a.unlocked&&!oldCodes.has(a.code)&&!fresh.some(x=>x.code===a.code)){
            fresh.push(a);
          }
        }
      }
      if(fresh.length){
        celebrate(achievementsEnglish()?
          `🏆 ${fresh.length} achievement(s) unlocked! Rewards added.`:
          `🏆 Odemčeno ${fresh.length} achievementů! Odměny připsány.`);
        void loadSharedWallet();
      }
    }catch(_){
      if(user?.id!==uid||seq!==achievementSeq)return;
      achievementStatus='error';
    }
    if(user?.id===uid&&seq===achievementSeq)renderAchievements();
  }
  function renderArcadeProgress(){
    const active=!!user&&!!profile;
    const xp=active?safeNum(profile.arcade_xp):0;
    const values={
      homeArcadeXp:active?fmt(xp):'—',
      homeArcadeLevel:active?fmt(1+Math.floor(xp/100)):'—',
      headerArcadeXp:active?fmt(xp):'—',
      headerArcadeLevel:active?fmt(1+Math.floor(xp/100)):'—',
      accountArcadeXp:active?fmt(xp):'—',
      accountArcadeLevel:active?fmt(1+Math.floor(xp/100)):'—'
    };
    for(const [id,value] of Object.entries(values))el(id).textContent=value;
    renderAchievements();
  }
  async function loadGameProgress(){
    const id=user?.id;
    const current=++progressRequest;
    if(!id||!supa){
      gameProgress=null;progressRevision=null;progressStatus='guest';renderGameProgress();return;
    }
    progressStatus='loading';
    renderGameProgress();
    try{
      const {data,error}=await supa.from('gtg36_account_progress')
        .select('profile,revision').eq('user_id',id).maybeSingle();
      if(user?.id!==id||current!==progressRequest)return;
      if(error)throw error;
      if(!data){
        gameProgress=null;progressRevision=null;progressStatus='missing';
      }else if(!data.profile||typeof data.profile!=='object'||Array.isArray(data.profile)
        ||!Number.isSafeInteger(data.profile.xp)||data.profile.xp<0
        ||!Number.isSafeInteger(data.revision)||data.revision<0){
        throw Error('invalid_game_profile');
      }else{
        gameProgress={
          xp:safeNum(data.profile.xp),
          played:safeNum(data.profile.played),
          shards:safeNum(data.profile.shards),
          crowns:safeNum(data.profile.crowns)
        };
        progressRevision=data.revision;
        progressStatus='ready';
      }
    }catch(_){
      if(user?.id!==id||current!==progressRequest)return;
      gameProgress=null;progressRevision=null;progressStatus='error';
    }
    if(current===progressRequest)renderGameProgress();
  }
  const show=(id,visible)=>el(id).classList.toggle('hidden',!visible);
  const message=(text)=>{
    el('accountNotice').textContent=window.FOXEY_I18N?.t(text)||text;
  };
  const SUBTAB_GROUPS=Object.freeze({
    account:['overview','achievements','inventory','stats'],
    shop:['chests','themes','avatars']
  });
  function selectSubtab(group,target,focus=false){
    const groupNames=SUBTAB_GROUPS[group];
    if(!groupNames||!groupNames.includes(target))return;
    if(group==='account')accountTab=target;else shopTab=target;
    const prefix=group==='account'?'account':'shop';
    const suffix=key=>key.charAt(0).toUpperCase()+key.slice(1);
    for(const name of groupNames){
      const active=name===target;
      const tab=el(prefix+'Tab'+suffix(name));
      const panel=el(prefix+'Panel'+suffix(name));
      if(!tab||!panel)continue;
      panel.classList.toggle('hidden',!active);
      tab.classList.toggle('is-active',active);
      tab.setAttribute('aria-selected',String(active));
      tab.tabIndex=active?0:-1;
      if(active&&focus)tab.focus?.();
    }
  }
  function bindSubtabs(group){
    const root=el(group==='account'?'accountTabs':'shopTabs');
    if(!root)return;
    const attribute=group==='account'?'accountTab':'shopTab';
    const names=SUBTAB_GROUPS[group];
    root.querySelectorAll('button[role="tab"]').forEach(tab=>{
      tab.addEventListener('click',()=>selectSubtab(group,tab.dataset[attribute]));
      tab.addEventListener('keydown',event=>{
        const keys=['ArrowRight','ArrowLeft','Home','End'];
        if(!keys.includes(event.key))return;
        event.preventDefault();
        const current=names.indexOf(tab.dataset[attribute]);
        const next=event.key==='Home'?0:event.key==='End'?names.length-1:
          (current+(event.key==='ArrowRight'?1:-1)+names.length)%names.length;
        selectSubtab(group,names[next],true);
      });
    });
    selectSubtab(group,group==='account'?accountTab:shopTab);
  }
  let arcadeImmersive=false,arcadeNativeFullscreen=false;
  function updateImmersive(on){
    arcadeImmersive=!!on;
    document.body?.classList?.toggle('arcade-game-immersive',arcadeImmersive);
    const exit=el('gameExitFullscreen');
    if(exit){
      exit.textContent=arcadeImmersive?'↙ '+(window.FOXEY_I18N?.getLocale?.()==='en'?
        'Windowed mode':'Režim okna'):'⛶ '+(window.FOXEY_I18N?.getLocale?.()==='en'?
        'Full screen':'Celá obrazovka');
      exit.setAttribute('aria-label',exit.textContent);
    }
  }
  function enterGameFullscreen(){
    // CSS covers the viewport immediately, including Safari/iOS where the
    // Fullscreen API may be unavailable. Game iframe is never reloaded.
    updateImmersive(true);
    const page=el('page-play');
    if(typeof page?.requestFullscreen==='function'&&
       !document.fullscreenElement){
      try{
        const response=page.requestFullscreen({navigationUI:'hide'});
        if(response&&typeof response.then==='function')
          void response.then(()=>{
            arcadeNativeFullscreen=true;
          }).catch(()=>{arcadeNativeFullscreen=false;});
        else arcadeNativeFullscreen=true;
      }catch(_){arcadeNativeFullscreen=false;}
    }
  }
  function leaveGameFullscreen(){
    updateImmersive(false);
    if(document.fullscreenElement===el('page-play')&&
       typeof document.exitFullscreen==='function'){
      try{void Promise.resolve(document.exitFullscreen()).catch(()=>{});}
      catch(_){}
    }
    arcadeNativeFullscreen=false;
  }
  document.addEventListener?.('fullscreenchange',()=>{
    if(arcadeNativeFullscreen&&!document.fullscreenElement){
      arcadeNativeFullscreen=false;
      updateImmersive(false);
    }else if(document.fullscreenElement===el('page-play'))
      arcadeNativeFullscreen=true;
  });
  function go(page){
    if(!PAGES.has(page))page='home';
    if(page==='play'){
      const frame=el('gameFrame');
      const identity=user?.id||'guest';
      // The frame is same-origin and reads the shared Supabase Auth storage key.
      // Reload only when the signed-in player changes, not on every menu switch.
      if(frame.dataset.player!==identity || frame.getAttribute('src')!==GAME_URL){
        frame.dataset.player=identity;
        frame.setAttribute('src',GAME_URL);
      }
    }
    for(const name of PAGES)show('page-'+name,name===page);
    if(page==='play')enterGameFullscreen();
    else if(arcadeImmersive||document.fullscreenElement===el('page-play'))
      leaveGameFullscreen();
    if(page!=='shop')closeChestReward();
    if(page==='shop'){
      selectSubtab('shop',shopTab);
      if(user&&supa)void loadSharedWallet();
    }
    if(page==='account')selectSubtab('account',accountTab);
    if((page==='home'||page==='account')&&user&&supa&&achievementStatus==='guest')void loadAchievements();
    // On return from playing, re-read the authoritative cloud row. The iframe
    // also sends a lightweight synced notification for live updates.
    if(page!=='play' && user && supa)void loadGameProgress();
    document.querySelectorAll('.mainnav [data-page]').forEach(button=>{
      const active=button.dataset.page===(page==='challenges'?'community':page);
      button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
    document.querySelectorAll('.arcade-social-tab').forEach(button=>{
      const active=button.dataset.page===page;
      button.classList.toggle('is-active',active);
      if(active)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
    // Mobile dock and compact challenge dashboard are independent UI only.
    // Switching sections must never reload the active game iframe.
    window.FOXEY_ARCADE_UI2?.onPage(page);
    window.FOXEY_ARCADE_MISSIONS?.onPage(page);
    window.FOXEY_ARCADE_SOCIAL?.onPage(page);
    window.FOXEY_ARCADE_CHAT?.onPage(page);
    window.FOXEY_MINI_CHAT?.onPage(page);
    window.FOXEY_ARCADE_LIVE?.onPage(page);
    // Supabase's implicit password-recovery callback carries short-lived
    // tokens in the URL fragment. Never overwrite it before Auth consumes it.
    const authHash=new URLSearchParams(location.hash.slice(1));
    const hasAuthCallback=authHash.has('access_token')||
      authHash.has('refresh_token')||authHash.has('error')||
      authHash.has('error_code')||authHash.has('type');
    if(!hasAuthCallback)history.replaceState(null,'','#'+(page==='home'?'domu':page));
    window.FOXEY_I18N?.apply();
  }
  // Ask the secure, owner-scoped quiz to reveal its authenticated challenge
  // section without reloading an active iframe or discarding its run.
  function openChallengeInGame(){
    const frame=el('gameFrame');
    el('challengeLaunchStatus').textContent=user?
      '⚔️ Otevírám zabezpečené výzvy…':
      '🔐 Pro nové serverové výzvy se přihlas ke svému FOXEY Arcade účtu.';
    go('play');
    const request=()=>{
      try{
        if(!frame.contentWindow)return false;
        frame.contentWindow.postMessage({
          type:'foxey-arcade:open-challenges'
        },location.origin);
        return true;
      }catch(_){return false;}
    };
    // After assigning iframe.src, the browser can temporarily report an
    // already-complete about:blank/previous document. Only consider the
    // iframe ready if it is really showing our new secure game path.
    let secureReady=false;
    try{
      secureReady=frame.contentDocument?.readyState==='complete'&&
        frame.contentWindow?.location?.pathname?.endsWith('/secure-quiz-beta.html');
    }catch(_){}
    if(secureReady)request();
    else frame.addEventListener('load',request,{once:true});
  }
  function closeGameOnIdentityChange(){
    // Unload an old iframe session on account switch/logout, so another player
    // cannot briefly see the previous user's account/game data.
    const frame=el('gameFrame');
    frame.removeAttribute('src');
    frame.dataset.player='';
  }
  function render(){
    const loggedIn=!!user;
    show('guestAccount',!loggedIn&&authView==='default');
    show('playerAccount',loggedIn&&authView==='default');
    show('recoverAccount',authView==='request');
    show('resetAccount',authView==='reset'&&recoveryVerified);
    el('headerName').textContent=loggedIn?(profile?.nickname||(window.FOXEY_I18N?.t('Hráč')||'Hráč')):(window.FOXEY_I18N?.t('Host')||'Host');
    if(loggedIn)showAvatar(profile?.avatar_id||'fox',el('headerAvatar'));
    else el('headerAvatar').textContent='🎮';
    el('connectionStatus').textContent=loggedIn?'● Přihlášen':'○ Režim hosta';
    el('tabLogin').classList.toggle('selected',mode==='login');
    el('tabSignup').classList.toggle('selected',mode==='signup');
    el('authSubmit').textContent=mode==='login'?'Přihlásit se':'Vytvořit účet';
    el('authSubmit').disabled=busy;
    el('googleAuthButton').disabled=busy||loggedIn||!GOOGLE_OAUTH_READY;
    el('googleAuthNote').textContent=GOOGLE_OAUTH_READY
      ?'Použij stejný ověřený e-mail Google jako u stávajícího účtu, aby se mohly propojit. Jiné e-maily mohou vytvořit nový profil.'
      :'Google přihlášení zatím není aktivované. Nejdřív propojíme Google Cloud se Supabase.';
    el('profileSave').disabled=busy;
    el('signOut').disabled=busy;
    if(loggedIn){
      showAvatar(profile?.avatar_id||'fox',el('profileAvatar'));
      el('profileName').textContent=profile?.nickname||(window.FOXEY_I18N?.t('Hráč FOXEY Arcade')||'Hráč FOXEY Arcade');
      el('profileEmail').textContent=user.email||'';
      el('nickname').value=profile?.nickname||'';
      el('avatar').value=profile?.avatar_id||'fox';
    }
    renderGameProgress();
    renderArcadeProgress();
    renderWallet();
    window.FOXEY_I18N?.apply();
    renderAchievements();
  }
  function setAuthView(view){
    if(busy)return;
    authView=view;
    if(view==='request')el('recoveryEmail').value=el('email').value.trim();
    message('');
    go('account');
    render();
  }
  function recoveryRedirect(){
    // The URL is the actual deployed entry point, never an arbitrary supplied redirect.
    const url=new URL(location.origin+location.pathname);
    url.searchParams.set('auth','recovery');
    return url.toString();
  }
  async function requestPasswordRecovery(event){
    event.preventDefault();
    if(busy||!supa)return;
    const email=el('recoveryEmail').value.trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){message('⚠️ Zkontroluj e-mail.');return;}
    if(location.protocol!=='https:'&&location.hostname!=='localhost'){
      message('⚠️ Obnova hesla potřebuje zabezpečenou HTTPS stránku.');return;
    }
    busy=true;
    el('recoveryRequestSubmit').disabled=true;
    message('📧 Odesílám odkaz pro obnovu…');
    try{
      const result=await supa.auth.resetPasswordForEmail(email,{redirectTo:recoveryRedirect()});
      if(result.error)throw result.error;
      message('📧 Pokud k e-mailu existuje účet, přijde ti odkaz. Zkontroluj i spam. Platnost odkazu je omezená.');
    }catch(e){
      const msg=String(e.message||'');
      message(/rate|limit|too many/i.test(msg)
        ?'⚠️ Příliš mnoho pokusů. Zkus to později.'
        :'⚠️ Odeslání se nezdařilo. Zkontroluj připojení a nastavení e-mailů.');
    }finally{busy=false;el('recoveryRequestSubmit').disabled=false;}
  }
  async function applyRecoveredPassword(event){
    event.preventDefault();
    if(busy||!recoveryVerified||!supa)return;
    const password=el('newPassword').value;
    const confirm=el('confirmNewPassword').value;
    if(password.length<8||password.length>128){message('⚠️ Heslo musí mít 8–128 znaků.');return;}
    if(password!==confirm){message('⚠️ Hesla se neshodují.');return;}
    busy=true;el('resetPasswordSubmit').disabled=true;message('🔐 Ukládám nové heslo…');
    try{
      const result=await supa.auth.updateUser({password});
      if(result.error)throw result.error;
      el('newPassword').value='';el('confirmNewPassword').value='';
      recoveryVerified=false;authView='default';
      const clean=new URL(location.href);
      clean.searchParams.delete('auth');
      clean.hash='';
      history.replaceState(null,'',clean.pathname+clean.search+'#account');
      const signout=await supa.auth.signOut({scope:'local'});
      if(signout.error)throw signout.error;
      closeGameOnIdentityChange();
      await refresh();
      go('account');
      message('✅ Heslo změněno. Přihlas se novým heslem.');
    }catch(_){message('⚠️ Heslo se nepodařilo změnit. Ověř platnost odkazu a zkus to znovu.');}
    finally{busy=false;el('resetPasswordSubmit').disabled=false;render();}
  }
  function setMode(next){
    if(busy)return;
    mode=next;
    el('password').autocomplete=mode==='signup'?'new-password':'current-password';
    el('password').value='';
    message('');
    render();
  }
  async function getProfile(uid){
    const get=()=>supa.from('arcade_profiles')
      .select('user_id,nickname,avatar_id,arcade_xp').eq('user_id',uid).maybeSingle();
    const response=await get();
    if(response.error)throw response.error;
    if(response.data)return response.data;
    // First FOXEY Arcade sign-in: create platform profile without touching
    // existing Guess the Game progress or account password.
    const inserted=await supa.from('arcade_profiles')
      .insert({user_id:uid}).select('user_id,nickname,avatar_id,arcade_xp').single();
    if(inserted.data && !inserted.error)return inserted.data;
    // Another tab may have inserted the same row in the meantime.
    const retry=await get();
    if(retry.error||!retry.data)throw retry.error||inserted.error||Error('profile_unavailable');
    return retry.data;
  }
  async function refresh(){
    try{
      const result=await supa.auth.getUser();
      // A visitor without a session is a normal guest, not an offline error.
      if(result.error && result.error.name!=='AuthSessionMissingError' && !/auth session missing/i.test(result.error.message||''))throw result.error;
      const nextUser=result.error?null:(result.data?.user||null);
      if(user?.id!==nextUser?.id){
        ++progressRequest;gameProgress=null;progressRevision=null;progressStatus='guest';
        ++walletRequest;sharedWallet=null;sharedCosmetics=null;walletStatus='guest';
        ++achievementSeq;achievements=null;achievementStatus='guest';
      }
      user=nextUser;
      profile=null;
      if(user){
        const uid=user.id;
        try{profile=await getProfile(uid);}
        catch(_){message('⚠️ Profil se zatím nepodařilo načíst. Obnov stránku.');}
        // Hands-free migration on EVERY signed-in Arcade login. The server
        // owns the baseline, freezes the old editable save, and never trusts
        // a client-provided XP or wallet amount. Also idempotent on retries.
        try{
          const auto=await supa.rpc('arcade_verified_rewards_auto_activate');
          if(auto.error||auto.data?.ok!==true)
            throw auto.error||Error('auto_rewards_unavailable');
          if(user?.id!==uid)return;
          profile=await getProfile(uid);
        }catch(_){
          if(user?.id===uid)
            message('⚠️ Nepodařilo se automaticky aktualizovat odměny. Obnov stránku nebo zkus přihlášení znovu.');
        }
        if(user?.id!==uid)return;
        await loadGameProgress();
        await loadSharedWallet();
        await loadAchievements();
      }
    }catch(_){
      ++progressRequest;gameProgress=null;progressRevision=null;progressStatus='guest';
      ++walletRequest;sharedWallet=null;sharedCosmetics=null;walletStatus='guest';
      ++achievementSeq;achievements=null;achievementStatus='guest';
      user=null;profile=null;
      message('⚠️ Nepodařilo se ověřit přihlášení. Zkontroluj internet.');
    }finally{
      render();
      // The global notification center shares the same Supabase Auth user
      // across Arcade and every embedded game. Keep it optional so a failure
      // in notifications can never prevent sign-in or playing.
      try{window.FOXEY_ARCADE_NOTIFICATIONS?.connect(supa,user);}
      catch(err){console.warn('FOXEY shared notifications unavailable',err);}
      try{window.FOXEY_ARCADE_UI2?.connect(supa,user);}
      catch(err){console.warn('FOXEY challenge dashboard unavailable',err);}
      try{window.FOXEY_ARCADE_MISSIONS?.connect(supa,user);}
      catch(err){console.warn('FOXEY mission dashboard unavailable',err);}
      try{window.FOXEY_ARCADE_SOCIAL?.connect(supa,user);}
      catch(err){console.warn('FOXEY social dashboard unavailable',err);}
      try{window.FOXEY_MINI_CHAT?.connect(supa,user);}catch(err){console.warn('FOXEY mini chat unavailable',err);}
      try{window.FOXEY_ARCADE_CHAT?.connect(supa,user);}
      catch(err){console.warn('FOXEY chat unavailable',err);}
      try{window.FOXEY_ARCADE_LIVE?.connect(supa,user);}
      catch(err){console.warn('FOXEY live duels unavailable',err);}
      // An explicitly selected friend from the standalone secure game may
      // carry a one-use invite intent to the same authenticated launcher.
      const requestedFriend=new URLSearchParams(location.search).get('invite_live');
      if(user&&requestedFriend&&
         /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedFriend)){
        const clean=new URL(location.href);
        clean.searchParams.delete('invite_live');
        history.replaceState(null,'',clean.pathname+clean.search+clean.hash);
        go('community');
        void window.FOXEY_ARCADE_LIVE?.invite(requestedFriend,{mode:'classic',target:1});
        return;
      }
      // If the user directly opened the playable route, reload the iframe
      // under the authenticated identity instead of leaving it in Guest mode.
      if(location.hash==='#play')go('play');
      else if(new URLSearchParams(location.search).has('live'))go('community');
    }
  }
  // Browser OAuth redirects back to the canonical Arcade directory, never
  // to a user-controlled URL. Supabase's implicit tokens stay in the fragment
  // until Supabase Auth processes them on page load.
  function googleCallbackUrl(){
    if(location.protocol!=='https:' && location.hostname!=='localhost')
      throw Error('oauth_requires_https');
    return new URL('./', location.href).href;
  }
  async function authenticateWithGoogle(){
    if(busy||user||!supa||!GOOGLE_OAUTH_READY)return;
    busy=true;render();
    message('🔐 Přesměrovávám na Google…');
    try{
      const {error}=await supa.auth.signInWithOAuth({
        provider:'google',
        options:{redirectTo:googleCallbackUrl()}
      });
      if(error)throw error;
      // The browser navigates to Google. Do not create a second app account here.
    }catch(_){
      message('⚠️ Přihlášení Googlem se nepodařilo spustit. Zkontroluj nastavení Google OAuth.');
    }finally{busy=false;render();}
  }
  async function authenticate(event){
    event.preventDefault();
    if(busy)return;
    const email=el('email').value.trim(),password=el('password').value;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8||password.length>128){
      message('⚠️ Zkontroluj e-mail a heslo (8–128 znaků).');return;
    }
    if(mode==='signup' && location.protocol==='file:'){
      message('⚠️ Pro potvrzení registrace spusť aplikaci přes HTTP/HTTPS, ne jako soubor.');return;
    }
    busy=true;render();message('🔄 Ověřuji účet…');
    try{
      const response=mode==='signup'
        ? await supa.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}})
        : await supa.auth.signInWithPassword({email,password});
      if(response.error)throw response.error;
      el('password').value='';
      if(response.data?.session && response.data?.user){
        closeGameOnIdentityChange();
        await refresh();message('✅ Úspěšně přihlášeno.');
      }else{
        message('📧 Zkontroluj e-mail a potvrď účet. Odkaz potřebuje povolenou návratovou adresu v Supabase.');
      }
    }catch(e){
      message('⚠️ Přihlášení nebo registrace se nezdařila: '+String(e.message||'chyba').slice(0,120));
    }finally{busy=false;render();}
  }
  async function saveProfile(event){
    event.preventDefault();
    if(!user||busy)return;
    const nickname=el('nickname').value.trim();
    const avatar_id=el('avatar').value;
    if(nickname&&!/^[A-Za-z0-9_]{3,20}$/.test(nickname)){
      message('⚠️ Přezdívka musí mít 3–20 znaků (A–Z, 0–9, _).');return;
    }
    if(!Object.hasOwn(AVATAR_CATALOG,avatar_id)||!hasAvatar(avatar_id))return;
    busy=true;render();message('🔄 Ukládám profil…');
    try{
      const res=await supa.from('arcade_profiles').update({
        nickname:nickname||null,updated_at:new Date().toISOString()
      }).eq('user_id',user.id).select('user_id,nickname,avatar_id,arcade_xp').single();
      if(res.error)throw res.error;
      const equipped=await supa.rpc('arcade_equip_avatar',{p_avatar:avatar_id});
      if(equipped.error)throw equipped.error;
      profile={...res.data,avatar_id};
      // Refresh the in-app avatar from trusted server data; don't send the
      // selected ID to the game as an authoritative value.
      notifyAvatarUpdate();
      message('✅ Profil FOXEY Arcade uložený.');
    }catch(e){
      const duplicate=String(e.code||'')==='23505';
      message(duplicate?'⚠️ Tuhle přezdívku už někdo používá.': '⚠️ Profil se nepodařilo uložit. Zkus to znovu.');
    }finally{busy=false;render();}
  }
  async function signOut(){
    if(!user||busy)return;
    busy=true;render();
    try{
      const res=await supa.auth.signOut({scope:'local'});
      if(res.error)throw res.error;
      closeChestReward();
      ++progressRequest;gameProgress=null;progressRevision=null;progressStatus='guest';
      ++walletRequest;sharedWallet=null;sharedCosmetics=null;walletStatus='guest';
      ++achievementSeq;achievements=null;achievementStatus='guest';
      if(achToastTimer){clearTimeout(achToastTimer);achToastTimer=null;}
      el('arcadeAchievementToast')?.classList.add('hidden');
      user=null;profile=null;closeGameOnIdentityChange();go('home');
      try{window.FOXEY_ARCADE_NOTIFICATIONS?.connect(supa,null);}
      catch(err){console.warn('FOXEY notifications logout cleanup failed',err);}
      try{window.FOXEY_ARCADE_SOCIAL?.connect(supa,null);}
      catch(err){console.warn('FOXEY friends logout cleanup failed',err);}
      try{window.FOXEY_MINI_CHAT?.connect(supa,null);}catch(err){console.warn('FOXEY mini chat cleanup failed',err);}
      try{window.FOXEY_ARCADE_CHAT?.connect(supa,null);}
      catch(err){console.warn('FOXEY chat logout cleanup failed',err);}
      try{window.FOXEY_ARCADE_LIVE?.connect(supa,null);}
      catch(err){console.warn('FOXEY live logout cleanup failed',err);}
      try{window.FOXEY_ARCADE_UI2?.connect(supa,null);}
      catch(err){console.warn('FOXEY challenges logout cleanup failed',err);}
      try{window.FOXEY_ARCADE_MISSIONS?.connect(supa,null);}
      catch(err){console.warn('FOXEY missions logout cleanup failed',err);}
      message('🎮 Odhlášeno. Můžeš hrát jako host.');
    }catch(_){message('⚠️ Odhlášení se nezdařilo.');}
    finally{busy=false;render();}
  }
  // Explicitly connect existing SPA router to the safe mobile UI layer.
  window.FOXEY_ARCADE_UI2?.setNavigation(go);
  window.FOXEY_ARCADE_SOCIAL?.setNavigation(go);
  window.FOXEY_ARCADE_LIVE?.setNavigation(go);
  el('gameExitFullscreen')?.addEventListener('click',()=>{
    if(arcadeImmersive||document.fullscreenElement===el('page-play'))
      leaveGameFullscreen();
    else enterGameFullscreen();
  });
  document.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',event=>{
    event.preventDefault();
    go(button.dataset.page);
    if(button.dataset.page==='account'&&button.dataset.accountTab)
      selectSubtab('account',button.dataset.accountTab);
  }));
  bindSubtabs('account');
  bindSubtabs('shop');
  el('launchChallenge').addEventListener('click',openChallengeInGame);
  el('tabLogin').addEventListener('click',()=>setMode('login'));
  el('tabSignup').addEventListener('click',()=>setMode('signup'));
  // Shared locale is independent of authentication, wallets and game saves.
  el('arcadeLanguage').addEventListener('change',event=>{
    window.FOXEY_I18N?.setLocale(event.target.value);
  });
  window.addEventListener('foxey-arcade:locale-changed',event=>{
    if(!['cs','en'].includes(event.detail?.locale))return;
    render(); // Re-render locale-sensitive numbers and statuses, never user data.
    updateImmersive(arcadeImmersive);
    const frame=el('gameFrame');
    if(frame.getAttribute('src')&&frame.contentWindow?.postMessage){
      frame.contentWindow.postMessage({
        type:'foxey-arcade:locale-changed',
        locale:event.detail.locale
      },location.origin);
    }
    window.FOXEY_I18N?.schedule();
  });
  el('authForm').addEventListener('submit',authenticate);
  el('googleAuthButton').addEventListener('click',()=>{void authenticateWithGoogle();});
  el('forgotPassword').addEventListener('click',()=>setAuthView('request'));
  el('recoveryBack').addEventListener('click',()=>setAuthView('default'));
  el('recoveryRequestForm').addEventListener('submit',requestPasswordRecovery);
  el('resetPasswordForm').addEventListener('submit',applyRecoveredPassword);
  el('profileForm').addEventListener('submit',saveProfile);
  el('signOut').addEventListener('click',signOut);
  el('shopPreviewChest')?.addEventListener('click',previewChestReward);
  el('shopRewardClose')?.addEventListener('click',closeChestReward);
  el('shopRewardDone')?.addEventListener('click',closeChestReward);
  el('shopRewardInventory')?.addEventListener('click',()=>{
    closeChestReward();
    selectSubtab('shop','avatars',true);
  });
  el('shopRewardOverlay')?.addEventListener('click',event=>{
    if(event.target===el('shopRewardOverlay')||
       event.target?.classList?.contains('shop-reward-backdrop'))closeChestReward();
  });
  document.addEventListener?.('keydown',event=>{
    if(event.key==='Escape'&&!el('shopRewardOverlay')?.classList.contains('hidden')){
      event.preventDefault?.();
      closeChestReward();
    }
  });
  el('shopOpenChest').addEventListener('click',()=>{void performShop('chest');});
  el('shopOpenEpicChest').addEventListener('click',()=>{void performShop('epic-chest');});
  el('claimPrestige').addEventListener('click',()=>{void claimPrestige();});
  document.querySelectorAll('[data-avatar]').forEach(btn=>
    btn.addEventListener('click',()=>{void equipAvatar(btn.dataset.avatar);})
  );
  el('shopRefresh').addEventListener('click',()=>{if(user)void loadSharedWallet();});
  document.querySelectorAll('[data-theme]').forEach(btn=>btn.addEventListener('click',()=>{
    void performShop('theme',btn.dataset.theme);
  }));
  document.querySelectorAll('[data-action="refreshProgress"]').forEach(button=>{
    button.addEventListener('click',()=>{if(user&&supa)void loadGameProgress();});
  });
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin || event.source!==el('gameFrame').contentWindow)return;
    if(event.data?.type==='foxey-arcade:open-shop'){
      // Navigation only: the iframe stays mounted with its verified quiz run.
      // The shared wallet and Shop are still server-authorized as usual.
      go('shop');
      return;
    }
    if(event.data?.type==='foxey-arcade:open-live-match'){
      const id=event.data.match_id;
      if(user&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)){
        go('community');
        void window.FOXEY_ARCADE_LIVE?.openMatch?.(id,false);
      }
      return;
    }
    if(event.data?.type==='foxey-arcade:invite-live-friend'){
      // Navigation intent only; the authenticated live RPC still checks
      // friendship and blocks server-side. Never accept IDs from other frames.
      const friend=event.data.friend_id;
      if(user&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(friend)){
        go('community');
        void window.FOXEY_ARCADE_LIVE?.invite(friend,{mode:'classic',target:1});
      }
      return;
    }
    if(event.data?.type==='foxey-arcade:locale-changed'){
      if(['cs','en'].includes(event.data.locale))
        window.FOXEY_I18N?.setLocale(event.data.locale);
      return;
    }
    if(event.data?.type==='foxey-arcade:rewards-credited'){
      if(!user||!supa)return;
      const uid=user.id;
      // Never trust currency numbers from frame messages. Refresh from
      // authenticated server tables under user-scoped RLS.
      void getProfile(uid).then(fresh=>{
        if(user?.id!==uid)return;
        const previousLevel=profile?1+Math.floor(safeNum(profile.arcade_xp)/100):null;
        const currentLevel=1+Math.floor(safeNum(fresh.arcade_xp)/100);
        profile=fresh;render();
        if(previousLevel!==null&&currentLevel>previousLevel){
          celebrate(achievementsEnglish()?
            '🎖️ Level up! You reached level '+currentLevel+'!':
            '🎖️ Nový level! Dosáhl jsi úrovně '+currentLevel+'!');
        }
      }).catch(()=>{});
      void loadSharedWallet();
      void loadAchievements();
      void window.FOXEY_ARCADE_MISSIONS?.refresh();
      return;
    }
    if(event.data?.type!=='foxey-arcade:gtg-cloud-synced')return;
    if(!user || event.data.userId!==user.id)return;
    // Trust the verified account and Supabase RLS, never numbers from postMessage.
    void loadGameProgress();
    void loadSharedWallet();
  });
  window.addEventListener('foxey-arcade:locale-changed',()=>renderAchievements());
  // Mission status may complete a missed, already-earned award after reconnect.
  // Never trust client-reported amounts: refetch authenticated wallet data.
  window.addEventListener('foxey-arcade:missions-awarded',()=>{
    if(user&&supa)void loadSharedWallet();
  });
  window.addEventListener('hashchange',()=>{
    const target=location.hash.replace(/^#/,'');
    go(target==='domu'?'home':target);
  });
  go(location.hash==='#domu'?'home':location.hash.replace(/^#/,''));
  render();
  if(!cfg||!window.supabase||typeof window.supabase.createClient!=='function'){
    el('connectionStatus').textContent='⚠️ Offline';
    message('⚠️ Nepodařilo se načíst přihlášení. Zkontroluj připojení a obnov stránku.');
    el('authSubmit').disabled=true;
    return;
  }
  supa=window.supabase.createClient(cfg.supabaseUrl,cfg.publishableKey,{
    auth:{storageKey:cfg.sessionKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  supa.auth.onAuthStateChange((event)=>{
    if(event==='SIGNED_IN' && RETURNING_FROM_OAUTH){
      // Supabase callback handlers must not await other Supabase calls.
      // Refresh UI only for the OAuth return, not for normal email logins.
      setTimeout(()=>{void refresh();go('account');},0);
    }
    if(event==='PASSWORD_RECOVERY'){
      recoveryVerified=true;
      authView='reset';
      // Let Supabase finish storing the recovery session before rendering it.
      queueMicrotask(()=>{
        // URL fragment already consumed by Supabase. Remove recovery-only
        // callback parameters from the address without logging any tokens.
        const clean=new URL(location.href);
        clean.searchParams.delete('auth');
        history.replaceState(null,'',clean.pathname+clean.search+'#account');
        go('account');render();
        message('🔐 Odkaz ověřen. Nastav si nové heslo.');
      });
    }
  });
  // A recovery URL must never present a password form without a verified session.
  // PASSWORD_RECOVERY is emitted by Supabase after successfully consuming the link.
  refresh();
})();