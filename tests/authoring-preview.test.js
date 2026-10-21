const test=require('node:test'),assert=require('node:assert/strict');
const runtime=require("../dist/runtime.cjs"),fixture=require("./authoring-fixtures");
const preview={evaluationMode:'authoring-preview'},clone=x=>JSON.parse(JSON.stringify(x));
function draft(){const source=fixture.source();source.manual.rules[0].status='draft';return source;}
test('draft execution requires explicit authoring preview and preserves source authority',()=>{
 const source=draft(),before=JSON.stringify(source);assert.throws(()=>runtime.loadAuthoringSource(source),/ready contract/);
 const loaded=runtime.loadAuthoringSource(source,preview),contractBefore=JSON.stringify(loaded.contract);
 assert.equal(loaded.contract.status,'draft');assert.equal(loaded.contract.rules[0].authority.status,'draft');
 assert.throws(()=>runtime.auditContractSnapshot(fixture.snapshot(),loaded.contract),/ready contract/);
 const pass=runtime.auditContractSnapshot(fixture.snapshot(),loaded.contract,preview);assert.equal(pass.engine.evaluations[0].classification,'compliant');assert.equal(pass.evaluationMode,'authoring-preview');assert.equal(pass.Ready,false);assert.equal(pass.sourceStatus,'draft');
 const snapshot=fixture.snapshot();snapshot.nodes[0].appearance.opacity=.2;assert.equal(runtime.auditContractSnapshot(snapshot,loaded.contract,preview).engine.evaluations[0].classification,'violation');
 assert.equal(JSON.stringify(source),before);assert.equal(JSON.stringify(loaded.contract),contractBefore);
});
test('preview preserves fact, cache, policy and runtime feature guards',()=>{
 const source=draft();delete source.variantEvidence;assert.throws(()=>runtime.loadAuthoringSource(source,preview),/факты/);
 const good=runtime.loadAuthoringSource(draft(),preview),bad=clone(good.contract);bad.runtimePolicy.futureFeatureVersion=1;assert.throws(()=>runtime.loadRuntimeContract(bad,preview));
 const checksum=clone(good.contract);checksum.rules[0].source.checksum='0'.repeat(64);assert.throws(()=>runtime.loadRuntimeContract(checksum,preview));
 const authority=clone(good.contract);authority.rules[0].authority.status='untrusted';assert.throws(()=>runtime.loadRuntimeContract(authority,preview));
 for(const options of [{allowDraft:true},{evaluationMode:'future'},{evaluationMode:false}])assert.throws(()=>runtime.loadAuthoringSource(draft(),options));
});
test('preview root may retain ready dependency execution',()=>{
 const f=fixture.nested();f.source.manual.rules[0].status='draft';const loaded=runtime.loadAuthoringSource(f.source,preview);
 const out=runtime.auditContractSnapshot(f.snapshot,loaded.contract,preview);assert(out.engine.dependencyRuns.every(r=>r.status==='executed'));assert.equal(loaded.contract.componentDependencies[0].contract.status,'ready');
});
