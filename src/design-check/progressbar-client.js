const { createOpaqueId } = require('./opaque-id');
const { PILOT, CAPTURE_SCHEMA, validPreparation, validResult } = require('./progressbar-protocol');
const messages = {
  capture: 'Читаем выбранную область и скриншот…', prepare: 'Подключаем нормы компонентов…', verify: 'Проверяем актуальность макета…',
  running: 'Агент проверяет применение компонентов…', complete: 'Агентская проверка завершена.', stale: 'Макет изменился. Повторите проверку.',
};
function createProgressBarClient({ send, request, endpoint, now = Date.now, pollMs = 500, nativeTimeoutMs = 30000 }) {
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || !['localhost','127.0.0.1'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/v1/analyze/codex/runs') throw Error('PROGRESSBAR_ENDPOINT_INVALID');
  const identity = createOpaqueId(), pending = new Map(), listeners = new Set();
  let sequence = 0, generation = 0, capture = null, abort = null, disposed = false;
  let state = { phase: 'idle', busy: false, message: '', error: '', report: null, capture: null };
  const emit = patch => { if (!disposed) { state = Object.assign({}, state, patch); for (const listener of listeners) listener(); } };
  function native(operation, captureId = null, nodeId = null) {
    const requestId = 'progressbar:' + identity + ':' + ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(requestId); reject(Error('PROGRESSBAR_NATIVE_TIMEOUT')); }, nativeTimeoutMs);
      pending.set(requestId, { operation, timer, resolve, reject });
      try { send({ type: 'progressbar-native-request', requestId, operation, captureId, nodeId }); }
      catch (error) { clearTimeout(timer); pending.delete(requestId); reject(error); }
    });
  }
  function invalidate() {
    generation++; abort?.abort();
    for (const ticket of pending.values()) { clearTimeout(ticket.timer); ticket.reject(Error('PROGRESSBAR_CAPTURE_STALE')); }
    pending.clear();
    emit({ phase: 'stale', busy: false, message: messages.stale, error: '', report: state.report });
  }
  async function json(address, options, signal) {
    const response = await request(address, Object.assign({}, options, { signal }));
    const value = await response.json();
    if (!response.ok || value?.success !== true) throw Error(value?.code || value?.error || 'PROGRESSBAR_PROXY_FAILED');
    return value;
  }
  async function start() {
    if (disposed || state.busy) return false;
    const ticket = ++generation; abort = new AbortController(); const signal = abort.signal, started = now(), deadline = started + 150000;
    const stages = {}; let currentStage = null, stageStarted = started;
    const finishStage = () => { const at = now(); if (currentStage) stages[currentStage] = (stages[currentStage] || 0) + Math.max(0, at - stageStarted); stageStarted = at; };
    capture = null;
    const guard = () => { if (disposed || generation !== ticket || signal.aborted || now() >= deadline) throw Error('PROGRESSBAR_CAPTURE_STALE'); };
    const phase = key => { guard(); finishStage(); currentStage = key; emit({ phase: key, busy: true, message: messages[key], error: '' }); };
    let deadlineTimer;
    try {
      deadlineTimer = setTimeout(() => { if (generation === ticket) invalidate(); }, 150000);
      phase('capture'); const observed = await native('capture'); guard();
      if (observed?.schemaVersion !== CAPTURE_SCHEMA || observed.complete !== true || !Array.isArray(observed.nodes) || !observed.nodes.length) throw Error('PROGRESSBAR_CAPTURE_INCOMPLETE');
      capture = observed; emit({ capture: observed }); phase('prepare');
      const report = { reportKind: 'apollo-pattern-audit-report', pilot: PILOT, reportId: observed.captureId, phase: 'prepare', capture: observed, sourcePin: null };
      const prepared = (await json(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report }) }, signal)).preparation; guard();
      if (!validPreparation(prepared, observed)) throw Error('PATTERN_PREPARATION_INVALID');
      phase('verify'); if (await native('verify', observed.captureId) !== true) throw Error('PROGRESSBAR_CAPTURE_STALE'); guard();
      report.phase = 'run'; report.sourcePin = prepared.sourcePin; phase('running');
      let run = (await json(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report }) }, signal)).run; guard();
      if (!/^run_[a-f0-9-]+$/.test(run?.id)) throw Error('PROGRESSBAR_RUN_INVALID');
      const runId = run.id;
      while (run.status !== 'completed') {
        if (!['queued','running'].includes(run.status)) throw Error(run.error?.code || 'PROGRESSBAR_AGENT_FAILED');
        await new Promise(resolve => setTimeout(resolve, pollMs)); guard();
        run = (await json(endpoint + '/' + runId, {}, signal)).run; guard();
        if (run?.id !== runId) throw Error('PROGRESSBAR_RUN_INVALID');
      }
      const result = run.validation;
      if (!validResult(result, observed, prepared)) throw Error('PATTERN_RESULT_INVALID');
      phase('verify'); if (await native('verify', observed.captureId) !== true) throw Error('PROGRESSBAR_CAPTURE_STALE'); guard();
      finishStage();
      emit({ phase: 'complete', busy: false, message: messages.complete, error: '', report: Object.assign({}, result, { timings: { totalMs: Math.max(0, now() - started), stagesMs: stages } }), capture: observed }); return true;
    } catch (error) {
      if (generation === ticket) emit({ phase: 'error', busy: false, message: '', error: error.message === 'Apollo pattern report facts.occurrences must be an array.'
        ? 'Для расширенной проверки паттернов обновите код Apollo Proxy.'
        : 'Проверка не завершена. Повторите запуск. (' + (error.message || 'PROGRESSBAR_FAILED') + ')' });
      return false;
    } finally { clearTimeout(deadlineTimer); }
  }
  async function focus(nodeId) {
    if (disposed || state.busy || state.phase !== 'complete' || !capture || !state.report?.assessments.some(item => item.nodeId === nodeId)) return false;
    try { return await native('focus', capture.captureId, nodeId) === true; }
    catch { invalidate(); return false; }
  }
  return { start, focus, getState: () => state, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    accept(message) {
      if (message?.type === 'progressbar-invalidated') { if (capture?.captureId === message.captureId) invalidate(); return true; }
      if (message?.type !== 'progressbar-native-result') return false;
      const ticket = pending.get(message.requestId); if (!ticket) return true;
      clearTimeout(ticket.timer); pending.delete(message.requestId);
      if (message.operation !== ticket.operation || !['error,operation,requestId,type','operation,requestId,result,type'].includes(Object.keys(message).sort().join(','))) ticket.reject(Error('PROGRESSBAR_NATIVE_REPLY_INVALID'));
      else if (typeof message.error === 'string') ticket.reject(Error(message.error)); else ticket.resolve(message.result);
      return true;
    }, close() { invalidate(); disposed = true; listeners.clear(); } };
}
module.exports = { createProgressBarClient };
