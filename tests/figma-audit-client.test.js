'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createFigmaAuditClient}=require('../src/figma-audit/client');
const p=require('../src/figma-audit/protocol');
const snapshot={version:p.VERSION,snapshotId:'s',pageId:'p',rootIds:['r'],contextParents:[],nodes:[{id:'r',type:'FRAME',name:'Screen'}]};
const report={version:p.VERSION,snapshotId:'s',checks:[{id:'rule:r',sourceId:'hub/file.md',targets:['r'],status:'UNKNOWN'}],freshness:'NATIVE_RECHECKED'};
function nativeFailureFixture({cancelMode='confirmed',diagnostic={name:'NativeFixtureError',message:'Fixture source getter failed'},code='AUDIT_READ_FAILED'}={}){
 let client,requestId,cancels=0;const partial={plan:[{id:'retained-plan'}],evidence:{'native-1':{identityOnly:true}},provisional:true},run=status=>({version:p.VERSION,requestId,runId:'run',snapshotId:'s',status,report:null,preview:null,pending:status==='awaiting-native'?{callId:'source-read',operation:'source',nodeIds:['master']}:null,partial:status==='cancelled'?partial:null});
 client=createFigmaAuditClient({send:m=>queueMicrotask(()=>client.accept(m.operation==='capture'?{type:'figma-audit-native-result',callId:m.callId,success:true,result:snapshot}:{type:'figma-audit-native-result',callId:m.callId,success:false,code,diagnostic})),request:async(url,opts)=>{
  let value;if(url.endsWith('/status'))value={wireVersion:p.VERSION,requestControl:'request-id-v1',factEvidence:'native-fields-v1'};
  else if(url.endsWith('/runs')){requestId=JSON.parse(opts.body).requestId;value={run:run('awaiting-native')};}
  else if(url.endsWith('/cancel')){cancels++;if(cancelMode==='offline')throw TypeError('Fixture disconnected');const stopped=run('cancelled');if(cancelMode==='foreign')stopped.requestId='unrelated-request';value={requestId,stopping:false,run:stopped};}else throw Error('Unexpected route');
  return {ok:true,json:async()=>Object.assign({success:true},value)};
 }});
 return {client,partial,cancels:()=>cancels};
}
test('automatic stop after native failure retains confirmed plan/evidence and bounded diagnostics',async()=>{
 const f=nativeFailureFixture({diagnostic:{name:'N'.repeat(200),message:'M'.repeat(2000),operation:'forged',nodeIds:['foreign'],stack:'PRIVATE_STACK'}});await f.client.start();const state=f.client.getState();
 assert.equal(state.status,'error');assert.equal(state.report,null);assert.equal(f.cancels(),1);assert.equal(state.run.status,'cancelled');assert.deepEqual(state.run.partial,f.partial);assert.equal(state.run.nativeFailure.operation,'source');assert.deepEqual(state.run.nativeFailure.nodeIds,['master']);assert.equal(state.run.nativeFailure.name.length,80);assert.equal(state.run.nativeFailure.message.length,1000);assert.equal(JSON.stringify(state.run).includes('PRIVATE_STACK'),false);assert.equal(JSON.stringify(state.run).includes('foreign'),false);
});
test('unconfirmed or mismatched stop does not adopt another run and retains native failure',async()=>{
 for(const cancelMode of ['offline','foreign']){
  const f=nativeFailureFixture({cancelMode});await f.client.start();const state=f.client.getState();assert.equal(state.status,'stop-error');assert.equal(f.client.busy(),true);assert.equal(state.run.status,'awaiting-native');assert.equal(state.run.partial,null);assert.equal(state.run.nativeFailure.message,'Fixture source getter failed');assert.equal(state.run.requestId==='unrelated-request',false);await f.client.start();assert.equal(f.cancels(),1);
 }
});
test('legacy native failure without diagnostic still retains confirmed partial output',async()=>{
 const f=nativeFailureFixture({diagnostic:null});await f.client.start();const state=f.client.getState();assert.equal(state.status,'error');assert.equal(state.run.status,'cancelled');assert.deepEqual(state.run.partial,f.partial);assert.equal(state.run.nativeFailure.code,'AUDIT_READ_FAILED');assert.equal(state.run.nativeFailure.message,'');
});
test('stale native failure remains stale and cannot expose a current report',async()=>{
 const f=nativeFailureFixture({code:'AUDIT_STALE'});await f.client.start();const state=f.client.getState();assert.equal(state.status,'error');assert.equal(state.stale,true);assert.equal(state.report,null);assert.equal(state.run.nativeFailure.code,'AUDIT_STALE');assert.deepEqual(state.run.partial,f.partial);
});
test('Stop during native-error cleanup and a later run cannot adopt the old cancelled run',async()=>{
 let client,firstId,secondId,releaseStop,stopping=false,starts=0;
 const run=(requestId,status)=>({version:p.VERSION,requestId,runId:requestId===firstId?'first-run':'second-run',snapshotId:'s',status,report:status==='completed'?report:null,preview:null,pending:status==='awaiting-native'?{callId:'source',operation:'source',nodeIds:['master']}:null,partial:status==='cancelled'?{plan:[{id:'old-plan'}]}:null});
 client=createFigmaAuditClient({send:m=>queueMicrotask(()=>client.accept(m.operation==='source'?{type:'figma-audit-native-result',callId:m.callId,success:false,code:'AUDIT_READ_FAILED',diagnostic:{message:'Old failure'}}:{type:'figma-audit-native-result',callId:m.callId,success:true,result:m.operation==='capture'?snapshot:{current:true,snapshotId:'s'}})),request:async(url,opts)=>{
  if(url.endsWith('/status'))return {ok:true,json:async()=>({success:true,wireVersion:p.VERSION,requestControl:'request-id-v1',factEvidence:'native-fields-v1'})};
  if(url.endsWith('/runs')){starts++;const id=JSON.parse(opts.body).requestId;if(starts===1)firstId=id;else secondId=id;return {ok:true,json:async()=>({success:true,run:run(id,starts===1?'awaiting-native':'completed')})};}
  if(url.endsWith('/cancel')){stopping=true;return new Promise(resolve=>{releaseStop=()=>resolve({ok:true,json:async()=>({success:true,requestId:firstId,stopping:false,run:run(firstId,'cancelled')})});});}
  throw Error('Unexpected route');
 }});
 const original=client.start();while(!stopping)await new Promise(resolve=>setImmediate(resolve));const stopped=client.cancel();await client.start();assert.equal(starts,1);releaseStop();await stopped;await client.start();await original;
 assert.equal(client.getState().status,'done');assert.equal(client.getState().run.requestId,secondId);assert.equal(client.getState().run.runId,'second-run');assert.equal(client.getState().run.nativeFailure,undefined);assert.equal(client.getState().report,report);
});
test('client relays only typed native reads and rechecks before displaying completed report',async()=>{
 let client,stage=0;const operations=[],requests=[];
 const run=()=>({version:p.VERSION,requestId:'request',runId:'run',snapshotId:'s',status:stage===2?'completed':'awaiting-native',pending:{callId:'call-'+stage,operation:stage===0?'read':'verify',nodeIds:stage===0?['r']:[]},report:stage===2?report:null});
 client=createFigmaAuditClient({send:message=>{operations.push(message.operation);queueMicrotask(()=>client.accept({type:'figma-audit-native-result',callId:message.callId,success:true,result:message.operation==='capture'?snapshot:message.operation==='read'?{nodes:[{id:'r',fills:[]}]}:{current:true,snapshotId:'s'}}));},request:async(url,options)=>{requests.push(url);let body={};if(options?.body)body=JSON.parse(options.body);if(url.endsWith('/status'))return {ok:true,json:async()=>({success:true,wireVersion:p.VERSION,requestControl:'request-id-v1',factEvidence:'native-fields-v1'})};if(url.endsWith('/runs')){const r=run();r.requestId=body.requestId;report.requestId=body.requestId;run.requestId=body.requestId;return {ok:true,json:async()=>({success:true,run:r})};}stage++;const r=run();r.requestId=run.requestId;return {ok:true,json:async()=>({success:true,run:r})};}});
 await client.start();assert.equal(client.getState().status,'done');assert.deepEqual(operations,['capture','read','verify','verify']);assert.equal(client.getState().report,report);
 client.accept({type:'native-diagnostic-invalidated'});assert.equal(client.getState().stale,true);await client.focus('r');assert.equal(operations.length,4);
});
test('client never dispatches a Proxy-proposed write operation',async()=>{
 const operations=[];let client,requestId;
 client=createFigmaAuditClient({send:m=>{operations.push(m.operation);queueMicrotask(()=>client.accept({type:'figma-audit-native-result',callId:m.callId,success:true,result:snapshot}));},request:async(url,opts)=>{if(url.endsWith('/status'))return {ok:true,json:async()=>({success:true,wireVersion:p.VERSION,requestControl:'request-id-v1',factEvidence:'native-fields-v1'})};if(url.endsWith('/cancel'))return {ok:true,json:async()=>({success:true,requestId,stopping:false,run:null})};requestId=JSON.parse(opts.body).requestId;return {ok:true,json:async()=>({success:true,run:{version:p.VERSION,requestId,runId:'run',snapshotId:'s',status:'awaiting-native',pending:{callId:'x',operation:'apply',nodeIds:['r']}}})};}});
 await client.start();assert.equal(client.getState().status,'error');assert.match(client.getState().error,/операция/);assert.deepEqual(operations,['capture']);
});
test('wire budgets measure UTF-8 bytes, including Cyrillic and astral characters',()=>{assert.equal(p.byteLength('Ая 😀'),Buffer.byteLength('Ая 😀'));});

test('incompatible or legacy status stops before native capture and model start',async()=>{
 for(const status of [{success:true},{success:true,wireVersion:'apollo.figma-audit.v1'},{success:false,code:'AUDIT_WIRE_INCOMPATIBLE'},{success:false,code:'DATA_RELEASE_RUNTIME_INCOMPATIBLE'}]){
  const sent=[],urls=[],client=createFigmaAuditClient({send:m=>sent.push(m),request:async url=>{urls.push(url);return {ok:status.success,json:async()=>status};}});
  await client.start();assert.equal(client.getState().status,'error');assert.match(client.getState().error,/совместим/);assert.deepEqual(sent,[]);assert.equal(urls.length,1);
 }
});

test('client preserves provisional results on Stop and ignores a late completed reply',async()=>{
 let client,requestId,release;const ready=new Promise(resolve=>{release=resolve;}),preview={received:1,planned:2,provisional:true,checks:[{id:'first',status:'UNKNOWN'}]},run=(status='running')=>({version:p.VERSION,requestId,runId:'run',snapshotId:'s',status,preview,report:null,usage:{}});
 client=createFigmaAuditClient({send:m=>queueMicrotask(()=>client.accept({type:'figma-audit-native-result',callId:m.callId,success:true,result:snapshot})),request:async(url,opts)=>{if(url.endsWith('/status'))return {ok:true,json:async()=>({success:true,wireVersion:p.VERSION,requestControl:'request-id-v1',factEvidence:'native-fields-v1'})};if(url.endsWith('/runs')){requestId=JSON.parse(opts.body).requestId;return {ok:true,json:async()=>({success:true,run:run()})};}if(url.endsWith('/cancel'))return {ok:true,json:async()=>({success:true,requestId,stopping:false,run:run('cancelled')})};await ready;return {ok:true,json:async()=>({success:true,run:{...run('completed'),report}})};}});
 const task=client.start();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(client.getState().run.preview,preview);await client.cancel();assert.equal(client.getState().run.status,'cancelled');assert.equal(client.getState().run.preview,preview);release();await task;assert.equal(client.getState().status,'idle');assert.equal(client.getState().report,null);assert.equal(client.getState().run.preview.provisional,true);
});
test('native invalidation marks provisional output stale and never enables focus',async()=>{
 let client,requestId;const sent=[],preview={received:1,planned:1,checks:[]};client=createFigmaAuditClient({send:m=>{sent.push(m.operation);queueMicrotask(()=>client.accept({type:'figma-audit-native-result',callId:m.callId,success:true,result:snapshot}));},request:async(url,opts)=>{if(url.endsWith('/status'))return {ok:true,json:async()=>({success:true,wireVersion:p.VERSION,requestControl:'request-id-v1',factEvidence:'native-fields-v1'})};if(url.endsWith('/runs'))requestId=JSON.parse(opts.body).requestId;return {ok:true,json:async()=>({success:true,requestId,stopping:false,run:{version:p.VERSION,requestId,runId:'run',snapshotId:'s',status:url.endsWith('/cancel')?'cancelled':'running',preview}})};}});
 const task=client.start();await new Promise(resolve=>setTimeout(resolve,20));client.accept({type:'native-diagnostic-invalidated'});assert.equal(client.getState().stale,true);await client.focus('r');assert.deepEqual(sent,['capture']);await client.cancel();await task;assert.equal(client.getState().report,null);assert.equal(client.getState().stale,true);
});

test('Stop uses requestId before a delayed start reply and cannot be undone by that late reply',async()=>{
 let client,requestId,replyStart,started=false,remoteRunning=false;const urls=[];
 client=createFigmaAuditClient({send:m=>queueMicrotask(()=>client.accept({type:'figma-audit-native-result',callId:m.callId,success:true,result:snapshot})),request:async(url,opts)=>{urls.push(url);if(url.endsWith('/status'))return {ok:true,json:async()=>({success:true,wireVersion:p.VERSION,requestControl:'request-id-v1',factEvidence:'native-fields-v1'})};if(url.endsWith('/runs')){requestId=JSON.parse(opts.body).requestId;remoteRunning=true;started=true;return new Promise(resolve=>{replyStart=()=>resolve({ok:true,json:async()=>({success:true,run:{version:p.VERSION,requestId,runId:'late',snapshotId:'s',status:'running'}})});});}if(url.endsWith('/cancel')){assert(url.includes(encodeURIComponent(requestId)));remoteRunning=false;return {ok:true,json:async()=>({success:true,requestId,stopping:false,run:null})};}throw Error('Unexpected request');}});
 const task=client.start();while(!started)await new Promise(r=>setImmediate(r));await client.cancel();assert.equal(remoteRunning,false);assert.equal(client.getState().status,'idle');replyStart();await task;assert.equal(client.getState().status,'idle');assert.equal(client.getState().run,null);assert.equal(urls.filter(u=>u.endsWith('/cancel')).length,1);assert.equal(urls.some(u=>u.includes('/runs/null')),false);
});
test('aborted start still cancels by requestId and waits for executor drain; repeated Stop is idempotent',async()=>{
 let client,requestId,started=false,aborted=false,draining=true,cancels=0;
 client=createFigmaAuditClient({send:m=>queueMicrotask(()=>client.accept({type:'figma-audit-native-result',callId:m.callId,success:true,result:snapshot})),request:async(url,opts)=>{if(url.endsWith('/status'))return {ok:true,json:async()=>({success:true,wireVersion:p.VERSION,requestControl:'request-id-v1',factEvidence:'native-fields-v1'})};if(url.endsWith('/runs')){requestId=JSON.parse(opts.body).requestId;started=true;return new Promise((_resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(Object.assign(Error('Aborted'),{name:'AbortError'})),{once:true}));}if(url.endsWith('/cancel')){cancels++;aborted=true;}return {ok:true,json:async()=>({success:true,requestId,stopping:draining,run:null})};}});
 const start=client.start();while(!started)await new Promise(r=>setImmediate(r));const stop=client.cancel();assert.equal(client.cancel(),stop);await new Promise(r=>setImmediate(r));assert.equal(aborted,true);assert.equal(client.getState().status,'stopping');assert.equal(client.busy(),true);await client.start();assert.equal(cancels,1);draining=false;await stop;await start;assert.equal(client.getState().status,'idle');assert.equal(client.busy(),false);assert.equal(cancels,1);
});
test('failed Stop acknowledgement remains visible and prevents a new run until retry succeeds',async()=>{
 let client,requestId,started=false,retry=false,replyStart;
 client=createFigmaAuditClient({send:m=>queueMicrotask(()=>client.accept({type:'figma-audit-native-result',callId:m.callId,success:true,result:snapshot})),request:async(url,opts)=>{if(url.endsWith('/status'))return {ok:true,json:async()=>({success:true,wireVersion:p.VERSION,requestControl:'request-id-v1',factEvidence:'native-fields-v1'})};if(url.endsWith('/runs')){requestId=JSON.parse(opts.body).requestId;started=true;return new Promise(resolve=>{replyStart=()=>resolve({ok:true,json:async()=>({success:true,run:{version:p.VERSION,requestId,runId:'late',snapshotId:'s',status:'running'}})});});}if(!retry)throw TypeError('No connection');return {ok:true,json:async()=>({success:true,requestId,stopping:false,run:null})};}});
 const task=client.start();while(!started)await new Promise(r=>setImmediate(r));await client.cancel();assert.equal(client.getState().status,'stop-error');assert.equal(client.busy(),true);assert.match(client.getState().error,/подтвердить остановку/);retry=true;await client.cancel();assert.equal(client.getState().status,'idle');replyStart();await task;assert.equal(client.getState().status,'idle');
});
