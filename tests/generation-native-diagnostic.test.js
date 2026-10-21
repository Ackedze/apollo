const test=require('node:test'),assert=require('node:assert/strict'),esbuild=require('esbuild'),path=require('node:path'),vm=require('node:vm');
const {fixture,hash,clone}=require("../packages/generation-core/tests/planning-fixtures.cjs");
function load(file){const code=esbuild.buildSync({entryPoints:[path.join(__dirname,"../src",file)],bundle:true,platform:'browser',format:'cjs',write:false}).outputFiles[0].text;const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports});return module.exports;}
const {createNativeDiagnostic}=load("generation/native/diagnostic.ts");
const {createNativeDiagnosticBridge}=load("generation/native/diagnostic-bridge.ts");
const {createNativeDiagnosticUi}=require("../src/native-diagnostic-ui");
function setup(kind='slot'){
 const f=fixture(),context=f.context,currentInputs={version:1,synthetic:true},producer={currentRegistryDigest:hash('registry'),currentInputsDigest:hash(currentInputs),basisRegistryDigest:hash('basis'),lockHash:hash('lock')};
 context.registry.source={schemaVersion:'apollo.arui-private-mappings.v1',version:'1.1.0',digest:producer.currentRegistryDigest,lockHash:producer.lockHash,producerInputs:{basisRegistryDigest:producer.basisRegistryDigest,currentInputsDigest:producer.currentInputsDigest,currentInputs},contracts:[],mappingArtifacts:[]};
 const observation={schemaVersion:'apollo.code-connect-observation.v1-experimental',status:'availability-pass',targetProduct:'apollo-v4',fullContractParity:'not-confirmed',registryDigest:producer.currentRegistryDigest,lockHash:producer.lockHash,specHash:hash(f.spec),codeHash:hash(context.code),inputObservation:{version:1,basisRegistryDigest:producer.basisRegistryDigest,currentRegistryDigest:producer.currentRegistryDigest,currentInputsDigest:producer.currentInputsDigest,codeRepresentations:'draft',acceptance:'not-run',proofScope:'source-api-freshness-only'},stateReceipts:f.spec.states.values.map(state=>({state,preparedHash:hash(state)}))};
 observation.receiptHash=hash(observation);context.producerObservation=observation;
 let epoch=0,reads=0;const calls=[];const forbidden=()=>{calls.push('mutation');throw Error('MUTATION_FORBIDDEN');};
 const page={id:'synthetic-page',type:'PAGE',removed:false,parent:null,selection:[]};
 const set={id:'synthetic-set',type:'COMPONENT_SET',key:'synthetic-group-set',parent:page,visible:true};
 const main={id:'synthetic-main',name:'informational',type:'COMPONENT',key:kind==='slot'?'synthetic-content-key':'synthetic-group-variant',parent:kind==='slot'?page:set,remote:false,visible:true,removed:false,children:[],variantProperties:kind==='slot'?null:{Size:'synthetic-size',Overflow:'false'},componentPropertyDefinitions:{'synthetic-slot#1:2':{type:'SLOT'}}};
 const root={id:'synthetic-owner',name:'unrelated name',type:'INSTANCE',parent:page,visible:true,removed:false,children:[],componentProperties:{'synthetic-slot#1:2':{type:'SLOT',value:''}},getMainComponentAsync:async()=>main,setProperties:forbidden,remove:forbidden};
 const slot={id:'Isynthetic-owner;synthetic-source-slot',name:'never-used-name',type:'SLOT',parent:root,visible:true,children:[],componentPropertyReferences:{slotContentId:'synthetic-slot#1:2'},limitViolations:[],appendChild:forbidden,insertChild:forbidden,resetSlot:forbidden,remove:forbidden};
 const sourceSlot=Object.assign({},slot,{id:'synthetic-source-slot',parent:main});main.children=[sourceSlot];root.children=[slot];page.selection=[root];
 const recipe={mappingId:kind==='slot'?'content':'group',componentId:'synthetic-component',platform:'desktop',source:{revision:1,archiveSha256:hash('zip'),manualSourceHash:hash('manual'),compiledHash:hash('compiled'),factsHash:hash('facts'),sourceStatus:kind==='slot'?'ready':'draft'},representation:{componentKey:kind==='slot'?main.key:set.key,componentSetKey:kind==='slot'?null:set.key},definition:{selectedVariants:kind==='slot'?[]:[{componentKey:main.key,properties:clone(main.variantProperties)}]},slot:kind==='slot'?{targetId:'synthetic-body',propertyIdentity:'synthetic-slot#1:2',sourceNodeId:null}:null,actions:null};
 if(kind==='group'){
  root.children=[];main.children=[];recipe.actions={occurrences:[]};
  for(let i=0;i<4;i++){
   const id='synthetic-source-child-'+i,childSet={type:'COMPONENT_SET',key:'synthetic-button-set'},childMain={id:'synthetic-button-main-'+i,key:'synthetic-button-variant',type:'COMPONENT',parent:childSet,removed:false};
   const child={id:'Isynthetic-owner;'+id,name:'same arbitrary label',type:'INSTANCE',parent:root,visible:i!==1,children:[],removed:false,componentProperties:{'synthetic-label#1:2':{type:'TEXT',value:'Synthetic'},DisabledState:{type:'VARIANT',value:'False'},View:{type:'VARIANT',value:'Secondary'}},getMainComponentAsync:async()=>childMain,setProperties:forbidden};
   root.children.push(child);main.children.push(Object.assign({},child,{id,parent:main}));
   recipe.actions.occurrences.push({targetId:'synthetic-target-'+i,componentSetKey:childSet.key,sourceAddresses:[{variantKey:main.key,sourceNodeId:id,symbolId:null}],properties:[{property:'synthetic-label#1:2',propertyType:'TEXT'},{property:'DisabledState',propertyType:'VARIANT'},{property:'View',propertyType:'VARIANT'}]});
  }
 }
 const inputs={version:1,scope:'read-only-native-observation',producer,recipes:[recipe],probeSpec:f.spec,runtimeSha256:context.view.lock.runtime.runtimeSha256,recipeHash:hash([recipe]),buildRecipeSha256:hash('build'),typingsVersion:'synthetic',accepted:false};
 const state={context,inputs,page,root,main,slot,calls,get reads(){return reads;},bump(){epoch++;}};
 state.api={get currentPage(){return page;},get fileKey(){return state.fileKey;}};state.reader=createNativeDiagnostic({api:state.api,hash,inputs,buildInputsSha256:context.view.lock.runtime.buildInputsSha256,readContext:async()=>{reads++;state.readHook?.(reads);return clone(context);},epoch:()=>epoch,observer:()=>state.observerOverride||({status:'available',scope:'current-page-nodechange',pageId:page.id,coverage:'page-node-events-only',otherPages:'not-observed',styles:'not-observed',cleanup:'confirmed'})});return state;
}
test('native SLOT exact property uses complete observed order without invoking any write API or granting capability',async()=>{
 const s=setup();s.slot.children=[{id:'synthetic-a',type:'TEXT'},{id:'synthetic-b',type:'INSTANCE'}];const r=await s.reader.run();
 assert.equal(r.read,'observed');assert.equal(s.reads,2);assert.equal(r.provenance,'observed-not-accepted');assert.equal(r.mutation,'not-run');assert.equal(r.acceptance,'not-run');assert.equal(r.runtimeCapability,'unknown');assert.equal(r.observations[0].slot.content.complete,true);assert.deepEqual(Array.from(r.observations[0].slot.content.children,c=>c.id),['synthetic-a','synthetic-b']);assert.equal(r.observations[0].slot.content.planOrderMatch,'unknown');assert.deepEqual(s.calls,[]);
});
test('empty is only an actual complete read; no declaration or omitted list can supply empty proof',async()=>{
 const s=setup();const r=await s.reader.run();assert.equal(r.observations[0].slot.content.emptyObserved,true);Object.defineProperty(s.slot,'children',{get(){throw Error('unreadable');}});const q=await s.reader.run();assert.equal(q.observations[0].slot.content.complete,false);assert.equal(q.observations[0].slot.content.emptyObserved,null);
});
test('name/index fallback, wrong owner property type, ambiguous slot or missing reference are rejected',async()=>{
 for(const mutate of [s=>s.slot.componentPropertyReferences={},s=>s.root.componentProperties['synthetic-slot#1:2'].type='TEXT',s=>s.root.children.push(Object.assign({},s.slot,{id:'other-slot'})),s=>s.slot.parent=s.page]){
  const s=setup();mutate(s);const r=await s.reader.run();assert.equal(r.read,'not-run');assert.ok(r.diagnostics.includes('NATIVE_DIAGNOSTIC_SLOT_IDENTITY_UNKNOWN'));assert.deepEqual(s.calls,[]);
 }
});
test('bounded content keeps omissions and unmapped/duplicate members explicit',async()=>{
 const s=setup();s.slot.children=Array.from({length:129},(_,i)=>({id:'synthetic-content-'+i,type:'TEXT'}));let r=await s.reader.run();assert.equal(r.observations[0].slot.content.complete,false);assert.equal(r.observations[0].slot.content.children.length,128);assert.equal(r.observations[0].slot.content.emptyObserved,null);
 s.slot.children=[{id:'same',type:'TEXT'},{id:'same',type:'TEXT'}];r=await s.reader.run();assert.equal(r.observations[0].slot.content.complete,false);assert.ok(r.diagnostics.includes('NATIVE_DIAGNOSTIC_SLOT_DUPLICATE'));
});
test('stale registry/build pins cannot read or export actual node observations',async()=>{
 for(const mutate of [s=>s.context.registry.source.digest=hash('other'),s=>s.context.view.lock.runtime.buildInputsSha256=hash('other'),s=>s.context.registry.source.producerInputs.currentInputs.extra='changed']){const s=setup();mutate(s);const r=await s.reader.run();assert.equal(r.read,'not-run');assert.equal(r.observations.length,0);assert.ok(r.diagnostics.includes('NATIVE_DIAGNOSTIC_INPUTS_STALE'));}
});
test('removed/page/selection/revision drift after async reads stays incomplete',async()=>{
 for(const mutate of [s=>s.root.removed=true,s=>s.page.selection=[],s=>s.page.removed=true,s=>s.bump()]){const s=setup();s.root.getMainComponentAsync=async()=>{mutate(s);return s.main;};const r=await s.reader.run();assert.ok(r.diagnostics.includes('NATIVE_DIAGNOSTIC_STALE'));assert.equal(r.observations.length,0);}
});
test('BG local canonical correspondence preserves four targets/hidden middle; remote source symbols remain unknown',async()=>{
 const s=setup('group');let r=await s.reader.run();assert.equal(r.read,'observed');assert.deepEqual(Array.from(r.observations[0].owned.children,c=>c.targetId),['synthetic-target-0','synthetic-target-1','synthetic-target-2','synthetic-target-3']);assert.equal(r.observations[0].owned.children[1].effectiveVisible,false);assert.equal(r.observations[0].owned.symbolProof,'unknown');assert.equal(r.observations[0].source.sourceStatus,'draft');assert.deepEqual(s.calls,[]);
 s.main.remote=true;r=await s.reader.run();assert.ok(r.observations[0].owned.children.every(c=>c.targetId===null&&c.sourceIdentity===null));assert.ok(r.diagnostics.includes('NATIVE_DIAGNOSTIC_OWNED_CORRESPONDENCE_UNKNOWN'));
});
test('BG wrong variant or replaced/unmapped owned child cannot gain source equivalence',async()=>{
 const s=setup('group');s.main.variantProperties.Size='other';let r=await s.reader.run();assert.ok(r.diagnostics.includes('NATIVE_DIAGNOSTIC_VARIANT_UNKNOWN'));s.main.variantProperties.Size='synthetic-size';s.root.children[0].getMainComponentAsync=async()=>({id:'foreign',key:'foreign',parent:{type:'COMPONENT_SET',key:'foreign'}});r=await s.reader.run();assert.equal(r.observations[0].owned.children[0].targetId,null);assert.ok(r.diagnostics.includes('NATIVE_DIAGNOSTIC_OWNED_CORRESPONDENCE_UNKNOWN'));
});
test('bridge request IDs and UI invalidation reject stale results, extra fields and concurrent runs',async()=>{
 const output=[];let release,calls=0;const bridge=createNativeDiagnosticBridge(m=>output.push(m),{run:()=>{calls++;return new Promise(r=>release=r);},invalidate(){}});
 const first=bridge.handle({type:'native-diagnostic-request',requestId:'native-diagnostic:1',spec:null});await bridge.handle({type:'native-diagnostic-request',requestId:'native-diagnostic:2'});assert.equal(output[0].error,'NATIVE_DIAGNOSTIC_BUSY');await bridge.handle({type:'native-diagnostic-request',requestId:'invalid'});await bridge.handle({type:'native-diagnostic-request',requestId:'native-diagnostic:3',handler:'injected'});assert.equal(calls,1);release({schemaVersion:'apollo.native-diagnostic-report.v1'});await first;assert.equal(output[1].requestId,'native-diagnostic:1');
 const sent=[],rendered=[],ui=createNativeDiagnosticUi(m=>sent.push(m),m=>rendered.push(m));ui.request(null);const old=sent[0].requestId;ui.invalidate();ui.request(null);ui.accept({type:'native-diagnostic-result',requestId:old,report:{schemaVersion:'apollo.native-diagnostic-report.v1',provenance:'observed-not-accepted',mutation:'not-run',acceptance:'not-run',live:'not-run',runtimeCapability:'unknown',reportHash:hash('report')}});assert.equal(ui.report(),null);assert.equal(ui.busy(),true);ui.accept({type:'native-diagnostic-result',requestId:sent[1].requestId,report:{schemaVersion:'apollo.native-diagnostic-report.v1',provenance:'observed-not-accepted',mutation:'not-run',acceptance:'not-run',live:'not-run',runtimeCapability:'unknown',reportHash:hash('report')}});assert.ok(ui.report());assert.equal(ui.busy(),false);
});

test('final owner-main/observed order changes and unknown limits do not invent capability or complete proof',async()=>{
 const s=setup();let count=0;s.root.getMainComponentAsync=async()=>++count===1?s.main:Object.assign({},s.main,{id:'changed-main'});let r=await s.reader.run();assert.ok(r.diagnostics.includes('NATIVE_DIAGNOSTIC_CAPTURE_CHANGED'));assert.equal(r.observations.length,0);
 const q=setup();q.slot.limitViolations=undefined;r=await q.reader.run();assert.equal(r.observations[0].slot.limitViolations,null);assert.ok(r.diagnostics.includes('NATIVE_DIAGNOSTIC_LIMITS_UNKNOWN'));assert.equal(r.runtimeCapability,'unknown');
 const u=createNativeDiagnosticUi(()=>{},()=>{});u.request(null);u.accept({type:'native-diagnostic-result',requestId:'native-diagnostic:1',report:{schemaVersion:'apollo.native-diagnostic-report.v1',acceptance:'accepted'}});assert.equal(u.report(),null);
});

test('BG missing/duplicate membership and child-main changes remain unknown or rejected',async()=>{
 const missing=setup('group');missing.root.children.pop();let r=await missing.reader.run();assert.equal(r.observations[0].owned.expectedOccurrencesComplete,false);assert.deepEqual(Array.from(r.observations[0].owned.unresolvedTargetIds),['synthetic-target-3']);assert.ok(r.diagnostics.includes('NATIVE_DIAGNOSTIC_OWNED_MEMBERSHIP_UNKNOWN'));
 const duplicate=setup('group');duplicate.root.children[1].id=duplicate.root.children[0].id;r=await duplicate.reader.run();assert.equal(r.observations[0].owned.expectedOccurrencesComplete,false);assert.ok(r.observations[0].owned.children.every(c=>c.targetId===null));
 const drift=setup('group');let reads=0;drift.root.children[0].getMainComponentAsync=async()=>({id:++reads===1?'before':'after',type:'COMPONENT',key:'synthetic-button-variant',parent:{type:'COMPONENT_SET',key:'synthetic-button-set'},removed:false});r=await drift.reader.run();assert.equal(r.observations.length,0);assert.ok(r.diagnostics.includes('NATIVE_DIAGNOSTIC_CAPTURE_CHANGED'));assert.deepEqual(drift.calls,[]);
});

const {observeDeclaredNativeProperties}=load("generation/native/properties.ts");
test('remote unmatched BG exposes only declared raw fields without promoting suffixes or canonical identity',async()=>{
 const s=setup('group');s.main.remote=true;
 s.root.children.forEach((node,index)=>{node.componentProperties['synthetic-label#1:2'].value='Independent synthetic label '+index;node.componentProperties.View.value=index===0?'Primary':'Secondary';node.componentProperties.DisabledState.value=index===2?'True':'False';node.componentProperties.undeclared={type:'TEXT',value:'must not be emitted'};});
 const r=await s.reader.run();assert.equal(r.schemaVersion,'apollo.native-diagnostic-report.v2');assert.equal(r.userNativeRead,'observed');assert.equal(r.mutation,'not-run');assert.equal(r.live,'not-run');
 for(const [index,node]of r.observations[0].owned.children.entries()){
  assert.equal(node.targetId,null);assert.equal(node.sourceIdentity,null);assert.equal(node.symbolId,null);assert.equal(node.properties.length,0);assert.equal(node.rawProperties.provenance,'observed-not-accepted');assert.equal(node.rawProperties.scope,'declared-api-observation-only');assert.equal(node.rawProperties.queryComplete,true);assert.equal(node.rawProperties.valuesComplete,true);assert.equal(node.rawProperties.typesMatch,true);assert.equal(node.rawProperties.fields.length,3);assert.equal(node.rawProperties.fields.find(f=>f.property==='synthetic-label#1:2').observed.value,'Independent synthetic label '+index);
 }
 assert.equal(r.observations[0].owned.expectedOccurrencesComplete,false);assert.deepEqual(s.calls,[]);
});
test('unmatched BG missing, wrong type and unreadable raw property never imply correspondence or full property proof',async()=>{
 const s=setup('group');s.main.remote=true;delete s.root.children[0].componentProperties.View;s.root.children[1].componentProperties.DisabledState.type='BOOLEAN';Object.defineProperty(s.root.children[2],'componentProperties',{get(){throw Error('unreadable');}});
 const r=await s.reader.run();assert.equal(r.read,'observed');const nodes=r.observations[0].owned.children;assert.equal(nodes[0].rawProperties.fields.find(f=>f.property==='View').readStatus,'missing');assert.equal(nodes[0].rawProperties.valuesComplete,false);assert.equal(nodes[1].rawProperties.typesMatch,false);assert.equal(nodes[2].rawProperties.queryComplete,false);assert.ok(nodes[2].rawProperties.fields.every(f=>f.readStatus==='unreadable'));assert.ok(nodes.every(n=>n.targetId===null));assert.ok(r.diagnostics.includes('NATIVE_DIAGNOSTIC_OWNED_RAW_PROPERTIES_INCOMPLETE'));assert.deepEqual(s.calls,[]);
});
test('unmatched raw property changes during async child-main recheck are discarded',async()=>{
 const s=setup('group');s.main.remote=true;const getMain=s.root.children[0].getMainComponentAsync;let calls=0;s.root.children[0].getMainComponentAsync=async()=>{if(++calls===2)s.root.children[0].componentProperties.View.value='Primary';return getMain();};const r=await s.reader.run();assert.equal(r.observations.length,0);assert.ok(r.diagnostics.includes('NATIVE_DIAGNOSTIC_CAPTURE_CHANGED'));
});
test('declared property query separates absence/unreadability/type ambiguity and bounds values/field count',()=>{
 const node={componentProperties:{Label:{type:'TEXT',value:'x'.repeat(8193)},Broken:{type:'TEXT',value:42},Ambiguous:{type:'BOOLEAN',value:false}}};const declarations=[{property:'Label',propertyType:'TEXT'},{property:'Missing',propertyType:'VARIANT'},{property:'Broken',propertyType:'TEXT'},{property:'Ambiguous',propertyType:'TEXT'},{property:'Ambiguous',propertyType:'BOOLEAN'}];let r=observeDeclaredNativeProperties(node,declarations);assert.equal(r.fields[0].valueStatus,'omitted');assert.equal(r.fields[0].observed.value,null);assert.equal(r.fields[0].observed.characters,8193);assert.equal(r.fields[1].readStatus,'missing');assert.equal(r.fields[2].valueStatus,'unknown');assert.equal(r.fields[3].typeStatus,'ambiguous');assert.equal(r.queryComplete,true);assert.equal(r.valuesComplete,false);assert.equal(r.typesMatch,false);
 Object.defineProperty(node.componentProperties,'Label',{get(){throw Error('field-unreadable');}});r=observeDeclaredNativeProperties(node,declarations);assert.equal(r.fields[0].readStatus,'unreadable');assert.equal(r.queryComplete,false);
 r=observeDeclaredNativeProperties(node,[]);assert.equal(r.valuesComplete,false);assert.equal(r.queryComplete,false);
 r=observeDeclaredNativeProperties(node,Array.from({length:13},(_,i)=>({property:'Synthetic-'+i,propertyType:'TEXT'})));assert.equal(r.fields.length,12);assert.equal(r.declarationsComplete,false);assert.equal(r.declarationsTotal,13);assert.equal(r.queryComplete,false);
});

function sourceFixture(variant=false){
 const s=setup('slot'),property='synthetic-slot#1:2';
 s.page.parent={id:'synthetic-document',type:'DOCUMENT',parent:null,removed:false};s.page.selection=[s.main];
 s.fileKey='synthetic-original-file';s.main.componentPropertyReferences={};
 s.definitions={[property]:{type:'SLOT',defaultValue:'',description:'Synthetic source definition',slotSettings:{minChildren:0,maxChildren:2,displayEmptyByDefault:true,stretchChildOnInsert:false,allowPreferredValuesOnly:false}}};
 s.property=property;s.sourceSlot=s.main.children[0];s.sourceSlot.removed=false;s.variantGetterReads=0;
 if(variant){
  s.propertyOwner={id:'synthetic-content-set',type:'COMPONENT_SET',key:'synthetic-content-set-key',remote:false,removed:false,parent:s.page,children:[s.main],componentPropertyDefinitions:s.definitions};
  s.main.parent=s.propertyOwner;s.main.variantProperties={Layout:'Synthetic'};
  Object.defineProperty(s.main,'componentPropertyDefinitions',{get(){s.variantGetterReads++;throw Error('Variant definitions belong to parent set');}});
 }else{s.propertyOwner=s.main;s.main.componentPropertyDefinitions=s.definitions;}
 return s;
}
test('original source diagnostic preserves complete raw definition/reference/settings and self property owner without writer acceptance',async()=>{
 const s=sourceFixture(),r=await s.reader.run(),v=r.observations[0].originalSource;
 assert.equal(r.read,'observed');assert.equal(r.status,'incomplete');assert.equal(v.propertyIdentity,s.property);assert.equal(v.propertyOwner.id,s.main.id);assert.equal(v.propertyOwner.type,'COMPONENT');assert.equal(v.propertyOwner.relation,'self');
 assert.deepEqual(clone(v.rawPropertyDefinition),s.definitions[s.property]);assert.deepEqual(clone(v.slot.rawComponentPropertyReferences),s.sourceSlot.componentPropertyReferences);assert.deepEqual(clone(v.slotSettings.value),s.definitions[s.property].slotSettings);
 assert.deepEqual(Array.from(v.ownerChain,n=>n.type),['COMPONENT','PAGE','DOCUMENT']);assert.equal(v.directChildrenComplete,true);assert.equal(v.slot.directContentComplete,true);assert.equal(v.fileContext.fileKey,s.fileKey);
 assert.equal(v.accepted,false);assert.equal(v.canonicalSourceIdentity,null);assert.equal(v.propertyOwner.identityAcceptance,'unknown');assert.equal(v.Ready,false);assert.deepEqual(s.calls,[]);
});
test('variant source diagnostic uses parent COMPONENT_SET without touching the throwing COMPONENT definition getter',async()=>{
 const s=sourceFixture(true),r=await s.reader.run(),v=r.observations[0].originalSource;
 assert.equal(r.read,'observed');assert.equal(s.variantGetterReads,0);assert.equal(v.propertyOwner.id,s.propertyOwner.id);assert.equal(v.propertyOwner.type,'COMPONENT_SET');assert.equal(v.propertyOwner.key,s.propertyOwner.key);assert.equal(v.propertyOwner.componentId,s.main.id);assert.equal(v.propertyOwner.relation,'parent-component-set');
 assert.deepEqual(clone(v.rawPropertyDefinition),s.definitions[s.property]);assert.deepEqual(Array.from(v.ownerChain,n=>n.type),['COMPONENT','COMPONENT_SET','PAGE','DOCUMENT']);assert.deepEqual(s.calls,[]);
});
test('wrong or unavailable variant property owner cannot provide source evidence',async()=>{
 for(const change of [s=>s.propertyOwner.remote=true,s=>s.propertyOwner.removed=true,s=>delete s.definitions[s.property],s=>s.definitions[s.property].type='TEXT',s=>s.propertyOwner.type='FRAME',s=>Object.defineProperty(s.propertyOwner,'componentPropertyDefinitions',{get(){throw Error('unavailable');}})]){
  const s=sourceFixture(true);change(s);const r=await s.reader.run();assert.equal(r.read,'not-run');assert.equal(r.observations.length,0);assert.equal(r.acceptance,'not-run');assert.deepEqual(s.calls,[]);
 }
});
test('raw source definition and property-owner drift after async work discard the observation',async()=>{
 for(const change of [s=>s.definitions[s.property].description='changed',s=>s.definitions[s.property].slotSettings.maxChildren=3,s=>s.propertyOwner.id='changed-owner',s=>s.propertyOwner.key='changed-key',s=>s.main.parent=Object.assign({},s.propertyOwner,{id:'other-owner'}),s=>s.bump()]){
  const s=sourceFixture(true);s.readHook=n=>{if(n===2)change(s);};const r=await s.reader.run();assert.equal(r.read,'not-run');assert.equal(r.observations.length,0);assert.equal(r.acceptance,'not-run');assert.deepEqual(s.calls,[]);
 }
});
test('missing or withheld source fileKey stays unknown/incomplete without inferred provenance',async()=>{
 for(const withheld of [false,true]){const s=sourceFixture(true);s.fileKey=undefined;if(withheld)Object.defineProperty(s.api,'fileKey',{get(){throw Error('withheld');}});const r=await s.reader.run();assert.equal(r.read,'observed');assert.equal(r.status,'incomplete');assert.equal(r.observations[0].originalSource.fileContext.fileKey,null);assert.equal(r.observations[0].originalSource.fileContext.readStatus,'unknown');assert.ok(r.diagnostics.includes('NATIVE_DIAGNOSTIC_SOURCE_FILE_CONTEXT_UNKNOWN'));assert.equal(r.acceptance,'not-run');assert.deepEqual(s.calls,[]);}
});
test('source file context becoming unknown between captures discards the observation',async()=>{
 const s=sourceFixture(true);s.readHook=n=>{if(n===2)s.fileKey=undefined;};const r=await s.reader.run();assert.equal(r.read,'not-run');assert.equal(r.observations.length,0);assert.ok(r.diagnostics.includes('NATIVE_DIAGNOSTIC_CAPTURE_CHANGED'));assert.deepEqual(s.calls,[]);
});
test('source property-owner ancestry and observer must cover the actual current PAGE',async()=>{
 for(const change of [s=>s.propertyOwner.parent={id:'foreign-page',type:'PAGE',removed:false,parent:s.page.parent},s=>s.observerOverride={status:'available',scope:'current-page-nodechange',pageId:'foreign-page'}]){
  const s=sourceFixture(true);change(s);const r=await s.reader.run();assert.equal(r.read,'not-run');assert.equal(r.observations.length,0);assert.deepEqual(s.calls,[]);
 }
});
test('INSTANCE diagnostic with variant main does not read definition getters or append original-source fields',async()=>{
 const s=sourceFixture(true);s.page.selection=[s.root];const first=await s.reader.run();Object.defineProperty(s.propertyOwner,'componentPropertyDefinitions',{get(){throw Error('INSTANCE must not read definitions');}});const second=await s.reader.run();
 assert.equal(second.read,'observed');assert.equal(JSON.stringify(second),JSON.stringify(first));assert.equal(second.observations[0].originalSource,undefined);assert.equal(s.variantGetterReads,0);assert.deepEqual(s.calls,[]);
});
