const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { captureContextEvidence, SCHEMA } = require('../../src/design-check/link-context-capture');
const { createProgressBarCapture } = require('../../src/design-check/progressbar-capture');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fixture() {
  const collection = { id:'collection:1',key:'c'.repeat(40),name:'Interface Dynamic',defaultModeId:'light',modes:[{modeId:'light',name:'Light'},{modeId:'dark',name:'Dark'}] };
  const variables = new Map([
    ['semantic',{id:'semantic',key:'1'.repeat(40),name:'text/info',remote:true,resolvedType:'COLOR',variableCollectionId:collection.id,valuesByMode:{light:{type:'VARIABLE_ALIAS',id:'primitive'},dark:{r:1,g:1,b:1,a:1}}}],
    ['primitive',{id:'primitive',key:'2'.repeat(40),name:'blue/500',remote:true,resolvedType:'COLOR',variableCollectionId:collection.id,valuesByMode:{light:{r:0,g:0,b:1,a:1},dark:{r:0,g:0,b:0,a:1}}}],
  ]);
  const paint = {type:'SOLID',visible:true,opacity:1,color:{r:0,g:0,b:1},boundVariables:{color:{type:'VARIABLE_ALIAS',id:'semantic'}}};
  const label = {id:'1:4',type:'TEXT',name:'Renamed label',visible:true,characters:'Help',fills:[paint],resolvedVariableModes:{[collection.id]:'light'},componentPropertyReferences:{characters:'Label#1:2'},
    getStyledTextSegments:()=>[{start:0,end:4,fills:label.fills,hyperlink:{type:'URL',value:'https://example.test/help'},textDecoration:'NONE'}],reactions:[],annotations:[]};
  const link = {id:'1:3',type:'INSTANCE',name:'Renamed action',visible:true,children:[label],variantProperties:{},componentProperties:{'Label#1:2':{type:'TEXT',value:'Help'}},
    reactions:[{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',destinationId:'9:1',navigation:'OVERLAY',transition:null}]}],annotations:[{label:'Pseudo-link: opens an information layer'}],
    getMainComponentAsync:async()=>({key:'3'.repeat(40),name:'Link',parent:{type:'COMPONENT_SET',key:'4'.repeat(40),name:'Link'}})};
  const slot = {id:'1:2',type:'SLOT',name:'Renamed slot',visible:true,children:[link],componentPropertyReferences:{visible:'Button#5:7'}};
  const root = {id:'1:1',type:'FRAME',name:'Area',visible:true,children:[slot],width:640,height:400,exportAsync:async()=>Buffer.alloc(64)};
  const page = {id:'0:1',type:'PAGE',selection:[root]};root.parent=page;slot.parent=root;link.parent=slot;label.parent=link;
  const api = {currentPage:page,fileKey:null,base64Encode:b=>Buffer.from(b).toString('base64'),variables:{getVariableByIdAsync:async id=>variables.get(id),getVariableCollectionByIdAsync:async()=>collection}};
  const nodes = [root,slot,link,label].map(n=>({id:n.id,type:n.type})),refs=new Map([root,slot,link,label].map(n=>[n.id,n]));
  const collect = () => captureContextEvidence({api,nodes,refs,guard:()=>{},deadline:Date.now()+15000});
  return {api,root,slot,link,label,collection,variables,collect};
}
test('native evidence preserves exact semantic/primitive keys, selected modes, segment bounds and public slot references',async()=>{
  const f=fixture(),value=await f.collect(),text=value.nodes[3];assert.equal(value.schemaVersion,SCHEMA);
  assert.deepEqual(text.fills.value[0].binding.chain.map(v=>v.id),['semantic','primitive']);
  assert.equal(text.fills.value[0].binding.chain[0].collection.modeName,'Light');
  assert.equal(text.textSegments.value[0].hyperlink.value,'https://example.test/help');
  assert.equal(value.nodes[1].propertyReferences.value.visible,'Button#5:7');
  assert.equal(value.nodes[2].reactions.value[0].actions[0].navigation,'OVERLAY');
  assert.match(value.nodes[2].annotations.value[0].label,/Pseudo-link/);
  assert.equal(value.nodes[2].componentProperties.value[0].name,'Label#1:2');
});
test('raw colors, same-name local variables, mixed segments and unavailable resources stay distinguishable',async()=>{
  const f=fixture();f.label.fills=[{type:'SOLID',color:{r:0,g:0,b:1}}];let value=await f.collect();assert.equal(value.nodes[3].fills.value[0].binding,null);
  f.label.fills=[{type:'SOLID',color:{r:0,g:0,b:1},boundVariables:{color:{type:'VARIABLE_ALIAS',id:'semantic'}}}];
  f.variables.get('semantic').key='a'.repeat(40);f.variables.get('semantic').remote=false;
  value=await f.collect();assert.equal(value.nodes[3].fills.value[0].binding.chain[0].remote,false);assert.equal(value.nodes[3].fills.value[0].binding.chain[0].key,'a'.repeat(40));
  f.label.getStyledTextSegments=()=>[{start:0,end:2,fills:f.label.fills,hyperlink:null,textDecoration:'NONE'},{start:2,end:4,fills:[{type:'SOLID',color:{r:1,g:0,b:0}}],hyperlink:null,textDecoration:'UNDERLINE'}];
  value=await f.collect();assert.equal(value.nodes[3].textSegments.value.length,2);assert.equal(value.nodes[3].textSegments.value[1].fills.value[0].binding,null);
  f.variables.delete('primitive');value=await f.collect();assert.equal(value.nodes[3].fills.value[0].binding.status,'unavailable');assert.deepEqual(value.nodes[3].fills.value[0].binding.chain,[]);
});
test('alias cycles and failed native reads never become resolved facts, and conditional actions remain conditional',async()=>{
  const f=fixture();f.variables.get('primitive').valuesByMode.light={type:'VARIABLE_ALIAS',id:'semantic'};
  Object.defineProperty(f.slot,'componentPropertyReferences',{get(){throw Error('read failed');}});
  f.link.reactions=[{trigger:{type:'ON_CLICK'},actions:[{type:'CONDITIONAL',conditionalBlocks:[{condition:{},actions:[{type:'URL',url:'https://example.test'}]}]}]}];
  const value=await f.collect();assert.equal(value.nodes[3].fills.value[0].binding.status,'unavailable');assert.equal(value.nodes[1].propertyReferences.status,'unavailable');
  assert.equal(value.nodes[2].reactions.value[0].actions[0].branches[0].conditional,true);
});
test('native capture v2 binds supplemental facts before PNG and refuses color, alias, mode, slot, interaction and annotation drift',async()=>{
  for(const kind of ['color','alias','mode','slot','reaction','annotation']){
    const f=fixture(),bridge=createProgressBarCapture({api:f.api,hash,post:()=>{}}),capture=await bridge.capture('capture:'+kind);
    assert.equal(capture.schemaVersion,'apollo.progressbar-capture.v2');assert.equal(capture.contextEvidence.nodes.length,capture.nodes.length);
    if(kind==='color')f.label.fills[0].color.r=1;
    if(kind==='alias')f.variables.get('primitive').valuesByMode.light.r=0.5;
    if(kind==='mode')f.label.resolvedVariableModes[f.collection.id]='dark';
    if(kind==='slot')f.slot.componentPropertyReferences.visible='Caption#5:3';
    if(kind==='reaction')f.link.reactions[0].actions[0].navigation='NAVIGATE';
    if(kind==='annotation')f.link.annotations[0].label='Changed declaration';
    await assert.rejects(bridge.verify(capture.captureId),/CAPTURE_STALE/,kind);
  }
  const f=fixture(),bridge=createProgressBarCapture({api:f.api,hash,post:()=>{}});
  f.root.exportAsync=async()=>{f.variables.get('semantic').valuesByMode.light={r:1,g:0,b:0,a:1};return Buffer.alloc(64);};
  await assert.rejects(bridge.capture('capture:during-export'),/CAPTURE_STALE/);
});
test('shared area reuse retains shared verify and adds the same fresh context evidence',async()=>{
  const f=fixture();let verifies=0;
  const cold=createProgressBarCapture({api:f.api,hash,post:()=>{}}),first=await cold.capture('cold');
  const shared={id:'shared',pageId:'0:1',root:f.root,nodes:first.nodes,refs:new Map([f.root,f.slot,f.link,f.label].map(n=>[n.id,n])),observedIds:first.nodes.map(n=>n.id),excludedHidden:0,complete:true,verify:async()=>{verifies++;},image:async()=>Buffer.alloc(64)};
  const bridge=createProgressBarCapture({api:f.api,hash,post:()=>{},readShared:()=>shared}),capture=await bridge.capture('shared');
  assert.equal(capture.captureId,'shared');assert.ok(verifies>=2);assert.deepEqual(capture.contextEvidence,first.contextEvidence);
  f.variables.get('primitive').valuesByMode.light.g=0.3;await assert.rejects(bridge.verify(capture.captureId),/CAPTURE_STALE/);assert.ok(verifies>=3);
});
