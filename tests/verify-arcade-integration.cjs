/* FOXEY Arcade ↔ Guess the Game: static structural tests.
 * This script reads source files only, never touches real player data. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('preview-auth-test.html','utf8');
const account=fs.readFileSync('account-test.js','utf8');
const arcade=fs.readFileSync('arcade/app.js','utf8');
const arcadeHtml=fs.readFileSync('arcade/index.html','utf8');
const arts=fs.readFileSync('arcade/avatars.js','utf8');

assert.ok(!html.includes('id="avatarItems"'),'Avatar shop must remain removed');
assert.ok(!html.includes('id="themeItems"'),'Game theme shop must move to Arcade');
assert.ok(!html.includes('id="openChest"'),'Chest opening belongs to Arcade');
assert.ok(!html.includes('id="openShopHome"')&&!html.includes('id="openShopProfile"'),'No in-game shop buttons');
assert.ok(!html.includes('function shopAction(')&&!html.includes('function openChest('),
          'No in-game currency spending paths');
assert.ok(html.includes('setArcadeAvatar:(id)=>'),'Shared avatar display required');
assert.ok(html.includes('setArcadeWallet:(value)=>'),'Game must render shared wallet');
assert.ok(html.includes('setArcadeTheme:(id)=>'),'Game must render centrally selected theme');
assert.ok(html.includes('c.avatars=[...new Set'),'Historical avatar unlocks must stay saved');
assert.ok(account.includes("from('arcade_profiles')"),'Game must read global avatar');
assert.ok(account.includes("from('arcade_wallets')"),'Game must read shared wallet');
assert.ok(account.includes("from('arcade_cosmetics')"),'Game must read central theme');
assert.ok(account.includes("rpc('arcade_sync_legacy')"),'Game earnings must sync to global wallet via server');
assert.ok(account.includes("event.origin!==location.origin||event.source!==window.parent"),
          'Cross-frame signals require origin and source verification');
assert.ok(arcade.includes("rpc('arcade_buy_theme'"),'Theme purchase must use server transaction');
assert.ok(arcade.includes("rpc('arcade_open_chest'"),'Chest spin must use server transaction');
assert.ok(arcadeHtml.includes('id="headerArcadeXp"')&&!arcadeHtml.includes('id="headerXp"'),
          'Global XP must remain separate from Guess the Game XP');
assert.ok(arcadeHtml.includes('id="headerShards"')&&arcadeHtml.includes('id="headerCrowns"'),
          'Only one account-level shared wallet should appear in the header');
assert.ok(arcadeHtml.includes('id="homeXp"'),'Game XP must remain visible separately');
assert.ok(arcadeHtml.includes('id="page-shop"'),'Central shop must be present');
assert.ok(arcadeHtml.includes('./avatars.js'),'Arcade must load the same SVG avatars');

const gameStyle=html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
assert.ok(gameStyle,'Guess the Game stylesheet is required');
for(const theme of ['retro','royal','ocean']){
  assert.ok(gameStyle.includes('html.theme-'+theme+'{background:'),
    'Full-page backdrop must change for '+theme);
  assert.ok(gameStyle.includes('body.theme-'+theme+'{'),
    'Theme-specific background palette must exist for '+theme);
  const themedRule=gameStyle.slice(gameStyle.lastIndexOf('body.theme-'+theme+'{'));
  assert.match(themedRule.slice(0,850),/--bg:#[0-9a-f]{6}/,
    'Theme '+theme+' needs its own page background color');
  assert.match(themedRule.slice(0,850),/background:radial-gradient/,
    'Theme '+theme+' must color the entire game background');
}
assert.ok(html.includes("document.documentElement.classList.add('theme-'+theme)"),
  'Changing the theme must update the root document as well as the body');
assert.ok(gameStyle.includes(' .glow-card{')&&gameStyle.includes('var(--theme-panel-top)'),
  'Quiz/question cards must use the currently equipped theme palette');
assert.ok(gameStyle.includes(' .answer:not(.correct):not(.wrong)'),
  'Quiz answer surfaces must use the same game theme, preserving correct/wrong states');
assert.ok(gameStyle.includes(' .mode-main,')&&gameStyle.includes('var(--theme-cta-from)'),
  'Main game actions must follow the equipped theme');


const ctx={window:{}};
vm.runInNewContext(arts,ctx);
for(const id of ['fox','alien','robot','crown']){
  const key='avatar'+id[0].toUpperCase()+id.slice(1);
  const matches=html.match(new RegExp(key+':`([^`]+)`'));
  assert.ok(matches, 'Missing original avatar '+id);
  assert.equal(ctx.window.FOXEY_AVATAR_ART[id],matches[1], 'Arcade and game avatar art must match '+id);
}
const inlineScripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.ok(inlineScripts.length>=2,'Expected original game inline scripts');
for(const [,source] of inlineScripts) new vm.Script(source);
new vm.Script(account);
new vm.Script(arcade);
console.log('PASS: one shared wallet, central shop, separate XP, shared avatars and fully themed game backgrounds, cards, answers and actions.');
