'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const read=p=>fs.readFileSync(p,'utf8');
const source=JSON.parse(read('quizoria/media/commons/source-manifest.json'));
const local=JSON.parse(read('quizoria/media/commons/local-credits.json'));
const main=read('supabase/quizoria_meme_content_2_0_20261112.sql');
const bonus=read('supabase/quizoria_meme_bonus_bank_2_0_20261112.sql');
const catalog=read('quizoria/catalog.js'),client=read('quizoria/memes.js');
const survival=read('quizoria/survival.js'),endless=read('quizoria/endless.js');
const html=read('arcade/media-library.html'),shell=read('secure-quiz-beta.html');
function jsonInput(sql){
 const marker="FROM jsonb_to_recordset('";
 const i=sql.indexOf(marker),j=sql.indexOf("'::jsonb)",i);
 assert.ok(i>=0&&j>i,'SQL content payload missing');
 return JSON.parse(sql.slice(i+marker.length,j).replace(/''/g,"'"));
}
assert.equal(source.entries.length,12);
assert.equal(local.entries.length,12);
const allowed=new Map(source.entries.map(e=>[e.asset_key,e]));
for(const item of local.entries){
 const matching=allowed.get(item.asset_key);
 assert.ok(matching&&matching.local_file===item.local_file,'Unapproved media mirrored: '+item.asset_key);
 const bytes=fs.readFileSync('quizoria/media/commons/'+item.local_file);
 const hash=crypto.createHash('sha256').update(bytes).digest('hex');
 assert.equal(hash,item.sha256,'Media checksum differs: '+item.asset_key);
 assert.ok(bytes.length>800&&bytes.length<=5000000,'Unreasonable image size');
 assert.ok(item.source_url.startsWith('https://commons.wikimedia.org/wiki/File:'));
 assert.ok(item.author&&item.license);
 assert.ok(html.includes('src="../quizoria/media/commons/'+item.local_file+'"'),
    'Missing source attribution gallery: '+item.local_file);
}
const primary=jsonInput(main),extra=jsonInput(bonus);
assert.equal(primary.length,36,'Twelve images x three difficulties');
assert.equal(extra.length,24,'Extra meme themed Survival questions');
const all=[...primary,...extra];
assert.equal(new Set(all.map(e=>e.id)).size,60);
for(const e of all){
 assert.ok(allowed.has(e.image_key),'Media not licensed in source manifest');
 assert.match(e.image_url,/^https:\/\/foxey-cz\.github\.io\/GuessTheGame-Web\/quizoria\/media\/commons\/meme-[a-z0-9-]+\.(?:jpg|png)$/);
 assert.equal(e.options.length,4);
 assert.ok(e.answer_index>=0&&e.answer_index<=3);
 assert.equal(e.options[e.answer_index].key,e.answer_index);
 for(const lang of ['cs','en']){
  assert.ok(e['prompt_'+lang].trim().length>8);
  assert.equal(new Set(e.options.map(o=>o[lang])).size,4);
 }
 assert.ok(!/\b(HTTP|ping|FPS|Caps Lock|AFK|klávesov(?:á|é) zkratk|latency|network port)\b/i.test(e.prompt_cs+' '+e.prompt_en),
  'Internet/IT knowledge question mixed into Memes: '+e.id);
}
for(const diff of ['easy','medium','hard'])
 assert.equal(all.filter(e=>e.difficulty===diff).length,20);
assert.ok(catalog.includes("cs:{name:'Memy',description:"));
assert.ok(catalog.includes("en:{name:'Memes',description:"));
assert.ok(!catalog.includes("cs:{name:'Memy a internet'"));
assert.ok(client.includes('const curatedMeme=url=>'));
assert.ok(client.includes('const localMeme=curatedMeme(src);'));
assert.ok(survival.includes('const localMeme='));
assert.ok(endless.includes('commons\\/meme-') || endless.includes('commons\/meme-'));
assert.ok(shell.includes('foxey-memes-20-20261112a'));
console.log('PASS: 12 locally mirrored licensed meme pictures, 60 real meme Qs, all distinct answers, no tech trivia, correct mobile media renderer');
