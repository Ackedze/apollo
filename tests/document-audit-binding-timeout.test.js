const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,bridge,request,settle}=require('./document-audit.test');

test('an unavailable action catalog cannot hold completed native checks or their UI result',async()=>{
 const f=fixture();f.theme('base');f.page.selection=[f.node('area')];let started=false;
 const b=bridge(f,{timeoutMs:30,bindingAdapter:{resolve(){started=true;return new Promise(()=>{});}}});
 try{
  b.accept(request(f));
  const result=await settle(f,'document-audit-result');
  assert.equal(result.result.checks.some(c=>c.status==='running'),false);
  assert.equal(result.result.checks.find(c=>c.id==='local').status,'complete');
  assert.equal(started,true);
  assert.equal(f.messages.some(m=>m.type==='document-audit-cancelled'),false);
  await new Promise(r=>setTimeout(r,40));
  assert.equal(f.messages.filter(m=>m.type==='document-audit-result').length,1);
  assert.equal(f.writes.length,0);
 }finally{b.stop();}
});

test('a delayed optional catalog cannot replace actions after a new native run',async()=>{
 const f=fixture();f.page.selection=[f.node('area')];let release,hold=true;
 const b=bridge(f,{timeoutMs:40,bindingAdapter:{resolve:async()=>{if(hold)await new Promise(r=>release=r);return new Map();}}});
 try{
  b.accept(request(f,'old'));await settle(f,'document-audit-result','old');
  hold=false;b.accept(request(f,'new'));await settle(f,'document-audit-result','new');
  const count=f.messages.filter(m=>m.type==='document-binding-actions'&&m.runId==='old').length;
  release();await new Promise(r=>setTimeout(r,5));
  assert.equal(f.messages.filter(m=>m.type==='document-binding-actions'&&m.runId==='old').length,count);
  assert.equal(f.writes.length,0);
 }finally{b.stop();}
});
