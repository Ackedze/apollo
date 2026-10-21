// Persist draft content only; restored documents never carry execution evidence.
const SESSION_SCHEMA = 'apollo.generation-chat-session.v1';
const BRIDGE_SCHEMA = 'apollo.generation-chat-storage.v1';
const STORAGE_KEY = 'apollo-v4-generation-chat';
const MAX_BYTES = 2 * 1024 * 1024;
const closed = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v,k));
function validJson(value) {
  let count = 0;
  function visit(v, depth) {
    if (++count > 200000 || depth > 32) return false;
    if (v === null || typeof v === 'boolean') return true;
    if (typeof v === 'number') return Number.isFinite(v);
    if (typeof v === 'string') return v.length <= MAX_BYTES;
    if (Array.isArray(v)) return v.every(item => visit(item,depth+1));
    return v && typeof v === 'object' && Object.keys(v).every(k => !['__proto__','constructor','prototype'].includes(k) && visit(v[k],depth+1));
  }
  return visit(value,0);
}
function validSession(v) {
  try {
    const json = JSON.stringify(v);
    // Count UTF-8 without TextEncoder, which is absent in Figma's main sandbox.
    if (typeof json !== 'string' || json.length > MAX_BYTES || encodeURIComponent(json).replace(/%[0-9A-F]{2}/g,'x').length > MAX_BYTES) return false;
    return (closed(v,['schemaVersion','conversation','composer','platform','viewport','dirty'])||closed(v,['schemaVersion','conversation','composer','platform','viewport','dirty','generationMethod'])&&['mcp','built-in'].includes(v.generationMethod)) && v.schemaVersion === SESSION_SCHEMA
      && closed(v.conversation,['messages','draft']) && Array.isArray(v.conversation.messages) && v.conversation.messages.length <= 512
      && v.conversation.messages.every(m => (closed(m,['role','text']) || closed(m,['role','text','spec']))
        && ['user','assistant'].includes(m.role) && typeof m.text === 'string' && m.text.length <= 12000
        && (!Object.prototype.hasOwnProperty.call(m,'spec') || m.role === 'assistant' && m.spec && typeof m.spec === 'object' && !Array.isArray(m.spec)
          && Array.isArray(m.spec.unresolved) && m.spec.unresolved.every(s => typeof s === 'string' && s.length <= 2048)
          && (m.spec.capabilityGaps === undefined || Array.isArray(m.spec.capabilityGaps) && m.spec.capabilityGaps.every(g => g && typeof g.code === 'string' && typeof g.message === 'string'))))
      && typeof v.composer === 'string' && v.composer.length <= 12000 && ['desktop','mobile-web'].includes(v.platform)
      && closed(v.viewport,['width','height']) && [v.viewport.width,v.viewport.height].every(s => typeof s === 'string' && s.length <= 16)
      && typeof v.dirty === 'boolean' && validJson(v);
  } catch { return false; }
}
function createSessionBridge({storage,post}) {
  let queue = Promise.resolve();
  return { accept(message) {
    if (message?.type !== 'generation-session-request') return false;
    const reply = value => post(Object.assign({type:'generation-session-result',schemaVersion:BRIDGE_SCHEMA,requestId:message.requestId,operation:message.operation},value));
    if (!closed(message,['type','schemaVersion','requestId','operation','payload']) || message.schemaVersion !== BRIDGE_SCHEMA
      || typeof message.requestId !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(message.requestId)
      || !(message.operation === 'load' && closed(message.payload,[]) || message.operation === 'save' && validSession(message.payload))) {
      if (typeof message.requestId === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(message.requestId)) reply({error:'GENERATION_SESSION_INVALID'});
      return true;
    }
    const payload = JSON.parse(JSON.stringify(message.payload));
    queue = queue.catch(() => {}).then(async () => {
      if (message.operation === 'load') {
        const result = await storage.getAsync(STORAGE_KEY);
        if (result != null && !validSession(result)) { reply({error:'GENERATION_SESSION_INVALID'}); return; }
        reply({result:result == null ? null : result});
      } else { await storage.setAsync(STORAGE_KEY,payload); reply({result:true}); }
    }).catch(() => reply({error:'GENERATION_SESSION_STORAGE_FAILED'}));
    return true;
  }, flush: () => queue };
}
module.exports = {SESSION_SCHEMA,BRIDGE_SCHEMA,STORAGE_KEY,MAX_BYTES,validSession,createSessionBridge};
