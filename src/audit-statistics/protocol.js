'use strict';
const SCHEMA='apollo.audit-metrics.v2',MAX_BYTES=131072;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{1,180}$/.test(v);
const count=v=>Number.isSafeInteger(v)&&v>=0&&v<=100000000;
const nullableCount=v=>v===null||count(v);
const counts=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length<=2000&&Object.entries(v).every(([k,n])=>id(k)&&count(n));
const canonical=v=>JSON.stringify(sort(v));
function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;}
function valid(r){try{return exact(r,['schemaVersion','reportKind','reportId','runId','sourceReportId','origin','operation','status','startedAt','durationMs','versions','scope','metrics','excludeFromAnalytics'])
 &&r.schemaVersion===2&&r.reportKind==='apollo-audit-metrics'&&id(r.reportId)&&id(r.runId)&&(r.sourceReportId===null||id(r.sourceReportId))
 &&['contract-area','native-document','pattern-agent'].includes(r.origin)&&['check','recheck','pattern-check'].includes(r.operation)&&['completed','partial','failed','cancelled'].includes(r.status)
 &&typeof r.startedAt==='string'&&r.startedAt.length<=40&&Number.isFinite(Date.parse(r.startedAt))&&nullableCount(r.durationMs)&&typeof r.excludeFromAnalytics==='boolean'
 &&exact(r.versions,['plugin','build','runtime','data','knowledge'])&&Object.values(r.versions).every(v=>v===null||id(v))
 &&exact(r.scope,['platform','rootCount','scannedNodes'])&&(r.scope.platform===null||['desktop','mobile-web','ios','android','Desktop','MobileWeb','iOS','Android'].includes(r.scope.platform))&&nullableCount(r.scope.rootCount)&&nullableCount(r.scope.scannedNodes)
 &&(r.metrics===null?['failed','cancelled'].includes(r.status):exact(r.metrics,['classifications','coverage','components','rules'])&&counts(r.metrics.classifications)
 &&exact(r.metrics.coverage,['complete','unknown','byStatus'])&&(r.metrics.coverage.complete===null||typeof r.metrics.coverage.complete==='boolean')&&nullableCount(r.metrics.coverage.unknown)&&counts(r.metrics.coverage.byStatus)
 &&exact(r.metrics.components,['scanned','checked','governed','notChecked','byKey'])&&['scanned','checked','governed','notChecked'].every(k=>nullableCount(r.metrics.components[k]))&&counts(r.metrics.components.byKey)
 &&Array.isArray(r.metrics.rules)&&r.metrics.rules.length<=2000&&r.metrics.rules.every(v=>exact(v,['ruleId','classification','count'])&&id(v.ruleId)&&id(v.classification)&&count(v.count)))
 &&new TextEncoder().encode(canonical(r)).length<=MAX_BYTES;}catch(_){return false;}}
module.exports={SCHEMA,MAX_BYTES,exact,id,count,canonical,valid};
