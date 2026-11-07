'use strict';
// Persistent return-to-platform navigation regression for Secure Quiz Beta.
// Run in repository root: node tests/secure-quiz-platform-navigation-client.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','secure-quiz-beta.html'),'utf8');
const link=html.match(/<a id="backToPlatform"[^>]+>/)?.[0];
assert.ok(link,'Top navigation must include explicit platform return');
assert.ok(link.includes('href="./arcade/"'),'Must navigate to FOXEY Arcade home, not a legacy quiz');
assert.ok(link.includes('class="platform-return"'),'Must have accessible button-like styling');
assert.ok(html.includes('class="header-actions"'));
assert.ok(html.includes('.platform-return{'));
assert.ok(html.includes('.platform-return{order:3;flex:1 0 100%'),
  'Mobile header must expose an easy-to-tap full-width return control');
const js=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
 .map(m=>m[1]).filter(Boolean).at(-1);
assert.ok(js.includes("$('backToPlatform').addEventListener('click',confirmPlatformReturn)"));
assert.ok(js.includes("$('brandLink').addEventListener('click',confirmPlatformReturn)"));
for(const title of [
 "platformBack:'← Zpět do Arcade'",
 "platformBack:'← Back to Arcade'",
 "platformLeaveConfirm:", "platformPendingConfirm:", "platformWait:"
])assert.ok(js.includes(title),'Missing Czech/English UI translation: '+title);
const matched=js.match(/  function confirmPlatformReturn\(event\)\{[\s\S]*?\n  \}/);
assert.ok(matched,'Missing active-game exit guard');
function scenario({game,busy=false,pending=null,answer=true}){
 const ui=[],texts={
   platformWait:'Wait for the server',
   platformPendingConfirm:'Pending answer confirmation',
   platformLeaveConfirm:'You can continue later'
 };
 let prevented=false,dialogCount=0;
 const handler=new Function('game','busy','pending','status','T','window',
   'return ('+matched[0].trim()+');')(
     game,busy,pending,(msg,type)=>ui.push({msg,type}),key=>texts[key],
     {confirm:message=>{dialogCount++;ui.push({message});return answer;}});
 handler({preventDefault(){prevented=true;}});
 return {prevented,dialogCount,ui};
}
let res=scenario({game:null});
assert.equal(res.prevented,false);
assert.equal(res.dialogCount,0,'Menu navigation must not need a confirmation');
res=scenario({game:{resultShown:true}});
assert.equal(res.prevented,false);
assert.equal(res.dialogCount,0,'Results-screen exit must navigate directly');
res=scenario({game:{resultShown:false},answer:false});
assert.equal(res.prevented,true,'Cancel must keep the active quiz open');
assert.equal(res.dialogCount,1);
assert.equal(res.ui[0].message,'You can continue later');
res=scenario({game:{resultShown:false},answer:true});
assert.equal(res.prevented,false,'Confirm must navigate back to Arcade');
res=scenario({game:{resultShown:false},busy:true,answer:true});
assert.equal(res.prevented,true,'Cannot abandon a server action in flight');
assert.equal(res.dialogCount,0);
assert.equal(res.ui[0].msg,'Wait for the server');
res=scenario({game:{resultShown:false},pending:{type:'answer'},answer:false});
assert.equal(res.prevented,true);
assert.equal(res.ui[0].message,'Pending answer confirmation');
new Function(js);
console.log('PASS: visible mobile/desktop Arcade return, CZ/EN, active-run confirmation, safe in-flight requests');
