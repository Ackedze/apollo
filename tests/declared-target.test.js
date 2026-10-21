const test=require('node:test'),assert=require('node:assert/strict');
const core=require("../packages/component-contract-core/dist/core.cjs");
const {fixture,clone}=require("../packages/component-contract-core/tests/helpers/declared-target.cjs");
const {loadRuntimeContract,auditContractSnapshot}=require("../dist/runtime.cjs");
const configured = require("../packages/component-contract-core/tests/helpers/declared-target-configuration.cjs");
const publicSwap = require("../packages/component-contract-core/tests/helpers/declared-public-swap.cjs");
test('Apollo public swap profile keeps typed targets, preserves host constraints and rejects Draft admission', () => {
 const f=publicSwap.fixture(core), c=f.compile().contract;loadRuntimeContract(c);
 publicSwap.swap(f,'left');publicSwap.swap(f,'right');
 assert.deepEqual(auditContractSnapshot(f.snapshot,c).engine,core.evaluateCompiledContract(f.snapshot,c));
 assert(auditContractSnapshot(f.snapshot,c).engine.evaluations.every(e=>e.classification==='compliant'));
 f.snapshot.nodes.find(n=>n.id==='left').bounds.height=32;
 assert(auditContractSnapshot(f.snapshot,c).engine.evaluations.some(e=>e.ruleId==='synthetic.left-height.1.1'&&e.classification==='violation'));
 c.status='draft';assert.throws(()=>loadRuntimeContract(c),{code:'APOLLO_V4_CONTRACT_INCOMPATIBLE'});
});
test('Apollo configuration identity agrees for public values and preserves guards', () => {
 const f=configured.fixture(core),c=f.compile().contract;loadRuntimeContract(c);
 for(const show of [true,false]){
  configured.configure(f,'Public label',show);
  const actual=auditContractSnapshot(f.snapshot,c);assert.deepEqual(actual.engine,core.evaluateCompiledContract(f.snapshot,c));
  assert(actual.engine.evaluations.every(e=>['compliant','not-applicable'].includes(e.classification)));
 }
 configured.configure(f,'Public label',true);
 f.snapshot.nodes[2].text.fontSize=18;
 assert(auditContractSnapshot(f.snapshot,c).engine.evaluations.some(e=>e.classification==='violation'));
 for(const edit of [c=>{c.runtimePolicy.declaredTargetConfigurationVersion=3;},c=>{delete c.runtimePolicy.declaredTargetConfigurationVersion;},c=>{delete c.facts.targets[0].identityBindingsV1[0].configurationReferenceHash;},c=>{c.package.sourceExportVersion='component-contract-editor@0.2.95';}]){
  const bad=clone(c);edit(bad);assert.throws(()=>loadRuntimeContract(bad),{code:'APOLLO_V4_CONTRACT_INCOMPATIBLE'});
 }
});
test('Apollo policy and effective visibility agree with the supported core',()=>{
 const f=fixture(core),b={compiled:f.compile().contract};loadRuntimeContract(b.compiled);
 for(const hidden of [false,true]){f.snapshot.nodes[2].visible=!hidden;const actual=auditContractSnapshot(f.snapshot,b.compiled);assert.deepEqual(actual.engine,core.evaluateCompiledContract(f.snapshot,b.compiled));assert.equal(actual.engine.evaluations[0].classification,hidden?'violation':'compliant');}
});
test('private Apollo profile rejects unsupported, missing, malformed policy/typed membership',()=>{const f=fixture(core),c=f.compile().contract;for(const edit of [c=>{c.runtimePolicy.declaredTargetIdentityVersion=4;},c=>{delete c.runtimePolicy.declaredTargetIdentityVersion;},c=>{c.facts.targets[1].identityBindingsV1[0].nodeType='guess';},c=>{c.facts.targets[1].identityBindingsV1[0].firstFrame=true;}]){const bad=clone(c);edit(bad);assert.throws(()=>loadRuntimeContract(bad),{code:'APOLLO_V4_CONTRACT_INCOMPATIBLE'});}});
test('private Apollo preserves unknown on missing native correspondence despite imported claims',()=>{const f=fixture(core),c=f.compile().contract;delete f.snapshot.variantReference;f.snapshot.nodes[1].declaredTargetMembershipV1={[core.declaredTargetMembershipKey('title.target')]:true};const actual=auditContractSnapshot(f.snapshot,c);assert.equal(actual.engine.evaluations[0].classification,'human-review');assert.deepEqual(actual.engine,core.evaluateCompiledContract(f.snapshot,c));});

test('Apollo portable declared target profile agrees after native import and a visibility mutation',()=>{
 const f=fixture(core);f.manual.metadata.declaredTargetIdentityVersion=2;
 for(const t of f.manual.targets)for(const b of t.identityBindingsV1)b.portableReferenceHash=core.portableDeclaredTargetReferenceHash(f.snapshot.variantReference);
 const c=f.compile().contract;loadRuntimeContract(c);
 f.snapshot.nodes[0].component.identity.mainComponentId='imported-main';
 for(const n of f.snapshot.nodes)if(n.component.sourceIdentity)n.component.sourceIdentity.ownerMainComponentId='imported-main';
 for(const p of Object.values(f.snapshot.variantReference.nodeProperties)){
  if(p.identity)p.identity.mainComponentId='imported-main';
  if(p.sourceIdentity)p.sourceIdentity.ownerMainComponentId='imported-main';
 }
 for(const hidden of [false,true]){f.snapshot.nodes[2].visible=!hidden;const actual=auditContractSnapshot(f.snapshot,c);assert.deepEqual(actual.engine,core.evaluateCompiledContract(f.snapshot,c));assert.equal(actual.engine.evaluations[0].classification,hidden?'violation':'compliant');}
 c.status='draft';assert.throws(()=>loadRuntimeContract(c),{code:'APOLLO_V4_CONTRACT_INCOMPATIBLE'});
});

test('Apollo accepts native text metrics and rejects missing or unknown metric policies',()=>{
 const f=fixture(core),n=f.snapshot.nodes[2];n.text={characters:'ABC',fontSize:16,lineHeight:{unit:'PIXELS',value:20},textAutoResize:'HEIGHT',textTruncation:'DISABLED',paragraphSpacing:0,maxHeight:null};n.bounds={height:20};
 f.manual.rules[0].targetId='title.target';f.manual.rules[0].constraints=[{type:'layoutConstraint',fact:'textContentV1.characterCount',max:3},{type:'layoutConstraint',fact:'textContentV1.lineCount',max:1}];
 const c=f.compile().contract;loadRuntimeContract(c);
 for(const characters of ['ABC','ABCD']){n.text.characters=characters;const r=auditContractSnapshot(f.snapshot,c);assert.deepEqual(r.engine,core.evaluateCompiledContract(f.snapshot,c));assert.equal(r.engine.evaluations[0].classification,characters==='ABC'?'compliant':'violation');}
 for(const edit of [c=>{delete c.runtimePolicy.textContentFactsVersion;},c=>{c.capabilities.facts=[];delete c.runtimePolicy.textContentFactsVersion;},c=>{c.runtimePolicy.textContentFactsVersion=2;},c=>{c.runtimePolicy.nativeTargetPropertyFactsVersion=2;},c=>{c.package.sourceExportVersion='component-contract-editor@0.2.93';}]){const bad=clone(c);edit(bad);assert.throws(()=>loadRuntimeContract(bad),{code:'APOLLO_V4_CONTRACT_INCOMPATIBLE'});}
});
