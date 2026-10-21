const test=require('node:test'),assert=require('node:assert/strict'),core=require("../packages/component-contract-core/dist/core.cjs"),runtime=require("../dist/runtime.cjs");
const {scenario}=require("../packages/component-contract-core/tests/helpers/direct-code-group.cjs"),{ownBindings}=require("../packages/component-contract-core/tests/helpers/code-passport.cjs");
test('v4 accepts the shared marked predicate contract without promoting its Code Draft; malformed marker/binding is rejected',()=>{
 const f=ownBindings(scenario()),c=JSON.parse(JSON.stringify(core.compileManualSource(f.manual,f.evidence,[f.childContract]).contract));
 assert.equal(c.status,'ready');assert.equal(runtime.loadRuntimeContract(c),c);assert.equal(c.facts.representations.at(-1).codeEvidence.parity.status,'not-confirmed');
 for(const mutate of [c=>delete c.runtimePolicy.crossRepresentationBindingsVersion,c=>c.runtimePolicy.crossRepresentationBindingsVersion=2,c=>c.facts.semanticApi[0].bindings[0].ownedOccurrence.transformId='arbitrary',c=>c.facts.representations.at(-1).codeEvidence.acceptance.status='accepted']){const bad=JSON.parse(JSON.stringify(c));mutate(bad);assert.throws(()=>runtime.loadRuntimeContract(bad),/Unsupported representation evidence\/bindings/);}
});
