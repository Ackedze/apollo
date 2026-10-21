const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../dist/core.cjs');
const {scenario,clone}=require('./helpers/dependency-usage.cjs');
const result=(f,id)=>f.run().engine.evaluations.find(e=>e.ruleId==='usage-'+id+'.1.1');
test('fixed child Label metrics and owner configuration use independent proof',()=>{
 const f=scenario(),r=f.run();assert.equal(result(f,'configuration').classification,'compliant');
 assert.equal(result(f,'characters').classification,'compliant');assert.equal(result(f,'lines').classification,'compliant');
 assert.equal(r.prepared.nodes[0].editorDependencyUsageV1['bottom-link'].nonTextChanged,false);
 assert.deepEqual(core.prepareValidationSnapshot(r.prepared,r.contract),r.prepared);
 assert.deepEqual(core.evaluateCompiledContract(r.prepared,r.contract),r.engine);
});
test('32/33 text boundary and RESET preserve the rest of the child',()=>{
 const f=scenario(),label=f.parent.nodes.find(n=>n.id===f.nodeMap.text),root=f.parent.nodes.find(n=>n.id===f.nodeMap.root);
 for(const count of [32,33,32]){label.text.characters='A'.repeat(count);root.component.properties.Label=label.text.characters;f.updateChildCapture();
  assert.equal(result(f,'characters').classification,count===33?'violation':'compliant');assert.equal(result(f,'configuration').classification,'compliant');}
});
test('one/two lines and RESET retain character limit and configuration',()=>{
 const f=scenario(),label=f.parent.nodes.find(n=>n.id===f.nodeMap.text),root=f.parent.nodes.find(n=>n.id===f.nodeMap.root);
 for(const height of [20,40,20]){label.bounds.height=height;label.text.characters=height===40?'A\nB':'AB';root.component.properties.Label=label.text.characters;f.updateChildCapture();
  assert.equal(result(f,'lines').classification,height===40?'violation':'compliant');assert.equal(result(f,'characters').classification,'compliant');assert.equal(result(f,'configuration').classification,'compliant');}
});
test('allowed child Boolean still violates the tighter parent usage and RESET restores it',()=>{
 const f=scenario(),root=f.parent.nodes.find(n=>n.id===f.nodeMap.root);
 root.component.properties.RightAddon=false;f.updateChildCapture();assert.equal(result(f,'configuration').classification,'violation');
 root.component.properties.RightAddon=true;f.updateChildCapture();assert.equal(result(f,'configuration').classification,'compliant');
});
test('child style override is a parent violation without adopting actual styles',()=>{
 const f=scenario(),label=f.parent.nodes.find(n=>n.id===f.nodeMap.text);label.appearance.opacity=.5;f.updateChildCapture();assert.equal(result(f,'configuration').classification,'violation');
});
test('child layout override and RESET keep the independent owner layout',()=>{
 const f=scenario(),root=f.parent.nodes.find(n=>n.id===f.nodeMap.root),original=clone(root.layout);
 root.layout={...root.layout,itemSpacing:99};f.updateChildCapture();assert.equal(result(f,'configuration').classification,'violation');
 root.layout=original;f.updateChildCapture();assert.equal(result(f,'configuration').classification,'compliant');
});
test('legal text reflow does not become a non-text style/configuration violation',()=>{
 const f=scenario(),label=f.parent.nodes.find(n=>n.id===f.nodeMap.text),root=f.parent.nodes.find(n=>n.id===f.nodeMap.root);
 label.text.characters='A'.repeat(32);root.component.properties.Label=label.text.characters;
 label.bounds.width=320;root.bounds={width:360,height:20};f.updateChildCapture();
 assert.equal(result(f,'configuration').classification,'compliant');assert.equal(result(f,'characters').classification,'compliant');
});
for(const [name,mutate]of [
 ['missing child capture',f=>{delete f.parent.componentDependencyCaptures;}],
 ['missing owner reference',f=>{delete f.parent.instanceContentReferences;}],
 ['bad nodeMap',f=>{f.parent.componentDependencyCaptures[0].nodeMap.text='foreign';}],
 ['foreign label owner',f=>{f.parent.componentDependencyCaptures[0].snapshot.nodes[2].component.sourceIdentity.ownerComponentKey='foreign';}],
 ['missing native text port',f=>{delete f.parent.componentDependencyCaptures[0].snapshot.nodes[2].component.propertyReferenceBindings.characters;}],
 ['truncated child',f=>{f.parent.componentDependencyCaptures[0].snapshot.source.truncated=true;}],
])test('incomplete proof stays UNKNOWN: '+name,()=>{const f=scenario();mutate(f);assert.equal(result(f,'characters').classification,'human-review');});
test('unknown line metrics do not become a one-line pass',()=>{
 const f=scenario();f.parent.nodes.find(n=>n.id===f.nodeMap.text).text.lineHeight={unit:'AUTO'};f.updateChildCapture();assert.equal(result(f,'lines').classification,'human-review');
});
test('hidden Bottom is notApplicable',()=>{const f=scenario();f.parent.nodes[1].visible=false;assert.equal(result(f,'characters').classification,'not-applicable');});
test('forged cached usage metrics cannot replace missing capture',()=>{
 const f=scenario();delete f.parent.componentDependencyCaptures;f.parent.nodes[0].editorDependencyUsageV1={'bottom-link':{characterCount:1,lineCount:1,nonTextChanged:false}};
 assert.equal(result(f,'characters').classification,'human-review');
});
test('export and reopen retain opt-in declaration and exact child closure',async()=>{
 const f=scenario(),bundle=core.buildExportBundle(f.manual,f.evidence,[f.childContract]);assert(bundle.validation.valid);
 const zip=core.createZip([core.textZipEntry('contract.manual.json',f.manual),core.textZipEntry('compiled/component-contract.v2.json',bundle.compiled),
  core.textZipEntry('dependencies/child/component-contract.v2.json',f.childContract),core.textZipEntry('evidence.json',{variantEvidence:f.evidence})]);
 const files=(await core.readZip(zip)).map(e=>({name:e.name,text:core.zipEntryText(e)}));
 const w=core.importWorkspace(files,'synthetic.parent');assert.deepEqual(w.manual.editorDependencyUsages,f.manual.editorDependencyUsages);
 assert.deepEqual(clone(core.compileManualSource(w.manual,f.evidence,w.dependencyContracts).contract),clone(bundle.compiled));
});
test('shared guards accept only the exact usage producer and base envelope',()=>{
 const f=scenario(),r=f.run();
 assert.doesNotThrow(()=>core.assertDeclaredTargetContract(r.contract));
 assert.doesNotThrow(()=>core.assertNativeRuleFactPolicies(r.contract));
 for(const mutate of [c=>c.package.sourceExportVersion='component-contract-editor@0.2.999',c=>c.editorDependencyUsages.baseProducer='foreign',c=>c.editorDependencyUsages.version=2,c=>c.editorDependencyUsages.bindings.push(clone(c.editorDependencyUsages.bindings[0]))]){
  const c=clone(r.contract);mutate(c);assert.throws(()=>core.evaluateCompiledContract(f.parent,c),/EDITOR_DEPENDENCY_USAGE_UNSUPPORTED/);
 }
 const plain=clone(f.manual);delete plain.editorDependencyUsages;plain.rules=[];
 const compiled=core.compileManualSource(plain,f.evidence,[f.childContract]);
 assert.equal(compiled.contract.editorDependencyUsages,undefined);
 assert.equal(compiled.contract.package.sourceExportVersion,'component-contract-editor@0.2.95');
});
test('invalid/missing extension and metric spelling fail compilation',()=>{
 for(const mutate of [f=>{delete f.manual.editorDependencyUsages;},f=>{f.manual.editorDependencyUsages.version=2;},
  f=>{f.manual.editorDependencyUsages.bindings[0].bindingId='missing';},f=>{f.manual.rules[1].constraints[0].fact='editorDependencyUsageV1.bottom-link.guess';},
  f=>{f.manual.editorDependencyUsages.bindings[0].childTargetId='missing';}]){
  const f=scenario();mutate(f);assert(core.compileManualSource(f.manual,f.evidence,[f.childContract]).issues.some(i=>i.code==='EDITOR_DEPENDENCY_USAGE'));
 }
});
test('stale child pin is rejected by compiler and runtime',()=>{
 const f=scenario(),r=f.run();f.manual.componentDependencies[0].compiledHash='f'.repeat(64);
 assert(core.compileManualSource(f.manual,f.evidence,[f.childContract]).issues.some(i=>i.code==='COMPONENT_DEPENDENCY_LINK'));
 r.contract.componentDependencies[0].compiledHash='f'.repeat(64);
 assert.equal(core.evaluateCompiledContract(f.parent,r.contract).evaluations.find(e=>e.ruleId==='usage-characters.1.1').classification,'human-review');
});
test('conflicting main aliases do not authorize a different configuration',()=>{
 const f=scenario();f.parent.source.instanceSourceIdentityCapture={version:1,owners:[{mainComponentId:'synthetic-main',componentKey:'foreign',status:'captured',sourceInstanceId:'foreign'}]};
 assert.equal(result(f,'configuration').classification,'human-review');
});
test('missing runtime marker cannot trust cached usage facts',()=>{
 const f=scenario(),r=f.run();delete r.contract.editorDependencyUsages;
 assert.throws(()=>core.evaluateCompiledContract(r.prepared,r.contract),/EDITOR_DEPENDENCY_USAGE_UNSUPPORTED/);
});
