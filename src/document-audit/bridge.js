const {resolveNativeNode,currentPageTarget}=require("../canvas-target");
const {boundedRead}=require("./reads");
const {ACTION_SCHEMA,actionRequestValid,buildActionData,performAction}=require("./actions");
const {SCHEMA,requestValid,focusValid,resultValid}=require("./protocol");
const {collect,recheck,signature,pageOf}=require("./engine");
const {impact,mergeObservation}=require("./scoped-recheck");
const {createNotificationProof,observationNodes}=require("./notification-proof");
const {REFRESH_TIMEOUT_MS}=require("./budgets");
function createDocumentAuditBridge({api,hash,post,focus,now=Date.now,limits,timeoutMs=15000,refreshTimeoutMs=REFRESH_TIMEOUT_MS,observeSelection=true,isBusy=()=>false,onMutation=()=>{},onRecheckStart=null,bindingAdapter=null}){
 let sequence=0,active=null,session=null,page=null,nodeListener=null,started=false,epoch=0,observerAvailable=false,actionTask=null,lastActionReply=null,actionSequence=0,focusTask=null,refreshTask=null,bindingRefreshRun=null;
 const errors={NATIVE_FACTS_CHANGED:'Свойства или зависимости изменились. Повторите проверку.',NATIVE_CONTEXT_CHANGED:'Страница или платформа изменились. Повторите проверку.',NATIVE_TIMEOUT:'Чтение заняло слишком много времени. Повторите проверку.',NATIVE_RESULT_STALE:'Результат устарел. Повторите проверку.'};
 function invalidate(reason='NATIVE_RESULT_STALE'){
  epoch++;
  if(refreshTask){const task=refreshTask;refreshTask=null;task.notificationProof?.close();sequence++;clearTimeout(task.timer);task.operations?.fail?.();post({type:'document-recheck-error',schemaVersion:SCHEMA,requestId:task.requestId,runId:task.old.runId,message:errors[reason]||errors.NATIVE_RESULT_STALE});}
  if(actionTask)finishAction(actionTask,{status:'error',refreshAllowed:false,message:'Исходные данные изменились. Повторите проверку.'});
  if(session){const runId=session.runId;session=null;if(active){sequence++;active=null;}post({type:'document-audit-invalidated',schemaVersion:SCHEMA,runId,reason});}
 }
 function bind(){
  if(page&&nodeListener)try{page.off('nodechange',nodeListener);}catch(_){/* fail closed below */}
  page=api.currentPage;nodeListener=verifyPageChange;observerAvailable=false;
  try{page.on('nodechange',nodeListener);observerAvailable=true;}catch(_){nodeListener=null;}
 }
 // Figma may deliver import/layout nodechange after the result. Re-read captured facts,
 // rather than treating every notification as proof that the observation changed.
 async function verifyPageChange(event){
  const s=session;if(!s||actionTask?.applying)return;const relevant=new Set(s.facts.filter(f=>!['collection','variable','style'].includes(f.kind)).map(f=>f.id));
  if(Array.isArray(event?.nodeChanges)&&!event.nodeChanges.some(c=>relevant.has(c.id)||c.node?.parent&&c.node.parent.type!=='PAGE'&&relevant.has(c.node.parent.id)))return;
  if(refreshTask){await refreshTask.notificationProof.notify();return;}
  const revision=++epoch;
  let timer;
  const guard=()=>{if(session!==s||epoch!==revision)throw Error('NATIVE_OBSERVER_SUPERSEDED');};
  try{
   await Promise.race([recheck(api,s.facts,{hash,assertCurrent:guard}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('NATIVE_TIMEOUT')),timeoutMs);})]);
   guard();s.epoch=revision;
  }catch(e){if(session===s&&epoch===revision)invalidate(e.message==='NATIVE_FACTS_CHANGED'?'NATIVE_FACTS_CHANGED':'NATIVE_RESULT_STALE');}
  finally{clearTimeout(timer);}
 }
 function selected(){if(active&&api.currentPage.id!==active.context.pageId){sequence++;active=null;invalidate('NATIVE_CONTEXT_CHANGED');}if(session&&api.currentPage.id!==session.context.pageId)invalidate('NATIVE_CONTEXT_CHANGED');}
 const changed=()=>{sequence++;active=null;invalidate('NATIVE_CONTEXT_CHANGED');bind();};
 function start(){if(started)return;started=true;bind();try{if(observeSelection)api.on('selectionchange',selected);api.on('currentpagechange',changed);api.on('close',stop);}catch(_){observerAvailable=false;}}
 function stop(){if(refreshTask)invalidate();if(actionTask)finishAction(actionTask,{status:'cancelled',refreshAllowed:false,message:'Операция остановлена.'});sequence++;active=null;session=null;if(page&&nodeListener)try{page.off('nodechange',nodeListener);}catch(_){}try{if(observeSelection)api.off('selectionchange',selected);api.off('currentpagechange',changed);api.off('close',stop);}catch(_){}started=false;}
 async function run(m){
  if(refreshTask)invalidate();
  if(actionTask){post({type:'document-audit-error',schemaVersion:SCHEMA,requestId:m.requestId,code:'ACTION_BUSY',message:'Дождитесь завершения действия.'});return;}
  const roots=Array.from(api.currentPage.selection);
  if(api.currentPage.id!==m.context.pageId||signature(roots)!==m.context.selectionSignature){post({type:'document-audit-error',schemaVersion:SCHEMA,requestId:m.requestId,code:'NATIVE_CONTEXT_CHANGED',message:errors.NATIVE_CONTEXT_CHANGED});return;}
  const ticket=++sequence,deadline=now()+timeoutMs;session=null;active={ticket,requestId:m.requestId,context:m.context};let latest=null,timer;
  const assertCurrent=()=>{if(now()>deadline)throw Error('NATIVE_TIMEOUT');if(sequence!==ticket||api.currentPage.id!==m.context.pageId||roots.some(n=>n.removed||pageOf(n)?.id!==m.context.pageId))throw Error('NATIVE_CONTEXT_CHANGED');};
  const resultFor=observation=>({runId:m.requestId,context:m.context,checks:observation.checks,observedAt:now(),coverage:'native-subsets-only'});
  const register=(observation,actionsAllowed=false)=>{const result=resultFor(observation);if(!resultValid(result))throw Error('NATIVE_RESPONSE_INVALID');session={runId:m.requestId,context:m.context,facts:observation.facts,targets:observation.targets,result,observation,roots,epoch,expires:now()+60000};if(actionsAllowed)session.actions=buildActionData(observation,m.requestId,m.context,hash);return result;};
  const checkpoint=async observation=>{
   const captured={checks:JSON.parse(JSON.stringify(observation.checks)),facts:observation.facts.slice(),targets:new Map(observation.targets),nodes:new Map(observation.nodes),units:new Map(Array.from(observation.units||[],([id,values])=>[id,new Set(values)])),modeGraph:new Map(observation.modeGraph||[]),resolvedStyles:new Map(observation.resolvedStyles||[])};
   await recheck(api,captured.facts,{hash,assertCurrent,timeoutMs:Math.max(1,Math.min(1200,deadline-now()))});assertCurrent();latest=captured;
   const result=register(latest);post({type:'document-audit-progress',schemaVersion:SCHEMA,requestId:m.requestId,result});
  };
  try{
   const work=async()=>{const observation=await collect(api,m.context,{hash,assertCurrent,limits,roots,onProgress:checkpoint,readTimeoutMs:()=>Math.max(0,Math.min(limits?.readMs||1200,deadline-now()-Math.min(2000,timeoutMs*.25)))});await recheck(api,observation.facts,{hash,assertCurrent,timeoutMs:Math.max(1,Math.min(1200,deadline-now()))});assertCurrent();return observation;};
   const observation=await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('NATIVE_TIMEOUT')),timeoutMs);})]);
   assertCurrent();
   if(!observerAvailable)for(const c of observation.checks)if(c.status!=='not-applicable'){c.status='incomplete';c.gaps.push('current-page-observer-unavailable');}
   const bindings=bindingAdapter?await bindingAdapter.resolve(observation,m.context,assertCurrent):new Map();assertCurrent();
   await recheck(api,observation.facts,{hash,assertCurrent,timeoutMs:Math.max(1,Math.min(1200,deadline-now()))});assertCurrent();
   const result=register(observation,true);session.actions=buildActionData(observation,m.requestId,m.context,hash,bindings);active=null;post({type:'document-audit-result',schemaVersion:SCHEMA,requestId:m.requestId,result,actionData:session.actions.sidecar});if(bindingRefreshRun===m.requestId){bindingRefreshRun=null;void refreshBindings(m.requestId);}
  }catch(e){if(sequence===ticket){
   if(latest&&['NATIVE_TIMEOUT','NATIVE_READ_TIMEOUT'].includes(e.message)){
    for(const c of latest.checks)if(c.status==='running'){c.status='incomplete';c.gaps.push('checker-timeout');}
    const result=register(latest,true);active=null;sequence++;post({type:'document-audit-result',schemaVersion:SCHEMA,requestId:m.requestId,result,actionData:session.actions.sidecar});
   }else{active=null;session=null;sequence++;post({type:'document-audit-error',schemaVersion:SCHEMA,requestId:m.requestId,code:e.message,message:errors[e.message]||'Не удалось прочитать данные макета. Повторите проверку.'});}
  }}finally{clearTimeout(timer);}
 }
 async function refreshBindings(runId){
  if(!bindingAdapter)return;
  if(active?.requestId===runId){bindingRefreshRun=runId;return;}
  const s=session;if(!s||s.runId!==runId||actionTask||focusTask||refreshTask||active)return;
  const deadline=now()+timeoutMs,revision=epoch;
  const guard=()=>{if(session!==s||epoch!==revision||active||actionTask||focusTask||refreshTask||api.currentPage.id!==s.context.pageId||now()>deadline)throw Error('NATIVE_RESULT_STALE');};
  try{
   const bindings=await bindingAdapter.resolve(s.observation,s.context,guard);guard();
   await recheck(api,s.facts,{hash,assertCurrent:guard});guard();
   s.actions=buildActionData(s.observation,s.runId,s.context,hash,bindings);
   post({type:'document-binding-actions',schemaVersion:ACTION_SCHEMA,runId:s.runId,actionData:s.actions.sidecar});
  }catch(_){/* A superseded run keeps its existing, independently guarded actions. */}
 }
 async function focusFinding(m){
  const s=session;let timer,invalidatesCurrent=false;
  try{
   if(actionTask||focusTask||refreshTask)throw Error('ACTION_BUSY');
   if(!s||s.runId!==m.runId)throw Error('NATIVE_RESULT_STALE');
   // Freshness is rechecked against observed roots, independent of selection or elapsed cursor time.
   const f=s.result.checks.flatMap(c=>c.findings).find(f=>f.findingId===m.findingId),target=f?.targets.find(t=>t.id===m.targetId);
   if(!target)throw Error('NATIVE_RESULT_STALE');
   invalidatesCurrent=true;focusTask=m;
   const deadline=now()+timeoutMs;
   const guard=()=>{if(actionTask||focusTask!==m||session!==s||epoch!==s.epoch||now()>deadline||api.currentPage.id!==s.context.pageId)throw Error('NATIVE_RESULT_STALE');};
   guard();const work=async()=>{await recheck(api,s.facts,{hash,assertCurrent:guard});const n=await resolveNativeNode(api,target.nodeId,{read:fn=>boundedRead(fn,1200,guard),guard});guard();return n;};
   const n=await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('NATIVE_RESULT_STALE')),timeoutMs);})]);guard();
   if(!currentPageTarget(n,s.context.pageId))throw Error('NATIVE_RESULT_STALE');
   focus(n);
   post({type:'document-audit-focus-result',schemaVersion:SCHEMA,requestId:m.requestId,runId:m.runId,success:true});
  }catch(e){if(invalidatesCurrent&&session===s)invalidate();post({type:'document-audit-focus-result',schemaVersion:SCHEMA,requestId:m.requestId,runId:m.runId,success:false,message:errors[e.message]||'Слой недоступен. Повторите проверку.'});}finally{clearTimeout(timer);if(focusTask===m)focusTask=null;}
 }

 async function scopedRefresh(task){
  const old=task.old,plan=task.plan;
  const guard=()=>{if(refreshTask!==task||sequence!==task.ticket||api.currentPage.id!==old.context.pageId||old.roots.some(n=>n.removed||pageOf(n)?.id!==old.context.pageId))throw Error('NATIVE_CONTEXT_CHANGED');if(now()>task.deadline)throw Error('NATIVE_TIMEOUT');task.operations?.guard?.();task.notificationProof.assertCurrent();};
  const progress=message=>{guard();post({type:'document-recheck-progress',schemaVersion:SCHEMA,requestId:task.requestId,runId:old.runId,message});};
  try{
   progress('Проверяем сохранённые результаты…');
   guard();task.notificationProof.assertStable();const retained=old.facts.filter(f=>!plan.ids.has(f.id)&&!(plan.action.kind==='theme'&&f.kind==='pageModes'));
   await recheck(api,retained,{hash,assertCurrent:guard});guard();task.notificationProof.assertStable();
   progress('Перепроверяем изменения в макете…');
   const fresh=await collect(api,old.context,{hash,assertCurrent:guard,limits,roots:plan.roots,scoped:true,onProgress:async observation=>{guard();for(const fact of observation.facts){const key=fact.kind+':'+fact.id,previous=task.notificationFacts.get(key);if(previous&&hash(previous.value)!==hash(fact.value))throw Error('NATIVE_FACTS_CHANGED');task.notificationFacts.set(key,fact);}guard();},readTimeoutMs:()=>Math.max(0,Math.min(1200,task.deadline-now()))});guard();
   task.notificationProof.assertStable();const contract=await task.operations.run(guard,progress);guard();task.notificationProof.assertStable();
   plan.includeCurrent();const observation=mergeObservation(old.observation,fresh,plan);
   const bindings=bindingAdapter?await bindingAdapter.resolve(observation,old.context,guard,contract):new Map();guard();
   progress('Подтверждаем актуальность результатов…');
   await recheck(api,observation.facts,{hash,assertCurrent:guard});await task.operations.verify?.(guard);guard();task.notificationProof.assertStable();
   const runId=task.requestId,result={runId,context:old.context,checks:observation.checks,observedAt:now(),coverage:'native-subsets-only'};
   if(!resultValid(result))throw Error('NATIVE_RESPONSE_INVALID');
   const actions=buildActionData(observation,runId,old.context,hash,bindings),stale=new Set(observation.staleFindingIds);
   actions.sidecar.items=actions.sidecar.items.filter(item=>!stale.has(item.findingId));for(const [id,a]of actions.registry)if(stale.has(a.findingId))actions.registry.delete(id);
   await task.notificationProof.finish(()=>{guard();const payload=task.operations.commit?.(contract,guard)||contract;guard();
   session={runId,context:old.context,facts:observation.facts,targets:observation.targets,result,observation,roots:old.roots,epoch,actions,expires:now()+60000};
   refreshTask=null;task.notificationProof.close();clearTimeout(task.timer);
   post({type:'document-recheck-result',schemaVersion:SCHEMA,requestId:task.requestId,runId:old.runId,result,actionData:actions.sidecar,staleFindingIds:observation.staleFindingIds,impactUnknown:plan.unknown.size>0,contract:payload});});
  }catch(e){if(refreshTask===task){refreshTask=null;task.notificationProof?.close();clearTimeout(task.timer);session=null;task.operations?.fail?.();post({type:'document-recheck-error',schemaVersion:SCHEMA,requestId:task.requestId,runId:old.runId,message:errors[e.message]||'Перепроверка затронутой области не завершена. Прежние результаты сохранены; повторите проверку.'});}}
 }
 function finishAction(task,{status='error',message='Действие не выполнено. Повторите проверку.',verified=false,refreshAllowed=true}={}){
  if(actionTask!==task)return;actionTask=null;actionSequence++;clearTimeout(task.timer);
  const reply={type:'document-action-result',schemaVersion:ACTION_SCHEMA,requestId:task.requestId,runId:task.runId,status,applied:task.applied,verified,message};
  if(task.applied&&onRecheckStart&&refreshAllowed&&session===task.session){
   const requestId='recheck:'+hash([task.requestId,++sequence]),plan=impact(session.observation,task.action,session.context);
   const refresh={requestId,ticket:sequence,old:session,plan,deadline:now()+refreshTimeoutMs,operations:null,timer:null,notificationProof:null,notificationFacts:new Map()};refreshTask=refresh;
   try{refresh.operations=onRecheckStart(plan,requestId);
    for(const fact of session.facts)if(!plan.ids.has(fact.id)&&!(plan.action.kind==='theme'&&fact.kind==='pageModes'))refresh.notificationFacts.set(fact.kind+':'+fact.id,fact);
    if(task.action.kind==='update'){const identity=session.facts.find(f=>f.kind==='identity'&&f.id===task.action.latestId);if(!identity)throw Error('NATIVE_RESULT_STALE');refresh.notificationFacts.set('main:'+task.action.nodeId,{kind:'main',id:task.action.nodeId,value:identity.value});}
    const observationGuard=()=>{if(refreshTask!==refresh||sequence!==refresh.ticket||api.currentPage.id!==refresh.old.context.pageId)throw Error('NATIVE_CONTEXT_CHANGED');if(now()>refresh.deadline)throw Error('NATIVE_TIMEOUT');refresh.operations.guard?.();};
    // Descendants removed by this swap have no live handle to fingerprint.
    // Their original facts leave only through the fresh merge; unrelated nodes
    // remain guarded and replacement descendants are included from plan.roots.
    const proofNodes=Array.from(session.observation.nodes,([id,n])=>!plan.ids.has(id)||!n.removed?n:null).filter(Boolean);
    refresh.notificationProof=createNotificationProof({nodes:observationNodes(proofNodes,plan.roots),hash,guard:observationGuard,timeoutMs:refreshTimeoutMs,
     verify:async proofGuard=>{await recheck(api,Array.from(refresh.notificationFacts.values()),{hash,assertCurrent:proofGuard});proofGuard();await refresh.operations.verifyNotification?.(proofGuard);proofGuard();},
     onError:e=>{if(refreshTask===refresh)invalidate(['NATIVE_FACTS_CHANGED','NATIVE_TIMEOUT','NATIVE_CONTEXT_CHANGED'].includes(e.message)?e.message:'NATIVE_RESULT_STALE');}});
    reply.refreshId=requestId;
    refresh.timer=setTimeout(()=>{if(refreshTask===refresh)invalidate('NATIVE_TIMEOUT');},refreshTimeoutMs);
   }catch(_){refresh.notificationProof?.close();refreshTask=null;refresh.operations?.fail?.();}
  }
  lastActionReply=reply;post(reply);
  if(refreshTask&&reply.refreshId){const current=refreshTask;post({type:'document-recheck-start',schemaVersion:SCHEMA,requestId:current.requestId,runId:task.runId,affectedNodeIds:Array.from(current.plan.ids),impactUnknown:current.plan.unknown.size>0});void scopedRefresh(current);}
  else if(task.applied){if(session?.runId===task.runId)invalidate('NATIVE_FACTS_CHANGED');onMutation();}
 }
 async function runAction(m){
  const s=session;
  if(!actionRequestValid(m)){post({type:'document-action-result',schemaVersion:ACTION_SCHEMA,requestId:typeof m.requestId==='string'?m.requestId.slice(0,150):'',runId:m.runId,status:'error',applied:false,verified:false,message:'Параметры действия несовместимы.'});return;}
  const action=s?.actions?.registry.get(m.actionId);
  if(actionTask||focusTask||refreshTask||active||isBusy()||!s||s.runId!==m.runId||['pageId','selectionSignature','platform'].some(k=>m.context[k]!==s.context[k])||!action||action.findingId!==m.findingId||action.targetId!==m.targetId){post({type:'document-action-result',schemaVersion:ACTION_SCHEMA,requestId:m.requestId,runId:m.runId,status:'error',applied:false,verified:false,message:'Действие недоступно или результат устарел. Дождитесь завершения операций и повторите проверку.'});return;}
  const task={requestId:m.requestId,runId:m.runId,ticket:++actionSequence,applied:false,applying:false,session:s,action,deadline:now()+timeoutMs};actionTask=task;
  const guard=()=>{if(actionTask!==task||task.ticket!==actionSequence||session!==s||api.currentPage.id!==s.context.pageId||now()>task.deadline||isBusy())throw Error('ACTION_CONTEXT_CHANGED');};
  const read=fn=>boundedRead(fn,Math.max(1,Math.min(1200,task.deadline-now())),guard);
  task.timer=setTimeout(()=>finishAction(task,{message:task.applied?'Изменение выполнено, подтверждение не получено. Повторите проверку.':'Действие остановлено по таймауту. Повторите проверку.'}),timeoutMs);
  try{
   guard();await recheck(api,s.facts,{hash,assertCurrent:guard});guard();
   const node=await resolveNativeNode(api,action.nodeId,{read,guard});guard();if(!currentPageTarget(node,s.context.pageId))throw Error('ACTION_TARGET_UNAVAILABLE');
   const outcome=await performAction(api,action,node,{read,guard,hash,beforeWrite:async()=>{await recheck(api,s.facts,{hash,assertCurrent:guard});guard();task.applying=true;},onWritten:()=>{task.applied=true;},applyBinding:bindingAdapter?.apply});
   guard();finishAction(task,{status:'success',message:outcome.message,verified:outcome.verified});
  }catch(e){const controlMessages={CATALOG_PIN_CHANGED:'Каталог токенов и стилей изменился. Повторите проверку.',CATALOG_TIMEOUT:'Каталог не загрузился вовремя. Повторите проверку.',CATALOG_UNAVAILABLE:'Каталог токенов и стилей недоступен. Проверьте подключение к Proxy и повторите проверку.',ACTION_CONTEXT_CHANGED:'Исходные данные изменились. Повторите проверку.'};finishAction(task,{message:task.applied?'Изменение выполнено, но подтверждение или восстановление свойств не завершено. Повторите проверку.':controlMessages[e.message]||errors[e.message]||'Не удалось выполнить действие ('+String(e.message).slice(0,100)+'). Повторите проверку.'});}
 }
 function accept(m){
  if(m?.type==='document-recheck-cancel'){if(m.schemaVersion===SCHEMA&&Object.keys(m).length===3&&refreshTask?.requestId===m.requestId)invalidate();return true;}
  if(m?.type==='document-action-request'){void runAction(m);return true;}
  if(m?.type==='document-action-cancel'){if(Object.keys(m).length===3&&m.schemaVersion===ACTION_SCHEMA&&typeof m.requestId==='string'){if(actionTask?.requestId===m.requestId)finishAction(actionTask,{status:'cancelled',message:actionTask.applied?'Изменение выполнено; ожидание подтверждения остановлено. Повторите проверку.':'Действие остановлено.'});else if(lastActionReply?.requestId===m.requestId)post(lastActionReply);}return true;}
  if(!m||!['document-audit-request','document-audit-focus','document-audit-cancel'].includes(m.type))return false;
  if(m.type==='document-audit-cancel'){if(Object.keys(m).length===3&&m.schemaVersion===SCHEMA&&typeof m.requestId==='string'&&(active?.requestId===m.requestId||session?.runId===m.requestId)){if(actionTask)finishAction(actionTask,{status:'cancelled',refreshAllowed:false,message:'Действие остановлено вместе с проверкой.'});sequence++;active=null;session=null;post({type:'document-audit-cancelled',schemaVersion:SCHEMA,requestId:m.requestId});}return true;}
  if(m.type==='document-audit-request'){
   if(!requestValid(m)){post({type:'document-audit-error',schemaVersion:SCHEMA,requestId:typeof m.requestId==='string'?m.requestId.slice(0,100):'',code:'NATIVE_REQUEST_INVALID',message:'Параметры проверки документа несовместимы. Повторите запуск.'});return true;}
   void run(m);return true;
  }
  if(!focusValid(m)){post({type:'document-audit-focus-result',schemaVersion:SCHEMA,requestId:typeof m.requestId==='string'?m.requestId.slice(0,100):'',runId:m.runId,success:false,message:'Запрос перехода несовместим.'});return true;}
  void focusFinding(m);return true;
 }
 return{start,stop,accept,invalidate,refreshBindings,selectionChanged:selected,isActionBusy:()=>Boolean(actionTask||refreshTask),isActionApplying:()=>Boolean(actionTask?.applying),observeRefreshChange:()=>{if(!refreshTask)return false;void refreshTask.notificationProof.notify();return true;}};
}
module.exports={createDocumentAuditBridge};
