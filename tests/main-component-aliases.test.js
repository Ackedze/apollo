const test=require('node:test'),assert=require('node:assert/strict');
const core=require("../packages/component-contract-core/dist/core.cjs"),{aliasFixture,clone}=require("../packages/component-contract-core/tests/helpers/main-component-aliases.cjs");
const {loadRuntimeContract,auditContractSnapshot}=require("../dist/runtime.cjs");
test('Apollo accepts the versioned canonical-main profile and agrees on restored versus replaced assets',()=>{
 const f=aliasFixture(core),c=f.compile().contract;loadRuntimeContract(c);
 const original=auditContractSnapshot(f.snapshot,c);assert.equal(original.engine.evaluations.at(-1).classification,'compliant');assert.equal(original.coverage.executionComplete,true);
 assert.deepEqual(original.engine,core.evaluateCompiledContract(f.snapshot,c));
 f.snapshot.nodes.find(n=>n.id==='icon-4').component.identity.componentKey='replacement';
 f.snapshot.nodes.find(n=>n.id==='glyph-4').component.sourceIdentity.ownerComponentKey='replacement';
 const replacement=auditContractSnapshot(f.snapshot,c);assert.equal(replacement.engine.evaluations.at(-1).classification,'violation');
 assert.deepEqual(replacement.engine,core.evaluateCompiledContract(f.snapshot,c));
});
test('unsupported alias versions are rejected and historical packages retain strict proof',()=>{
 const f=aliasFixture(core),c=f.compile().contract,bad=clone(c);bad.runtimePolicy.instanceMainComponentAliasesVersion=2;
 assert.throws(()=>loadRuntimeContract(bad),{code:'APOLLO_V4_CONTRACT_INCOMPATIBLE'});
 delete c.runtimePolicy.instanceMainComponentAliasesVersion;c.package.sourceExportVersion='component-contract-editor@0.2.88';loadRuntimeContract(c);
 const result=auditContractSnapshot(f.snapshot,c);assert.equal(result.engine.evaluations.at(-1).classification,'human-review');assert.equal(result.coverage.executionComplete,false);
});

test('canonical-main opt-in restores only independently proved aliases and preserves source identity guards',()=>{
 const f=aliasFixture(core),contract=f.compile().contract;
 assert.equal(contract.runtimePolicy.instanceMainComponentAliasesVersion,1);
 const restored=auditContractSnapshot(f.snapshot,contract);
 assert.equal(restored.coverage.executionComplete,true);
 for(const mutate of [
  s=>s.nodes.find(n=>n.id==='glyph-4').component.sourceIdentity.sourceNodeId='foreign-source',
  s=>s.nodes.find(n=>n.id==='glyph-4').component.sourceIdentity.ownerMainComponentId='foreign-main',
  s=>s.nodes.find(n=>n.id==='glyph-4').component.sourceIdentity.ownerComponentKey='foreign-key',
  s=>s.nodes.find(n=>n.id==='icon-4').unknownFacts=['component.identity.mainComponentId'],
 ]){
  const changed=clone(f.snapshot);mutate(changed);
  const result=auditContractSnapshot(changed,contract);
  assert.equal(result.coverage.executionComplete,false);
  assert.ok(result.engine.evaluations.some(e=>e.classification==='human-review'));
 }
});
