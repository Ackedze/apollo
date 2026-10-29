'use strict';
const p=require('./protocol');
const histogram=values=>{const counts={};for(const value of values)if(p.id(value))counts[value]=(counts[value]||0)+1;return counts;};
function metrics(origin,result){
 if(origin==='contract-area'&&result.statisticsMetrics)return result.statisticsMetrics;
 const components={scanned:null,checked:null,governed:null,notChecked:null,byKey:{}};let classifications={},rules=[],complete=null,unknown=null,byStatus={};
 if(origin==='contract-area'){
  const evaluations=result.result.engine.evaluations,projected=result.projection?.counts;
  classifications=projected||histogram(evaluations.map(e=>e.classification));complete=result.result.coverage?.executionComplete??null;
  const statuses=[];const visit=v=>{if(Array.isArray(v)){v.forEach(visit);return;}if(!v||typeof v!=='object')return;const truth=v.truth||v.status;if(p.id(truth))statuses.push(truth);for(const [k,x]of Object.entries(v))if(k!=='actual'&&k!=='expected')visit(x);};for(const e of evaluations)visit(e.trace);byStatus=histogram(statuses);unknown=statuses.length?(byStatus.UNKNOWN||0)+(byStatus.unknown||0):null;
  const grouped=new Map();for(const e of evaluations){const key=e.ruleId+':'+e.classification;if(!grouped.has(key))grouped.set(key,{ruleId:e.ruleId,classification:e.classification,count:0});grouped.get(key).count++;}rules=Array.from(grouped.values());
  components.scanned=result.selection?.components?.length??null;components.checked=result.components?.length??null;components.governed=result.governedComponents?.length??null;components.notChecked=result.notChecked?.length??null;
  components.byKey=histogram((result.selection?.components||[]).map(c=>c.componentKey||c.componentSetKey));
 }else if(origin==='native-document'){
  const checks=result.checks;classifications=histogram(checks.flatMap(c=>c.findings.map(f=>f.status)));byStatus=histogram(checks.map(c=>c.status));
  complete=checks.every(c=>['complete','not-applicable'].includes(c.status));unknown=classifications.unknown||0;
  components.byKey=histogram(checks.flatMap(c=>c.findings.map(f=>f.componentKey)));
  rules=checks.map(c=>({ruleId:c.id,classification:c.status,count:c.checked}));
 }else{
  const assessments=result.assessments||[];classifications=histogram(assessments.map(a=>a.outcome));
  rules=assessments.flatMap(a=>(a.ruleResults||[]).map(r=>({ruleId:r.ruleId,classification:r.outcome,count:1})));
  byStatus=histogram(rules.map(r=>r.classification));unknown=byStatus['insufficient-data']||0;complete=unknown===0;
 }
 return{classifications,coverage:{complete,unknown,byStatus},components,rules};
}
function createReport({reportId,runId,sourceReportId=null,origin,operation='check',status='completed',startedAt,durationMs,versions={},platform=null,result=null,excludeFromAnalytics=false}){
 const observed=result?metrics(origin,result):null;
 const report={schemaVersion:2,reportKind:'apollo-audit-metrics',reportId,runId,sourceReportId,origin,operation,status:status==='completed'&&observed?.coverage.complete===false?'partial':status,startedAt,durationMs,
  versions:{plugin:versions.plugin||null,build:versions.build||null,runtime:versions.runtime||null,data:origin==='contract-area'?result?.release?.id||null:versions.data||null,knowledge:result?.knowledge?.contentVersion||versions.knowledge||null},
  scope:{platform,rootCount:result?.selection?.roots?.length??(result?.context?.selectionSignature?result.context.selectionSignature.split('|').length:null),scannedNodes:result?.selection?.scannedNodes??null},metrics:observed,excludeFromAnalytics};
 if(!p.valid(report))throw Error('AUDIT_STATISTICS_REPORT_INVALID');return report;
}
module.exports={createReport,metrics};
