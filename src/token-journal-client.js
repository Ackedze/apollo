'use strict';
const { createOpaqueId } = require('./design-check/opaque-id');

// Telemetry is independent of audit delivery: an old/offline Proxy cannot block it.
function createTokenJournalClient({ request = (...args) => fetch(...args), endpoint = 'http://localhost:3001/usage/local',
  now = Date.now, monotonic = () => performance.now(), sessionId = createOpaqueId() } = {}) {
  let current = null, latest = null, scheduled = false;
  function finish(status) {
    if (!current) return;
    const run = current; current = null;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 1500);
    const body = { id: sessionId + ':' + run.id, operation: 'check', startedAt: new Date(run.start).toISOString(),
      durationMs: Math.max(0, Math.round(monotonic() - run.monotonic)), status };
    Promise.resolve().then(() => request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: controller.signal })).catch(() => {}).finally(() => clearTimeout(timer));
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!current || !latest || latest.auditBusy || current.document && ['loading', 'cancelling'].includes(latest.documentAudit?.status)) return;
      finish(latest.auditError || current.document && latest.documentAudit?.error ? 'failed' : latest.auditStale || current.document && latest.documentAudit?.status === 'stale' ? 'cancelled' : 'completed');
    });
  }
  return {
    start(id, document = false) {
      if (current?.id === id) { current.document ||= document; return; }
      if (current) finish('cancelled');
      current = { id, document, start: now(), monotonic: monotonic() }; schedule();
    },
    observe(state) { latest = state; schedule(); },
  };
}
module.exports = { createTokenJournalClient };
