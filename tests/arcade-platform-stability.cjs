'use strict';
/* FOXEY Arcade stability audit: source-only, no network calls, no user data.
 * Enforces platform boundaries independently of any one game. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const arcadeHtml=read('arcade/index.html');
const arcadeApp=read('arcade/app.js');
const game=read('secure-quiz-beta.html');
const gameAuth=read('account-test.js');
const gameConfig=read('account-config.js');
const arcadeConfig=read('arcade/config.js');
const i18n=read('arcade/i18n.js');
const modules={
  FOXEY_ARCADE_NOTIFICATIONS:'arcade/notifications.js',
  FOXEY_ARCADE_UI2:'arcade/ui2.js',
  FOXEY_ARCADE_MISSIONS:'arcade/missions.js',
  FOXEY_ARCADE_SOCIAL:'arcade/friends.js',
  FOXEY_ARCADE_LIVE:'arcade/live.js'
};

// Navigation must be a single registered set, never dead links or missing pages.
const pageDeclaration=arcadeApp.match(/const PAGES\s*=\s*new Set\(\[([^\]]+)\]\)/);
assert.ok(pageDeclaration,'Arcade routing registry missing');
const pages=[...pageDeclaration[1].matchAll(/'([a-z-]+)'/g)].map(x=>x[1]);
assert.equal(pages.length,new Set(pages).size,'duplicated router page');
const ids=[...arcadeHtml.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
assert.equal(ids.length,new Set(ids).size,'duplicate Arcade HTML IDs');
for(const page of pages)
 assert.ok(ids.includes('page-'+page),'route without a matching page: '+page);
for(const [,page] of arcadeHtml.matchAll(/\bdata-page="([^"]+)"/g))
 assert.ok(pages.includes(page),'dead navigation to unregistered page: '+page);

// All local script/stylesheet files must exist at the exact published path.
// These checks catch silent stale bundle refs and accidental deletions.
for(const [htmlPath,html] of [
  ['arcade/index.html',arcadeHtml],
  ['secure-quiz-beta.html',game],
  ['preview-auth-test.html',read('preview-auth-test.html')]
]){
 const assetRe=/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+)"[^>]*>/g;
 for(const match of html.matchAll(assetRe)){
  const value=match[1];
  if(!value.startsWith('./')&&!value.startsWith('../'))continue;
  const local=value.split(/[?#]/)[0];
  if(!/\.(?:js|css)$/.test(local))continue;
  const target=path.resolve(root,path.dirname(htmlPath),local);
  assert.ok(target.startsWith(root+path.sep),
    'source refers outside repo: '+htmlPath+' => '+local);
  assert.ok(fs.existsSync(target),'missing local asset: '+htmlPath+' => '+local);
 }
}

// The platform owns accounts, wallets, profiles, friends, notifications and
// matchmaking. A game owns only its own progress/quiz rules.
// Do not hardcode a one-game-only route or introduce a second wallet.
for(const page of ['home','games','play','shop','missions','community','account','settings'])
 assert.ok(pages.includes(page),'missing platform-wide page '+page);
for(const id of ['gameFrame','headerArcadeXp','homeArcadeXp','homeXp',
  'headerCrowns','headerShards','accountCrowns','accountShards',
  'arcadeBell','liveSeriesSummary','liveHeadToHeadRows','liveFriendList']){
 assert.ok(ids.includes(id),'missing shared or game-scoped UI '+id);
}
assert.ok(arcadeApp.includes("const GAME_URL = '../secure-quiz-beta.html"),
 'play route should still load the secure original game');
assert.ok(arcadeHtml.includes('Guess the Meme')&&
          arcadeHtml.includes('Draw &amp; Guess')&&
          arcadeHtml.includes('Mini Golf'),
 'other upcoming games must remain visible in the library');
assert.ok(arcadeApp.includes("from('gtg36_account_progress')"),
 'Game-specific progress remains separate from global account XP');
assert.ok(arcadeApp.includes("from('arcade_wallets')"),
 'Arcade must keep one shared currency wallet');
assert.ok(gameAuth.includes("from('arcade_wallets')"),
 'embedded game must read central wallet rather than mint a second one');
assert.ok(arcadeHtml.includes('src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0"'),
 'SDK must be pinned for stable auth behavior');

// Same identity across all services; no service can keep the prior user's
// state after sign-out or failed recovery.
assert.ok(arcadeConfig.includes("sessionKey:'foxey.arcade.auth.v1'"));
assert.ok(gameConfig.includes("storageKey:'foxey.arcade.auth.v1'"));
assert.ok(arcadeApp.includes('closeGameOnIdentityChange()'),
 'identity change must unload the embedded game');
for(const [name,p] of Object.entries(modules)){
 const script=read(p);
 assert.ok(arcadeHtml.includes('./'+path.basename(p)+'?'),
  'Arcade must load '+name+' with a cache version');
 assert.ok(script.includes('window.'+name+'=')||
           script.includes('window.'+name+' ='),
  'service '+name+' must publish its API');
 assert.ok(arcadeApp.includes('window.'+name+'?.connect(supa,user)'),
  name+' must connect on login');
 assert.ok(arcadeApp.includes('window.'+name+'?.connect(supa,null)'),
  name+' must disconnect on logout');
}
const out=arcadeApp.slice(arcadeApp.indexOf('  async function signOut(){'));
assert.ok(out.includes("++achievementSeq;achievements=null;achievementStatus='guest'"),
 'achievements must be cleared at sign-out');
assert.ok(out.includes("gameProgress=null;progressRevision=null"),
 'game save snapshot must be cleared at sign-out');
assert.ok(out.includes("sharedWallet=null;sharedCosmetics=null"),
 'wallet cache must be cleared at sign-out');

// Realtime game state and XP must remain server-authoritative, never accessed
// through a public private-schema table.
const live=read('arcade/live.js');
const source=read('arcade/missions.js');
assert.ok(live.includes("call('arcade_live_series_create'"));
assert.ok(live.includes("call('arcade_live_head_to_head'"));
assert.ok(source.includes("rpc('arcade_global_missions")||
          source.includes("call('arcade_global_missions"),
 'server-verified missions must remain available');
assert.ok(!/\.from\(['"]arcade_live_(?:answers|matches|series)['"]\)/.test(live),
 'live scores/answers must not be written directly by client');
assert.ok(!/\.from\(['"]arcade_wallets['"]\)\.update\(/.test(live),
 'live game must never mutate wallet balances');
assert.ok(!/sb_secret_[A-Za-z0-9_-]+/.test(arcadeConfig),
 'secret keys must not appear in browser config');
assert.ok(i18n.includes('FOXEY_I18N')&&game.includes('foxey-arcade'),
 'platform and game localization/communication hooks required');

console.log(
 'PASS: platform routes, local bundles, one auth session, logout isolation, shared wallet/XP, multi-game catalog and server-owned live play.'
);