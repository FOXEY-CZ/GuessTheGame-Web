'use strict';
// Visual Quiz 1.0: read-only checks. No network calls, user data or currencies touched.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(process.cwd(),p),'utf8');
const manifest=JSON.parse(read('quizoria/media/manifest.json'));
const sql=read('supabase/quizoria_visual_quiz_1_0_original_art_20261111.sql');
const media=read('arcade/media-library.html');
const game=read('secure-quiz-beta.html');
const memes=read('quizoria/memes.js');
const survival=read('quizoria/survival.js');
const endless=read('quizoria/endless.js');
const arcade=read('arcade/index.html');
assert.equal(manifest.entries.length,13,'Visual pack must contain 13 distinct original illustrations');
const keys=new Set(),urls=new Set();
for(const entry of manifest.entries){
  const {asset_key:key,file}=entry;
  assert.match(key,/^vq-[a-z0-9-]+$/);
  assert.equal(file,key+'.svg');
  assert.ok(!keys.has(key),'Duplicate key: '+key);
  keys.add(key);
  assert.ok(!entry.external_assets.length,'Original SVG must not rely on a third-party media file');
  const markup=read('quizoria/media/'+file);
  assert.match(markup,/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(markup,/<title id="title">/);
  assert.match(markup,/<desc id="desc">/);
  assert.match(markup,/<\/svg>\s*$/);
  assert.ok(!/<script\b|<foreignObject\b|<image\b|xlink:href\s*=|\bhref\s*=|data:/i.test(markup),
    'Original media must be self-contained and non-executable: '+file);
  assert.ok(markup.length>=1100&&markup.length<15000,'Illustration bytes are unreasonable');
  const uri='https://foxey-cz.github.io/GuessTheGame-Web/quizoria/media/'+file;
  assert.ok(!urls.has(uri));urls.add(uri);
  assert.ok(sql.includes("'"+key+"','quizoria-memes','image','"+uri+"'"),
    'Approved media record absent: '+key);
  for(const difficulty of ['easy','medium','hard']){
    assert.ok(sql.includes("'"+key+"-"+difficulty+"','"+key+"','"+difficulty+"'"),
      'Bilingual question absent: '+key+'/'+difficulty);
  }
  assert.ok(media.includes('src="../quizoria/media/'+file+'"'), 'Media gallery missing: '+file);
}
assert.equal((media.match(/class="asset approved visual-art"/g)||[]).length,13);
assert.equal((sql.match(/\('vq-[a-z0-9-]+-(?:easy|medium|hard)','vq-[a-z0-9-]+','(?:easy|medium|hard)'/g)||[]).length,39);
assert.ok(sql.includes('ON CONFLICT (asset_key) DO NOTHING'));
assert.ok(sql.includes('ON CONFLICT (id) DO NOTHING'));
for(const [name,client] of [['Memes',memes],['Survival',survival],['Endless',endless]]){
  assert.ok(client.includes('foxey-cz')&&client.includes('vq-[a-z0-9-]+'),
    name+' must support only first-party Visual Quiz URLs');
}
assert.ok(memes.includes('originalVisual(source)')&&memes.includes('originalVisual(src)'));
assert.ok(game.includes('id="memeVisualNote"'),'Visual Quiz badge missing');
assert.ok(game.includes('foxey-visual-quiz-10-20261111a'),'New game scripts not cache-busted');
assert.ok(arcade.includes('foxey-visual-quiz-10-20261111a'),'Launcher not cache-busted');
assert.ok(!/\.from\(['"]arcade_wallets['"]\)\.update/.test(memes));
console.log('PASS: 13 original script-free SVGs, 39 bilingual questions, rights manifest, media links, safe renderer and cache release');
