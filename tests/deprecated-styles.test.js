const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fixture,hash,bridge,request,settle}=require('./document-audit.test');
const {collect,recheck}=require('../src/document-audit/engine');
const {resultValid}=require('../src/document-audit/protocol');
const {validateIndex,createDeprecatedStyleReader,verifyDeprecatedStyles}=require('../src/document-audit/deprecated-styles');
const stable=value=>value&&typeof value==='object'?Array.isArray(value)?value.map(stable):Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const oldKey='a'.repeat(40),otherKey='b'.repeat(40),solid={type:'SOLID',color:{r:1,g:0,b:0}};
function index(status='deprecated',type='PAINT'){
 const data={schemaVersion:'apollo.deprecated-styles.v1',policyVersion:1,createdAt:'2026-10-31T00:00:00Z',policySha256:'d'.repeat(64),sources:[{path:'JSONS/styles/old.json',sha256:'e'.repeat(64)}],styles:[{key:oldKey,name:'Synthetic obsolete style',library:'Synthetic library',type,status,sourceIds:['JSONS/styles/old.json']}]};
 return Object.assign({indexId:digest(data)},data);
}
const reader=value=>({read:async()=>validateIndex(value,digest)});
const waitFor=async(f,type,id)=>{for(let n=0;n<1000;n++){const m=f.messages.find(m=>m.type===type&&(!id||m.requestId===id));if(m)return m;await new Promise(r=>setTimeout(r,1));}throw Error('No '+type);};
const check=o=>o.checks.find(c=>c.id==='deprecatedStyles');
test('compact index validates its content/version; tampered and duplicate identities fail closed',async()=>{
 const value=index(),port={read:async op=>{assert.equal(op,'deprecatedStyles');return value;}};
 assert.equal((await createDeprecatedStyleReader(port,digest).read()).styles.get(oldKey).status,'deprecated');
 assert.throws(()=>validateIndex(Object.assign({},value,{styles:[]}),digest),/INDEX_INVALID/);
 const duplicate=Object.assign({},value,{styles:[value.styles[0],value.styles[0]]});assert.throws(()=>validateIndex(duplicate,digest),/INDEX_INVALID/);
});
test('native key resolves document-local IDs; fills/strokes and mixed text are deduplicated; hidden styles stay out',async()=>{
 const f=fixture(),root=f.node('area');
 f.node('linked','RECTANGLE',root,{fills:[solid],fillStyleId:'document-style-id',strokes:[solid],strokeStyleId:'document-style-id'});
 f.node('same-name-active','RECTANGLE',root,{fills:[solid],fillStyleId:'active-id'});
 const hidden=f.node('hidden','FRAME',root,{visible:false});f.node('hidden-child','RECTANGLE',hidden,{fills:[solid],fillStyleId:'document-style-id'});
 f.node('mixed','TEXT',root,{characters:'one two',fills:[solid],fillStyleId:Symbol('mixed'),textStyleId:'',getStyledTextSegments:()=>[{start:0,end:3,fills:[solid],fillStyleId:'document-style-id',textStyleId:''},{start:3,end:7,fills:[solid],fillStyleId:'document-style-id',textStyleId:''}]});
 const calls=[];f.api.getStyleByIdAsync=async id=>{calls.push(id);return{id,key:id==='active-id'?otherKey:oldKey,name:'Synthetic obsolete style',type:'PAINT'};};f.page.selection=[root];
 const observation=await collect(f.api,f.context(),{hash,assertCurrent:()=>{},deprecatedStyleReader:reader(index())});
 assert.equal(check(observation).status,'complete');assert.equal(check(observation).findings.length,3);assert.equal(new Set(check(observation).findings.map(f=>f.findingId)).size,3);
 assert.deepEqual(check(observation).findings.map(f=>f.evidence.property).sort(),['fills','fills','strokes']);assert.equal(calls.filter(id=>id==='document-style-id').length,1);
 assert.ok(resultValid({runId:'run',context:f.context(),checks:observation.checks,observedAt:1,coverage:'native-subsets-only'}));
 f.api.getStyleByIdAsync=async id=>({id,key:otherKey,name:'Synthetic obsolete style',type:'PAINT'});
 await assert.rejects(recheck(f.api,observation.facts,{hash,assertCurrent:()=>{}}),/NATIVE_FACTS_CHANGED/);
});
test('style remains deprecated when its paint has a variable alias; missing or conflicting identity is UNKNOWN',async()=>{
 const f=fixture(),n=f.node('paint','RECTANGLE',f.page,{fills:[Object.assign({},solid,{boundVariables:{color:{type:'VARIABLE_ALIAS',id:'variable'}}})],fillStyleId:'local-id'});f.page.selection=[n];
 f.api.variables.getVariableByIdAsync=async id=>({id,key:otherKey,name:'Token',resolvedType:'COLOR'});
 f.api.getStyleByIdAsync=async id=>({id,key:oldKey,name:'Old style',type:'PAINT'});
 const capture=r=>collect(f.api,f.context(),{hash,assertCurrent:()=>{},deprecatedStyleReader:r});
 assert.equal(check(await capture(reader(index()))).findings[0].status,'deprecated-style');
 assert.equal(check(await capture(reader(index('ambiguous')))).findings[0].status,'unknown');
 f.api.getStyleByIdAsync=async()=>null;const missing=check(await capture(reader(index())));assert.equal(missing.status,'incomplete');assert.ok(missing.findings.every(f=>f.status==='unknown'));
 const noIndex=check(await capture({read:async()=>{throw Error('CATALOG_UNAVAILABLE');}}));assert.equal(noIndex.status,'incomplete');assert.equal(noIndex.checked,0);assert.ok(noIndex.gaps.includes('deprecated-style-index-unavailable'));
});
test('index change recaptures the run; focus revalidates index and native identity before navigating',async()=>{
 const f=fixture(),n=f.node('paint','RECTANGLE',f.page,{fills:[solid],fillStyleId:'local-id'});f.page.selection=[n];f.api.getStyleByIdAsync=async id=>({id,key:oldKey,name:'Old style',type:'PAINT'});
 const old=index(),latest=Object.assign({},old,{styles:[],policyVersion:2});delete latest.indexId;latest.indexId=digest(latest);let reads=0,current=old;
 const b=bridge(f,{deprecatedStyleReader:{read:async()=>validateIndex(++reads===1?old:current,digest)}});
 try{
  current=latest;b.accept(request(f));const done=await waitFor(f,'document-audit-result');assert.equal(check(done.result).findings.length,0);assert.ok(reads>=4);
  current=old;b.accept(request(f,'next'));const next=await waitFor(f,'document-audit-result','next'),finding=check(next.result).findings[0];current=latest;
  b.accept({type:'document-audit-focus',schemaVersion:request(f).schemaVersion,requestId:'focus',runId:'next',findingId:finding.findingId,targetId:finding.targets[0].id});
  assert.equal((await settle(f,'document-audit-focus-result')).success,false);assert.equal(f.writes.length,0);
 }finally{b.stop();}
});
test('unavailable final index proof preserves uncertainty rather than a false obsolete violation',async()=>{
 const observation={deprecatedIndexId:'a'.repeat(64),checks:[{id:'deprecatedStyles',status:'complete',gaps:[],findings:[{status:'deprecated-style',message:'Old style'}]}]};
 await verifyDeprecatedStyles({read:async()=>{throw Error('offline');}},observation);assert.equal(check(observation).status,'incomplete');assert.equal(check(observation).findings[0].status,'unknown');
});
test('final index refusal keeps its original diagnostic context and cancellation is not UNKNOWN',async()=>{
 const {failureDiagnostic,failureValid}=require('../src/document-audit/protocol');
 const observation=()=>({deprecatedIndexId:'a'.repeat(64),checks:[{id:'deprecatedStyles',status:'complete',gaps:[],findings:[{status:'deprecated-style',message:'Old style'}]}]});
 for(const code of ['CATALOG_HTTP_403','CATALOG_TIMEOUT','DEPRECATED_STYLE_INDEX_INVALID']){
  const o=observation(),errors=[];await verifyDeprecatedStyles({read:async()=>{throw Error(code);}},o,{onReadFailure:error=>errors.push(error)});
  assert.equal(check(o).findings[0].status,'unknown');assert.equal(errors.length,1);
  const d=failureDiagnostic(errors[0],'run','deprecated-style-index-recheck',hash,1);assert.equal(failureValid(d),true);assert.equal(d.read.operation,'deprecatedStyles.index');assert.equal(d.read.sourceCode,code);assert.equal(d.resourceId,o.deprecatedIndexId);
 }
 const o=observation();await assert.rejects(verifyDeprecatedStyles({read:async()=>{throw Error('CATALOG_UNAVAILABLE');}},o,{guard:()=>{throw Error('NATIVE_CANCELLED');}}),/NATIVE_CANCELLED/);assert.equal(check(o).findings[0].status,'deprecated-style');
});

test('catalog-declared effect/text styles use native type; truncated area remains incomplete',async()=>{
 for(const [type,properties,property]of [['EFFECT',{effects:[{type:'DROP_SHADOW',visible:true}],effectStyleId:'native-id'},'effects'],['TEXT',{characters:'Sample',textStyleId:'native-id'},'typography']]){
  const f=fixture(),n=f.node('layer',type==='TEXT'?'TEXT':'RECTANGLE',f.page,properties);f.page.selection=[n];f.api.getStyleByIdAsync=async id=>({id,key:oldKey,name:'Old style',type});
  const o=await collect(f.api,f.context(),{hash,assertCurrent:()=>{},deprecatedStyleReader:reader(index('deprecated',type))});assert.equal(check(o).findings[0].evidence.property,property);assert.equal(check(o).findings[0].status,'deprecated-style');
 }
 const f=fixture(),root=f.node('area');f.node('one','FRAME',root);f.node('two','FRAME',root);f.page.selection=[root];
 const o=await collect(f.api,f.context(),{hash,assertCurrent:()=>{},limits:{selection:2},deprecatedStyleReader:reader(index())});assert.equal(check(o).status,'incomplete');assert.ok(check(o).gaps.includes('selection-node-limit'));
});
