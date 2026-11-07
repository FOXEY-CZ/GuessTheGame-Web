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

// Losing the third heart must immediately finalize the run and not allow Continue.
const guard=current.html.match(/const valid = session && Array\.isArray\(session\.ids\) && [^;]+;/);
assert.ok(guard,'Beta must have a resumable-session guard');
const vm=require('node:vm');
const eligible=session=>Boolean(vm.runInNewContext(guard[0]+' valid',{session,byId:{q001:{id:'q001'}}}));
assert.equal(eligible({ids:['q001'],idx:0,lives:0,selected:2}),false,
  'Lost run must not offer Continue');
assert.equal(eligible({ids:['q001'],idx:0,lives:1,selected:null}),true,
  'Live in-progress run should remain resumable');
assert.equal(eligible({ids:['q999'],idx:0,lives:1,selected:1}),false,
  'A session referencing missing questions should be rejected');
assert.ok(current.html.includes("if(session.lives===0){finish();return;}"),
  'Third wrong answer must immediately finalize the result');
assert.ok(current.html.includes("const s=session;session=null;saveSession();"),
  'Finalizing must clear the resumable session');

// Verify that premium crowns are deliberately rare and never given on replay.
const helperStart=current.html.indexOf('function premiumReward(');
const helperEnd=current.html.indexOf('\n  function finish(){',helperStart);
assert.ok(helperStart>=0&&helperEnd>helperStart,'Missing isolated premium reward calculator');
const premium=Function(current.html.slice(helperStart,helperEnd)+'\nreturn premiumReward;')();
assert.deepEqual(premium(true,false,1,2,0),{perfect:0,milestone:0,badges:0,total:0},
  'An ordinary quiz must not generate premium crowns');
assert.deepEqual(premium(true,true,1,2,0),{perfect:1,milestone:0,badges:0,total:1},
  'A perfect quiz may earn one crown');
assert.deepEqual(premium(true,false,9,10,0),{perfect:0,milestone:1,badges:0,total:1},
  'One crown at level 10');
assert.deepEqual(premium(true,false,19,20,2),{perfect:0,milestone:1,badges:2,total:3},
  'Level 20 and two new badges are milestone rewards');
assert.deepEqual(premium(false,true,9,10,3),{perfect:0,milestone:0,badges:0,total:0},
  'Daily/challenge replay may never generate premium crowns');
assert.ok(!current.html.includes('profile.crowns+=3;'),
  'Every normal level-up must not grant three crowns');
assert.ok(!current.html.includes('Math.floor(s.correct/4)'),
  'Regular correct answers must not mint premium currency');
const dictStart=current.html.indexOf('const translations = {')+'const translations = '.length;
const dictEnd=current.html.indexOf('\n  };',dictStart)+4;
const translations=Function('return ('+current.html.slice(dictStart,dictEnd)+')')();
const missingKeys=Object.keys(translations.cs).filter(key=>!Object.hasOwn(translations.en,key));
assert.deepEqual(missingKeys,[],'English translation is missing keys, including reward descriptions');

// Authenticated rounds must accept backend-selected questions before game().
assert.ok(current.html.includes('bridge.begin(mode,operation)'),
  'Game must await the server before choosing question IDs for signed-in users');
assert.ok(current.html.includes('serverIssued=candidate;ids=candidate.question_ids.slice();'),
  'Run must use the exact question IDs chosen by the server');
assert.ok(current.html.includes('verifyRunId:serverIssued?.run_id||null'),
  'Run must save backend-issued ID for reliable resumed completion');
assert.ok(current.html.includes('verifyUserId:serverIssued?.user_id||null'),
  'Run must pin the authenticated owner for cross-account safety');
assert.ok(current.html.includes("mode==='challenge'){startChallenge();return;}"),
  'Online friend challenges must remain independent of the verified quiz path');
// Shadow-only server receipt bridge must never touch the Arcade wallet.
const accountSource=fs.readFileSync(path.join(root,'account-test.js'),'utf8');
assert.ok(current.html.includes('id="serverVerificationStatus"'),
  'Server verification status must be available on the results screen');
assert.ok(current.html.includes("new CustomEvent('gtg-quiz-started'"),
  'Game should signal an independent audit run on start');
assert.ok(current.html.includes("new CustomEvent('gtg-quiz-finished'"),
  'Game should submit a separate audit trace on finish');
assert.ok(current.html.includes('verifyAnswers.push('),
  'Answer choices and hint usage must be recorded in the pending run');
assert.ok(current.html.includes('account-test.js?v=server-ids-qa-20261107'),
  'Versioned account bridge must avoid stale cached code');
const shadowStart=accountSource.indexOf('const shadowRuns=new Map()');
const shadowEnd=accountSource.indexOf('const setFeedback =',shadowStart);
assert.ok(shadowStart>0 && shadowEnd>shadowStart,'No standalone shadow bridge found');
const shadow=accountSource.slice(shadowStart,shadowEnd);
assert.ok(accountSource.includes('Server vybral otázky a ověřil výsledek'),
  'Show a separate success message only for fully server-selected quizzes');
assert.ok(accountSource.includes("client.rpc('arcade_verify_begin_server'"),
  'The signed-in bridge must call the new server-selection RPC');
assert.ok(accountSource.includes('window.GTGServerVerification=Object.freeze('),
  'Bridge must expose authenticated server-run capability');
assert.ok(shadow.includes("client.rpc('arcade_verify_begin'"),
  'Bridge must ask the server to issue a run receipt');
assert.ok(shadow.includes("client.rpc('arcade_verify_complete'"),
  'Bridge must complete the server receipt exactly once');
assert.ok(shadow.includes('data.credited!==false'),
  'Shadow response must explicitly declare that no new wallet credit happened');
for(const forbidden of ['arcade_buy_theme','arcade_open_cosmetic_chest',
                        'arcade_wallet_events','arcade_wallets'])
  assert.ok(!shadow.includes(forbidden),'Shadow bridge must never modify money: '+forbidden);
new Function(accountSource);

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
