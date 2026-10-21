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
