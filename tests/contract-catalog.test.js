const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {readContractCatalog}=require("../scripts/contract-catalog.cjs");
function setup(t){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'apollo-catalog-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function manifest(root,packages){fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({schemaVersion:'component-contract-package-collection.v1',packages}));}
function put(root,file,bytes='synthetic zip'){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);return{file,bytes:Buffer.byteLength(bytes),zipSha256:crypto.createHash('sha256').update(bytes).digest('hex')};}
test('component folders keep archive identities and exclude history from discovery',t=>{
 const root=setup(t),entry=put(root,'Button/Button.component-contract.zip');put(root,'Button/history/old.zip');manifest(root,[entry]);
 const catalog=readContractCatalog(root);assert.deepEqual(catalog.archives.map(a=>a.name),['Button.component-contract.zip']);catalog.assertCurrent();
 fs.appendFileSync(path.join(root,entry.file),'changed');assert.throws(()=>catalog.assertCurrent(),/STALE_ARCHIVE/);
});
test('unsafe paths, symlink directories, duplicate names and changed manifest refuse the catalog',t=>{
 const root=setup(t),entry=put(root,'Button/current.zip');
 for(const file of ['../outside.zip','/outside.zip','Button/../current.zip','Button\\current.zip']){manifest(root,[{file}]);assert.throws(()=>readContractCatalog(root),/CATALOG_PATH_INVALID/);}
 fs.symlinkSync(path.join(root,'Button'),path.join(root,'alias'));manifest(root,[{file:'alias/current.zip'}]);assert.throws(()=>readContractCatalog(root),/CATALOG_PATH_INVALID/);
 put(root,'Other/current.zip');manifest(root,[entry,{file:'Other/current.zip'}]);assert.throws(()=>readContractCatalog(root),/CATALOG_ARCHIVE_CONFLICT/);
 manifest(root,[entry]);const c=readContractCatalog(root);manifest(root,[]);assert.throws(()=>c.assertCurrent(),/STALE_CATALOG/);
});
test('plain incoming ZIP directories remain supported and guarded',t=>{
 const root=setup(t);put(root,'input.zip');const c=readContractCatalog(root);assert.equal(c.manifest,null);c.assertCurrent();put(root,'new.zip');assert.throws(()=>c.assertCurrent(),/STALE_CATALOG/);
});

function canonical(t){
 const ds=setup(t),root=path.join(ds,'experiments/current-contract-packages');fs.mkdirSync(root,{recursive:true});
 const core=require("../packages/component-contract-core/dist/core.cjs"),source=require("./authoring-fixtures").source();
 const compiled=JSON.parse(JSON.stringify(core.compileManualSource(source.manual,source.variantEvidence,[]).contract));
 compiled.package.sourceExportVersion='component-contract-editor@0.2.107';
 const hash=core.stableHash,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
 function json(file,value){const bytes=JSON.stringify(value),p=path.join(ds,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);return{path:file,sha256:sha(bytes),bytes:Buffer.byteLength(bytes)};}
 const entry=Object.assign(put(root,'Synthetic/current.zip'),{contractId:source.manual.component.contractId,componentId:source.manual.component.componentId,revision:1,manualSourceHash:hash(source.manual)});
 const record={contractId:entry.contractId,componentId:entry.componentId,revision:1,manualSourceHash:entry.manualSourceHash,archiveSha256:entry.zipSha256,compiledHash:hash(compiled),sourceExportVersion:compiled.package.sourceExportVersion,
 manual:json('JSONS/web/components/Synthetic Card [D]/contract.manual.json',source.manual),facts:json('JSONS/web/components/Synthetic Card [D]/variant-evidence.json',source.variantEvidence)};
 const index={schemaVersion:'apollo.component-contract-sources.v1',pathBase:'design-system_ab',entries:[record],dependencySources:[]};
 function publish(){const p=json('JSONS/indexes/component-contracts.index.json',index);fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({schemaVersion:'component-contract-package-collection.v1',packages:[entry],authoringIndex:{file:'../../JSONS/indexes/component-contracts.index.json',sha256:p.sha256,bytes:p.bytes}}));}
 publish();return{ds,root,index,publish,record,compiled,entry};
}
test('canonical manual and explicit facts reproduce the pinned projection and freeze source bytes',t=>{
 const c=canonical(t),catalog=readContractCatalog(c.root);assert.deepEqual(catalog.sources.current[0].compiled,c.compiled);catalog.assertCurrent();
 fs.appendFileSync(path.join(c.ds,c.record.facts.path),' ');assert.throws(()=>catalog.assertCurrent(),/STALE_ARCHIVE/);assert.throws(()=>readContractCatalog(c.root),/STALE_CONTRACT_SOURCE/);
});
test('canonical index rejects forged projections, missing facts and symlink source ancestors',t=>{
 const c=canonical(t),original=structuredClone(c.record);
 c.record.compiledHash='a'.repeat(64);c.publish();assert.throws(()=>readContractCatalog(c.root),/CONTRACT_SOURCE_PROJECTION_MISMATCH/);
 Object.assign(c.record,original);c.record.facts=null;c.publish();assert.throws(()=>readContractCatalog(c.root),/CONTRACT_SOURCE_PATH_INVALID/);
 Object.assign(c.record,original);c.record.facts.path='JSONS/web/components/../outside.json';c.publish();assert.throws(()=>readContractCatalog(c.root),/CONTRACT_SOURCE_PATH_INVALID/);
 Object.assign(c.record,structuredClone(original));c.publish();const sourceDir=path.dirname(path.join(c.ds,c.record.facts.path)),target=path.join(c.ds,'moved');fs.renameSync(sourceDir,target);fs.symlinkSync(target,sourceDir,'dir');assert.throws(()=>readContractCatalog(c.root),/CONTRACT_SOURCE_PATH_INVALID/);
});

function relocate(c,file='JSONS/web/components/Корпоративный компонент [D]/packages/current.zip'){
 const old=path.join(c.root,c.entry.file),next=path.join(c.ds,file);
 fs.mkdirSync(path.dirname(next),{recursive:true});fs.copyFileSync(old,next);
 c.entry.file=file;c.publish();
 const filename=path.join(c.root,'manifest.json'),m=JSON.parse(fs.readFileSync(filename));
 m.archivePathBase='design-system_ab';delete m.authoringIndex;
 fs.writeFileSync(filename,JSON.stringify(m));return filename;
}
test('repository paths opt in to component packages with spaces, brackets and Unicode; payload stays identical',t=>{
 const c=canonical(t),before=readContractCatalog(c.root).archives[0];relocate(c);
 const catalog=readContractCatalog(c.root);
 assert.equal(catalog.archiveRoot,c.ds);assert.deepEqual(catalog.archives[0],before);catalog.assertCurrent();
 fs.appendFileSync(path.join(c.ds,c.entry.file),'changed');assert.throws(()=>catalog.assertCurrent(),/STALE_ARCHIVE/);
});
test('repository archives must remain with the exact canonical manual, preserving source projection',t=>{
 const c=canonical(t),file=relocate(c,'JSONS/web/components/Synthetic Card [D]/packages/current.zip'),m=JSON.parse(fs.readFileSync(file));
 c.publish();m.authoringIndex=JSON.parse(fs.readFileSync(file)).authoringIndex;fs.writeFileSync(file,JSON.stringify(m));
 const catalog=readContractCatalog(c.root);assert.deepEqual(catalog.sources.current[0].compiled,c.compiled);catalog.assertCurrent();
 const other='JSONS/web/components/Other/packages/current.zip';put(c.ds,other);m.packages[0]=Object.assign({},m.packages[0],{file:other});fs.writeFileSync(file,JSON.stringify(m));
 assert.throws(()=>readContractCatalog(c.root),/STALE_ARCHIVE|CONTRACT_SOURCE_ARCHIVE_MISMATCH/);
});
test('repository path admission rejects unknown bases, escapes, controls, duplicate names and symlink ancestors',t=>{
 const c=canonical(t),filename=relocate(c),m=JSON.parse(fs.readFileSync(filename)),original=structuredClone(m);
 for(const base of ['workspace','../..',null]){m.archivePathBase=base;fs.writeFileSync(filename,JSON.stringify(m));assert.throws(()=>readContractCatalog(c.root),/CATALOG_ARCHIVE_BASE_INVALID/);}
 Object.assign(m,structuredClone(original));
 for(const file of ['/outside.zip','../../outside.zip','JSONS/web/components/X/../packages/x.zip','JSONS/web/components/X\\packages/x.zip','JSONS/web/components/X\u0000/packages/x.zip','JSONS/web/components/X/packages/../x.zip','history/x.zip','JSONS/web/components/X/reports/x.zip']){
  m.packages=[{file}];fs.writeFileSync(filename,JSON.stringify(m));assert.throws(()=>readContractCatalog(c.root),/CATALOG_PATH_INVALID/);
 }
 Object.assign(m,structuredClone(original));
 const other=put(c.ds,'JSONS/web/components/Other/packages/current.zip');m.packages.push(other);fs.writeFileSync(filename,JSON.stringify(m));assert.throws(()=>readContractCatalog(c.root),/CATALOG_ARCHIVE_CONFLICT/);
 Object.assign(m,structuredClone(original));fs.writeFileSync(filename,JSON.stringify(m));const parent=path.dirname(path.join(c.ds,c.entry.file)),moved=parent+'.moved';fs.renameSync(parent,moved);fs.symlinkSync(moved,parent,'dir');assert.throws(()=>readContractCatalog(c.root),/CATALOG_PATH_INVALID/);
});

test('offline catalog capacity is explicit and bounded; unchanged callers retain 32',t=>{
 const root=setup(t),entries=Array.from({length:33},(_,i)=>put(root,`C${i}.zip`));manifest(root,entries);
 assert.throws(()=>readContractCatalog(root),/ARCHIVE_LIMIT/);
 assert.equal(readContractCatalog(root,{maxContracts:64}).archives.length,33);
 for(const maxContracts of [0,65,-1,1.5,'64',null,NaN])assert.throws(()=>readContractCatalog(root,{maxContracts}),/CATALOG_BUDGET_INVALID/);
 manifest(root,Array.from({length:65},(_,i)=>({file:`C${i}.zip`})));
 assert.throws(()=>readContractCatalog(root,{maxContracts:64}),/ARCHIVE_LIMIT/);
});
test('explicit offline budget includes pinned dependency sources and retains projection guards',t=>{
 const c=canonical(t),core=require('../packages/component-contract-core/dist/core.cjs');
 const manual=JSON.parse(fs.readFileSync(path.join(c.ds,c.record.manual.path))),facts=JSON.parse(fs.readFileSync(path.join(c.ds,c.record.facts.path)));
 const pin=(file,value)=>{const bytes=JSON.stringify(value),target=path.join(c.ds,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);return{path:file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:Buffer.byteLength(bytes)};};
 for(let revision=2;revision<=34;revision++){
  const m=structuredClone(manual);m.metadata.revision=revision;
  const compiled=core.compileManualSource(m,facts,[]).contract;compiled.package.sourceExportVersion=c.record.sourceExportVersion;
  c.index.dependencySources.push({...c.record,revision,manualSourceHash:core.stableHash(m),compiledHash:core.stableHash(compiled),manual:pin(`JSONS/web/components/Synthetic/history/r${revision}/contract.manual.json`,m)});
 }
 c.publish();assert.throws(()=>readContractCatalog(c.root),/CONTRACT_SOURCE_INDEX_INVALID/);
 const catalog=readContractCatalog(c.root,{maxContracts:64});assert.equal(catalog.sources.records.length,34);catalog.assertCurrent();
 c.index.dependencySources[0].compiledHash='0'.repeat(64);c.publish();assert.throws(()=>readContractCatalog(c.root,{maxContracts:64}),/CONTRACT_SOURCE_PROJECTION_MISMATCH/);
 c.index.dependencySources[0].compiledHash=catalog.sources.records[1].entry.compiledHash;
 c.index.dependencySources.push(c.index.dependencySources[0]);c.publish();assert.throws(()=>readContractCatalog(c.root,{maxContracts:64}),/CONTRACT_SOURCE_CONFLICT/);
});
