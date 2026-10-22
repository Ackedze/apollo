const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),esbuild=require('esbuild'),{JSDOM}=require('jsdom');
const app=path.resolve(__dirname,'../..');
const outputs=esbuild.buildSync({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {SkillsPanel} from './src/skills/layer-names/SkillsPanel';import {mountDesignCheck,createDesignCheckController,tabDefinitions} from './src/design-check';export function mountNavigation(node){const controller=createDesignCheckController({tabs:tabDefinitions});const view=mountDesignCheck(node,controller);return{getState:controller.getState,destroy(){view.unmount();controller.destroy();}};}export function mount(node,client){const root=createRoot(node);flushSync(()=>root.render(<SkillsPanel client={client}/>));return()=>flushSync(()=>root.unmount());}export function update(fn){flushSync(fn);}`,resolveDir:app,loader:'jsx'},bundle:true,write:false,outfile:path.join(app,'tests/skills-panel.bundle.js'),loader:{'.module.css':'local-css'},platform:'browser',format:'iife',globalName:'SkillUi',define:{'process.env.NODE_ENV':'"production"'}}).outputFiles;
const js=outputs.find(f=>f.path.endsWith('.js')).text,css=outputs.find(f=>f.path.endsWith('.css')).text;
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function harness(initial={}){
  const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;this.querySelector('button')?.focus();};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const style=d.createElement('style');style.textContent=css;d.head.append(style);
  let state={status:'idle',snapshot:null,plan:null,result:null,run:null,selected:[],error:'',validSelection:false,available:true,...initial};
  const calls={start:0,cancel:0,apply:0,undo:0,focus:[]},listeners=new Set();
  const emit=patch=>{state={...state,...patch};for(const fn of listeners)fn();};
  const client={subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},getState:()=>state,
    start(){calls.start++;emit({status:'reading'});},cancel(){calls.cancel++;emit({status:'idle',plan:null,selected:[]});},
    toggle(id){emit({selected:state.selected.includes(id)?state.selected.filter(n=>n!==id):state.selected.concat(id)});},
    focus(id){calls.focus.push(id);},apply(){calls.apply++;emit({status:'applying'});},undo(){calls.undo++;emit({status:'undoing'});}};
  w.eval(js+'\nwindow.SkillUi=SkillUi;');const unmount=w.SkillUi.mount(d.querySelector('#root'),client);
  return{w,d,calls,get state(){return state;},set(patch){w.SkillUi.update(()=>emit(patch));},
    button(label){const b=Array.from(d.querySelectorAll('button')).find(n=>(n.getAttribute('aria-label')||n.textContent)===label);assert.ok(b,'button '+label);return b;},
    async click(label){this.button(label).click();await tick();},destroy(){unmount();w.close();}};
}
function plan(){return{changes:Array.from({length:15},(_,i)=>({nodeId:'n'+i,oldName:i===14?'Frame / '+ 'очень длинное имя '.repeat(15):'Frame '+i,newName:'Секция '+i,reason:'Назначение подтверждено заголовком внутри секции. '.repeat(i===14?12:1),category:i<5?'recommended':'optional'}))};}
test('catalog opens a labelled modal without starting, selection gates start, close and Escape restore focus',async()=>{
 const h=harness();try{
  assert.equal(h.d.querySelectorAll('.apollo-skill-card').length,1);
  assert.equal(h.button('Переназвать слои').disabled,false);
  assert.equal(h.button('Переназвать слои').getAttribute('aria-haspopup'),'dialog');
  const cardStyle=h.w.getComputedStyle(h.button('Переназвать слои'));assert.equal(cardStyle.height,'200px');assert.equal(cardStyle.borderRadius,'24px');
  await h.click('Переназвать слои');const dialog=h.d.querySelector('dialog');
  assert.equal(h.calls.start,0);assert.equal(dialog.open,true);assert.equal(dialog.parentElement,h.d.body);
  assert.equal(h.d.getElementById(dialog.getAttribute('aria-labelledby')).textContent,'Переназвать слои');
  assert.match(dialog.textContent,/Выбери область и запусти проверку/);assert.equal(h.button('Проверить названия').disabled,true);
  const dialogStyle=h.w.getComputedStyle(dialog);assert.equal(dialogStyle.position,'fixed');assert.equal(dialogStyle.inset,'8px');assert.equal(dialogStyle.borderRadius,'36px');
  h.set({validSelection:true});assert.equal(h.button('Проверить названия').disabled,false);
  h.set({available:false});assert.equal(h.button('Проверить названия').disabled,true);
  assert.match(dialog.textContent,/Дождись завершения другой операции Apollo/);
  await h.click('Закрыть навык');assert.equal(h.d.querySelector('dialog'),null);assert.equal(h.d.activeElement,h.button('Переназвать слои'));
  await h.click('Переназвать слои');h.d.querySelector('dialog').dispatchEvent(new h.w.Event('cancel',{cancelable:true}));await tick();
  assert.equal(h.d.querySelector('dialog'),null);assert.equal(h.calls.cancel,0);assert.equal(h.d.activeElement,h.button('Переназвать слои'));
 }finally{h.destroy();}
});
test('explicit start, close/reopen during analysis, and clickable Stop preserve the current run contract',async()=>{
 const h=harness({validSelection:true});try{
  await h.click('Переназвать слои');await h.click('Проверить названия');assert.equal(h.calls.start,1);
  assert.equal(h.d.querySelector('main').getAttribute('aria-busy'),'true');assert.equal(h.button('Остановить').disabled,false);
  h.set({status:'reading-context',run:{readCount:7}});assert.match(h.d.querySelector('[role=status]').textContent,/Изучено подробно слоёв: 7/);
  await h.click('Закрыть навык');assert.equal(h.calls.cancel,0);assert.equal(h.state.status,'reading-context');
  await h.click('Переназвать слои');assert.equal(h.calls.start,1);assert.equal(h.state.run.readCount,7);
  await h.click('Остановить');assert.equal(h.calls.cancel,1);assert.equal(h.d.querySelector('dialog').open,true);assert.ok(h.button('Проверить названия'));
 }finally{h.destroy();}
});
test('three-column preview keeps choices, focus, apply and undo without a report action',async()=>{
 const p=plan(),h=harness({status:'preview',validSelection:true,plan:p,selected:p.changes.slice(0,5).map(c=>c.nodeId),snapshot:{snapshotId:'snapshot'}});try{
  await h.click('Переназвать слои');assert.equal(h.calls.start,0);
  assert.deepEqual(Array.from(h.d.querySelectorAll('th')).map(n=>n.textContent),['Было','Стало','Почему']);
  assert.equal(h.d.querySelectorAll('tbody tr').length,15);const boxes=()=>Array.from(h.d.querySelectorAll('input[type=checkbox]'));
  assert.equal(boxes().filter(n=>n.checked).length,5);assert.equal(boxes()[14].checked,false);
  assert.match(h.d.querySelector('tbody tr:last-child').textContent,/очень длинное имя/);assert.match(h.d.querySelector('tbody tr:last-child').textContent,/Необязательно/);
  assert.equal(h.w.getComputedStyle(h.d.querySelector('td')).overflowWrap,'anywhere');
  assert.equal(h.w.getComputedStyle(h.d.querySelector('main')).overflow,'auto');assert.equal(h.d.querySelector('main').tabIndex,0);
  assert.equal(h.w.getComputedStyle(h.d.querySelector('footer')).position,'absolute');assert.equal(h.w.getComputedStyle(h.d.querySelector('footer')).bottom,'8px');
  boxes()[0].click();await tick();assert.equal(boxes()[0].checked,false);
  await h.click('Закрыть навык');await h.click('Переназвать слои');assert.equal(boxes()[0].checked,false);assert.equal(h.calls.start,0);
  h.d.querySelector('.apollo-rename-focus').click();assert.deepEqual(h.calls.focus,['n0']);
  h.set({selected:[]});assert.equal(h.button('Переименовать выбранные слои: 0').disabled,true);
  h.set({selected:['n0'],available:false});assert.equal(h.button('Переименовать выбранные слои: 1').disabled,true);
  h.set({available:true});await h.click('Переименовать выбранные слои: 1');assert.equal(h.calls.apply,1);assert.equal(h.d.querySelector('main').getAttribute('aria-busy'),'true');
  assert.equal(h.d.querySelector('footer button').disabled,true);
  const changed=[{nodeId:'n0',oldName:'Frame 0',newName:'Секция 0'}];
  h.set({status:'done',result:{complete:true,verified:true,changes:changed}});
  assert.equal(h.d.querySelectorAll('input[type=checkbox]').length,0);assert.match(h.d.querySelector('tbody tr').textContent,/Назначение подтверждено заголовком/);
  assert.equal(h.button('Вернуть прежние названия').disabled,false);
  assert.equal(Array.from(h.d.querySelectorAll('footer button')).some(n=>n.textContent==='Сохранить отчёт'),false);
  await h.click('Вернуть прежние названия');assert.equal(h.calls.undo,1);
  h.set({status:'undone',result:{complete:true,verified:true,changes:changed}});assert.match(h.d.querySelector('h3').textContent,/Прежние названия возвращены/);
  assert.equal(Array.from(h.d.querySelectorAll('button')).some(n=>n.textContent==='Вернуть прежние названия'),false);
  await h.click('Новая проверка');assert.equal(h.calls.start,1);
 }finally{h.destroy();}
});
test('empty, failure and partial write states keep useful feedback and guarded retry/undo',async()=>{
 const h=harness({validSelection:true});try{
  await h.click('Переназвать слои');h.set({status:'empty',snapshot:{observedCount:42}});assert.match(h.d.querySelector('main').textContent,/Названия в порядке/);assert.match(h.d.querySelector('main').textContent,/42/);
  await h.click('Новая проверка');assert.equal(h.calls.start,1);
  h.set({status:'error',error:'Макет изменился. Повторите анализ.',run:{readCount:3}});
  assert.match(h.d.querySelector('[role=alert]').textContent,/Макет изменился/);assert.match(h.d.querySelector('main').textContent,/Изучено подробно слоёв: 3/i);
  h.set({validSelection:false});assert.equal(h.button('Повторить проверку').disabled,true);
  h.set({validSelection:true});await h.click('Повторить проверку');assert.equal(h.calls.start,2);
  h.set({status:'done',result:{complete:false,verified:false,changes:[]}});assert.match(h.d.querySelector('h3').textContent,/завершено частично/);
  assert.equal(h.button('Вернуть прежние названия').disabled,true);assert.doesNotMatch(h.d.querySelector('main').textContent,/Сохрани отчёт/);
  assert.equal(Array.from(h.d.querySelectorAll('footer button')).some(n=>n.textContent==='Сохранить отчёт'),false);
 }finally{h.destroy();}
});
test('floating footer uses its own intrinsic width and table reserves at most two action rows',async()=>{
 const h=harness({status:'done',validSelection:true,result:{complete:true,verified:true,changes:[{nodeId:'n0',oldName:'Frame',newName:'Секция'}]}});try{
  await h.click('Переназвать слои');const style=node=>h.w.getComputedStyle(node),footer=style(h.d.querySelector('footer')),actions=style(h.d.querySelector('.apollo-skills-actions'));
  assert.equal(footer.width,'max-content','width on the footer prevents shrink-to-fit to half of the dialog');
  assert.equal(footer.maxWidth,'calc(100% - 16px)');assert.equal(footer.left,'50%');assert.equal(footer.transform,'translateX(-50%)');
  const rules=Array.from(h.d.styleSheets[0].cssRules),reserveAt=max=>{
    const media=rules.find(r=>r.conditionText?.replace(/\s/g,'')===`(max-width:${max}px)`);assert.ok(media,'reserve breakpoint '+max);
    return parseFloat(Array.from(media.cssRules).find(r=>r.selectorText==='.apollo-skill-content').style.getPropertyValue('padding-bottom'));
  };
  const buttonHeight=Math.max(...Array.from(h.d.querySelectorAll('footer button')).map(b=>parseFloat(style(b).minHeight))),gap=parseFloat(actions.gap),padding=parseFloat(actions.paddingTop)+parseFloat(actions.paddingBottom)+parseFloat(actions.borderTopWidth)+parseFloat(actions.borderBottomWidth),bottom=parseFloat(footer.bottom);
  const needed=rows=>rows*buttonHeight+(rows-1)*gap+padding+bottom;
  assert.equal(h.d.querySelectorAll('footer button').length,2);assert.equal(needed(1),82);assert.equal(needed(2),138);
  assert.ok(parseFloat(style(h.d.querySelector('main')).paddingBottom)>=needed(1));
  assert.ok(reserveAt(799)>=needed(2),'middle widths reserve wrapped done actions');
  assert.ok(reserveAt(500)>=needed(2),'compact widths reserve both done actions');
 }finally{h.destroy();}
});
test('visible analysis stages follow native capture, agent context passes and registration without invented progress',async()=>{
 const h=harness({validSelection:true});try{
  await h.click('Переназвать слои');await h.click('Проверить названия');
  const progress=()=>h.d.querySelector('.apollo-skill-progress'),current=()=>progress().querySelector('[aria-current=step]').textContent;
  assert.equal(current(),'Чтение области');assert.match(progress().textContent,/Читаем выделенные слои/);
  assert.doesNotMatch(h.d.querySelector('main').textContent,/Выбери область/);
  assert.equal(progress().classList.contains('design-check-sr-only'),false);
  assert.equal(h.d.querySelector('[role=status]').closest('[aria-busy=true]'),null,'live updates stay outside the busy content region');
  h.set({status:'planning',run:{readCount:0,step:1}});assert.equal(current(),'Подбор названий');
  assert.equal(progress().querySelectorAll('.is-complete').length,1);assert.match(progress().textContent,/Проход анализа: 1/);
  h.set({status:'reading-context',run:{readCount:7,step:2}});assert.equal(current(),'Подбор названий');
  assert.match(progress().textContent,/Уточняем содержимое слоёв/);assert.match(progress().textContent,/Изучено подробно слоёв: 7/);assert.match(progress().textContent,/Проход анализа: 2/);
  assert.match(h.d.querySelector('[role=status]').textContent,/Проход анализа: 2/);
  await h.click('Закрыть навык');await h.click('Переназвать слои');assert.equal(h.calls.start,1);assert.match(progress().textContent,/Проход анализа: 2/);
  h.set({status:'registering'});assert.equal(current(),'Проверка предложений');assert.equal(progress().querySelectorAll('.is-complete').length,2);
  assert.match(progress().textContent,/Сверяем предложения с текущим состоянием макета/);
  assert.doesNotMatch(progress().textContent,/%|осталось|секунд/i);
  await h.click('Остановить');assert.equal(progress(),null);assert.match(h.d.querySelector('main').textContent,/Выбери область/);
 }finally{h.destroy();}
});
test('Skills is the last top navigation action and keeps existing mode and chat transitions',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;let shell;
 try{
  w.eval(js+'\nwindow.SkillUi=SkillUi;');shell=w.SkillUi.mountNavigation(d.querySelector('#root'));await tick();
  const buttons=Array.from(d.querySelectorAll('nav[aria-label="Разделы Apollo"] > button'));
  assert.deepEqual(buttons.map(b=>b.getAttribute('aria-label')),['Проверка','Тексты','Генерация','Открыть чат с Apollo','Навыки']);
  buttons[4].click();await tick();assert.equal(shell.getState().mode,'skills');assert.equal(buttons[4].getAttribute('aria-pressed'),'true');
  buttons[2].click();await tick();assert.equal(shell.getState().mode,'generation');
  buttons[3].click();await tick();assert.equal(shell.getState().chat.open,true);
  buttons[4].click();await tick();assert.equal(shell.getState().chat.open,false);assert.equal(shell.getState().mode,'skills');
  buttons[0].click();await tick();assert.equal(shell.getState().mode,'check');assert.equal(shell.getState().view,'audit');
 }finally{shell?.destroy();w.close();}
});
