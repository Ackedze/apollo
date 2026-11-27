const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),esbuild=require('esbuild'),{JSDOM}=require('jsdom');
const {buildV3Groups}=require('../src/v3-audit/ui-model');
const app=path.resolve(__dirname,'..'),wait=()=>new Promise(resolve=>setTimeout(resolve,35));
const compiled=esbuild.buildSync({stdin:{resolveDir:app,loader:'tsx',contents:`
 import React from 'react';import{createRoot}from'react-dom/client';
 import{AuditToast}from'./src/design-check/AuditToast';
 import{FindingActionMenu}from'./src/design-check/FindingActionMenu';
 import{V3Findings}from'./src/v3-audit/V3Findings';
 import{Button}from'./src/design-check/v3/ui-app/components/Button';
 export{mountDesignCheck,createDesignCheckController}from'./src/design-check';
 import'./src/design-check/legacy.css';import'./src/design-check/finding-card.css';
 export function mount(node,props){const root=createRoot(node);const render=p=>root.render(p.findings?<V3Findings {...p.findings}/>:p.menu?<FindingActionMenu {...p.menu}/>:<AuditToast message="Перепроверяем область..." persistent={p.persistent}><Button type="secondary" size="compact" label="Остановить" disabled={p.disabled} onPress={()=>{}}/></AuditToast>);render(props);return{render,close:()=>root.unmount()};}
 `},bundle:true,write:false,outfile:'fixture.js',loader:{'.module.css':'local-css'},platform:'browser',format:'iife',globalName:'QA',define:{'process.env.NODE_ENV':'"production"'}});
const js=compiled.outputFiles.find(file=>file.path.endsWith('.js')).text,css=compiled.outputFiles.find(file=>file.path.endsWith('.css')).text;
function fixture(){return new JSDOM('<style>'+css+'</style><div id="root"></div>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://synthetic.test',beforeParse(w){Object.defineProperty(w,'innerWidth',{value:800});}});}
function category(result,id){return buildV3Groups(result).groups.flatMap(group=>group.categories).find(group=>group.id===id);}
const diff=(verdict='violation',property='fill')=>({nodeId:'child',visible:true,assessment:{verdict,message:'Existing rule'},details:{property,reference:{value:'old'},actual:{value:'new'}}});

test('existing assessed update/deprecated violations reach Customs once without promoting WIP or changing raw results',()=>{
 const proven=diff(),result={visibleViews:{changes:[{id:'same',diffs:[diff('unknown')]}],changesWip:[{id:'wip',diffs:[{nodeId:'raw',details:{property:'fill'}}]}],relevance:{update:[{id:'same',diffs:[proven,proven,diff('unknown','radius'),diff('allowed','opacity')]}],deprecated:[{id:'old',diffs:[diff()]}]}}};
 const raw=JSON.stringify(result),custom=category(result,'changes');
 assert.equal(custom.count,2);assert.deepEqual(custom.entries[0].diffs.map(diff=>diff.assessment.verdict),['unknown','violation']);assert.equal(custom.entries[0].incomplete,true);assert.equal(custom.entries[1].classification,'violation');
 assert(!custom.entries.some(row=>row.item.id==='wip'));assert.equal(category(result,'update').count,1);assert.equal(category(result,'deprecated').count,1);assert.equal(JSON.stringify(result),raw);
});
test('distinct token binding changes and separate nodes remain separate facts',()=>{
 const a=diff(),b=diff(),c=diff();a.details.actual.binding={id:'a'};b.details.actual.binding={id:'b'};c.nodeId='other-child';
 const result={visibleViews:{relevance:{update:[{id:'owner',diffs:[a,b,c]}]}}};const rows=category(result,'changes').entries;
 assert.equal(rows.length,2);assert.equal(rows[0].diffs.length,2);assert.equal(rows[1].diffs.length,1);
});
test('supplementary identity preserves different RuleIDs sharing the same facts',()=>{
 const a=diff(),b=diff();a.assessment.ruleId='rule:one';b.assessment.ruleId='rule:two';
 const result={visibleViews:{relevance:{update:[{id:'owner',diffs:[a,b,structuredClone(a),structuredClone(b)]}]}}},raw=JSON.stringify(result);
 const rows=category(result,'changes').entries;assert.equal(rows.length,1);assert.deepEqual(rows[0].diffs.map(diff=>diff.assessment.ruleId),['rule:one','rule:two']);assert.equal(JSON.stringify(result),raw);
});
test('supplementary identity retains declared bindingId/resourceId and rule evidence',()=>{
 const pairs=[
  (a,b)=>{a.details.actual.bindingId='VariableID:a/1:1';b.details.actual.bindingId='VariableID:b/1:2';},
  (a,b)=>{a.details.reference.bindingId='VariableID:a/1:1';b.details.reference.bindingId='VariableID:b/1:2';},
  (a,b)=>{a.details.actual.resourceType=b.details.actual.resourceType='style';a.details.actual.resourceId='style:a';b.details.actual.resourceId='style:b';},
  (a,b)=>{a.details.reference.resourceType=b.details.reference.resourceType='token';a.details.reference.resourceId='token:a';b.details.reference.resourceId='token:b';},
  (a,b)=>{a.assessment.evidence={modeOwnerNodeId:'owner:a'};b.assessment.evidence={modeOwnerNodeId:'owner:b'};},
 ];
 for(const vary of pairs){const a=diff(),b=diff();a.assessment.ruleId=b.assessment.ruleId='rule:same';vary(a,b);const result={visibleViews:{relevance:{deprecated:[{id:'owner',diffs:[a,b,structuredClone(a)]}]}}},raw=JSON.stringify(result),rows=category(result,'changes').entries;assert.equal(rows[0].diffs.length,2);assert.equal(JSON.stringify(result),raw);}
});
test('supplementary identity removes exact repeats while keeping original changes and UNKNOWN intact',()=>{
 const proven=diff(),uncertain=diff('unknown'),result={visibleViews:{changes:[{id:'owner',diffs:[proven,structuredClone(proven),uncertain]}],relevance:{update:[{id:'owner',diffs:[structuredClone(proven)]}]}}},raw=JSON.stringify(result),rows=category(result,'changes').entries;
 assert.deepEqual(rows[0].diffs.map(diff=>diff.assessment.verdict),['violation','violation','unknown']);assert.equal(rows[0].incomplete,true);assert.equal(JSON.stringify(result),raw);
});
test('Locals includes components outside DS catalogs, retaining native identity and unknown coverage',()=>{
 const outside={id:'remote',componentKey:'remote-key',name:'Published component',relevance:'unknown',nodeType:'INSTANCE',isLocal:false,remote:true,focusActionId:'focus:opaque'},inside={id:'known',relevance:'unknown',reference:{key:'known'}};
 const unreadable={id:'unreadable',relevance:'unknown',componentKey:null},ambiguous={id:'ambiguous',relevance:'unknown',componentKey:'unresolved',comparisonIssues:['Ambiguous match']};
 const result={visibleViews:{local:[outside,{id:'native',componentKey:'native-key',isLocal:true},{id:'catalog-local',isLocal:true,reference:{key:'catalog'}}],relevance:{unknown:[outside,inside,unreadable,ambiguous]}}},raw=JSON.stringify(result),summary=buildV3Groups(result),local=category(result,'local');
 assert.equal(local.count,2);assert.match(local.entries[0].title,/вне подключённых каталогов DS/);assert.equal(local.entries[0].focusActionId,'focus:opaque');assert.equal(local.entries[0].item.isLocal,false);assert.equal(local.entries[0].item.remote,true);assert.equal(summary.incomplete,true);assert.equal(summary.unconfirmed.count,4);assert.equal(JSON.stringify(result),raw);
});
test('Base separates found and target component; detached message uses canonical source name',()=>{
 const result={visibleViews:{themization:[{id:'theme',name:'[D][Corporate] Input',recommendation:'[D] Input'}],detached:[{id:'detached',name:'Renamed layer',componentName:'[D] NavigationCardView'}]}};
 const summary=buildV3Groups(result),base=summary.theme.entries[0];assert.equal(base.displayName,'[D][Corporate] Input');assert.deepEqual(base.messages,['[D][Corporate] Input → [D] Input']);
 assert.deepEqual(summary.baseCategories.map(({id,count})=>[id,count]),[['pageSettings',0],['corporateComponents',1]]);assert.equal(category(result,'detached').entries[0].title,'Компонент [D] NavigationCardView раздетачен.');
 assert.equal(category(result,'detachedStyles').title,'Без токена');
});
test('toast uses a cross, black secondary text in enabled/disabled states and dismisses',async()=>{
 const d=fixture(),w=d.window;w.eval(js+'\nwindow.QA=QA;');const view=w.QA.mount(w.document.querySelector('#root'),{});
 try{await wait();const toast=w.document.querySelector('.apollo-audit-toast'),close=toast.querySelector('[aria-label="Закрыть уведомление"]'),stop=toast.querySelector('[aria-label="Остановить"]');
  assert.equal(close.querySelector('path').getAttribute('d'),'m6 6 12 12M18 6 6 18');assert.equal(w.getComputedStyle(stop).color,'rgb(24, 24, 27)');
  view.render({disabled:true});await wait();assert.equal(w.getComputedStyle(toast.querySelector('[aria-label="Остановить"]')).color,'rgb(24, 24, 27)');close.click();await wait();assert.equal(w.document.querySelector('.apollo-audit-toast'),null);
 }finally{view.close();w.close();}
});
test('opening Text Audit from Tools leaves one status and one working Stop',async()=>{
 const dom=fixture(),w=dom.window,d=w.document;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;this.querySelector('button')?.focus();};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.eval(js+'\nwindow.QA=QA;');
 const stops=[];
 const controller=w.QA.createDesignCheckController({auditEngine:'v3',onStopAudit:()=>stops.push('texts')});
 const ready={result:{visibleViews:{relevance:{update:[{id:'component',name:'Example'}]}}},texts:{result:null}};
 const view=w.QA.mountDesignCheck(d.querySelector('#root'),controller,{},{
  v3Client:{stop:()=>stops.push('design')},
 });
 try{
  controller.setV3AuditState(ready);
  await wait();
  const group=[...d.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('Компоненты:'));
  assert.ok(group);
  group.click();
  await wait();
  assert.ok(d.querySelector('.apollo-audit-results-dialog[open]'));

  controller.setV3AuditState({...ready,busy:true,kind:'components',progress:'Проверяем компоненты…'});
  await wait();
  const designToast=d.querySelector('.apollo-audit-toast');
  assert.equal(designToast.querySelector('[role="status"]').textContent,'Проверяем компоненты…');
  assert.ok(designToast.querySelector('[aria-label="Остановить"]'));

  controller.setV3AuditState(ready);
  d.querySelector('button[aria-label="Тулзы"]').click();
  await wait();
  d.querySelector('button[aria-labelledby="apollo-text-tool-card-title"]').click();
  controller.setV3AuditState({...ready,busy:true,kind:'texts',progress:'Запускаем агента'});
  await wait();
  assert.equal(Boolean(d.querySelector('.apollo-audit-toast')),false,'Text Audit uses the main progress indicator');
  assert.equal([...d.querySelectorAll('[role="status"]')].filter(node=>
   !node.closest('[hidden]')&&node.textContent==='Запускаем агента').length,1);
  const visibleStops=[...d.querySelectorAll('[aria-label="Остановить"]')].filter(node=>!node.closest('[hidden]'));
  assert.equal(visibleStops.length,1);
  visibleStops[0].click();
  await wait();
  assert.deepEqual(stops,['texts']);

  controller.setV3AuditState({...ready,error:'Агент недоступен.'});
  await wait();
  assert.equal(d.querySelector('dialog[open] .apollo-text-stage-message[role="alert"]').textContent,'Агент недоступен.');
 }finally{view.unmount();controller.destroy();w.close();}
});
test('a fresh Design result splits from the mascot once and downloads JSON directly',async()=>{
 const dom=fixture(),w=dom.window,d=w.document;
 let reducedMotion=false;
 w.matchMedia=()=>({get matches(){return reducedMotion;},addEventListener(){},removeEventListener(){}});
 const animations=[],downloads=[];
 w.Element.prototype.getBoundingClientRect=function(){
  if(this.classList.contains('apollo-mascot-body'))return new w.DOMRect(328,240,144,144);
  if(this.classList.contains('apollo-overview-tile')) {
   const index=[...this.parentElement.children].indexOf(this);
   return new w.DOMRect(174+154*index,260,144,144);
  }
  return new w.DOMRect();
 };
 w.Element.prototype.animate=function(frames){
  animations.push({node:this,frames});
  return {cancel(){}};
 };
 w.eval(js+'\nwindow.QA=QA;');
 const controller=w.QA.createDesignCheckController({auditEngine:'v3'});
 const initial=controller.getState().v3Audit;
 const view=w.QA.mountDesignCheck(d.querySelector('#root'),controller,{},{v3Client:{download:kind=>downloads.push(kind)}});
 const result={visibleViews:{relevance:{update:[{id:'component',name:'Example'}]}}};
 const download=()=>d.querySelector('button[aria-label="Скачать"]');
 try{
  await wait();
  assert.equal(download(),null);
  controller.setV3AuditState({...initial,busy:true,kind:'components'});
  await wait();
  assert.ok(d.querySelector('.apollo-mascot-body'));
  const ready={...initial,result,runId:'design-1'};
  controller.setV3AuditState(ready);
  await wait();
  const tiles=animations.filter(({node})=>node.matches('.apollo-overview-tile'));
  assert.deepEqual(tiles.map(({frames})=>frames[0].transform),[
   'translate3d(154px,-20px,0) scale(.96)',
   'translate3d(0px,-20px,0) scale(.96)',
   'translate3d(-154px,-20px,0) scale(.96)',
  ]);
  assert.ok(tiles.every(({frames})=>frames.at(-1).transform==='none'));
  assert.equal(d.querySelector('.apollo-design-diagnostics'),null);
  assert.equal(download().title,'Скачать JSON');
  download().click();
  assert.deepEqual(downloads,['components']);

  const count=animations.length;
  controller.setV3AuditState({...ready,result:{...result}});
  await wait();
  controller.setV3AuditState({...ready,busy:true,kind:'components'});
  await wait();
  controller.setV3AuditState(ready);
  await wait();
  assert.equal(animations.length,count,'updated or restored results do not replay');

  reducedMotion=true;
  controller.setV3AuditState({...ready,busy:true,kind:'components'});
  await wait();
  controller.setV3AuditState({...ready,runId:'design-2'});
  await wait();
  assert.equal(animations.length,count);
  assert.equal(d.querySelectorAll('.apollo-overview-tile').length,3);

  controller.setV3AuditState({...initial,attempts:{components:{requestId:'failed'}}});
  await wait();
  download().click();
  assert.deepEqual(downloads,['components','components']);
 }finally{view.unmount();controller.destroy();w.close();}
});
test('house menu groups libraries and caps inner scrolling at five option rows while keeping outer shadow and keyboard actions',async()=>{
 const d=fixture(),w=d.window;w.eval(js+'\nwindow.QA=QA;');const calls=[],actions=Array.from({length:16},(_,i)=>({id:'opaque:'+i,targetName:'Token '+i,targetLibrary:i<8?'Library A':'Library B'}));
 const view=w.QA.mount(w.document.querySelector('#root'),{menu:{label:'Привязать',disabled:false,actions,onAction:id=>calls.push(id)}});
 try{await wait();w.document.querySelector('button').click();await wait();const popup=w.document.querySelector('.apollo-finding-action-popup'),list=popup.firstElementChild;
  assert.equal(w.innerWidth,800);assert.equal(popup.style.maxHeight,'228px');assert.equal(w.getComputedStyle(popup).overflow,'visible');assert.equal(w.getComputedStyle(list).overflowY,'auto');assert.equal(w.getComputedStyle(list).maxHeight,'inherit');assert.notEqual(w.getComputedStyle(list).boxShadow,'none');assert.ok(w.getComputedStyle(list).boxShadow.includes('12px'));
  assert.equal(popup.querySelectorAll('button').length,16);assert.equal((popup.textContent.match(/Library A/g)||[]).length,1);assert.equal((popup.textContent.match(/Library B/g)||[]).length,1);assert.equal(popup.querySelector('button').textContent,'Token 0');
  w.document.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(w.document.activeElement.textContent,'Token 15');w.document.activeElement.click();await wait();assert.deepEqual(calls,['opaque:15']);assert.equal(w.document.querySelector('.apollo-finding-action-popup'),null);
 }finally{view.close();w.close();}
});
test('deprecated style shows its swatch by the name and previews replacements by role',async()=>{
 const dom=fixture(),w=dom.window,d=w.document,calls=[];
 w.eval(js+'\nwindow.QA=QA;');
 const actions=[{id:'screen',kind:'bind-variable',scope:'deprecatedStyles',targetName:'base-bg_inverted/secondary',targetGroup:'Фон экрана',targetLibrary:'Interface Dynamic',targetColor:'#1c1c1eff'},
  {id:'modal',kind:'bind-variable',scope:'deprecatedStyles',targetName:'modal-bg_inverted/primary',targetGroup:'Модальная поверхность',targetLibrary:'Interface Dynamic',targetColor:'#1c1c1eff'}];
 const findings=category({visibleViews:{deprecatedStyles:[
  {id:'old',name:'Слой',styleLabel:'light/bg-inverted/secondary',reason:'fill',actualColor:'#1c1c1eff',actions},
  {id:'opaque',name:'Другой слой',styleLabel:'light/bg/opaque',reason:'fill'},
 ]}},'deprecatedStyles');
 const view=w.QA.mount(d.querySelector('#root'),{findings:{category:findings,client:{action:id=>calls.push(id)},runId:'run',mutationAvailable:true}});
 try{await wait();
  const error=[...d.querySelectorAll('.apollo-v3-findings span')].find(span=>span.textContent==='Используется устаревший стиль.'&&span.childElementCount===0);
  assert.equal(w.getComputedStyle(error).fontWeight,'500');
  assert.equal(error.parentElement.querySelector('.apollo-finding-color'),null);
  const [styleName,withoutColor]=d.querySelectorAll('.apollo-deprecated-style-name');
  assert.equal(styleName.textContent,'light/bg-inverted/secondary');
  assert.equal(styleName.firstElementChild.getAttribute('aria-label'),'Фактический цвет #1c1c1eff');
  assert.equal(w.getComputedStyle(styleName).alignItems,'center');
  assert.equal(withoutColor.textContent,'light/bg/opaque');
  assert.equal(withoutColor.querySelector('.apollo-finding-color'),null);
  [...d.querySelectorAll('button')].find(button=>button.textContent==='Заменить').click();
  await wait();
  const popup=d.querySelector('.apollo-finding-action-popup');
  assert.match(popup.textContent,/Фон экрана.*Модальная поверхность/);
  const options=popup.querySelectorAll('button');
  assert.equal(options[1].querySelector('.apollo-finding-color').title,'#1c1c1eff');
  options[0].dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  assert.equal(d.activeElement,options[1]);
  options[1].click();
  assert.deepEqual(calls,['modal']);
 }finally{view.close();w.close();}
});
test('overview keeps the original mascot circle and follows reference title spacing',()=>{
 const d=fixture(),w=d.window;w.document.querySelector('#root').innerHTML='<div class="apollo-overview-total"><div class="apollo-mascot"><div class="apollo-mascot-body"></div></div><p class="apollo-overview-caption">Проверяем</p></div>';
 try{assert.equal(w.getComputedStyle(w.document.querySelector('.apollo-mascot')).height,'166px');assert.equal(w.getComputedStyle(w.document.querySelector('.apollo-mascot-body')).height,'144px');assert.equal(w.getComputedStyle(w.document.querySelector('.apollo-overview-caption')).marginTop,'24px');}finally{w.close();}
});

test('finding and binding menu show confirmed colors, with text-only ambiguous options and keyboard selection',async()=>{
 const d=fixture(),w=d.window;
 w.eval(js+'\nwindow.QA=QA;');
 const calls=[],actions=[
  {id:'first',kind:'bind-variable',targetName:'token/blue',targetLibrary:'Palette',targetColor:'#0000ff80'},
  {id:'second',kind:'bind-variable',targetName:'token/ambiguous',targetLibrary:'Palette'},
 ];
 const data={visibleViews:{customStyles:[
  {id:'fill',name:'Color fill',reason:'fill',resource:{type:'raw-value',name:'Raw fill'},actualColor:'#ff0000ff',actions},
  {id:'mixed',name:'Gradient fill',reason:'fill',resource:{type:'raw-value',name:'Raw fill'}},
 ]}};
 const props={category:category(data,'detachedStyles'),client:{action:id=>calls.push(id)},runId:'run',busy:false,stale:false,mutationAvailable:true};
 const view=w.QA.mount(w.document.querySelector('#root'),{findings:props});
 try{
  await wait();
  const swatch=w.document.querySelector('.apollo-finding-color');
  assert.equal(swatch.getAttribute('aria-label'),'Фактический цвет #ff0000ff');
  assert.equal(w.getComputedStyle(swatch.firstElementChild).backgroundColor,'rgb(255, 0, 0)');
  assert.equal(w.document.querySelectorAll('.apollo-finding-color').length,1);
  const trigger=w.document.querySelector('.apollo-finding-action-menu button');
  trigger.focus();
  trigger.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  await wait();
  const buttons=[...w.document.querySelectorAll('.apollo-finding-action-popup button')];
  assert.deepEqual(buttons.map(button=>button.textContent),['token/blue','token/ambiguous']);
  const alpha=w.getComputedStyle(buttons[0].querySelector('.apollo-finding-color > span')).backgroundColor.match(/^rgba\(0, 0, 255, ([\d.]+)\)$/)?.[1];
  assert.ok(Math.abs(Number(alpha)-128/255)<.005);
  assert.equal(buttons[1].querySelector('.apollo-finding-color'),null);
  assert.equal(w.document.activeElement,buttons[0]);
  buttons[0].dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  assert.equal(w.document.activeElement,buttons[1]);
  buttons[1].click();await wait();
  assert.deepEqual(calls,['second']);assert.equal(w.document.activeElement,trigger);
  view.render({findings:Object.assign({},props,{stale:true})});await wait();
  assert.equal(w.document.querySelector('.apollo-finding-action-menu button').disabled,true);
 }finally{view.close();w.close();}
});

const builder=esbuild.buildSync({entryPoints:[path.join(app,'src/v3-audit/services/auditViewBuilder.ts')],bundle:true,write:false,platform:'node',format:'cjs',logLevel:'silent'}),moduleUnderTest={exports:{}};
new Function('require','module','exports',builder.outputFiles[0].text)(require,moduleUnderTest,moduleUnderTest.exports);
const {collectStyleFindings}=moduleUnderTest.exports;
const collectCustomStyles = async (node, options) => (await collectStyleFindings(node, options)).custom;
test('attached text styles stay out of the unstyled typography category',async()=>{
 const mixed=Symbol('mixed');
 globalThis.figma={mixed};
 const options={
  tokenLabelMap:new Map(),
  isKnownStyleId:async id=>id==='known',
  resolveStyleMetadata:async()=>null,
  readStyleByIdAsync:async id=>id==='local'?{type:'TEXT',name:'Local body',key:'local-key'}:null,
 };
 const node=(textStyleId,segments=[])=>({
  id:'text:'+String(textStyleId),type:'TEXT',name:'Value',visible:true,
  parent:{id:'page',type:'PAGE',name:'Page',parent:null},
  textStyleId,fontName:{family:'Fixture Sans',style:'Regular'},fontSize:15,
  lineHeight:{unit:'PIXELS',value:20},openTypeFeatures:{},
  getStyledTextSegments:()=>segments.map(id=>({textStyleId:id})),
 });
 try{
  const attached=await collectCustomStyles(node('local'),options);
  assert.deepEqual(attached.map(x=>[x.reason,x.resource.type,x.resource.name,x.resource.id]),[
   ['typography','style','Local body','local'],
  ]);
  const mixedNode=node(mixed);
  mixedNode.fontSize=mixed;
  mixedNode.getStyledTextSegments=()=>['known','local'].map((textStyleId,index)=>({
   textStyleId,fontName:mixedNode.fontName,fontSize:index===0?15:20,
   lineHeight:mixedNode.lineHeight,openTypeFeatures:mixedNode.openTypeFeatures,
  }));
  const mixedAttached=await collectCustomStyles(mixedNode,options);
  assert.equal(mixedAttached[0].resource.id,'local');
  assert.equal(mixedAttached[0].resource.type,'style');
  const unresolved=await collectCustomStyles(node('style-not-readable'),options);
  assert.equal(unresolved[0].resource.type,'style');
  assert.equal(unresolved[0].resource.id,'style-not-readable');
  assert.deepEqual(await collectCustomStyles(node('known'),options),[]);
  const raw=await collectCustomStyles(node('', ['']),options);
  assert.equal(raw[0].resource.type,'raw-value');
  assert.match(raw[0].resource.name,/15\/20 px/);
  const result={visibleViews:{customStyles:[...attached,...raw]}};
  assert.equal(category(result,'customStyles').count,1);
  assert.deepEqual(category(result,'detachedStyles').issues.map(x=>x.item.id),[raw[0].id]);
 }finally{delete globalThis.figma;}
});

test('generic paint collection detects raw gradients and unknown styles, retaining known styles/tokens and image semantics',async()=>{
 globalThis.figma={mixed:Symbol('mixed'),getStyleByIdAsync:async id=>({name:'Local paint',key:id})};let serial=0;
 const tokenKey='a'.repeat(40),alias={id:'VariableID:'+tokenKey+'/1:1'},known={tokenLabelMap:new Map([[tokenKey,{label:'Known token'}]]),resolveStyleMetadata:async()=>null,isKnownStyleId:async id=>id==='known'};
 const node=extra=>Object.assign({id:'paint-'+serial++,type:'RECTANGLE',name:'Layer',visible:true,parent:{type:'PAGE',name:'Page',parent:null}},extra);
 const reasons=async extra=>(await collectCustomStyles(node(extra),known)).map(row=>row.reason);
 try{
  assert.deepEqual(await reasons({fills:[{type:'GRADIENT_LINEAR'}]}),['fill']);assert.deepEqual(await reasons({strokes:[{type:'GRADIENT_RADIAL'}]}),['stroke']);
  assert.deepEqual(await reasons({fills:[{type:'GRADIENT_LINEAR'}],fillStyleId:'known'}),[]);assert.deepEqual(await reasons({fills:[{type:'GRADIENT_LINEAR'}],fillStyleId:'local'}),['fill']);
  const rows=await collectCustomStyles(node({fills:[{type:'SOLID',boundVariables:{color:alias}}],fillStyleId:'local'}),known);assert.equal(rows.length,1);assert.equal(rows[0].resource.type,'style');assert.equal(rows[0].resource.name,'Local paint');
  assert.deepEqual(await reasons({fills:[{type:'SOLID',boundVariables:{color:alias}}]}),[]);assert.deepEqual(await reasons({fills:[{type:'SOLID',boundVariables:{color:{id:'VariableID:'+'b'.repeat(40)+'/1:2'}}}],fillStyleId:'known'}),['fill']);
  assert.deepEqual(await reasons({fills:[{type:'IMAGE'}]}),[]);assert.deepEqual(await reasons({fills:[{type:'IMAGE'}],fillStyleId:'local'}),['fill']);assert.deepEqual(await reasons({fills:[{type:'GRADIENT_LINEAR',visible:false}],fillStyleId:'local'}),[]);assert.deepEqual(await reasons({fills:[],fillStyleId:'local'}),[]);
 }finally{delete globalThis.figma;}
});

test('Design audit checks each gradient stop in fills and strokes, reports locations and focuses the layer', async t => {
 const { data } = require('./fixtures/v3-audit-compact-index.cjs');
 const compiled = esbuild.buildSync({
  stdin:{resolveDir:app, contents:'module.exports=Object.assign({},require("./src/v3-audit/entry"),require("./src/v3-audit/embedded-data"),require("./src/v3-audit/remediation/session"),require("./src/v3-audit/remediation/findingActionRegistry"))'},
  bundle:true,write:false,platform:'node',format:'cjs',supported:{'object-rest-spread':false},
 });
 const runtime={exports:{}};
 new Function('module','exports','require',compiled.outputFiles[0].text)(runtime,runtime.exports,require);
 const { runV3Audit, createOfflineAuditIndex, createAuditSession, FindingActionRegistry } = runtime.exports;
 const payload = structuredClone(data.payload);
 const keys = { active:'1'.repeat(40), deprecated:'2'.repeat(40), scheduled:'3'.repeat(40), local:'4'.repeat(40), unknown:'5'.repeat(40) };
 const variableIds = { local:'VariableID:12:34', unknown:'VariableID:56:78' };
 const variableAlias = id => ({ type:'VARIABLE_ALIAS', id });
 const indexedAlias = name => variableAlias('VariableID:' + keys[name] + '/1:1');
 const variables = ['active','deprecated','scheduled','unknown'].map(status => {
  const key = keys[status];
  payload.resources.tokens[key] = { status, closed:false, observations:[] };
  return { key, id:'VariableID:' + key, name:status, resolvedType:'COLOR' };
 });
 // An identical numeric export ID must not turn a different document variable into a catalog token.
 variables[0].id = variableIds.local;
 payload.tokenCatalogs.push({ meta:{fileName:'Fixture Colors'}, collections:[{name:'Fixture',variables}] });
 const page = { id:'1:1', type:'PAGE', name:'Fixture', parent:null, explicitVariableModes:{} };
 const color = { r:1, g:0, b:0, a:0.5 };
 const stop = (position, binding, rgba = color) => Object.assign({ position, color:rgba },
  binding ? { boundVariables:{ color:binding } } : {});
 const paint = (type, gradientStops, visible = true) => ({ type, gradientStops, visible });
 const rectangle = (id, fields) => Object.assign({ id, name:id, type:'RECTANGLE', visible:true, parent:page },fields);
 const obsolete = indexedAlias('deprecated');
 const mixed = Symbol('mixed');
 const layer = rectangle('1:2', {
  fills:[
   paint('GRADIENT_LINEAR', [stop(0,indexedAlias('active')), stop(.65), stop(.65), stop(1,obsolete)]),
   paint('GRADIENT_RADIAL', [stop(.2,variableAlias(variableIds.local)), stop(.4,indexedAlias('unknown'))]),
   paint('GRADIENT_DIAMOND', [stop(0,obsolete)], false),
  ],
  strokes:[paint('GRADIENT_ANGULAR', [stop(.1,indexedAlias('scheduled')), stop(.65,obsolete), stop(1,variableAlias(variableIds.unknown))])],
  boundVariables:{fills:[obsolete],strokes:[obsolete]},
 });
 const styled = rectangle('1:3', {
  fillStyleId:'S:' + '9'.repeat(40) + ',',
  fills:[paint('GRADIENT_LINEAR',[stop(0,obsolete)])],
  boundVariables:{fills:[obsolete]},
 });
 const missing = rectangle('1:4', { strokes:[paint('GRADIENT_LINEAR',undefined)] });
 const hidden = rectangle('1:5', {
  fills:[paint('GRADIENT_LINEAR',[stop(0,obsolete)],false)],boundVariables:{fills:[obsolete]},
 });
 const mixedText = Object.assign(rectangle('1:6',{}),{
  type:'TEXT',name:'Mixed',characters:'ABCD', fills:mixed,fillStyleId:mixed,textStyleId:'',fontName:{family:'Inter',style:'Regular'},fontSize:15,
  lineHeight:{unit:'PIXELS',value:20},letterSpacing:{unit:'PIXELS',value:0},
  openTypeFeatures:{},
  getStyledTextSegments:()=>[
   {start:0,end:2,fillStyleId:styled.fillStyleId,fills:styled.fills},
   {start:2,end:4,fillStyleId:'',fills:[paint('GRADIENT_LINEAR',[stop(0),stop(1,variableAlias(variableIds.local))])]},
  ],
 });
 const equalPaints = [paint('GRADIENT_LINEAR',[stop(0),stop(1,variableAlias(variableIds.local))])];
 const sharedPaintText = Object.assign({},mixedText,{
  id:'1:7',name:'Equal gradient paints',fills:equalPaints,
  getStyledTextSegments:()=>[
   {start:0,end:2,fillStyleId:styled.fillStyleId,fills:equalPaints},
   {start:2,end:4,fillStyleId:'',fills:equalPaints},
  ],
 });
 payload.styleCatalogs.push({ meta:{fileName:'Fixture styles'},styles:[{key:'9'.repeat(40),type:'paint',group:'Fixture',name:'Attached'}] });
 const secondStyleKey = '7'.repeat(40);
 payload.styleCatalogs[payload.styleCatalogs.length - 1].styles.push({key:secondStyleKey,type:'paint',group:'Fixture',name:'Second attached'});
 const allStyledText = Object.assign({},sharedPaintText,{
  id:'1:8',name:'Equal gradient paints with two styles',
  getStyledTextSegments:()=>[
   {start:0,end:2,fillStyleId:styled.fillStyleId,fills:equalPaints},
   {start:2,end:4,fillStyleId:'S:' + secondStyleKey + ',',fills:equalPaints},
  ],
 });
 const selection = [layer,styled,missing,hidden,mixedText,sharedPaintText,allStyledText];
 page.children = selection;
 const lookups = [], focusCalls = [];
 globalThis.figma = { currentPage:page, currentUser:null, root:{name:'Fixture'}, editorType:'figma', mixed,
  getNodeByIdAsync:async id=>selection.find(node=>node.id===id)??null, getStyleByIdAsync:async()=>null,
  variables:{getVariableByIdAsync:async id=>{
   lookups.push(id);
   return id === variableIds.local ? { key:keys.local, name:'Local red', resolvedType:'COLOR' } : null;
  }},
  viewport:{scrollAndZoomIntoView:nodes=>focusCalls.push(nodes.map(node=>node.id))},
 };
 t.after(()=>delete globalThis.figma);
 const registry = new FindingActionRegistry();
 const result = await runV3Audit({
  runId:'gradient-fixture',channel:'Desktop',offlineIndex:createOfflineAuditIndex(payload,data.dataId),
  pageType:null,shellAuditEnabled:true,pluginVersion:'fixture',selection,findingActions:registry,assertCurrent(){},onProgress(){},
 });
 const views = result.views.visibleViews;
 const rows = id => views.customStyles.filter(row=>row.id===id && row.gradientStop);
 assert.equal(views.customStyles.filter(row=>row.id===layer.id).length,5,'the entire gradient never becomes an extra raw finding');
 assert.deepEqual(rows(layer.id).map(row=>[row.reason,row.gradientStop.paintIndex,row.gradientStop.stopIndex,row.gradientStop.position,row.resource.type,row.status??null]),[
  ['fill',0,1,.65,'raw-value',null],['fill',0,2,.65,'raw-value',null],['fill',1,0,.2,'token',null],
  ['fill',1,1,.4,'raw-value','incomplete'],['stroke',0,2,1,'raw-value','incomplete'],
 ]);
 assert.equal(rows(layer.id)[0].actualColor,'#FF000080');
 assert.equal(rows(layer.id)[2].resource.key,keys.local);
 assert(rows(layer.id).every(row=>!row.actions?.length));
 assert.deepEqual(views.deprecatedStyles.map(row=>[row.id,row.reason,row.styleKey,row.gradientStop?.stopIndex,row.scheduled??false]),[
  [layer.id,'fill',keys.deprecated,3,false],[layer.id,'stroke',keys.scheduled,0,true],[layer.id,'stroke',keys.deprecated,1,false],
 ]);
 assert.equal(rows(hidden.id).length,0);
 assert.equal(rows(styled.id).length,0);
 assert.equal(rows(missing.id)[0].status,'incomplete');
 assert.deepEqual(rows(mixedText.id).map(row=>[row.gradientStop.textStart,row.gradientStop.textEnd]),[[2,4],[2,4]]);
 assert.deepEqual(rows(sharedPaintText.id).map(row=>[row.gradientStop.textStart,row.gradientStop.textEnd]),[[2,4],[2,4]]);
 assert.equal(rows(allStyledText.id).length,0);
 assert.deepEqual(lookups,[variableIds.local,variableIds.unknown]);
 const session = await createAuditSession(result,registry,page.id,()=>{},id=>selection.find(node=>node.id===id));
 const detached = category(result.views,'detachedStyles');
 assert.equal(detached.incomplete,true);
 assert.equal(detached.entries.filter(row=>row.item.gradientStop).length,7);
 assert.equal(category(result.views,'customStyles').entries.filter(row=>row.item.gradientStop).length,3);
 assert.equal(category(result.views,'deprecatedStyles').count,3);
 const raw = detached.entries.filter(row=>row.item.id===layer.id && row.classification==='violation');
 assert.equal(raw.length,2);
 assert.notEqual(raw[0].id,raw[1].id,'coincident stops retain distinct identities');
 assert.deepEqual(raw.map(row=>row.messages[0]),['Заливка 1 · градиент · точка 2 (65%)','Заливка 1 · градиент · точка 3 (65%)']);
 assert.equal(raw[0].focusActionId,raw[1].focusActionId);
 await session.focus(raw[0].focusActionId,()=>{});
 assert.deepEqual(focusCalls,[[layer.id]]);
});
