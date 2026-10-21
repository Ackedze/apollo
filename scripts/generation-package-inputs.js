// Node/Proxy-side canonical inputs. Figma never imports this file.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const {readContractCatalog}=require("./contract-catalog.cjs");
function fail(code) {throw Object.assign(new Error(code),{code});}
/** Select explicit code-registry archives + exact authoring dependency pins.
 * Other platforms are not candidates for a root named by archive SHA. */
function selectPinnedClosure(records,roots,runtime) {
 const selected=new Map(),active=new Set();
 function visit(record) {
  const id=record.source.manual.component.componentId;
  if(active.has(id))fail('DEPENDENCY_CYCLE');
  if(selected.has(id)) {if(selected.get(id)!==record)fail('COMPONENT_CONFLICT');return;}
  if(active.size>=5)fail('DEPENDENCY_DEPTH');active.add(id);
  for(const pin of record.source.manual.componentDependencies||[]) {
   const matches=records.filter(r=>r.source.manual.component.componentId===pin.componentId&&r.source.manual.metadata.revision===pin.revision&&runtime.contractHash(r.source.manual)===pin.manualSourceHash);
   if(matches.length!==1)fail(matches.length?'SOURCE_SELECTION_AMBIGUOUS':'MISSING_DEPENDENCY');visit(matches[0]);
  }
  active.delete(id);selected.set(id,record);
 }
 for(const root of roots) {
  const matches=records.filter(r=>r.archive.name===root.name&&r.archiveSha256===root.archiveSha256);
  if(matches.length!==1)fail('STALE_CONTRACT_PIN');visit(matches[0]);
 }
 return Array.from(selected.values()).map(r=>r.archive);
}
async function loadPinnedGenerationInputs(directory,roots) {
 const repository=path.resolve(__dirname,".."),runtimeFile=path.resolve(__dirname,"../dist/runtime.cjs");
 const runtime=require(runtimeFile),core=require(path.join(repository,'packages/component-contract-core/dist/core.cjs'));
 const {loadContractPackages}=require(path.join(repository,'packages/generation-core/dist/index.cjs'));
 const buildBytes=fs.readFileSync(path.resolve(__dirname,"../dist/build-inputs.json")),build=JSON.parse(buildBytes);
 const coreVersion=JSON.parse(fs.readFileSync(path.join(repository,'packages/component-contract-core/package.json'))).version;
 if(build.runtimeVersion!==coreVersion||build.profileVersion!==runtime.RUNTIME_VERSION||!Array.isArray(build.inputs)||!build.inputs.length)fail('RUNTIME_IDENTITY');
 for(const input of build.inputs) {
  const file=path.resolve(repository,input.path),relative=path.relative(repository,file);
  if(relative.startsWith('..')||path.isAbsolute(relative)||sha(fs.readFileSync(file))!==input.sha256)fail('STALE_RUNTIME');
 }
 const catalog=readContractCatalog(directory);
 const records=[],decoder=new TextDecoder('utf-8',{fatal:true});
 for(const {name,bytes} of catalog.archives) {
  const entries=await core.readZip(bytes);if(entries.length>200||entries.reduce((s,e)=>s+e.data.length,0)>128*1024*1024)fail('ENTRY_LIMIT');
  const source=runtime.sourceFromFiles(entries.filter(e=>/\.json$/i.test(e.name)).map(e=>({name:e.name,text:decoder.decode(e.data)})));
  records.push({archive:{name,bytes},archiveSha256:sha(bytes),source});
 }
 const archives=selectPinnedClosure(records,roots,runtime);
 const result=await loadContractPackages(archives,{runtime,readZip:core.readZip,
  identity:{coreVersion,profileVersion:runtime.RUNTIME_VERSION,runtimeSha256:sha(fs.readFileSync(runtimeFile)),buildInputsSha256:sha(buildBytes)}});
 catalog.assertCurrent();
 return result;
}
module.exports={selectPinnedClosure,loadPinnedGenerationInputs};
