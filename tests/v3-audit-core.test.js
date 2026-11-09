const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const esbuild=require('esbuild');
function load(relative){const b=esbuild.buildSync({entryPoints:[path.join(__dirname,'../src/v3-audit',relative)],bundle:true,write:false,metafile:true,platform:'node',format:'cjs',target:'node18',logLevel:'silent'});assert(!Object.keys(b.metafile.inputs).some(p=>/experimentalContractV2|component-contract-core|predicate\/index/.test(p)));const m={exports:{}};new Function('require','module','exports',b.outputFiles[0].text)(require,m,m.exports);return m.exports;}
const {diffStructures}=load('structure/diff.ts');
const node=extra=>Object.assign({id:1,parentId:null,path:'Root',name:'Root',type:'RECTANGLE',visible:true,radius:0},extra);
const key='a'.repeat(40),other='b'.repeat(40),token='VariableID:'+key+'/1:1',changed='VariableID:'+other+'/1:2';
const options={strict:true,isPaintToken:()=>true,resolveTokenLabel:id=>id,resolveVariableMetadata:id=>({variableId:id,variableKey:/VariableID:([a-f0-9]{40})/.exec(id)?.[1],variableName:null,collectionId:null,collectionName:null,modeNames:{}})};
test('V3 paint semantics preserve token identity and detect detach/change even with equal RGBA',()=>{
 const base=node({fill:{color:'rgba(20,30,40,1)',token,paintTypes:['SOLID']}});
 assert.equal(diffStructures([node({fill:{color:'rgba(90,80,70,1)',token,paintTypes:['SOLID']}})],[base],options).diffs.length,0);
 const detached=diffStructures([node({fill:{color:'rgba(20,30,40,1)',token:null,paintTypes:['SOLID']}})],[base],options);
 assert.equal(detached.diffs.length,1);assert.equal(detached.diffs[0].details.bindingStatus,'unbound');
 assert.equal(diffStructures([node({fill:{color:'rgba(20,30,40,1)',token:changed,paintTypes:['SOLID']}})],[base],options).diffs.length,1);
});
test('missing meaningful source facts remain explicit issues',()=>{
 const r=diffStructures([node({radius:undefined})],[node({radius:8})],{strict:true});
 assert(r.issues.some(x=>x.includes('Нет данных для скруглений')));
});
test('V3 assembles the selected raw patch without changing the source tree',()=>{
 const library=load('reference/library.ts');
 const source={key:'set',name:'Example',variants:[{key:'variant',name:'Size=40'}],structure:[node({type:'COMPONENT',path:'Size=56',name:'Size=56',layout:{itemSpacing:8}})],variantStructures:{variant:[{op:'update',id:1,value:{layout:{itemSpacing:16}}}]}};
 const original=structuredClone(source),resolved=library.resolveStructure(source,'variant');
 assert.equal(resolved[0].path,'Size=40');assert.equal(resolved[0].layout.itemSpacing,16);assert.deepEqual(source,original);
});
test('the transferred token index reads actualValuesByMode for aliased values',()=>{
 const {__test_buildColorTokenValueIndex}=load('services/colorTokenValueIndex.ts');
 const index=__test_buildColorTokenValueIndex([{meta:{library:'Example',fileName:'tokens/example.json'},collections:[{name:'Colors',variables:[{key,name:'neutral/700',resolvedType:'COLOR',scopes:['ALL_SCOPES'],valuesByMode:{light:{type:'VARIABLE_ALIAS',id:'leaf'}},actualValuesByMode:{light:[{r:0.1,g:0.2,b:0.3,a:1}]}}]}]}]);
 assert.equal(index.get('0.1:0.2:0.3:1')[0].key,key);assert.deepEqual(index.get('0.1:0.2:0.3:1')[0].matchedModeIds,['light']);
});
test('V3 text capture preserves owner context and skips hidden descendants',async()=>{
 const {collectApolloTextFacts}=load('stats/textReport.ts');
 const page={id:'0:1',type:'PAGE',name:'Page',parent:null},root={id:'1:1',type:'INSTANCE',name:'Button',visible:true,parent:page,componentProperties:{View:{value:'Primary'}},children:[]};
 const text={id:'1:2',type:'TEXT',name:'Label',visible:true,characters:'Сохранить',parent:root};
 const hidden={id:'1:3',type:'FRAME',name:'Hidden',visible:false,parent:root,children:[{id:'1:4',type:'TEXT',name:'Secret',visible:true,characters:'Не проверять'}]};root.children=[text,hidden];
 const facts=await collectApolloTextFacts([root],n=>n.name,async()=>key);
 assert.equal(facts.length,1);assert.equal(facts[0].text,'Сохранить');assert.equal(facts[0].owner.componentKey,key);assert.equal(facts[0].owner.variantProperties.View,'Primary');
});
test('normalized V3 policy is mandatory and the retired contract loader is absent',()=>{
 const rules=load('rules/runtimeContractRegistry.ts');rules.clearNormalizedAuditPolicies();
 assert.throws(()=>rules.getRemoteComponentRuleRegistry(),/RULE_DATA_UNAVAILABLE/);
 rules.setNormalizedAuditPolicies({schemaVersion:'apollo.v3-audit-policies.v1',coverage:{defaultPolicy:'none'},packages:[]});assert.deepEqual(rules.getRemoteComponentRuleRegistry(),[]);
 assert.equal(rules.configureRemoteContractIndexSource,undefined);assert.equal(rules.ensureContractArtifactsForHints,undefined);
});
test('UI projection keeps comparison evidence and removes raw reference trees',()=>{
 const {auditResultForUi}=load('bridge.ts');const item={id:'1:1',name:'Example',reference:{key,name:'Example',structure:[{secret:'large-raw-tree'}]},diffs:[{message:'changed',details:{property:'fill'}}]};
 const r=auditResultForUi({schemaVersion:'apollo.v3-audit-result.v1',runId:'r',dataId:key,views:{visibleViews:{relevance:{current:[item]},changes:[item]}},report:{},textReport:{}});
 assert.equal(r.visibleViews.changes[0].reference.structure,undefined);assert.deepEqual(r.visibleViews.changes[0].diffs,item.diffs);assert(item.reference.structure);
});
test('native cancellation abandons waiting for a pure read and rejects a stale page revision',async()=>{
 const {createV3AuditBridge}=load('bridge.ts');
 for(const mode of ['cancel','revision','invalidate']) {
  const posts=[],page={id:'page',type:'PAGE',parent:null};let release,revision=1;
  globalThis.figma={currentPage:page,getNodeByIdAsync:()=>new Promise(resolve=>{release=resolve;})};
  const bridge=createV3AuditBridge({data:{},pluginVersion:'test',post:m=>posts.push(m),readRevision:()=>revision,isUnavailable:()=>false});
  const request={type:'v3-audit-run',schemaVersion:'apollo.v3-audit-bridge.v1',requestId:'native-test',rootIds:['root'],kind:'components',channel:'Desktop',pageType:null,shellAuditEnabled:false};
  assert.equal(bridge.accept(request),true);assert.equal(bridge.busy(),true);
  if(mode==='cancel'){bridge.cancel();assert.equal(posts.at(-1).type,'v3-audit-cancelling');await new Promise(setImmediate);assert.equal(bridge.busy(),false);}
  if(mode==='revision')revision++;
  if(mode==='invalidate')bridge.invalidate();
  release({id:'root',type:'FRAME',name:'Root',visible:true,parent:page});await new Promise(setImmediate);
  assert.equal(bridge.busy(),false);assert(!posts.some(m=>m.type==='v3-audit-result'));
  assert.equal(posts.at(-1).type,mode==='cancel'?'v3-audit-cancelled':'v3-audit-error');
  assert.equal(posts.at(-1).code,mode==='cancel'?'AUDIT_CANCELLED':'AUDIT_SOURCE_CHANGED');
  assert.equal(posts.filter(m=>['v3-audit-result','v3-audit-error','v3-audit-cancelled'].includes(m.type)).length,1);
 }
 delete globalThis.figma;
});
test('Stop completes with an unanswered pure read and a late old read cannot clear the next run',async()=>{
 const {createV3AuditBridge}=load('bridge.ts'),posts=[],reads=[];
 globalThis.figma={currentPage:{id:'page',type:'PAGE',parent:null},getNodeByIdAsync:()=>new Promise(resolve=>reads.push(resolve))};
 const bridge=createV3AuditBridge({data:{},pluginVersion:'test',post:m=>posts.push(m),readRevision:()=>1,isUnavailable:()=>false});
 const request=id=>({type:'v3-audit-run',schemaVersion:'apollo.v3-audit-bridge.v1',requestId:id,rootIds:['root'],kind:'components',channel:'Desktop',pageType:null,shellAuditEnabled:false});
 try{
  bridge.accept(request('old'));bridge.cancel();await new Promise(setImmediate);assert.equal(bridge.busy(),false);
  assert.equal(posts.filter(m=>m.type==='v3-audit-cancelled').length,1);
  bridge.accept(request('new'));assert.equal(bridge.busy(),true);
  reads[0]({id:'root',type:'FRAME',visible:true,parent:figma.currentPage});await new Promise(setImmediate);
  assert.equal(bridge.busy(),true);assert(!posts.some(m=>m.type==='v3-audit-result'||m.type==='v3-audit-error'));
  bridge.cancel();await new Promise(setImmediate);assert.equal(bridge.busy(),false);
  reads[1]({id:'root',type:'FRAME',visible:true,parent:figma.currentPage});await new Promise(setImmediate);
  assert.equal(posts.filter(m=>m.type==='v3-audit-cancelled').length,2);assert.equal(posts.filter(m=>m.type==='v3-audit-result'||m.type==='v3-audit-error').length,0);
 }finally{delete globalThis.figma;}
});
test('a missing Proxy package cannot produce a native success result',async()=>{
 const {createV3AuditBridge}=load('bridge.ts'),posts=[],page={id:'page',type:'PAGE',parent:null};
 globalThis.figma={currentPage:page,getNodeByIdAsync:async()=>({id:'root',type:'FRAME',visible:true,parent:page})};
 const bridge=createV3AuditBridge({data:{open:async()=>{throw Error('AUDIT_PACKAGE_MISSING');}},pluginVersion:'test',post:m=>posts.push(m),readRevision:()=>1,isUnavailable:()=>false});
 bridge.accept({type:'v3-audit-run',schemaVersion:'apollo.v3-audit-bridge.v1',requestId:'missing-package',rootIds:['root'],kind:'components',channel:'Desktop',pageType:null,shellAuditEnabled:false});
 await new Promise(setImmediate);assert(!posts.some(m=>m.type==='v3-audit-result'));assert.equal(posts.at(-1).code,'AUDIT_PACKAGE_MISSING');delete globalThis.figma;
});

// A hashed synthetic Proxy package goes through the actual native entry, not a
// mocked evaluator. The captured View and catalog agree, so only loaded policy
// can identify the forbidden API value.
const hash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');
function policyRow(coverage='required') {
 const aliases=['Example'],figmaKeys=[key];
 return {indexEntry:{componentKey:'example',packageName:'Example',packagePath:'examples/Example',coverage,figmaKeys,sourceCatalogPath:'components/example.json',artifacts:coverage==='none'?{}:{generatedContract:'api.json',rules:'rules.json',composition:'composition.json'}},aliases,
  loadedArtifacts:{generatedContract:false,rules:false,composition:false,overrides:false,agentContext:false,auditMapping:false},
  apiEntry:null,rulesEntry:null,compositionEntry:null,agentContext:null,auditMapping:null};
}
function loadedPolicy() {
 const row=policyRow();Object.assign(row.loadedArtifacts,{generatedContract:true,rules:true,composition:true});
 row.apiEntry={packageComponentKey:'example',aliases:row.aliases,figmaKeys:[key],contracts:[{id:'example-api',name:'Example',normalizedName:'example',componentKey:key,status:'current',role:'Main',platform:'Desktop',figma:{variants:{variantKeys:[],properties:{View:['Primary']},allowedCombinations:[]}}}]};
 row.compositionEntry={contract:{contracts:[]},aliases:row.aliases};
 return row;
}
function syntheticNative() {
 const page={id:'page',name:'Synthetic Page',type:'PAGE',parent:null,children:[]};
 const main={id:'main',key,name:'Example',type:'COMPONENT',remote:true,parent:page,children:[]};
 const node={id:'instance',name:'Example',type:'INSTANCE',visible:true,parent:page,children:[],overrides:[],variantProperties:{View:'Forbidden'},componentProperties:{View:{type:'VARIANT',value:'Forbidden'}},getMainComponentAsync:async()=>main};page.children=[node];
 globalThis.figma={mixed:Symbol('mixed'),currentPage:page,currentUser:{id:null,name:'Synthetic'},root:{name:'Synthetic'},editorType:'figma',importComponentByKeyAsync:async()=>main,variables:{getVariableCollectionByIdAsync:async()=>null},getNodeByIdAsync:async id=>id===node.id?node:null};return node;
}
function syntheticData(packages,defaultPolicy='none') {
 const protocol=require('../src/v3-audit/protocol'),base='https://ackedze.github.io/design-system_ab/JSONS/',entryUrl=base+'referenceSourcesMVP.json',policyUrl=base+'apollo/v3-audit-policies.json';
 const documents=[
  [entryUrl,{schemaVersion:2,baseUrl:base,apollo:{patternRulesPath:'apollo/patterns.json'},catalogs:[{fileName:'tokens.json',path:'tokens/tokens.json',source:{kind:'tokens'}},{fileName:'styles.json',path:'styles/styles.json',source:{kind:'styles'}},{fileName:'example.json',path:'components/example.json',source:{kind:'components',indexPath:'components/example.index.json'}}]}],
  [base+'apollo/patterns.json',{schemaVersion:1,rules:[]}],
  [base+'tokens/tokens.json',{meta:{fileName:'tokens.json'},collections:[{id:'collection',key:'c'.repeat(40),name:'Colors',variables:[{id:'token',key:other,name:'Color',resolvedType:'COLOR',valuesByMode:{default:{r:0,g:0,b:0,a:1}}}]}]}],
  [base+'styles/styles.json',{styles:[]}],
  [base+'components/example.index.json',{catalogPath:'components/example.json',components:[{key,name:'Example'}]}],
  [base+'components/example.json',{meta:{fileName:'example.json',library:'Synthetic Library'},components:[{key,name:'Example',status:'current',platform:'Desktop',role:'Main',structure:[{id:1,parentId:null,path:'Example',name:'Example',type:'COMPONENT',visible:true,componentInstance:{componentKey:key,variantProperties:{View:'Forbidden'}}}]}]}],
  [policyUrl,{schemaVersion:'apollo.v3-audit-policies.v1',coverage:{defaultPolicy},packages}]
 ];
 for(const category of ['deprecated','scheduled','parts'])documents.push([base+'indexes/lifecycle/'+category+'.index.json',{kind:'component-lifecycle-index',version:1,category,count:0,components:[],warnings:[]}]);
 const assets=new Map(),files=documents.map(([url,value])=>{const text=JSON.stringify(value),id=hash(url);assets.set(id,text);return{id,sha256:hash(text),bytes:Buffer.byteLength(text),urls:[url]};});
 const body={schemaVersion:protocol.SCHEMA,entryUrl,policyFileId:hash(policyUrl),files},manifest=Object.assign({},body,{dataId:hash(protocol.canonical(body))});
 return load('data-client.ts').createAuditDataClient({hashText:hash,loadManifest:async()=>structuredClone(manifest),readAsset:async(dataId,fileId)=>({dataId,fileId,sha256:hash(assets.get(fileId)),text:assets.get(fileId)})});
}
async function actualAudit(packages,defaultPolicy,changeNative=()=>{}) {
 const runtime=load('entry.ts'),node=syntheticNative();changeNative(node);
 return runtime.runV3Audit({runId:'policy-control',channel:'Desktop',pageType:null,shellAuditEnabled:false,pluginVersion:'test',selection:[node],data:syntheticData(packages,defaultPolicy),assertCurrent(){},onProgress(){}});
}
test('actual audit refuses absent or unread required rules, while preserving loaded-empty and explicit none',async()=>{
 const oldFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('NETWORK_FORBIDDEN');};
 try {
  await assert.rejects(actualAudit([]),/AUDIT_RULE_INDEX_UNAVAILABLE/);
  await assert.rejects(actualAudit([policyRow()]),/AUDIT_REQUIRED_RULE_ARTIFACT_UNAVAILABLE/);
  const unread=loadedPolicy();unread.loadedArtifacts.rules=false;
  await assert.rejects(actualAudit([unread]),/AUDIT_REQUIRED_RULE_ARTIFACT_UNAVAILABLE/);
  const noApi=loadedPolicy();noApi.apiEntry=null;
  await assert.rejects(actualAudit([noApi]),/AUDIT_REQUIRED_RULE_ARTIFACT_UNAVAILABLE/);
  const noComposition=loadedPolicy();noComposition.compositionEntry=null;
  await assert.rejects(actualAudit([noComposition]),/AUDIT_REQUIRED_RULE_ARTIFACT_UNAVAILABLE/);
  const optionalUnread=loadedPolicy();optionalUnread.indexEntry.artifacts.overrides='overrides.json';
  await assert.rejects(actualAudit([optionalUnread]),/AUDIT_REQUIRED_RULE_ARTIFACT_UNAVAILABLE/);
  const unmatched=policyRow('none');unmatched.indexEntry.figmaKeys=[other];unmatched.aliases=['Other'];
  await assert.rejects(actualAudit([unmatched],'required'),/AUDIT_REQUIRED_RULE_PACKAGE_MISSING/);
  const positive=await actualAudit([loadedPolicy()]);
  const items=Object.values(positive.checkState.relevanceBuckets).flat();
  assert(items.flatMap(item=>item.diffs).some(diff=>diff.assessment?.reasonCode==='component-api-invalid-variant-value'));
  const exempt=await actualAudit([policyRow('none')]);
  assert.equal(exempt.report.summary.problemOccurrenceCount,0);
  assert.equal(calls,0);
 } finally {globalThis.fetch=oldFetch;delete globalThis.figma;}
});
test('actual nested and local-definition dependencies cannot bypass required policy coverage',async()=>{
 const nested=(node,parent)=>({id:'nested',name:'Nested uncovered',type:'INSTANCE',visible:true,parent,children:[],overrides:[],componentProperties:{},variantProperties:{},getMainComponentAsync:async()=>({id:'remote',key:other,name:'Nested uncovered',type:'COMPONENT',remote:true,children:[]})});
 try {
  await assert.rejects(actualAudit([loadedPolicy()],'required',node=>{node.children=[nested(node,node)];}),/AUDIT_REQUIRED_RULE_PACKAGE_MISSING/);
  await assert.rejects(actualAudit([loadedPolicy()],'required',node=>{
   const local={id:'local-definition',key,name:'Example',type:'COMPONENT',remote:false,parent:node.parent,children:[]};
   local.children=[nested(node,local)];node.getMainComponentAsync=async()=>local;
  }),/AUDIT_REQUIRED_RULE_PACKAGE_MISSING/);
 } finally {delete globalThis.figma;}
});
test('policy metadata retains V3 matching priority, ambiguity refusal and artifact identities',()=>{
 const rules=load('rules/runtimeContractRegistry.ts'),doc=packages=>({schemaVersion:'apollo.v3-audit-policies.v1',coverage:{defaultPolicy:'required'},packages});
 assert.throws(()=>rules.setNormalizedAuditPolicies({schemaVersion:'apollo.v3-audit-policies.v1',packages:[]}),/DATA_INVALID/);
 const row=loadedPolicy();rules.setNormalizedAuditPolicies(doc([row]));
 rules.assertAuditPolicyCoverage([{figmaKey:key},{sourceFile:'components/example.json'},{componentName:'Example'}]);
 const duplicate=structuredClone(row);duplicate.indexEntry.componentKey='second';duplicate.indexEntry.figmaKeys=[other];duplicate.indexEntry.sourceCatalogPath='components/second.json';duplicate.apiEntry.packageComponentKey='second';duplicate.apiEntry.figmaKeys=[other];duplicate.apiEntry.contracts[0].componentKey=other;
 rules.setNormalizedAuditPolicies(doc([row,duplicate]));
 assert.throws(()=>rules.assertAuditPolicyCoverage([{componentName:'Example'}]),/ALIAS_AMBIGUOUS/);
 rules.assertAuditPolicyCoverage([{figmaKey:key,componentName:'Example'}]);
 assert.throws(()=>rules.assertAuditPolicyCoverage([{figmaKey:'nested-uncovered'}]),/PACKAGE_MISSING/);
 const mismatched=loadedPolicy();mismatched.apiEntry.packageComponentKey='another-package';
 assert.throws(()=>rules.setNormalizedAuditPolicies(doc([mismatched])),/DATA_INVALID/);
 assert.throws(()=>rules.getRemoteComponentApiRegistry(),/DATA_UNAVAILABLE/);
 const wrongContract=loadedPolicy();wrongContract.apiEntry.contracts[0].componentKey=other;assert.throws(()=>rules.setNormalizedAuditPolicies(doc([wrongContract])),/DATA_INVALID/);
 const wrongKeys=loadedPolicy();wrongKeys.apiEntry.figmaKeys=[other];assert.throws(()=>rules.setNormalizedAuditPolicies(doc([wrongKeys])),/DATA_INVALID/);
});
test('cached native traversal delivers queued Stop before success and preserves the full no-cancel walk',async()=>{
 for(const cancel of [true,false]) {
  const node=syntheticNative();node.type='FRAME';delete node.getMainComponentAsync;delete node.componentProperties;delete node.variantProperties;
  const reads=new Uint8Array(30000);node.children=Array.from({length:reads.length},(_,i)=>({id:'child-'+i,type:'FRAME',name:'Frame '+i,visible:true,parent:node,get children(){reads[i]++;return[];}}));
  const posts=[];let queued=false,delivered=false,resolveTerminal;
  const terminal=new Promise(resolve=>resolveTerminal=resolve);
  const bridge=load('bridge.ts').createV3AuditBridge({data:syntheticData([policyRow('none')]),pluginVersion:'test',readRevision:()=>1,isUnavailable:()=>false,post(message){
   posts.push(message);
   if(cancel && message.progress?.stage==='components'&&!queued){queued=true;setTimeout(()=>{delivered=true;bridge.cancel();},0);}
   if(['v3-audit-result','v3-audit-error','v3-audit-cancelled'].includes(message.type))resolveTerminal(message);
  }});
  try {
   bridge.accept({type:'v3-audit-run',schemaVersion:'apollo.v3-audit-bridge.v1',requestId:'cached-tree',rootIds:[node.id],kind:'components',channel:'Desktop',pageType:null,shellAuditEnabled:false});
   const result=await terminal;assert.equal(bridge.busy(),false);
   assert.equal(result.type,cancel?'v3-audit-cancelled':'v3-audit-result');
   if(cancel){assert(queued&&delivered);assert(!posts.some(message=>message.type==='v3-audit-result'));}
   else assert(reads.every(count=>count>=3),'all children read by keys, audit and text capture');
  } finally {delete globalThis.figma;}
 }
});
test('snapshot and text capture yield to queued cancellation without dropping their no-cancel results',async()=>{
 const roots=Array.from({length:600},(_,i)=>({id:'text-'+i,type:'TEXT',name:'Label',visible:true,parent:null,characters:'Text '+i}));
 const {collectApolloTextFacts}=load('stats/textReport.ts');let stop=false;const guard=()=>{if(stop)throw Error('AUDIT_CANCELLED');};
 setTimeout(()=>{stop=true;},0);await assert.rejects(collectApolloTextFacts(roots,n=>n.name,async()=>null,guard),/AUDIT_CANCELLED/);
 assert.equal((await collectApolloTextFacts(roots,n=>n.name,async()=>null)).length,roots.length);
 const {snapshotTree}=load('structure/snapshot.ts');globalThis.figma={mixed:Symbol('mixed')};
 const root={id:'frame',type:'FRAME',name:'Root',visible:true,children:roots.map(n=>Object.assign({},n,{type:'FRAME',children:[]}))};stop=false;
 try {setTimeout(()=>{stop=true;},0);await assert.rejects(snapshotTree(root,new Set(),{throwIfCancelled:guard}),/AUDIT_CANCELLED/);
  const checked=new Set(),result=await snapshotTree(root,checked);assert.equal(result.length,601);assert.equal(checked.size,601);
 } finally {delete globalThis.figma;}
});
test('queued Stop reaches cached local definitions; a complete run still visits all source children',async()=>{
 for(const cancel of [true,false]) {
  const node=syntheticNative(),sourceReads=new Uint8Array(30000);
  const local={id:'local-definition',key,name:'Example',type:'COMPONENT',remote:false,parent:node.parent,children:[]};
  local.children=Array.from({length:sourceReads.length},(_,i)=>({id:'source-'+i,name:'Frame',type:'FRAME',visible:true,parent:local,get children(){sourceReads[i]++;return[];}}));node.getMainComponentAsync=async()=>local;
  let scheduled=false,delivered=false,resolveTerminal;const posts=[],terminal=new Promise(resolve=>resolveTerminal=resolve);
  const bridge=load('bridge.ts').createV3AuditBridge({data:syntheticData([loadedPolicy()]),pluginVersion:'test',readRevision:()=>1,isUnavailable:()=>false,post(message){
   posts.push(message);
   if(cancel&&message.progress?.stage==='components'&&!scheduled){scheduled=true;setTimeout(()=>{delivered=true;bridge.cancel();},0);}
   if(['v3-audit-result','v3-audit-error','v3-audit-cancelled'].includes(message.type))resolveTerminal(message);
  }});
  try {bridge.accept({type:'v3-audit-run',schemaVersion:'apollo.v3-audit-bridge.v1',requestId:'cached-local-definition',rootIds:[node.id],kind:'components',channel:'Desktop',pageType:null,shellAuditEnabled:false});
   const result=await terminal;assert.equal(bridge.busy(),false);assert.equal(result.type,cancel?'v3-audit-cancelled':'v3-audit-result');
   if(cancel){assert(scheduled&&delivered);assert(!posts.some(message=>message.type==='v3-audit-result'));}
   else assert(sourceReads.every(count=>count>=1),'all native source children inspected');
  } finally {delete globalThis.figma;}
 }
});
test('queued Stop also reaches the cached remote-dependency work queue without changing full counts',async()=>{
 const {walkLocalComponentDependencies}=load('services/localComponentDependencyAudit.ts');
 for(const cancel of [true,false]) {
  const main={id:'remote',type:'COMPONENT',remote:true},owner={id:'local',type:'COMPONENT',remote:false,children:Array.from({length:1000},(_,i)=>({id:'dependency-'+i,type:'INSTANCE',visible:true,main,children:[]}))};
  let count=0,stopped=false;
  const work=walkLocalComponentDependencies([owner],{getNodeId:n=>n.id,getNodeType:n=>n.type,getChildren:n=>n.children,getMainComponent:async n=>n.main,isRemoteComponent:n=>n.remote,isVisible:n=>n.visible!==false,dependencyConcurrency:4,throwIfCancelled(){if(stopped)throw Error('AUDIT_CANCELLED');},async onRemoteDependency(){count++;if(cancel&&count===1)setTimeout(()=>{stopped=true;},0);}});
  if(cancel){await assert.rejects(work,/AUDIT_CANCELLED/);assert(count<1000);}
  else {const result=await work;assert.equal(count,1000);assert.equal(result.ownerDefinitions,1);assert.equal(result.visitedSourceNodes,1000);assert.equal(result.remoteDependencies,1000);}
 }
});
