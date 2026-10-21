// UI preferences only. This protocol never carries audit context or rule facts.
const UI_SCHEMA = 'apollo.design-check-ui-bridge.v1';
const SOURCE_SCHEMA = 'apollo.design-check-agent-source.v1';
const SOURCE_KEY = 'apollo-v4-agent-source';
const sources = ['langflow', 'codex'];
const closed = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const validSource = value => closed(value, ['schemaVersion', 'source']) && value.schemaVersion === SOURCE_SCHEMA && sources.includes(value.source);
function validRequest(message) {
  if (!closed(message, ['type', 'schemaVersion', 'requestId', 'operation', 'payload'])
    || message.type !== 'design-check-ui-request' || message.schemaVersion !== UI_SCHEMA
    || typeof message.requestId !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(message.requestId)) return false;
  if (message.operation === 'agent-source-get') return closed(message.payload, []);
  if (message.operation === 'agent-source-set') return validSource(message.payload);
  return message.operation === 'resize' && closed(message.payload, ['compact']) && typeof message.payload.compact === 'boolean';
}
function createUiMainBridge({ storage, resize, post }) {
  let queue = Promise.resolve();
  return { accept(message) {
    if (message?.type !== 'design-check-ui-request') return false;
    if (!validRequest(message)) {
      if (typeof message.requestId === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(message.requestId))
        post({ type: 'design-check-ui-result', schemaVersion: UI_SCHEMA, requestId: message.requestId,
          operation: message.operation, error: 'Неподдерживаемый запрос настроек интерфейса.' });
      return true;
    }
    queue = queue.catch(() => {}).then(async () => {
      let result = null;
      if (message.operation === 'agent-source-get') {
        result = await storage.getAsync(SOURCE_KEY);
        if (result == null) result = null;
        else if (!validSource(result)) throw new Error('Сохранённый источник чата несовместим. Выберите источник вручную.');
      } else if (message.operation === 'agent-source-set') {
        await storage.setAsync(SOURCE_KEY, message.payload);
        result = message.payload;
      } else {
        const width = message.payload.compact ? 400 : 800, height = 860;
        resize(width, height); result = { width, height };
      }
      post({ type: 'design-check-ui-result', schemaVersion: UI_SCHEMA, requestId: message.requestId, operation: message.operation, result });
    }).catch(error => post({ type: 'design-check-ui-result', schemaVersion: UI_SCHEMA, requestId: message.requestId,
      operation: message.operation, error: error.message || 'Не удалось применить настройку интерфейса.' }));
    return true;
  }, flush: () => queue };
}
module.exports = { UI_SCHEMA, SOURCE_SCHEMA, SOURCE_KEY, validSource, validRequest, createUiMainBridge };
