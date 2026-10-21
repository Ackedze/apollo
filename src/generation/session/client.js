const {SESSION_SCHEMA,BRIDGE_SCHEMA,validSession} = require("./protocol");
const {createOpaqueId} = require("../../design-check/opaque-id");
function createSessionClient(send,{timeoutMs=10000}={}) {
  const identity=createOpaqueId(), pending=new Map(); let sequence=0;
  function request(operation,payload) {
    if (operation === 'save' && !validSession(payload)) return Promise.reject(Error('GENERATION_SESSION_INVALID'));
    const requestId='generation-session-'+identity+'-'+(++sequence);
    return new Promise((resolve,reject) => {
      const timer=setTimeout(() => { pending.delete(requestId);reject(Error('GENERATION_SESSION_TIMEOUT')); },timeoutMs);
      pending.set(requestId,{operation,resolve,reject,timer});
      try { send({type:'generation-session-request',schemaVersion:BRIDGE_SCHEMA,requestId,operation,payload}); }
      catch { clearTimeout(timer);pending.delete(requestId);reject(Error('GENERATION_SESSION_STORAGE_FAILED')); }
    });
  }
  return { load: () => request('load',{}), save: value => request('save',value), accept(message) {
    if (message?.type !== 'generation-session-result') return false;
    const ticket=pending.get(message.requestId);if(!ticket)return true;
    pending.delete(message.requestId);clearTimeout(ticket.timer);
    const keys=Object.keys(message).sort().join(',');
    if(message.schemaVersion!==BRIDGE_SCHEMA || message.operation!==ticket.operation
      || !['error,operation,requestId,schemaVersion,type','operation,requestId,result,schemaVersion,type'].includes(keys)) ticket.reject(Error('GENERATION_SESSION_INVALID'));
    else if(message.error) ticket.reject(Error(['GENERATION_SESSION_INVALID','GENERATION_SESSION_STORAGE_FAILED'].includes(message.error)?message.error:'GENERATION_SESSION_INVALID'));
    else if(ticket.operation==='save'?message.result===true:message.result===null||validSession(message.result)) ticket.resolve(message.result);
    else ticket.reject(Error('GENERATION_SESSION_INVALID'));
    return true;
  }};
}
module.exports={SESSION_SCHEMA,createSessionClient};
