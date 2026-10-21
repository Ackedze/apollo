const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const g=require('../dist/index.cjs'),runtime=require('../../../dist/runtime.cjs'),core=require('../../component-contract-core/dist/core.cjs'),f=require('../../../tests/authoring-fixtures');
const clone=v=>JSON.parse(JSON.stringify(v)),sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const identity={coreVersion:'0.1.10',profileVersion:runtime.RUNTIME_VERSION,runtimeSha256:'a'.repeat(64),buildInputsSha256:'b'.repeat(64)},ports={runtime,readZip:core.readZip,identity};
function build(source,name='source',edit){
 const children=source.dependencies.map(s=>core.compileManualSource(s.manual,s.variantEvidence,[]).contract);
 const contract=clone(core.compileManualSource(source.manual,source.variantEvidence,children).contract);
 if(edit)edit(contract);
 const manual=Buffer.from(JSON.stringify(source.manual)),entries=[core.textZipEntry('contract.manual.json',source.manual),core.textZipEntry('compiled/component-contract.v2.json',contract)];
 const archive={name:name+'.zip',archivePath:'synthetic/'+name+'.zip',bytes:core.createZip(entries),main:{path:'synthetic/'+name+'.manual.json',bytes:manual}};
 const pin={componentId:source.manual.component.componentId,contractId:source.manual.component.contractId,revision:source.manual.metadata.revision,archivePath:archive.archivePath,archiveSha256:sha(archive.bytes),manualPath:archive.main.path,mainManualSha256:sha(manual),manualSourceHash:runtime.contractHash(source.manual),compiledHash:runtime.contractHash(contract),dependencyPins:(source.manual.componentDependencies||[]).map(p=>({componentId:p.componentId,revision:p.revision,manualSourceHash:p.manualSourceHash,compiledHash:p.compiledHash}))};
 return {archive,pin};
}
function draft(){const s=f.source();for(let i=0;i<9;i++)s.manual.rules.push(Object.assign({},clone(s.manual.rules[0]),{id:'synthetic.context.'+i,execution:{route:'context-only'}}));return s;}
const read=rows=>g.readAuthoringPackageReview(rows.map(r=>r.archive),rows.map(r=>r.pin),ports);
test('Draft context rules stay metadata and strict loader still rejects them',async()=>{
 const s=draft(),before=JSON.stringify(s),r=await read([build(s)]),m=r.sources[0].metadata;
 assert.equal(m.compiledStatus,'draft');assert.equal(m.coverage.nonExecutableRuleIds.length,9);assert.equal(m.coverage.pendingRoutes.length,9);
 assert.equal(r.accepted,false);assert.equal(r.executionAllowed,false);assert.equal(r.sources[0].contract,undefined);assert.equal(r.lock,undefined);
 assert.throws(()=>runtime.loadRuntimeContract(r));assert.throws(()=>runtime.loadRuntimeContract(runtime.reviewAuthoringSource(s)));
 await assert.rejects(g.loadContractPackages([build(s).archive],ports),{code:'SOURCE_COMPILE'});assert.equal(JSON.stringify(s),before);
});
test('standard compiler errors survive review without being accepted',async()=>{const s=f.source();s.manual.rules[0].targetId='synthetic-missing';const r=await read([build(s)]);assert.ok(r.sources[0].metadata.issues.some(i=>i.level==='error'&&i.code==='RULE_TARGET'));assert.equal(r.sources[0].metadata.compiledStatus,'draft');});
test('Ready source review is still unaccepted; deterministic closure uses each own main',async()=>{const n=f.nested(),rows=[build(n.source,'host'),build(n.childSource,'child')],a=await read(rows),b=await read(rows.reverse());assert.equal(a.reviewHash,b.reviewHash);assert.equal(a.sources.length,2);assert.equal(a.accepted,false);assert.ok(a.sources.every(s=>s.metadata.compiledStatus==='ready'));});
for(const [name,edit,code]of [
 ['ZIP bytes',r=>r.archive.bytes=Buffer.concat([r.archive.bytes,Buffer.from([0])]),'REVIEW_SOURCE_STALE'],
 ['main byte formatting',r=>r.archive.main.bytes=Buffer.concat([r.archive.main.bytes,Buffer.from(' ')]),'REVIEW_SOURCE_STALE'],
 ['main semantic norms',r=>{const m=JSON.parse(r.archive.main.bytes);m.rules[0].constraints[0].values=[.5];r.archive.main.bytes=Buffer.from(JSON.stringify(m));r.pin.mainManualSha256=sha(r.archive.main.bytes);},'REVIEW_MAIN_MISMATCH'],
 ['compiled pin',r=>r.pin.compiledHash='e'.repeat(64),'REVIEW_COMPILE_STALE'],
 ['authoritative revision',r=>r.pin.revision++,'REVIEW_MAIN_MISMATCH'],
 ['dependency pin',r=>r.pin.dependencyPins=[{componentId:'synthetic-unknown'}],'REVIEW_DEPENDENCY_PIN'],
 ['unsafe source path',r=>r.archive.archivePath='../outside.zip','REVIEW_ARCHIVE_INPUT']
])test(name+' is rejected for review',async()=>{const r=build(f.source());edit(r);await assert.rejects(read([r]),{code});});
test('embedded child cannot replace a missing child authoring ZIP',async()=>{const n=f.nested();await assert.rejects(read([build(n.source)]),{code:'REVIEW_DEPENDENCY_MISSING'});});
test('a modified cached predicate cannot provide review norms even with a recomputed pin',async()=>{const r=build(f.source(),'source',c=>c.rules[0].assert.expected={literal:.5});await assert.rejects(read([r]),{code:'APOLLO_V4_SOURCE_INVALID'});});
test('unknown manual/facts schemas and compiled-only inputs cannot enter metadata reader',()=>{const s=f.source();s.manual.schemaVersion='future';assert.throws(()=>runtime.reviewAuthoringSource(s));const s2=f.source();s2.variantEvidence.schemaVersion='future';assert.throws(()=>runtime.reviewAuthoringSource(s2));assert.throws(()=>runtime.reviewAuthoringSource(runtime.loadAuthoringSource(f.source()).contract));});
test('duplicate ZIP entries reject before import',async()=>{const r=build(f.source());const e=core.textZipEntry('contract.manual.json',f.source().manual);r.archive.bytes=core.createZip([e,e]);r.pin.archiveSha256=sha(r.archive.bytes);await assert.rejects(read([r]),{code:'REVIEW_ENTRY_NAME'});});
test('source dependency cycle rejects before serialization',()=>{const n=f.nested(),pin=clone(n.source.manual.componentDependencies[0]);pin.componentId=n.source.manual.component.componentId;n.source.dependencies[0].manual.componentDependencies=[pin];n.source.dependencies[0].dependencies=[n.source];assert.throws(()=>runtime.reviewAuthoringSource(n.source),/Цикл/);});
test('review facts remain mandatory; no inference fallback',()=>{const s=f.source();delete s.variantEvidence;assert.throws(()=>runtime.reviewAuthoringSource(s));});
test('runtime identity version mismatch rejects source review',async()=>{const r=build(f.source());await assert.rejects(g.readAuthoringPackageReview([r.archive],[r.pin],Object.assign({},ports,{identity:Object.assign({},identity,{profileVersion:'future'})})),{code:'REVIEW_IDENTITY'});});
test('review result schema from the runtime is checked independently',async()=>{const r=build(f.source());const fake=Object.assign({},runtime,{reviewAuthoringSource(s){const v=runtime.reviewAuthoringSource(s);v.schemaVersion='future';return v;}});await assert.rejects(g.readAuthoringPackageReview([r.archive],[r.pin],Object.assign({},ports,{runtime:fake})),{code:'REVIEW_RUNTIME_RESULT'});});

