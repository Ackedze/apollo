const p = require('./protocol');
const {createOpaqueId} = require('../../design-check/opaque-id');
function createLayerNamesClient({send,request=(url,options)=>fetch(url,options),endpoint='http://localhost:3001/skills/layer-names/plan',isBusy=()=>false,onChange=()=>{}}) {
  const listeners = new Set(), pending = new Map(), identity = createOpaqueId();
  let sequence = 0, revision = 0, abort = null;
  let state = {status:'idle',snapshot:null,plan:null,result:null,selected:[],error:'',validSelection:false,available:true};
  const busy = () => ['reading','planning','registering','applying','undoing'].includes(state.status);
  function emit(patch) { state = Object.assign({},state,patch); for (const listener of listeners) listener(); onChange(); }
  function rpc(operation,payload) {
    const requestId = 'layer-names-' + identity + '-' + (++sequence);
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => { pending.delete(requestId); reject(Error('Плагин не ответил. Обновите предложения перед применением.')); },15000);
      pending.set(requestId,{operation,resolve,reject,timer});
      send({type:'layer-names-request',schemaVersion:p.SCHEMA,requestId,operation,payload});
    });
  }
  function accept(message) {
    if (message?.type !== 'layer-names-result') return false;
    const ticket = pending.get(message.requestId); if (!ticket) return true;
    clearTimeout(ticket.timer); pending.delete(message.requestId);
    if (message.schemaVersion !== p.SCHEMA || message.operation !== ticket.operation) ticket.reject(Error('Ответ навыка несовместим. Повторите анализ.'));
    else if (message.error) ticket.reject(Error(message.error)); else ticket.resolve(message.result);
    return true;
  }
  async function start() {
    if (busy() || isBusy()) return;
    const run = ++revision;
    emit({status:'reading',snapshot:null,plan:null,result:null,selected:[],error:''});
    try {
      const snapshot = await rpc('capture',{}); if (revision !== run) return;
      if (!p.snapshotValid(snapshot)) throw Error('Не удалось прочитать выделение. Повторите анализ.');
      emit({status:'planning',snapshot}); abort = new AbortController();
      // The Proxy's default CLI wall deadline is 15 minutes; allow its response to arrive.
      const timer = setTimeout(()=>abort?.abort(),15*60*1000+30000);
      let response, body;
      try {
        response = await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:'layer-names-'+identity+'-'+run,snapshot}),signal:abort.signal});
        body = await response.json();
      } finally { clearTimeout(timer); }
      if (revision !== run) return;
      if (!response.ok || body.success !== true) throw Error(body.code === 'LAYER_NAMES_BUSY' || response.status === 429 ? 'Агент занят другим запросом. Повторите запуск чуть позже.'
        : response.status === 502 ? 'Агент завершил анализ с ошибкой. Повторите попытку позже.'
        : response.status === 504 ? 'Время выполнения анализа истекло. Повторите попытку позже.'
        : 'Не удалось получить предложения. Проверьте подключение ApolloProxyControl и повторите запуск.');
      if (body.snapshotId !== snapshot.snapshotId || body.requestId !== 'layer-names-'+identity+'-'+run || !p.planValid(body.plan,snapshot)) throw Error('Ответ агента несовместим. Повторите анализ.');
      emit({status:'registering'});
      const plan = await rpc('register',{snapshotId:snapshot.snapshotId,plan:body.plan}); if (revision !== run) return;
      if (!p.planValid(plan,snapshot)) throw Error('Предложения не прошли проверку. Повторите анализ.');
      emit({status:plan.changes.length ? 'preview' : 'empty',plan,selected:plan.changes.filter(c => c.category === 'recommended').map(c => c.nodeId)});
    } catch (error) {
      if (revision === run) {
        const message = error.name === 'AbortError' ? 'ApolloProxyControl не ответил вовремя. Проверьте состояние Proxy и повторите анализ.'
          : ['TypeError','SyntaxError'].includes(error.name) ? 'Не удалось связаться с ApolloProxyControl или прочитать его ответ. Проверьте подключение и версию Proxy, затем повторите анализ.' : error.message;
        emit({status:'error',error:message});
      }
    }
    finally { if (revision === run) abort = null; }
  }
  async function apply() {
    if (state.status !== 'preview' || !state.selected.length || isBusy()) return;
    emit({status:'applying',error:''});
    try {
      const result = await rpc('apply',{snapshotId:state.snapshot.snapshotId,nodeIds:state.selected});
      if (!result || !Array.isArray(result.changes) || typeof result.verified !== 'boolean') throw Error('Исход записи неизвестен. Проверьте слои и запустите новый анализ.');
      emit({status:'done',result});
    } catch (error) { emit({status:'error',error:error.message}); }
  }
  async function undo() {
    if (state.status !== 'done' || !state.result?.verified || !state.result.changes.length || isBusy()) return;
    emit({status:'undoing',error:''});
    try { const result = await rpc('undo',{}); emit({status:'undone',result}); }
    catch (error) { emit({status:'error',error:error.message}); }
  }
  return {getState:()=>state,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},accept,busy,start,apply,undo,
    selection(message){emit({validSelection:message.valid===true});},
    refresh(){const available=!isBusy();if(state.available!==available)emit({available});},
    toggle(id){if(state.status==='preview'&&state.plan.changes.some(c=>c.nodeId===id))emit({selected:state.selected.includes(id)?state.selected.filter(n=>n!==id):state.selected.concat(id)});},
    cancelView(){if(!busy()){revision++;emit({status:'idle',snapshot:null,plan:null,result:null,error:'',selected:[]});}},
    cancel(){if(!['reading','planning','registering'].includes(state.status))return;revision++;abort?.abort();abort=null;emit({status:'idle',snapshot:null,plan:null,error:'',selected:[]});},
    async focus(id){try{await rpc('focus',{snapshotId:state.snapshot.snapshotId,nodeId:id});}catch(error){emit({status:'error',error:error.message});}}
  };
}
module.exports = {createLayerNamesClient};
