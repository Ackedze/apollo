const test=require('node:test'),assert=require('node:assert/strict');
const {loadContractPackages,projectGenerationView,assessVerification,createCompositionPlan}=require('../dist/index.cjs');
const runtime=require('../../../dist/runtime.cjs'),core=require('../../component-contract-core/dist/core.cjs');
const authored=require('../../../tests/authoring-fixtures');
const {fixture,hash,clone}=require('./planning-fixtures.cjs');
async function inventory() {
 const source=authored.source(),contract=runtime.loadAuthoringSource(source).contract;
 return loadContractPackages([{name:'synthetic.zip',bytes:core.createZip([core.textZipEntry('contract.manual.json',source.manual),core.textZipEntry('compiled/component-contract.v2.json',contract)])}],
 {runtime,readZip:core.readZip,identity:{coreVersion:require('../../component-contract-core/package.json').version,profileVersion:runtime.RUNTIME_VERSION,runtimeSha256:'a'.repeat(64),buildInputsSha256:'b'.repeat(64)}});
}
test('G04 derives APIs and scopes from canonical G02 inventory without creating norms',async()=>{
 const i=await inventory(),before=JSON.stringify(i),v=projectGenerationView(i,runtime.contractHash);
 assert.equal(v.lockHash,i.lockHash);assert.deepEqual(v.components[0].api,i.packages[0].source.manual.semanticApi);
 assert.deepEqual(v.components[0].coverage.predicateRuleIds,i.packages[0].contract.rules.map(r=>r.ruleId));
 assert.equal(v.components[0].sourceStatus,i.packages[0].contract.status);assert.equal(JSON.stringify(i),before);
});
test('G04 rejects modified manual/facts/compiled projection against its lock',async()=>{
 const i=await inventory();
 for(const mutate of [i=>i.packages[0].source.manual.metadata.revision++,i=>i.packages[0].source.variantEvidence.sourceHash='b'.repeat(64),i=>i.packages[0].contract.status='draft']){
  const bad=clone(i);mutate(bad);assert.throws(()=>projectGenerationView(bad,runtime.contractHash),/GENERATION_VIEW_SOURCE/);
 }
});
test('verification requires observed facts and checks for every source rule/node/action/state/event',()=>{
 const f=fixture(),p=createCompositionPlan(f.spec,f.context,hash);assert.equal(assessVerification(p,f.context,{status:'passed',diagnostics:[]}),'incomplete');
 const checks=f.context.view.components.flatMap(c=>c.coverage.predicateRuleIds.map(id=>({id,componentId:c.pin.componentId,status:'passed',evidenceHash:hash(id)})));
 const ids=p.spec.nodes.map(n=>'node.'+n.id).concat(p.spec.events.map(e=>'event.'+e.id),p.spec.states.values.map(s=>'state.'+s),'action.first-action','action.second-action');
 checks.push(...ids.map(id=>({id,status:'passed',evidenceHash:hash(id)})));
 const verified={status:'passed',diagnostics:[],evidence:{factsHash:hash('actual-synthetic-facts'),checks}};
 assert.equal(assessVerification(p,f.context,verified),'passed');
 checks.pop();assert.equal(assessVerification(p,f.context,verified),'incomplete');
 checks[0].status='failed';assert.equal(assessVerification(p,f.context,verified),'failed');
});
