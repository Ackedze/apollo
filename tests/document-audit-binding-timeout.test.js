const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,bridge,request,settle}=require('./document-audit.test');
const {createCatalogPort,createCatalogTransport}=require('../src/v3-binding/catalog-port');

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

test('controlled deprecated index request survives more than one second with one physical fetch',async()=>{
 let port,transport,finish,calls=0;const messages=[],jobs=[];
 port=createCatalogPort(m=>{messages.push(m);jobs.push(transport.accept(m));});
 transport=createCatalogTransport(m=>port.accept(m),async()=>{calls++;await new Promise(r=>finish=r);return{ok:true,text:async()=>'{"indexId":"synthetic"}'};});
 const task=port.read('deprecatedStyles',null,null,()=>{});
 await new Promise(r=>setTimeout(r,1050));assert.equal(calls,1);assert.equal(messages.some(m=>m.type==='v3-catalog-cancel'),false);
 finish();assert.deepEqual(await task,{indexId:'synthetic'});await Promise.all(jobs);
});
test('controlled index Stop aborts its existing request and discards a late successful response',async()=>{
 let port,transport,finish,stopped=false,signal;const replies=[],messages=[],jobs=[];
 port=createCatalogPort(m=>{messages.push(m);jobs.push(transport.accept(m));});
 transport=createCatalogTransport(m=>{replies.push(m);port.accept(m);},async(_url,options)=>{signal=options.signal;await new Promise(r=>finish=r);return{ok:true,text:async()=>'{"late":true}'};});
 const task=port.read('deprecatedStyles',null,null,()=>{if(stopped)throw Error('NATIVE_CANCELLED');});stopped=true;
 await assert.rejects(task,/NATIVE_CANCELLED/);assert.equal(signal.aborted,true);assert.equal(messages.filter(m=>m.type==='v3-catalog-request').length,1);
 finish();await Promise.all(jobs);assert.equal(replies.some(m=>m.error===null),false);
});
test('legacy finite catalog requests retain timeout and late-response rejection',async()=>{
 const messages=[],port=createCatalogPort(m=>messages.push(m));const task=port.read('names',null,5);await assert.rejects(task,/CATALOG_TIMEOUT/);
 assert.equal(messages[1].type,'v3-catalog-cancel');port.accept({type:'v3-catalog-response',requestId:messages[0].requestId,data:{late:true},error:null});
 await assert.rejects(port.read('names',null,null,()=>{}),/CATALOG_UNAVAILABLE/);
});
test('controlled index transport keeps real HTTP, network and invalid-response codes',async()=>{
 for(const [response,code]of [[{ok:false,status:403},'CATALOG_HTTP_403'],[{ok:true,text:async()=>'{bad JSON'},'CATALOG_RESPONSE_INVALID'],[null,'CATALOG_NETWORK']]){
  let port;const transport=createCatalogTransport(m=>port.accept(m),async()=>{if(!response)throw TypeError('Failed to fetch');return response;});
  port=createCatalogPort(m=>{void transport.accept(m);});await assert.rejects(port.read('deprecatedStyles',null,null,()=>{}),new RegExp(code));
 }
});
