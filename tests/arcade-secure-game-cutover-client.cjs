'use strict';
// Primary Arcade Guess the Game now embeds secure server-first quiz.
// Old root/legacy challenge URLs remain available, and no wallet payouts.
// Run: node tests/arcade-secure-game-cutover-client.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const app=read('arcade/app.js'),arcade=read('arcade/index.html'),
 beta=read('secure-quiz-beta.html'),old=read('preview-auth-test.html'),
 root=read('index.html'),i18n=read('arcade/i18n.js');
assert.match(app,/const GAME_URL = '\.\.\/secure-quiz-beta\.html\?v=[A-Za-z0-9-]+'/);
assert.ok(!app.includes("const GAME_URL = '../preview-auth-test.html'"));
assert.ok(arcade.includes('id="gameFrame"'));
assert.ok(arcade.includes('app.js?v='));
assert.ok(arcade.includes('i18n.js?v='));
assert.ok(arcade.includes('href="../secure-quiz-beta.html"'));
assert.ok(arcade.includes('href="../preview-auth-test.html"'));
assert.ok(arcade.includes('href="../preview-3.6.html"'));
assert.ok(arcade.includes('Za serverově ověřené partie se automaticky připisují globální XP a měny'),
  'Live payouts must be described as server-verified, not uncredited beta scores');
assert.ok(arcade.includes('Výsledek a globální odměny se ověřují na serveru'),
  'Embedded secure game must display current server-owned payout terms');
assert.ok(arcade.includes('Vyžaduje přihlášení'),
  'Secure multiplayer and rewards require a logged-in Arcade account');
assert.ok(arcade.includes('id="arcadeBell"'),
  'Live invitations must be reachable from the shared Arcade bell');
assert.ok(i18n.includes('The secure Guess the Game is now the primary version'));
assert.ok(root.includes('class="secure-upgrade-banner"'));
assert.ok(old.includes('class="secure-upgrade-banner"'));
assert.ok(root.includes('id="startClassic"'),'Legacy root game must remain intact');
assert.ok(old.includes('id="startClassic"'),'Legacy auth game must remain intact');
for(const link of ['brandLink','backToPlatform','backArcade','loginLink','bootArcadeLink']){
 const tag=beta.match(new RegExp('<a[^>]+id="'+link+'"[^>]*>'))?.[0];
 assert.ok(tag,'Missing embedded beta navigation '+link);
 assert.ok(tag.includes('target="_top"'),'Exit must leave the iframe: '+link);
}
assert.ok(beta.includes('href="./preview-auth-test.html" target="_blank"'));
assert.ok(beta.includes("event.data?.type!=='foxey-arcade:open-challenges'"));
assert.ok(beta.includes("event.source!==window.parent"));
assert.ok(beta.includes("event.origin!==window.location.origin"));
assert.ok(beta.includes('showChallengesAfterAuth=true'));
assert.ok(beta.includes('openChallengesForLauncher()'));
assert.ok(!beta.includes('service_role'));
assert.ok(!beta.includes('window.GTG_QUESTIONS='));
// Test launcher sends same-origin navigation intent on already-loaded iframe.
const snippet=app.match(/  function openChallengeInGame\(\)\{[\s\S]*?\n  \}/)?.[0];
assert.ok(snippet,'Launcher challenge dispatcher missing');
const makeLaunch=new Function('el','go','user','location',
 'return ('+snippet.trim()+');');
const sent=[],loads=[],pages=[];
const frame={
 contentDocument:{readyState:'complete'},
 contentWindow:{location:{pathname:'/GuessTheGame-Web/secure-quiz-beta.html'},
   postMessage:(message,origin)=>sent.push({message,origin})},
 addEventListener:(name,fn,opts)=>loads.push({name,fn,opts})
};
const status={textContent:''};
let fn=makeLaunch(id=>id==='gameFrame'?frame:status,
 page=>pages.push(page),{id:'22222222-2222-4222-8222-222222222222'},
 {origin:'https://foxey-cz.github.io'});
fn();
assert.deepEqual(pages,['play']);
assert.equal(sent.length,1);
assert.deepEqual(sent[0],{
 message:{type:'foxey-arcade:open-challenges'},
 origin:'https://foxey-cz.github.io'
});
assert.equal(loads.length,0,'Already loaded iframe should receive direct message');
// A newly created frame receives the same command after its first load.
frame.contentDocument={readyState:'loading'};sent.length=0;loads.length=0;
fn();assert.equal(sent.length,0);assert.equal(loads.length,1);
assert.equal(loads[0].name,'load');assert.equal(loads[0].opts.once,true);
loads[0].fn();assert.equal(sent.length,1);
// A stale/about:blank iframe may report readyState=complete just after
// navigation. Never send to the wrong document before the secure load.
frame.contentDocument={readyState:'complete'};
frame.contentWindow.location.pathname='/GuessTheGame-Web/preview-auth-test.html';
sent.length=0;loads.length=0;
fn();assert.equal(sent.length,0);
assert.equal(loads.length,1);
frame.contentWindow.location.pathname='/GuessTheGame-Web/secure-quiz-beta.html';
loads[0].fn();assert.equal(sent.length,1);
const inspect=new Function('window',beta.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)
 .at(-1).replace(/^<script(?:\s[^>]*)?>|<\/script>$/g,''));
assert.equal(typeof inspect,'function');
console.log('PASS: primary secure iframe, verified challenge handoff, safe top navigation, legacy retained, server-owned rewards');
mainDummy();
function mainDummy(){}
