'use strict';
const p=require('./protocol'),{createReport}=require('./report'),{createOpaqueId}=require('../design-check/opaque-id');
function createStatisticsClient({send,request=(...args)=>fetch(...args),hash=null,versions={},userName=()=>null,now=Date.now,sessionId=createOpaqueId(),retryMs=30000,timeoutMs=5000,onError=code=>console.warn('[Apollo][audit-statistics]',code)}){
 const pending=new Map(),unsaved=new Map(),runs=new Map(),completed=new Map();let seq=0,flushing=false,again=false,timer=null,closed=false;
 const retry=()=>{if(!closed&&!timer){timer=setTimeout(()=>{timer=null;void flush();},retryMs);timer.unref?.();}};
 function arm(work,requestId){clearTimeout(work.t);work.t=setTimeout(()=>{pending.delete(requestId);work.reject(Error('AUDIT_STATISTICS_NATIVE_TIMEOUT'));},timeoutMs);}
 function rpc(operation,report=null){return new Promise((resolve,reject)=>{const requestId='stats:'+sessionId+':'+(++seq),work={operation,resolve,reject,t:null,reportId:report?.reportId};pending.set(requestId,work);arm(work,requestId);try{send({type:'audit-statistics-request',requestId,operation,report});}catch(e){pending.delete(requestId);clearTimeout(work.t);reject(e);}});}
 function save(report){if(unsaved.size>=256&&!unsaved.has(report.reportId)){onError('AUDIT_STATISTICS_MEMORY_FULL');return;}unsaved.set(report.reportId,report);void flush();}
 async function deliver(report,payloadHash){const abort=new AbortController();let t;
  try{await Promise.race([(async()=>{const response=await request('http://localhost:3001/statistics/results',{method:'POST',headers:{'Content-Type':'application/json'},body:p.canonical(report),signal:abort.signal});const receipt=await response.json();
   if(response.status>=500||response.status===429)throw Error('AUDIT_STATISTICS_PROXY_UNAVAILABLE');
   if(!response.ok||receipt?.accepted!==true||receipt.reportId!==report.reportId||receipt.payloadHash!==payloadHash||!['proxy-durable','repository-saved'].includes(receipt.state))throw Error('AUDIT_STATISTICS_RECEIPT_INVALID');})(),new Promise((_,reject)=>{t=setTimeout(()=>{abort.abort();reject(Error('AUDIT_STATISTICS_HTTP_TIMEOUT'));},timeoutMs);})]);}finally{clearTimeout(t);}}
 async function flush(){if(closed)return;if(flushing){again=true;return;}flushing=true;again=false;let remaining=false;
  const reported=new Set(),warn=message=>{if(!reported.has(message)){reported.add(message);onError(message);}};
  async function drain(){
   const rows=await rpc('pending');if(!rows||!Array.isArray(rows.reports)||!rows.reports.every(p.valid)||!hash&&(!Array.isArray(rows.payloadHashes)||rows.payloadHashes.length!==rows.reports.length||!rows.payloadHashes.every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))))throw Error('AUDIT_STATISTICS_NATIVE_REPLY_INVALID');
   if(rows.unreadable){warn('AUDIT_STATISTICS_UNREADABLE');remaining=true;}
   for(let i=0;i<rows.reports.length&&!closed;i++){const report=rows.reports[i];try{await deliver(report,hash?await hash(report):rows.payloadHashes[i]);await rpc('ack',report);}catch(e){remaining=true;warn(e.message);if(e.message!=='AUDIT_STATISTICS_RECEIPT_INVALID')break;}}
  }
  try{
   // Free acknowledged durable entries before trying to save into a full queue.
   await drain();let saved=false;
   for(const [id,r]of unsaved){if(closed)break;try{await rpc('put',r);unsaved.delete(id);saved=true;}catch(e){warn(e.message);remaining=true;if(e.message==='AUDIT_STATISTICS_QUEUE_FULL'||e.message==='AUDIT_STATISTICS_NATIVE_TIMEOUT')break;}}
   if(saved&&!closed)await drain();
  }catch(e){remaining=true;warn(e.message);}finally{flushing=false;if(remaining)retry();else if(again&&!closed)queueMicrotask(flush);else if(unsaved.size)retry();}
 }
 function finish(runId,origin,result,status='completed'){const key=origin+':'+runId,run=runs.get(key);if(!run)return;runs.delete(key);
  try{const report=createReport({reportId:sessionId+':'+(++seq),runId,origin,result:result||run.checkpoint||null,status,operation:run.operation,sourceReportId:completed.get(origin+':'+run.sourceRunId)||null,startedAt:run.startedAt,durationMs:Math.max(0,now()-run.at),versions,platform:run.platform,userName:run.userName,finishedAt:new Date(now())});save(report);completed.set(key,report.reportId);if(completed.size>256)completed.delete(completed.keys().next().value);}catch(e){onError(e.message);}}
 return{start(runId,origin,platform=null,operation='check',sourceRunId=null){const key=origin+':'+runId;if(runs.has(key))return;const context=platform&&typeof platform==='object'?platform:null;runs.set(key,{at:now(),startedAt:new Date(now()).toISOString(),platform:context?context.platform:platform,context,operation,sourceRunId,userName:userName()});},finish,discard(runId,origin){runs.delete(origin+':'+runId);},
  checkpoint(runId,result){const run=runs.get('native-document:'+runId);if(run&&result.runId===runId&&(!run.context||['pageId','selectionSignature','platform'].every(k=>run.context[k]===result.context[k])))run.checkpoint=result;},
  record(options){try{save(createReport(Object.assign({reportId:sessionId+':'+(++seq),versions,userName:userName(),finishedAt:new Date(now())},options)));}catch(e){onError(e.message);}},flush,
  accept(m){if(m?.type==='audit-statistics-progress'){const work=pending.get(m.requestId);if(work&&p.exact(m,['type','requestId','operation'])&&m.operation===work.operation)arm(work,m.requestId);return true;}if(m?.type!=='audit-statistics-result')return false;const work=pending.get(m.requestId);if(!work)return true;pending.delete(m.requestId);clearTimeout(work.t);if(!p.exact(m,['type','requestId','operation',m.error?'error':'result'])||m.operation!==work.operation||m.error||work.operation!=='pending'&&m.result?.reportId!==work.reportId)work.reject(Error(m.error||'AUDIT_STATISTICS_NATIVE_REPLY_INVALID'));else work.resolve(m.result);return true;},
  close(){closed=true;clearTimeout(timer);for(const work of pending.values()){clearTimeout(work.t);work.reject(Error('AUDIT_STATISTICS_CLOSED'));}pending.clear();},diagnostics:()=>({unsaved:unsaved.size,runs:runs.size})};
}
module.exports={createStatisticsClient};
