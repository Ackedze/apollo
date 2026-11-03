'use strict';
const p=require('./protocol');
const errors={AUDIT_SELECTION_REQUIRED:'Выделите область в Figma.',AUDIT_SCOPE_BUDGET:'Область слишком большая. Выделите один фрейм или меньше слоёв.',AUDIT_READ_BUDGET:'Ответ Figma превышает бюджет. Выберите меньшую область.',AUDIT_STALE:'Макет или эталон изменился. Запустите проверку заново.',AUDIT_DATA_STALE:'Знания изменились во время проверки. Запустите её заново.',AUDIT_KNOWLEDGE_MISSING:'В пакете нет обязательных файлов DSI Hub.',AUDIT_SKILL_UNAVAILABLE:'В Proxy не установлен навык ab-audit-figma.',AUDIT_DATA_REQUIRED:'Установите совместимый пакет знаний с ab-audit-figma.',AUDIT_BUSY:'Дождитесь завершения другого действия.',AUDIT_PROVIDER_UNSUPPORTED:'Для этого навыка выберите Codex в Proxy.',AUDIT_STEP_LIMIT:'Лимит шагов исчерпан. Сузьте область проверки.',AUDIT_DEADLINE:'Время проверки истекло. Сузьте область и повторите запуск.'};
function createFigmaAuditClient({send,request=fetch,endpoint='http://localhost:3001/skills/figma-audit',beforeOperation=async()=>{},isBusy=()=>false,readPlatform=()=> 'desktop',onChange=()=>{}}){
 let state={status:'idle',available:true,validSelection:false,run:null,report:null,error:'',stale:false},revision=0,sequence=0,abort=null,ticket=null,selectionKey=null;
 const listeners=new Set(),pending=new Map(),identity=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
 function emit(patch){state=Object.assign({},state,patch);for(const l of listeners)l();onChange();}
 const busy=()=>['reading','running','stopping'].includes(state.status);
 function rpc(operation,payload={}){const callId=identity+'-'+(++sequence);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(callId);reject(Error('Figma не ответила вовремя.'));},60000);pending.set(callId,{resolve,reject,timer});send(Object.assign({type:'figma-audit-native',operation,callId},payload));});}
 async function api(route,body,signal){const controller=new AbortController(),cancel=()=>controller.abort(),timer=setTimeout(cancel,30000);signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();try{const response=await request(endpoint+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});const value=await response.json();if(!response.ok||value.success!==true)throw Object.assign(Error(errors[value.code]||'Проверка недоступна: '+(value.code||response.status)),{code:value.code});return value;}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}}
 function pause(signal){return new Promise((resolve,reject)=>{const cancel=()=>{clearTimeout(timer);reject(Error('AUDIT_CANCELLED'));},timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},750);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();});}
 async function stopRemote(t){if(t)await api('/runs/'+t.runId+'/cancel',{requestId:t.requestId}).catch(()=>null);}
 async function start(){
  if(busy()||isBusy())return;try{await beforeOperation();}catch(e){emit({error:e.message});return;}if(busy()||isBusy())return;
  const rev=++revision,controller=new AbortController();abort=controller;emit({status:'reading',run:null,report:null,error:'',stale:false});let mine=null;
  const alive=()=>{if(rev!==revision||controller.signal.aborted)throw Error('AUDIT_CANCELLED');};
  try{
   await api('/status',undefined,controller.signal);alive();const snapshot=await rpc('capture');alive();if(!p.snapshotValid(snapshot))throw Error('Некорректный снимок области.');
   const requestId='audit-'+identity+'-'+rev;let reply=await api('/runs',{version:p.VERSION,requestId,snapshot,platform:readPlatform()||'desktop'},controller.signal);mine={runId:reply.run.runId,requestId};ticket=mine;alive();
   for(;;){alive();const run=reply.run;if(run?.version!==p.VERSION||run.runId!==mine.runId||run.requestId!==requestId||run.snapshotId!==snapshot.snapshotId)throw Error('Несовместимый ответ проверки.');emit({status:'running',run});
    if(run.status==='completed'){if(!p.reportValid(run.report,snapshot)||run.report.freshness!=='NATIVE_RECHECKED')throw Error('Отчёт не прошёл проверку.');await rpc('verify',{snapshotId:snapshot.snapshotId});alive();emit({status:'done',report:run.report});break;}
    if(['failed','cancelled'].includes(run.status))throw Error(errors[run.error]||'Проверка остановлена: '+run.error);
    if(run.status==='awaiting-native'){
     const pending=run.pending;if(!pending||!['read','source','verify'].includes(pending.operation))throw Error('Недопустимая операция чтения.');
     const result=await rpc(pending.operation,{snapshotId:snapshot.snapshotId,nodeIds:pending.nodeIds,nodeId:pending.nodeIds?.[0]});alive();reply=await api('/runs/'+mine.runId+'/context',{requestId,callId:pending.callId,result},controller.signal);
    }else{await pause(controller.signal);alive();reply=await api('/runs/'+mine.runId+'?requestId='+encodeURIComponent(requestId),undefined,controller.signal);}
   }
  }catch(e){await stopRemote(mine);if(rev===revision)emit({status:'error',error:e.message==='AUDIT_CANCELLED'?'Проверка остановлена.':e.name==='TypeError'?'Нет соединения с Apollo Proxy.':e.message});}
  finally{if(ticket===mine)ticket=null;if(rev===revision)abort=null;}
 }
 return {getState:()=>state,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},busy,start,
  accept(message){if(message?.type==='native-diagnostic-invalidated'){if(state.report&&!state.stale)emit({stale:true});return false;}if(message?.type!=='figma-audit-native-result')return false;const wait=pending.get(message.callId);if(wait){clearTimeout(wait.timer);pending.delete(message.callId);if(message.success)wait.resolve(message.result);else wait.reject(Object.assign(Error(errors[message.code]||message.code||'Ошибка чтения Figma.'),{code:message.code}));}return true;},
  selection(message){const key=String(message.pageId)+':'+String(message.id);if(busy()&&selectionKey!==null&&key!==selectionKey){void this.cancel();emit({error:'Выделение изменилось. Повторите проверку.'});}selectionKey=key;emit({validSelection:message.valid===true});},
  refresh(){const available=!isBusy();if(available!==state.available)emit({available});},
  async cancel(){revision++;abort?.abort();abort=null;const old=ticket;ticket=null;emit({status:'stopping'});await stopRemote(old);emit({status:'idle',error:'Проверка остановлена.'});},
  async focus(id){if(state.stale||!state.report)return;try{await rpc('focus',{snapshotId:state.report.snapshotId,nodeId:id});}catch(e){emit({stale:true,error:e.message});}}
 };
}
module.exports={createFigmaAuditClient};
