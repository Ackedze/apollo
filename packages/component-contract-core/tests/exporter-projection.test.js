const test=require('node:test'),assert=require('node:assert/strict'),core=require('../dist/core.cjs');
const {fixture}=require('./helpers/asset-identity-lock.cjs');
function input(){const f=fixture(core);f.manual.source.importedFiles=['Descriptive package label'];const generated={schemaVersion:'apollo.ds-contracts.v1',contracts:[{id:f.manual.component.contractId,componentKey:'group-set',figma:{defaultVariantKey:'group-variant',structureSignature:[{nodeId:1,parentId:null,name:'Group',type:'COMPONENT'},{nodeId:2,parentId:1,name:'Text',type:'TEXT',text:'Original text'}],variants:{variantKeys:[{key:'group-variant',properties:{}}]},variantStructures:{}}}]};const files=[{name:'contract.manual.json',text:JSON.stringify(f.manual)},{name:'evidence/contract.generated.json',text:JSON.stringify(generated)}];return {f,files,workspace:core.importWorkspace(files)};}
test('explicit historical projection supplies only a stamp after exact recompilation; dependency pins survive real ZIP bytes',async()=>{
 const {files,workspace:w}=input(),fresh=core.buildExportBundle(w.manual,w.variantEvidence),projection=JSON.parse(JSON.stringify(fresh.compiled));projection.package.sourceExportVersion='component-contract-editor@0.2.33';
 const bundle=core.buildExportBundle(w.manual,w.variantEvidence,w.dependencyContracts,{projection});assert.equal(core.stableHash(bundle.compiled),core.stableHash(projection));
 const entries=await core.readZip(core.buildAuthoringZip(bundle,files)),reopened=core.importWorkspace(entries.map(e=>({name:e.name,text:core.zipEntryText(e)})));
 assert.deepEqual(reopened.manual,w.manual);assert.deepEqual(reopened.variantEvidence,w.variantEvidence);assert.equal(core.stableHash(reopened.compiledInput),core.stableHash(projection));
 assert.ok(entries.some(e=>e.name.endsWith('/source/contract.generated.json')));
});
test('stale source, cached predicates, changed anatomy and incomplete input inventory fail closed',()=>{
 const {files,workspace:w}=input(),projection=core.buildExportBundle(w.manual,w.variantEvidence).compiled;
 for(const mutate of [p=>p.package.manualSourceHash='a'.repeat(64),p=>p.rules[0].assert={predicate:'always'},p=>p.package.sourceExportVersion='untrusted']){const p=JSON.parse(JSON.stringify(projection));mutate(p);assert.throws(()=>core.buildExportBundle(w.manual,w.variantEvidence,[],{projection:p}),/EXPORT_PROJECTION/);}
 const bundle=core.buildExportBundle(w.manual,w.variantEvidence,[],{projection});const changed=JSON.parse(files[1].text);changed.contracts[0].figma.structureSignature[1].text='Changed input';
 assert.throws(()=>core.buildAuthoringZip(bundle,[{name:files[1].name,text:JSON.stringify(changed)}]),/EXPORT_FACTS_MISMATCH/);
 const bad=JSON.parse(JSON.stringify(w.variantEvidence));bad.variants[0].properties.Size='unknown';assert.throws(()=>core.buildExportBundle(w.manual,bad,[],{projection}),/EXPORT_PROJECTION/);
 const evil=files.concat({name:'../foreign.json',text:'{}'});assert.throws(()=>core.buildAuthoringZip(bundle,evil),/EXPORT_EVIDENCE_PATH/);
});
