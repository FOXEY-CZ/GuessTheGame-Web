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
const conflictSource=code.slice(end,code.indexOf('  function schedule(){',end));
const profileChangeSource=code.slice(code.indexOf('  function profileChanged(){'),
  code.indexOf('  function chooseForm(mode){'));
assert.ok(conflictSource.includes('beforeConflict.'),
  'Actual conflict resolution must make an owner-scoped backup before overwriting either side');
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
  'let applying=false,authChecking=false,syncRequestedWhileBusy=false;',
  'let scheduled=0,canStore=opts.canStore!==false;',
  'const backups=[];',
  'const accountKey=id=>"gtg.accountTest.v1.accountCache."+id;',
  'const store=(key,value)=>{if(!canStore)return false;backups.push({key,value:clone(value)});return true;};',
  'const schedule=()=>{scheduled+=1;};',
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
  syncSource,conflictSource,profileChangeSource,
  'return {syncNow,resolveConflict,',
  ' get profile(){return current;},get conflict(){return conflict;},',
  ' get feedback(){return feedback;},get state(){return state;},',
  ' get backups(){return backups;},get scheduled(){return scheduled;},',
  ' mutate(value){current=clone(value);profileChanged();},',
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
  // A conflict must preserve both candidate saves before accepting a choice.
  await loser.resolveConflict('cloud'); // first click only arms it
  assert.equal(loser.backups.length,0,'No backups/overwrites before confirmation');
  await loser.resolveConflict('cloud'); // second click resolves
  assert.equal(loser.backups.length,1,'Resolution creates one local backup');
  const evidence=loser.backups[0];
  assert.equal(evidence.value.revision,2);
  assert.equal(evidence.value.userId,'test-user');
  assert.ok(evidence.key.includes('beforeConflict.2.'));
  assert.ok(evidence.value.local.xp!==evidence.value.cloud.xp,
    'Both conflicting save versions must be backed up independently');
  assert.deepEqual(loser.profile,shared.row.profile,
    'Cloud choice changes active save only after both versions were preserved');

  // If browser storage is unavailable, conflict resolution must fail closed.
  const unbacked=factory({
    db:shared,base,local:{...base,xp:155},canStore:false
  },clone);
  await unbacked.syncNow(); // divergent: cloud changed and local changed
  assert.ok(unbacked.conflict,'Storage-full device must detect cloud conflict');
  await unbacked.resolveConflict('cloud');
  await unbacked.resolveConflict('cloud');
  assert.equal(unbacked.profile.xp,155,
    'A failed backup must not replace local progress');
  assert.ok(unbacked.feedback.includes('Zálohu nelze uložit'),
    'A backup failure should be explained to the player');
  assert.equal(unbacked.backups.length,0);

  // Explicitly choosing the local save must also keep a copy of cloud.
  const localDB={
    row:{profile:{...base,xp:200},revision:2},
    writes:[],read:shared.read,write:shared.write
  };
  const keepLocal=factory({db:localDB,base,local:{...base,xp:215}},clone);
  await keepLocal.syncNow();
  assert.ok(keepLocal.conflict,'Divergent cloud and local data requires choice');
  await keepLocal.resolveConflict('local');
  await keepLocal.resolveConflict('local');
  assert.equal(localDB.row.revision,3,'Local choice uses CAS on current cloud revision');
  assert.equal(localDB.row.profile.xp,215,'Local choice writes only the chosen save');
  assert.equal(keepLocal.backups.length,1,'Local choice must back up cloud too');
  assert.equal(keepLocal.backups[0].value.cloud.xp,200);
  assert.equal(keepLocal.backups[0].value.local.xp,215);
  assert.equal(keepLocal.conflict,null);

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
  // A save edit made while the previous revision is being written must
  // automatically trigger another sync, rather than wait for a minute tick.
  let completeWrite;
  const network={
    row:{profile:clone(base),revision:1},
    read(){return Promise.resolve(clone(this.row));},
    write(patch){
      return new Promise(resolve=>{
        completeWrite=()=>{
          this.row={profile:clone(patch.profile),revision:patch.revision};
          resolve({data:{revision:patch.revision},error:null});
        };
      });
    }
  };
  const editing=factory({
    db:network,base,local:{...base,xp:200},canStore:true
  },clone);
  const sync=editing.syncNow();
  for(let i=0;i<8&&!completeWrite;i++)await Promise.resolve();
  assert.equal(typeof completeWrite,'function','Network write must reach pending state');
  editing.mutate({...base,xp:220});
  assert.equal(editing.scheduled,0,'Busy edits should not start a second write yet');
  completeWrite();
  await sync;
  assert.equal(editing.scheduled,1,
    'After confirming the earlier revision, in-flight edits must schedule another sync');

  console.log('PASS: revision CAS, conflict backups, storage fail-closed, in-flight edits, latest cloud, safe merge');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
