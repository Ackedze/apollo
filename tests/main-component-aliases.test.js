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
