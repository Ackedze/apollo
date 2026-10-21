const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../dist/core.cjs'),{aliasFixture,clone}=require('./helpers/main-component-aliases.cjs');
const last=(f,c=f.compile().contract)=>core.evaluateCompiledContract(f.snapshot,c).evaluations.at(-1).classification;
test('an independently proven identical asset survives file-local main IDs and restores its host baseline',()=>{
 const f=aliasFixture(core),before=core.stableHash(f.snapshot),c=f.compile();assert.deepEqual(c.issues,[]);
 assert.equal(c.contract.runtimePolicy.instanceMainComponentAliasesVersion,1);assert.equal(c.contract.package.sourceExportVersion,'component-contract-editor@0.2.90');
 assert.equal(core.compareInstanceBoundaries(f.snapshot,f.snapshot.variantReference).complete,false);
 assert.equal(last(f,c.contract),'compliant');const prepared=core.prepareValidationSnapshot(f.snapshot,c.contract);
 assert.equal(core.compareInstanceBoundaries(prepared,prepared.variantReference).complete,true);
 assert.equal(prepared.nodes[0].baselineProvenance.status,'matched');assert.equal(prepared.nodes[0].baseline.effective.appearance.opacity,1);
 assert.equal(core.stableHash(f.snapshot),before);
});
test('historical profile keeps strict replay and cannot be enabled by a stored source flag',()=>{
 const f=aliasFixture(core),c=f.compile().contract;delete c.runtimePolicy.instanceMainComponentAliasesVersion;c.package.sourceExportVersion='component-contract-editor@0.2.88';
 assert.equal(last(f,c),'human-review');f.snapshot.source.instanceMainComponentAliasesVersion=1;
 assert.equal(last(f,c),'human-review');assert.equal(core.prepareValidationSnapshot(f.snapshot,c).source.instanceMainComponentAliasesVersion,undefined);
});
test('a versioned parent context can use canonical owner proof without rewriting its pinned child artifact',()=>{
 const f=aliasFixture(core),child=f.compile().contract;delete child.runtimePolicy.instanceMainComponentAliasesVersion;child.package.sourceExportVersion='component-contract-editor@0.2.88';
 const before=core.stableHash(child);
 assert.equal(core.evaluateCompiledContract(f.snapshot,child,[],1).evaluations.at(-1).classification,'compliant');
 assert.equal(core.stableHash(child),before);assert.equal(last(f,child),'human-review');
});
test('canonical aliases cannot replace local owner proof, source address uniqueness or independent host evidence',()=>{
 for(const mutate of [
  f=>f.snapshot.nodes.find(n=>n.id==='glyph-4').component.sourceIdentity.ownerMainComponentId='foreign-main',
  f=>f.snapshot.nodes.find(n=>n.id==='glyph-4').component.sourceIdentity.sourceNodeId='foreign-source',
  f=>f.snapshot.nodes.find(n=>n.id==='glyph-4').component.sourceIdentity.ownerComponentKey='foreign-key',
  f=>f.snapshot.nodes.find(n=>n.id==='icon-4').component.identity.componentSetKey='foreign-set',
  f=>f.snapshot.nodes.find(n=>n.id==='icon-4').unknownFacts.push('component.identity.mainComponentId'),
  f=>{const n=clone(f.snapshot.nodes.find(n=>n.id==='glyph-4'));n.id='duplicate';f.snapshot.nodes.push(n);f.snapshot.nodes.find(n=>n.id==='icon-4').childIds.push(n.id);},
 ]){const f=aliasFixture(core);mutate(f);assert.notEqual(last(f),'compliant');}
 const f=aliasFixture(core);f.snapshot.instanceContentReferences.base.source.rootNodeId=f.snapshot.source.rootNodeId;
 const prepared=core.prepareValidationSnapshot(f.snapshot,f.compile().contract);assert.notEqual(prepared.nodes[0].baselineProvenance.status,'matched');
});
test('another asset remains forbidden even when its file-local IDs are valid',()=>{
 const f=aliasFixture(core),icon=f.snapshot.nodes.find(n=>n.id==='icon-4');icon.component.identity.componentKey='another-asset';
 f.snapshot.nodes.find(n=>n.id==='glyph-4').component.sourceIdentity.ownerComponentKey='another-asset';
 assert.equal(last(f),'violation');
});
