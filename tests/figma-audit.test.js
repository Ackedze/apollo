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
