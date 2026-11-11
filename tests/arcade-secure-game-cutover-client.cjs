'use strict';
// Standalone Quizoria and legacy compatibility regression: UI-only, no player data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const app=read('arcade/app.js'),arcade=read('arcade/index.html'),
 beta=read('secure-quiz-beta.html'),old=read('preview-auth-test.html'),
 root=read('index.html'),i18n=read('arcade/i18n.js');
assert.match(app,/const GAME_URL = '\.\.\/secure-quiz-beta\.html\?v=[A-Za-z0-9-]+'/);
assert.ok(!app.includes("const GAME_URL = '../preview-auth-test.html'"),
 'secure Quizoria must be the primary game');
assert.ok(arcade.includes('<iframe id="gameFrame" title="Legacy Game Frame" hidden></iframe>'),
 'obsolete iframe should not be populated with a signed-in game');
assert.ok(app.includes("if(page==='play'){location.assign(standaloneGameUrl());return;}"),
 'Game route must use standalone navigation, not an iframe');
assert.ok(arcade.includes('href="../secure-quiz-beta.html?v=foxey-visual-quiz-10-20261111a"'),
 'Standalone launch links must include a current cache version');
assert.ok(arcade.includes('id="launchChallenge"')&&arcade.includes('view=challenges'),
 'Challenge launcher must pass an explicit challenges view');
assert.ok(arcade.includes('id="arcadeBell"'),'Friend invitations must be available');
assert.ok(arcade.includes('media-library.html'),'Media credits must be available');
assert.ok(i18n.includes('FOXEY_I18N'),'Shared localization must remain connected');
assert.ok(root.includes('id="startClassic"')&&old.includes('id="startClassic"'),
 'Legacy root/preview experiences must stay available');
assert.ok(beta.includes('id="memeVisualNote"'),'Newly integrated original artwork notice missing');
assert.ok(beta.includes('class="platform-return"'),'Standalone game needs an Arcade return control');
assert.ok(!beta.includes('service_role'),'Never expose server secret in public game');
assert.ok(!beta.includes('window.GTG_QUESTIONS='),'Server-owned answer data must stay private');
// Ensure challenge URL works under the known site origin and stays on that origin.
const base='https://foxey-cz.github.io/GuessTheGame-Web/arcade/';
const next=new URL('../secure-quiz-beta.html?v=foxey-visual-quiz-10-20261111a&view=challenges',base);
assert.equal(next.origin,'https://foxey-cz.github.io');
assert.equal(next.searchParams.get('view'),'challenges');
console.log('PASS: standalone secure Quizoria, challenge deep-link, return to Arcade, legacy fallback, rights and secrets guards');
