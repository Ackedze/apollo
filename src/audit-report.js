const {findingPresentation}=require("./finding-presentation");
// A display projection, never an input to evaluation or a replacement for full diagnostics.
const SUMMARY_SCHEMA='apollo.audit-summary.v1';
const visible=e=>!['compliant','not-applicable'].includes(e.classification);
function auditSummary(report){
 if(report.schemaVersion===SUMMARY_SCHEMA)return report;
 const counts={};for(const e of report.result.engine.evaluations)counts[e.classification]=(counts[e.classification]||0)+1;
 const component=c=>({scopeId:c.scopeId,name:c.name,library:c.library,auditId:c.auditId,release:c.release,
  snapshot:{source:{componentKey:c.snapshot?.source?.componentKey}},coverage:c.result?.coverage,warnings:c.warnings});
 return Object.assign({},report,{schemaVersion:SUMMARY_SCHEMA,fullSchemaVersion:report.schemaVersion,
  projection:{evaluations:'findings-and-allowed',totalEvaluations:report.result.engine.evaluations.length,counts},
  snapshot:undefined,components:report.components?.map(component),
  result:Object.assign({},report.result,{engine:Object.assign({},report.result.engine,{evaluations:report.result.engine.evaluations.filter(visible)})})});
}
function auditDelivery(data){
 const audit=Object.assign({},auditSummary(data.audit),{findingPresentation:data.audit.findingPresentation || findingPresentation(data.audit,data.rules)}),ids=new Set(audit.result.engine.evaluations.map(e=>e.evaluationId));
 const keys=new Set(audit.result.engine.evaluations.map(e=>`${e.componentScopeId||''}:${e.ruleId}`));
  let statisticsMetrics=null;try{statisticsMetrics=require('./audit-statistics/report').metrics('contract-area',data.audit);}catch(_){console.warn('[Apollo][audit-statistics] AUDIT_STATISTICS_PROJECTION_FAILED');}
  return Object.assign({},data,{statisticsMetrics,delivery:{postedAt:Date.now()},audit,rules:data.rules.filter(r=>keys.has(`${r.componentScopeId||''}:${r.ruleId}`)),
  focusTargets:data.focusTargets?Object.assign({},data.focusTargets,{findings:data.focusTargets.findings.filter(f=>ids.has(f.findingId))}):undefined});
}
function createAuditReportBridge({read,post}){
 return {accept(m){
  if(m?.type!=='audit-report-request')return false;
  const reply={type:'audit-report-result',requestId:m.requestId,auditId:m.auditId,componentAuditId:m.componentAuditId,operation:m.operation};
  try{
   if(Object.keys(m).sort().join(',')!=='auditId,componentAuditId,operation,requestId,type'||[m.requestId,m.auditId].some(v=>typeof v!=='string'||!v||v.length>150)||!['full','component'].includes(m.operation)||!(m.componentAuditId===null||typeof m.componentAuditId==='string'&&m.componentAuditId.length>0&&m.componentAuditId.length<=150)||m.operation==='full'&&m.componentAuditId!==null)throw Error('AUDIT_REPORT_REQUEST_INVALID');
   const report=read(m.auditId);if(!report||report.auditId!==m.auditId)throw Error('AUDIT_REPORT_STALE');
   const component=m.operation==='component'?(report.components||[report]).find(c=>c.auditId===m.componentAuditId):null;
   if(m.operation==='component'&&!component)throw Error('AUDIT_REPORT_COMPONENT_UNAVAILABLE');
   post(Object.assign(reply,{data:m.operation==='full'?report:{auditId:component.auditId,release:component.release,snapshot:component.snapshot}}));
  }catch(e){post(Object.assign(reply,{error:e.message}));}
  return true;
 }};
}
function createAuditReportClient(send,{timeoutMs=15000}={}){
 let seq=0;const pending=new Map();
 function invalidate(){for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Результат устарел. Повторите проверку.'));}pending.clear();}
 function request(auditId,operation,componentAuditId=null){return new Promise((resolve,reject)=>{
  const requestId='audit-report:'+ ++seq,m={type:'audit-report-request',requestId,auditId,operation,componentAuditId};
  const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('Не удалось получить диагностику: время ожидания истекло.'));},timeoutMs);
  pending.set(requestId,{m,resolve,reject,timer});send(m);
 });}
 function accept(m){if(m?.type!=='audit-report-result')return false;const p=pending.get(m.requestId);if(!p)return true;
  if(['auditId','operation','componentAuditId'].some(k=>m[k]!==p.m[k]))return true;
  if(!m.error&&(!m.data||m.operation==='full'&&m.data.auditId!==m.auditId||m.operation==='component'&&m.data.auditId!==m.componentAuditId))return true;
  clearTimeout(p.timer);pending.delete(m.requestId);if(m.error)p.reject(Error(m.error));else p.resolve(m.data);return true;
 }
 return{request,accept,invalidate};
}
module.exports={SUMMARY_SCHEMA,auditSummary,auditDelivery,createAuditReportBridge,createAuditReportClient};
