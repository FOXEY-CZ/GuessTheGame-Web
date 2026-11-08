/* Shared daily and weekly FOXEY Arcade missions.
 * Read only owner-scoped signed-in RPC. No browser-supplied progress or payout. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const english=()=>window.FOXEY_I18N?.getLocale?.()==='en';
  const tr=(cs,en)=>english()?en:cs;
  let api=null,uid=null,revision=0,pending=false,missions=null,loaded=false;
  let lastAwardCount=0;
  const text=(id,value)=>{const e=$(id);if(e)e.textContent=value;};
  const make=(tag,className,value)=>{
    const e=document.createElement(tag);
    if(className)e.className=className;
    if(value!==undefined)e.textContent=value;
    return e;
  };
  const completed=m=>m?.completed===true;
  function rewardText(m){
    const parts=[];
    if(Number(m.reward_shards)>0)parts.push('💎 +'+m.reward_shards);
    if(Number(m.reward_crowns)>0)parts.push('👑 +'+m.reward_crowns);
    if(Number(m.reward_chests)>0)parts.push('🎁 +'+m.reward_chests);
    return parts.join('  ·  ');
  }
  function card(m){
    const root=make('article','mission-item'+(completed(m)?' mission-completed':''));
    const icon=make('span','mission-icon',m.icon||'🎯');
    icon.setAttribute('aria-hidden','true');
    const contents=make('div','mission-details');
    const name=make('strong','mission-name',
      (english()?m.name_en:m.name_cs)||m.code);
    const desc=make('p','mission-description',
      (english()?m.description_en:m.description_cs)||'');
    const progress=make('div','mission-progress-label',
      completed(m)?tr('✓ Splněno · Odměna připsána','✓ Completed · Reward credited'):
      String(Math.min(Number(m.target)||1,Number(m.progress)||0))+' / '+m.target);
    const bar=make('div','mission-progress-track');
    const fill=make('span','mission-progress-fill');
    const target=Math.max(1,Number(m.target)||1);
    fill.style.width=(completed(m)?100:
      Math.max(0,Math.min(100,100*(Number(m.progress)||0)/target)))+'%';
    bar.append(fill);
    const reward=make('span','mission-reward',rewardText(m));
    contents.append(name,desc,progress,bar,reward);
    root.append(icon,contents);
    return root;
  }
  function render(){
    const signed=!!uid;
    const entries=Array.isArray(missions?.missions)?missions.missions:[];
    const daily=entries.filter(m=>m.period==='daily');
    const weekly=entries.filter(m=>m.period==='weekly');
    const allCompleted=entries.filter(completed).length;
    const summary=!signed?tr('Přihlas se a uvidíš své mise.','Sign in to see your missions.'):
      pending?tr('☁️ Načítám mise…','☁️ Loading missions…'):
      !loaded?tr('⚠️ Mise se zatím nepodařilo načíst.','⚠️ Missions could not be loaded.'):
      tr('Odměny automaticky připsané: ','Automatically credited rewards: ')+
        allCompleted+' / '+entries.length;
    text('homeMissionStatus',summary);
    text('missionsStatus',lastAwardCount>0&&signed&&!pending?
      tr('🎁 Nově automaticky připsáno odměn: ',
         '🎁 Newly credited mission rewards: ')+lastAwardCount+' · '+summary:summary);
    const fill=(id,items)=>{
      const root=$(id);if(!root?.replaceChildren)return;
      root.replaceChildren();
      if(!signed||!loaded){
        root.append(make('p','mission-empty',signed?
          tr('Načítám mise…','Loading missions…'):
          tr('Pro mise se přihlas.','Sign in for missions.')));
        return;
      }
      if(!items.length)root.append(make('p','mission-empty',
        tr('Žádné dostupné mise.','No available missions.')));
      else root.replaceChildren(...items.map(card));
    };
    // Small previews only. Full progress lives on the Missions page.
    const nearest=entries.filter(m=>!completed(m));
    fill('homeMissionList',[
      ...nearest.filter(m=>m.period==='daily').slice(0,2),
      ...nearest.filter(m=>m.period==='weekly').slice(0,1),
      ...entries.filter(completed).slice(0,Math.max(0,3-
        nearest.filter(m=>m.period==='daily').slice(0,2).length-
        nearest.filter(m=>m.period==='weekly').slice(0,1).length))
    ].slice(0,3));
    fill('dailyMissionList',daily);
    fill('weeklyMissionList',weekly);
    text('dailyMissionCountdown',tr('Reset: denně 00:00 UTC',
                                    'Reset: every day 00:00 UTC'));
    text('weeklyMissionCountdown',tr('Reset: pondělí 00:00 UTC',
                                     'Reset: Monday 00:00 UTC'));
    const btn=$('missionsRefresh');if(btn)btn.disabled=pending||!signed;
  }
  async function refresh(){
    if(!uid||!api||pending||navigator.onLine===false)return;
    const id=uid,stamp=++revision;
    pending=true;render();
    try{
      const {data,error}=await api.rpc('arcade_global_missions');
      if(error||data?.ok!==true||!Array.isArray(data.missions))
        throw Error(error?.message||'mission_status_invalid');
      if(id!==uid||stamp!==revision)return;
      missions=data;loaded=true;
      lastAwardCount=Array.isArray(data.new_rewards)?data.new_rewards.length:0;
      if(lastAwardCount>0){
        // The parent must fetch actual account balances from authenticated
        // Supabase tables; no frontend-supplied currency is authoritative.
        window.dispatchEvent(new Event('foxey-arcade:missions-awarded'));
      }
    }catch(e){
      if(id===uid&&stamp===revision)loaded=false;
    }finally{
      if(id===uid&&stamp===revision){pending=false;render();}
    }
  }
  function connect(client,user){
    const next=user?.id||null;
    if(next!==uid){
      revision++;missions=null;loaded=false;pending=false;lastAwardCount=0;
    }
    api=client||null;uid=next;
    render();
    if(uid)void refresh();
  }
  function onPage(page){
    if(uid&&['missions','home','account'].includes(page))void refresh();
  }
  $('missionsRefresh')?.addEventListener('click',()=>void refresh());
  window.addEventListener('foxey-arcade:locale-changed',render);
  window.addEventListener('focus',()=>{
    if(uid&&document.visibilityState!=='hidden')void refresh();
  });
  window.FOXEY_ARCADE_MISSIONS=Object.freeze({connect,onPage,refresh});
  render();
})();
