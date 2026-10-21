const test=require('node:test'),assert=require('node:assert/strict');
const core=require("../packages/component-contract-core/dist/core.cjs");
const {fixture,sizePortFixture,clone}=require("../packages/component-contract-core/tests/helpers/asset-identity-lock.cjs");
const {loadRuntimeContract,auditContractSnapshot}=require("../dist/runtime.cjs");
test('Apollo reads reexported exact icon lock and matches Editor verdicts and incomplete evidence',()=>{
  const f=fixture(core),b=core.buildExportBundle(f.manual,f.evidence);
  const w=core.importWorkspace([{name:'contract.manual.json',text:JSON.stringify(f.manual)},{name:'compiled/component-contract.v2.json',text:JSON.stringify(b.compiled)}]);
  const c=core.compileManualSource(w.manual,w.variantEvidence).contract;
  assert.deepEqual(c,b.compiled);loadRuntimeContract(c);
  for(const mode of ['original','replacement','unknown']){
    if(mode==='replacement')f.snapshot.nodes.find(n=>n.id==='icon-4').component.identity.componentKey='replacement-icon';
    if(mode==='unknown')delete f.snapshot.variantReference;
    const r=auditContractSnapshot(f.snapshot,c);assert.deepEqual(r.engine,core.evaluateCompiledContract(f.snapshot,c));
    assert.equal(r.engine.evaluations.at(-1).classification,mode==='original'?'compliant':mode==='replacement'?'violation':'human-review');
    assert.equal(r.coverage.executionComplete,mode!=='unknown');
  }
});
test('Apollo rejects missing or unsupported identity-lock markers and malformed bindings',()=>{
  const f=fixture(core),c=f.compile().contract;
  for(const mutate of [c=>{delete c.runtimePolicy.assetIdentityLockVersion;},c=>{c.runtimePolicy.assetIdentityLockVersion=2;},
    c=>{c.facts.dependencyBindings[0].identityLock=false;},c=>{delete c.facts.dependencyBindings[0].identityLock;},c=>{c.facts.dependencyBindings[0].portNames=[];},
    c=>{c.facts.dependencyBindings[0].contractDependencyId='other-child';},c=>{c.facts.dependencyBindings=[];}]){
    const invalid=clone(c);mutate(invalid);assert.throws(()=>loadRuntimeContract(invalid),{code:'APOLLO_V4_CONTRACT_INCOMPATIBLE'});
  }
});
test('Apollo keeps all-size applicability and independently checks the active icon port',()=>{
 for(const size of ['32','40','48','56','64','72'])for(const port of ['Icon-16','Icon-20','Icon-24']){
  const f=sizePortFixture(core,size,port),bundle=core.buildExportBundle(f.manual,f.evidence);
  const imported=core.importWorkspace([{name:'contract.manual.json',text:JSON.stringify(f.manual)},{name:'compiled/component-contract.v2.json',text:JSON.stringify(bundle.compiled)}]);
  assert.equal(imported.manual.rules[0].applicability.variants,'all');loadRuntimeContract(imported.compiledInput);
  const run=()=>auditContractSnapshot(f.snapshot,imported.compiledInput).engine;
  assert.equal(run().evaluations.at(-1).classification,'compliant');
  Object.assign(f.snapshot.nodes.find(n=>n.id==='icon-4').component.identity,{componentKey:'replacement',mainComponentId:'replacement-main'});
  f.snapshot.nodes.find(n=>n.id==='addon-4').component.properties[port+'#1:1']='replacement-main';
  const result=run();assert.equal(result.evaluations.at(-1).classification,'violation');assert.deepEqual(result,core.evaluateCompiledContract(f.snapshot,bundle.compiled));
 }
});
