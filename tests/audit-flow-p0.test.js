const test=require('node:test'),assert=require('node:assert/strict');
const {cooperativeRead}=require('../src/document-audit/reads');
const {recheck}=require('../src/document-audit/engine');
const {failureDiagnostic,failureValid}=require('../src/document-audit/protocol');
const {fixture,hash,bridge,request,settle}=require('./document-audit.test');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('slow native RPC is awaited once; Stop rejects before the unabortable RPC resolves',async()=>{
 let calls=0,stopped=false,resolve;const pending=cooperativeRead(()=>{calls++;return new Promise(r=>resolve=r);},5,()=>{if(stopped)throw Error('STOP');});
 await wait(20);assert.equal(calls,1);stopped=true;await assert.rejects(pending,/STOP/);resolve('late');await wait(10);assert.equal(calls,1);
});
for(const kind of ['collection','main'])test(kind+' read rejection is not a changed fact',async()=>{
 const f=fixture(),n=f.node('x','INSTANCE');const error=Error('ACCESS_TEMPORARILY_UNAVAILABLE');
 if(kind==='collection')f.api.variables.getVariableCollectionByIdAsync=async()=>{throw error;};else n.getMainComponentAsync=async()=>{throw error;};
 await assert.rejects(recheck(f.api,[{kind,id:kind==='collection'?'collection':'x',value:{id:'reference'}}],{hash,assertCurrent:()=>{}}),e=>e===error);
});
test('every failed native operation has a bounded diagnostic without raw exception text',()=>{
 const d=failureDiagnostic(Error('PRIVATE layout contents'),'run:native','collect',hash,1);assert.equal(failureValid(d),true);assert.equal(d.code,'NATIVE_READ_FAILED');assert.equal(d.stage,'collect');assert.equal(JSON.stringify(d).includes('PRIVATE'),false);assert.equal(failureValid(Object.assign({},d,{payload:'leak'})),false);
});
test('native capture outlives its former absolute deadline and validates before delivery',async()=>{
 const f=fixture(),n=f.node('root');f.page.selection=[n];const original=f.api.getNodeByIdAsync;f.api.getNodeByIdAsync=async id=>{await wait(8);return original(id);};const b=bridge(f,{timeoutMs:5});
 try{b.accept(request(f,'slow-healthy'));const result=await settle(f,'document-audit-result','slow-healthy');assert.equal(result.result.runId,'slow-healthy');assert.equal(f.messages.some(m=>m.type==='document-audit-error'),false);}finally{b.stop();}
});
test('operational diagnostic rejects non-string codes',()=>{const d=failureDiagnostic(Error('NATIVE_TIMEOUT'),'run','collect',hash,1);d.code=['NATIVE_TIMEOUT'];assert.equal(failureValid(d),false);});
async function message(f,predicate){for(let i=0;i<500;i++){const m=f.messages.find(predicate);if(m)return m;await wait(1);}throw Error('Expected message');}
test('transient first read retries the same scope and retains code/stage before success',async()=>{const f=fixture(),n=f.node('a');f.page.selection=[n];const read=f.api.getNodeByIdAsync;let fail=true;f.api.getNodeByIdAsync=async id=>{if(id===n.id&&fail){fail=false;throw Error('ACCESS_TEMPORARILY_UNAVAILABLE');}return read(id);};const b=bridge(f);try{b.accept(request(f,'retry'));await message(f,m=>m.type==='document-audit-result');const d=f.messages.find(m=>m.diagnostic).diagnostic;assert.equal(d.code,'ACCESS_TEMPORARILY_UNAVAILABLE');assert.equal(d.stage,'checkpoint-recheck');assert.equal(d.requestId,'retry');assert.equal(f.messages.some(m=>m.type==='document-audit-error'),false);}finally{b.stop();}});
test('observer coalesces more than32 unchanged notifications into one guarded verifier',async()=>{const f=fixture(),n=f.node('a');f.page.selection=[n];const b=bridge(f);try{b.accept(request(f,'observer'));await message(f,m=>m.type==='document-audit-result');const get=f.api.getNodeByIdAsync;let release,calls=0;f.api.getNodeByIdAsync=id=>id==='a'?(calls++,new Promise(r=>release=()=>r(n))):get(id);const pending=[];for(let i=0;i<40;i++)pending.push(f.mutate({nodeChanges:[{id:'a'}]}));await wait(10);assert.equal(calls,1);f.api.getNodeByIdAsync=get;release();await Promise.all(pending);assert.equal(f.messages.some(m=>m.type==='document-audit-invalidated'),false);}finally{b.stop();}});
test('requested roots survive a cursor change before native dispatch',async()=>{const f=fixture(),original=f.node('original'),next=f.node('next');f.page.selection=[original];const m=request(f,'pinned');f.page.selection=[next];const b=bridge(f);try{b.accept(m);const r=await message(f,m=>m.type==='document-audit-result');assert.equal(r.result.context.selectionSignature,'original');assert.equal(r.result.checks.find(c=>c.id==='customStyles').checked,1);}finally{b.stop();}});
test('a rejected null RPC cannot become a successfully read missing value',async()=>{await assert.rejects(cooperativeRead(()=>Promise.reject(null),5),/NATIVE_READ_FAILED/);});
