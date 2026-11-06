const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto');
const esbuild=require('esbuild');
function load(relative){const code=esbuild.buildSync({entryPoints:[path.join(__dirname,'../src/v3-audit',relative)],bundle:true,write:false,platform:'node',format:'cjs',logLevel:'silent'}).outputFiles[0].text;const m={exports:{}};new Function('require','module','exports',code)(require,m,m.exports);return m.exports;}
const {createAuditDataClient}=load('data-client.ts'),p=require('../src/v3-audit/protocol');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function fixture(){
 const entryUrl='https://ackedze.github.io/design-system_ab/JSONS/referenceSourcesMVP.json',policyUrl='https://ackedze.github.io/design-system_ab/JSONS/apollo/v3-audit-policies.json';
 const files=new Map([[entryUrl,'{"text":"Проверка 🦄"}'],[policyUrl,'{"schemaVersion":"apollo.v3-audit-policies.v1","packages":[]}']]);
 const rows=[...files].map(([url,text])=>({id:hash(url),sha256:hash(text),bytes:Buffer.byteLength(text),urls:[url]}));
 const body={schemaVersion:p.SCHEMA,entryUrl,policyFileId:hash(policyUrl),files:rows},manifest=Object.assign({},body,{dataId:hash(p.canonical(body))});
 let reads=0;
 const transport={hashText:hash,loadManifest:async()=>structuredClone(manifest),readAsset:async(dataId,id)=>{reads++;const row=rows.find(x=>x.id===id);if(!row)throw Error('NOT_PACKAGED');return{dataId,fileId:id,sha256:row.sha256,text:files.get(row.urls[0])};}};
 return {entryUrl,files,rows,body,manifest,transport,reads:()=>reads};
}
test('V3 uses packaged UTF-8 data and raw Git URL aliases without a network fallback',async()=>{
 const f=fixture(),c=createAuditDataClient(f.transport);await c.open();
 assert.equal(await c.readText(f.entryUrl+'?apolloCatalog=1'),f.files.get(f.entryUrl));
 assert.equal(await c.readText(f.entryUrl.replace('https://ackedze.github.io/design-system_ab/','https://raw.githubusercontent.com/Ackedze/design-system_ab/main/')),f.files.get(f.entryUrl));
 assert.equal((await c.readPolicies()).packages.length,0);assert.equal(f.reads(),3);
 const before=f.reads();await assert.rejects(c.readText('https://ackedze.github.io/design-system_ab/JSONS/not-in-package.json'),/URL_UNDECLARED/);
 await assert.rejects(c.readText('file:///Users/someone/private.json'),/URL_UNDECLARED/);assert.equal(f.reads(),before);
});
test('missing package and incomplete declared closure refuse before asset loading',async()=>{
 const f=fixture();f.transport.loadManifest=async()=>{throw Error('AUDIT_PACKAGE_MISSING');};
 await assert.rejects(createAuditDataClient(f.transport).open(),/PACKAGE_MISSING/);assert.equal(f.reads(),0);
 const g=fixture();const body=Object.assign({},g.body,{policyFileId:'0'.repeat(64)});
 g.transport.loadManifest=async()=>Object.assign({},body,{dataId:hash(p.canonical(body))});
 await assert.rejects(createAuditDataClient(g.transport).open(),/CLOSURE_INCOMPLETE/);assert.equal(g.reads(),0);
});
test('manifest/content corruption cannot be accepted as a checked result',async()=>{
 const f=fixture();f.transport.loadManifest=async()=>Object.assign({},f.manifest,{dataId:'0'.repeat(64)});
 await assert.rejects(createAuditDataClient(f.transport).open(),/MANIFEST_MISMATCH/);
 const g=fixture(),read=g.transport.readAsset;g.transport.readAsset=async(...args)=>Object.assign(await read(...args),{text:'changed'});
 const c=createAuditDataClient(g.transport);await c.open();await assert.rejects(c.readText(g.entryUrl),/ASSET_MISMATCH/);
});
test('a package change invalidates the session instead of mixing source versions',async()=>{
 const f=fixture(),c=createAuditDataClient(f.transport);await c.open();
 const nextBody=Object.assign({},f.body,{revision:2});f.transport.loadManifest=async()=>Object.assign({},nextBody,{dataId:hash(p.canonical(nextBody))});
 await assert.rejects(c.assertCurrent(),/CHANGED_RELOAD_REQUIRED/);await assert.rejects(c.readText(f.entryUrl),/CHANGED_RELOAD_REQUIRED/);assert.equal(f.reads(),0);
});
test('caller mutation cannot rewrite the internal manifest or asset pins',async()=>{
 const f=fixture(),c=createAuditDataClient(f.transport),copy=await c.open();copy.files[0].sha256='0'.repeat(64);copy.dataId='0'.repeat(64);
 assert.equal(await c.readText(f.entryUrl),f.files.get(f.entryUrl));assert.equal(c.identity(),f.manifest.dataId);
});
test('the V3 network adapter requires an explicit package reader',async()=>{
 const network=load('utils/networkFetch.ts');await assert.rejects(network.fetchDirect('https://ackedze.github.io/design-system_ab/JSONS/x.json'),/PACKAGE_READER_REQUIRED/);
 let called=0;network.configureAuditPackageReader(async()=>{called++;throw Error('AUDIT_PACKAGE_MISSING');});
 await assert.rejects(network.fetchDirect('https://ackedze.github.io/design-system_ab/JSONS/x.json'),/PACKAGE_MISSING/);assert.equal(called,1);
});
