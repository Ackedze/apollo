const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createPromptContractReader}=require("../scripts/generation-prompt-inputs");
const {hash}=require("../packages/generation-core/tests/planning-fixtures.cjs"),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function setup(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'apollo-prompt-synthetic-')),apolloRoot=path.join(root,'apollo'),catalog=path.join(root,'catalog');fs.mkdirSync(path.join(apolloRoot,'dist'),{recursive:true});fs.mkdirSync(catalog);
 fs.writeFileSync(path.join(apolloRoot,'input.js'),'synthetic');fs.writeFileSync(path.join(apolloRoot,'dist/runtime.cjs'),'synthetic runtime');fs.writeFileSync(path.join(apolloRoot,'dist/build-inputs.json'),JSON.stringify({profileVersion:'synthetic',inputs:[{path:'input.js',sha256:sha('synthetic')}]}));
 const manuals=[{component:{componentId:'child',contractId:'child-contract'},metadata:{revision:1},rules:[{text:'Synthetic child norm'}],semanticApi:[],componentDependencies:[]}];
 manuals.push({component:{componentId:'host',contractId:'host-contract'},metadata:{revision:2},rules:[{text:'Synthetic host norm'}],semanticApi:[{id:'Body'}],componentDependencies:[{componentId:'child',revision:1,manualSourceHash:hash(manuals[0]),compiledHash:hash('compiled')} ]});
 const pins=manuals.map(m=>{const bytes=Buffer.from(JSON.stringify(m)),file=path.join(catalog,m.component.componentId+'.zip');fs.writeFileSync(file,bytes);return {componentId:m.component.componentId,contractId:m.component.contractId,revision:m.metadata.revision,archivePath:path.relative(root,file),archiveSha256:sha(bytes),manualSourceHash:hash(m),sourcePredicateStatus:'draft',compiledStatus:'ready'};});
 const registry={registryVersion:'1.1.0',registryDigest:hash('registry'),currentInputs:{packages:pins},mappings:[{id:'host-map',kind:'corporate-content',platforms:['desktop'],contract:pins[1],code:{proposedRepresentationId:'code',api:[]},propertyMappings:[],status:{sourcePredicate:'draft'}}]};
 const runtime={RUNTIME_VERSION:'synthetic',contractHash:hash,sourceFromFiles:files=>({manual:JSON.parse(files[0].text)})};
 const read=createPromptContractReader({apolloRoot,repo:root,catalog,workspaceRoot:root,hash,runtime,readZip:async b=>[{name:'manual.json',data:b}],readProducer:()=>({registry,assertCurrent(){}})});
 return {root,apolloRoot,catalog,pins,read,registry};
}
test('uses pinned own manuals and dependency closure without upgrading Draft or running Ready compile',async()=>{
 const f=setup();try{const context=await f.read({platform:'desktop'});assert.equal(context.contracts.length,2);assert.ok(context.contracts.every(c=>c.sourceStatus==='draft'));assert.ok(context.packet.contracts.some(c=>c.manual.rules[0].text==='Synthetic child norm'));assert.equal(context.packet.executionAllowed,false);
 fs.writeFileSync(path.join(f.apolloRoot,'input.js'),'edited');assert.throws(context.assertCurrent,/PROMPT_INPUTS_STALE/);}finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('wrong archive hash and wrong own manual pin fail before a context is returned',async()=>{
 for(const edit of [f=>fs.writeFileSync(path.join(f.catalog,'host.zip'),'changed'),f=>f.pins[1].manualSourceHash=hash('foreign')]){const f=setup();try{edit(f);await assert.rejects(f.read({platform:'desktop'}),/PROMPT_INPUTS_STALE/);}finally{fs.rmSync(f.root,{recursive:true,force:true});}}
});
