'use strict';
// FOXEY Arcade 2.7: Quizoria is a standalone browser game.
// No platform-owned native fullscreen, no embedded player iframe to trap navigation.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const arcade=fs.readFileSync('arcade/index.html','utf8');
const app=fs.readFileSync('arcade/app.js','utf8');
const game=fs.readFileSync('secure-quiz-beta.html','utf8');
assert.ok(arcade.includes('<iframe id="gameFrame" title="Legacy Game Frame" hidden></iframe>'),
  'Backward-compatible iframe must remain unloaded');
assert.ok(!arcade.includes('id="gameExitFullscreen"'),
  'Launcher must not show obsolete native fullscreen controls');
assert.ok(app.includes("const GAME_URL = '../secure-quiz-beta.html"),
  'Arcade play route must use the standalone game');
assert.ok(app.includes("if(page==='play'){location.assign(standaloneGameUrl());return;}"),
  'Deep-linked play route must open standalone Quizoria');
assert.ok(app.includes('new URL(GAME_URL,location.href)'),
  'Standalone game links must be resolved using the current site origin');
assert.ok(arcade.includes('class="arcade-standalone-link')||
  arcade.includes('arcade-standalone-link"'), 'Launcher links must directly open game');
assert.ok(game.includes('class="platform-return"'),
  'Standalone game must retain an explicit return-to-Arcade link');
assert.ok(game.includes('id="memeVisualNote"'), 'Original visual pack should load in the standalone game');
assert.ok(!app.includes('enterGameFullscreen()')&&
  !app.includes('requestFullscreen()'),'The old launcher fullscreen controller must remain disabled');
console.log('PASS: standalone game navigation, unloadable legacy iframe, no unwanted fullscreen button, platform return and Visual Quiz');
