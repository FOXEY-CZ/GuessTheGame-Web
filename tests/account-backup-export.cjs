'use strict';
/* Browserless safety test for read-only JSON save export.
 * Uses the REAL exportProgressBackup() source with fake browser downloads.
 */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'..','account-test.js'),'utf8');
const from=source.indexOf('  function exportProgressBackup(){');
const to=source.indexOf('  function captureGuest(){',from);
assert.ok(from>=0&&to>from,'Expected read-only export function');
const realExport=source.slice(from,to);
assert.ok(!realExport.includes("client.from("),'Save export must never mutate a cloud table');
assert.ok(!realExport.includes("client.rpc("),'Save export must never issue wallet RPC');
assert.ok(!realExport.includes("client.auth."),'Save export must not export auth sessions');
const factory=Function('opts',[
  'const downloads=[],created=[],revoked=[];',
  'let user=opts.user??null,conflict=opts.conflict??null;',
  'let state=opts.state??null;',
  'const game={getProfile:()=>opts.profile};',
  'const isProfile=v=>!!v&&typeof v==="object"&&Number.isSafeInteger(v.xp)&&v.xp>=0;',
  'const clone=v=>JSON.parse(JSON.stringify(v));',
  'const msg=(cs,en)=>cs;',
  'const status={textContent:""};',
  'const el=()=>status;',
  'const document={body:{appendChild(){}},createElement:()=>({',
  ' href:"",download:"",click(){downloads.push({href:this.href,name:this.download})},remove(){}',
  '})};',
  'class Blob{constructor(chunks,options){this.contents=chunks.join("");this.type=options.type;}}',
  'const URL={createObjectURL(blob){created.push(blob);return "blob:fake-gtg-save";},',
  ' revokeObjectURL(uri){revoked.push(uri)}};',
  'const setTimeout=fn=>fn();',
  realExport,
  'return {exportProgressBackup,downloads,created,revoked,status};'
].join('\n'));
function main(){
  const current={xp:140,played:3,bestScore:50,totalCorrect:12,bestStreak:3,
    crowns:50,shards:59,access_token:'DO_NOT_EXPORT',nested:{apiKey:'DO_NOT_EXPORT'}};
  const original=JSON.stringify(current);
  const exportOne=factory({
    user:{id:'private-uid'},profile:current,
    state:{revision:7,lastSyncedAt:'2026-11-07T15:00:00.000Z'}
  });
  exportOne.exportProgressBackup();
  assert.equal(exportOne.downloads.length,1,'Export should start one local download');
  assert.equal(exportOne.created[0].type,'application/json');
  assert.ok(exportOne.downloads[0].name.startsWith('foxey-gtg-save-'));
  assert.equal(exportOne.revoked.length,1,'Temporary blob URL must be released');
  const payload=JSON.parse(exportOne.created[0].contents);
  assert.equal(payload.format,'foxey-arcade-gtg-save-backup');
  assert.equal(payload.cloudRevision,7);
  assert.equal(payload.profile.crowns,50,'Backup must not alter game currency');
  assert.equal(payload.profile.shards,59);
  assert.equal(payload.profile.access_token,undefined,'Remove credential-like fields');
  assert.equal(payload.profile.nested.apiKey,undefined,'Remove nested credentials');
  assert.equal(payload.userId,undefined,'Do not dump auth user identity');
  assert.equal(JSON.stringify(current),original,'Export must not mutate the active save');

  const conflicting=factory({
    user:{id:'private-uid'},profile:current,
    state:{revision:6},
    conflict:{revision:8,profile:{...current,xp:180,refreshToken:'SECRET'}}
  });
  conflicting.exportProgressBackup();
  const both=JSON.parse(conflicting.created[0].contents);
  assert.equal(both.profile.xp,140);
  assert.equal(both.conflictingCloud.profile.xp,180,
    'An unresolved conflict must export BOTH saves');
  assert.equal(both.conflictingCloud.profile.refreshToken,undefined);

  const guest=factory({user:null,profile:current});
  guest.exportProgressBackup();
  assert.equal(guest.downloads.length,0,'No account backup under guest identity');

  const invalid=factory({user:{id:'private-uid'},profile:{xp:-10}});
  invalid.exportProgressBackup();
  assert.equal(invalid.downloads.length,0,'Reject invalid or damaged saves');
  assert.ok(invalid.status.textContent.includes('nepodařilo'));

  console.log('PASS: read-only local save export, 2-sided conflict, token redaction, invalid profile');
}
main();
