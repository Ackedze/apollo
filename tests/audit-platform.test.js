const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const Module=require('node:module'),esbuild=require('esbuild');
const C=require('../packages/component-contract-core/dist/core.cjs'),fixtures=require('./fixtures');
const engine=require('../packages/component-contract-core/dist/predicate.cjs');
const built=esbuild.buildSync({entryPoints:[path.join(__dirname,'../src/audit-platform.ts')],bundle:true,platform:'node',format:'cjs',write:false});
const moduleUnderTest=new Module(__filename);moduleUnderTest._compile(built.outputFiles[0].text,__filename);
const {applyAuditPlatform}=moduleUnderTest.exports;
function fixture(){
 const contract=fixtures.contract(),snapshot=fixtures.snapshot();
 contract.runtimePolicy.validationIntentVersion=2;
 contract.facts.validationContext=[{id:'ViewportClass',valueType:'enum',domain:['desktop','mobile-web'],label:'Платформа проверки'}];
 contract.facts.representations[0].locator.componentSetKey='test-set';
 Object.assign(snapshot.source,{pageId:'test-page',componentSetKey:'test-set'});
 snapshot.nodes[0].component.identity={componentKey:'test-key',componentSetKey:'test-set'};
 contract.rules[0].assert={predicate:'one-of',actual:{fact:'expectedInput.ViewportClass'},expected:{literal:['desktop']},missingPolicy:'unknown'};
 return{snapshot,contract};
}
function result(f){C.materializeValidationIntent(f.snapshot,f.contract);return engine.evaluateRules({snapshot:f.snapshot,rules:f.contract.rules}).evaluations[0];}
test('explicit platform matches or conflicts without changing the captured component platform',()=>{
 for(const [platform,classification] of [['desktop','compliant'],['mobile-web','violation']]){
  const f=fixture();applyAuditPlatform(f.snapshot,f.contract,platform);
  assert.equal(f.snapshot.context.platform,'desktop');assert.equal(f.snapshot.validationIntent.values.ViewportClass,platform);
  assert.equal(result(f).classification,classification);
 }
});
test('missing, unsupported or undeclared platform never falls back to the component',()=>{
 for(const platform of [undefined,null,'Desktop','ios','invented']){
  const f=fixture();applyAuditPlatform(f.snapshot,f.contract,platform);assert.equal(f.snapshot.validationIntent,undefined);assert.equal(result(f).classification,'human-review');
 }
 const f=fixture();delete f.contract.facts.validationContext;applyAuditPlatform(f.snapshot,f.contract,'desktop');assert.equal(f.snapshot.validationIntent,undefined);
});
test('replayed intent remains bound to the exact contract and native subject',()=>{
 for(const mutate of [f=>f.snapshot.validationIntent.manualSourceHash='b'.repeat(64),f=>f.snapshot.validationIntent.subject.rootNodeId='another-root']){
  const f=fixture();applyAuditPlatform(f.snapshot,f.contract,'desktop');mutate(f);assert.equal(result(f).classification,'human-review');
 }
});
