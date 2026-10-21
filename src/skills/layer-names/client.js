const p = require('./run-protocol')(require('./protocol'));
const {createOpaqueId} = require('../../design-check/opaque-id');
function createLayerNamesClient({send,request=(url,options)=>fetch(url,options),endpoint='http://localhost:3001/skills/layer-names',isBusy=()=>false,onChange=()=>{}}) {
  const listeners=new Set(),pending=new Map(),identity=createOpaqueId();
  let sequence=0,revision=0,abort=null,activeRun=null,selectionKey=null;
  let state={status:'idle',snapshot:null,plan:null,result:null,run:null,selected:[],error:'',validSelection:false,available:true};
  const busy=()=>['reading','planning','reading-context','registering','applying','undoing'].includes(state.status);
  function emit(patch){state=Object.assign({},state,patch);for(const listener of listeners)listener();onChange();}
  function rpc(operation,payload){
    const requestId='layer-names-'+identity+'-'+(++sequence);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('Плагин не ответил. Обновите предложения перед применением.'));},15000);
      pending.set(requestId,{operation,resolve,reject,timer});send({type:'layer-names-request',schemaVersion:p.SCHEMA,requestId,operation,payload});
    });
  }
  function accept(message){
    if(message?.type!=='layer-names-result')return false;
    const ticket=pending.get(message.requestId);if(!ticket)return true;
    clearTimeout(ticket.timer);pending.delete(message.requestId);
    if(message.schemaVersion!==p.SCHEMA || message.operation!==ticket.operation)ticket.reject(Error('Ответ навыка несовместим. Повторите анализ.'));
    else if(message.error)ticket.reject(Error(message.error));else ticket.resolve(message.result);return true;
  }
  function errorMessage(code,status){
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
      const value=await response.json();if(!response.ok || value.success!==true)throw Error(errorMessage(value.code,response.status));return value.run;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }
  function stopRemote(ticket){return ticket ? api('/runs/'+ticket.runId+'/cancel',{requestId:ticket.requestId}).catch(()=>null) : Promise.resolve(null);}
  function pause(signal){return new Promise((resolve,reject)=>{
    const cancel=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(Object.assign(Error('aborted'),{name:'AbortError'}));};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},750);
    signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
  });}
  async function start(){
    if(busy() || isBusy())return;
    const revisionId=++revision,controller=new AbortController();abort=controller;let timer,ticket=null;
    emit({status:'reading',snapshot:null,plan:null,result:null,run:null,selected:[],error:''});
    try{
      const snapshot=await rpc('capture',{});if(revision!==revisionId)return;
      if(!p.snapshotValid(snapshot))throw Error('Не удалось прочитать выделение. Повторите анализ.');
      emit({status:'planning',snapshot});timer=setTimeout(()=>controller.abort(),930000);
      const requestId='layer-names-'+identity+'-'+revisionId;
      let run=await api('/runs',{schemaVersion:p.RUN_SCHEMA,wire:{version:p.WIRE_VERSION,sha256:p.WIRE_SHA256},requestId,snapshot},controller.signal);
      if(!p.runValid(run,snapshot,requestId))throw Error('Ответ агента несовместим. Обновите ApolloProxyControl и повторите анализ.');
      ticket={runId:run.runId,requestId};
      if(revision!==revisionId){void stopRemote(ticket);return;}activeRun=ticket;
      for(;;){
        if(!p.runValid(run,snapshot,requestId,ticket.runId))throw Error('Ответ запуска несовместим. Повторите анализ.');
        if(revision!==revisionId)return;
        emit({status:run.status==='awaiting-context'?'reading-context':'planning',run});
        if(run.status==='failed' || run.status==='cancelled')throw Error(errorMessage(run.error.code));
        if(run.status==='completed')break;
        if(run.status==='awaiting-context'){
          const context=await rpc('read',{snapshotId:snapshot.snapshotId,nodeIds:run.pending.nodeIds});if(revision!==revisionId)return;
          if(!p.contextValid(context,snapshot,run.pending.nodeIds))throw Error('Контекст слоёв несовместим. Повторите анализ.');
          run=await api('/runs/'+ticket.runId+'/context',{requestId,callId:run.pending.callId,context},controller.signal);
        }else{
          await pause(controller.signal);if(revision!==revisionId)return;
          run=await api('/runs/'+ticket.runId+'?requestId='+encodeURIComponent(requestId),undefined,controller.signal);
        }
      }
      emit({status:'registering'});
      const plan=await rpc('register',{snapshotId:snapshot.snapshotId,plan:run.plan});if(revision!==revisionId)return;
      if(!p.planValid(plan,snapshot))throw Error('Предложения не прошли проверку. Повторите анализ.');
      emit({status:plan.changes.length?'preview':'empty',plan,selected:plan.changes.filter(c=>c.category==='recommended').map(c=>c.nodeId)});
    }catch(error){
      if(ticket)void stopRemote(ticket);
      if(revision===revisionId)emit({status:'error',error:error.name==='AbortError'?'ApolloProxyControl не ответил вовремя. Проверьте состояние Proxy и повторите анализ.'
        : ['TypeError','SyntaxError'].includes(error.name)?'Не удалось связаться с ApolloProxyControl или прочитать его ответ. Проверьте подключение и версию Proxy, затем повторите анализ.':error.message});
    }finally{clearTimeout(timer);if(revision===revisionId){abort=null;activeRun=null;}}
  }
  async function apply(){
    if(state.status!=='preview' || !state.selected.length || isBusy())return;
    emit({status:'applying',error:''});
    try{
      const result=await rpc('apply',{snapshotId:state.snapshot.snapshotId,nodeIds:state.selected});
      if(!result || !Array.isArray(result.changes) || typeof result.verified!=='boolean')throw Error('Исход записи неизвестен. Проверьте слои и запустите новый анализ.');
      emit({status:'done',result});
    }catch(error){emit({status:'error',error:error.message});}
  }
  async function undo(){
    if(state.status!=='done' || !state.result?.verified || !state.result.changes.length || isBusy())return;
    emit({status:'undoing',error:''});
    try{const result=await rpc('undo',{});emit({status:'undone',result});}catch(error){emit({status:'error',error:error.message});}
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
    cancelView(){if(!busy()){revision++;emit({status:'idle',snapshot:null,plan:null,result:null,run:null,error:'',selected:[]});}},
    cancel(){if(!['reading','planning','reading-context','registering'].includes(state.status))return Promise.resolve();revision++;abort?.abort();abort=null;const stopping=stopRemote(activeRun);activeRun=null;emit({status:'idle',snapshot:null,plan:null,run:null,error:'',selected:[]});return stopping;},
    async focus(id){try{await rpc('focus',{snapshotId:state.snapshot.snapshotId,nodeId:id});}catch(error){emit({status:'error',error:error.message});}}
  };
}
module.exports={createLayerNamesClient};
