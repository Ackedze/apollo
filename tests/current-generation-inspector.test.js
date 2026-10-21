const test=require('node:test'),assert=require('node:assert/strict');
const {sourceReadyMappings}=require("../scripts/inspect-current-generation-inputs.cjs");
const {currentFixture}=require("../packages/generation-core/tests/current-producer-fixtures.cjs");
test('Ready inspection excludes scoped compiled Ready with full Source Draft without changing the producer',()=>{
 const f=currentFixture(),group=f.raw.mappings[1];
 group.contract.sourcePredicateStatus='draft';group.contract.compiledStatus='ready';
 const before=JSON.stringify(f.raw),selected=sourceReadyMappings(f.raw);
 assert.deepEqual(selected.map(m=>m.id),['content','mobile-content']);
 assert.equal(JSON.stringify(f.raw),before);
 group.contract.compiledStatus='draft';assert.deepEqual(sourceReadyMappings(f.raw).map(m=>m.id),['content','mobile-content']);
});
test('Source Ready alone cannot admit compiled Draft or unknown/missing source status into the inspected subset',()=>{
 const f=currentFixture();f.raw.mappings[0].contract.compiledStatus='draft';
 delete f.raw.mappings[1].contract.sourcePredicateStatus;
 assert.deepEqual(sourceReadyMappings(f.raw).map(m=>m.id),['mobile-content']);
 f.raw.mappings[1].contract.sourcePredicateStatus='Ready';
 assert.deepEqual(sourceReadyMappings(f.raw).map(m=>m.id),['mobile-content']);
});
