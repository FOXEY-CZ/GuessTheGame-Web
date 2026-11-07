'use strict';
/* FOXEY Arcade — Guess the Game question-bank safety gate.
 * Validates published quiz content without reading, creating or changing user data.
 * Run: node tests/guess-game-content.cjs
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const gameFiles=['preview-auth-test.html','preview-3.6.html'];

function extractQuestions(filename){
  const html=fs.readFileSync(path.join(root,filename),'utf8');
  const marker='window.GTG_QUESTIONS = ';
  const start=html.indexOf(marker);
  assert.ok(start!==-1,filename+': missing question bank');
  const end=html.indexOf('];',start+marker.length);
  assert.ok(end!==-1,filename+': unterminated question bank');
  const data=JSON.parse(html.slice(start+marker.length,end+1));
  assert.ok(Array.isArray(data),filename+': question bank is not an array');
  return {data,html};
}

function validate(filename,data,html){
  const ids=new Set(),answers=new Set(),counts={easy:0,medium:0,hard:0};
  const required=['id','difficulty','answer','wrong','cs','en','hintCs','hintEn','cluesCs','cluesEn','genre'];
  assert.ok(data.length>=200,filename+': fewer than 200 questions (investigate accidental data loss)');
  for(const q of data){
    for(const key of required)assert.ok(Object.hasOwn(q,key),filename+': '+(q.id||'?')+' missing '+key);
    assert.match(q.id,/^q\d{3,}$/);
    assert.ok(!ids.has(q.id),filename+': duplicated question ID '+q.id);ids.add(q.id);
    assert.ok(!answers.has(q.answer),filename+': duplicated correct answer '+q.answer);answers.add(q.answer);
    assert.ok(Object.hasOwn(counts,q.difficulty),filename+': invalid difficulty '+q.id);
    counts[q.difficulty]++;
    assert.ok(Array.isArray(q.wrong)&&q.wrong.length===3,filename+': '+q.id+' needs three incorrect choices');
    assert.equal(new Set([q.answer,...q.wrong]).size,4,filename+': '+q.id+' has duplicate answer choices');
    for(const key of ['answer','cs','en','hintCs','hintEn','genre'])
      assert.ok(typeof q[key]==='string'&&q[key].trim().length>0&&q[key].length<2000,
        filename+': invalid '+key+' for '+q.id);
    for(const key of ['wrong','cluesCs','cluesEn']){
      if(key!=='wrong')assert.ok(Array.isArray(q[key])&&q[key].length===3,
        filename+': '+q.id+' needs three '+key+' clues');
      for(const entry of q[key])assert.ok(typeof entry==='string'&&entry.trim()&&entry.length<2000,
        filename+': empty/malformed '+key+' of '+q.id);
    }
  }
  // Each quiz mode must be able to draw unique questions from its difficulty pool.
  assert.ok(counts.easy>=10&&counts.medium>=10&&counts.hard>=10,
    filename+': not enough questions for difficulty-only or mixed modes');
  for(const selector of ['startClassic','startMystery','startDaily','startEasy','startMedium','startHard'])
    assert.ok(html.includes('id="'+selector+'"'),filename+': missing game mode '+selector);
  assert.ok(html.includes('id="openChallengeHome"'),filename+': challenge launcher missing');
  assert.ok(html.includes('id="resume"'),filename+': unfinished-game resume missing');
  assert.ok(html.includes('id="langToggle"'),filename+': bilingual interface toggle missing');
  assert.ok(html.includes('id="claimDaily"'),filename+': daily XP reward missing');
  return counts;
}

const current=extractQuestions(gameFiles[0]);
const stable=extractQuestions(gameFiles[1]);
const currentCounts=validate(gameFiles[0],current.data,current.html);
validate(gameFiles[1],stable.data,stable.html);

// Preserve stable question IDs and content unless a future explicit content
// migration is reviewed. A divergent bank can break links/continued sessions.
assert.deepEqual(current.data,stable.data,
  'Beta and stable question sets differ; verify migration and old challenge links before publishing');

// A lost final life is a pending result, not an invalid game to discard.
const guard=current.html.match(/const pendingFinish = session\?\.lives===0 && session\?\.selected!==null;\s*const valid = [^;]+;/);
assert.ok(guard,'Beta must preserve an unanswered Finish action after the final lost life');
const vm=require('node:vm');
const eligible=session=>Boolean(vm.runInNewContext(guard[0]+' valid',{session,byId:{q001:{id:'q001'}}}));
assert.equal(eligible({ids:['q001'],idx:0,lives:0,selected:2}),true,
  'A finished round awaiting confirmation must remain resumable');
assert.equal(eligible({ids:['q001'],idx:0,lives:0,selected:null}),false,
  'An unfinished round with no lives left must not resume');
assert.equal(eligible({ids:['q001'],idx:0,lives:1,selected:null}),true,
  'A live round should still resume normally');
assert.equal(eligible({ids:['q999'],idx:0,lives:1,selected:1}),false,
  'A session referencing missing questions should be rejected');

// Syntax check game logic independently from rendering it or touching saves.
for(const file of gameFiles){
  const html=file===gameFiles[0]?current.html:stable.html;
  const from=html.indexOf('/* Guess the Game 2.3.');
  const end=html.indexOf('</script>',from);
  assert.ok(from>=0 && end>from,file+': quiz script not found');
  new Function(html.slice(from,end));
}


console.log('PASS: '+current.data.length+' questions; '+JSON.stringify(currentCounts)+
  '; 6 quiz selectors, friend challenges, bilingual clues, no duplicate IDs or answers, bank parity');
