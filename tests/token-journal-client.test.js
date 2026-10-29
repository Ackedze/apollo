const {test}=require('node:test'),assert=require('node:assert/strict');
const {createTokenJournalClient}=require('../src/token-journal-client');
const {createTokenJournalBridge,PREFIX}=require('../src/token-journal-native');
const pause=()=>new Promise(r=>setTimeout(r,5));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await pause();}assert.fail('Statistics fixture did not settle');}
function fixture(options={}){
 const data=options.data || new Map(),sent=[];let client;let online=true;
 const storage={keysAsync:async()=>Array.from(data.keys()),getAsync:async key=>structuredClone(data.get(key)),setAsync:async(key,value)=>{if(options.quota)throw Error('Quota');data.set(key,structuredClone(value));},deleteAsync:async key=>{data.delete(key);}};
 const native=createTokenJournalBridge({storage,post:message=>queueMicrotask(()=>client.accept(message))});
 client=createTokenJournalClient(Object.assign({send:message=>native.accept(message),sessionId:options.sessionId || 'fixture',retryMs:60000,deliveryTimeoutMs:30,
 request:async(url,args)=>{const body=JSON.parse(args.body);sent.push(body);if(!online)throw Error('offline');return options.respond?options.respond(body):{ok:true,status:200,json:async()=>({success:true,id:body.id,status:body.status})};}},options.client));
 return{client,data,sent,online:value=>{online=value;},pending:()=>Array.from(data.values()).filter(x=>x?.operation)};
}
test('one check spans native and contract branches and records only fixed metadata',async t=>{
 let time=0;const f=fixture({client:{now:()=>1760000000000,monotonic:()=>time}});t.after(()=>f.client.close());
 f.client.start('check',true);f.client.observe({auditBusy:true,documentAudit:{status:'loading'}});f.client.start('check');time=100;f.client.observe({auditBusy:false,documentAudit:{status:'loading'}});await pause();assert.ok(!f.sent.some(x=>x.status==='completed'));
 time=250;f.client.observe({auditBusy:false,documentAudit:{status:'available'}});await until(()=>f.sent.some(x=>x.status==='completed')&&f.pending().length===0);
 const done=f.sent.find(x=>x.status==='completed');assert.equal(done.durationMs,250);assert.equal(done.operation,'check');assert.equal(done.usageMode,'none');assert.deepEqual(Object.keys(done).sort(),['durationMs','id','operation','startedAt','status','usageMode']);assert.equal(new Set(f.sent.map(x=>x.id)).size,1);
});
test('offline metadata survives UI restart, then drains without replaying the user operation',async t=>{
 const a=fixture();a.online(false);const work=a.client.begin('reglyph-replace');work.finish('completed');await until(()=>a.pending().some(x=>x.status==='completed')&&a.client.getState().error);a.client.close();
 const b=fixture({data:a.data,sessionId:'reloaded'});t.after(()=>b.client.close());await b.client.flush();await until(()=>b.pending().length===0);assert.ok(b.sent.some(x=>x.operation==='reglyph-replace'&&x.status==='completed'));assert.equal(b.client.getState().error,false);
});
test('unknown hybrid usage is separate, local failures/cancellations remain explicit',async t=>{
 const f=fixture();t.after(()=>f.client.close());const model=f.client.begin('layer-names-run');model.agent();model.finish('failed');const local=f.client.begin('reglyph-scan');local.finish('cancelled');
 await until(()=>f.sent.some(x=>x.status==='failed')&&f.sent.some(x=>x.status==='cancelled')&&f.pending().length===0);
 assert.equal(f.sent.find(x=>x.status==='failed').usageMode,'separate');assert.equal(f.sent.find(x=>x.status==='cancelled').usageMode,'none');
});
test('permanently rejected first item does not block later independent records and is exportable',async t=>{
 const f=fixture({respond:body=>({ok:body.operation!=='reglyph-scan',status:body.operation==='reglyph-scan'?400:200,json:async()=>body.operation==='reglyph-scan'?{success:false}:{success:true,id:body.id,status:body.status}})});t.after(()=>f.client.close());
 f.client.begin('reglyph-scan').finish('failed');f.client.begin('recheck').finish('completed');await until(()=>f.sent.some(x=>x.operation==='recheck')&&f.pending().some(x=>x.operation==='reglyph-scan')&&f.client.getState().error);
 await until(()=>!f.pending().some(x=>x.operation==='recheck'));assert.ok(f.client.diagnostics().rejected.length);assert.ok(f.client.getState().message.includes('обнови'));
});
test('empty or mismatched receipt and response-body timeout never acknowledge a durable record',async t=>{
 for(const mode of ['empty','mismatch','body-timeout']){
  const f=fixture({respond:body=>({ok:true,status:200,json:()=>mode==='body-timeout'?new Promise(()=>{}):Promise.resolve(mode==='empty'?{}:{success:true,id:'another',status:body.status})})});t.after(()=>f.client.close());f.client.begin('check').finish('completed');
  await until(()=>f.client.getState().error);assert.ok(f.pending().length,mode);assert.ok(f.pending().every(x=>x.operation==='check'));
 }
});
test('quota and unreadable metadata stay visible without throwing into a skill',async t=>{
 const f=fixture({quota:true});t.after(()=>f.client.close());assert.doesNotThrow(()=>f.client.begin('reglyph-scan').finish('failed'));await until(()=>f.client.getState().error);assert.equal(f.client.diagnostics().unsaved.length,1);
 const data=new Map([[PREFIX+'corrupt',{private:'DO_NOT_EXPORT'}]]),g=fixture({data});t.after(()=>g.client.close());await g.client.flush();assert.equal(g.client.getState().error,true);assert.ok(!JSON.stringify(g.client.diagnostics()).includes('DO_NOT_EXPORT'));assert.deepEqual(g.client.diagnostics().invalidIds,['corrupt']);
});
test('two UI producers sharing storage keep distinct operation identities',async t=>{
 const data=new Map(),a=fixture({data,sessionId:'producerA'}),b=fixture({data,sessionId:'producerB'});a.online(false);b.online(false);t.after(()=>{a.client.close();b.client.close();});a.client.begin('check').finish('completed');b.client.begin('reglyph-scan').finish('completed');await until(()=>Array.from(data.values()).filter(x=>x?.status==='completed').length===2);assert.equal(new Set(Array.from(data.values()).map(x=>x.id)).size,2);
});

test('automatic partial recheck has its own trace, including failure before native capture starts',async t=>{
 const f=fixture();t.after(()=>f.client.close());f.client.observe({auditBusy:false,documentAction:{status:'refreshing'}});f.client.observe({auditBusy:false,documentAction:{status:'refreshing'}});f.client.observe({auditBusy:false,documentAction:{status:'error'}});
 await until(()=>f.sent.some(x=>x.operation==='recheck'&&x.status==='failed')&&f.pending().length===0);assert.equal(new Set(f.sent.map(x=>x.id)).size,1);assert.ok(f.sent.every(x=>x.operation==='recheck'));
});

test('a rejected batch of 32 records cannot starve a later valid record',async t=>{
 const f=fixture({respond:body=>({ok:body.operation==='recheck',status:body.operation==='recheck'?200:400,json:async()=>body.operation==='recheck'?{success:true,id:body.id,status:body.status}:{success:false}})});t.after(()=>f.client.close());
 for(let i=0;i<32;i++)f.client.begin('reglyph-scan').finish('failed');f.client.begin('recheck').finish('completed');await until(()=>f.sent.some(x=>x.operation==='recheck')&&!f.pending().some(x=>x.operation==='recheck'));assert.equal(f.pending().length,32);assert.equal(f.client.diagnostics().rejected.length,32);
});

test('temporary unsaved memory is bounded and overflow is explicit rather than silent',async t=>{
 const f=fixture({quota:true,client:{memoryLimit:2}});t.after(()=>f.client.close());for(let i=0;i<4;i++)f.client.begin('reglyph-scan').finish('failed');await until(()=>f.client.diagnostics().overflow);assert.ok(f.client.diagnostics().unsaved.length<=2);assert.ok(f.client.diagnostics().lastUnsaved);await until(()=>f.client.getState().message.includes('Часть записей'));
});
