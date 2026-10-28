'use strict';
const p = require('./protocol');
const {createReglyphEngine} = require('./engine');
function createReglyphBridge({api, post, isBusy = () => false, onMutation = () => {}, catalogs, detection}) {
  const data = catalogs || {default:require('./default.json'),services:require('./services.json')};
  let context = null, contextRevision = -1, active = null, mutated = false;
  const engine = createReglyphEngine({api, catalogs:data, detection:detection || require('./detection.json'),
    post:event => post({type:'reglyph-event',schemaVersion:p.SCHEMA,revision:active ? active.revision : contextRevision,requestId:active ? active.requestId : null,event}),
    assertActive:() => {
      if (!active || active.revision !== contextRevision || !p.supported(context)) throw Error('Контекст изменился. Проверьте иконки ещё раз.');
      if (isBusy()) throw Error('Дождитесь завершения другой операции Apollo.');
    },
    onMutation:() => { mutated = true; }
  });
  function accept(message) {
    if (message?.type === 'reglyph-context') {
      if (message.schemaVersion !== p.SCHEMA || !p.contextValid(message.context) || !Number.isSafeInteger(message.revision) || message.revision <= contextRevision) return true;
      context = {channelId:message.context.channelId,pickerLabel:message.context.pickerLabel};
      contextRevision = message.revision;
      engine.invalidate();
      return true;
    }
    if (message?.type !== 'reglyph-request') return false;
    const reply = error => post({type:'reglyph-result',schemaVersion:p.SCHEMA,requestId:message.requestId,revision:message.revision,error:error || null});
    if (message.schemaVersion !== p.SCHEMA || typeof message.requestId !== 'string' || !/^reglyph-[a-zA-Z0-9-]{1,100}$/.test(message.requestId) || !p.OPERATIONS.has(message.operation) || !message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload)) {
      reply('Параметры навыка несовместимы. Обновите Apollo.'); return true;
    }
    if (!p.supported(context)) { reply('Навык доступен для АБМ: выберите iOS или Android.'); return true; }
    if (message.revision !== contextRevision) { reply('Контекст изменился. Проверьте иконки ещё раз.'); return true; }
    if (active || isBusy()) { reply('Дождитесь завершения другой операции Apollo.'); return true; }
    active = {requestId:message.requestId,revision:message.revision,operation:message.operation};
    mutated = false;
    const command = Object.assign({}, message.payload, {type:message.operation});
    const finish = error => {
      active = null;
      if (mutated) { mutated = false; onMutation(); }
      reply(error);
    };
    void engine.handle(command).then(() => finish()).catch(error => finish(error.message));
    return true;
  }
  return {accept,busy:() => active !== null && !['preview','icon-preview','flush-previews','clear-preview-cache'].includes(active.operation),selectionChanged:() => engine.selectionChanged(),invalidate:() => engine.invalidate()};
}
module.exports = {createReglyphBridge};
