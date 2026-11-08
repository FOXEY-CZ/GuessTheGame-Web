'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('arcade/index.html','utf8');
const app=fs.readFileSync('arcade/app.js','utf8');
const css=fs.readFileSync('arcade/styles.css','utf8');
assert.ok(html.includes('id="gameExitFullscreen"'),'fullscreen must have visible exit');
assert.ok(html.includes('allow="fullscreen"'),'secure game iframe must allow fullscreen');
assert.ok(css.includes('body.arcade-game-immersive #page-play'),'iOS/mobile immersive fallback missing');
assert.ok(css.includes('#page-play:fullscreen'),'native fullscreen layout missing');
assert.ok(app.includes("if(page==='play')enterGameFullscreen()"),
 'launch navigation must open full viewport immediately');
const start=app.indexOf('  let arcadeImmersive='),end=app.indexOf('  function go(page){',start);
assert.ok(start>0&&end>start,'isolated fullscreen controller missing');
const source=app.slice(start,end);
function environment(supported,shouldReject=false){
 const classes=new Set();
 const listeners={};
 const exitBtn={textContent:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;}};
 const page=supported?{
  requestFullscreen(){
   if(shouldReject)return Promise.reject(Error('browser restriction'));
   document.fullscreenElement=page;return Promise.resolve();
  }
 }:{};
 const document={
  fullscreenElement:null,
  body:{classList:{toggle(n,yes){if(yes)classes.add(n);else classes.delete(n)}}},
  addEventListener(n,fn){listeners[n]=fn},
  exitFullscreen(){document.fullscreenElement=null;return Promise.resolve();}
 };
 const elements={'page-play':page,gameExitFullscreen:exitBtn};
 const window={FOXEY_I18N:{getLocale:()=> 'cs'}};
 const obj=vm.runInNewContext('(()=>{const el=__get;'+source+
    'return {enterGameFullscreen,leaveGameFullscreen,active:()=>arcadeImmersive};})()',
    {__get:k=>elements[k],document,window,Promise});
 return {obj,page,document,classes,listeners,exitBtn};
}
(async()=>{
 const fallback=environment(false);
 fallback.obj.enterGameFullscreen();
 assert.equal(fallback.obj.active(),true);
 assert.ok(fallback.classes.has('arcade-game-immersive'));
 assert.ok(fallback.exitBtn.textContent.includes('Režim okna'));
 fallback.obj.leaveGameFullscreen();
 assert.equal(fallback.obj.active(),false);
 assert.ok(!fallback.classes.has('arcade-game-immersive'));
 const native=environment(true);
 native.obj.enterGameFullscreen();
 await Promise.resolve();await Promise.resolve();
 assert.equal(native.document.fullscreenElement,native.page);
 native.document.fullscreenElement=null;
 native.listeners.fullscreenchange();
 assert.equal(native.obj.active(),false,'Esc exits native and CSS fullscreen');
 const refused=environment(true,true);
 refused.obj.enterGameFullscreen();
 await Promise.resolve();await Promise.resolve();
 assert.equal(refused.obj.active(),true,'rejected native fullscreen must retain CSS fallback');
 refused.obj.leaveGameFullscreen();
 console.log('PASS: native and iOS fullscreen, visible exit, Esc restoration, iframe preservation.');
})().catch(err=>{console.error(err);process.exitCode=1});