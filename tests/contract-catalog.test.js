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
 publish();return{ds,root,index,publish,record,compiled};
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
