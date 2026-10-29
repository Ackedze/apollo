const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const p=require('../src/audit-statistics/protocol'),{createReport,metrics}=require('../src/audit-statistics/report'),{createStatisticsBridge,PREFIX}=require('../src/audit-statistics/native'),{createStatisticsClient}=require('../src/audit-statistics/client');
const digest=r=>crypto.createHash('sha256').update(p.canonical(r)).digest('hex');
const source=()=>({release:{id:'data123'},selection:{roots:[{nodeId:'1:2'}],scannedNodes:4,components:[{componentKey:'keyA'},{componentKey:'keyA'}]},components:[{}],governedComponents:[{}],notChecked:[],result:{coverage:{executionComplete:false},engine:{evaluations:[{ruleId:'r1',classification:'compliant',trace:{truth:'unknown',actual:'PRIVATE TEXT'}},{ruleId:'r2',classification:'violation',trace:{truth:'false'}},{ruleId:'r3',classification:'human-review',trace:{truth:'unknown'}}]}}});
const sample=(reportId='test-1')=>createReport({reportId,runId:'run1',origin:'contract-area',startedAt:'2026-10-29T00:00:00.000Z',durationMs:25,result:source()});
const wait=async check=>{for(let i=0;i<500;i++){if(check())return;await new Promise(r=>setTimeout(r,2));}throw Error('bounded test wait');};
function harness({map=new Map(),request,storageWrite=async(k,v)=>map.set(k,v),sessionId='session1',...options}={}){
 let client;const errors=[];const storage={keysAsync:async()=>Array.from(map.keys()),getAsync:async k=>map.get(k),setAsync:storageWrite,deleteAsync:async k=>map.delete(k)};
 const bridge=createStatisticsBridge({storage,post:m=>client.accept(m),onError:c=>errors.push(c)});
 client=createStatisticsClient({send:m=>bridge.accept(m),request:request||(async(_url,o)=>{const r=JSON.parse(o.body);return{ok:true,json:async()=>({accepted:true,reportId:r.reportId,payloadHash:digest(r),state:'proxy-durable'})};}),hash:digest,sessionId,retryMs:10,timeoutMs:30,onError:c=>errors.push(c),...options});
 return{client,map,errors,put:r=>client.record(Object.assign({},r,{result:source()}))};
}
test('compact metrics retain actual classifications and UNKNOWN without layout text or legacy zeros',()=>{
 const r=sample();assert.equal(r.status,'partial');assert.deepEqual(r.metrics.classifications,{compliant:1,violation:1,'human-review':1});assert.equal(r.metrics.coverage.unknown,2);assert.equal(r.metrics.components.governed,1);assert.deepEqual(r.metrics.components.byKey,{keyA:2});assert.equal(p.canonical(r).includes('PRIVATE TEXT'),false);assert.equal(p.valid(Object.assign({},r,{snapshot:{}})),false);
 const projected=Object.assign({},source(),{statisticsMetrics:r.metrics,result:{}});assert.deepEqual(metrics('contract-area',projected),r.metrics);
});
test('statistics projection failure cannot turn an audit result into an audit error',()=>{
 const module=require('../src/audit-statistics/report'),original=module.metrics,warn=console.warn;
 try{module.metrics=()=>{throw Error('synthetic statistics failure');};console.warn=()=>{};const data=require('../src/audit-report').auditDelivery({audit:source(),rules:[]});assert.equal(data.statisticsMetrics,null);assert.equal(data.audit.projection.counts.violation,1);}finally{module.metrics=original;console.warn=warn;}
});
test('native and pattern origins preserve uncertainty and never fabricate component inventory',()=>{
 const native=createReport({reportId:'native',runId:'native-run',origin:'native-document',startedAt:'2026-10-29',durationMs:1,result:{checks:[{id:'theme',status:'incomplete',checked:4,findings:[{status:'unknown',componentKey:null}]}]}});assert.equal(native.status,'partial');assert.equal(native.metrics.components.checked,null);assert.equal(native.metrics.coverage.unknown,1);
 const pattern=createReport({reportId:'pattern',runId:'pattern-run',origin:'pattern-agent',operation:'pattern-check',startedAt:'2026-10-29',durationMs:1,result:{knowledge:{contentVersion:'knowledge1'},assessments:[{outcome:'insufficient-data',ruleResults:[{ruleId:'p1',outcome:'insufficient-data'}]}]}});assert.equal(pattern.status,'partial');assert.equal(pattern.metrics.coverage.unknown,1);assert.equal(pattern.versions.knowledge,'knowledge1');
});
test('offline, restart and two producers retain independent durable reports; corrupt row does not block others',async()=>{
 const map=new Map([[PREFIX+'corrupt',{bad:true}]]),offline=async()=>{throw Error('OFFLINE');};const a=harness({map,request:offline,sessionId:'A'}),b=harness({map,request:offline,sessionId:'B'});
 try{a.put(sample('a'));b.put(sample('b'));await wait(()=>map.has(PREFIX+'a')&&map.has(PREFIX+'b'));await wait(()=>a.errors.includes('OFFLINE')&&b.errors.includes('OFFLINE'));}finally{a.client.close();b.client.close();}
 const recovered=harness({map,sessionId:'C'});try{await recovered.client.flush();await wait(()=>map.size===1);assert.ok(map.has(PREFIX+'corrupt'));assert.ok(recovered.errors.includes('AUDIT_STATISTICS_UNREADABLE'));}finally{recovered.client.close();}
});
test('wrong receipt retains the last durable copy until automatic recovery',async()=>{
 let valid=false;const h=harness({request:async(_url,o)=>{const r=JSON.parse(o.body);return{ok:true,json:async()=>({accepted:true,reportId:valid?r.reportId:'wrong',payloadHash:digest(r),state:'proxy-durable'})};}});
 try{h.put(sample('receipt'));await wait(()=>h.errors.includes('AUDIT_STATISTICS_RECEIPT_INVALID'));assert.ok(h.map.has(PREFIX+'receipt'));valid=true;await wait(()=>h.map.size===0);}finally{h.client.close();}
});
test('quota failure is diagnosed; automatic retry does not delete prior records',async()=>{
 const map=new Map([[PREFIX+'existing',sample('existing')]]);let quota=true;const h=harness({map,storageWrite:async(k,v)=>{if(quota)throw Error('QUOTA');map.set(k,v);},request:async()=>{throw Error('OFFLINE');}});
 try{h.put(sample('quota'));await wait(()=>h.errors.includes('QUOTA'));assert.ok(map.has(PREFIX+'existing'));assert.equal(h.client.diagnostics().unsaved,1);quota=false;await wait(()=>map.has(PREFIX+'quota'));assert.ok(map.has(PREFIX+'existing'));}finally{h.client.close();}
});
test('deadline includes stalled HTTP body; no acknowledgement or audit error UI',async()=>{
 const h=harness({request:async()=>({ok:true,json:()=>new Promise(()=>{})}),timeoutMs:8});try{h.put(sample('body'));await wait(()=>h.errors.includes('AUDIT_STATISTICS_HTTP_TIMEOUT'));assert.ok(h.map.has(PREFIX+'body'));}finally{h.client.close();}
});
test('recheck references its actual prior report; repeated finish creates no duplicate',async()=>{
 const h=harness({request:async()=>{throw Error('OFFLINE');}});try{h.client.start('run','contract-area');h.client.finish('run','contract-area',source());h.client.finish('run','contract-area',source());await wait(()=>h.map.size===1);const first=Array.from(h.map.values())[0];h.client.start('recheck','contract-area',null,'recheck','run');h.client.finish('recheck','contract-area',source());await wait(()=>h.map.size===2);const second=Array.from(h.map.values()).find(r=>r.runId==='recheck');assert.equal(second.operation,'recheck');assert.equal(second.sourceReportId,first.reportId);}finally{h.client.close();}
});
test('failed native run retains only its own accepted checkpoint and honest partial coverage',async()=>{
 const h=harness({request:async()=>{throw Error('OFFLINE');}});try{const context={pageId:'page',selectionSignature:'root',platform:'Desktop'};h.client.start('native','native-document',context);h.client.checkpoint('native',{runId:'native',context:{...context,pageId:'wrong'},checks:[]});h.client.checkpoint('native',{runId:'native',context,checks:[{id:'theme',status:'running',checked:2,findings:[{status:'unknown',componentKey:null}]}]});h.client.finish('native','native-document',null,'failed');await wait(()=>h.map.size===1);const r=Array.from(h.map.values())[0];assert.equal(r.status,'failed');assert.equal(r.metrics.coverage.complete,false);assert.equal(r.metrics.coverage.unknown,1);assert.equal(r.metrics.coverage.byStatus.running,1);assert.equal(r.scope.rootCount,1);}finally{h.client.close();}
});
