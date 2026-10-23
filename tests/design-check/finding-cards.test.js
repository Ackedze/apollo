const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),esbuild=require('esbuild');
const {JSDOM}=require('jsdom');
const app=path.resolve(__dirname,"../..");
const bundle=esbuild.buildSync({stdin:{contents:`
 import React from 'react'; import {createRoot} from 'react-dom/client';
 import {DocumentAuditCards} from './src/design-check/DocumentAudit';
 import {ContractFindings} from './src/design-check/ContractFindings';
 export {componentLibrary,documentFindingLibrary,knownLibrary} from './src/design-check/finding-library';
 export function mount(node,kind,props){const root=createRoot(node);const render=p=>root.render(React.createElement(kind==='native'?DocumentAuditCards:ContractFindings,p));render(props);return {render,close:()=>root.unmount()};}
`,resolveDir:app,loader:'jsx'},bundle:true,write:false,platform:'browser',format:'iife',globalName:'FindingCardsTest',define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text;
const delay=()=>new Promise(resolve=>setTimeout(resolve,30));
const target={id:'focus-title',kind:'occurrence',nodeId:'title',pageId:'page'};
const finding={findingId:'style',status:'custom-style',name:'Title',message:'Не задана связь со стилем: типографика.',componentKey:null,owner:null,occurrences:['title'],targets:[target],evidence:{property:'typography',fontSize:14}};
const native={check:{id:'customStyles',status:'complete',checked:1,scope:'synthetic',gaps:[],findings:[finding]},tab:'customStyles',actionsEnabled:true,mutationEnabled:true,actionData:{bindingStatus:{state:'ready'},items:[{findingId:'style',actions:[{actionId:'bind',targetId:target.id,label:'Привязать',description:'Paragraph/14–20 Primary Small · Web :: Typography',binding:{key:'synthetic-key',library:'Web :: Typography'}}]}]}};
const audit={components:[{scopeId:'component',library:'Web :: Core',snapshot:{source:{componentKey:'key'}}}],result:{engine:{evaluations:[{evaluationId:'padding',ruleId:'padding',classification:'violation',componentScopeId:'component',componentScopeName:'[D] Button',trace:{predicate:'matches-effective-baseline',truth:'false',actual:32,expected:24,factPaths:['layout.padding.right']}}]}}};
const contract={rules:[{ruleId:'padding',componentScopeId:'component',title:'Правый отступ отличается от эталона'}],audit};
async function harness(kind,props,run){
 const dom=new JSDOM('<div id="cards"></div>',{runScripts:'outside-only',pretendToBeVisual:true});let mounted;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;this.querySelector('button')?.focus();};
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 try{dom.window.eval(bundle+'\nwindow.CardTest=FindingCardsTest;');mounted=dom.window.CardTest.mount(dom.window.document.querySelector('#cards'),kind,props);await delay();await run(dom.window,mounted);}
 finally{mounted?.close();dom.window.close();}
}
test('whole native card focuses once; binding, information and text selection remain independent',async()=>{
 const focuses=[],actions=[],props={...native,onFocus:(...args)=>focuses.push(args),onAction:(...args)=>actions.push(args)};
 await harness('native',props,async(window,mounted)=>{
  const card=window.document.querySelector('.apollo-finding-card');card.click();assert.deepEqual(focuses,[['style','focus-title']]);
  card.querySelector('h3').click();assert.equal(focuses.length,2);
  card.querySelector('[data-finding-focus]').click();assert.equal(focuses.length,3);
  card.querySelector('.apollo-finding-controls button').click();assert.deepEqual(actions,[['style','focus-title','bind']]);assert.equal(focuses.length,3);
  card.querySelector('.apollo-finding-info-toggle').click();await delay();assert.equal(window.document.querySelector('dialog').open,true);assert.equal(focuses.length,3);
  window.document.querySelector('[aria-label="Закрыть сведения проверки"]').click();await delay();window.getSelection().removeAllRanges();
  const range=window.document.createRange();range.selectNodeContents(card.querySelector('h3'));window.getSelection().addRange(range);card.click();assert.equal(focuses.length,3);window.getSelection().removeAllRanges();
  assert.equal(card.querySelector('.apollo-finding-library'),null);assert.match(card.textContent,/Библиотека привязки: Web :: Typography/);
  mounted.render({...props,staleFindingIds:['style']});await delay();card.click();assert.equal(focuses.length,3);assert.equal(card.querySelector('[data-finding-focus]').disabled,true);
  mounted.render({...props,check:{...native.check,findings:[{...finding,targets:[]}]}});await delay();card.click();assert.equal(focuses.length,3);
 });
});
test('contract card uses confirmed library and native stale focus guard for whole-card clicks',async()=>{
 const focuses=[],focusClient={targets:()=>[{id:'target'}],gaps:()=>[],focus:(...args)=>focuses.push(args)};
 await harness('contract',{data:contract,focusClient},async(window,mounted)=>{
  const card=window.document.querySelector('.apollo-finding-card');assert.equal(card.querySelector('.apollo-finding-library').textContent,'Web :: Core');
  card.click();assert.deepEqual(focuses,[['padding','target']]);card.querySelector('[data-audit-focus]').disabled=true;card.click();assert.equal(focuses.length,1);
  mounted.render({data:{...contract,staleScopeIds:['component']},focusClient});await delay();card.click();assert.equal(focuses.length,1);
  card.querySelector('.apollo-finding-info-toggle').click();await delay();assert.equal(window.document.querySelector('dialog').open,true);assert.equal(focuses.length,1);
 });
});
test('library resolution matches exact scope or captured key, hides ambiguity and never uses names',async()=>{
 await harness('contract',{data:contract,focusClient:{targets:()=>[],gaps:()=>[]}},async window=>{
  const {componentLibrary,documentFindingLibrary,knownLibrary}=window.CardTest;
  assert.equal(componentLibrary(audit,'component'),'Web :: Core');assert.equal(componentLibrary(audit,'other'),null);
  assert.equal(componentLibrary({components:[audit.components[0],audit.components[0]]},'component'),null);
  assert.equal(documentFindingLibrary(audit,{componentKey:'key',occurrences:[]}),'Web :: Core');
  assert.equal(documentFindingLibrary(audit,{componentKey:'wrong-key',occurrences:['component']}),null);
  assert.equal(documentFindingLibrary({components:[audit.components[0],{...audit.components[0],library:'Other'}]},{componentKey:'key',occurrences:[]}),null);
  assert.equal(knownLibrary('Unknown library'),null);assert.equal(knownLibrary(''),null);
 });
});

test('rule details use a modal, preserve card geometry and restore focus on cancel and close',async()=>{
 const focuses=[],focusClient={targets:()=>[{id:'target'}],gaps:()=>[],focus:(...args)=>focuses.push(args)};
 await harness('contract',{data:contract,focusClient},async window=>{
  const card=window.document.querySelector('.apollo-finding-card'),trigger=card.querySelector('.apollo-finding-info-toggle');
  trigger.focus();trigger.click();await delay();let modal=window.document.querySelector('dialog');
  assert.equal(modal.open,true);assert.equal(modal.parentElement,window.document.body);assert.equal(card.querySelector('section'),null);
  assert.equal(modal.querySelector('details'),null);assert.equal(modal.querySelector('pre'),null);assert.equal(modal.querySelector('h2').textContent,'Сведения проверки');
  assert.equal(modal.querySelectorAll('h3').length,2);assert.match(modal.textContent,/padding.*layout.padding.right/s);assert.doesNotMatch(modal.textContent,/Правило:|Найти в макете/);
  modal.querySelector('p').click();assert.equal(focuses.length,0);
  modal.dispatchEvent(new window.Event('cancel',{cancelable:true}));await delay();assert.equal(window.document.querySelector('dialog'),null);assert.equal(window.document.activeElement,trigger);
  trigger.click();await delay();window.document.querySelector('[aria-label="Закрыть сведения проверки"]').click();await delay();assert.equal(window.document.activeElement,trigger);
 });
});
test('solid colour cards are compact; equal HEX never hides a recorded identity difference',async()=>{
 const key='a'.repeat(40),paint={type:'SOLID',color:{r:242,g:243,b:245},opacity:1,visible:true};
 const entry={...audit.result.engine.evaluations[0],trace:{predicate:'matches-effective-baseline',truth:'false',actual:[paint],expected:[{...paint,tokenId:key}],factPaths:['appearance.fill']}};
 const data={...contract,audit:{...audit,result:{engine:{evaluations:[entry]}}},displayMetadata:{schemaVersion:'apollo.audit-display-metadata.v1',resources:[{kind:'token',id:key,key,name:'BackgroundColor',collectionName:'BackgroundPlate Level'}]}};
 await harness('contract',{data,focusClient:{targets:()=>[],gaps:()=>[]}},async(window,mounted)=>{
  let card=window.document.querySelector('.apollo-finding-card'),line=card.querySelector('.apollo-finding-comparison');
  assert.match(line.textContent,/Цвет:.*BackgroundColor.*→.*#F2F3F5/);assert.doesNotMatch(card.textContent,/Непрозрачность|BackgroundPlate Level|Токен:/);
  const next=structuredClone(data);next.audit.result.engine.evaluations[0].trace.expected=[{...paint,tokenId:'VariableID:1:1'}];next.audit.result.engine.evaluations[0].trace.actual=[{...paint,tokenId:'VariableID:2:2'}];
  mounted.render({data:next,focusClient:{targets:()=>[],gaps:()=>[]}});await delay();card=window.document.querySelector('.apollo-finding-card');assert.ok(card);assert.match(card.textContent,/Цвет совпадает/);
  card.querySelector('.apollo-finding-info-toggle').click();await delay();assert.match(window.document.querySelector('dialog').textContent,/VariableID:1:1.*VariableID:2:2/s);
 });
});

test('mode card maps names but keeps missing evidence and rule identities in the modal',async()=>{
 const key='b'.repeat(40),path='variable.modes.'+key,ruleId='component:corporate-content.desktop.'+path+'.1.1';
 const entry={...audit.result.engine.evaluations[0],ruleId,classification:'unknown',trace:{predicate:'one-of',truth:'unknown',actual:{state:'absent'},expected:['1:0','1:1'],factPaths:[path]}};
 const data={...contract,rules:[{ruleId,componentScopeId:'component',title:'Используйте режим страницы'}],audit:{...audit,result:{engine:{evaluations:[entry]}}},displayMetadata:{modeCollections:[{key,name:'BackgroundColor',modes:[{modeId:'1:0',name:'base-bg-alt (grey)'},{modeId:'1:1',name:'base-bg (white)'}]}]}};
 const before=JSON.stringify(data);
 await harness('contract',{data,focusClient:{targets:()=>[],gaps:()=>[]}},async window=>{
  const card=window.document.querySelector('.apollo-finding-card');assert.match(card.textContent,/Режим · BackgroundColor.*base-bg-alt \(grey\).*base-bg \(white\)/s);assert.doesNotMatch(card.textContent,/variable.modes|Фактическое значение не получено/);
  card.querySelector('.apollo-finding-info-toggle').click();await delay();const modal=window.document.querySelector('dialog');assert.match(modal.textContent,/Фактическое значение не получено/);assert.ok(modal.textContent.includes(ruleId));assert.ok(modal.textContent.includes(path));assert.equal(JSON.stringify(data),before);
 });
});

test('compact sidecar replaces collection counters, keeps original trace in modal and preserves separate findings',async()=>{
 const entry={...audit.result.engine.evaluations[0],collection:{id:'c'},trace:{predicate:'count-between',truth:'false',actual:1,expected:{lower:0,upper:0},factPaths:['memberCollectionsV1.c']}};
 const copy={...entry,evaluationId:'second',ruleId:'second'};
 const row={factPath:'component.properties.View',property:'Вью',expected:'Secondary',actual:'Accent',expectedLabel:'Эталон компонента',actualLabel:'В макете'};
 const data={...contract,rules:[...contract.rules,{ruleId:'second',componentScopeId:'component',title:'Отдельное правило'}],audit:{...audit,findingPresentation:{padding:[row],second:[row]},result:{engine:{evaluations:[entry,copy]}}}};
 await harness('contract',{data,focusClient:{targets:()=>[],gaps:()=>[]}},async window=>{
  const cards=window.document.querySelectorAll('.apollo-finding-card');assert.equal(cards.length,2);
  assert.match(cards[0].textContent,/Вью:.*Secondary.*→.*Accent/s);assert.doesNotMatch(cards[0].textContent,/Количество элементов|memberCollectionsV1/);
  cards[0].querySelector('.apollo-finding-info-toggle').click();await delay();assert.match(window.document.querySelector('dialog').textContent,/memberCollectionsV1.c.*0.*1/s);
 });
});

test('native binding labels use confirmed names, retain unknown states and keep opaque keys in details',async()=>{
 const key='5'.repeat(40),fill={...finding,findingId:'fill',name:'ST-05 · Status',targets:[{...target,nodeId:'status'}],occurrences:['status'],evidence:{property:'fills',styleId:'',unboundSolidPaints:1}};
 const action={actionId:'bind-fill',targetId:target.id,kind:'bind-variable',label:'Привязать',description:key,binding:{key,library:null,modes:[]}};
 const metadata={schemaVersion:'apollo.audit-display-metadata.v1',resources:[{kind:'token',id:key,key,name:'text/primary',collectionName:'Interface Static'}]};
 const props={...native,check:{...native.check,findings:[fill]},actionData:{bindingStatus:{state:'ready'},items:[{findingId:'fill',actions:[action]}]},audit:{...audit,displayMetadata:metadata}};
 const before=JSON.stringify(props);
 await harness('native',props,async(window,mounted)=>{
  let card=window.document.querySelector('.apollo-finding-card');assert.match(card.querySelector('.apollo-finding-comparison').textContent,/Заливка:.*Не задана.*→.*text\/primary.*Interface Static/s);assert.ok(!card.textContent.includes(key));assert.ok(!card.querySelector('.apollo-finding-controls button').title.includes(key));
  card.querySelector('.apollo-finding-info-toggle').click();await delay();assert.ok(window.document.querySelector('dialog').textContent.includes(key));window.document.querySelector('[aria-label="Закрыть сведения проверки"]').click();await delay();
  mounted.render({...props,audit:{...audit,displayMetadata:{...metadata,resources:[...metadata.resources,{...metadata.resources[0],name:'Other'}]}}});await delay();card=window.document.querySelector('.apollo-finding-card');assert.match(card.querySelector('.apollo-finding-comparison').textContent,/Название токена недоступно/);assert.ok(!card.textContent.includes(key));
  mounted.render({...props,audit:{...audit,displayMetadata:{...metadata,resources:[{...metadata.resources[0],name:key}]}}});await delay();card=window.document.querySelector('.apollo-finding-card');assert.match(card.textContent,/Название токена недоступно/);assert.ok(!card.textContent.includes(key));
  mounted.render({...props,audit:undefined});await delay();card=window.document.querySelector('.apollo-finding-card');assert.match(card.textContent,/Название токена недоступно/);assert.ok(!card.textContent.includes(key));
  mounted.render({...props,actionData:{...props.actionData,items:[{findingId:'fill',actions:[{...action,kind:'bind-style'}]}]}});await delay();card=window.document.querySelector('.apollo-finding-card');assert.match(card.textContent,/Название стиля недоступно/);assert.doesNotMatch(card.textContent,/text\/primary/);
  mounted.render({...props,check:{...native.check,findings:[{...fill,evidence:{...fill.evidence,styleId:'mixed'}}]}});await delay();assert.match(window.document.querySelector('.apollo-finding-comparison').textContent,/Есть непривязанные участки/);
  const unknown={...fill,status:'unknown',message:'Связанный стиль или токен недоступен.',evidence:{property:'typography',styleId:'S:unavailable'}};
  mounted.render({...props,check:{...native.check,findings:[unknown]},actionData:undefined,audit:undefined});await delay();card=window.document.querySelector('.apollo-finding-card');assert.match(card.querySelector('.apollo-finding-comparison').textContent,/Типографика:.*Не подтверждена/s);assert.match(card.textContent,/Нужна повторная проверка/);assert.equal(card.querySelector('.apollo-finding-status').getAttribute('aria-label'),'Нужна проверка');assert.doesNotMatch(card.textContent,/Не задана/);
  assert.equal(JSON.stringify(props),before);
 });
});

test('same-named native layers retain separate cards and show exact captured owners or node IDs',async()=>{
 const nodes=['Icase-05;label','Icase-07;label','unmapped-label'];
 const findings=nodes.map((id,i)=>({...finding,findingId:'label-'+i,name:'Label',occurrences:[id],targets:[{...target,id:'target-'+i,nodeId:id}]}));
 const props={...native,actionData:undefined,check:{...native.check,findings},audit:{components:[{scopeId:'case-05',name:'ST-05 · Status',library:'Web :: Core'},{scopeId:'case-07',name:'ST-07 · Status',library:'Web :: Core'}]}};
 const calls=[];
 await harness('native',{...props,onFocus:(...args)=>calls.push(args)},async(window,mounted)=>{
  let cards=window.document.querySelectorAll('.apollo-finding-card');assert.equal(cards.length,3);assert.match(cards[0].querySelector('.apollo-finding-location').textContent,/ST-05 · Status.*Label/s);assert.match(cards[1].querySelector('.apollo-finding-location').textContent,/ST-07 · Status.*Label/s);assert.match(cards[2].querySelector('.apollo-finding-location').textContent,/Label.*unmapped-label/s);
  cards[1].click();assert.deepEqual(calls,[['label-1','target-1']]);cards[1].querySelector('.apollo-finding-info-toggle').click();await delay();assert.ok(window.document.querySelector('dialog').textContent.includes(nodes[1]));window.document.querySelector('[aria-label="Закрыть сведения проверки"]').click();await delay();
  mounted.render({...props,staleFindingIds:['label-1'],onFocus:(...args)=>calls.push(args)});await delay();cards=window.document.querySelectorAll('.apollo-finding-card');cards[1].click();assert.equal(calls.length,1);assert.equal(cards[1].querySelector('[data-finding-focus]').disabled,true);
  mounted.render({...props,audit:{components:[...props.audit.components,{scopeId:'case-05',name:'Conflicting owner'}]}});await delay();assert.doesNotMatch(window.document.querySelector('.apollo-finding-location').textContent,/ST-05|Conflicting owner/);assert.match(window.document.querySelector('.apollo-finding-location').textContent,/Icase-05;label/);
 });
});
