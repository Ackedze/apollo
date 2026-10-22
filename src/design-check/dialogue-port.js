// Existing /analyze wire contract observed in v3 and Proxy. Opt-in only: no network on mount.
function createExistingDialoguePort({ request, endpoint, createSessionId }) {
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
    async status() {
      const response = await request(new URL('/health', url).href, { method: 'GET' });
      const body = await response.json();
      return { available: response.ok && body.ok === true, version: typeof body.proxy?.version === 'string' ? body.proxy.version : null };
    },
    async send({ source, question, dialogue, context, signal }) {
      if (!['langflow', 'codex'].includes(source) || typeof question !== 'string' || !question.trim() || question.length > 8000
        || context !== null || !Array.isArray(dialogue) || dialogue.length > 12
        || dialogue.some(entry => !['user', 'assistant'].includes(entry.role) || typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 8000)) throw new TypeError('Unsupported dialogue input; frozen audit context requires a separate v4 protocol.');
      const text = JSON.stringify({ schemaVersion: 1, mode: 'design-dialogue', question: question.trim(),
        context: { selection: null, finding: null, auditReport: null, componentContext: null } });
      const response = await request(url.href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ component: 'apollo-agent-report', action: 'user-question', session_id: session(), source,
          dialogue: dialogue.map(entry => ({ role: entry.role, text: entry.text })), text }) });
      const body = await response.json();
      if (!response.ok || body.success !== true) throw new Error(body.error || `Apollo proxy error ${response.status}`);
      if (body.source !== undefined && body.source !== source) throw new Error('Источник ответа агента не совпал с запросом.');
      if (body.provider !== undefined && !['codex', 'claude', 'alfagen'].includes(body.provider)) throw new Error('Прокси вернул неизвестный AI-агент.');
      if (typeof body.result !== 'string' || !body.result.trim()) throw new Error('Агент вернул пустой ответ.');
      return { text: body.result, source: body.source || source, returnedSource: body.source ?? null, provider: body.provider ?? null, knowledgeRelease: body.knowledgeRelease ?? null };
    } };
}
module.exports = { createExistingDialoguePort };
