const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {bindingFixture,digest}=require("./static-binding-fixture.cjs");
const {loadConsumerBinding,verifyV1Output}=require("../scripts/static-review-consumer-binding.cjs");
function run(fn){const f=bindingFixture();try{return fn(f);}finally{f.cleanup();}}
test('detached local receipt proves the complete byte closure without source/execution acceptance',()=>run(f=>{const c=loadConsumerBinding(f.args);assert.equal(c.result.status,'matches');assert.equal(c.result.checkedFiles,f.v1Files.length);assert.equal(f.receipt.accepted,false);assert.equal(f.receipt.executionAllowed,false);assert.equal(c.result.buildHash,f.receipt.final.buildManifestPin.sha256);c.assertCurrent();}));
test('missing local trust pin is unverified rather than selected by an imported object',()=>{const c=loadConsumerBinding({imported:{receiptPin:{path:'/tmp/untrusted',sha256:'a'.repeat(64)}}});assert.equal(c.result.status,'unverified');assert.equal(c.result.diagnosticCode,'CONSUMER_BINDING_PIN_REQUIRED');});
for(const [name,edit,code]of [
 ['N01 config whitespace',f=>fs.appendFileSync(f.args.configPath,' '),'CONSUMER_BINDING_STALE'],
 ['N01 different snapshot selector',f=>{f.receipt.selection.manifestPin=f.receipt.selection.reportPin;f.refresh();},'CONSUMER_BINDING_SELECTOR'],
 ['N01 wrong manifest hash',f=>{f.args.manifestPin.sha256='a'.repeat(64);},'CONSUMER_BINDING_SELECTOR'],
 ['N02 wrong external receipt pin',f=>{f.args.receiptPin.sha256='a'.repeat(64);},'CONSUMER_BINDING_STALE'],
 ['N02 relative external path',f=>{f.args.receiptPin.path='receipt.json';},'CONSUMER_BINDING_PIN_INVALID'],
 ['N02 arbitrary receipt version',f=>{f.receipt.schemaVersion='future';f.refresh();},'CONSUMER_BINDING_SCHEMA'],
 ['N02 extra authority',f=>{f.receipt.native='accepted';f.refresh();},'CONSUMER_BINDING_SCHEMA'],
 ['N03 archived C0 whitespace',f=>fs.appendFileSync(f.receipt.preselection.configArchivePin.path,' '),'CONSUMER_BINDING_ARCHIVE_STALE'],
 ['N03 missing archive',f=>fs.unlinkSync(f.receipt.preselection.configArchivePin.path),'CONSUMER_BINDING_FILE_MISSING'],
 ['N03 omitted config in V0',f=>{const p=f.receipt.preselection.vectorPin.path,v=JSON.parse(fs.readFileSync(p));v.files=v.files.filter(p=>p.path!==f.args.configPath);f.receipt.preselection.vectorPin=f.put(p,v);f.refresh();},'CONSUMER_BINDING_BASELINE_OMITTED'],
 ['N04 edited final vector',f=>fs.appendFileSync(f.receipt.final.vectorPin.path,' '),'CONSUMER_BINDING_STALE'],
 ['N04 edited standard manifest',f=>fs.appendFileSync(f.args.buildManifestPath,' '),'CONSUMER_BINDING_STALE'],
 ['N05 omitted manual',f=>{f.receipt.closurePins=f.receipt.closurePins.filter(p=>p.path!==f.sourceFiles[1].path);f.refresh();},'CONSUMER_BINDING_CLOSURE_OMITTED'],
 ['N05 omitted dependency package',f=>{f.receipt.closurePins=f.receipt.closurePins.filter(p=>p.path!==f.sourceFiles[0].path);f.refresh();},'CONSUMER_BINDING_CLOSURE_OMITTED'],
 ['N07 rollback config to C0',f=>fs.copyFileSync(f.receipt.preselection.configArchivePin.path,f.args.configPath),'CONSUMER_BINDING_STALE'],
 ['N07 replay another config',f=>{f.args.configPath=f.root+'/other-config.json';},'CONSUMER_BINDING_SELECTOR'],
 ['N07 replay another build',f=>{f.args.buildManifestPath=f.root+'/other-build.json';},'CONSUMER_BINDING_SELECTOR'],
 ['N08 receipt accepted forgery',f=>{f.receipt.accepted=true;f.refresh();},'CONSUMER_BINDING_SCHEMA'],
 ['N09 post-receipt readback field',f=>{f.receipt.readbackPin={path:f.root+'/readback.json',sha256:'a'.repeat(64)};f.refresh();},'CONSUMER_BINDING_SCHEMA'],
 ['N09 post-receipt addition',f=>{f.receipt.additions.push({role:'readback',pin:{path:f.root+'/readback.json',sha256:'a'.repeat(64)}});f.refresh();},'CONSUMER_BINDING_ADDITION']
])test(name+' rejects',()=>run(f=>{edit(f);assert.throws(()=>loadConsumerBinding(f.args),{code});}));
test('N03 whitespace cannot be blessed merely by changing receipt/V1 hashes',()=>run(f=>{fs.appendFileSync(f.args.configPath,' ');f.receipt.selection.configPin=f.pin(f.args.configPath);f.refresh();assert.throws(()=>loadConsumerBinding(f.args),{code:'CONSUMER_BINDING_CONFIG_DELTA'});}));
test('N03 full V0→V1 inventory rejects an additional source delta even if rehashed',()=>run(f=>{const p=f.receipt.final.vectorPin.path,v=JSON.parse(fs.readFileSync(p));v.files.find(p=>p.path===f.buildPins[0].path).sha256='a'.repeat(64);f.receipt.final.vectorPin=f.put(p,v);f.refresh();assert.throws(()=>loadConsumerBinding(f.args),{code:'CONSUMER_BINDING_UNAUTHORIZED_DELTA'});}));
test('N09 preselection producer/backreference is rejected',()=>run(f=>{const p=f.receipt.final.vectorPin.path,v=JSON.parse(fs.readFileSync(p));v.files.push(f.args.receiptPin);f.receipt.final.vectorPin=f.put(p,v);f.refresh();assert.throws(()=>loadConsumerBinding(f.args),{code:'CONSUMER_BINDING_VECTOR_OMITTED'});}));
for(const index of [0,1])test('N04 every original and added standard build input is checked '+index,()=>run(f=>{fs.appendFileSync(f.buildPins[index].path,'changed');assert.throws(()=>loadConsumerBinding(f.args),{code:'CONSUMER_BINDING_STALE'});}));
for(let index=0;index<10;index++)test('N05 archive/manual closure drift '+index,()=>run(f=>{fs.appendFileSync(f.sourceFiles[index].path,'changed');assert.throws(()=>loadConsumerBinding(f.args),{code:'CONSUMER_BINDING_STALE'});}));
for(const relative of ['producer/api.d.ts','producer/registry.json','producer/lock.json','proxy/static-review-service.js','apollo/dist/runtime.cjs','apollo/dist/code.js','apollo/dist/ui.html','apollo/scripts/static-producer-review-inputs.cjs','apollo/packages/generation-core/dist/index.cjs'])test('N04/05 runtime/API closure drift '+relative,()=>run(f=>{fs.appendFileSync(f.root+'/'+relative,'changed');assert.throws(()=>loadConsumerBinding(f.args),{code:'CONSUMER_BINDING_STALE'});}));
test('N07 freshness checks before, during and after async work',async()=>{for(const phase of ['before','during','after']){const f=bindingFixture();try{if(phase==='before'){fs.appendFileSync(f.buildPins[0].path,'edit');assert.throws(()=>loadConsumerBinding(f.args),{code:'CONSUMER_BINDING_STALE'});continue;}const c=loadConsumerBinding(f.args);const work=Promise.resolve().then(()=>{if(phase==='during')fs.appendFileSync(f.args.receiptPin.path,' ');});await work;if(phase==='after')fs.appendFileSync(f.outputs[0].path,' ');assert.throws(c.assertCurrent,{code:'CONSUMER_BINDING_READ_CHANGED'});}finally{f.cleanup();}}});

test('malformed nested receipt pins stay bounded',()=>run(f=>{f.receipt.selection.configPin=null;f.refresh();assert.throws(()=>loadConsumerBinding(f.args),{code:'CONSUMER_BINDING_SCHEMA'});}));
test('N04 original build input cannot be removed from a rehashed manifest',()=>run(f=>{const p=f.args.buildManifestPath,v=JSON.parse(fs.readFileSync(p));v.inputs=v.inputs.filter(p=>p.path!=='src/original.ts');f.receipt.final.buildManifestPin=f.put(p,v);f.refresh();assert.throws(()=>loadConsumerBinding(f.args),{code:'CONSUMER_BINDING_BUILD_OMITTED'});}));
test('N04 new input cannot be omitted from final vector build coverage',()=>run(f=>{const p=f.receipt.final.vectorPin.path,v=JSON.parse(fs.readFileSync(p));v.buildInputs=v.buildInputs.filter(p=>p.path!==f.buildPins[1].path);f.receipt.final.vectorPin=f.put(p,v);f.refresh();assert.throws(()=>loadConsumerBinding(f.args),{code:'CONSUMER_BINDING_BUILD_OMITTED'});}));
test('N04 UI runtime pin cannot be omitted',()=>run(f=>{f.receipt.final.runtimePins=f.receipt.final.runtimePins.filter(p=>!p.path.endsWith('/ui.html'));f.refresh();assert.throws(()=>loadConsumerBinding(f.args),{code:'CONSUMER_BINDING_RUNTIME_OMITTED'});}));
test('N07 path substitution after validation rejects even identical bytes',()=>run(f=>{const c=loadConsumerBinding(f.args),p=f.buildPins[0].path,copy=f.root+'/identical.ts';fs.copyFileSync(p,copy);fs.unlinkSync(p);fs.symlinkSync(copy,p);assert.throws(c.assertCurrent,{code:'CONSUMER_BINDING_PATH'});}));

// Re-anchor invented metadata only in this owned temporary fixture; no real producer snapshots.
function refreshSyntheticHeader(f,edit){
 const a=JSON.parse(fs.readFileSync(f.args.manifestPin.path));edit(a);delete a.artifactDigest;a.artifactDigest=digest(a);
 const manifest=f.put(f.args.manifestPin.path,a),report=JSON.parse(fs.readFileSync(f.args.reportPin.path));
 for(const row of report.outputs){const doc=JSON.parse(fs.readFileSync(row.path));doc.observation.artifactDigest=a.artifactDigest;delete doc.observation.observationHash;doc.observation.observationHash=digest(doc.observation);row.sha256=f.put(row.path,doc).sha256;row.observationHash=doc.observation.observationHash;}
 f.receipt.producer.outputs=report.outputs;
 report.producerManifest={sha256:manifest.sha256,artifactDigest:a.artifactDigest};const basis=f.put(f.args.reportPin.path,report);
 f.receipt.producer.manifestPin=manifest;f.receipt.producer.basisPin=basis;f.receipt.producer.artifactDigest=a.artifactDigest;
 f.receipt.selection.manifestPin=manifest;f.receipt.selection.reportPin=basis;f.args.manifestPin=manifest;f.args.reportPin=basis;
 f.config.manifestPin.sha256=manifest.sha256;f.config.reportPin.sha256=basis.sha256;f.receipt.selection.configPin=f.put(f.args.configPath,f.config);f.refresh();
}
for(const index of [0,1])test('N04 producer cannot omit original or added build input '+index,()=>run(f=>{refreshSyntheticHeader(f,a=>a.buildInputs.splice(index,1));f.receipt.closurePins=f.receipt.closurePins.filter(p=>p.path!==f.buildPins[index].path);f.refresh();assert.throws(()=>loadConsumerBinding(f.args),{code:'CONSUMER_BINDING_BUILD_OMITTED'});}));
test('N05 frozen dependency omission is rejected against independent pinned lock',()=>run(f=>{refreshSyntheticHeader(f,a=>a.frozen.inputPackages.shift());assert.throws(()=>loadConsumerBinding(f.args),{code:'CONSUMER_BINDING_SOURCE'});}));

test('N02 unsupported nested producer wire cannot gain a binding from rehashed pins',()=>run(f=>{refreshSyntheticHeader(f,a=>a.outputVersion='future');assert.throws(()=>loadConsumerBinding(f.args),{code:'CONSUMER_BINDING_PRODUCER'});}));

test('immutable v1 wire uses nested observation and Generation identities only',()=>run(f=>{const o=f.outputs[0],doc=JSON.parse(fs.readFileSync(o.path)),manifest=JSON.parse(fs.readFileSync(f.args.manifestPin.path));assert.equal(Object.hasOwn(doc,'observationHash'),false);assert.equal(Object.hasOwn(doc,'generationPlanHash'),false);assert.equal(verifyV1Output(doc,o,manifest).observationHash,doc.observation.observationHash);assert.equal(loadConsumerBinding(f.args).result.status,'matches');}));
for(const [name,edit]of [['top-level observation field',d=>d.observationHash=d.observation.observationHash],['top-level Generation field',d=>d.generationPlanHash=null],['nested Generation forgery',d=>d.plan.generationPlanHash='a'.repeat(64)],['observation authority',d=>d.observation.executionAllowed=true],['plan content drift',d=>d.plan.content.synthetic=999]])test('v1 nested wire rejects '+name,()=>run(f=>{const o=f.outputs[0],doc=JSON.parse(fs.readFileSync(o.path)),a=JSON.parse(fs.readFileSync(f.args.manifestPin.path));edit(doc);assert.throws(()=>verifyV1Output(doc,o,a),{code:'CONSUMER_BINDING_OUTPUT'});}));
