'use strict';
// Regression for mobile screenshot: a hidden image must never ask the player to guess blindly.
// Static UI contract plus the live Supabase transaction tests are complementary checks.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('secure-quiz-beta.html','utf8');
const js=fs.readFileSync('quizoria/memes.js','utf8');
const css=fs.readFileSync('quizoria/memes.css','utf8');
const skip=html.indexOf('id="memeSkipCopyright"');
const repair=html.indexOf('id="memeRepairMedia"');
const prompt=html.indexOf('id="memePrompt"');
const options=html.indexOf('id="memeOptions"');
assert.ok(skip>0&&repair>0&&prompt>0&&options>0,'Missing recovery controls');
assert.ok(skip<prompt&&repair<prompt&&prompt<options,
  'Repair and skip must be visible ABOVE the question and answers on phones');
assert.equal((html.match(/id="memeSkipCopyright"/g)||[]).length,1,'Duplicate skip button');
assert.equal((html.match(/id="memeRepairMedia"/g)||[]).length,1,'Duplicate repair button');
assert.ok(css.includes('.meme-image-recovery{display:grid'),'Mobile recovery controls missing CSS');
assert.ok(js.includes('const unavailable=reviewed||broken||(!emoji&&!commons&&!selfArt);'),
  'Missing images must be classified as unavailable');
assert.ok(js.includes('if(!unavailable)opts.forEach((option,index)=>{'),
  'Must not render answer buttons for missing photos');
assert.ok(js.includes("brokenVisual=$('memeImage').dataset.src;"),
  'Image load failure must be recorded before rendering recovery controls');
assert.ok(js.includes('hide('+"'memeSkipCopyright'"+',!unavailable||awaitNext||run.finished);'),
  'Skip must be present for missing media');
assert.ok(js.includes('void answer(4)'),'Unavailable-media skip must be server-owned');
assert.ok(js.includes('void resume(run.run_id)'),'Image repair must reload the owner-scoped server run');
assert.ok(js.includes("const soloRepair=unavailable&&!run.challenge_id&&run.mode!=='daily'"),
  'Shared daily and friend challenges must keep deterministic question parity');
for(const p of [
 'supabase/quizoria_media_visibility_fix_1_1_20261111.sql',
 'supabase/quizoria_media_visibility_fix_1_1_1_auto_resume.sql',
 'supabase/quizoria_media_visibility_fix_1_1_2_skip_unavailable.sql',
 'supabase/quizoria_media_visibility_fix_1_1_3_survival_pool.sql']){
  assert.ok(fs.existsSync(p),'Missing migration: '+p);
}
assert.ok(js.includes('const originalVisual=url=>') &&
 js.includes('const selfArt=originalVisual(src);'),
 'First-party image renderer must remain in place');
console.log('PASS: missing pictures hide answer options, repair/skip visible on mobile, server-owned scores and four SQL migrations present');
