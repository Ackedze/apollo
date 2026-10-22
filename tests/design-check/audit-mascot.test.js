const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),esbuild=require('esbuild');
const peerRequire=require('node:module').createRequire(require.resolve('react-dom/client'));
const {JSDOM}=require('jsdom'),app=path.resolve(__dirname,"../.."),delay=()=>new Promise(resolve=>setTimeout(resolve,40));
const bundle=esbuild.buildSync({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {AuditMascot} from './src/design-check/AuditMascot';import {AuditOverview} from './src/design-check/AuditOverview';export function mount(n,kind,props){const root=createRoot(n),render=p=>root.render(React.createElement(kind==='overview'?AuditOverview:AuditMascot,p));render(props);return{render,close:()=>root.unmount()};}`,resolveDir:app,loader:'jsx'},bundle:true,write:false,nodePaths:require.resolve.paths('react-dom/client')||[],alias:{react:path.dirname(peerRequire.resolve('react/package.json'))},platform:'browser',format:'iife',globalName:'MascotTest',define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text;
async function harness(kind,props,run){
 const dom=new JSDOM('<style>'+fs.readFileSync(path.join(app,"./src/design-check/new-shell.css"),'utf8')+'</style><div id="mount"></div>',{url:'https://apollo-ui.invalid/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;let mounted;
 const media=new w.EventTarget();media.matches=false;w.matchMedia=()=>media;
 try{w.eval(bundle+'\nwindow.MascotTest=MascotTest;');mounted=w.MascotTest.mount(w.document.querySelector('#mount'),kind,props);await delay();await run(w,mounted,media);}
 finally{mounted?.close();dom.window.close();}
}
test('mascot mood and accessible quality remain available after every result',async()=>{
 await harness('mascot',{checking:false},async(w,mounted)=>{
  const root=()=>w.document.querySelector('.apollo-mascot'),eyes=()=>root().querySelectorAll('.apollo-mascot-eyes span'),style=eye=>w.getComputedStyle(eye);
  assert.ok(root().classList.contains('quality-unchecked'));assert.match(root().getAttribute('aria-label'),/ещё не запускалась/);assert.equal(root().querySelector('svg'),null);assert.equal(style(eyes()[0]).height,'26px');
  mounted.render({checking:false,quality:'clean'});await delay();assert.ok(root().classList.contains('quality-clean'));assert.equal(style(eyes()[0]).height,'14px');assert.equal(style(eyes()[0]).backgroundColor,'rgba(0, 0, 0, 0)');assert.equal(root().querySelector('svg'),null);
  mounted.render({checking:false,quality:'warning'});await delay();assert.equal(style(eyes()[0]).height,'26px');assert.equal(style(eyes()[0]).clipPath,'');
  mounted.render({checking:false,quality:'violation'});await delay();assert.equal(style(eyes()[0]).height,'20px');assert.match(style(eyes()[0]).clipPath,/0 40%/);assert.match(style(eyes()[1]).clipPath,/100% 40%/);assert.notEqual(style(eyes()[0]).clipPath,style(eyes()[1]).clipPath);assert.equal(root().querySelector('svg'),null);assert.match(root().getAttribute('aria-label'),/Найдены нарушения/);
  mounted.render({checking:true,quality:'unchecked'});await delay();assert.ok(root().classList.contains('is-checking'));assert.match(root().getAttribute('aria-label'),/выполняется/);
 });
});
test('gaze follows the latest pointer once per frame and resets on leave or blur',async()=>{
 await harness('mascot',{checking:false},async w=>{
  const node=w.document.querySelector('.apollo-mascot-body');node.getBoundingClientRect=()=>({left:100,top:100,width:144,height:144});
  const move=(x,y)=>w.document.dispatchEvent(new w.MouseEvent('pointermove',{clientX:x,clientY:y}));
  move(2000,2000);move(0,172);await delay();assert.ok(parseFloat(node.style.getPropertyValue('--gaze-x'))<0);assert.equal(parseFloat(node.style.getPropertyValue('--gaze-y')),0);
  move(2000,2000);await delay();assert.ok(parseFloat(node.style.getPropertyValue('--gaze-x'))<=8);assert.ok(parseFloat(node.style.getPropertyValue('--gaze-y'))<=6);
  w.document.dispatchEvent(new w.Event('pointerleave'));assert.equal(node.style.getPropertyValue('--gaze-x'),'0px');
  move(2000,2000);w.dispatchEvent(new w.Event('blur'));await delay();assert.equal(node.style.getPropertyValue('--gaze-y'),'0px');
 });
});
test('reduced motion, hidden document or pane and unmount stop pending gaze updates',async()=>{
 await harness('mascot',{checking:false},async(w,mounted,media)=>{
  const node=w.document.querySelector('.apollo-mascot-body');node.getBoundingClientRect=()=>({left:0,top:0,width:144,height:144});
  const move=()=>w.document.dispatchEvent(new w.MouseEvent('pointermove',{clientX:300,clientY:300}));
  media.matches=true;media.dispatchEvent(new w.Event('change'));move();await delay();assert.equal(node.style.getPropertyValue('--gaze-x'),'0px');
  media.matches=false;move();await delay();assert.ok(parseFloat(node.style.getPropertyValue('--gaze-x'))>0);
  w.document.querySelector('#mount').hidden=true;w.dispatchEvent(new w.Event('blur'));move();await delay();assert.equal(node.style.getPropertyValue('--gaze-x'),'0px');w.document.querySelector('#mount').hidden=false;
  Object.defineProperty(w.document,'visibilityState',{configurable:true,value:'hidden'});w.document.dispatchEvent(new w.Event('visibilitychange'));await delay();move();await delay();assert.equal(node.style.getPropertyValue('--gaze-x'),'0px');assert.ok(w.document.querySelector('.apollo-mascot').classList.contains('is-paused'));
  Object.defineProperty(w.document,'visibilityState',{configurable:true,value:'visible'});w.document.dispatchEvent(new w.Event('visibilitychange'));await delay();move();
  mounted.close();move();await delay();assert.equal(node.style.getPropertyValue('--gaze-x'),'0px');
 });
});
test('checking cancels pending cursor frames, runs autonomously and restores tracking after completion',async()=>{
 await harness('mascot',{checking:false},async(w,mounted)=>{
  const root=w.document.querySelector('.apollo-mascot'),body=root.querySelector('.apollo-mascot-body'),gaze=root.querySelector('.apollo-mascot-gaze');
  body.getBoundingClientRect=()=>({left:100,top:100,width:144,height:144});
  const frames=new Map();let requested=0;w.requestAnimationFrame=fn=>{frames.set(++requested,fn);return requested;};w.cancelAnimationFrame=id=>frames.delete(id);
  const move=()=>w.document.dispatchEvent(new w.MouseEvent('pointermove',{clientX:400,clientY:172}));
  move();assert.equal(frames.size,1);
  mounted.render({checking:true});await delay();assert.equal(frames.size,0);assert.equal(body.style.getPropertyValue('--gaze-x'),'0px');
  const before=requested;move();move();await delay();assert.equal(requested,before,'CSS loop schedules no cursor/rAF or React frame updates');
  assert.equal(w.getComputedStyle(body).animationName,'apollo-mascot-breathe');assert.equal(w.getComputedStyle(gaze).animationName,'apollo-mascot-inspect');
  assert.equal(w.getComputedStyle(root.querySelector('.apollo-mascot-eyes span')).animationName,'apollo-mascot-check-blink');
  w.document.querySelector('#mount').hidden=true;assert.equal(w.getComputedStyle(body).animationPlayState,'paused');assert.equal(w.getComputedStyle(gaze).animationPlayState,'paused');
  w.document.querySelector('#mount').hidden=false;
  Object.defineProperty(w.document,'visibilityState',{configurable:true,value:'hidden'});w.document.dispatchEvent(new w.Event('visibilitychange'));await delay();
  assert.equal(w.getComputedStyle(body).animationPlayState,'paused');assert.equal(root.classList.contains('is-paused'),true);
  Object.defineProperty(w.document,'visibilityState',{configurable:true,value:'visible'});w.document.dispatchEvent(new w.Event('visibilitychange'));await delay();
  assert.equal(root.classList.contains('is-paused'),false);move();assert.equal(requested,before);
  mounted.render({checking:false,quality:'clean'});await delay();assert.equal(root.classList.contains('is-checking'),false);assert.ok(['','none'].includes(w.getComputedStyle(body).animationName));
  move();assert.equal(frames.size,1);for(const [id,fn] of frames){frames.delete(id);fn(0);}assert.ok(parseFloat(body.style.getPropertyValue('--gaze-x'))>0);
  move();assert.equal(frames.size,1);mounted.close();assert.equal(frames.size,0);assert.equal(body.style.getPropertyValue('--gaze-x'),'0px');
  const closed=requested;move();assert.equal(requested,closed);
 });
});
test('busy loops use only transform with matching endpoints, scoped layer promotion and reduced-motion override',async()=>{
 await harness('mascot',{checking:true},async w=>{
  const rules=Array.from(w.document.styleSheets[0].cssRules),names=['apollo-mascot-breathe','apollo-mascot-inspect','apollo-mascot-check-blink'];
  for(const name of names){
   const loop=rules.find(r=>r.name===name);assert.ok(loop,name);
   for(const frame of Array.from(loop.cssRules))assert.deepEqual(Array.from(frame.style),['transform'],'no layout, paint or custom-property animation');
   const endpoints=key=>Array.from(loop.cssRules).find(r=>r.keyText.split(',').some(s=>s.trim()===key)).style.getPropertyValue('transform');
   assert.equal(endpoints('0%'),endpoints('100%'),'seamless loop endpoints');
  }
  const body=w.document.querySelector('.apollo-mascot-body'),gaze=w.document.querySelector('.apollo-mascot-gaze');
  for(const node of [body,gaze]){const s=w.getComputedStyle(node);assert.equal(s.animationDuration,'5.6s');assert.equal(s.animationIterationCount,'infinite');}
  const promotion=rules.find(r=>r.conditionText?.replace(/\s/g,'')==='(prefers-reduced-motion:no-preference)');assert.ok(promotion);
  for(const rule of Array.from(promotion.cssRules)){assert.ok(rule.selectorText.split(',').every(s=>s.includes('.is-checking')));assert.equal(rule.style.getPropertyValue('will-change'),'transform');}
  const reduced=rules.filter(r=>r.conditionText?.replace(/\s/g,'')==='(prefers-reduced-motion:reduce)');
  const stop=reduced.flatMap(r=>Array.from(r.cssRules)).find(r=>r.selectorText==='.apollo-mascot *');assert.ok(stop);assert.equal(stop.style.getPropertyValue('animation'),'none');assert.equal(stop.style.getPropertyPriority('animation'),'important');
  assert.equal(w.getComputedStyle(body).borderRadius,'50%');assert.equal(w.getComputedStyle(body).boxShadow,'none');
 });
});
test('overview retains mascot and actual total in its accessible description after completion',async()=>{
 const summary={groups:[],theme:null,total:0,stale:false,incomplete:false};
 await harness('overview',{state:{auditProgress:''},summary,busy:false,checkedScope:'Область А',themeCanApply:false,onOpen:()=>{},onTheme:()=>{}},async w=>{
  assert.ok(w.document.querySelector('.apollo-mascot.quality-clean'));assert.match(w.document.querySelector('.apollo-mascot').getAttribute('aria-label'),/замечаний: 0/);assert.equal(w.document.querySelector('.apollo-overview-number'),null);assert.equal(w.document.querySelector('.apollo-overview-caption').textContent,'Область А');
 });
});
