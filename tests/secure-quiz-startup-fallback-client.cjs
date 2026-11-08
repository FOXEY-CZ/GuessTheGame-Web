'use strict';
// Regression for blank mobile screen: a broken optional history component
// or absent CDN must NEVER hide every interactive panel.
// Run: node tests/secure-quiz-startup-fallback-client.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','secure-quiz-beta.html'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
assert.ok(ids.includes('bootPanel'));
assert.ok(ids.includes('signIn'));
assert.ok(ids.includes('modePanel'));
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(Boolean).at(-1);
assert.ok(code.includes("visible('bootPanel',false)"));
assert.ok(code.includes('if(me){\n      try{renderHistory();}'));
class E{
  constructor(id){
    this.id=id;this.textContent='';this.className='';this.disabled=false;
    this.value='';this.dataset={};this.children=[];this.listeners={};this.hidden=false;
    this.classList={
      toggle:(name,turn)=>{if(name==='hidden')this.hidden=!!turn;},
      add:name=>{if(name==='hidden')this.hidden=true;},
      remove:name=>{if(name==='hidden')this.hidden=false;},
      contains:name=>name==='hidden'?this.hidden:false
    };
  }
  addEventListener(event,cb){this.listeners[event]=cb}
  setAttribute(){}
  querySelectorAll(){return []}
  querySelector(name){return this[name]||(this[name]=new E(name))}
  replaceChildren(...kids){this.children=kids}
  append(...kids){this.children.push(...kids)}
  scrollIntoView(){}
}
async function scenario(kind){
 const elements=new Map(ids.map(id=>[id,new E(id)]));
 const $=id=>elements.get(id);
 $('signIn').hidden=true;$('modePanel').hidden=true;$('gamePanel').hidden=true;
 $('resultPanel').hidden=true;$('historyBell').hidden=true;
 if(kind==='history_failure'){
   $('historyList').replaceChildren=()=>{throw Error('simulated unsupported history renderer')};
 }
 const doc={documentElement:{lang:'cs'},title:'FOXEY Arcade · Secure Quiz Beta',
   visibilityState:'visible',getElementById:$,createElement:name=>new E(name)};
 const user={id:'33333333-3333-4333-8333-333333333333'};
 const client={auth:{getSession:async()=>({data:{session:{user}},error:null})},
   rpc:async(name)=>name==='arcade_async_challenge_inbox'?
    {data:{ok:true,items:[],unread:0},error:null}:
    {data:null,error:{message:'unexpected RPC'}}};
 const window={
   GTGAuthConfig:{url:'https://example.invalid',publishableKey:'mock',storageKey:'mock'},
   supabase:kind==='no_sdk'?undefined:{createClient:()=>client},
   location:{href:'https://example.invalid/secure-quiz-beta.html'},
   addEventListener(){},setInterval(){}};
 const localStorage={getItem:()=>null,setItem(){}};
 const navigator={onLine:true};
 const warnings=[];
 const js=new Function('window','document','navigator','localStorage','console','URL',code);
 js(window,doc,navigator,localStorage,
   {warn:(...args)=>warnings.push(args.join(' ')),log(){},error(){}},URL);
 for(let i=0;i<18;i++)await Promise.resolve();
 if(kind==='no_sdk'){
   assert.equal($('bootPanel').hidden,false,'bootstrap failure must remain visible');
   assert.equal($('signIn').hidden,false,'the sign-in fallback must remain visible');
   assert.ok($('status').textContent.includes('Nepodařilo'));
   assert.ok($('bootText').textContent.includes('Spuštění se nezdařilo'));
 }else{
   assert.equal($('bootPanel').hidden,true,'loading panel must hide after auth');
   assert.equal($('modePanel').hidden,false,'menu must show even when history UI crashes');
   assert.equal($('signIn').hidden,true,'signed-in user not forced to log in again');
   assert.ok($('status').textContent.includes('Připojeno'));
   assert.ok(warnings.some(w=>w.includes('history UI is unavailable')),
     'history warning should be logged separately');
 }
}
async function main(){
 await scenario('history_failure');
 await scenario('no_sdk');
 console.log('PASS: signed-in mode survives history UI crash; missing SDK shows useful login fallback');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
