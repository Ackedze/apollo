function createAuditFocusClient({send,onStatus,isBusy=()=>false,timeoutMs=20000}){
 let data=null,request=null,timer=null,seq=0;
 function targets(id){return data?.findings.find(f=>f.findingId===id)?.targets||[];}
 function set(audit,sidecar){
  invalidate();data=null;
  if(sidecar?.schemaVersion!=='apollo.audit-focus-targets.v1'||sidecar.runId!==audit.auditId||!Array.isArray(sidecar.findings)||JSON.stringify(sidecar).length>4*1024*1024)return;
  const ids=new Set(audit.result.engine.evaluations.map(e=>e.evaluationId));
  if(sidecar.findings.some(f=>!f||!ids.has(f.findingId)||!Array.isArray(f.targets)||f.targets.length>1000||f.targets.some(t=>!t||typeof t.id!=='string'||!t.id||t.id.length>150||typeof t.nodeId!=='string'||!t.nodeId||typeof t.pageId!=='string'||!t.pageId||!['evaluation-focus','collection-violation'].includes(t.reason))))return;
  data=sidecar;
 }
 function invalidate(){if(request)send({type:'audit-focus-cancel',requestId:request.id});request=null;clearTimeout(timer);}
 function focus(evaluationId,targetId){
  if(request||isBusy()||!targets(evaluationId).some(t=>t.id===targetId))return false;
  request={id:'audit-focus:'+ ++seq,auditId:data.runId,targetId};const r=request;
  onStatus('Ищем подтверждённый объект в макете…');send({type:'audit-focus',requestId:r.id,auditId:r.auditId,evaluationId,targetId});
  timer=setTimeout(()=>{if(request===r){onStatus('Останавливаем переход: ожидаем подтверждение от Figma…');send({type:'audit-focus-cancel',requestId:r.id});}},timeoutMs);return true;
 }
 function accept(m){
  if(!['audit-focus-result','audit-focus-cancelled'].includes(m?.type))return false;
  if(!request||m.requestId!==request.id)return true;
  if(m.type==='audit-focus-result'&&(m.auditId!==request.auditId||m.targetId!==request.targetId||typeof m.success!=='boolean'))return true;
  clearTimeout(timer);request=null;onStatus(m.type==='audit-focus-cancelled'?'Переход остановлен.':m.message||'Переход подтверждён.',m.success===false);return true;
 }
 return{set,targets,gaps:id=>data?.findings.find(f=>f.findingId===id)?.gaps||[],focus,accept,invalidate,busy:()=>Boolean(request)};
}
module.exports={createAuditFocusClient};
