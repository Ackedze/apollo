'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
const {buildSync}=require('esbuild');
const {data}=require('./fixtures/v3-audit-compact-index.cjs');
const {buildV3Groups,nativeMetrics}=require('../src/v3-audit/ui-model');
const {identifyLegacyComponent}=require('../src/v3-audit/policies/liquidGlassComponentPolicy');
const code=buildSync({stdin:{contents:'module.exports=Object.assign({},require("./src/v3-audit/liquid-glass"),require("./src/v3-audit/bridge"),require("./src/v3-audit/entry"),require("./src/v3-audit/embedded-data"),require("./src/v3-audit/remediation/session"))',resolveDir:path.join(__dirname,'..')},bundle:true,write:false,platform:'node',format:'cjs',supported:{'object-rest-spread':false}}).outputFiles[0].text;
const runtime={exports:{}};new Function('module','exports','require',code)(runtime,runtime.exports,require);
const {readLiquidGlassRegistry,runV3Audit,createOfflineAuditIndex,createAuditSession,auditResultForUi}=runtime.exports;
const legacy='63ebc76450fc4eca2e3580eeec8951336937c046',conditional='dd134e78b30b144f5fa9471e40367f51d7a1128d',oldVariant='a'.repeat(40),falseVariant='b'.repeat(40),trueVariant='9'.repeat(40),local='8'.repeat(40),property='👻 LiquidGlassEffect';
function policy(){
 const payload=JSON.parse(JSON.stringify(data.payload).replaceAll('d'.repeat(40),legacy).replaceAll('e'.repeat(40),conditional));
 for(const row of Object.values(payload.components.rows))if(row.type==='component')row.platforms=['iOS'];
 payload.sources.sources[0].fileKey='SyntheticLibrary';
 const index={schema:'apollo.embedded-audit.v1',dataId:crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),payload};
 const config={schemaVersion:1,platform:'iOS',families:[
  {key:legacy,name:'Old family',fileKey:'SyntheticLibrary',allowLocalSupplement:false},
  {key:conditional,name:'State family',fileKey:'SyntheticLibrary',allowLocalSupplement:false,variantCondition:{property,equals:'False',missingPropertyValue:'False',valueSource:'instance-properties',variantValues:{[falseVariant]:'False',[trueVariant]:'True'}}},
  {key:local,name:'Local supplement',fileKey:'OtherLibrary',allowLocalSupplement:true},
 ]};
 // Wire fixture for the Apollo consumer; real Proxy compilation is exercised in the paired Proxy suite.
 const registry={schemaVersion:'apollo.legacy-components.v1',status:'draft',platform:'iOS',sourceIndexDataId:index.dataId,
  families:config.families.map(family=>Object.assign({},family,{source:family.allowLocalSupplement?'local-supplement':'catalog',
   variantKeys:family.key===legacy?[oldVariant]:family.key===conditional?[falseVariant]:[]}))};
 registry.registryId=crypto.createHash('sha256').update(JSON.stringify(registry)).digest('hex');
 return {index,registry};
}

test('native data reader pins policy to the captured audit index and rejects changed or malformed policy',async()=>{
 const {index,registry}=policy();
 assert.equal((await readLiquidGlassRegistry(registry,index.dataId,()=>{})).registry.registryId,registry.registryId);
 await assert.rejects(readLiquidGlassRegistry(registry,'0'.repeat(64),()=>{}),/DATA_INVALID/);
 const changed=structuredClone(registry);changed.families[0].key='1'.repeat(40);
 await assert.rejects(readLiquidGlassRegistry(changed,index.dataId,()=>{}),/DATA_INVALID/);
 const wrongSource=structuredClone(registry);wrongSource.families[1].variantCondition.valueSource='catalog';
 await assert.rejects(readLiquidGlassRegistry(wrongSource,index.dataId,()=>{}),/DATA_INVALID/);
 const invalid=structuredClone(registry);invalid.families[0].variantKeys=['local-id'];
 await assert.rejects(readLiquidGlassRegistry(invalid,index.dataId,()=>{}),/DATA_INVALID/);
 await assert.rejects(readLiquidGlassRegistry(registry,index.dataId,()=>{throw Error('AUDIT_CANCELLED');}),/CANCELLED/);
});

test('normal native traversal finds nested, renamed and supplemented instances; ResultScreen True does not hide old children',async t=>{
 const {index,registry}=policy();
 const page={id:'page',type:'PAGE',name:'Fixture',parent:null,explicitVariableModes:{},children:[]};
 let focused=null;const all=[],mains=new Map();
 function instance(id,key,setKey,props={}){
  const set={id:'set-'+setKey,type:'COMPONENT_SET',key:setKey,name:'Library family',remote:true,parent:null,children:[]};
  const main={id:'main-'+key,key,type:'COMPONENT',name:'Library variant',remote:true,parent:set,children:[]};
  mains.set(key,main);
  const node={id,type:'INSTANCE',name:'Renamed '+id,visible:true,opacity:1,parent:page,children:[],overrides:[],componentProperties:{},variantProperties:props,getMainComponentAsync:async()=>main};all.push(node);return node;
 }
 const top=instance('old',oldVariant,legacy),parent=instance('true-parent',trueVariant,conditional,{[property]:'True'});
 const nested=instance('nested-old',oldVariant,legacy);nested.parent=parent;parent.children=[nested];
 const absent=instance('absent',falseVariant,conditional),off=instance('false',falseVariant,conditional,{[property]:'False'});
 const covered=instance('covered-navbar',oldVariant,legacy);covered.parent=off;
 const otherChild=instance('other-child','7'.repeat(40),local);otherChild.parent=off;
 off.children=[covered,otherChild];
 const absentNavbar=instance('absent-navbar',oldVariant,legacy);absentNavbar.parent=absent;absent.children=[absentNavbar];
 const supplemented=instance('supplemented','7'.repeat(40),local),hidden=instance('hidden',oldVariant,legacy);hidden.visible=false;
 const unknown=instance('unknown','6'.repeat(40),'5'.repeat(40));
 const glyphKey=require('../src/skills/reglyph/default.json').mappings[0].oldKey;
 const glyph=instance('old-glyph',glyphKey,'3'.repeat(40));
 const unread=instance('unread','4'.repeat(40),conditional);Object.defineProperty(unread,'variantProperties',{get(){throw Error('unreadable');}});
 page.children=[top,parent,absent,off,supplemented,hidden,unknown,unread,glyph];
 globalThis.figma={fileKey:'fixture',currentPage:page,currentUser:null,root:{name:'Fixture'},editorType:'figma',mixed:Symbol('mixed'),variables:{getVariableCollectionByIdAsync:async()=>null},
  getNodeByIdAsync:async id=>all.find(n=>n.id===id)||null,importComponentByKeyAsync:async key=>mains.get(key),viewport:{scrollAndZoomIntoView(nodes){focused=nodes[0].id;}}};
 t.after(()=>delete globalThis.figma);
 const result=await runV3Audit({runId:'glass',channel:'iOS',offlineIndex:createOfflineAuditIndex(index.payload,index.dataId),liquidGlass:{registry,error:null},pageType:null,shellAuditEnabled:true,pluginVersion:'test',selection:page.children,assertCurrent(){},onProgress(){}});
 const findings=result.views.visibleViews.liquidGlass;
 assert.deepEqual(findings.map(n=>n.id).sort(),['absent','false','nested-old','old','other-child','supplemented','unread']);
 assert.equal(findings.find(n=>n.id==='unread').liquidGlassStatus,'unknown');
 assert.equal(result.report.liquidGlass.findings.length,7);
 const ui=auditResultForUi(result);
 assert.equal(ui.visibleViews.glyph26.length,1);
 assert.equal(ui.visibleViews.glyph26[0].id,'old-glyph');
 assert.equal(ui.report.glyph26.findings[0].nodeId,'old-glyph');
 assert.equal(ui.liquidGlass.status,'connected');
 assert.equal(ui.report.liquidGlass.findings.length,7);
 const combined=buildV3Groups(ui,{pickerLabel:'iOS'});
 assert.equal(combined.groups.find(g=>g.id==='icons').count,1);
 assert.equal(combined.groups.find(g=>g.id==='components').categories.find(c=>c.id==='liquidGlass').count,7);
 assert(!result.report.liquidGlass.findings.some(n=>['covered-navbar','absent-navbar'].includes(n.id)));
 // The production session discovers focus targets from the same visible view as other categories.
 const actions={get:()=>null,values:()=>[]};
 const session=await createAuditSession(result,actions,page.id,()=>{});
 assert(findings.every(n=>typeof n.focusActionId==='string'));
 await session.focus(findings.find(n=>n.id==='nested-old').focusActionId,()=>{});assert.equal(focused,'nested-old');
 const groups=buildV3Groups({visibleViews:result.views.visibleViews,liquidGlass:result.liquidGlass},{pickerLabel:'iOS'});
 const category=groups.groups.find(g=>g.id==='components').categories.find(c=>c.id==='liquidGlass');
 assert.equal(category.title,'Не на Liquid Glass');assert.equal(category.count,7);assert.equal(category.incomplete,true);
 assert.equal(nativeMetrics({visibleViews:result.views.visibleViews,liquidGlass:result.liquidGlass},{pickerLabel:'iOS'}).checks.find(c=>c.id==='v3:liquidGlass').findings.length,7);
 assert.equal(identifyLegacyComponent(registry,{platform:'Android',componentSetKey:legacy}).status,'not-applicable');
});

test('an unavailable detector is shown as incomplete, while other platforms retain the existing categories',()=>{
 const summary=buildV3Groups({visibleViews:{},liquidGlass:{status:'unavailable'}},{pickerLabel:'iOS'});
 const category=summary.groups.find(g=>g.id==='components').categories.find(c=>c.id==='liquidGlass');
 assert.equal(category.entries[0].classification,'unknown');assert.equal(summary.incomplete,true);
 assert.equal(buildV3Groups({visibleViews:{}},{pickerLabel:'iOS'}).groups.find(g=>g.id==='components').categories.find(c=>c.id==='liquidGlass').incomplete,true);
 assert.equal(buildV3Groups({visibleViews:{},liquidGlass:{status:'not-applicable'}},{pickerLabel:'Android'}).groups.find(g=>g.id==='components').categories.some(c=>c.id==='liquidGlass'),false);
});


test('ResultScreen uses readable instance state over recorded variants and distinguishes update from enabling glass',()=>{
 const {registry}=policy();
 const identify=(key,props)=>identifyLegacyComponent(registry,{platform:'iOS',componentSetKey:conditional,mainComponentKey:key,variantProperties:props});
 for(const key of [falseVariant,trueVariant]){
  const missing=identify(key,{});assert.equal(missing.status,'legacy');assert.equal(missing.reason,'variant-property-missing');
  assert.equal(identify(key,{[property]:'False'}).reason,'variant-property-disabled');
  assert.equal(identify(key,{[property]:'True'}).status,'not-applicable');
  for(const unread of [undefined,null,[]])assert.equal(identify(key,unread).status,'unknown');
  assert.equal(identify(key,{[property]:'maybe'}).status,'unknown');
 }
 const entries=[{id:'missing',name:'Result',liquidGlassStatus:'violation',liquidGlassReason:'variant-property-missing'},
  {id:'off',name:'Result',liquidGlassStatus:'violation',liquidGlassReason:'variant-property-disabled'}];
 const group=buildV3Groups({visibleViews:{liquidGlass:entries},liquidGlass:{status:'connected'}},{pickerLabel:'iOS'}).groups.find(g=>g.id==='components');
 const rows=group.categories.find(c=>c.id==='liquidGlass').entries;
 assert.match(rows[0].informationMessage,/Обнови компонент.*включи Liquid Glass/);
 assert.match(rows[1].informationMessage,/Включи Liquid Glass/);
});

test('deleted Switch is matched by exact component or instance name, without marking its wrapper or internal layer',async()=>{
 const input={platform:'iOS',nodeType:'INSTANCE',name:'❌Switch'};
 const absent={registry:null,error:'AUDIT_LEGACY_COMPONENTS_NOT_CONFIGURED'};
 const yes=identifyLegacyComponent(null,input);assert.equal(yes.status,'legacy');assert.equal(yes.matchBasis,'instance-name');
 assert.equal(yes.source,'local-rule');assert.equal(yes.familyKey,undefined);
 for(const name of ['.❌Switch','Toggle','Switch','SelectionWrapper','❌Switch custom'])assert.notEqual(identifyLegacyComponent(null,Object.assign({},input,{name})).status,'legacy');
 for(const nodeType of ['FRAME','TEXT','COMPONENT'])assert.notEqual(identifyLegacyComponent(null,Object.assign({},input,{nodeType})).status,'legacy');
 assert.notEqual(identifyLegacyComponent(null,Object.assign({},input,{platform:'Android'})).status,'legacy');
 const {evaluateLiquidGlass}=runtime.exports;
 const deleted={id:'deleted',type:'INSTANCE',name:'❌Switch',variantProperties:{}};
 const found=await evaluateLiquidGlass(deleted,null,absent,'iOS');assert.equal(found.assessment.matchBasis,'instance-name');
 const current={key:'1'.repeat(40),type:'COMPONENT',name:'On',parent:{type:'COMPONENT_SET',name:'LG Toggle'}};
 assert.equal(await evaluateLiquidGlass(deleted,current,absent,'iOS'),null,'renaming a current component to the old name must not flag it');
 const oldMain={key:'2'.repeat(40),type:'COMPONENT',name:'Off',parent:{type:'COMPONENT_SET',name:'❌Switch'}};
 const renamed=await evaluateLiquidGlass(Object.assign({},deleted,{name:'Renamed'}),oldMain,absent,'iOS');
 assert.equal(renamed.assessment.matchBasis,'main-component-name');
 assert.equal(await evaluateLiquidGlass(Object.assign({},deleted,{name:'.❌Switch'}),oldMain,absent,'iOS'),null);
});


test('native traversal reports nested deleted Switch once with focus, counts and name evidence, even without a registry',async t=>{
 const {index}=policy();
 const page={id:'switch-page',type:'PAGE',name:'Fixture',parent:null,children:[],explicitVariableModes:{}};
 const all=[];
 const make=(id,name,parent=page)=>{
  const node={id,name,type:'INSTANCE',visible:true,opacity:1,parent,children:[],overrides:[],componentProperties:{},variantProperties:{},getMainComponentAsync:async()=>null};
  all.push(node);return node;
 };
 const wrapper=make('wrapper','SelectionWrapper');
 const nested=make('nested-switch','❌Switch',wrapper),internal=make('internal','.❌Switch',nested);
 nested.children=[internal];wrapper.children=[nested];
 const standalone=make('standalone-switch','❌Switch');standalone.getMainComponentAsync=async()=>{throw Error('source removed');};
 const hidden=make('hidden-switch','❌Switch');hidden.visible=false;
 const frame={id:'named-frame',type:'FRAME',name:'❌Switch',visible:true,opacity:1,parent:page,children:[]};all.push(frame);
 page.children=[wrapper,standalone,hidden,frame];
 globalThis.figma={fileKey:'fixture',currentPage:page,currentUser:null,root:{name:'Fixture'},editorType:'figma',mixed:Symbol('mixed'),variables:{getVariableCollectionByIdAsync:async()=>null},
  getNodeByIdAsync:async id=>all.find(n=>n.id===id)||null,viewport:{scrollAndZoomIntoView(){}}};
 t.after(()=>delete globalThis.figma);
 const result=await runV3Audit({runId:'switches',channel:'iOS',offlineIndex:createOfflineAuditIndex(index.payload,index.dataId),liquidGlass:{registry:null,error:'missing'},pageType:null,shellAuditEnabled:false,pluginVersion:'test',selection:page.children,assertCurrent(){},onProgress(){}});
 const findings=result.views.visibleViews.liquidGlass;
 assert.deepEqual(findings.map(n=>n.id).sort(),['nested-switch','standalone-switch']);
 assert(findings.every(n=>n.liquidGlassMatchBasis==='instance-name'&&n.liquidGlassSource==='local-rule'));
 assert.equal(result.report.liquidGlass.findings.length,2);
 const session=await createAuditSession(result,{get:()=>null,values:()=>[]},page.id,()=>{});
 assert(findings.every(n=>typeof n.focusActionId==='string'));
 const ui=auditResultForUi(result),category=buildV3Groups(ui,{pickerLabel:'iOS'}).groups.find(g=>g.id==='components').categories.find(c=>c.id==='liquidGlass');
 assert.equal(category.issues.filter(row=>row.classification==='violation').length,2);
 assert.equal(category.incomplete,true,'local Switch detection cannot claim the unavailable family registry is complete');
 await session.focus(findings[0].focusActionId,()=>{});
 const connected=await runV3Audit({runId:'switches-connected',channel:'iOS',offlineIndex:createOfflineAuditIndex(index.payload,index.dataId),liquidGlass:{registry:policy().registry,error:null},pageType:null,shellAuditEnabled:false,pluginVersion:'test',selection:page.children,assertCurrent(){},onProgress(){}});
 const connectedGroup=buildV3Groups(auditResultForUi(connected),{pickerLabel:'iOS'}).groups.find(g=>g.id==='components');
 assert.equal(connectedGroup.categories.find(c=>c.id==='liquidGlass').count,2);
});


test('withdrawn SexyOverlay families stay outside findings even when an older registry still lists them',async()=>{
 const keys=['9b7cba716d4642a097e04b5d7bab3a95a172260c','6177e70b6bc7799c924da243126bb59a57368bc4','9fc632a82c356e4c1ccfbafd9a023ec148e62c95'];
 const {registry}=policy();
 for(const key of keys){
  const older=structuredClone(registry);older.families.push({key,name:'Withdrawn family',source:'local-supplement',variantKeys:['c'.repeat(40)]});
  assert.equal(identifyLegacyComponent(older,{platform:'iOS',componentSetKey:key}).status,'not-applicable');
  const main={key:'c'.repeat(40),type:'COMPONENT',parent:{type:'COMPONENT_SET',key,name:'Withdrawn family'}};
  assert.equal(await runtime.exports.evaluateLiquidGlass({type:'INSTANCE',name:'Renamed',variantProperties:{}},main,{registry:older,error:null},'iOS'),null);
 }
});
