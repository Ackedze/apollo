const test=require('node:test'),assert=require('node:assert/strict'),core=require('../dist/core.cjs');
const {fixture,clone}=require('./helpers/declared-target.cjs');
function portableFixture(){
 const f=fixture(core);f.manual.metadata.declaredTargetIdentityVersion=2;
 const hash=core.portableDeclaredTargetReferenceHash(f.snapshot.variantReference);
 for(const t of f.manual.targets)for(const b of t.identityBindingsV1)b.portableReferenceHash=hash;
 return f;
}
function importIntoAnotherDocument(f){
 f.snapshot.nodes[0].component.identity.mainComponentId='imported-main';
 for(const node of f.snapshot.nodes)if(node.component.sourceIdentity)node.component.sourceIdentity.ownerMainComponentId='imported-main';
 for(const p of Object.values(f.snapshot.variantReference.nodeProperties)){
  if(p.identity)p.identity.mainComponentId='imported-main';
  if(p.sourceIdentity)p.sourceIdentity.ownerMainComponentId='imported-main';
 }
}
const run=f=>core.evaluateCompiledContract(f.snapshot,f.compile().contract).evaluations[0].classification;
const target=f=>core.prepareValidationSnapshot(f.snapshot,f.compile().contract).declaredTargetIdentitiesV1.targets.find(t=>t.semanticRole==='title');
test('portable pin survives native import and still detects a hidden target',()=>{
 const f=portableFixture(),original=clone(f.manual);importIntoAnotherDocument(f);
 assert.equal(run(f),'compliant');assert.equal(target(f).nodeId,'text');
 f.snapshot.nodes[2].visible=false;assert.equal(run(f),'violation');assert.equal(target(f).effectiveVisible,false);
 assert.deepEqual(f.manual,original);
});
test('historical exact policy keeps its reference-pin failure after import',()=>{const f=fixture(core);importIntoAnotherDocument(f);assert.equal(run(f),'human-review');assert.equal(target(f).reason,'reference-pin-stale');});
test('unmigrated variant binding remains exact under policy v2',()=>{const f=portableFixture();delete f.manual.targets[1].identityBindingsV1[0].portableReferenceHash;importIntoAnotherDocument(f);assert.equal(run(f),'human-review');assert.equal(target(f).reason,'reference-pin-stale');});
for(const [name,mutate] of [
 ['changed reference property',f=>{f.snapshot.variantReference.definedProperties=['changed'];}],
 ['changed reference source address',f=>{f.snapshot.variantReference.nodeProperties['Title / value'].sourceIdentity.sourceNodeId='foreign';}],
 ['changed reference owner key',f=>{f.snapshot.variantReference.nodeProperties['Title / value'].sourceIdentity.ownerComponentKey='foreign';}],
 ['changed actual source address',f=>{f.snapshot.nodes[2].component.sourceIdentity.sourceNodeId='foreign';}],
 ['changed actual owner key',f=>{f.snapshot.nodes[2].component.sourceIdentity.ownerComponentKey='foreign';}],
 ['forged actual local owner',f=>{f.snapshot.nodes[2].component.sourceIdentity.ownerMainComponentId='foreign';}],
 ['inconsistent independent local owner',f=>{f.snapshot.variantReference.nodeProperties['Title / value'].sourceIdentity.ownerMainComponentId='foreign';}],
 ['missing local source owner',f=>{delete f.snapshot.nodes[2].component.sourceIdentity.ownerMainComponentId;}],
 ['unknown local source owner',f=>{f.snapshot.nodes[2].unknownFacts=['component.sourceIdentity.ownerMainComponentId'];}],
 ['unknown owner identity',f=>{f.snapshot.nodes[0].unknownFacts=['component.identity.mainComponentId'];}],
 ['missing reference',f=>{delete f.snapshot.variantReference;}],
 ['missing reference node properties',f=>{delete f.snapshot.variantReference.nodeProperties;}],
 ['incomplete topology',f=>{f.snapshot.source.captureTopology.complete=false;}],
 ['slot boundary',f=>{f.snapshot.nodes[1].type='SLOT';}],
 ['wrong type',f=>{f.snapshot.nodes[2].type='FRAME';}],
 ['duplicate target',f=>{const n=clone(f.snapshot.nodes[2]);n.id='copy';f.snapshot.nodes.push(n);f.snapshot.nodes[1].childIds.push(n.id);}],
])test('portable identity fails closed: '+name,()=>{const f=portableFixture();importIntoAnotherDocument(f);mutate(f);assert.equal(run(f),'human-review');assert.notEqual(target(f).status,'resolved');});
test('portable hash cannot silently change a historical v1 contract',()=>{const f=portableFixture();f.manual.metadata.declaredTargetIdentityVersion=1;assert.throws(()=>f.compile(),{code:'DECLARED_TARGET_IDENTITY_UNSUPPORTED'});});
test('portable hash must be a typed SHA256 pin',()=>{const f=portableFixture();f.manual.targets[1].identityBindingsV1[0].portableReferenceHash='guess';assert.throws(()=>f.compile(),{code:'DECLARED_TARGET_IDENTITY_UNSUPPORTED'});});
test('portable runtime requires the matching exporter stamp',()=>{const f=portableFixture(),c=f.compile().contract;c.package.sourceExportVersion='component-contract-editor@0.2.92';assert.throws(()=>core.evaluateCompiledContract(f.snapshot,c),{code:'DECLARED_TARGET_IDENTITY_UNSUPPORTED'});});
