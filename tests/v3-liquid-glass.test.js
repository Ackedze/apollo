'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
const {buildSync}=require('esbuild');
const {data}=require('./fixtures/v3-audit-compact-index.cjs');
const {compileLegacyComponents}=require('../../../services/apollo-proxy/src/audit-data/policies/liquid-glass');
const {buildV3Groups,nativeMetrics}=require('../src/v3-audit/ui-model');
const {identifyLegacyComponent}=require('../src/v3-audit/policies/liquidGlassComponentPolicy');
const code=buildSync({stdin:{contents:'module.exports=Object.assign({},require("./src/v3-audit/liquid-glass"),require("./src/v3-audit/entry"),require("./src/v3-audit/embedded-data"),require("./src/v3-audit/remediation/session"))',resolveDir:path.join(__dirname,'..')},bundle:true,write:false,platform:'node',format:'cjs',supported:{'object-rest-spread':false}}).outputFiles[0].text;
const runtime={exports:{}};new Function('module','exports','require',code)(runtime,runtime.exports,require);
const {readLiquidGlassRegistry,runV3Audit,createOfflineAuditIndex,createAuditSession}=runtime.exports;
const legacy='63ebc76450fc4eca2e3580eeec8951336937c046',conditional='dd134e78b30b144f5fa9471e40367f51d7a1128d',oldVariant='a'.repeat(40),falseVariant='b'.repeat(40),trueVariant='9'.repeat(40),local='8'.repeat(40),property='👻 LiquidGlassEffect';
function policy(){
 const payload=JSON.parse(JSON.stringify(data.payload).replaceAll('d'.repeat(40),legacy).replaceAll('e'.repeat(40),conditional));
 for(const row of Object.values(payload.components.rows))if(row.type==='component')row.platforms=['iOS'];
 payload.sources.sources[0].fileKey='SyntheticLibrary';
 const index={schema:'apollo.embedded-audit.v1',dataId:crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),payload};
 const config={schemaVersion:1,platform:'iOS',families:[
  {key:legacy,name:'Old family',fileKey:'SyntheticLibrary',allowLocalSupplement:false},
  {key:conditional,name:'State family',fileKey:'SyntheticLibrary',allowLocalSupplement:false,variantCondition:{property,equals:'False',missingPropertyValue:'False',variantValues:{[falseVariant]:'False',[trueVariant]:'True'}}},
  {key:local,name:'Local supplement',fileKey:'OtherLibrary',allowLocalSupplement:true},
 ]};
 return {index,registry:compileLegacyComponents(Buffer.from(JSON.stringify(index)),config)};
}

test('native data reader pins policy to the captured audit index and rejects changed or malformed policy',async()=>{
 const {index,registry}=policy();
 assert.equal((await readLiquidGlassRegistry(registry,index.dataId,()=>{})).registry.registryId,registry.registryId);
 await assert.rejects(readLiquidGlassRegistry(registry,'0'.repeat(64),()=>{}),/DATA_INVALID/);
 const changed=structuredClone(registry);changed.families[0].key='1'.repeat(40);
 await assert.rejects(readLiquidGlassRegistry(changed,index.dataId,()=>{}),/DATA_INVALID/);
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
 const unread=instance('unread','4'.repeat(40),conditional);Object.defineProperty(unread,'variantProperties',{get(){throw Error('unreadable');}});
 page.children=[top,parent,absent,off,supplemented,hidden,unknown,unread];
 globalThis.figma={fileKey:'fixture',currentPage:page,currentUser:null,root:{name:'Fixture'},editorType:'figma',mixed:Symbol('mixed'),variables:{getVariableCollectionByIdAsync:async()=>null},
  getNodeByIdAsync:async id=>all.find(n=>n.id===id)||null,importComponentByKeyAsync:async key=>mains.get(key),viewport:{scrollAndZoomIntoView(nodes){focused=nodes[0].id;}}};
 t.after(()=>delete globalThis.figma);
 const result=await runV3Audit({runId:'glass',channel:'iOS',offlineIndex:createOfflineAuditIndex(index.payload,index.dataId),liquidGlass:{registry,error:null},pageType:null,shellAuditEnabled:true,pluginVersion:'test',selection:page.children,assertCurrent(){},onProgress(){}});
 const findings=result.views.visibleViews.liquidGlass;
 assert.deepEqual(findings.map(n=>n.id).sort(),['absent','false','nested-old','old','other-child','supplemented','unread']);
 assert.equal(findings.find(n=>n.id==='unread').liquidGlassStatus,'unknown');
 assert.equal(result.report.liquidGlass.findings.length,7);
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
