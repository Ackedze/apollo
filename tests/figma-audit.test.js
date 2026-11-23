'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createFigmaAuditBridge}=require('../src/figma-audit/native');
const p=require('../src/figma-audit/protocol');
function fixture(){
 const page={id:'p',type:'PAGE'},master={id:'m',name:'Button master',type:'COMPONENT',key:'master-key',parent:null,children:[],fills:[{type:'SOLID',color:{r:0,g:0,b:1}}]};
 const text={id:'t',name:'Link',type:'TEXT',characters:'Collapse',fills:Symbol('mixed'),textStyleId:'style',getStyledTextSegments:()=>[{start:0,end:8,fills:[{type:'SOLID',boundVariables:{color:{type:'VARIABLE_ALIAS',id:'variable'}}}]}]};
 const child={id:'i',name:'Button',type:'INSTANCE',componentProperties:{View:{type:'VARIANT',value:'Accent'}},getMainComponentAsync:async()=>master,children:[text]};
 const root={id:'r',type:'FRAME',name:'Screen',parent:page,children:[child],layoutMode:'VERTICAL',itemSpacing:24};child.parent=root;text.parent=child;
 const api={currentPage:page,variables:{getVariableByIdAsync:async id=>({id,key:'variable-key',name:'text/positive',variableCollectionId:'collection',resolvedType:'COLOR',resolveForConsumer:()=>({value:{r:0,g:1,b:0},resolvedType:'COLOR'})}),getVariableCollectionByIdAsync:async()=>({id:'collection',key:'collection-key',name:'Theme',defaultModeId:'light',modes:[{modeId:'light',name:'Light'}]})},getStyleByIdAsync:async()=>({id:'style',key:'style-key',name:'Body',type:'TEXT'}),viewport:{scrollAndZoomIntoView:()=>{}}};page.selection=[root];
 const forbidden=()=>{throw Error('MUTATION_FORBIDDEN');};for(const key of ['createFrame','createText','importComponentByKeyAsync','loadAllPagesAsync','setCurrentPageAsync'])api[key]=forbidden;
 for(const n of [root,child,text,master])for(const key of ['resize','remove','setProperties','swapComponent','setBoundVariable','appendChild'])n[key]=forbidden;
 const bridge=createFigmaAuditBridge({api,hash:x=>JSON.stringify(x),post:()=>{}});return {bridge,api,root,child,text,master};
}
test('variant definitions getter is not read or replaced by parent definitions',async()=>{
 const f=fixture();let variantReads=0,parentReads=0;
 f.master.parent={id:'set',type:'COMPONENT_SET',key:'set-key',name:'Button'};
 Object.defineProperty(f.master,'componentPropertyDefinitions',{get(){variantReads++;throw Error('Can only get component property definitions of a component set or non-variant component');}});
 Object.defineProperty(f.master.parent,'componentPropertyDefinitions',{get(){parentReads++;return {OwnerOnly:{type:'TEXT'}};}});
 const s=await f.bridge.execute({operation:'capture'});await f.bridge.execute({operation:'read',snapshotId:s.snapshotId,nodeIds:['i']});
 const source=await f.bridge.execute({operation:'source',snapshotId:s.snapshotId,nodeId:'m'});
 assert.equal(variantReads,0);assert.equal(parentReads,0);assert.equal('componentPropertyDefinitions'in source.root,false);assert(source.root.unavailable.includes('componentPropertyDefinitions'));assert.equal(source.root.key,'master-key');
 assert.equal((await f.bridge.execute({operation:'verify',snapshotId:s.snapshotId})).current,true);
});
test('standalone component definitions remain available and participate in freshness',async()=>{
 const f=fixture();f.master.componentPropertyDefinitions={Text:{type:'TEXT',defaultValue:'OK'}};
 const s=await f.bridge.execute({operation:'capture'});await f.bridge.execute({operation:'read',snapshotId:s.snapshotId,nodeIds:['i']});
 const source=await f.bridge.execute({operation:'source',snapshotId:s.snapshotId,nodeId:'m'});assert.deepEqual(source.root.componentPropertyDefinitions,f.master.componentPropertyDefinitions);
 f.master.componentPropertyDefinitions.Text.defaultValue='Changed';await assert.rejects(f.bridge.execute({operation:'verify',snapshotId:s.snapshotId}),{code:'AUDIT_STALE'});
});
test('optional source metadata getter refusal makes only that field unavailable',async()=>{
 for(const field of ['key','componentPropertyDefinitions','variantProperties']){
  const f=fixture(),s=await f.bridge.execute({operation:'capture'});await f.bridge.execute({operation:'read',snapshotId:s.snapshotId,nodeIds:['i']});
  Object.defineProperty(f.master,field,{get(){throw Error('Synthetic getter refusal');}});
  const source=await f.bridge.execute({operation:'source',snapshotId:s.snapshotId,nodeId:'m'});assert(source.root.unavailable.includes(field));assert.equal(field in source.root,false);assert.equal(source.root.id,'m');
  if(field==='key')await assert.rejects(f.bridge.execute({operation:'verify',snapshotId:s.snapshotId}),{code:'AUDIT_STALE'});else assert.equal((await f.bridge.execute({operation:'verify',snapshotId:s.snapshotId})).current,true);
 }
});
test('fatal native errors retain bounded name/message and never turn into source evidence',async()=>{
 const f=fixture(),messages=[],bridge=createFigmaAuditBridge({api:f.api,hash:v=>JSON.stringify(v),post:m=>messages.push(m)}),s=await bridge.execute({operation:'capture'});
 await bridge.execute({operation:'read',snapshotId:s.snapshotId,nodeIds:['i']});
 Object.defineProperty(f.master,'children',{get(){throw Object.assign(Error('Synthetic source access failure: '+ 'x'.repeat(2000)),{name:'NativeFixtureError',stack:'PRIVATE_STACK_NOT_EXPORTED'});}});
 bridge.accept({type:'figma-audit-native',operation:'source',callId:'source-failure',snapshotId:s.snapshotId,nodeId:'m'});
 while(!messages.length)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(messages[0].code,'AUDIT_READ_FAILED');assert.equal(messages[0].success,false);assert.equal(messages[0].diagnostic.name,'NativeFixtureError');assert.equal(messages[0].diagnostic.message.length,1000);assert.equal('result'in messages[0],false);assert.equal(JSON.stringify(messages).includes('PRIVATE_STACK_NOT_EXPORTED'),false);
});
test('read-only snapshot preserves mixed paints, text ranges, source identity and variable/style names',async()=>{
 const f=fixture(),s=await f.bridge.execute({operation:'capture'});assert.ok(p.snapshotValid(s));
 const rows=await f.bridge.execute({operation:'read',snapshotId:s.snapshotId,nodeIds:['i','t']});
 assert.equal(rows.nodes[0].main.key,'master-key');assert.equal(rows.nodes[0].main.set,null);assert.deepEqual(rows.nodes[1].fills,{unavailable:'MIXED'});assert.equal(rows.nodes[1].variables[0].name,'text/positive');assert.equal(rows.nodes[1].styles[0].name,'Body');
 await assert.rejects(f.bridge.execute({operation:'read',snapshotId:s.snapshotId,nodeIds:['unrelated']}),{code:'AUDIT_SCOPE_ESCAPE'});
 const source=await f.bridge.execute({operation:'source',snapshotId:s.snapshotId,nodeId:'m'});assert.equal(source.root.id,'m');assert.equal((await f.bridge.execute({operation:'verify',snapshotId:s.snapshotId})).current,true);
 await assert.rejects(f.bridge.execute({operation:'apply',snapshotId:s.snapshotId}),{code:'AUDIT_OPERATION_FORBIDDEN'});
 assert.deepEqual(f.api.currentPage.selection,[f.root]);
});
test('same-page edits, removed nodes and independent source edits reject current verdicts',async()=>{
 for(const mutate of [f=>{f.root.itemSpacing=80;},f=>{f.master.fills[0].color.r=1;},f=>{f.text.removed=true;}]){
  const f=fixture(),s=await f.bridge.execute({operation:'capture'});await f.bridge.execute({operation:'read',snapshotId:s.snapshotId,nodeIds:['r','i','t']});await f.bridge.execute({operation:'source',snapshotId:s.snapshotId,nodeId:'m'});mutate(f);await assert.rejects(f.bridge.execute({operation:'verify',snapshotId:s.snapshotId}),{code:'AUDIT_STALE'});
 }
});
test('unobserved source, changed page and oversized scope are rejected without document writes',async()=>{
 const f=fixture(),s=await f.bridge.execute({operation:'capture'});await assert.rejects(f.bridge.execute({operation:'source',snapshotId:s.snapshotId,nodeId:'m'}),{code:'AUDIT_SOURCE_NOT_OBSERVED'});f.api.currentPage={id:'other',selection:[]};await assert.rejects(f.bridge.execute({operation:'verify',snapshotId:s.snapshotId}),{code:'AUDIT_STALE'});
 const g=fixture();g.root.children=Array.from({length:p.MAX_NODES},(_,i)=>({id:'n'+i,name:'node',type:'RECTANGLE',parent:g.root}));await assert.rejects(g.bridge.execute({operation:'capture'}),{code:'AUDIT_SCOPE_BUDGET'});
});
test('coverage excludes N/A and keeps unknown and unread in denominator',()=>{
 assert.deepEqual(p.coverage(p.STATUSES.map(status=>({status}))),{counts:{PASS:1,FAIL:1,UNKNOWN:1,NOT_CHECKED:1,NOT_APPLICABLE:1},applicable:4,decisive:2,percent:50,basis:'declared-rule-targets; not all Hub knowledge'});
});
function nestedFixture(){
 const f=fixture(),page=f.api.currentPage,grand={id:'grand',type:'FRAME',name:'Outer',parent:page},sibling={id:'sibling',name:'Other',type:'TEXT',characters:'private sibling'},parent={id:'parent',name:'Context',type:'INSTANCE',parent:grand,children:[f.root,sibling],itemSpacing:24,characters:'not context content',overrides:[{id:'sibling'}],componentProperties:{Secret:'private'},getMainComponentAsync:async()=>f.master};
 f.root.parent=parent;sibling.parent=parent;grand.children=[parent];
 const children=Array.from({length:7},(_,i)=>({id:'child'+i,name:'Child',type:'RECTANGLE',parent:f.root,fills:[]}));f.root.children=children;return Object.assign(f,{parent,grand,sibling});
}
test('eight selected facts plus the nearest parent are read without sibling, ancestor or target grants',async()=>{
 const f=nestedFixture(),selection=f.api.currentPage.selection,s=await f.bridge.execute({operation:'capture'});assert.ok(p.snapshotValid(s));assert.equal(s.nodes.length,8);assert.equal(s.contextParents.length,1);
 const row=(await f.bridge.execute({operation:'read',snapshotId:s.snapshotId,nodeIds:s.nodes.map(n=>n.id).concat('parent')})).nodes.at(-1);
 assert.equal(row.scope,'parent-context');assert.equal(row.itemSpacing,24);assert.deepEqual(row.children,['r']);assert.deepEqual(row.componentIdentity,{key:'master-key',name:'Button master',setKey:null});
 for(const field of ['parentId','main','overrides','characters','componentProperties','componentPropertyDefinitions'])assert.equal(field in row,false,field);
 assert.equal(JSON.stringify(row).includes('sibling'),false);
 for(const id of ['sibling','grand','p','arbitrary'])await assert.rejects(f.bridge.execute({operation:'read',snapshotId:s.snapshotId,nodeIds:[id]}),{code:'AUDIT_SCOPE_ESCAPE'});
 await assert.rejects(f.bridge.execute({operation:'source',snapshotId:s.snapshotId,nodeId:'m'}),{code:'AUDIT_SOURCE_NOT_OBSERVED'});
 await assert.rejects(f.bridge.execute({operation:'focus',snapshotId:s.snapshotId,nodeId:'parent'}),{code:'AUDIT_SCOPE_ESCAPE'});
 assert.deepEqual(f.api.currentPage.selection,selection);assert.equal((await f.bridge.execute({operation:'verify',snapshotId:s.snapshotId})).current,true);
 assert.equal(p.reportValid({version:p.VERSION,snapshotId:s.snapshotId,checks:[{id:'parent-rule',sourceId:'hub',status:'PASS',targets:['parent']}]},s),false);
});
test('parent changes and roots reparented across pages invalidate used facts',async()=>{
 for(const mutate of [f=>{f.parent.itemSpacing=80;},f=>{f.parent.parent={id:'other',type:'PAGE'};}]){
  const f=nestedFixture(),s=await f.bridge.execute({operation:'capture'});await f.bridge.execute({operation:'read',snapshotId:s.snapshotId,nodeIds:['parent']});mutate(f);await assert.rejects(f.bridge.execute({operation:'verify',snapshotId:s.snapshotId}),{code:'AUDIT_STALE'});
 }
});
test('a vanished unused observed source returns unavailable without granting its graph; used source edits remain stale',async()=>{
 const f=fixture(),s=await f.bridge.execute({operation:'capture'});await f.bridge.execute({operation:'read',snapshotId:s.snapshotId,nodeIds:['i']});f.master.removed=true;
 const unavailable=await f.bridge.execute({operation:'source',snapshotId:s.snapshotId,nodeId:'m'});assert.equal(unavailable.root.availability,'UNAVAILABLE');assert.deepEqual(unavailable.nodes,[]);await assert.rejects(f.bridge.execute({operation:'read',snapshotId:s.snapshotId,nodeIds:['unobserved-child']}),{code:'AUDIT_SCOPE_ESCAPE'});
 const g=fixture(),snapshot=await g.bridge.execute({operation:'capture'});await g.bridge.execute({operation:'read',snapshotId:snapshot.snapshotId,nodeIds:['i']});await g.bridge.execute({operation:'source',snapshotId:snapshot.snapshotId,nodeId:'m'});g.master.removed=true;await assert.rejects(g.bridge.execute({operation:'verify',snapshotId:snapshot.snapshotId}),{code:'AUDIT_STALE'});
});
test('v2 snapshot requires explicitly bounded nearest parent declarations',async()=>{
 const f=nestedFixture(),s=await f.bridge.execute({operation:'capture'});for(const patch of [{contextParents:undefined},{contextParents:[Object.assign({},s.contextParents[0],{id:'grand'})]},{contextParents:[Object.assign({},s.contextParents[0],{children:['r','sibling']})]},{contextParents:[Object.assign({},s.contextParents[0],{type:'PAGE'})]}])assert.equal(p.snapshotValid(Object.assign({},s,patch)),false);
});
test('part usage sees an owner beyond selection without ancestor read or source grants',async()=>{
 for(const type of ['INSTANCE','COMPONENT']){
  const f=fixture(),owner={id:'outside-owner',type,parent:f.api.currentPage,children:[f.root]};f.root.parent=owner;f.api.currentPage.selection=[f.child];
  const snapshot=await f.bridge.execute({operation:'capture'}),row=(await f.bridge.execute({operation:'read',snapshotId:snapshot.snapshotId,nodeIds:['i']})).nodes[0];assert.deepEqual(row.usageContext,{state:'nested',owner:{id:'outside-owner',type}});assert.equal(snapshot.nodes.some(n=>n.id===owner.id),false);
  await assert.rejects(f.bridge.execute({operation:'read',snapshotId:snapshot.snapshotId,nodeIds:[owner.id]}),{code:'AUDIT_SCOPE_ESCAPE'});await assert.rejects(f.bridge.execute({operation:'source',snapshotId:snapshot.snapshotId,nodeId:owner.id}),{code:'AUDIT_SOURCE_NOT_OBSERVED'});
  const context=(await f.bridge.execute({operation:'read',snapshotId:snapshot.snapshotId,nodeIds:['r']})).nodes[0];assert.equal('usageContext'in context,false);assert.equal(JSON.stringify(context).includes('outside-owner'),false);
  owner.type='FRAME';await assert.rejects(f.bridge.execute({operation:'verify',snapshotId:snapshot.snapshotId}),{code:'AUDIT_STALE'});
 }
});
test('standalone is proved through layout frames/sections, not inferred from being a selected root',async()=>{
 const f=fixture(),section={id:'section',type:'SECTION',parent:f.api.currentPage,children:[f.root]};f.root.parent=section;f.api.currentPage.selection=[f.child];
 const snapshot=await f.bridge.execute({operation:'capture'}),row=(await f.bridge.execute({operation:'read',snapshotId:snapshot.snapshotId,nodeIds:['i']})).nodes[0];assert.deepEqual(row.usageContext,{state:'standalone',pageId:'p',owner:null});assert.equal((await f.bridge.execute({operation:'verify',snapshotId:snapshot.snapshotId})).current,true);
});
test('ownership lookup yields through deep layout ancestry without an arbitrary lifecycle cutoff',async()=>{
 const f=fixture();let parent=f.root;for(let i=0;i<105;i++){const frame={id:'deep'+i,type:'FRAME',parent,children:[]};parent.children=[frame];parent=frame;}parent.children=[f.child];f.child.parent=parent;
 const snapshot=await f.bridge.execute({operation:'capture'}),row=(await f.bridge.execute({operation:'read',snapshotId:snapshot.snapshotId,nodeIds:['i']})).nodes[0];assert.deepEqual(row.usageContext,{state:'standalone',pageId:'p',owner:null});
});

test('cyclic ownership context is UNKNOWN without reading unrelated graph facts',async()=>{
 const f=fixture(),cycle={id:'cycle',type:'FRAME'};cycle.parent=cycle;f.child.parent=cycle;
 const snapshot=await f.bridge.execute({operation:'capture'}),row=(await f.bridge.execute({operation:'read',snapshotId:snapshot.snapshotId,nodeIds:['i']})).nodes[0];assert.deepEqual(row.usageContext,{state:'unknown',reason:'unavailable-or-cycle'});
});
