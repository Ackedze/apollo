const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};

// Current collections are manifest-owned. Never discover historical ZIPs recursively.
function readContractCatalog(directory){
 const root=fs.realpathSync(directory),manifestFile=path.join(root,'manifest.json');
 const manifestBytes=fs.existsSync(manifestFile)?fs.readFileSync(manifestFile):null;
 const manifest=manifestBytes?JSON.parse(manifestBytes):null;
 if(manifest&&(!Array.isArray(manifest.packages)||manifest.schemaVersion!=='component-contract-package-collection.v1'))fail('CATALOG_MANIFEST_INVALID');
 const repositoryPaths=manifest?.archivePathBase==='design-system_ab';
 if(manifest?.archivePathBase!==undefined&&!repositoryPaths)fail('CATALOG_ARCHIVE_BASE_INVALID');
 if(repositoryPaths&&(path.basename(root)!=='current-contract-packages'||path.basename(path.dirname(root))!=='experiments'))fail('CATALOG_ARCHIVE_BASE_INVALID');
 const archiveRoot=repositoryPaths?path.resolve(root,'../..'):root;
 const entries=manifest?manifest.packages:fs.readdirSync(root).filter(name=>/\.zip$/i.test(name)).sort().map(file=>({file}));
 if(!entries.length||entries.length>32)fail('ARCHIVE_LIMIT');
 const names=new Set(),files=new Set(),pins=[];
 const archives=entries.map(entry=>{
  if(typeof entry.file!=='string'||!entry.file.endsWith('.zip')||path.isAbsolute(entry.file)||entry.file.includes('\\')||entry.file.split('/').some(p=>!p||p==='.'||p==='..'||(repositoryPaths?/[<>:"|?*\x00-\x1f\x7f]/.test(p):!/^[-\w.]+$/.test(p))))fail('CATALOG_PATH_INVALID');
  if(repositoryPaths&&(!entry.file.startsWith('JSONS/web/components/')||path.basename(path.dirname(entry.file))!=='packages'))fail('CATALOG_PATH_INVALID');
  const file=path.join(archiveRoot,entry.file),name=path.basename(entry.file);
  if(names.has(name)||files.has(file))fail('CATALOG_ARCHIVE_CONFLICT');names.add(name);files.add(file);
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||fs.realpathSync(file)!==file)fail('CATALOG_PATH_INVALID');
  if(stat.size>64*1024*1024)fail('ARCHIVE_LIMIT');
  const bytes=fs.readFileSync(file),digest=sha(bytes);
  if(entry.zipSha256&&entry.zipSha256!==digest||entry.bytes!==undefined&&entry.bytes!==bytes.length)fail('STALE_ARCHIVE');
  pins.push({file,digest});return{name,bytes};
 });
 const sources=manifest?.authoringIndex?readCanonicalSources(root,manifest.authoringIndex,entries,pins):null;
 if(repositoryPaths&&sources)for(const entry of entries){const source=sources.index.entries.find(s=>s.contractId===entry.contractId);if(path.dirname(entry.file)!==path.posix.join(path.posix.dirname(source.manual.path),'packages'))fail('CONTRACT_SOURCE_ARCHIVE_MISMATCH');}
 function assertCurrent(){
  if(manifestBytes){if(sha(fs.readFileSync(manifestFile))!==sha(manifestBytes))fail('STALE_CATALOG');}
  else if(JSON.stringify(archives.map(a=>a.name))!==JSON.stringify(fs.readdirSync(root).filter(n=>/\.zip$/i.test(n)).sort()))fail('STALE_CATALOG');
  for(const pin of pins)if(fs.realpathSync(pin.file)!==pin.file||!fs.lstatSync(pin.file).isFile()||sha(fs.readFileSync(pin.file))!==pin.digest)fail('STALE_ARCHIVE');
 }
 return{root,archiveRoot,manifest,archives,sources,assertCurrent};
}
module.exports={readContractCatalog};

function readCanonicalSources(root,indexPin,packages,pins){
 if(indexPin.file!=='../../JSONS/indexes/component-contracts.index.json')fail('CONTRACT_SOURCE_PATH_INVALID');
 const sourceRoot=path.resolve(root,'../..');
 function read(pin,index=false){
  if(!pin||typeof pin!=='object')fail('CONTRACT_SOURCE_PATH_INVALID');
  const relative=index?'JSONS/indexes/component-contracts.index.json':pin.path;
  if(typeof relative!=='string'||(!index&&!relative.startsWith('JSONS/web/components/'))||relative.includes('\\')||relative.split('/').some(p=>!p||p==='.'||p==='..'||/[\x00-\x1f]/.test(p))||!(/^[a-f0-9]{64}$/).test(pin.sha256||'')||!Number.isSafeInteger(pin.bytes)||pin.bytes<0)fail('CONTRACT_SOURCE_PATH_INVALID');
  const file=path.join(sourceRoot,relative),stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||fs.realpathSync(file)!==file||stat.size>64*1024*1024)fail('CONTRACT_SOURCE_PATH_INVALID');
  const bytes=fs.readFileSync(file),digest=sha(bytes);if(digest!==pin.sha256||bytes.length!==pin.bytes)fail('STALE_CONTRACT_SOURCE');
  pins.push({file,digest});return JSON.parse(bytes);
 }
 const index=read(indexPin,true);
 if(index.schemaVersion!=='apollo.component-contract-sources.v1'||index.pathBase!=='design-system_ab'||!Array.isArray(index.entries)||!Array.isArray(index.dependencySources)||index.entries.length!==packages.length||index.entries.length+index.dependencySources.length>32)fail('CONTRACT_SOURCE_INDEX_INVALID');
 const core=require("../packages/component-contract-core/dist/core.cjs");
 const records=index.entries.concat(index.dependencySources).map(entry=>{
  const manual=read(entry.manual),facts=read(entry.facts);
  if(manual.component?.componentId!==entry.componentId||manual.component?.contractId!==entry.contractId||manual.metadata?.revision!==entry.revision||core.stableHash(manual)!==entry.manualSourceHash)fail('CONTRACT_SOURCE_IDENTITY_MISMATCH');
  return{entry,manual,facts};
 });
 const identity=r=>JSON.stringify([r.entry.componentId,r.entry.revision,r.entry.manualSourceHash]);
 if(new Set(records.map(identity)).size!==records.length||new Set(index.entries.map(e=>e.contractId)).size!==index.entries.length)fail('CONTRACT_SOURCE_CONFLICT');
 for(const pkg of packages){const matches=index.entries.filter(e=>e.contractId===pkg.contractId&&e.componentId===pkg.componentId&&e.revision===pkg.revision&&e.archiveSha256===pkg.zipSha256&&e.manualSourceHash===pkg.manualSourceHash);if(matches.length!==1)fail('CONTRACT_SOURCE_ARCHIVE_MISMATCH');}
 const compiled=new Map();
 function compile(record,active=new Set()){
  const id=identity(record);if(compiled.has(id))return compiled.get(id);
  if(active.has(id)||active.size>=5)fail('CONTRACT_SOURCE_DEPENDENCY_CYCLE');const next=new Set(active);next.add(id);
  const children=(record.manual.componentDependencies||[]).map(pin=>{
   const matches=records.filter(r=>r.entry.componentId===pin.componentId&&r.entry.revision===pin.revision&&r.entry.manualSourceHash===pin.manualSourceHash&&r.entry.compiledHash===pin.compiledHash);if(matches.length!==1)fail('CONTRACT_SOURCE_DEPENDENCY_MISSING');return compile(matches[0],next);
  });
  const result=core.compileManualSource(record.manual,record.facts,children);
  if(result.issues.some(i=>i.level==='error'))fail('CONTRACT_SOURCE_COMPILE_FAILED');
  const contract=JSON.parse(JSON.stringify(result.contract));
  if(!/^component-contract-editor@0\.2\.\d+$/.test(record.entry.sourceExportVersion||''))fail('CONTRACT_SOURCE_STAMP_INVALID');
  contract.package.sourceExportVersion=record.entry.sourceExportVersion;
  if(core.stableHash(contract)!==record.entry.compiledHash)fail('CONTRACT_SOURCE_PROJECTION_MISMATCH');
  compiled.set(id,contract);record.compiled=contract;record.dependencyContracts=children;return contract;
 }
 records.forEach(r=>compile(r));
 return{index,records,current:records.slice(0,index.entries.length),root:sourceRoot};
}
