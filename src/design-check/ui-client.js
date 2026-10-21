const { UI_SCHEMA, SOURCE_SCHEMA, validSource } = require("./ui-protocol");
const { PREFERENCE_VERSION } = require("./definitions");
const { createOpaqueId } = require("./opaque-id");
function createUiClient(send, { timeoutMs = 10000 } = {}) {
  // A reload has a different identity; an old main reply cannot match a new UI request.
  const identity = createOpaqueId();
  const pending = new Map(); let sequence = 0;
  function request(operation, payload) {
    const requestId = `design-check-ui-${identity}-${++sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Плагин не ответил на запрос настройки интерфейса.')); }, timeoutMs);
      pending.set(requestId, { operation, payload, resolve, reject, timer });
      try { send({ type: 'design-check-ui-request', schemaVersion: UI_SCHEMA, requestId, operation, payload }); }
      catch (error) { clearTimeout(timer); pending.delete(requestId); reject(error); }
    });
  }
  return { accept(message) {
    if (message?.type !== 'design-check-ui-result') return false;
    const ticket = pending.get(message.requestId);
    if (!ticket) return true; // Late replies cannot change current UI preferences.
    clearTimeout(ticket.timer); pending.delete(message.requestId);
    const keys = Object.keys(message).sort().join(',');
    if (message.schemaVersion !== UI_SCHEMA || message.operation !== ticket.operation
      || !['error,operation,requestId,schemaVersion,type', 'operation,requestId,result,schemaVersion,type'].includes(keys))
      ticket.reject(new Error('Ответ настройки интерфейса несовместим.'));
    else if (typeof message.error === 'string') ticket.reject(new Error(message.error));
    else {
      const result = message.result;
      const valid = ticket.operation === 'resize' ? result && Object.keys(result).sort().join(',') === 'height,width'
        && result.width === (ticket.payload.compact ? 400 : 800) && result.height === 860
        : ticket.operation === 'agent-source-get' && result === null || validSource(result);
      if (valid) ticket.resolve(result); else ticket.reject(new Error('Ответ настройки интерфейса содержит неверные значения.'));
    }
    return true;
  }, resize: compact => request('resize', { compact }),
  preferences: {
    async load() { const value = await request('agent-source-get', {}); return value === null ? null
      : { schemaVersion: PREFERENCE_VERSION, settings: {}, agentSource: value.source }; },
    save(value) { return request('agent-source-set', { schemaVersion: SOURCE_SCHEMA, source: value.agentSource }); },
  } };
}
module.exports = { createUiClient };
