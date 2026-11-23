const test=require('node:test'),assert=require('node:assert/strict');
const {setup,request,wait}=require("./postaction-scoped.test");
test('scoped refresh reports fresh partial timing rather than inherited whole-area timing',async()=>{
 const {f,native,contract}=await setup();
 try{
  assert.equal(contract.audit.timings.scope,'contract-area-audit-before-delivery');
  f.messages.length=0;await f.api.ui.onmessage(request(native,'Составной компонент'));
  const result=await wait(f,'document-recheck-result'),timing=result.contract.audit.timings;
  assert.equal(timing.schemaVersion,'apollo.audit-timings.v1');
  assert.equal(timing.scope,'scoped-contract-audit-before-merge');
  assert.notDeepEqual(timing,contract.audit.timings);
  assert.deepEqual(timing.stages.filter(s=>s.stage==='capture').map(s=>s.scopeId),['actual']);
  assert.equal(timing.stages.some(s=>s.stage==='focus-targets'),false);
 }finally{f.emit('close');}
});

test('one contract hash per unique compiled source, fresh on each audit',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),{actionScene}=require('./focus-actions.fixture.cjs'),authored=require('./authoring-fixtures');
 const f=actionScene();vm.runInNewContext(fs.readFileSync(require.resolve('../dist/code.js'),'utf8'),{figma:f.api,__html__:'',TextEncoder,setTimeout,clearTimeout});
 try{
  const source=authored.nested().source;await f.api.ui.onmessage({type:'load-contract',source});
  const hashes=[];
  for(let i=0;i<2;i++){
   if(i){source.manual.metadata.revision++;await f.api.ui.onmessage({type:'load-contract',source});}
   const requestId='hash-'+i;await f.api.ui.onmessage({type:'audit',requestId});
   assert.deepEqual(f.messages.filter(m=>m.type==='error'&&m.requestId===requestId),[]);
   const result=f.messages.find(m=>m.type==='audit-result'&&m.requestId===requestId);assert(result);
   const full=await require('./full-audit.fixture.cjs').fullAudit(f.api,f.messages,result.audit);
   const sources=new Set(full.components.map(c=>c.release.contractHash));
   assert(full.components.length>sources.size,'fixture must repeat a compiled contract');
   assert.equal(full.timings.stages.filter(s=>s.stage==='contract-hash').length,sources.size);
   assert.equal(full.timings.stages.filter(s=>s.stage==='capture').length,full.components.length);
   assert.equal(full.timings.stages.filter(s=>s.stage==='verify-capture').length,0,'no intermediate full reread');
   assert.equal(full.timings.stages.filter(s=>s.stage==='verify-final-capture').length,full.components.length);
   assert.equal(full.timings.readScheduling.scope,'shared-reader-window');
   for(const key of ['readCount','readWaitMs','hostYieldCount','hostYieldWaitMs'])assert(Number.isFinite(full.timings.readScheduling[key])&&full.timings.readScheduling[key]>=0,key);
   assert(full.timings.readScheduling.readCount>0,'actual built capture reports reader activity');
   hashes.push([...sources].sort().join(','));
  }
  assert.notEqual(hashes[0],hashes[1],'changed manual must use a fresh source hash');
 }finally{f.emit('close');}
});
