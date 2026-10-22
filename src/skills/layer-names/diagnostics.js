const phases=['preparing','waiting-agent','connecting','retrying','receiving','reading-context','validating','completed','failed','cancelled'];
const kinds=['created','request-prepared','thread-started','turn-started','retry','transport-fallback','agent-output','context-requested','context-received','plan-received','completed','failed','cancelled'];
const exact=(v,keys)=>v!==null && typeof v==='object' && !Array.isArray(v) && Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
const milliseconds=v=>Number.isSafeInteger(v) && v>=0 && v<=930000;
const code=v=>v===null || typeof v==='string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(v);
function readDiagnostics(value,run){
  if(!exact(value,['schemaVersion','runId','requestId','provider','requestedModel','cliRunId','phase','elapsedMs','idleMs','remainingMs','errorCode','events'])
    || value.schemaVersion!=='apollo.layer-names-diagnostics.v1' || value.runId!==run.runId || value.requestId!==run.requestId
    || ![null,'codex','claude','alfagen'].includes(value.provider) || !phases.includes(value.phase)
    || (['completed','failed','cancelled'].includes(run.status)?value.phase!==run.status:run.status==='awaiting-context'?value.phase!=='reading-context':['completed','failed','cancelled'].includes(value.phase))
    || value.requestedModel!==null && (value.provider===null || typeof value.requestedModel!=='string' || !/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,119}$/.test(value.requestedModel) || /^(sk-|ghp_|bearer)/i.test(value.requestedModel))
    || value.cliRunId!==null && (typeof value.cliRunId!=='string' || !/^apollo-contract-v4-[A-Za-z0-9_-]{1,32}$/.test(value.cliRunId))
    || !milliseconds(value.elapsedMs) || !milliseconds(value.idleMs) || value.idleMs>value.elapsedMs
    || !milliseconds(value.remainingMs) || value.remainingMs>900000 || !code(value.errorCode)
    || !Array.isArray(value.events) || value.events.length>24)return null;
  let previous=0;
  for(const event of value.events){
    if(!exact(event,['kind','atMs','code','retry']) || !kinds.includes(event.kind) || !milliseconds(event.atMs) || event.atMs<previous || event.atMs>value.elapsedMs
      || !code(event.code) || event.retry!==null && (!Number.isSafeInteger(event.retry) || event.retry<1 || event.retry>100))return null;
    previous=event.atMs;
  }
  return JSON.parse(JSON.stringify(value));
}
module.exports={readDiagnostics};
