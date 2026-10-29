const p = require('./run-protocol')(require('./protocol'));
const {createOpaqueId} = require('../../design-check/opaque-id');
const {readDiagnostics} = require('./diagnostics');
const b = require('./batch-protocol');
const {activity}=require('../../token-journal-protocol');
function createLayerNamesClient({send,request=(url,options)=>fetch(url,options),endpoint='http://localhost:3001/skills/layer-names',isBusy=()=>false,onChange=()=>{},onOperation=()=>null}) {
  const listeners=new Set(),pending=new Map(),identity=createOpaqueId();
  let sequence=0,revision=0,abort=null,activeRun=null,selectionKey=null,batchAttempt=null,analysisActivity=null;
  const batchByNode=new Map();
  let state={status:'idle',snapshot:null,plan:null,result:null,run:null,batch:null,batchIndex:0,batchChecked:0,diagnostics:null,diagnosticsAt:0,startedAt:0,selected:[],error:'',validSelection:false,available:true};
  const busy=()=>['reading','planning','reading-context','registering','applying','undoing'].includes(state.status);
  function emit(patch){state=Object.assign({},state,patch);for(const listener of listeners)listener();onChange();}
  function rpc(operation,payload){
    const requestId='layer-names-'+identity+'-'+(++sequence);
    const schemaVersion=operation.startsWith('batch-')?b.SCHEMA:p.SCHEMA,type=operation.startsWith('batch-')?'layer-names-batch-request':'layer-names-request';
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('Плагин не ответил. Обновите предложения перед применением.'));},15000);
      pending.set(requestId,{operation,schemaVersion,resolve,reject,timer});send({type,schemaVersion,requestId,operation,payload});
    });
  }
  function accept(message){
    if(!['layer-names-result','layer-names-batch-result'].includes(message?.type))return false;
    const ticket=pending.get(message.requestId);if(!ticket)return true;
    clearTimeout(ticket.timer);pending.delete(message.requestId);
    if(message.schemaVersion!==ticket.schemaVersion || message.operation!==ticket.operation || message.type!==(ticket.schemaVersion===b.SCHEMA?'layer-names-batch-result':'layer-names-result'))ticket.reject(Error('Ответ навыка несовместим. Повторите анализ.'));
    else if(message.error)ticket.reject(Object.assign(Error(message.error),{nativeReply:true}));else ticket.resolve(message.result);return true;
  }
  function errorMessage(code,status){
    if(code==='AGENT_PROVIDER_CAPABILITY_UNAVAILABLE')return 'Выбранный агент не поддерживает этот навык. Выберите Codex или Claude в окне «О прокси».';
    if(code==='LAYER_NAMES_RUN_EXPIRED')return 'Результат этой пачки больше не хранится в Proxy. Продолжите анализ с незавершённой пачки.';
    if(code==='LAYER_NAMES_RUN_LIMIT')return 'История запусков в Proxy заполнена. Перезапустите ApolloProxyControl и продолжите анализ.';
    if(code==='LAYER_NAMES_WIRE_INCOMPATIBLE' || code==='LAYER_NAMES_RUN_PROFILE_INCOMPATIBLE')return 'Версии плагина и исполнителя навыка несовместимы. Обновите Apollo и ApolloProxyControl.';
    if(code==='CODEX_AUTH_REQUIRED' || code==='CLAUDE_AUTH_REQUIRED')return 'Выполните вход в выбранный агент в окне «О прокси» и повторите анализ.';
    if(code==='LAYER_NAMES_CONNECTION_FAILED')return 'Codex не смог установить соединение с сервисом. Проверьте подключение и повторите анализ.';
    if(code==='LAYER_NAMES_BUSY' || status===429)return 'Агент занят другим запросом. Повторите запуск чуть позже.';
    if(['LAYER_NAMES_DEADLINE','CLI_TIME_BUDGET_EXHAUSTED','CODEX_MAX_RUNTIME_EXCEEDED','CLAUDE_MAX_RUNTIME_EXCEEDED','CODEX_IDLE_TIMEOUT','CLAUDE_IDLE_TIMEOUT'].includes(code) || status===504)return 'Время выполнения анализа истекло. Повторите попытку позже.';
    if(['LAYER_NAMES_STEP_LIMIT','LAYER_NAMES_REPEATED_READ'].includes(code))return 'Анализ остановлен: агент не смог завершить предложения за доступные шаги. Повторите анализ.';
    if(['LAYER_NAMES_SKILL_STALE','LAYER_NAMES_SKILL_UNAVAILABLE'].includes(code))return 'Правила навыка изменились или недоступны. Обновите знания в ApolloProxyControl и повторите анализ.';
    if(code==='LAYER_NAMES_CANCELLED')return 'Анализ остановлен.';
    if(status===404)return 'Обновите ApolloProxyControl и повторите анализ: запуск навыка недоступен.';
    if(status===502 || code==='CODEX_PROCESS_FAILED' || code==='CLAUDE_PROCESS_FAILED')return 'Агент завершил анализ с ошибкой. Повторите попытку позже.';
    return 'Не удалось получить предложения. Проверьте подключение ApolloProxyControl и повторите запуск.';
  }
  async function api(path,body,signal){
    const controller=new AbortController(),cancel=()=>controller.abort();
    const timer=setTimeout(cancel,30000);signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
    try{
      const response=await request(endpoint+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
      const value=await response.json();if(!response.ok || value.success!==true)throw Object.assign(Error(errorMessage(value.code,response.status)),{code:value.code});return value;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }
  function stopRemote(ticket){return ticket ? api('/runs/'+ticket.runId+'/cancel',{requestId:ticket.requestId}).catch(()=>null) : Promise.resolve(null);}
  function pause(signal){return new Promise((resolve,reject)=>{
    const cancel=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(Object.assign(Error('aborted'),{name:'AbortError'}));};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},750);
    signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
  });}
  const cancelled=()=>Object.assign(Error('aborted'),{name:'AbortError'});
  async function validateBatch(purpose,batchIndex=null,attemptId=null,alive=()=>true){
    if(!alive())throw cancelled();
    const sessionId=state.batch.sessionId;
    let result=await rpc('batch-check',{sessionId,purpose,batchIndex,attemptId});
    for(;;){
      if(!alive())throw cancelled();
      if(!result || typeof result.done!=='boolean' || !p.string(result.checkId) || !Number.isInteger(result.checked) || !Number.isInteger(result.total) || result.checked<0 || result.checked>result.total)throw Error('Проверка актуальности несовместима.');
      emit({batchChecked:result.checked});
      if(result.done){if(result.token!==result.checkId)throw Error('Проверка актуальности несовместима.');return result.token;}
      result=await rpc('batch-check-next',{sessionId,checkId:result.checkId});
    }
  }
  async function analyse(snapshot,requestId,controller,revisionId,read,checkSession={id:requestId,index:0,count:1}){
    if(controller.signal.aborted || revision!==revisionId)throw cancelled();
    let ticket=null;const timer=setTimeout(()=>controller.abort(),930000);
    try{
      const context={snapshotId:snapshot.snapshotId,nodes:[]};
      emit({status:'reading-context'});
      for(let offset=0;offset<snapshot.nodes.length;offset+=p.MAX_CONTEXT_NODES){
        const ids=snapshot.nodes.slice(offset,offset+p.MAX_CONTEXT_NODES).map(node=>node.nodeId),part=await read(ids);
        if(controller.signal.aborted || revision!==revisionId)throw cancelled();
        if(!p.contextValid(part,snapshot,ids))throw Error('Контекст слоёв несовместим. Повторите анализ.');
        context.nodes.push(...part.nodes);
      }
      analysisActivity?.agent();
      let reply=await api('/runs',{schemaVersion:p.RUN_SCHEMA,wire:{version:p.WIRE_VERSION,sha256:p.WIRE_SHA256},requestId,snapshot,context,checkSession},controller.signal),run=reply.run;
      if(!p.runValid(run,snapshot,requestId))throw Error('Ответ агента несовместим. Обновите ApolloProxyControl и повторите анализ.');
      ticket={runId:run.runId,requestId};
      if(revision!==revisionId){void stopRemote(ticket);throw cancelled();}activeRun=ticket;
      if(state.batchSkill && JSON.stringify(state.batchSkill)!==JSON.stringify(run.skill))throw Error('Правила навыка изменились между пачками. Запустите новую проверку.');
      for(;;){
        if(!p.runValid(run,snapshot,requestId,ticket.runId))throw Error('Ответ запуска несовместим. Повторите анализ.');
        if(revision!==revisionId)throw cancelled();
        emit({status:run.status==='awaiting-context'?'reading-context':'planning',run,diagnostics:readDiagnostics(reply.diagnostics,run),diagnosticsAt:Date.now()});
        if(run.status==='failed' || run.status==='cancelled')throw Object.assign(Error(errorMessage(run.error.code)),{code:run.error.code,cancelled:run.status==='cancelled'});
        if(run.status==='completed')break;
        if(run.status==='awaiting-context'){
          const context=await read(run.pending.nodeIds);if(revision!==revisionId)throw cancelled();
          if(!p.contextValid(context,snapshot,run.pending.nodeIds))throw Error('Контекст слоёв несовместим. Повторите анализ.');
          reply=await api('/runs/'+ticket.runId+'/context',{requestId,callId:run.pending.callId,context},controller.signal);run=reply.run;
        }else{
          await pause(controller.signal);if(revision!==revisionId)throw cancelled();
          reply=await api('/runs/'+ticket.runId+'?requestId='+encodeURIComponent(requestId),undefined,controller.signal);run=reply.run;
        }
      }
      return run.plan;
    }catch(error){
      if(ticket)void stopRemote(ticket);
      throw error;
    }finally{clearTimeout(timer);if(activeRun===ticket)activeRun=null;}
  }
  async function runBatches(revisionId,controller){
    const alive=()=>revision===revisionId && !controller.signal.aborted;
    while(state.batch.status==='capturing'){
      if(!alive())throw cancelled();
      const next=await rpc('batch-next',{sessionId:state.batch.sessionId});if(!alive())throw cancelled();
      if(!b.manifestValid(next)||next.sessionId!==state.batch.sessionId)throw Error('Описание пачек несовместимо.');
      emit({batch:next,snapshot:next});
    }
    if(state.batch.completedCount===state.batch.batchCount)await validateBatch('resume',null,null,alive);
    while(state.batch.completedCount<state.batch.batchCount){
      if(!alive())throw cancelled();
      const sessionId=state.batch.sessionId,batchIndex=state.batch.completedCount,attemptId='layer-names-'+identity+'-'+revisionId+'-'+batchIndex+'-'+(++sequence);
      emit({status:'planning',batchIndex:batchIndex+1,batchChecked:0,run:null,diagnostics:null,diagnosticsAt:0});
      let token=await validateBatch('open',batchIndex,attemptId,alive);if(!alive())throw cancelled();
      const snapshot=await rpc('batch-open',{sessionId,batchIndex,attemptId,token});if(!alive())throw cancelled();
      if(!p.snapshotValid(snapshot)||snapshot.pageId!==state.batch.pageId||JSON.stringify(snapshot.rootIds)!==JSON.stringify(state.batch.rootIds))throw Error('Контекст пачки несовместим.');
      batchAttempt=attemptId;
      const plan=await analyse(snapshot,attemptId,controller,revisionId,async nodeIds=>{
        const token=await validateBatch('read',batchIndex,attemptId,alive);if(!alive())throw cancelled();
        return rpc('batch-read',{sessionId,batchIndex,attemptId,token,nodeIds});
      },{id:'layer-names-'+identity+'-'+sessionId,index:batchIndex,count:state.batch.batchCount});if(!alive())throw cancelled();
      emit({status:'registering'});token=await validateBatch('register',batchIndex,attemptId,alive);if(!alive())throw cancelled();
      const registered=await rpc('batch-register',{sessionId,batchIndex,attemptId,token,plan});if(!alive())throw cancelled();
      if(!p.planValid(registered?.plan,snapshot)||!b.manifestValid(registered.manifest)||registered.manifest.sessionId!==sessionId||registered.manifest.batchCount!==state.batch.batchCount||registered.manifest.completedCount!==batchIndex+1)throw Error('Предложения пачки не прошли проверку.');
      batchAttempt=null;
      const changes=(state.plan?.changes||[]).concat(registered.plan.changes);
      if(new Set(changes.map(c=>c.nodeId)).size!==changes.length)throw Error('Повторяющиеся предложения в пачках.');
      for(const change of registered.plan.changes)batchByNode.set(change.nodeId,batchIndex);
      emit({batch:registered.manifest,batchSkill:state.run.skill,plan:{changes}});
    }
    const plan=state.plan||{changes:[]};
    emit({status:plan.changes.length?'preview':'empty',plan,selected:plan.changes.filter(c=>c.category==='recommended').map(c=>c.nodeId)});
  }
  async function start(options={}){
    if(busy() || isBusy())return;
    if(state.pendingMutation){await recoverMutation();return;}
    const tracked=activity(onOperation,'layer-names-run');analysisActivity=tracked;let outcome='completed';
    const resume=!options.fresh && state.status==='error' && !state.result && state.batch;
    const revisionId=++revision,controller=new AbortController();abort=controller;
    if(!resume){batchByNode.clear();emit({status:'reading',snapshot:null,batch:null,batchSkill:null,batchIndex:0,batchChecked:0,plan:null,result:null,undoBlocked:false,run:null,diagnostics:null,diagnosticsAt:0,startedAt:Date.now(),selected:[],error:''});}
    else emit({status:state.batch.status==='capturing'?'reading':'planning',result:null,run:null,diagnostics:null,diagnosticsAt:0,startedAt:Date.now(),selected:[],error:''});
    try{
      if(!resume){
        const snapshot=await rpc('capture',{});if(revision!==revisionId)return;
        if(b.manifestValid(snapshot))emit({batch:snapshot,snapshot});
        else {
          if(!p.snapshotValid(snapshot))throw Error('Не удалось прочитать выделение. Повторите анализ.');
          emit({status:'planning',snapshot});
          const received=await analyse(snapshot,'layer-names-'+identity+'-'+revisionId,controller,revisionId,nodeIds=>rpc('read',{snapshotId:snapshot.snapshotId,nodeIds}));
          if(revision!==revisionId)return;
          emit({status:'registering'});
          const plan=await rpc('register',{snapshotId:snapshot.snapshotId,plan:received});if(revision!==revisionId)return;
          if(!p.planValid(plan,snapshot))throw Error('Предложения не прошли проверку. Повторите анализ.');
          emit({status:plan.changes.length?'preview':'empty',plan,selected:plan.changes.filter(c=>c.category==='recommended').map(c=>c.nodeId)});return;
        }
      }
      await runBatches(revisionId,controller);
    }catch(error){
      outcome=error.cancelled || error.code==='LAYER_NAMES_CANCELLED'?'cancelled':'failed';
      if(revision===revisionId)emit({status:'error',error:error.name==='AbortError'?'ApolloProxyControl не ответил вовремя. Проверьте состояние Proxy и повторите анализ.'
        : ['TypeError','SyntaxError'].includes(error.name)?'Не удалось связаться с ApolloProxyControl или прочитать его ответ. Проверьте подключение и версию Proxy, затем повторите анализ.':error.message});
    }finally{tracked?.finish(revision!==revisionId?'cancelled':outcome);if(analysisActivity===tracked)analysisActivity=null;if(revision===revisionId){abort=null;activeRun=null;}}
  }
  async function verifyBatch(result,operationId){
    while(result?.status==='verifying' && result.operationId===operationId){if(result.result)emit({result:result.result});result=await rpc('batch-verify',{sessionId:state.batch.sessionId,operationId});}
    if(result?.status!=='done' || result.operationId!==operationId || !Array.isArray(result.result?.changes) || typeof result.result.verified!=='boolean')throw Error('Исход записи неизвестен. Проверьте результат перед новым анализом.');
    return result.result;
  }
  async function recoverMutation(){
    const pending=state.pendingMutation;if(!pending)return;
    emit({status:pending.operation==='undo'?'undoing':'applying',recovering:true,error:''});
    try{const result=await verifyBatch(await rpc('batch-verify',{sessionId:pending.sessionId,operationId:pending.operationId}),pending.operationId);emit({status:pending.operation==='undo'?'undone':'done',pendingMutation:null,recovering:false,undoBlocked:false,result});}
    catch(error){if(error.nativeReply)emit({pendingMutation:null});emit({status:state.result?'done':'error',recovering:false,error:error.message});}
  }
  async function mutateBatch(operation){
    const sessionId=state.batch.sessionId,token=await validateBatch(operation),operationId='write-'+identity+'-'+(++sequence);
    emit({pendingMutation:{sessionId,operationId,operation}});
    try{
      const result=await verifyBatch(await rpc('batch-'+operation,{sessionId,token,operationId,...(operation==='apply'?{nodeIds:state.selected}:{})}),operationId);
      emit({pendingMutation:null});return result;
    }catch(error){
      // Recover observations by operation ID; never replay an unconfirmed write.
      try{const result=await verifyBatch(await rpc('batch-verify',{sessionId,operationId}),operationId);emit({pendingMutation:null});return result;}
      catch(recovery){if(recovery.nativeReply)emit({pendingMutation:null});throw error;}
    }
  }
  async function apply(){
    if(state.status!=='preview' || state.pendingMutation || !state.selected.length || isBusy())return;
    const tracked=activity(onOperation,'layer-names-apply');let outcome='completed';
    emit({status:'applying',error:'',undoBlocked:false});
    try{
      const result=state.batch?await mutateBatch('apply'):await rpc('apply',{snapshotId:state.snapshot.snapshotId,nodeIds:state.selected});
      if(!result || !Array.isArray(result.changes) || typeof result.verified!=='boolean')throw Error('Исход записи неизвестен. Проверьте слои и запустите новый анализ.');
      if(!result.verified)outcome='failed';
      emit({status:'done',result});
    }catch(error){outcome='failed';emit({status:state.result?'done':'error',error:error.message});}finally{tracked?.finish(outcome);}
  }
  async function undo(){
    if(!['done','undone'].includes(state.status) || state.pendingMutation || state.undoBlocked || !state.result?.verified || !(state.result.undoAvailable || state.status==='done' && state.result.changes.length) || isBusy())return;
    const tracked=activity(onOperation,'layer-names-undo');let outcome='completed';
    const previousStatus=state.status;
    emit({status:'undoing',error:''});
    try{const result=state.batch?await mutateBatch('undo'):await rpc('undo',{});if(!result?.verified)outcome='failed';emit({status:'undone',result});}catch(error){outcome='failed';emit({status:state.result?previousStatus:'error',undoBlocked:true,error:error.message});}finally{tracked?.finish(outcome);}
  }
  return {getState:()=>state,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},accept,busy,start,apply,undo,
    selection(message){
      const key=String(message.pageId||'')+':'+String(message.id||'');
      if(['reading','planning','reading-context','registering'].includes(state.status) && (!message.valid || selectionKey!==null && key!==selectionKey)){
        revision++;abort?.abort();void stopRemote(activeRun);activeRun=null;abort=null;emit({status:'error',selected:[],error:'Выделение изменилось. Повторите анализ.'});
      }
      selectionKey=key;emit({validSelection:message.valid===true});
    },
    refresh(){const available=!isBusy();if(state.available!==available)emit({available});},
    toggle(id){if(state.status==='preview' && state.plan.changes.some(c=>c.nodeId===id))emit({selected:state.selected.includes(id)?state.selected.filter(n=>n!==id):state.selected.concat(id)});},
    selectAll(selected){if(state.status==='preview')emit({selected:selected?state.plan.changes.map(c=>c.nodeId):[]});},
    cancelView(){if(!busy() && !state.pendingMutation){revision++;emit({status:'idle',snapshot:null,batch:null,batchSkill:null,plan:null,result:null,run:null,diagnostics:null,startedAt:0,error:'',selected:[]});}},
    cancel(){if(!['reading','planning','reading-context','registering'].includes(state.status))return Promise.resolve();revision++;abort?.abort();abort=null;const stopping=stopRemote(activeRun);activeRun=null;
      if(state.batch){if(batchAttempt)void rpc('batch-pause',{sessionId:state.batch.sessionId,attemptId:batchAttempt}).catch(()=>null);batchAttempt=null;emit({status:'error',error:'Анализ остановлен. Проверенные пачки сохранены.',selected:[]});}
      else emit({status:'idle',snapshot:null,plan:null,run:null,diagnostics:null,startedAt:0,error:'',selected:[]});return stopping;},
    async focus(id){try{if(state.batch){const batchIndex=batchByNode.get(id);await rpc('batch-focus',{sessionId:state.batch.sessionId,batchIndex,token:await validateBatch('focus',batchIndex),nodeId:id});}else await rpc('focus',{snapshotId:state.snapshot.snapshotId,nodeId:id});}catch(error){emit({status:'error',error:error.message});}}
  };
}
module.exports={createLayerNamesClient};
