'use strict';
const p=require('./transport'),{nativeMetrics}=require('./ui-model');
const {createRunTrace,readTrace,MAX_SESSIONS}=require('./run-trace');
const messages={AUDIT_DATA_CHANGED_RELOAD_REQUIRED:'Данные Proxy изменились. Закрой и заново открой Apollo.',AUDIT_SOURCE_CHANGED:'Макет изменился. Повтори проверку.',AUDIT_SCOPE_UNAVAILABLE:'Проверенная область недоступна. Выбери область и повтори проверку.',AUDIT_DATA_PACKAGE_MISSING:'В Proxy нет пакета данных V3. Обнови данные Proxy.',AUDIT_DATA_READ_TIMEOUT:'Proxy не завершил чтение данных. Проверь подключение и повтори запуск.',AUDIT_OBSERVER_UNAVAILABLE:'Нельзя подтвердить актуальность макета. Повтори проверку перед исправлением.',AUDIT_BUSY:'Дождись завершения текущего действия.',AUDIT_ACTION_SOURCE_CHANGED:'Свойства слоя изменились. Повтори проверку перед исправлением.',AUDIT_CANCELLED:'Проверка остановлена.',AUDIT_ACTION_FAILED:'Исправление не завершено. Проверь повторный результат.',AUDIT_FAILED:'Не удалось завершить проверку.',AUDIT_SESSION_UNAVAILABLE:'Результат больше не доступен. Повтори проверку.'};
const uncertain=new Set(['node-unreadable','notification-unavailable','outside-observation','unobserved-property','identity-unconfirmed','identity-unavailable','topology-notification']);
function sourceChange(value){if(!value||typeof value.reason!=='string'||!/^[-a-z]{1,80}$/.test(value.reason))return null;return{reason:value.reason,stage:['capture','operation','retained'].includes(value.stage)?value.stage:null,nodeId:typeof value.nodeId==='string'?value.nodeId.slice(0,200):null,fields:Array.isArray(value.fields)?value.fields.filter(field=>typeof field==='string').slice(0,32).map(field=>field.slice(0,80)):[]};}
const readable=(code,cause)=>code==='AUDIT_SOURCE_CHANGED'&&uncertain.has(cause?.reason)?'Не удалось подтвердить актуальность области. Повтори проверку.':code==='AUDIT_SOURCE_CHANGED'&&cause?.reason==='context-invalidated'?'Контекст проверки изменился. Запусти проверку заново.':messages[code]||(/^AUDIT_DATA_|^AUDIT_PACKAGE_|^AUDIT_TOKEN_/.test(code||'')?'Не удалось проверить пакет данных V3. Обнови код и данные Proxy, затем повтори запуск.':'Действие не завершено. Повтори проверку.');
function createV3UiClient({send,request=(...args)=>fetch(...args),endpoint='http://localhost:3001',onChange=()=>{},statistics=null,onStart=()=>{},pollDelay=700}){
 let sequence=0,closed=false,active=null,operation=null;
 const listeners=new Set(),reads=new Map(),operations=new Map();
 const traces={components:[],texts:[]},droppedTraces={components:0,texts:0};
 function traceEntry(kind,requestId,runId){
  const history=traces[kind];if(!history)return null;let entry=history.find(v=>v.requestId===requestId&&v.runId===runId);
  if(!entry){entry={requestId,runId,ui:null,native:null};if(history.length===MAX_SESSIONS){history.shift();droppedTraces[kind]++;}history.push(entry);}return entry;
 }
 const kindForRun=runId=>active?.requestId===runId?active.kind:state.runId===runId?'components':state.texts.runId===runId?'texts':null;
 function uiTrace(requestId,runId,kind){const trace=createRunTrace({requestId,runId,kind,side:'ui'});const entry=traceEntry(kind,requestId,runId);if(entry)entry.ui=trace;return trace;}
 function nativeTrace(message,kind,requestId,runId){const trace=readTrace(message.trace);if(trace?.side==='native'&&trace.kind===kind&&trace.requestId===requestId&&trace.runId===runId){const entry=traceEntry(kind,requestId,runId);if(entry)entry.native=trace;}}
 function relayTrace(ownerId){for(const kind of ['components','texts']){const entry=traces[kind].find(v=>v.requestId===ownerId);if(entry?.ui)return entry.ui;}return null;}
 let state={result:null,runId:null,stale:false,texts:{result:null,capture:null,runId:null,stale:false},attempts:{components:null,texts:null},busy:false,stopping:false,kind:null,progress:'',error:'',notice:'',sourceChange:null,operation:{busy:false,status:'idle',message:''}};
 const emit=patch=>{if(closed)return;state=Object.assign({},state,patch);onChange(state);for(const listener of listeners)listener();};
 const id=prefix=>prefix+'-'+(++sequence);
 async function json(path,options){const response=await request(endpoint+path,options),value=await response.json();if(!response.ok||value?.success===false||value?.error)throw Error(value?.error||'AUDIT_DATA_UNAVAILABLE');return value;}
 function cancelOperations(runId,code){for(const[requestId,task]of operations)if(task.runId===runId){task.trace.add('operation-cancelled',{code},true);operations.delete(requestId);send({type:'v3-audit-cancel',schemaVersion:p.BRIDGE,requestId});task.reject(Error(code));}}
 function current(work){if(closed||active!==work||work.cancelled||work.stale)throw Error(work.stale?'AUDIT_SOURCE_CHANGED':'AUDIT_CANCELLED');}
 function begin(requestId,kind,settings,recheck=false,sourceRunId=null){
  settings=JSON.parse(JSON.stringify(settings));
  const work={requestId,kind,settings,cancelled:false,stale:false,phase:'capture',abort:new AbortController(),trace:uiTrace(requestId,requestId,kind)};active=work;work.trace.add(recheck?'recheck-start':'run-start',{stage:work.phase});
  if(kind==='components')statistics?.start(requestId,'native-document',settings.pickerLabel,recheck?'recheck':'check',sourceRunId);
  onStart(requestId,recheck);
  emit({stale:kind==='components'&&state.runId?true:state.stale,texts:kind==='texts'?Object.assign({},state.texts,{stale:!!state.texts.runId}):state.texts,busy:true,stopping:false,kind,progress:recheck?'Перепроверяем область…':'Подключаем данные проверки…',error:'',notice:'',sourceChange:null,operation:recheck?{busy:true,status:'refreshing',message:'Перепроверяем область…'}:{busy:false,status:'idle',message:''}});return work;
 }
 function finish(work,error=null,cancelled=false){
  if(active!==work)return;
  work.trace.add('run-terminal',{stage:work.phase,code:error?.message,outcome:cancelled?'cancelled':error?'error':'success'},!!error||cancelled);
  if(work.kind==='components'&&(error||cancelled))statistics?.finish(work.requestId,'native-document',null,cancelled?'cancelled':'failed');
  const attempt={requestId:work.requestId,kind:work.kind,settings:work.settings,phase:work.phase,cancelled,error:error?.message||null,capture:work.capture||null};
  active=null;emit({attempts:Object.assign({},state.attempts,{[work.kind]:attempt}),busy:false,stopping:false,progress:'',error:cancelled?'':error?readable(error.message,state.sourceChange):'',notice:cancelled?(work.phase==='model'?'Ожидание остановлено. Проверка текстов на сервере может продолжаться.':'Проверка остановлена. Предыдущий результат сохранён.'):'',operation:{busy:false,status:cancelled?'cancelled':error?'error':'success',message:''}});
 }
 async function serve(message){
  if(!p.dataRequest(message)||reads.has(message.requestId))return;
  const abort=new AbortController(),task={abort,ownerRequestId:message.ownerRequestId},trace=relayTrace(message.ownerRequestId);reads.set(message.requestId,task);
  trace?.add('data-relay-start',{dataRequestId:message.requestId,resource:message.operation,dataId:message.dataId,assetId:message.fileId});
  try{const path=message.operation==='manifest'?'/v1/audit-data/manifest':`/v1/audit-data/${message.dataId}/assets/${message.fileId}`;
   const result=await json(path,{signal:abort.signal,cache:'no-store'});if(closed||reads.get(message.requestId)!==task)return;
   trace?.add('data-relay-result',{dataRequestId:message.requestId,outcome:'success'});
   send({type:'v3-audit-data-response',schemaVersion:p.VERSION,requestId:message.requestId,ownerRequestId:message.ownerRequestId,result});
  }catch(error){if(!closed&&reads.get(message.requestId)===task){const code=/^AUDIT_[A-Z_]+$/.test(error.message)?error.message:'AUDIT_DATA_UNAVAILABLE';trace?.add('data-relay-result',{dataRequestId:message.requestId,outcome:'error',code},true);send({type:'v3-audit-data-response',schemaVersion:p.VERSION,requestId:message.requestId,ownerRequestId:message.ownerRequestId,error:code});}}
  finally{if(reads.get(message.requestId)===task)reads.delete(message.requestId);}
 }
 function rpc(type,runId,payload={}){
  const requestId=id('v3-operation'),kind=kindForRun(runId),trace=uiTrace(requestId,runId,kind);trace.add('operation-start',{stage:type.replace('v3-audit-','')});return new Promise((resolve,reject)=>{operations.set(requestId,{resolve,reject,runId,kind,trace});try{send(Object.assign({type,schemaVersion:p.BRIDGE,requestId,runId},payload));}catch(error){trace.add('operation-error',{code:error.message},true);operations.delete(requestId);reject(error);}});
 }
 async function analyze(work,capture){
  try{
   current(work);work.phase='model';work.capture=capture;work.trace.add('stage',{stage:work.phase});
   emit({progress:'Проверяем тексты по редакционным правилам…'});
   // Same report and route as V3. No dialogue/Ask context or contract fallback.
   let value=await json('/v1/analyze/codex/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({report:capture.textReport}),signal:work.abort.signal});current(work);
   let run=value.run;if(!run||!p.id(run.id))throw Error('AUDIT_FAILED');const remoteId=run.id;
   while(true){
    current(work);
    if(run.id!==remoteId)throw Error('AUDIT_FAILED');
    if(run.status==='failed')throw Error('AUDIT_FAILED');
    if(run.status==='completed'){
     const validation=run.validation;
     if(!validation||!Array.isArray(validation.findings)||typeof validation.responseMarkdown!=='string')throw Error('AUDIT_FAILED');
     const nodes=new Set(capture.textReport.facts.texts.map(fact=>fact.node.id));
     if(validation.findings.some(finding=>finding.nodeId&&!nodes.has(finding.nodeId)))throw Error('AUDIT_FAILED');
     await rpc('v3-audit-verify',work.requestId);current(work);
     emit({texts:{result:validation,capture,runId:work.requestId,settings:work.settings,stale:false}});finish(work);return;
    }
    emit({progress:typeof run.message==='string'&&run.message.trim()?run.message:'Проверяем тексты по редакционным правилам…'});
    await new Promise(resolve=>{const timer=setTimeout(done,pollDelay);function done(){clearTimeout(timer);work.abort.signal.removeEventListener('abort',done);resolve();}work.abort.signal.addEventListener('abort',done,{once:true});});current(work);
    value=await json('/v1/analyze/codex/runs/'+encodeURIComponent(remoteId),{signal:work.abort.signal,cache:'no-store'});current(work);run=value.run;if(!run)throw Error('AUDIT_FAILED');
   }
  }catch(error){finish(work,error,work.cancelled);}
 }
 const api={
  getState:()=>state,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},busy:()=>Boolean(active||operation),
  snapshot(kind='components'){
   if(!['components','texts'].includes(kind))throw Error('AUDIT_REQUEST_INVALID');
   const saved=kind==='components'?state.result:state.texts.result,attempt=state.attempts[kind],work=active?.kind===kind?active:null;
   const acceptedRunId=kind==='components'?state.runId:state.texts.runId,capture=kind==='components'?state.result:state.texts.capture;
   const settings=(kind==='components'?state.resultSettings:state.texts.settings)||work?.settings||attempt?.settings||null;
   const stale=kind==='components'?state.stale:state.texts.stale;
   const originalPayload=saved?(kind==='components'?saved:{capture,validation:saved}):null;
   return JSON.parse(JSON.stringify({engine:'apollo-v3',kind,runId:acceptedRunId||work?.requestId||attempt?.requestId||null,dataId:capture?.dataId||work?.capture?.dataId||attempt?.capture?.dataId||null,settings,
    hasAcceptedResult:!!saved,status:!saved?'diagnostic':work?'checking-with-saved-result':stale?'stale':'accepted',stale:!!stale,
    pending:work?{requestId:work.requestId,phase:work.phase,settings:work.settings,stopping:!!work.cancelled}:null,
    error:state.kind===kind?state.error:'',notice:state.kind===kind?state.notice:'',operation:Object.assign({},state.operation,{runId:operation?.runId||null}),
    lastAttempt:attempt?{requestId:attempt.requestId,phase:attempt.phase,cancelled:attempt.cancelled,error:attempt.error}:null,
    originalPayload,sourceChange:state.sourceChange,trace:{droppedSessions:droppedTraces[kind],sessions:traces[kind].map(entry=>({requestId:entry.requestId,runId:entry.runId,ui:entry.ui?.snapshot()||null,native:entry.native}))},diagnosticCapture:saved?null:work?.capture||attempt?.capture||null}));
  },
  download(kind='components'){
   const snapshot=api.snapshot(kind),blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download='apollo-v3-'+kind+'-'+(snapshot.runId||'diagnostic').replace(/[^a-zA-Z0-9_-]/g,'-')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),0);return snapshot;
  },
  async readData(){const value=await json('/v1/audit-data/manifest',{cache:'no-store'});if(value?.schemaVersion!=='apollo.v3-audit-data.v1'||!p.hash(value.dataId)||!Array.isArray(value.files)||!value.files.every(file=>p.hash(file.id)&&Array.isArray(file.roles)))throw Error('AUDIT_DATA_INVALID');return value;},
  start({requestId,kind='components',uiPreferences:settings}){
   if(closed||api.busy())return false;begin(requestId,kind,settings);
   send({type:'v3-audit-run',schemaVersion:p.BRIDGE,requestId,kind,channel:settings.pickerLabel,pageType:settings.pageTypeId,shellAuditEnabled:settings.shellAuditEnabled});return true;
  },
  stop(){
   if(operation||!active||active.cancelled)return false;
   const work=active;work.trace.add('cancel-request',{stage:work.phase});work.cancelled=true;work.abort.abort();send({type:'v3-audit-cancel',schemaVersion:p.BRIDGE,requestId:work.requestId});
   cancelOperations(work.requestId,'AUDIT_CANCELLED');
   if(work.phase==='model')finish(work,null,true);else emit({stopping:true,progress:'Останавливаем проверку…'});return true;
  },
  invalidate(){
   for(const kind of ['components','texts']){const runId=active?.kind===kind?active.requestId:kind==='components'?state.runId:state.texts.runId;relayTrace(runId)?.add('context-invalidated',{callsite:'ui-context-invalidate'},true);}
   send({type:'v3-audit-invalidate',schemaVersion:p.BRIDGE,requestId:id('v3-context')});
   if(state.runId||state.texts.runId)emit({stale:!!state.runId,texts:Object.assign({},state.texts,{stale:!!state.texts.runId})});
   if(active){active.stale=true;active.abort.abort();send({type:'v3-audit-cancel',schemaVersion:p.BRIDGE,requestId:active.requestId});if(active.phase==='model'){cancelOperations(active.requestId,'AUDIT_SOURCE_CHANGED');finish(active,Error('AUDIT_SOURCE_CHANGED'));}}
  },
  async focus(runId,focusActionId){return api.operate('v3-audit-focus',runId,{focusActionId});},
  async action(actionId){if(!state.result?.mutationAvailable)return false;return api.operate('v3-audit-action',state.runId,{actionId});},
  async operate(type,runId,payload){
   const saved=runId===state.runId?{stale:state.stale}:runId===state.texts.runId?state.texts:null;
   if(closed||api.busy()||!saved||saved.stale&&type!=='v3-audit-focus')return false;
   const task={runId};operation=task;emit({operation:{busy:true,status:'applying',message:type==='v3-audit-focus'?'Переходим к слою…':'Применяем исправление…'}});
   try{const reply=await rpc(type,runId,payload);if(operation!==task)return false;
    if(reply.recheckRequestId){operation=null;begin(reply.recheckRequestId,'components',state.resultSettings,true,runId);emit({stale:true});}
    else{operation=null;emit({operation:{busy:false,status:'success',message:reply.message||''}});}return true;
   }catch(error){if(operation===task){operation=null;const reply=error.reply;if(reply?.recheckRequestId){begin(reply.recheckRequestId,'components',state.resultSettings,true,runId);emit({stale:true});}else emit({operation:{busy:false,status:'error',message:readable(error.message)}});}return false;}
  },
  accept(message){
   if(closed)return!!message?.type?.startsWith('v3-audit-');
   if(message?.type==='v3-audit-data-request'){void serve(message);return true;}
   if(message?.type==='v3-audit-data-cancel'){
    if(message.schemaVersion!==p.VERSION||!p.exact(message,['type','schemaVersion','requestId','ownerRequestId']))return true;
    const task=reads.get(message.requestId);if(task?.ownerRequestId===message.ownerRequestId){relayTrace(task.ownerRequestId)?.add('data-relay-cancelled',{dataRequestId:message.requestId});reads.delete(message.requestId);task.abort.abort();}return true;
   }
   if(!message?.type?.startsWith('v3-audit-')||message.schemaVersion!==p.BRIDGE)return false;
   if(message.type==='v3-audit-invalidated'){
    const kind=kindForRun(message.runId);if(kind)nativeTrace(message,kind,message.runId,message.runId);
    if(message.runId===state.runId||message.runId===state.texts.runId)emit({sourceChange:sourceChange(message.sourceChange)});
    if(message.runId===state.runId)emit({stale:true});if(message.runId===state.texts.runId)emit({texts:Object.assign({},state.texts,{stale:true})});
    if(message.runId===active?.requestId){active.stale=true;active.abort.abort();if(active.phase==='model'){cancelOperations(active.requestId,'AUDIT_SOURCE_CHANGED');finish(active,Error('AUDIT_SOURCE_CHANGED'));}}return true;
   }
   if(message.type.startsWith('v3-audit-operation-')){
    const task=operations.get(message.requestId);if(!task||task.runId!==message.runId)return true;
    nativeTrace(message,task.kind,message.requestId,task.runId);task.trace.add('operation-terminal',Object.assign({},sourceChange(message.sourceChange)||{},{code:message.code,outcome:message.type==='v3-audit-operation-result'?'success':'error',mutationStarted:message.mutationStarted}),message.type!=='v3-audit-operation-result');
    operations.delete(message.requestId);
    if(message.type==='v3-audit-operation-result')task.resolve(message);else task.reject(Object.assign(Error(message.code||'AUDIT_ACTION_FAILED'),{reply:message}));return true;
   }
   const work=active;if(!work||message.requestId!==work.requestId)return true;
   if(message.type==='v3-audit-progress'){if(!work.cancelled&&!work.stale&&typeof message.progress?.message==='string'){if(work.progressStage!==message.progress.stage){work.progressStage=message.progress.stage;work.trace.add('stage',{stage:message.progress.stage,checked:message.progress.checked,total:message.progress.total});}emit({progress:message.progress.message});}return true;}
   if(message.type==='v3-audit-cancelling'){emit({stopping:true});return true;}
   if(message.type==='v3-audit-error'||message.type==='v3-audit-cancelled'){nativeTrace(message,work.kind,work.requestId,work.requestId);if(message.sourceChange)emit({sourceChange:sourceChange(message.sourceChange)});finish(work,Error(message.code||'AUDIT_FAILED'),work.cancelled);return true;}
   if(message.type==='v3-audit-result'){
    if(work.cancelled||work.stale){finish(work,Error('AUDIT_SOURCE_CHANGED'),work.cancelled);return true;}
    const result=message.result;
    if(message.kind!==work.kind||result?.runId!==work.requestId||!p.hash(result.dataId)||!Array.isArray(result.textReport?.facts?.texts)||work.kind==='components'&&!result.visibleViews){finish(work,Error('AUDIT_FAILED'));return true;}
    nativeTrace(message,work.kind,work.requestId,work.requestId);work.trace.add('native-result',{stage:'capture',dataId:result.dataId});
    work.capture=result;
    if(work.kind==='texts')void analyze(work,result);
    else{statistics?.finish(work.requestId,'native-document',nativeMetrics(result,work.settings));emit({result,runId:work.requestId,resultSettings:work.settings,stale:false});finish(work);}return true;
   }
   return true;
  },
  close(){closed=true;active?.abort.abort();if(active)send({type:'v3-audit-cancel',schemaVersion:p.BRIDGE,requestId:active.requestId});for(const task of reads.values())task.abort.abort();reads.clear();for(const task of operations.values())task.reject(Error('AUDIT_CANCELLED'));operations.clear();listeners.clear();},
 };
 return api;
}
module.exports={createV3UiClient,readable};
