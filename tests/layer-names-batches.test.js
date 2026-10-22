const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const path=require('node:path'),source=process.env.APOLLO_BATCH_TEST_ROOT||path.resolve(__dirname,'..');
const {createLayerNamesBridge}=require(path.join(source,'src/skills/layer-names/native'));
const {createLayerNamesClient}=require(path.join(source,'src/skills/layer-names/client'));
const p=require('../src/skills/layer-names/run-protocol')(require('../src/skills/layer-names/protocol'));
const b=require('../src/skills/layer-names/batch-protocol');
const vm=require('node:vm'),observerModule={exports:{}};
vm.runInNewContext(require('esbuild').buildSync({entryPoints:[path.join(source,'src/generation/native/observer.ts')],bundle:true,platform:'browser',format:'cjs',write:false}).outputFiles[0].text,{module:observerModule,exports:observerModule.exports});
const {createCurrentPageDiagnosticObserver}=observerModule.exports;
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fixture(count=85,{unavailableObserver=false,legacyGlobalFixture=false}={}){
  let sequence=0,last,client,mutationCount=0,corruptReplies=[],legacyChanged=()=>{};const operations=[],listeners=new Map(),pageListeners=new Set();
  const page={id:'page',type:'PAGE',children:[],selection:[],on(type,fn){assert.equal(type,'nodechange');if(unavailableObserver)throw Error('page observer unavailable');pageListeners.add(fn);},off(type,fn){assert.equal(type,'nodechange');pageListeners.delete(fn);}};
  function node(type,name,parent,extra={}){const n={id:'n'+(++sequence),type,name,parent,children:[],visible:true,locked:false,removed:false,getPluginDataKeys:()=>[],...extra};parent.children.push(n);return n;}
  const root=node('FRAME','Screen',page),rows=[];for(let i=0;i<count;i++)rows.push(node('FRAME','Frame '+i,root));page.selection=[root];
  const api={currentPage:page,viewport:{scrollAndZoomIntoView(){}},commitUndo(){},on(type,fn){if(legacyGlobalFixture&&type==='documentchange'){legacyChanged=fn;return;}assert.ok(['currentpagechange','close'].includes(type),'dynamic-page forbids global documentchange without loading all pages');listeners.set(type,fn);},off(type,fn){assert.equal(listeners.get(type),fn);listeners.delete(type);},loadAllPagesAsync(){throw Error('must not load all pages');}};
  const observer=createCurrentPageDiagnosticObserver(api,()=>{});
  const bridge=createLayerNamesBridge({api,hash,observer:()=>observer.snapshot(),onMutation:()=>mutationCount++,post:m=>{last=m;if(client){if(m.operation===corruptReplies[0]){corruptReplies.shift();m={...m,schemaVersion:'broken'};}queueMicrotask(()=>client.accept(m));}}});
  observer.start();
  function send(m){operations.push(m);bridge.accept(m);}
  function rpc(operation,payload={}){if(['batch-apply','batch-undo'].includes(operation)&&!payload.operationId)payload={...payload,operationId:'mutation-'+operations.length};const batch=operation.startsWith('batch-');send({type:batch?'layer-names-batch-request':'layer-names-request',schemaVersion:batch?b.SCHEMA:p.SCHEMA,requestId:'test-'+operations.length,operation,payload});assert.ok(last);return last;}
  function ok(operation,payload={}){const message=rpc(operation,payload);assert.ok(!message.error,message.error);return message.result;}
  function capture(){let m=ok('capture');assert.ok(b.manifestValid(m));while(m.status==='capturing')m=ok('batch-next',{sessionId:m.sessionId});return m;}
  function check(m,purpose,batchIndex=null,attemptId=null){let c=ok('batch-check',{sessionId:m.sessionId,purpose,batchIndex,attemptId});while(!c.done)c=ok('batch-check-next',{sessionId:m.sessionId,checkId:c.checkId});return c.token;}
  function open(m,index,attempt='attempt-'+index){const token=check(m,'open',index,attempt);return ok('batch-open',{sessionId:m.sessionId,batchIndex:index,attemptId:attempt,token});}
  function register(m,index,snapshot,attempt='attempt-'+index,changes=snapshot.nodes.map(change)){const token=check(m,'register',index,attempt);return ok('batch-register',{sessionId:m.sessionId,batchIndex:index,attemptId:attempt,token,plan:{changes}});}
  function prepare(){const m=capture(),all=[];for(let index=0;index<m.batchCount;index++){const s=open(m,index);all.push(...s.nodes);register(m,index,s);}return {m,all};}
  function verified(result,m){while(result.status==='verifying')result=ok('batch-verify',{sessionId:m.sessionId,operationId:result.operationId});return result.result;}
  const change=n=>({nodeId:n.nodeId,oldName:n.oldName,newName:'Слой '+n.nodeId,reason:'Есть содержимое',category:'recommended'});
  function makeClient(request){client=createLayerNamesClient({send,request});return client;}
  return {root,rows,page,node,api,rpc,ok,capture,check,open,register,prepare,verified,change,makeClient,operations,changed:()=>{legacyChanged();for(const fn of pageListeners)fn({nodeChanges:[{type:'PROPERTY_CHANGE',id:root.id,node:root,properties:['name']}]});},corruptNextReply:op=>{corruptReplies=Array.isArray(op)?op:[op];},mutations:()=>mutationCount};
}
function run(body,overrides={}){return {schemaVersion:p.RUN_SCHEMA,requestId:body.requestId,runId:'00000000-0000-4000-8000-000000000001',snapshotId:body.snapshot.snapshotId,status:'completed',step:1,readCount:0,pending:null,plan:{changes:body.snapshot.nodes.map(n=>({nodeId:n.nodeId,oldName:n.oldName,newName:'Слой '+n.nodeId,reason:'Есть содержимое',category:'recommended'}))},error:null,skill:{name:'figma-layer-name-hygiene',version:'0.2.0',sha256:'a'.repeat(64)},wire:{version:p.WIRE_VERSION,sha256:p.WIRE_SHA256},...overrides};}
const response=r=>({ok:true,status:200,json:async()=>({success:true,run:r})});

test('over 300 candidates form strict bounded v1 snapshots with no duplicate or missing IDs',()=>{
  const f=fixture(360),m=f.capture(),all=[];assert.equal(m.candidateCount,361);assert.equal(m.batchCount,10);
  for(let i=0;i<m.batchCount;i++){const s=f.open(m,i);assert.ok(p.snapshotValid(s));assert.ok(s.nodes.length<=40);assert.ok(b.bytes(s)<=60000);all.push(...s.nodes);f.register(m,i,s);}
  assert.equal(new Set(all.map(n=>n.nodeId)).size,361);assert.equal(all.length,361);
});
test('large protected instance subtree is scanned incrementally and supplies text, never rename targets',()=>{
  const f=fixture(0),instance=f.node('INSTANCE','Card',f.root);
  for(let i=0;i<3500;i++)f.node('TEXT','Caption',instance,{characters:'Текст '+i,autoRename:true});
  const first=f.ok('capture');assert.equal(first.status,'capturing');assert.equal(first.batchCount,0);
  let m=first,slices=0;while(m.status==='capturing'){m=f.ok('batch-next',{sessionId:m.sessionId});slices++;}
  assert.ok(slices>20);assert.equal(m.observedCount,3502);assert.equal(m.candidateCount,2);
  const s=f.open(m,0);assert.equal(s.nodes.length,2);assert.equal(s.nodes[0].texts.length,12);assert.ok(s.nodes.every(n=>n.type!=='TEXT'));
});
test('capture deadline falls back to incremental reading independently of node count',t=>{
  const f=fixture(50),original=Date.now;let clock=0;Date.now=()=>clock;t.after(()=>{Date.now=original;});
  f.root.getPluginDataKeys=()=>{clock+=3100;return [];};
  const first=f.ok('capture');assert.equal(first.status,'capturing');let m=first;
  while(m.status==='capturing')m=f.ok('batch-next',{sessionId:m.sessionId});
  assert.equal(m.observedCount,51);assert.equal(m.batchCount,2);
});
test('byte budget splits heavy Russian text evidence before the candidate-count target',()=>{
  const f=fixture(30);for(const row of f.rows)for(let i=0;i<12;i++)f.node('TEXT','Caption',row,{characters:'Я'.repeat(159)+i,autoRename:true});
  const m=f.capture();assert.ok(m.batchCount>1);let total=0;
  for(let i=0;i<m.batchCount;i++){const s=f.open(m,i);assert.ok(b.bytes(s)<=60000);assert.ok(s.nodes.length<40);total+=s.nodes.length;f.register(m,i,s);}
  assert.equal(total,31);
});
test('aggregate selected apply and one guarded undo cover more than 300 proposals',()=>{
  const f=fixture(330),{m,all}=f.prepare(),ids=all.map(n=>n.nodeId),before=f.rows.map(n=>n.name);
  const result=f.verified(f.ok('batch-apply',{sessionId:m.sessionId,token:f.check(m,'apply'),nodeIds:ids}),m);
  assert.equal(result.complete,true);assert.equal(result.changes.length,331);assert.equal(result.undoAvailable,true);assert.equal(f.mutations(),1);
  const restored=f.verified(f.ok('batch-undo',{sessionId:m.sessionId,token:f.check(m,'undo')}),m);
  assert.equal(restored.complete,true);assert.equal(restored.undoAvailable,false);assert.deepEqual(f.rows.map(n=>n.name),before);assert.equal(f.mutations(),2);
});
for(const kind of ['name','text','lock','structure'])test('early-batch '+kind+' drift rejects aggregate preflight before any write',()=>{
  const f=fixture(85),text=f.node('TEXT','Caption',f.rows[0],{characters:'Original',autoRename:true}),{m,all}=f.prepare();
  if(kind==='name')f.rows[0].name='Manual';if(kind==='text')text.characters='Changed';if(kind==='lock')f.root.locked=true;if(kind==='structure')f.node('FRAME','New child',f.rows[0]);
  const reply=f.rpc('batch-check',{sessionId:m.sessionId,purpose:'apply',batchIndex:null,attemptId:null});assert.match(reply.error,/измен/);assert.equal(f.mutations(),0);assert.equal(f.rows.at(-1).name,'Frame 84');
});
test('edit during yielded preflight invalidates the final token; selection and foreign tokens fail closed',()=>{
  const f=fixture(220),{m}=f.prepare();let c=f.ok('batch-check',{sessionId:m.sessionId,purpose:'apply',batchIndex:null,attemptId:null});assert.equal(c.done,false);
  const old=f.root.name;f.root.name='Manual edit';f.changed();while(!c.done)c=f.ok('batch-check-next',{sessionId:m.sessionId,checkId:c.checkId});
  assert.match(f.rpc('batch-apply',{sessionId:m.sessionId,token:c.token,nodeIds:[f.root.id]}).error,/измен/);f.root.name=old;
  const token=f.check(m,'apply');f.page.selection=[f.rows[0]];assert.match(f.rpc('batch-apply',{sessionId:m.sessionId,token,nodeIds:[f.root.id]}).error,/измен/);
  f.page.selection=[f.root];assert.match(f.rpc('batch-apply',{sessionId:m.sessionId,token:'foreign',nodeIds:[f.root.id]}).error,/устар/);assert.equal(f.mutations(),0);
});
test('partial setter failure retains observed writes and guarded undo; later manual drift blocks undo',()=>{
  const f=fixture(85),{m,all}=f.prepare(),failed=f.rows[50],old=failed.name;
  Object.defineProperty(failed,'name',{get:()=>old,set:()=>{throw Error('simulated');},configurable:true});
  const result=f.verified(f.ok('batch-apply',{sessionId:m.sessionId,token:f.check(m,'apply'),nodeIds:all.map(n=>n.nodeId)}),m);
  assert.equal(result.complete,false);assert.equal(result.verified,true);assert.equal(result.changes.length,51);assert.equal(result.observed.length,86);assert.equal(result.undoAvailable,true);
  f.rows[0].name='Manual';assert.match(f.rpc('batch-check',{sessionId:m.sessionId,purpose:'undo',batchIndex:null,attemptId:null}).error,/измен/);assert.equal(f.rows[0].name,'Manual');
});
test('partial undo keeps the remaining verified journal and can finish without overwriting restored names',()=>{
  const f=fixture(85),{m,all}=f.prepare();f.verified(f.ok('batch-apply',{sessionId:m.sessionId,token:f.check(m,'apply'),nodeIds:all.map(n=>n.nodeId)}),m);
  const row=f.rows[50],current=row.name;Object.defineProperty(row,'name',{get:()=>current,set:()=>{throw Error('simulated');},configurable:true});
  const first=f.verified(f.ok('batch-undo',{sessionId:m.sessionId,token:f.check(m,'undo')}),m);
  assert.equal(first.complete,false);assert.equal(first.verified,true);assert.equal(first.undoAvailable,true);assert.equal(first.remainingUndoCount,35);assert.equal(f.rows[0].name,'Frame 0');
  Object.defineProperty(row,'name',{value:current,writable:true,configurable:true});
  const second=f.verified(f.ok('batch-undo',{sessionId:m.sessionId,token:f.check(m,'undo')}),m);assert.equal(second.complete,true);assert.equal(second.undoAvailable,false);assert.equal(row.name,'Frame 50');
});
test('context and plans cannot cross a batch or resurrect a paused attempt',()=>{
  const f=fixture(85),m=f.capture(),s=f.open(m,0),attemptId='attempt-0';
  let token=f.check(m,'read',0,attemptId);assert.match(f.rpc('batch-read',{sessionId:m.sessionId,batchIndex:0,attemptId,token,nodeIds:[f.rows[80].id]}).error,/пачку/);
  token=f.check(m,'register',0,attemptId);f.ok('batch-pause',{sessionId:m.sessionId,attemptId});
  assert.match(f.rpc('batch-register',{sessionId:m.sessionId,batchIndex:0,attemptId,token,plan:{changes:s.nodes.map(f.change)}}).error,/устар|закрыта/);
  const next=f.open(m,0,'new-attempt');assert.equal(next.snapshotId,s.snapshotId);f.register(m,0,next,'new-attempt');
});
test('client executes one run at a time, preserves completed plans after a middle failure and resumes the unfinished batch',async()=>{
  const f=fixture(85),calls=[];let fail=true;
  const client=f.makeClient(async(url,options)=>{
    if(url.endsWith('/cancel'))return response(null);
    const body=JSON.parse(options.body);calls.push(body);assert.ok(p.snapshotValid(body.snapshot));
    if(calls.length===2 && fail)return response(run(body,{status:'failed',plan:null,error:{code:'LAYER_NAMES_DEADLINE',message:'deadline'}}));
    return response(run(body));
  });
  await client.start();assert.equal(client.getState().status,'error');assert.equal(client.getState().batch.completedCount,1);assert.equal(client.getState().plan.changes.length,40);
  fail=false;await client.start();assert.equal(client.getState().status,'preview');assert.equal(client.getState().plan.changes.length,86);assert.equal(calls.length,4);
  assert.equal(calls[1].snapshot.snapshotId,calls[2].snapshot.snapshotId);assert.notEqual(calls[1].requestId,calls[2].requestId);assert.equal(new Set(calls.map(x=>x.requestId)).size,4);
  await client.apply();assert.equal(client.getState().status,'done');assert.equal(client.getState().result.complete,true);await client.undo();assert.equal(client.getState().status,'undone');assert.equal(f.rows[0].name,'Frame 0');
});
test('client cancellation cannot register a late batch response or advance the queue',async()=>{
  const f=fixture(85);let release,entered=false,starts=0;
  const client=f.makeClient(async(url,options)=>{if(url.endsWith('/cancel'))return response(null);starts++;const body=JSON.parse(options.body);entered=true;await new Promise(resolve=>{release=resolve;});return response(run(body));});
  const work=client.start();while(!entered)await new Promise(resolve=>setImmediate(resolve));await client.cancel();release();await work;
  assert.equal(client.getState().status,'error');assert.equal(client.getState().batch.completedCount,0);assert.equal(starts,1);assert.equal(f.operations.filter(m=>m.operation==='batch-register').length,0);assert.equal(f.mutations(),0);
});
test('client bounded context uses only the current batch and validates it before returning to the agent',async()=>{
  const f=fixture(85),tickets=new Map();let contexts=0;
  const client=f.makeClient(async(url,options)=>{
    if(url.endsWith('/cancel'))return response(null);const body=JSON.parse(options.body);
    if(url.endsWith('/runs')){const ticket=run(body,{status:'awaiting-context',plan:null,pending:{callId:'read',nodeIds:[body.snapshot.nodes[0].nodeId]}});tickets.set(body.requestId,{body,ticket});return response(ticket);}
    const {body:original,ticket}=tickets.get(body.requestId);contexts++;assert.ok(p.contextValid(body.context,original.snapshot,ticket.pending.nodeIds));
    return response(run(original,{step:2,readCount:1}));
  });await client.start();assert.equal(client.getState().status,'preview');assert.equal(contexts,3);
});
test('cancellation during incremental capture stops traversal before any agent request',async()=>{
  const f=fixture(350);let calls=0,stopped=false;const client=f.makeClient(async()=>{calls++;throw Error('No agent should start');});
  client.subscribe(()=>{const s=client.getState();if(!stopped && s.status==='reading' && s.batch?.observedCount>0){stopped=true;void client.cancel();}});
  await client.start();assert.equal(stopped,true);assert.equal(calls,0);assert.equal(client.getState().status,'error');assert.equal(f.operations.filter(m=>m.operation==='batch-next').length,1);
});
test('selection change during an agent request prevents registration and later batches',async()=>{
  const f=fixture(85);let release,entered=false,starts=0;
  const client=f.makeClient(async(url,options)=>{if(url.endsWith('/cancel'))return response(null);starts++;const body=JSON.parse(options.body);entered=true;await new Promise(resolve=>{release=resolve;});return response(run(body));});
  client.selection({pageId:'page',id:f.root.id,valid:true});const work=client.start();while(!entered)await new Promise(resolve=>setImmediate(resolve));
  f.page.selection=[f.rows[0]];client.selection({pageId:'page',id:f.rows[0].id,valid:true});release();await work;
  assert.equal(client.getState().status,'error');assert.equal(starts,1);assert.equal(f.operations.filter(m=>m.operation==='batch-register').length,0);assert.equal(f.mutations(),0);
});
test('final readback keeps partial outcomes when the scope changes during yielded verification',()=>{
  const f=fixture(220),{m,all}=f.prepare();let result=f.ok('batch-apply',{sessionId:m.sessionId,token:f.check(m,'apply'),nodeIds:all.map(n=>n.nodeId)});
  result=f.ok('batch-verify',{sessionId:m.sessionId,operationId:result.operationId});assert.equal(result.status,'verifying');f.root.name='Manual edit';f.changed();result=f.verified(result,m);
  assert.equal(result.verified,false);assert.equal(result.complete,false);assert.equal(result.undoAvailable,false);assert.equal(result.changes.length,221);assert.equal(result.observed.length,221);
});
test('dynamic-page startup reuses page observer and unavailable subscription fails only the operation',()=>{
  assert.doesNotThrow(()=>fixture(85));const f=fixture(85,{unavailableObserver:true});
  assert.match(f.rpc('capture').error,/наблюдать/);assert.equal(f.mutations(),0);
});
test('delayed own nodechange during sliced readback and undo preflight keeps verified undo',()=>{
  const f=fixture(220,{legacyGlobalFixture:true}),{m,all}=f.prepare();let result=f.ok('batch-apply',{sessionId:m.sessionId,token:f.check(m,'apply'),nodeIds:all.map(n=>n.nodeId)});
  result=f.ok('batch-verify',{sessionId:m.sessionId,operationId:result.operationId});assert.equal(result.status,'verifying');f.changed();result=f.verified(result,m);
  assert.equal(result.verified,true);assert.equal(result.undoAvailable,true);
  let c=f.ok('batch-check',{sessionId:m.sessionId,purpose:'undo',batchIndex:null,attemptId:null});f.changed();while(!c.done)c=f.ok('batch-check-next',{sessionId:m.sessionId,checkId:c.checkId});
  result=f.verified(f.ok('batch-undo',{sessionId:m.sessionId,token:c.token}),m);assert.equal(result.complete,true);assert.equal(f.root.name,'Screen');assert.equal(f.rows[0].name,'Frame 0');
});
for(const kind of ['name','text','lock','structure'])test('undelivered '+kind+' event after preflight token rejects mutation synchronously',()=>{
  const f=fixture(220,{legacyGlobalFixture:true}),text=f.node('TEXT','Caption',f.rows[0],{characters:'Original',autoRename:true}),{m,all}=f.prepare(),token=f.check(m,'apply');
  if(kind==='name')f.root.name='Manual';if(kind==='text')text.characters='Changed';if(kind==='lock')f.rows[0].locked=true;if(kind==='structure')f.node('FRAME','New child',f.rows[0]);
  assert.match(f.rpc('batch-apply',{sessionId:m.sessionId,token,nodeIds:[f.rows.at(-1).id]}).error,/измен/);assert.equal(f.mutations(),0);assert.equal(f.rows.at(-1).name,'Frame 219');
});
test('a plan for another batch is rejected by the unchanged per-snapshot plan validator',()=>{
  const f=fixture(85),m=f.capture(),s=f.open(m,0),attemptId='attempt-0',token=f.check(m,'register',0,attemptId);
  const changes=[{nodeId:f.rows[80].id,oldName:f.rows[80].name,newName:'Other',reason:'Outside this batch',category:'recommended'}];
  assert.equal(p.planValid({changes},s),false);assert.match(f.rpc('batch-register',{sessionId:m.sessionId,batchIndex:0,attemptId,token,plan:{changes}}).error,/несовместим/);assert.equal(f.mutations(),0);
});
test('batch journal can restore original empty names',()=>{
  const f=fixture(85);f.rows[0].name='';const {m,all}=f.prepare();f.verified(f.ok('batch-apply',{sessionId:m.sessionId,token:f.check(m,'apply'),nodeIds:all.map(n=>n.nodeId)}),m);
  const r=f.verified(f.ok('batch-undo',{sessionId:m.sessionId,token:f.check(m,'undo')}),m);assert.equal(r.complete,true);assert.equal(f.rows[0].name,'');
});
test('client retains the applied result when manual changes make undo unsafe',async()=>{
  const f=fixture(85),client=f.makeClient(async(url,options)=>response(run(JSON.parse(options.body))));
  await client.start();await client.apply();assert.equal(client.getState().result.changes.length,86);f.rows[0].name='Manual';await client.undo();
  assert.equal(client.getState().status,'done');assert.equal(client.getState().result.changes.length,86);assert.equal(client.getState().undoBlocked,true);assert.match(client.getState().error,/измен/);assert.equal(f.rows[0].name,'Manual');
});
for(const operation of ['batch-apply','batch-verify'])test('lost '+operation+' reply is recovered by operation ID without replaying writes',async()=>{
  const f=fixture(85),client=f.makeClient(async(url,options)=>response(run(JSON.parse(options.body))));await client.start();f.corruptNextReply(operation);await client.apply();
  assert.equal(client.getState().status,'done');assert.equal(client.getState().result.complete,true);assert.equal(client.getState().pendingMutation,null);assert.equal(f.operations.filter(m=>m.operation==='batch-apply').length,1);assert.equal(f.mutations(),1);
  const last=f.operations.filter(m=>m.operation==='batch-verify').at(-1).payload;assert.equal(f.ok('batch-verify',last).status,'done');assert.match(f.rpc('batch-verify',{...last,operationId:'foreign'}).error,/результат/);
});
test('repeated lost write replies retain recovery ownership and manual retry reads the cached outcome only',async()=>{
  const f=fixture(85);let calls=0;const client=f.makeClient(async(url,options)=>{calls++;return response(run(JSON.parse(options.body)));});await client.start();const analysed=calls;
  f.corruptNextReply(['batch-apply','batch-verify']);await client.apply();assert.equal(client.getState().status,'error');assert.ok(client.getState().pendingMutation);
  client.cancelView();assert.equal(client.getState().status,'error');await client.start({fresh:true});
  assert.equal(client.getState().status,'done');assert.equal(client.getState().result.complete,true);assert.equal(client.getState().pendingMutation,null);assert.equal(calls,analysed);assert.equal(f.operations.filter(m=>m.operation==='batch-apply').length,1);assert.equal(f.mutations(),1);
});
test('a completed mutation ID cannot be reused for a different write',()=>{
  const f=fixture(85),{m,all}=f.prepare(),operationId='single-operation';f.verified(f.ok('batch-apply',{sessionId:m.sessionId,token:f.check(m,'apply'),operationId,nodeIds:all.map(n=>n.nodeId)}),m);
  assert.match(f.rpc('batch-undo',{sessionId:m.sessionId,token:f.check(m,'undo'),operationId}).error,/использована/);assert.equal(f.mutations(),1);
});
test('remote skill changes cannot silently mix rules across completed batches',async()=>{
  const f=fixture(85);let calls=0,fresh=false;const client=f.makeClient(async(url,options)=>{
    if(url.endsWith('/cancel'))return response(null);const body=JSON.parse(options.body);calls++;
    return response(run(body,{skill:{name:'figma-layer-name-hygiene',version:'0.2.0',sha256:(fresh||calls>1?'b':'a').repeat(64)}}));
  });await client.start();assert.equal(client.getState().status,'error');assert.match(client.getState().error,/Правила навыка изменились/);assert.equal(client.getState().batch.completedCount,1);assert.equal(client.getState().plan.changes.length,40);
  fresh=true;await client.start({fresh:true});assert.equal(client.getState().status,'preview');assert.equal(client.getState().batch.completedCount,3);assert.equal(client.getState().batchSkill.sha256,'b'.repeat(64));
});
test('exhausted Proxy ledger preserves partial preview and resumes with a fresh request ID',async()=>{
 const f=fixture(85),ids=[];let full=true;const client=f.makeClient(async(url,options)=>{
  if(url.endsWith('/cancel'))return response(null);const body=JSON.parse(options.body);ids.push(body.requestId);
  if(ids.length===2&&full)return {ok:false,status:429,json:async()=>({success:false,code:'LAYER_NAMES_RUN_LIMIT'})};
  return response(run(body));
 });
 await client.start();assert.equal(client.getState().status,'error');assert.match(client.getState().error,/История запусков.*Перезапустите/);assert.equal(client.getState().batch.completedCount,1);assert.equal(client.getState().plan.changes.length,40);assert.equal(f.mutations(),0);
 full=false;await client.start();assert.equal(client.getState().status,'preview');assert.equal(client.getState().batch.completedCount,3);assert.equal(ids.length,4);assert.equal(new Set(ids).size,4);
});
