const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fixture,hash}=require('./document-audit.test');
const {collect,recheck}=require('../src/document-audit/engine');
const {validatePolicy,createCatalogPolicyReader,contextPolicy,verifyCatalogPolicy}=require('../src/document-audit/catalog-policy');
const canonical=v=>v&&typeof v==='object'?Array.isArray(v)?v.map(canonical):Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const key='a'.repeat(40),other='b'.repeat(40),icon='c'.repeat(40),solid={type:'SOLID',color:{r:1,g:0,b:0}};
function index(){const data={schemaVersion:'apollo.catalog-audit-policy.v1',snapshotId:'d'.repeat(64),sources:[{path:'JSONS/styles/known.json',sha256:'e'.repeat(64)}],
 resources:[{kind:'style',key,type:'PAINT'},{kind:'variable',key,type:'COLOR'}],paintComponentKeys:[icon],rawTypography:[{id:'status-uppercase',nodeName:'Label',reasonCode:'variant-owned-text-case',componentKeys:[icon],ancestorPath:['Status','Label owner']}]};return Object.assign({indexId:digest(data)},data);}
const reader=value=>({read:async()=>validatePolicy(value,digest)}),style=o=>o.checks.find(c=>c.id==='customStyles');
test('verified catalog policy rejects tampering, duplicate keys and unknown resource types',async()=>{
 const value=index(),port={read:async(op,body,budget,guard)=>{assert.equal(op,'auditPolicy');assert.equal(budget,null);guard();return value;}};
 assert.equal((await createCatalogPolicyReader(port,digest).read()).resources.get('style:'+key),'PAINT');
 for(const change of [{snapshotId:'x'}, {resources:[value.resources[0],value.resources[0]]},{resources:[{kind:'style',key,type:'COLOR'}]},{paintComponentKeys:[]}])assert.throws(()=>validatePolicy(Object.assign({},value,change),digest),/POLICY_INVALID/);
});
test('native catalog membership uses resolved keys, not names or document IDs',async()=>{
 const f=fixture(),root=f.node('root');for(const name of ['known','foreign','token-known','token-foreign'])f.node(name,'RECTANGLE',root,{fills:[Object.assign({},solid,name.startsWith('token')?{boundVariables:{color:{type:'VARIABLE_ALIAS',id:name}}}:{})],fillStyleId:name.startsWith('token')?'':name});f.page.selection=[root];
 f.api.getStyleByIdAsync=async id=>({id,key:id==='known'?key:other,name:'same name',type:'PAINT'});
 f.api.variables.getVariableByIdAsync=async id=>({id,key:id==='token-known'?key:other,name:'same name',resolvedType:'COLOR',variableCollectionId:'collection'});
 const o=await collect(f.api,f.context(),{hash,assertCurrent:()=>{},catalogPolicyReader:reader(index())});
 assert.equal(style(o).status,'complete');assert.deepEqual(style(o).findings.map(f=>f.name).sort(),['foreign','token-foreign']);assert(style(o).findings.every(f=>f.status==='custom-style'&&f.evidence.catalogIndexId));assert(!style(o).gaps.includes('v3-catalog-policy-not-connected'));
});
test('unavailable or wrong-type native resources stay UNKNOWN despite a catalog row',async()=>{
 for(const response of [null,{key,type:'TEXT'},{key:other,type:'PAINT'}]){
  const f=fixture(),n=f.node('linked','RECTANGLE',f.page,{fills:[solid],fillStyleId:'doc-style'});f.page.selection=[n];f.api.getStyleByIdAsync=async id=>response&&Object.assign({id,name:'same'},response);
  const value=index();if(response?.key===other){value.resources.push({kind:'style',key:other,type:null});delete value.indexId;value.indexId=digest(value);}
  const o=await collect(f.api,f.context(),{hash,assertCurrent:()=>{},catalogPolicyReader:reader(value)});assert.equal(style(o).findings[0].status,'unknown');assert.equal(style(o).status,'incomplete');
 }
});
test('paint exception requires an indexed ancestor identity; typography and effects remain checked',async()=>{
 const f=fixture(),root=f.node('root'),main=f.component('icon-source',true,icon),host=f.instance('icon-instance',main,root);
 f.node('content','TEXT',host,{characters:'label',fills:[solid],textStyleId:'',effects:[{type:'DROP_SHADOW'}],effectStyleId:''});
 f.node('same-name-icon','RECTANGLE',root,{fills:[solid]});f.page.selection=[root];
 const o=await collect(f.api,f.context(),{hash,assertCurrent:()=>{},catalogPolicyReader:reader(index())});
 assert.deepEqual(style(o).findings.filter(x=>x.name==='content').map(x=>x.evidence.property).sort(),['effects','typography']);assert(style(o).findings.some(x=>x.name==='same-name-icon'));
 main.key=other;await assert.rejects(recheck(f.api,o.facts,{hash,assertCurrent:()=>{}}),/NATIVE_FACTS_CHANGED/);
});
test('V3 raw typography rule applies only to its node and exact ancestor identity or path',()=>{
 const value=validatePolicy(index(),digest);
 assert.equal(contextPolicy(value,'Label',[{key:icon,name:'Host'}]).ignoreTypography,true);
 assert.equal(contextPolicy(value,'Other',[{key:icon,name:'Host'}]).ignoreTypography,false);
 assert.equal(contextPolicy(value,'Label',[{name:'Label owner'},{name:'Status'}]).ignoreTypography,true);
 assert.equal(contextPolicy(value,'Label',[{name:'Status'},{name:'Label owner'}]).ignoreTypography,false);
 assert.equal(contextPolicy(value,'Label',[{key:icon,name:'Label',self:true}]).ignoreTypography,false);
});
test('missing policy preserves native findings and incomplete coverage; changed policy invalidates final proof',async()=>{
 const f=fixture(),n=f.node('raw','RECTANGLE',f.page,{fills:[solid]});f.page.selection=[n];
 const o=await collect(f.api,f.context(),{hash,assertCurrent:()=>{},catalogPolicyReader:{read:async()=>{throw Error('CATALOG_HTTP_503');}}});assert(style(o).findings.some(f=>f.status==='custom-style'));assert.equal(style(o).status,'incomplete');
 o.stylePolicyIndexId='f'.repeat(64);await assert.rejects(verifyCatalogPolicy(reader(index()),o),/NATIVE_FACTS_CHANGED/);
 let failure;await verifyCatalogPolicy({read:async()=>{throw Error('offline');}},o,{onReadFailure:e=>failure=e});assert.equal(failure.nativeRead.operation,'catalogAuditPolicy.index');assert(style(o).findings.every(f=>f.status==='unknown'));
});
test('bridge verifies the policy again before publishing; optional policy Stop ignores late replies',async()=>{
 const {bridge,request,settle}=require('./document-audit.test');
 const f=fixture();f.page.selection=[f.node('root')];let reads=0;
 const b=bridge(f,{catalogPolicyReader:{read:async()=>{reads++;return validatePolicy(index(),digest);}}});
 try{b.accept(request(f));const result=await settle(f,'document-audit-result');assert.equal(result.result.checks.find(c=>c.id==='customStyles').status,'complete');assert.ok(reads>=2);}finally{b.stop();}
 const g=fixture();g.page.selection=[g.node('root')];let release;
 const stopped=bridge(g,{catalogPolicyReader:{read:()=>new Promise(r=>release=r)}});
 try{stopped.accept(request(g));while(!release)await new Promise(r=>setTimeout(r,0));stopped.accept({type:'document-audit-cancel',schemaVersion:'apollo.document-audit.v1',requestId:'run'});release(validatePolicy(index(),digest));await new Promise(r=>setTimeout(r,5));assert.equal(g.messages.some(m=>m.type==='document-audit-result'),false);}finally{stopped.stop();}
});
