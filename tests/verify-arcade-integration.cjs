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

assert.ok(!html.includes('id="avatarItems"'),'Avatar shop must not appear');
assert.ok(html.includes('id="themeItems"'),'Game theme shop must remain');
assert.ok(html.includes("if(item.type!=='theme')return;"),'Avatar purchases must be guarded');
assert.ok(html.includes("for(const type of ['theme'])"),'Only themes can be rendered in the shop');
assert.ok(html.includes('setArcadeAvatar:(id)=>'),'Game must expose read-only global avatar display');
assert.ok(html.includes('c.avatars=[...new Set'),'Old avatar ownership must not be deleted');
assert.ok(!html.includes("profile.cosmetics.avatars.push('glitch')"),'Chest must no longer mint new avatars');
assert.ok(html.includes("profile.crowns+=12"),'Special chest still awards crowns');
assert.ok(account.includes("from('arcade_profiles')"),'Game must read Arcade avatar by authenticated user');
assert.ok(account.includes("select('avatar_id')"),'Game must only read avatar');
assert.ok(account.includes("event.origin!==location.origin||event.source!==window.parent"),
          'Game must verify cross-frame avatar refresh message');
assert.ok(arcade.includes('foxey-arcade:avatar-updated'),'Arcade must notify game after account avatar update');
assert.ok(arcadeHtml.includes('id="headerArcadeXp"')&&!arcadeHtml.includes('id="headerXp"'),
          'Global XP must be distinct from Guess the Game XP');
assert.ok(arcadeHtml.includes('id="homeXp"'), 'The game must retain per-game XP');
assert.ok(arcadeHtml.includes('./avatars.js'),'Arcade avatar art must be loaded');

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
console.log('PASS: separate global/game XP, same SVG avatar, theme-only shop, legacy avatar preservation, JS syntax.');
