// Invented document, authored contract and Proxy replies. No live Figma data.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {postactionScene}=require("./postaction-scoped.fixture.cjs"),{request,wait}=require("./postaction-scoped.test");
const {SCHEMA}=require("../src/document-audit/protocol"),runtime=require("../dist/runtime.cjs");
async function fixture({elapsed=16000,changedRelease=false}={}){
 let clock=0;class Clock extends Date{static now(){return clock;}}
 const f=postactionScene(),seen=[];
 Object.defineProperty(f.actual,'resolvedVariableModes',{get:()=>({theme:f.page.explicitVariableModes.theme})});
 f.peer.resolvedVariableModes={theme:'base'};f.peer.explicitVariableModes={theme:'base'};
 const create=f.actual.main.createInstance;f.actual.main.createInstance=()=>{const n=create();n.setExplicitVariableModeForCollection=(c,mode)=>{n.resolvedVariableModes=Object.assign({},n.resolvedVariableModes,{[c.id]:mode});};return n;};
 const post=f.api.ui.postMessage;
 f.api.ui.postMessage=m=>{post(m);if(m.type==='resolve-contracts')setImmediate(async()=>{
  seen.push(m);const refreshing=m.requestId.startsWith('recheck:'),releaseId=(refreshing&&changedRelease?'f':'e').repeat(64),contracts=[],resolutions=[];
  for(const identity of m.components){const loaded=runtime.loadAuthoringSource(f.source),contract=loaded.contract;
   if(!runtime.collectContractKeys(contract).has(identity.componentKey)){resolutions.push(Object.assign({},identity,{status:'not-found'}));continue;}
   if(!contracts.length)contracts.push({source:f.source,release:{id:releaseId,channel:'local-pilot',contractId:contract.package.id,sourceHash:loaded.sourceHash,manualSourceHash:contract.package.manualSourceHash,contractHash:runtime.contractHash(contract)}});
   resolutions.push(Object.assign({},identity,{status:'resolved',contractId:contract.package.id}));
  }
  if(refreshing&&m.requestId.endsWith(':resolve'))clock+=elapsed;
  await f.api.ui.onmessage({type:'contracts-resolved',requestId:m.requestId,data:{releaseId,contracts,resolutions}});
 });};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../dist/code.js"),'utf8'),{figma:f.api,__html__:'',TextEncoder,Date:Clock,setTimeout,clearTimeout});
 await f.api.ui.onmessage({type:'audit',requestId:'original-proxy'});
 await f.api.ui.onmessage({type:'document-audit-request',schemaVersion:SCHEMA,requestId:'native',context:f.context()});
 const native=await wait(f,'document-audit-result'),contract=await wait(f,'audit-result');f.messages.length=0;
 return{f,native,contract,seen};
}
test('Theme refresh through Proxy accepts a valid response after the native-only deadline and verifies the release',async()=>{
 const {f,native,contract,seen}=await fixture();try{
  const peer=JSON.stringify(contract.audit.components.find(c=>c.scopeId==='peer'));
  await f.api.ui.onmessage(request(native,'Страница: Страница','theme'));const result=await wait(f,'document-recheck-result');
  assert.equal(result.result.checks[2].findings.filter(x=>x.status==='theme-mismatch').length,0);
  assert.equal(result.result.checks[2].findings[0].status,'theme-current');
  assert.equal(JSON.stringify(result.contract.audit.components.find(c=>c.scopeId==='peer')),peer);
  const refresh=seen.filter(m=>m.requestId.startsWith('recheck:'));assert.equal(refresh.length,2);assert.ok(refresh[1].requestId.endsWith(':verify'));assert.equal(refresh[1].releaseId,contract.audit.release.id);
  assert.equal(f.messages.some(m=>m.type==='document-recheck-error'),false);assert.equal(f.writes.filter(x=>x[0]==='theme').length,1);
  const progress=f.messages.filter(m=>m.type==='document-recheck-progress');assert.ok(progress.some(m=>m.message.includes('через Proxy')));assert.equal(progress.filter(m=>m.message==='Читаем названия токенов и стилей…').length,1);
 }finally{f.emit('close');}
});
for(const options of [{elapsed:61000},{changedRelease:true}])test('Proxy refresh rejects '+(options.changedRelease?'changed release':'response beyond the full refresh budget'),async()=>{
 const {f,native}=await fixture(options);try{
  await f.api.ui.onmessage(request(native,'Страница: Страница','theme'));const error=await wait(f,'document-recheck-error');
  assert.equal(f.messages.some(m=>m.type==='document-recheck-result'),false);assert.equal(f.writes.filter(x=>x[0]==='theme').length,1);
  if(options.elapsed)assert.match(error.message,/Чтение заняло слишком много времени/);
 }finally{f.emit('close');}
});
