'use strict';
const p=require('./protocol'),PREFIX='apollo.audit-metrics.v2:';
function createStatisticsBridge({storage,post,maxBytes=1048576,maxRecords=256,onError=code=>console.warn('[Apollo][audit-statistics]',code)}){
 let serial=Promise.resolve();
 async function entries(){const keys=(await storage.keysAsync()).filter(k=>k.startsWith(PREFIX));const reports=[];let bytes=0,unreadable=0;
  for(const key of keys){try{const r=await storage.getAsync(key);if(!p.valid(r)||key!==PREFIX+r.reportId)throw Error();reports.push(r);bytes+=new TextEncoder().encode(p.canonical(r)).length;}catch(_){unreadable++;}}
  return{reports,bytes,unreadable,count:keys.length};}
 async function execute(operation,report){
  if(operation==='pending'){const rows=await entries();return{reports:rows.reports,unreadable:rows.unreadable};}
  if(!p.valid(report))throw Error('AUDIT_STATISTICS_REPORT_INVALID');
  const key=PREFIX+report.reportId,existing=await storage.getAsync(key);
  if(operation==='put'){
   if(existing){if(!p.valid(existing)||p.canonical(existing)!==p.canonical(report))throw Error('AUDIT_STATISTICS_ID_CONFLICT');}
   else{const rows=await entries();if(rows.count>=maxRecords||rows.bytes+new TextEncoder().encode(p.canonical(report)).length>maxBytes)throw Error('AUDIT_STATISTICS_QUEUE_FULL');await storage.setAsync(key,report);}
  }else if(operation==='ack'){if(existing&&p.canonical(existing)===p.canonical(report))await storage.deleteAsync(key);}
  else throw Error('AUDIT_STATISTICS_OPERATION_INVALID');
  return{reportId:report.reportId};
 }
 return{accept(m){if(m?.type!=='audit-statistics-request')return false;
  const reply=(result,error)=>post(Object.assign({type:'audit-statistics-result',requestId:m.requestId,operation:m.operation},error?{error}:{result}));
  if(!p.exact(m,['type','requestId','operation','report'])||!p.id(m.requestId)||!['put','pending','ack'].includes(m.operation)){reply(null,'AUDIT_STATISTICS_REQUEST_INVALID');return true;}
  serial=serial.then(()=>execute(m.operation,m.report)).then(result=>reply(result),error=>{onError(error.message);reply(null,error.message);});return true;
 }};
}
module.exports={createStatisticsBridge,PREFIX};
