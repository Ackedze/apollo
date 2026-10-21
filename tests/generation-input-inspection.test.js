const test=require('node:test'),assert=require('node:assert/strict');
const {inspectGenerationInputs}=require("../scripts/inspect-generation-inputs");
const verified=()=>({status:'availability-pass',targetProduct:'apollo-v4',fullContractParity:'not-confirmed',registry:{digest:'a'.repeat(64)}});
test('actual producer API approval and Ready source acceptance have separate gates',async()=>{
 const r=await inspectGenerationInputs({verifyCode:verified,verifySources(){throw Object.assign(new Error(),{code:'SOURCE_COMPILE'});}});
 assert.equal(r.apiAvailability,'confirmed');assert.equal(r.sourceReadiness,'blocked');assert.equal(r.preflight,'blocked');
 assert.deepEqual(r.actualTargets,{figma:'not-run',frontend:'not-run'});assert.equal(r.diagnostics[0].code,'SOURCE_COMPILE');
});
test('stale/missing public export stops before source or target creation',async()=>{
 let reads=0;const r=await inspectGenerationInputs({verifyCode(){throw Object.assign(new Error(),{code:'MISSING_PUBLIC_EXPORT'});},verifySources(){reads++;}});
 assert.equal(r.apiAvailability,'blocked');assert.equal(r.sourceReadiness,'unverified');assert.equal(reads,0);
});
test('source readiness alone cannot fabricate a frozen plan or accepted target',async()=>{
 const r=await inspectGenerationInputs({verifyCode:verified,verifySources(){}});assert.equal(r.sourceReadiness,'ready');
 assert.equal(r.preflight,'blocked');assert.equal(r.diagnostics[0].code,'PLAN_AND_MAPPING_NORMALIZATION_REQUIRED');
});
const {selectPinnedClosure}=require("../scripts/generation-package-inputs");
const {hash}=require("../packages/generation-core/tests/planning-fixtures.cjs");
function record(name,id,revision,deps=[]) {const source={manual:{component:{componentId:id},metadata:{revision},componentDependencies:deps}};return{archive:{name,bytes:Buffer.from(name)},archiveSha256:hash(name),source};}
test('desktop roots use exact registry archive SHA while separate mobile source cannot shadow the same ID',()=>{
 const child=record('child.zip','child',1),desktop=record('desktop.zip','same-family',57,[{componentId:'child',revision:1,manualSourceHash:hash(child.source.manual)}]),mobile=record('mobile.zip','same-family',1);
 const selected=selectPinnedClosure([mobile,child,desktop],[{name:'desktop.zip',archiveSha256:desktop.archiveSha256}],{contractHash:hash});
 assert.deepEqual(selected.map(a=>a.name),['child.zip','desktop.zip']);
 assert.throws(()=>selectPinnedClosure([mobile,child,desktop],[{name:'desktop.zip',archiveSha256:hash('stale')}],{contractHash:hash}),e=>e.code==='STALE_CONTRACT_PIN');
});
test('dependency selection rejects ambiguous/missing own source instead of choosing a sibling',()=>{
 const child=record('child.zip','child',1),other=record('another.zip','child',1),host=record('host.zip','host',1,[{componentId:'child',revision:1,manualSourceHash:hash(child.source.manual)}]);
 const roots=[{name:'host.zip',archiveSha256:host.archiveSha256}];
 assert.throws(()=>selectPinnedClosure([host],roots,{contractHash:hash}),e=>e.code==='MISSING_DEPENDENCY');
 assert.throws(()=>selectPinnedClosure([host,child,other],roots,{contractHash:hash}),e=>e.code==='SOURCE_SELECTION_AMBIGUOUS');
});
