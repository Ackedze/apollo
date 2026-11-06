const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),esbuild=require('esbuild'),{JSDOM}=require('jsdom');
const {buildV3Groups}=require('../src/v3-audit/ui-model');
const app=path.resolve(__dirname,'..'),wait=()=>new Promise(resolve=>setTimeout(resolve,35));
const compiled=esbuild.buildSync({stdin:{resolveDir:app,loader:'tsx',contents:`
 import React from 'react';import{createRoot}from'react-dom/client';
 import{AuditToast}from'./src/design-check/AuditToast';
 import{FindingActionMenu}from'./src/design-check/FindingActionMenu';
 import{Button}from'./src/design-check/v3/ui-app/components/Button';
 export{mountDesignCheck}from'./src/design-check';
 import'./src/design-check/legacy.css';import'./src/design-check/finding-card.css';
 export function mount(node,props){const root=createRoot(node);const render=p=>root.render(p.menu?<FindingActionMenu {...p.menu}/>:<AuditToast message="Перепроверяем область..." persistent={p.persistent}><Button type="secondary" size="compact" label="Остановить" disabled={p.disabled} onPress={()=>{}}/></AuditToast>);render(props);return{render,close:()=>root.unmount()};}
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
 const base=buildV3Groups(result).theme.entries[0];assert.equal(base.displayName,'[D][Corporate] Input');assert.equal(base.title,'Замени на [D] Input');assert.equal(category(result,'detached').entries[0].title,'Компонент [D] NavigationCardView раздетачен.');
 assert.equal(category(result,'detachedStyles').title,'Без стиля или токена');
});
test('toast uses a cross, black secondary text in enabled/disabled states and dismisses',async()=>{
 const d=fixture(),w=d.window;w.eval(js+'\nwindow.QA=QA;');const view=w.QA.mount(w.document.querySelector('#root'),{});
 try{await wait();const toast=w.document.querySelector('.apollo-audit-toast'),close=toast.querySelector('[aria-label="Закрыть уведомление"]'),stop=toast.querySelector('[aria-label="Остановить"]');
  assert.equal(close.querySelector('path').getAttribute('d'),'m6 6 12 12M18 6 6 18');assert.equal(w.getComputedStyle(stop).color,'rgb(24, 24, 27)');
  view.render({disabled:true});await wait();assert.equal(w.getComputedStyle(toast.querySelector('[aria-label="Остановить"]')).color,'rgb(24, 24, 27)');close.click();await wait();assert.equal(w.document.querySelector('.apollo-audit-toast'),null);
 }finally{view.close();w.close();}
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
test('overview keeps the existing mascot circle with a closer scoped caption',()=>{
 const d=fixture(),w=d.window;w.document.querySelector('#root').innerHTML='<div class="apollo-overview-total"><div class="apollo-mascot"><div class="apollo-mascot-body"></div></div><p class="apollo-overview-caption">Проверяем</p></div>';
 try{assert.equal(w.getComputedStyle(w.document.querySelector('.apollo-mascot')).height,'160px');assert.equal(w.getComputedStyle(w.document.querySelector('.apollo-mascot-body')).height,'144px');assert.equal(w.getComputedStyle(w.document.querySelector('.apollo-overview-caption')).marginTop,'8px');}finally{w.close();}
});

const builder=esbuild.buildSync({entryPoints:[path.join(app,'src/v3-audit/services/auditViewBuilder.ts')],bundle:true,write:false,platform:'node',format:'cjs',logLevel:'silent'}),moduleUnderTest={exports:{}};
new Function('require','module','exports',builder.outputFiles[0].text)(require,moduleUnderTest,moduleUnderTest.exports);
const {collectCustomStyles}=moduleUnderTest.exports;
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
