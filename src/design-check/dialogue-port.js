const BUSY_MESSAGE = 'Apollo ещё обрабатывает предыдущий запрос. Вопрос сохранён — отправь его, когда агент освободится.';
function busyError() { return Object.assign(new Error(BUSY_MESSAGE), { code: 'APOLLO_AGENT_BUSY' }); }
function dialogueCancellation(body) {
  return body?.capabilities?.parallelDialogue === true && typeof body.dialogue?.busy === 'boolean' && body.dialogue.cancelScope === 'server-request';
}
function proxyBusy(body) {
  if (dialogueCancellation(body)) return body.dialogue.busy;
  const values = [body.agent?.busy, body.codex?.busy, body.generation?.busy];
  return values.includes(true) ? true : values.includes(false) ? false : null;
}
// Existing /analyze wire contract observed in v3 and Proxy. Opt-in only: no network on mount.
function createExistingDialoguePort({ request, endpoint, createSessionId, readStatus }) {
  if (typeof request !== 'function' || typeof createSessionId !== 'function') throw new TypeError('Explicit request and session identity ports are required.');
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/analyze' || url.search || url.hash) throw new TypeError('Expected an explicit /analyze endpoint.');
  let sessionId = null;
  function session() {
    if (!sessionId) {
      sessionId = createSessionId();
      if (typeof sessionId !== 'string' || !/^[\p{Letter}\p{Number}._-]{1,180}$/u.test(sessionId)) throw new TypeError('Invalid dialogue session identity.');
    }
    return sessionId;
  }
  return { cancelScope: 'client-only', resetSession() { sessionId = null; },
    async status({ signal } = {}) {
      if (readStatus) return readStatus({ signal });
      const response = await request(new URL('/health', url).href, { method: 'GET', signal });
      const body = await response.json();
      return { available: response.ok && body.ok === true, version: typeof body.proxy?.version === 'string' ? body.proxy.version : null, busy: proxyBusy(body), ...(dialogueCancellation(body) ? { cancelScope: 'server-request' } : {}) };
    },
    async send({ source, question, dialogue, dialoguePlatform, context, signal }) {
      if (!['langflow', 'codex'].includes(source) || typeof question !== 'string' || !question.trim() || question.length > 8000
        || dialoguePlatform !== undefined && !['Desktop', 'MobileWeb', 'iOS', 'Android'].includes(dialoguePlatform)
        || context !== null || !Array.isArray(dialogue) || dialogue.length > (['iOS','Android'].includes(dialoguePlatform)?30:12)
        || dialogue.some(entry => !['user', 'assistant'].includes(entry.role) || typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 8000)) throw new TypeError('Unsupported dialogue input; frozen audit context requires a separate v4 protocol.');
      if (dialoguePlatform !== undefined) {
        const health = await request(new URL('/health', url).href, { method: 'GET', signal });
        const state = await health.json();
        if (!health.ok || state.ok !== true || state.capabilities?.dialoguePlatformRouting !== true)
          throw new Error('Для выбора библиотеки по платформе обнови Apollo Proxy и повтори запрос.');
        if (proxyBusy(state) === true) throw busyError();
      }
      const text = JSON.stringify({ schemaVersion: 1, mode: 'design-dialogue', question: question.trim(),
        context: { selection: null, finding: null, auditReport: null, componentContext: null } });
      const response = await request(url.href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ component: 'apollo-agent-report', action: 'user-question', session_id: session(), source,
          dialoguePlatform, dialogue: dialogue.map(entry => ({ role: entry.role, text: entry.text })), text }) });
      const body = await response.json();
      if (!response.ok || body.success !== true) {
        if (response.status === 429 && (body.code === 'APOLLO_AGENT_BUSY' || /^AI-агент уже обрабатывает другой запрос Apollo\./u.test(body.error || ''))) throw busyError();
        throw new Error(body.error || `Apollo proxy error ${response.status}`);
      }
      if (dialoguePlatform !== undefined && body.dialogueLibrary !== (['iOS', 'Android'].includes(dialoguePlatform) ? 'abm' : 'ab'))
        throw new Error('Apollo Proxy не подтвердил библиотеку выбранной платформы. Обнови Proxy и повтори запрос.');
      if (body.source !== undefined && body.source !== source) throw new Error('Источник ответа агента не совпал с запросом.');
      if (body.provider !== undefined && !['codex', 'claude', 'alfagen'].includes(body.provider)) throw new Error('Прокси вернул неизвестный AI-агент.');
      if (typeof body.result !== 'string' || !body.result.trim()) throw new Error('Агент вернул пустой ответ.');
      let answerBlocks;
      if (body.answerBlocks !== undefined) {
        if (!Array.isArray(body.answerBlocks) || !body.answerBlocks.length || body.answerBlocks.length > 256
          || body.answerBlocks.some(block => !block || !['text','guide'].includes(block.kind) || typeof block.text !== 'string' || !block.text.trim()
            || block.kind === 'guide' && (!['hig','material2','material3'].includes(block.family) || block.question !== undefined && (typeof block.question !== 'string' || block.question.length > 8000))
            || block.kind === 'text' && block.questionHeading !== undefined && block.questionHeading !== true)
          || body.answerBlocks.map(block => block.text).join('\n\n') !== body.result)
          throw new Error('Apollo Proxy вернул некорректные блоки ответа. Повтори запрос.');
        answerBlocks = body.answerBlocks.map(block => block.kind === 'guide'
          ? {kind:'guide',family:block.family,text:block.text, ...(block.question !== undefined ? {question:block.question} : {})} : {kind:'text',text:block.text, ...(block.questionHeading ? {questionHeading:true} : {})});
      }
      return { dialogueLibrary: ['ab','abm'].includes(body.dialogueLibrary) ? body.dialogueLibrary : undefined, answerBlocks, text: body.result, source: body.source || source, returnedSource: body.source ?? null, provider: body.provider ?? null, knowledgeRelease: body.knowledgeRelease ?? null };
    } };
}
module.exports = { createExistingDialoguePort, proxyBusy, dialogueCancellation };
