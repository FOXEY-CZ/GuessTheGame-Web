/* Supabase Auth single sign-on: share the Arcade login session on this
 * same-origin GitHub Pages site. This migrates ONLY the former local session,
 * NEVER game progression. The stable Guess the Game remains unaffected. */
(() => {
  const oldKey='gtg.accountTest.v1.authSession';
  const newKey='foxey.arcade.auth.v1';
  try{
    const old=localStorage.getItem(oldKey);
    if(old && !localStorage.getItem(newKey)){
      const saved=JSON.parse(old);
      if(saved && typeof saved.access_token==='string' &&
         typeof saved.refresh_token==='string' && saved.user?.id)
        localStorage.setItem(newKey,old);
    }
    if(localStorage.getItem(newKey))localStorage.removeItem(oldKey);
  }catch(_){}
})();
/* PUBLIC publishable key only. Never place service_role or secret API keys in client code. */
window.GTGAuthConfig=Object.freeze({url:'https://ivfhfdrjkktfueeqdgej.supabase.co',publishableKey:'sb_publishable_A569sxFOTtPwwFJQtSC7Sg_o47CQEwU',storageKey:'foxey.arcade.auth.v1'});
