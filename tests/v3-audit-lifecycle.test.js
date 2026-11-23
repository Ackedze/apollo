'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto'),esbuild=require('esbuild');
const key='a'.repeat(40),other='b'.repeat(40),base='https://ackedze.github.io/design-system_ab/JSONS/indexes/lifecycle/';
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function load(){const built=esbuild.buildSync({stdin:{contents:"export * from './component-lifecycle';export * from './data-client';",resolveDir:path.join(__dirname,'../src/v3-audit')},bundle:true,write:false,metafile:true,platform:'node',format:'cjs',logLevel:'silent'});assert(!Object.keys(built.metafile.inputs).some(f=>/component-contract-core|experimentalContractV2|networkFetch/.test(f)));const m={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,m,m.exports);return m.exports;}
const record=(key,status,extra={})=>Object.assign({key,status,role:'main',variantKeys:[],sources:[{status,role:'main'}]},extra);
function data(api,rows={},warnings={},change=()=>{}){
 const entry='https://ackedze.github.io/design-system_ab/JSONS/referenceSourcesMVP.json',policy='https://ackedze.github.io/design-system_ab/JSONS/apollo/policies.json',documents=new Map([[entry,{}],[policy,{}]]);
 for(const category of ['deprecated','scheduled','parts'])documents.set(base+category+'.index.json',{kind:'component-lifecycle-index',version:1,category,count:(rows[category]||[]).length,components:rows[category]||[],warnings:warnings[category]||[]});change(documents);
 const assets=new Map(),files=[...documents].map(([url,body])=>{const text=JSON.stringify(body),id=hash(url);assets.set(id,text);return{id,sha256:hash(text),bytes:Buffer.byteLength(text),urls:[url]};});
 const body={schemaVersion:'apollo.v3-audit-data.v1',entryUrl:entry,policyFileId:hash(policy),files},manifest=Object.assign({},body,{dataId:hash(require('../src/v3-audit/protocol').canonical(body))});let reads=0;
 const client=api.createAuditDataClient({hashText:hash,loadManifest:async()=>structuredClone(manifest),readAsset:async(dataId,fileId)=>{reads++;const text=assets.get(fileId);return{dataId,fileId,sha256:hash(text),text};}});
 return{client,manifest,reads:()=>reads,assets};
}
async function prepare(api,rows,warnings,change){const f=data(api,rows,warnings,change);await api.prepareComponentLifecycle(f.client,await f.client.open(),()=>{});return f;}
test('lifecycle lookup is byte-identical to the existing Proxy reader',()=>{
 const proxy=path.resolve(__dirname,'../../../services/apollo-proxy/src/figma-audit/lifecycle.js');assert.equal(fs.readFileSync(path.join(__dirname,'../src/v3-audit/lifecycle.js'),'utf8'),fs.readFileSync(proxy,'utf8'));
});
test('packaged registries match exact owner/variant keys and preserve evidence hashes',async()=>{
 const api=load(),f=await prepare(api,{deprecated:[record(other,'deprecated',{variantKeys:[key]})]});
 const v=api.getComponentLifecycle(key,'native');assert.equal(v.status,'deprecated');assert.equal(v.checks.length,2);assert.equal(v.checks[0].sha256,f.manifest.files.find(row=>row.urls.includes(base+'deprecated.index.json')).sha256);assert.deepEqual(v.checks[0].matchedKeys,[key]);assert.deepEqual(v.checks[0].recordKeys,[other]);
 assert.equal(api.getComponentLifecycle('foreign','native').status,'not-listed');assert.equal(api.getComponentLifecycle(null,'native').status,'unknown');const reads=f.reads();await api.prepareComponentLifecycle(f.client,f.manifest,()=>{});assert.equal(f.reads(),reads);
});
test('scheduled is a warning source; ambiguous identity and conflicting statuses remain unknown',async()=>{
 const fixtures=[
  [{scheduled:[record(key,'scheduled')]},{},'scheduled'],
  [{deprecated:[record(key,'deprecated')],scheduled:[record(key,'scheduled')]},{},'unknown'],
  [{scheduled:[record(key,'scheduled',{sources:[{status:'active',role:'main'}]})]},{},'unknown'],
  [{scheduled:[record(key,'scheduled')]},{scheduled:[{key,fields:['status']}]},'unknown'],
  [{deprecated:[record(key,'deprecated',{variantKeys:['v']}),record(other,'deprecated',{variantKeys:['v']})]},{},'unknown','v'],
 ];
 for(const[rows,warnings,status,lookup=key]of fixtures){const api=load();await prepare(api,rows,warnings);assert.equal(api.getComponentLifecycle(lookup,'native').status,status);}
});
test('final category preserves deprecated priority and independent published updates without promoting uncertainty',async()=>{
 const api=load();await prepare(api);const life=status=>({version:'component-lifecycle-v1',status,checks:[]}),fresh=status=>({status});
 for(const [status,version,technical,reference,expected]of [
  ['deprecated','update-available',false,true,'deprecated'],['scheduled','current',false,true,'update'],['scheduled','unknown',false,false,'update'],['not-listed','update-available',false,true,'update'],['not-listed','update-available',false,false,'update'],['unknown','update-available',false,true,'update'],['unknown','current',false,true,'unknown'],['not-listed','unknown',false,true,'current'],['not-listed','current',false,false,'unknown'],['not-listed','current',true,true,'technical'],
 ])assert.equal(api.componentRelevance(life(status),fresh(version),technical,reference),expected,[status,version].join('/'));
});
test('missing/malformed/tampered indexes refuse with no public fallback; cancelled setup never publishes partial lookup',async()=>{
 const api=load();assert.throws(()=>api.getComponentLifecycle(key,'native'),/LIFECYCLE_REQUIRED/);
 await assert.rejects(prepare(api,{}, {},d=>d.delete(base+'scheduled.index.json')),/URL_UNDECLARED/);assert.throws(()=>api.getComponentLifecycle(key,'native'),/LIFECYCLE_REQUIRED/);
 await assert.rejects(prepare(api,{}, {},d=>d.get(base+'deprecated.index.json').count=1),/LIFECYCLE_INVALID/);
 const f=data(api);await f.client.open();f.assets.set(hash(base+'deprecated.index.json'),'tampered');await assert.rejects(api.prepareComponentLifecycle(f.client,f.manifest,()=>{}),/ASSET_MISMATCH/);
 const g=data(api);await g.client.open();let guards=0;await assert.rejects(api.prepareComponentLifecycle(g.client,g.manifest,()=>{if(++guards===2)throw Error('AUDIT_CANCELLED');}),/CANCELLED/);assert.throws(()=>api.getComponentLifecycle(key,'native'),/LIFECYCLE_REQUIRED/);
});
test('UI and exported category do not reclassify registry findings using old catalog status',()=>{
 const {auditQuality}=require('../src/design-check/result-groups'),{buildV3Groups}=require('../src/v3-audit/ui-model'),deprecated={id:'d',reference:{status:'changed'},catalogLifecycle:{status:'deprecated'},diffs:[]},update={id:'u',reference:{status:'deprecated'},updateReasons:['library-update-available'],catalogLifecycle:{status:'unknown',checks:[{recordKeys:[key]}]},diffs:[]};
 const result={visibleViews:{relevance:{deprecated:[deprecated],update:[update]}}},raw=JSON.stringify(result),s=buildV3Groups(result),categories=s.groups.find(g=>g.id==='components').categories;
 assert.equal(categories.find(c=>c.id==='deprecated').count,1);assert.equal(categories.find(c=>c.id==='update').count,1);assert.match(categories.find(c=>c.id==='update').entries[0].title,/новая версия/);assert.equal(s.incomplete,true);assert.equal(auditQuality(s),'violation');assert.equal(JSON.stringify(result),raw);
});
