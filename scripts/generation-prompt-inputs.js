// Planning reads authoring norms. It never produces a Ready view or execution evidence.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {selectPinnedClosure}=require("./generation-package-inputs");
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
function createPromptContractReader({apolloRoot,repo,catalog,workspaceRoot,hash,runtime,readZip,
  readProducer=require("./generation-current-producer").loadCurrentProducer}) {
 return async function readPromptContext(input) {
  const producer=readProducer({repo,workspaceRoot,hash}),registry=producer.registry;
  if(registry.registryVersion!=='1.1.0')fail('PROMPT_CURRENT_INPUTS_REQUIRED');
  const files=new Map();
  const read=(file,pin)=>{const bytes=fs.readFileSync(file),digest=sha(bytes);if(pin&&digest!==pin)fail('PROMPT_INPUTS_STALE');files.set(file,digest);return bytes;};
  const build=JSON.parse(read(path.join(apolloRoot,'dist/build-inputs.json')));
  if(build.profileVersion!==runtime.RUNTIME_VERSION||!Array.isArray(build.inputs)||!build.inputs.length)fail('RUNTIME_IDENTITY');
  read(path.join(apolloRoot,'dist/runtime.cjs'));
  for(const p of build.inputs){const file=path.resolve(apolloRoot,p.path);if(!file.startsWith(path.resolve(apolloRoot)+path.sep))fail('RUNTIME_IDENTITY');read(file,p.sha256);}
  const mappings=registry.mappings.filter(m=>m.platforms.length===1&&m.platforms[0]===input.platform);
  if(!mappings.length)fail('PROMPT_PLATFORM_UNAVAILABLE');
  const records=[],decoder=new TextDecoder('utf-8',{fatal:true});
  for(const pin of registry.currentInputs.packages){
   const file=path.resolve(workspaceRoot,pin.archivePath);
   if(path.dirname(file)!==path.resolve(catalog)||!fs.realpathSync(file).startsWith(fs.realpathSync(catalog)+path.sep))fail('CONTRACT_CATALOG_MISMATCH');
   const bytes=read(file,pin.archiveSha256);if(bytes.length>64*1024*1024)fail('ARCHIVE_LIMIT');
   const entries=await readZip(bytes);
   if(entries.length>200||entries.reduce((s,e)=>s+e.data.length,0)>128*1024*1024)fail('ENTRY_LIMIT');
   const source=runtime.sourceFromFiles(entries.filter(e=>/\.json$/i.test(e.name)).map(e=>({name:e.name,text:decoder.decode(e.data)})));
   if(source.manual.component.componentId!==pin.componentId||source.manual.component.contractId!==pin.contractId
    ||source.manual.metadata.revision!==pin.revision||hash(source.manual)!==pin.manualSourceHash)fail('PROMPT_INPUTS_STALE');
   records.push({archive:{name:path.basename(file),bytes},archiveSha256:pin.archiveSha256,source,pin});
  }
  const selected=selectPinnedClosure(records,mappings.map(m=>({name:path.basename(m.contract.archivePath),archiveSha256:m.contract.archiveSha256})),runtime);
  const sources=records.filter(r=>selected.includes(r.archive));
  const contracts=sources.map(r=>({componentId:r.pin.componentId,revision:r.pin.revision,manualSourceHash:r.pin.manualSourceHash,
   archiveSha256:r.pin.archiveSha256,sourceStatus:r.pin.sourcePredicateStatus||'unverified'}));
  const packet={schemaVersion:'apollo.prompt-contract-context.v1-experimental',platform:input.platform,executionAllowed:false,
   registryDigest:registry.registryDigest,contracts:sources.map((r,i)=>({pin:contracts[i],manual:r.source.manual})),
   mappings:mappings.map(m=>({id:m.id,componentId:m.contract.componentId,kind:m.kind,codeRepresentationId:m.code.proposedRepresentationId,
    propertyMappings:m.propertyMappings,codeApi:m.code.api,status:m.status}))};
  if(Buffer.byteLength(JSON.stringify(packet),'utf8')>2*1024*1024)fail('PROMPT_CONTEXT_LIMIT');
  function assertCurrent(){producer.assertCurrent();for(const [file,pin]of files)if(!fs.existsSync(file)||sha(fs.readFileSync(file))!==pin)fail('PROMPT_INPUTS_STALE');}
  assertCurrent();return {packet,contracts,contextHash:hash(packet),assertCurrent};
 };
}
module.exports={createPromptContractReader};
