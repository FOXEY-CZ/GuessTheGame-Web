'use strict';
/* Pure cloud sync simulations: uses the real syncNow() function extracted
 * from account-test.js and mocked in-memory PostgREST revision CAS.
 * NEVER reaches a live account or wallet. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const code=fs.readFileSync(path.join(root,'account-test.js'),'utf8');
const mergeCode=fs.readFileSync(path.join(root,'account-merge.js'),'utf8');
const from=code.indexOf('  async function syncNow(preloaded){');
const end=code.indexOf('  async function resolveConflict(mode){',from);
assert.ok(from>=0&&end>from,'Expected existing optimistic-sync function');
const syncSource=code.slice(from,end);
assert.ok(syncSource.includes(".eq('user_id',identity).eq('revision',remote.revision)"),
  'Cloud save writes must be conditional on their current revision');
assert.ok(syncSource.includes('conflict=remote;'),
  'Concurrent modifications must be surfaced as a conflict');
const clone=v=>JSON.parse(JSON.stringify(v));
const base={xp:100,played:2,bestScore:35,totalCorrect:10,bestStreak:3,
  shards:12,crowns:4,dailyClaimed:'2026-11-06',dailyPaidDay:'2026-11-06',
  perfectPaidDay:'2026-11-06',badgeState:{first:true},
  cosmetics:{themes:['classic'],avatars:['alien']}};
const shared={
  row:{profile:clone(base),revision:1},
  writes:[],
  read(){return Promise.resolve(clone(this.row));},
  write(patch,where){
    if(where.user_id!=='test-user'||this.row.revision!==where.revision)
      return Promise.resolve({data:null,error:null});
    this.row=clone({...this.row,...patch});
    this.writes.push(clone(this.row));
    return Promise.resolve({data:{revision:this.row.revision},error:null});
  }
};
const factory=Function('opts','clone',[
  'let user={id:"test-user"};',
  'let state={revision:1,base:JSON.stringify(opts.base),lastSyncedAt:null};',
  'let busy=false,firstChoice=false,conflict=null,deletionInProgress=false;',
  'let conflictArmed="",feedback="";',
  'let current=clone(opts.local);',
  'const navigator={onLine:true};',
  'const serial=JSON.stringify;',
  'const isProfile=v=>v&&Number.isSafeInteger(v.xp)&&v.xp>=0;',
  'const game={getProfile:()=>clone(current),canApply:()=>true};',
  'const cacheAccount=()=>{},render=()=>{},notifyArcadeCloudSync=()=>{};',
  'const setFeedback=(cz)=>{feedback=cz;};',
  'const readRemote=()=>opts.db.read();',
  'const acceptRemote=row=>{current=clone(row.profile);',
  '  state={revision:row.revision,base:serial(row.profile)};conflict=null;};',
  'const client={from:table=>{if(table!=="gtg36_account_progress")throw Error(table);',
  '  return {update:patch=>{const where={};const query={',
  '    eq(key,val){where[key]=val;return query;},',
  '    select(){return query;},',
  '    maybeSingle(){return opts.db.write(patch,where);}',
  '  };return query;}};}};',
  syncSource,
  'return {syncNow,get profile(){return current;},get conflict(){return conflict;},',
  ' get feedback(){return feedback;},get state(){return state;},',
  ' switchUser(id){user={id};}};'
].join('\n'));
async function main(){
  // Two browsers independently edited an identical revision 1.
  const a=factory({db:shared,base,local:{...base,xp:120,shards:13}},clone);
  const b=factory({db:shared,base,local:{...base,xp:140,crowns:5}},clone);
  await Promise.all([a.syncNow(),b.syncNow()]);
  assert.equal(shared.writes.length,1,
    'Two concurrent writes must not overwrite one another');
  assert.equal(shared.row.revision,2,'Winning save increments cloud revision');
  const loser=[a,b].find(x=>x.state.revision===1);
  assert.ok(loser,'One browser must remain on its original revision');
  assert.ok(loser.profile.xp===120||loser.profile.xp===140,
    'Unsent local progress is preserved after CAS conflict');
  assert.ok(loser.feedback.includes('Synchronizace selhala'),
    'A stale CAS write must not claim successful sync');

  // A later sync with both sides changed must surface explicit conflict.
  await loser.syncNow();
  assert.ok(loser.conflict,'Divergent progress triggers conflict UI');
  assert.equal(loser.conflict.revision,2);
  assert.equal(shared.writes.length,1,'Conflict must not rewrite cloud data');

  // A clean second device simply adopts the newer cloud save.
  const clean=factory({db:shared,base,local:clone(base)},clone);
  await clean.syncNow();
  assert.equal(clean.state.revision,2,'No local edits -> refresh to newer revision');
  assert.deepEqual(clean.profile,shared.row.profile);

  // Conservative merge: never add wallet currency or pay perfect twice.
  const window={};
  new Function('window',mergeCode)(window);
  const merged=window.GTGAccountMerge.merge(
    {...base,crowns:50,perfectPaidDay:'2026-11-07'},
    {...base,xp:110,crowns:4,perfectPaidDay:'2026-11-06',
      dailyClaimed:'2026-11-07'});
  assert.equal(merged.crowns,50,'Merge must not add money across devices');
  assert.equal(merged.perfectPaidDay,'2026-11-07',
    'The newer perfect payout day must survive a stale save merge');
  assert.equal(merged.dailyClaimed,'2026-11-07',
    'The newer daily claim must not reset on another device');
  console.log('PASS: revision CAS, stale writes, visible conflict, latest cloud, safe daily/currency merge');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
