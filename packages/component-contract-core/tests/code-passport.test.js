const test=require('node:test'),assert=require('node:assert/strict'),core=require('../dist/core.cjs');
const {fixture}=require('./helpers/asset-identity-lock.cjs'),{scenario}=require('./helpers/direct-code-group.cjs'),{passport,ownBindings,clone}=require('./helpers/code-passport.cjs');
const errors=m=>core.validateManualSource(m).filter(i=>i.code==='REPRESENTATION_CODE_BINDING');
test('API evidence stays independent of predicate Ready and profile parity; versions opt in without legacy wire drift',()=>{
 const f=fixture(core),before=clone(f.compile().contract);passport(f.manual);const compiled=f.compile();
 assert.equal(errors(f.manual).length,0);assert.equal(compiled.contract.status,before.status);assert.equal(compiled.contract.runtimePolicy.representationEvidenceVersion,1);assert.equal(compiled.contract.runtimePolicy.crossRepresentationBindingsVersion,undefined);assert.equal(compiled.contract.package.sourceExportVersion,'component-contract-editor@0.2.91');
 assert.deepEqual(compiled.contract.rules.map(r=>r.assert),before.rules.map(r=>r.assert));assert.equal(f.manual.representations.at(-1).codeEvidence.parity.status,'not-confirmed');
 const legacy=fixture(core).compile().contract;assert.equal(legacy.runtimePolicy.representationEvidenceVersion,undefined);
 const future=clone(legacy);future.runtimePolicy.representationEvidenceVersion=2;assert.throws(()=>core.prepareValidationSnapshot(f.snapshot,future),/REPRESENTATION_RUNTIME_UNSUPPORTED/);assert.equal(core.stableHash(legacy),core.stableHash(before));
});
test('evidence rejects unknown versions, locator drift, receipt-free acceptance and nonexistent profile claims',()=>{
 for(const mutate of [e=>e.version=2,e=>e.sourcePin.commit='d'.repeat(40),e=>e.availability.evidenceRefs=[],e=>e.availability.evidenceRefs[0].path='../foreign',e=>e.acceptance.status='accepted',e=>e.publication.status='published',e=>Object.assign(e.parity,{status:'accepted-for-profile',profileIds:['missing'],unresolvedGapIds:[]}),e=>e.parity=null,e=>e.sourcePin.extra='untrusted']){
  const f=fixture(core),r=passport(f.manual);mutate(r.codeEvidence);assert.ok(errors(f.manual).length);
 }
});
test('closed enum transform covers the exact semantic domain and rejects free transformations',()=>{
 const f=fixture(core);passport(f.manual);f.manual.semanticApi=[{id:'size',kind:'variant',valueType:'enum',domain:['32','56'],bindings:[{representationId:'code',path:'props.size',codeTransform:{version:1,id:'enum-map',entries:[{from:'32',to:32},{from:'56',to:56}]}}]}];
 assert.equal(errors(f.manual).length,0);assert.equal(core.applyCodeTransform('56',f.manual.semanticApi[0].bindings[0].codeTransform),56);
 const scope=core.representationScopeHash(f.manual,f.evidence);f.manual.representations.at(-1).codeEvidence.availability.evidenceRefs[0].sha256='d'.repeat(64);f.manual.metadata.revision++;f.manual.metadata.updatedAt='2026-10-06T00:00:00Z';assert.equal(core.representationScopeHash(f.manual,f.evidence),scope);
 f.manual.semanticApi[0].bindings[0].codeTransform.entries.pop();assert.ok(errors(f.manual).length);assert.notEqual(core.representationScopeHash(f.manual,f.evidence),scope);
 f.manual.semanticApi[0].bindings[0].codeTransform={version:2,id:'identity'};assert.ok(errors(f.manual).length);
 f.manual.semanticApi[0].bindings[0].codeTransform={version:1,id:'eval'};assert.ok(errors(f.manual).length);
});
test('owned fields require exact target/direct dependency/source addresses and preserve legacy target rejection',()=>{
 const f=ownBindings(scenario());assert.equal(errors(f.manual).length,0);const c=core.compileManualSource(f.manual,f.evidence,[f.childContract]);assert.ok(!c.issues.some(i=>i.level==='error'),JSON.stringify(c.issues));assert.equal(c.contract.runtimePolicy.crossRepresentationBindingsVersion,1);assert.equal(c.contract.runtimePolicy.semanticTargetVisibilityVersion,undefined);
 const bad=clone(c.contract);bad.runtimePolicy.crossRepresentationBindingsVersion=2;assert.throws(()=>core.prepareValidationSnapshot(f.snapshot,bad),/REPRESENTATION_RUNTIME_UNSUPPORTED/);
 for(const mutate of [b=>b.ownedOccurrence.version=2,b=>b.ownedOccurrence.dependencyBindingId='missing',b=>b.ownedOccurrence.collectionResolver.ordering='ordinal',b=>b.ownedOccurrence.transformId='arbitrary-handler',b=>b.targetId='foreign',b=>b.transform='identity']){const m=clone(f.manual);mutate(m.semanticApi[0].bindings[0]);assert.ok(errors(m).length);}
 const duplicate=clone(f.manual);duplicate.semanticApi[0].bindings.push(clone(duplicate.semanticApi[0].bindings[0]));assert.ok(errors(duplicate).length);
 const m=clone(f.manual);delete m.semanticApi[0].bindings[0].ownedOccurrence;assert.ok(core.validateManualSource(m).some(i=>i.code==='SEMANTIC_TARGET_BINDING'));
});
test('visible collection indices follow native order after hiding the middle; identity/visibility/order gaps block projection',()=>{
 const f=ownBindings(scenario()),c=core.compileManualSource(f.manual,f.evidence,[f.childContract]).contract;
 let r=core.projectOwnedCodeCollection(c,f.snapshot,'code');assert.deepEqual(r.elements.map(e=>e.targetId),['target-0','target-1','target-2','target-3']);assert.equal(r.primaryFirst,true);assert.equal(r.elements[2].disabled,true);
 f.snapshot.nodes[2].visible=false;r=core.projectOwnedCodeCollection(c,f.snapshot,'code');assert.deepEqual(r.elements.map(e=>e.targetId),['target-0','target-2','target-3']);assert.equal(r.elements[1].children,'Label 2');
 f.snapshot.nodes[0].childIds=['member-0','member-3','member-2','member-1'];r=core.projectOwnedCodeCollection(c,f.snapshot,'code');assert.deepEqual(r.elements.map(e=>e.targetId),['target-0','target-3','target-2']);
 for(const mutate of [s=>delete s.nodes[2].component.sourceIdentity,s=>s.nodes[2].component.identity.componentSetKey='foreign',s=>s.nodes[3].unknownFacts.push('visible'),s=>s.nodes[0].childIds.push('member-0'),s=>s.nodes[1].component.propertyTypes['Label#1:1']='VARIANT']){const s=clone(f.snapshot);mutate(s);assert.throws(()=>core.projectOwnedCodeCollection(c,s,'code'),/OWNED_CODE_COLLECTION_UNPROVEN/);}
 assert.equal(core.stableHash(f.snapshot),core.stableHash(clone(f.snapshot)));
});
test('native Body association names exact SLOT port and ordered policy; a layer name never becomes native proof',()=>{
 const f=fixture(core);passport(f.manual);f.manual.targets.push({id:'body',semanticRole:'body',label:'Body',lineage:[],resolution:'resolved'});
 f.manual.rules.push({id:'body-content',targetId:'body',targetScope:'self',capability:'composition.slot',permission:'allowed',controlPaths:[{kind:'slot-api',target:'body',property:'Body#1:1',contentOwnership:'external'}],constraints:[],applicability:{variants:'all',modes:'all',platforms:['desktop']},rationale:'Synthetic external native Body.',owner:'test-author',status:'reviewed',execution:{route:'policy-only'}});
 f.manual.semanticApi=[{id:'body',kind:'slot',valueType:'content',bindings:[{representationId:'desktop',path:'component.properties.Body#1:1'},{representationId:'code',path:'props.children',nativeSlotBinding:{version:1,figmaRepresentationId:'desktop',targetId:'body',propertyIdentity:'Body#1:1',propertyType:'SLOT',codeRepresentationId:'code',codePath:'props.children',contentPolicy:'preserve-ordered-content',proof:'trusted-native-capture'}}]}];
 assert.equal(errors(f.manual).length,0);
 for(const mutate of [n=>n.propertyType='TEXT',n=>n.propertyIdentity='Body',n=>n.targetId='missing',n=>n.contentPolicy='replace',n=>n.version=2,n=>n.proof='layer-name']){const m=clone(f.manual);mutate(m.semanticApi[0].bindings[1].nativeSlotBinding);assert.ok(errors(m).length);}
 const m=clone(f.manual);m.rules.at(-1).controlPaths=[];assert.ok(errors(m).length);
});

function mixedScenario(){
 const f=ownBindings(scenario());
 const childPath=Object.entries(f.snapshot.variantReference.nodeProperties).find(([p,v])=>p&&v.identity?.componentSetKey==='button-set')[0];
 f.manual.componentDependencies[0].bindings.push({kind:'fixed-nested-scoped',id:'scoped-extra',targetRole:'root',relativePath:'',ownerComponentSetKeys:['group-set'],activeVariant:{property:'Background',values:['True']},childPath,representationIds:['desktop']});
 f.snapshot.nodes[0].component.properties.Background='True';f.snapshot.nodes[0].component.propertyTypes.Background='VARIANT';
 f.snapshot.variantReference=core.captureVariantReference(clone(f.snapshot),'group-variant','group-set');
 const compiled=core.compileManualSource(f.manual,f.evidence,[f.childContract]);assert.equal(compiled.issues.filter(i=>i.level==='error').length,0);
 return {f,contract:compiled.contract};
}
test('owned fields preserve four projected values when combined with scoped dependencies',()=>{
 const plain=ownBindings(scenario()),legacy=core.compileManualSource(plain.manual,plain.evidence,[plain.childContract]).contract;
 const before=core.projectOwnedCodeCollection(legacy,plain.snapshot,'code'),{f,contract}=mixedScenario();
 assert.equal(legacy.runtimePolicy.crossRepresentationBindingsVersion,1);assert.equal(contract.runtimePolicy.crossRepresentationBindingsVersion,2);
 const after=core.projectOwnedCodeCollection(contract,f.snapshot,'code');assert.equal(after.elements.length,4);
 assert.deepEqual(after.elements,before.elements);assert.equal(after.primaryFirst,before.primaryFirst);
 f.snapshot.nodes[2].visible=false;assert.deepEqual(core.projectOwnedCodeCollection(contract,f.snapshot,'code').elements.map(e=>e.targetId),['target-0','target-2','target-3']);
 f.snapshot.nodes[0].childIds=['member-0','member-3','member-2','member-1'];
 assert.deepEqual(core.projectOwnedCodeCollection(contract,f.snapshot,'code').elements.map(e=>e.targetId),['target-0','target-3','target-2']);
});
test('mixed owned projection rejects absent, mismatched, future and malformed capabilities',()=>{
 const {f,contract}=mixedScenario();
 for(const version of [undefined,0,1,3]){const bad=clone(contract);bad.runtimePolicy.crossRepresentationBindingsVersion=version;assert.throws(()=>core.projectOwnedCodeCollection(bad,f.snapshot,'code'),/OWNED_CODE_COLLECTION_UNPROVEN: schema/);}
 for(const scope of [undefined,[],['missing'],['desktop','desktop']]){const bad=clone(contract);bad.componentDependencies[0].bindings.at(-1).representationIds=scope;assert.throws(()=>core.projectOwnedCodeCollection(bad,f.snapshot,'code'),/COMPONENT_DEPENDENCY_RUNTIME_UNSUPPORTED/);}
 const plain=ownBindings(scenario()),bad=core.compileManualSource(plain.manual,plain.evidence,[plain.childContract]).contract;
 bad.runtimePolicy.crossRepresentationBindingsVersion=2;assert.throws(()=>core.projectOwnedCodeCollection(bad,plain.snapshot,'code'),/OWNED_CODE_COLLECTION_UNPROVEN: schema/);
 const malformed=clone(contract);malformed.facts.semanticApi[0].bindings[0].ownedOccurrence.version=2;
 assert.throws(()=>core.projectOwnedCodeCollection(malformed,f.snapshot,'code'),/OWNED_CODE_COLLECTION_UNPROVEN: schema/);
});
test('mixed owned projection retains identity, visibility, typed capture and native ordering refusals',()=>{
 const {f,contract}=mixedScenario();
 for(const change of [s=>delete s.nodes[2].component.sourceIdentity,s=>s.nodes[2].component.identity.componentSetKey='foreign',s=>s.nodes[3].unknownFacts.push('visible'),s=>s.nodes[0].childIds.push('member-0'),s=>s.nodes[1].component.propertyTypes['Label#1:1']='VARIANT']){
  const snapshot=clone(f.snapshot);change(snapshot);assert.throws(()=>core.projectOwnedCodeCollection(contract,snapshot,'code'),/OWNED_CODE_COLLECTION_UNPROVEN/);
 }
});
