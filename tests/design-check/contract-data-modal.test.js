const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),esbuild=require('esbuild'),{JSDOM}=require('jsdom');
const app=path.resolve(__dirname,"../..");
const outputs=esbuild.buildSync({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {TopSection} from './src/design-check/v3/ui-app/components/TopSection';export function mount(node,read,props={}){const root=createRoot(node);const render=props=>flushSync(()=>root.render(<TopSection controlAvailability={{captureExample:true}} title="Apollo" pageTypeId={null} channelId="b2b" pickerLabel="Desktop" actionLabel="Проверить" actionDisabled={false} actionLoading={false} actionType="primary" compact={false} shellAuditEnabled={false} showExpectedCustomizations={false} hideCustomizations={false} experimentalContractV2Enabled={false} onActionPress={()=>{}} onToggleCompact={()=>{}} {...props} readContractData={read}/>));render(props);const close=()=>flushSync(()=>root.unmount());close.update=render;return close;}`,resolveDir:app,loader:'jsx'},bundle:true,write:false,outfile:path.join(app,"./tests/modal.bundle.js"),loader:{'.module.css':'local-css'},platform:'browser',format:'iife',globalName:'ModalTest',define:{'process.env.NODE_ENV':'"production"'}}).outputFiles;
const bundle=outputs.find(f=>f.path.endsWith('.js')).text,css=outputs.find(f=>f.path.endsWith('.css')).text;
const tick=()=>new Promise(resolve=>setTimeout(resolve,20)),state=status=>({status,reason:'Synthetic source'});
function data(){return{schemaVersion:'apollo.contract-data.v1',rows:[{componentId:'example',contractId:'example',name:'LongComponentNameForCurrentData',library:'Synthetic library',platform:'desktop',revision:3,manualSourceHash:'a'.repeat(64),updatedAt:'2026-10-15',checking:state('connected'),figma:state('dependency'),frontend:state('not-connected')}],sources:{checking:state('connected'),figma:state('connected'),frontend:state('unavailable')}};}
test('settings action opens actual modal: loading/table, refresh failure/retry, cancel and focus restore',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;let close;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;this.querySelector('button')?.focus();};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const style=d.createElement('style');style.textContent=fs.readFileSync(path.join(app,"./src/design-check/finding-card.css"),'utf8');d.head.append(style);
 let resolve,mode='pending',calls=0;const read=()=>{calls++;return mode==='pending'?new Promise(r=>resolve=r):mode==='error'?Promise.reject(Error('offline')):Promise.resolve(mode==='empty'?Object.assign(data(),{rows:[]}):data());};
 try{
  w.eval(bundle+'\nwindow.ModalTest=ModalTest;');close=w.ModalTest.mount(d.querySelector('#root'),read);
  const settings=()=>d.querySelector('[aria-label="Открыть настройки Apollo"]');settings().click();await tick();
  const view=Array.from(d.querySelectorAll('button')).find(b=>b.textContent==='Посмотреть данные');assert.ok(view);assert.equal(view.getAttribute('aria-haspopup'),'dialog');view.click();await tick();
  let dialog=d.querySelector('dialog');assert.equal(dialog.open,true);assert.equal(dialog.parentElement,d.body);assert.match(dialog.textContent,/Читаем подключённые данные/);assert.equal(calls,1);
  resolve(data());await tick();assert.equal(dialog.querySelectorAll('thead th').length,5);assert.equal(dialog.querySelectorAll('tbody tr').length,1);assert.match(dialog.textContent,/LongComponentNameForCurrentData.*Desktop · r3/s);assert.match(dialog.textContent,/15.10.2026/);assert.match(dialog.textContent,/В составе/);assert.equal(dialog.querySelector('[role="region"]').tabIndex,0);
  assert.equal(w.getComputedStyle(dialog.querySelector('table')).minWidth,'680px');assert.equal(w.getComputedStyle(dialog.querySelector('th')).width,'30%');
  const table=dialog.querySelector('table'),region=dialog.querySelector('[role="region"]');region.scrollTop=120;
  mode='pending';dialog.querySelector('.apollo-data-actions button').click();await tick();
  assert.equal(dialog.querySelector('table'),table,'refresh retains the rendered table');assert.equal(region.scrollTop,120);assert.equal(region.getAttribute('aria-busy'),'true');assert.match(dialog.textContent,/Обновляем список/);assert.equal(dialog.querySelector('.apollo-data-actions button').disabled,true);
  resolve(data());await tick();assert.match(dialog.textContent,/Данные получены. Изменений нет/);assert.equal(region.getAttribute('aria-busy'),'false');
  mode='error';dialog.querySelector('.apollo-data-actions button').click();await tick();assert.match(dialog.querySelector('[role="alert"]').textContent,/Не удалось прочитать.*Показаны последние полученные данные/);assert.equal(dialog.querySelector('table'),table);
  mode='ok';dialog.querySelector('.apollo-data-actions button').click();await tick();assert.ok(dialog.querySelector('table'));assert.equal(calls,4);
  dialog.dispatchEvent(new w.Event('cancel',{cancelable:true}));await tick();assert.equal(d.querySelector('dialog'),null);assert.equal(d.activeElement,settings());
  settings().click();await tick();Array.from(d.querySelectorAll('button')).find(b=>b.textContent==='Посмотреть данные').click();await tick();assert.equal(calls,5);mode='empty';d.querySelector('.apollo-data-actions button').click();await tick();assert.equal(d.querySelector('dialog table'),null);assert.match(d.querySelector('dialog').textContent,/Доступные контракты не получены/);assert.match(d.querySelector('dialog').textContent,/Список обновлён/);d.querySelector('[aria-label="Закрыть данные Apollo"]').click();await tick();assert.equal(d.activeElement,settings());
 }finally{close?.();w.close();}
});

async function pickerHarness({width=800,height=860,top=180,right=760}={},run){
 const dom=new JSDOM('<div class="design-check-shell apollo-new"><div id="root"></div></div><button id="outside">Снаружи</button>',{url:'https://apollo-ui.invalid/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
 Object.defineProperty(w,'innerWidth',{value:width});Object.defineProperty(w,'innerHeight',{value:height});
 const style=d.createElement('style');style.textContent=css+fs.readFileSync(path.join(app,'src/design-check/integration.css'),'utf8')+fs.readFileSync(path.join(app,'src/design-check/new-shell.css'),'utf8');d.head.append(style);
 const rect=w.HTMLElement.prototype.getBoundingClientRect;
 w.HTMLElement.prototype.getBoundingClientRect=function(){
  if(this.getAttribute('role')==='group'&&['Платформа','Канал'].includes(this.getAttribute('aria-label')))return{x:0,y:0,left:0,top:0,right:195,bottom:288,width:195,height:288};
  if(this.tagName==='BUTTON'&&this.getAttribute('aria-expanded')!==null)return{x:right-120,y:top,left:right-120,top,right,bottom:top+40,width:120,height:40};
  return rect.call(this);
 };
 const calls={platform:[],channel:[]},props={controlAvailability:{channelId:true,pickerLabel:true,captureExample:true,shellAuditEnabled:true},onPickerChange:value=>calls.platform.push(value),onChannelChange:value=>calls.channel.push(value)};
 w.eval(bundle+'\nwindow.ModalTest=ModalTest;');const close=w.ModalTest.mount(d.querySelector('#root'),undefined,props);
 const button=label=>{const b=Array.from(d.querySelectorAll('button')).find(n=>(n.getAttribute('aria-label')||n.textContent)===label);assert.ok(b,'button '+label);return b;};
 try{await run({w,d,calls,props,button,update:patch=>close.update({...props,...patch}),async click(label){button(label).click();await tick();}});}finally{close();w.close();}
}
test('settings menus leave the scroll panel, keep all choices and restore anchor focus',async()=>{
 await pickerHarness({},async h=>{
  const {d,w}=h;await h.click('Открыть настройки Apollo');const panel=d.querySelector('#apollo-settings');panel.scrollTop=20;
  await h.click('Desktop');let menu=d.querySelector('[role="group"][aria-label="Платформа"]');assert.ok(menu);assert.equal(menu.parentElement,d.body);assert.equal(panel.contains(menu),false);assert.equal(w.getComputedStyle(menu).position,'fixed');
  assert.equal(menu.style.left,'565px');assert.equal(menu.style.top,'224px');assert.equal(menu.style.maxHeight,'628px');
  const list=menu.firstElementChild;assert.equal(w.getComputedStyle(list).overflowY,'auto');assert.equal(w.getComputedStyle(list).overscrollBehavior,'contain');assert.equal(panel.scrollTop,20);
  assert.deepEqual(Array.from(menu.querySelectorAll('button')).map(b=>b.textContent),['Desktop','MobileWeb','iOS','Android']);assert.equal(d.activeElement.textContent,'Desktop');
  h.button('Android').dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true}));await tick();assert.equal(d.querySelector('#apollo-settings'),panel,'portal pointer stays inside the settings interaction');
  await h.click('Android');assert.deepEqual(h.calls.platform,['Android']);assert.equal(d.querySelector('[role="group"]'),null);assert.equal(d.activeElement,h.button('Android'));assert.equal(panel.scrollTop,20);
  await h.click('b2b');menu=d.querySelector('[role="group"][aria-label="Канал"]');assert.ok(menu);assert.equal(menu.parentElement,d.body);assert.equal(panel.contains(menu),false);await h.click('site');assert.deepEqual(h.calls.channel,['site']);assert.equal(d.activeElement,h.button('site'));
 });
});
test('settings picker flips within the viewport and closes on outside scroll/resize without closing the panel',async()=>{
 await pickerHarness({width:800,height:350,top:220,right:760},async h=>{
  const {w,d}=h;await h.click('Открыть настройки Apollo');await h.click('Desktop');let menu=d.querySelector('[role="group"]');assert.equal(menu.style.top,'8px');assert.equal(menu.style.maxHeight,'208px');
  menu.firstElementChild.dispatchEvent(new w.Event('scroll'));await tick();assert.equal(d.querySelector('[role="group"]'),menu,'own menu scroll never closes or scrolls the panel');
  d.querySelector('#apollo-settings').dispatchEvent(new w.Event('scroll'));await tick();assert.equal(d.querySelector('[role="group"]'),null);assert.ok(d.querySelector('#apollo-settings'));
  await h.click('Desktop');w.dispatchEvent(new w.Event('resize'));await tick();assert.equal(d.querySelector('[role="group"]'),null);assert.ok(d.querySelector('#apollo-settings'));
  await h.click('Desktop');d.querySelector('#outside').dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true}));await tick();assert.equal(d.querySelector('[role="group"]'),null);assert.equal(d.querySelector('#apollo-settings'),null);
 });
 await pickerHarness({width:800,height:600,top:180,right:100},async h=>{
  await h.click('Открыть настройки Apollo');await h.click('Desktop');assert.equal(h.d.querySelector('[role="group"]').style.left,'8px','left viewport margin is clamped');
 });
});
test('settings menu arrows, Escape, Tab and operation/scope changes keep a reachable focused trigger',async()=>{
 await pickerHarness({},async h=>{
  const {w,d}=h,key=value=>d.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));
  await h.click('Открыть настройки Apollo');await h.click('Desktop');key('End');assert.equal(d.activeElement.textContent,'Android');key('ArrowDown');assert.equal(d.activeElement.textContent,'Desktop');key('ArrowUp');assert.equal(d.activeElement.textContent,'Android');key('Home');assert.equal(d.activeElement.textContent,'Desktop');
  key('Escape');await tick();assert.equal(d.querySelector('[role="group"]'),null);assert.ok(d.querySelector('#apollo-settings'));assert.equal(d.activeElement,h.button('Desktop'));
  key('Escape');await tick();assert.equal(d.querySelector('#apollo-settings'),null);assert.equal(d.activeElement,h.button('Открыть настройки Apollo'));
  await h.click('Открыть настройки Apollo');await h.click('Desktop');key('Tab');await tick();assert.equal(d.querySelector('[role="group"]'),null);assert.equal(d.activeElement,h.button('Desktop'),'browser default Tab navigation follows this anchor; no geometry/browser claim');
  await h.click('Desktop');h.update({actionLoading:true});await tick();assert.equal(d.querySelector('[role="group"]'),null);assert.equal(d.querySelector('#apollo-settings'),null);
  h.update({actionLoading:false});await tick();await h.click('Открыть настройки Apollo');await h.click('Desktop');h.update({overlayScope:'another-screen'});await tick();assert.equal(d.querySelector('[role="group"]'),null);assert.equal(d.querySelector('#apollo-settings'),null);
 });
});
