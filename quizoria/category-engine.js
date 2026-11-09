/* Quizoria 1.5 | Shared secure-trivia category adapter.
 * One vetted call map for all ordinary server-authoritative categories.
 * Never accepts user-provided RPC names, table names or query SQL.
 * Video Games and Million Challenge retain their specialized game engines. */
(()=>{
'use strict';
const names=Object.freeze({
  memes:'quizoria_meme',
  movies:'quizoria_movie',
  music:'quizoria_music'
});
const actions=Object.freeze([
  'begin','resume','answer','my_runs',
  'challenge_create','challenge_join','challenge_status'
]);
window.QUIZORIA_CATEGORY_ENGINE=Object.freeze({
  version:'1.5',
  categories:Object.freeze(Object.keys(names)),
  config(category){
    const c=window.QUIZORIA_CATALOG?.getCategory?.(category);
    if(!Object.prototype.hasOwnProperty.call(names,category)||!c||c.state!=='available')
      return null;
    return Object.freeze({id:category,modes:c.allowedModes,actions,rpcPrefix:names[category]});
  },
  rpc(client,category,action,params){
    const config=this.config(category);
    if(!config||!actions.includes(action)||typeof client?.rpc!=='function')
      throw Error('unsupported_quizoria_action');
    const endpoint=config.rpcPrefix+'_'+action;
    return client.rpc(endpoint,params);
  },
  parseInvite(raw,key){
    const value=String(raw||'').trim();
    try{
      const url=new URL(value);
      raw=url.searchParams.get(key+'_challenge')||value;
    }catch(_){raw=value;}
    const id=String(raw||'');
    return /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)?id:null;
  }
});
})();