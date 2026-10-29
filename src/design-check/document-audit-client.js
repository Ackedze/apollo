const {ACTION_SCHEMA}=require("../document-audit/actions");
const {SCHEMA,resultValid}=require("../document-audit/protocol");
const {REFRESH_CLIENT_TIMEOUT_MS}=require("../document-audit/budgets");
function createDocumentAuditClient({send,controller,timeoutMs=20000,refreshTimeoutMs=REFRESH_CLIENT_TIMEOUT_MS,isBusy=()=>false,onRecheckStart=()=>{},onRecheckResult=()=>{},onRecheckError=()=>{}}){
 let current=null,context=null,timer=null,focusRequest=null,focusTimer=null,expectedFocus=null,seq=0,actionData=null,actionRequest=null,actionTimer=null,refresh=null,refreshTimer=null,staleFindings=new Set();
 const snapshot=()=>controller.getState().documentAudit.result||null;
 function publish(status,result=snapshot(),error=''){controller.setDocumentAudit({status,requestId:current?.requestId||null,result,error});}
 function selection(data){
  const next=typeof data.pageId==='string'?{pageId:data.pageId,selectionSignature:typeof data.id==='string'?data.id:'',platform:controller.getState().settings.pickerLabel}:null;
  // Cursor/selection is only an input to the NEXT run. The observed roots and
  // focus registry of the current run remain independent of that cursor.
  if(context&&next&&context.pageId!==next.pageId&&(current||snapshot()))invalidate('Страница изменилась. Показан предыдущий результат; повторите проверку.');
  context=next;
 }
 function invalidate(message='Настройки или исходные данные изменились. Показан предыдущий результат; повторите проверку.'){
  if(refresh){send({type:'document-recheck-cancel',schemaVersion:SCHEMA,requestId:refresh.requestId});refresh=null;clearTimeout(refreshTimer);controller.setDocumentAction?.({busy:false,status:'error',message});}
  if(actionRequest){actionRequest.cancelling=true;send({type:'document-action-cancel',schemaVersion:ACTION_SCHEMA,requestId:actionRequest.requestId});}
  actionData=null;controller.setDocumentActions?.(null);
  const result=snapshot(),hadRun=Boolean(current||result);
  if(current)send({type:'document-audit-cancel',schemaVersion:SCHEMA,requestId:current.requestId});
  current=null;focusRequest=null;expectedFocus=null;clearTimeout(timer);clearTimeout(focusTimer);
  publish(result?'stale':'idle',result,hadRun?message:'');
 }
 function fail(message){current=null;focusRequest=null;expectedFocus=null;clearTimeout(timer);clearTimeout(focusTimer);publish(snapshot()?'stale':'error',snapshot(),message);}
 function start(requestId,settings){
  invalidate('');staleFindings.clear();controller.setDocumentAction?.({busy:false,status:'idle',message:''});if(!context)return false;
  const expected=Object.assign({},context,{platform:settings.pickerLabel});current={requestId:requestId+':native',context:expected,phase:'loading'};publish('loading');
  send({type:'document-audit-request',schemaVersion:SCHEMA,requestId:current.requestId,context:expected});
  const id=current.requestId;timer=setTimeout(()=>{if(current?.requestId===id){current.phase='cancelling';publish('cancelling',snapshot(),'Останавливаем проверку документа: ожидаем подтверждение от Figma…');send({type:'document-audit-cancel',schemaVersion:SCHEMA,requestId:id});}},timeoutMs);return true;
 }
 function focus(finding,target){
  const result=snapshot();
  if(actionRequest||refresh||staleFindings.has(finding)||!current||!result||controller.getState().documentAudit.status!=='available')return false;
  const f=result.checks.flatMap(c=>c.findings).find(x=>x.findingId===finding),t=f?.targets.find(x=>x.id===target);if(!t)return false;
  clearTimeout(focusTimer);focusRequest='native-focus:'+ ++seq;expectedFocus={runId:result.runId,pageId:t.pageId,nodeId:t.nodeId};
  send({type:'document-audit-focus',schemaVersion:SCHEMA,requestId:focusRequest,runId:result.runId,findingId:finding,targetId:target});
  focusTimer=setTimeout(()=>{if(focusRequest)invalidate('Переход не подтверждён. Показан предыдущий результат; повторите проверку.');},timeoutMs);return true;
 }

 function action(findingId,targetId,actionId){
  const state=controller.getState(),result=snapshot();
  if(actionRequest||refresh||staleFindings.has(findingId)||focusRequest||isBusy()||state.auditBusy||state.documentAudit.status!=='available'||!current||!result||actionData?.runId!==result.runId)return false;
  const entry=actionData.items.find(f=>f.findingId===findingId)?.actions.find(a=>a.actionId===actionId&&a.targetId===targetId);if(!entry)return false;
  const requestId='document-action:'+ ++seq;actionRequest={requestId,runId:result.runId};
  controller.setDocumentAction?.({busy:true,status:'pending',requestId,runId:result.runId,message:'Выполняем действие в макете…'});
  send({type:'document-action-request',schemaVersion:ACTION_SCHEMA,requestId,runId:result.runId,findingId,targetId,actionId,context:result.context});
  const active=actionRequest;actionTimer=setTimeout(()=>{if(actionRequest===active){active.cancelling=true;controller.setDocumentAction?.({busy:true,status:'cancelling',requestId,runId:active.runId,message:'Останавливаем действие: ожидаем подтверждение от Figma…'});send({type:'document-action-cancel',schemaVersion:ACTION_SCHEMA,requestId});}},timeoutMs);return true;
 }
 function acceptActions(sidecar,result){
  actionData=null;controller.setDocumentActions?.(null);
  if(sidecar?.schemaVersion!==ACTION_SCHEMA||sidecar.runId!==result.runId||!Array.isArray(sidecar.items)||sidecar.items.length>2000||JSON.stringify(sidecar).length>4*1024*1024||['pageId','selectionSignature','platform'].some(k=>sidecar.context?.[k]!==result.context[k]))return;
  if(sidecar.bindingStatus&&(Object.keys(sidecar.bindingStatus).sort().join(',')!=='message,state'||!['ready','unavailable'].includes(sidecar.bindingStatus.state)||typeof sidecar.bindingStatus.message!=='string'||sidecar.bindingStatus.message.length>1000))return;
  if(sidecar.items.some(item=>!item||!result.checks.some(c=>c.findings.some(f=>f.findingId===item.findingId))||!Array.isArray(item.actions)||item.actions.length>1000||item.actions.some(a=>!a||typeof a.actionId!=='string'||!a.actionId||a.actionId.length>150||typeof a.label!=='string'||a.label.length>50||typeof a.description!=='string'||a.description.length>1000||!['update','theme','bind-variable','bind-style'].includes(a.kind)||!result.checks.some(c=>c.findings.some(f=>f.findingId===item.findingId&&f.targets.some(t=>t.id===a.targetId))))))return;
  if(sidecar.items.some(item=>item?.actions?.some(a=>a?.binding&&(Object.keys(a.binding).sort().join(',')!=='key,library,modes'||!['bind-variable','bind-style'].includes(a.kind)||!/^[a-f0-9]{40}$/i.test(a.binding.key)||a.binding.library!==null&&(typeof a.binding.library!=='string'||a.binding.library.length>500)||!Array.isArray(a.binding.modes)||a.binding.modes.length>128||a.binding.modes.some(m=>typeof m!=='string'||!m||m.length>200)))))return;
  actionData=sidecar;controller.setDocumentActions?.(sidecar);
 }
 function accept(m){
  if(m?.type==='document-binding-actions'){
   if(m.schemaVersion===ACTION_SCHEMA&&current?.phase==='available'&&current.requestId===m.runId&&!actionRequest&&!refresh&&controller.getState().documentAudit.status==='available')acceptActions(m.actionData,snapshot());
   return true;
  }
  if(typeof m?.type==='string'&&m.type.startsWith('document-recheck-')){
   if(m.schemaVersion!==SCHEMA||!refresh||m.requestId!==refresh.requestId||m.runId!==refresh.runId||current?.requestId!==refresh.runId)return true;
   if(m.type==='document-recheck-start'){
    if(!Array.isArray(m.affectedNodeIds)||m.affectedNodeIds.some(id=>typeof id!=='string'))return true;
    onRecheckStart(m);return true;
   }
   if(m.type==='document-recheck-progress'){
    if(typeof m.message!=='string'||!m.message||m.message.length>500)return true;
    controller.setDocumentAction?.({busy:true,status:'refreshing',message:m.message});return true;
   }
   if(m.type==='document-recheck-error'){
    const message=m.message||'Перепроверка затронутой области не завершена.';clearTimeout(refreshTimer);refresh=null;controller.setDocumentAction?.({busy:false,status:'error',message});onRecheckError(m);invalidate(message);return true;
   }
   if(m.type!=='document-recheck-result'||!resultValid(m.result)||m.result.runId!==refresh.requestId||m.result.checks.some(c=>c.status==='running')||['pageId','selectionSignature','platform'].some(k=>m.result.context[k]!==current.context[k])||!Array.isArray(m.staleFindingIds)||m.staleFindingIds.some(id=>!m.result.checks.some(c=>c.findings.some(f=>f.findingId===id))))return true;
   const actionOutcome=refresh;clearTimeout(refreshTimer);refresh=null;staleFindings=new Set(m.staleFindingIds);current={requestId:m.result.runId,context:m.result.context,phase:'available'};
   publish('available',m.result,m.impactUnknown?'Влияние Theme на часть области не удалось доказать. Перепроверены исходно наблюдавшиеся объекты.':staleFindings.size?'Часть прежних нарушений сохранена: перепроверка их данных не завершена.':'' );
   controller.setDocumentAudit(Object.assign({},controller.getState().documentAudit,{staleFindingIds:m.staleFindingIds}));
   acceptActions(m.actionData,m.result);onRecheckResult(m);controller.setDocumentAction?.({busy:false,status:actionOutcome.actionStatus==='error'?'error':'success',message:actionOutcome.actionMessage+' '+(staleFindings.size||m.contract?.staleScopeIds?.length?'Перепроверка завершена частично. Неподтверждённые нарушения сохранены; повторите проверку.':'Затронутая область перепроверена по всем подключённым категориям. Остальные результаты сохранены.')});return true;
  }

  if(m?.type==='document-action-result'){
   if(m.schemaVersion!==ACTION_SCHEMA||!actionRequest||m.requestId!==actionRequest.requestId||m.runId!==actionRequest.runId||!['success','error','cancelled'].includes(m.status)||typeof m.applied!=='boolean'||typeof m.verified!=='boolean'||typeof m.message!=='string'||(m.status==='success'&&(!m.applied||!m.verified)))return true;
   clearTimeout(actionTimer);actionRequest=null;controller.setDocumentAction?.({busy:false,status:m.status,requestId:m.requestId,runId:m.runId,message:m.message});
   if(m.applied&&typeof m.refreshId==='string'&&m.refreshId.startsWith('recheck:')&&m.refreshId.length<=150){
    refresh={requestId:m.refreshId,runId:m.runId,actionStatus:m.status,actionMessage:m.message};current.phase='refreshing';controller.setDocumentAction?.({busy:true,status:'refreshing',message:'Перепроверяем затронутую область по всем категориям…'});
    refreshTimer=setTimeout(()=>{if(refresh){send({type:'document-recheck-cancel',schemaVersion:SCHEMA,requestId:refresh.requestId});}},refreshTimeoutMs);return true;
   }
   if(m.applied)invalidate('Состояние макета изменено. Показан предыдущий результат; повторите проверку.');return true;
  }
  if(typeof m?.type!=='string'||!m.type.startsWith('document-audit-'))return false;
  if(m.schemaVersion!==SCHEMA)return true;
  if(m.type==='document-audit-invalidated'){
   if(current?.requestId===m.runId)invalidate('Результат проверки документа устарел. Показан предыдущий результат; повторите проверку.');return true;
  }
  if(m.type==='document-audit-focus-result'){
   if(m.requestId===focusRequest&&m.runId===current?.requestId){clearTimeout(focusTimer);focusRequest=null;if(m.success!==true)invalidate(m.message||'Переход не подтверждён. Повторите проверку.');}return true;
  }
  if(!current||m.requestId!==current.requestId)return true;
  if(m.type==='document-audit-cancelled'&&current.phase==='cancelling'){fail(snapshot()?'Чтение макета не завершилось вовремя. Доступные результаты сохранены; повторите проверку.':'Не удалось завершить чтение макета вовремя. Повторите проверку.');return true;}
  if(current.phase!=='loading')return true;
  if(m.type==='document-audit-progress'){if(resultValid(m.result)&&m.result.runId===current.requestId&&['pageId','selectionSignature','platform'].every(k=>m.result.context[k]===current.context[k]))publish('loading',snapshot()&&snapshot().runId!==current.requestId?snapshot():m.result);return true;}
  clearTimeout(timer);
  if(m.type==='document-audit-error'){fail(m.message||'Не удалось прочитать данные макета.');return true;}
  if(m.type!=='document-audit-result'||!resultValid(m.result)||m.result.runId!==current.requestId||m.result.checks.some(c=>c.status==='running')||['pageId','selectionSignature','platform'].some(key=>m.result.context[key]!==current.context[key])){
   fail('Результат проверки документа несовместим с текущим запуском. Повторите проверку.');return true;
  }
  current.phase='available';publish('available',m.result);acceptActions(m.actionData,m.result);return true;
 }
 return{selection,start,invalidate,accept,focus,action,hasPage:()=>Boolean(context)};
}
module.exports={createDocumentAuditClient};
