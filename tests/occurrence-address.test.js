const test=require('node:test'),assert=require('node:assert/strict');
const {auditContractSnapshot,loadRuntimeContract}=require("../dist/runtime.cjs");
const core=require("../packages/component-contract-core/dist/core.cjs");
const fixture=require("./fixtures");
const clone=x=>JSON.parse(JSON.stringify(x));

function scenario(){
 const contract=fixture.contract(),s=fixture.snapshot();contract.package.snapshotProfile='variant-facts-v4';
 contract.runtimePolicy.occurrenceAddressVersion=1;
 const shape=[{path:'',type:'ROOT'},{path:'@catalog:2',type:'INSTANCE'},{path:'@catalog:3',type:'INSTANCE'}],structureId=core.stableHash(shape);
 contract.facts.variantEvidence={schemaVersion:'apollo.variant-anatomy.v1',occurrenceAddressVersion:1,sourceHash:'b'.repeat(64),structures:{[structureId]:shape},
  variants:[{componentKey:'test-key',componentSetKey:'test-key',structureId,properties:{}}],
  occurrences:[{componentKey:'test-key',componentSetKey:'test-key',namesByPath:{'':'Test','@catalog:2':'Button','@catalog:3':'Button'}}]};
 contract.facts.targets.push({id:'button',semanticRole:'chosen-button',label:'Button',lineage:[],resolution:'resolved',
  pathHint:'Test / @catalog:3',variantHints:[{representationId:'figma',componentKey:'test-key',pathHint:'Test / @source:100%3A3'}]});
 contract.rules[0].select={from:'selection-root',traverse:'self-and-descendants',where:[{predicate:'equals',actual:{fact:'semantic.role'},expected:{literal:'chosen-button'}}]};
 Object.assign(s.source,{occurrenceAddressVersion:1,instanceIdentityVersion:1,instanceSourceIdentityVersion:1,componentSetKey:''});
 const root=s.nodes[0];root.semantic.path='Test';root.component={identity:{componentKey:'test-key',mainComponentId:'100:1'},properties:{},propertyTypes:{},propertyReferences:[],propertyReferenceBindings:{}};
 for(let i=0;i<2;i++){const n={id:'button-'+i,parentId:'root',childIds:[],order:i+1,name:'Button',type:'INSTANCE',visible:true,semantic:{path:'Test / Button'},appearance:{opacity:1},unknownFacts:[],
  component:{identity:{componentKey:'button-key',mainComponentId:'button-main'},properties:{},propertyTypes:{},propertyReferences:[],propertyReferenceBindings:{},
   sourceIdentity:{version:1,ownerComponentKey:'test-key',ownerMainComponentId:'100:1',sourceNodeId:'100:'+(i+2)}}};s.nodes.push(n);root.childIds.push(n.id);}
 s.variantReference=clone(core.captureVariantReference(s,'test-key',''));return {contract,s};
}

test('Apollo consumer executes the selected equal-name occurrence after rename/reorder and reset',()=>{
 const {contract,s}=scenario(),before=clone(s);assert.equal(auditContractSnapshot(s,contract).engine.evaluations[0].classification,'compliant');assert.deepEqual(s,before);
 s.nodes[1].name='Renamed A';s.nodes[2].name='Renamed B';s.nodes[0].childIds.reverse();s.nodes[2].appearance.opacity=.4;
 const result=auditContractSnapshot(s,contract);assert.equal(result.engine.evaluations[0].classification,'violation');assert.equal(result.coverage.executionComplete,true);
 s.nodes[2].appearance.opacity=1;assert.equal(auditContractSnapshot(s,contract).engine.evaluations[0].classification,'compliant');
 delete s.nodes[2].component.sourceIdentity;assert.equal(auditContractSnapshot(s,contract).coverage.executionComplete,false);
});

function collectionScenario(assertion={kind:'membership'},extra={}){
 const f=scenario(),{contract,s}=f;
 contract.facts.targets.push({id:'button-a',semanticRole:'first-button',label:'Button',lineage:[],pathHint:'Test / @catalog:2',resolution:'resolved',variantHints:[{representationId:'figma',componentKey:'test-key',pathHint:'Test / @source:100%3A2'}]});
 contract.runtimePolicy.memberCollectionsVersion=1;
 contract.facts.memberCollections=[{id:'collection',sourceRuleId:'source.rule',collection:{version:1,ownerTargetRole:'root',memberTargetRoles:['first-button','chosen-button'],representationIds:['figma'],visibleOnly:assertion.kind!=='membership',assertion,...extra}}];
 contract.rules[0].select={from:'selection-root',traverse:'self'};
 contract.rules[0].when={predicate:'equals',actual:{fact:'memberCollectionsV1.collection.active'},expected:{literal:true},missingPolicy:'unknown'};
 contract.rules[0].assert={predicate:'count-between',actual:{fact:'memberCollectionsV1.collection.violations'},lower:{literal:0},upper:{literal:0},bounds:'inclusive',missingPolicy:'unknown'};
 contract.rules[0].presentation.collectionId='collection';return f;
}

test('Apollo collection execution uses local graph IDs independently from Figma provenance and focuses Accent/reset',()=>{
 const {contract,s}=collectionScenario({kind:'propertyDomain',property:'View',propertyType:'VARIANT',values:['Primary','Secondary']});
 s.source.rootNodeId='900:100';for(const n of s.nodes.slice(1)){n.component.properties.View='Secondary';n.component.propertyTypes.View='VARIANT';}
 s.nodes[2].component.properties.View='Accent';const negative=auditContractSnapshot(s,contract);
 assert.equal(negative.engine.evaluations[0].classification,'violation');assert.equal(negative.engine.evaluations[0].focusNodeId,'button-1');
 assert.deepEqual(negative.engine,core.evaluateCompiledContract(s,contract));
 s.nodes[2].component.properties.View='Secondary';assert.equal(auditContractSnapshot(s,contract).engine.evaluations[0].classification,'compliant');
 s.source.truncated=true;assert.equal(auditContractSnapshot(s,contract).coverage.executionComplete,false);
});

test('Apollo preserves Editor picker VARIANT case and distinguishes BOOLEAN values without coercion',()=>{
 const host=collectionScenario({kind:'hostRequirement',property:'Overflow',propertyType:'VARIANT',values:['true']},
  {filter:{property:'SingleIcon',propertyType:'VARIANT',values:['True']}});
 host.s.nodes[0].component.properties.Overflow='true';host.s.nodes[0].component.propertyTypes.Overflow='VARIANT';
 for(const n of host.s.nodes.slice(1)){n.component.properties.SingleIcon='False';n.component.propertyTypes.SingleIcon='VARIANT';}
 host.s.nodes[2].component.properties.SingleIcon='True';
 const audit=()=>{const result=auditContractSnapshot(host.s,host.contract);assert.deepEqual(result.engine,core.evaluateCompiledContract(host.s,host.contract));return result;};
 assert.equal(audit().engine.evaluations[0].classification,'compliant');
 host.s.nodes[0].component.properties.Overflow='True';assert.equal(audit().engine.evaluations[0].classification,'violation');
 host.s.nodes[0].component.properties.Overflow='false';assert.equal(audit().engine.evaluations[0].classification,'violation');
 host.s.nodes[0].component.properties.Overflow=true;host.s.nodes[0].component.propertyTypes.Overflow='BOOLEAN';
 assert.equal(audit().coverage.executionComplete,false);
 host.s.nodes[0].component.properties.Overflow='true';host.s.nodes[0].component.propertyTypes.Overflow='VARIANT';
 assert.equal(audit().engine.evaluations[0].classification,'compliant');
 const boolean=collectionScenario({kind:'propertyDomain',property:'Enabled',propertyType:'BOOLEAN',values:[false,true]});
 for(const n of boolean.s.nodes.slice(1)){n.component.properties.Enabled=true;n.component.propertyTypes.Enabled='BOOLEAN';}
 assert.equal(auditContractSnapshot(boolean.s,boolean.contract).engine.evaluations[0].classification,'compliant');
 boolean.s.nodes[2].component.properties.Enabled=false;
 assert.equal(auditContractSnapshot(boolean.s,boolean.contract).engine.evaluations[0].classification,'compliant');
 boolean.s.nodes[2].component.properties.Enabled='true';boolean.s.nodes[2].component.propertyTypes.Enabled='VARIANT';
 assert.equal(auditContractSnapshot(boolean.s,boolean.contract).coverage.executionComplete,false);
});

test('Apollo source compilation opts into proven root aliases and rejects missing/unsupported alias versions',()=>{
 const {contract,s}=scenario(),runtime=require("../dist/runtime.cjs"),source=require("./authoring-fixtures").fromContract(contract);
 const root=source.manual.targets[0];root.semanticRole='buttons-group';
 const alias={...clone(root),id:'root-alias',semanticRole:'variant-root'};source.manual.targets.push(alias);
 Object.assign(source.manual.rules[0],{targetId:root.id,capability:'appearance.opacity',constraints:[{type:'propertyDomain',values:[1]}]});
 source.manual.rules.push({...clone(source.manual.rules[0]),id:'source.alias',targetId:alias.id});
 const loaded=runtime.loadAuthoringSource(source).contract;assert.equal(loaded.runtimePolicy.rootTargetAliasesVersion,1);
 const positive=auditContractSnapshot(s,loaded);assert.ok(positive.engine.evaluations.every(e=>e.classification==='compliant'));
 assert.deepEqual(positive.engine,core.evaluateCompiledContract(s,loaded));
 s.nodes[0].appearance.opacity=.4;assert.ok(auditContractSnapshot(s,loaded).engine.evaluations.every(e=>e.classification==='violation'));
 s.nodes[0].appearance.opacity=1;assert.ok(auditContractSnapshot(s,loaded).engine.evaluations.every(e=>e.classification==='compliant'));
 s.nodes[0].component.identity.mainComponentId='foreign';s.nodes[0].rootTargetAliasesV1={'buttons-group':true,'variant-root':true};
 assert.equal(auditContractSnapshot(s,loaded).coverage.executionComplete,false);
 for(const mutate of [c=>delete c.runtimePolicy.rootTargetAliasesVersion,c=>c.runtimePolicy.rootTargetAliasesVersion=2,c=>delete c.runtimePolicy.occurrenceAddressVersion]){
  const bad=clone(loaded);mutate(bad);assert.throws(()=>loadRuntimeContract(bad),{code:'APOLLO_V4_CONTRACT_INCOMPATIBLE'});
 }
});

test('Apollo and Editor share closed membership / conditional collection classification, focus and explicit gaps',()=>{
 const {contract,s}=collectionScenario();s.nodes[1].visible=false;assert.equal(auditContractSnapshot(s,contract).engine.evaluations[0].classification,'compliant');
 const extra=clone(s.nodes[1]);extra.id='hidden-extra';s.nodes.push(extra);s.nodes[0].childIds.push(extra.id);
 let result=auditContractSnapshot(s,contract);assert.equal(result.engine.evaluations[0].classification,'violation');assert.equal(result.coverage.executionComplete,true);
 assert.deepEqual(result.engine,core.evaluateCompiledContract(s,contract));
 delete extra.component.sourceIdentity;result=auditContractSnapshot(s,contract);assert.equal(result.engine.evaluations[0].classification,'violation');assert.equal(result.coverage.executionComplete,false);
 const count=collectionScenario({kind:'count',min:1,max:2});count.s.nodes.slice(1).forEach(n=>n.visible=false);
 assert.equal(auditContractSnapshot(count.s,count.contract).engine.evaluations[0].classification,'violation');
 count.s.nodes[1].visible=true;assert.equal(auditContractSnapshot(count.s,count.contract).engine.evaluations[0].classification,'compliant');
 delete count.s.nodes[1].component.sourceIdentity;assert.equal(auditContractSnapshot(count.s,count.contract).coverage.executionComplete,false);
});

test('Apollo compiles source collections with a root alias and preserves execution, reset and scope rejection',()=>{
 const {contract,s}=collectionScenario(),runtime=require("../dist/runtime.cjs");
 const source=require("./authoring-fixtures").fromContract(contract);
 source.manual.targets[0].semanticRole='buttons-group';
 source.manual.rules[0].capability='composition.members';
 const collection=clone(contract.facts.memberCollections[0].collection);collection.ownerTargetRole='buttons-group';
 source.manual.rules[0].constraints=[{type:'memberCollection',collection}];
 const before=clone(source),loaded=runtime.loadAuthoringSource(source);
 assert.deepEqual(source,before);assert.equal(loaded.contract.runtimePolicy.memberCollectionsVersion,1);
 assert.equal(auditContractSnapshot(s,loaded.contract).engine.evaluations[0].classification,'compliant');
 const extra=clone(s.nodes[1]);extra.id='hidden-extra';extra.visible=false;s.nodes.push(extra);s.nodes[0].childIds.push(extra.id);
 const negative=auditContractSnapshot(s,loaded.contract);assert.equal(negative.engine.evaluations[0].classification,'violation');
 assert.deepEqual(negative.engine,core.evaluateCompiledContract(s,loaded.contract));
 s.nodes.pop();s.nodes[0].childIds.pop();assert.equal(auditContractSnapshot(s,loaded.contract).engine.evaluations[0].classification,'compliant');
 const dependencySource=clone(before);dependencySource.manual.rules[0].capability='composition.content';
 dependencySource.manual.rules[0].constraints=[{type:'dependencyDomain',values:['button-key'],dependency:{subjects:[{targetRole:'chosen-button',relativePath:''}],field:'componentSetKey',baselinePolicy:'require-domain'}}];
 assert.equal(runtime.loadAuthoringSource(dependencySource).contract.status,'ready');
 dependencySource.manual.targets[0].pathHint='Test / Child';
 assert.throws(()=>runtime.loadAuthoringSource(dependencySource),{code:'APOLLO_V4_SOURCE_INVALID'});
 source.manual.targets[0].pathHint='Test / Child';
 assert.throws(()=>runtime.loadAuthoringSource(source),{code:'APOLLO_V4_SOURCE_INVALID'});
});

test('Apollo collection compatibility rejects missing versions and malformed typed conditions before execution',()=>{
 for(const mutate of [c=>delete c.runtimePolicy.memberCollectionsVersion,c=>c.runtimePolicy.memberCollectionsVersion=2,
  c=>c.facts.memberCollections[0].collection.filter={property:'SingleIcon',propertyType:'VARIANT',values:[true]},
  c=>c.facts.memberCollections[0].collection.assertion={kind:'unsupported'},c=>c.facts.memberCollections[0].collection.memberTargetRoles=['missing']]){
  const {contract}=collectionScenario();mutate(contract);assert.throws(()=>loadRuntimeContract(contract),{code:'APOLLO_V4_CONTRACT_INCOMPATIBLE'});
 }
});

test('Apollo rejects absent/unsupported occurrence versions and malformed authored bindings before execution',()=>{
 for(const mutate of [c=>delete c.runtimePolicy.occurrenceAddressVersion,c=>c.runtimePolicy.occurrenceAddressVersion=2,
  c=>c.facts.variantEvidence.occurrenceAddressVersion=2,c=>c.facts.targets[1].variantHints.push(c.facts.targets[1].variantHints[0]),
  c=>c.facts.targets[1].variantHints[0].pathHint='Test / @catalog:3']){
  const {contract}=scenario();mutate(contract);assert.throws(()=>loadRuntimeContract(contract),{code:'APOLLO_V4_CONTRACT_INCOMPATIBLE'});
 }
});

test('Apollo consumer delegates two direct occurrences to one exact child pin and preserves focused child findings',()=>{
 const {contract,s}=scenario(),child=fixture.contract();
 child.package.id=child.package.componentId=child.facts.component.componentId='fixture.child';child.package.manualRevision=7;
 child.facts.component.componentKey='button-key';child.facts.representations[0].locator.componentKey='button-key';child.rules[0].revision=7;
 child.customizationPolicy[0].id='child.opacity';child.rules[0].source.anchor='child.opacity';child.rules[0].ruleId='child.opacity.1';
 contract.runtimePolicy.directChildDependenciesVersion=1;
 contract.facts.targets.push({id:'button-a',semanticRole:'first-button',label:'Button',lineage:[],pathHint:'Test / @catalog:2',resolution:'resolved',
  variantHints:[{representationId:'figma',componentKey:'test-key',pathHint:'Test / @source:100%3A2'}]});
 contract.componentDependencies=[{id:'child',componentId:'fixture.child',revision:7,manualSourceHash:child.package.manualSourceHash,compiledHash:core.stableHash(child),contract:child,
  bindings:['first-button','chosen-button'].map((role,i)=>({kind:'direct-child',id:'member-'+i,targetRole:role,relativePath:'',ownerTargetRole:'root',ownerComponentKeys:['test-key'],representationIds:['figma']}))}];
 s.componentDependencyCaptures=s.nodes.slice(1).map((n,i)=>{
  n.resolvedModes={};const actual=clone(n);actual.id='local-root';actual.parentId=null;actual.semantic={role:'root',path:'Button'};delete actual.component.sourceIdentity;
  const snapshot={schemaVersion:'apollo.predicate-snapshot.v2',generatedAt:'fixture',selection:['local-root'],context:{platform:'desktop',modes:{}},nodes:[actual],
   source:{rootNodeId:'local-root',componentKey:'button-key',componentSetKey:'',truncated:false,occurrenceAddressVersion:1,instanceIdentityVersion:1,instanceSourceIdentityVersion:1}};
  snapshot.variantReference=clone(core.captureVariantReference(snapshot,'button-key',''));return {nodeId:n.id,nodeMap:{'local-root':n.id},snapshot};
 });
 const positive=auditContractSnapshot(s,contract);assert.deepEqual(positive.engine.dependencyRuns.map(r=>r.status),['executed','executed']);
 s.nodes[1].appearance.opacity=.5;s.componentDependencyCaptures[0].snapshot.nodes[0].appearance.opacity=.5;
 const negative=auditContractSnapshot(s,contract);assert.deepEqual(negative.engine.evaluations.filter(e=>e.dependency&&e.classification==='violation').map(e=>e.focusNodeId),['button-0']);
 s.nodes[1].appearance.opacity=1;s.componentDependencyCaptures[0].snapshot.nodes[0].appearance.opacity=1;
 delete s.nodes[1].component.sourceIdentity;s.nodes[2].appearance.opacity=.4;s.componentDependencyCaptures[1].snapshot.nodes[0].appearance.opacity=.4;
 const partial=auditContractSnapshot(s,contract);assert.deepEqual(partial.engine.dependencyRuns.map(r=>r.status),['not-executed','executed']);
 assert.ok(partial.engine.evaluations.some(e=>e.dependency&&e.classification==='violation'&&e.focusNodeId==='button-1'));assert.equal(partial.coverage.executionComplete,false);
 const unsupported=clone(contract);delete unsupported.runtimePolicy.directChildDependenciesVersion;
 assert.throws(()=>loadRuntimeContract(unsupported),{code:'APOLLO_V4_CONTRACT_INCOMPATIBLE'});
});
