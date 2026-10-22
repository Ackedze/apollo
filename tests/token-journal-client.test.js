const test = require('node:test'), assert = require('node:assert/strict');
const { createTokenJournalClient } = require('../src/token-journal-client');
const flush = () => new Promise(r => setImmediate(r));
test('one local check spans native and contract branches; telemetry contains no layout or tokens', async () => {
  let time = 0; const calls = [], tracker = createTokenJournalClient({ request: async (...args) => calls.push(args), now: () => 1760000000000, monotonic: () => time, sessionId: 'fixture' });
  tracker.start('check', true); tracker.observe({ auditBusy: false, documentAudit: { status: 'idle' } });
  tracker.observe({ auditBusy: true, documentAudit: { status: 'loading' } }); tracker.start('check');
  time = 100; tracker.observe({ auditBusy: false, documentAudit: { status: 'loading' } }); await flush(); assert.equal(calls.length, 0);
  time = 250; tracker.observe({ auditBusy: false, documentAudit: { status: 'available' } }); await flush();
  assert.deepEqual(JSON.parse(calls[0][1].body), { id: 'fixture:check', operation: 'check', startedAt: new Date(1760000000000).toISOString(), durationMs: 250, status: 'completed' });
  tracker.observe({ auditBusy: false, documentAudit: { status: 'available' } }); await flush(); assert.equal(calls.length, 1);
});
test('legacy contract-only check ignores unrelated stale document state; offline telemetry cannot reject audit', async () => {
  const calls = [], tracker = createTokenJournalClient({ request: () => { throw Error('old/offline Proxy'); }, sessionId: 'fixture' });
  tracker.start('check'); tracker.observe({ auditBusy: true, documentAudit: { status: 'stale', error: 'previous unrelated error' } });
  tracker.observe({ auditBusy: false, documentAudit: { status: 'stale', error: 'previous unrelated error' } }); await flush();
  const next = createTokenJournalClient({ request: async (url, options) => calls.push(JSON.parse(options.body)), sessionId: 'fixture' });
  next.start('failed'); next.observe({ auditBusy: false, auditError: 'native failure' }); await flush(); assert.equal(calls[0].status, 'failed');
  next.start('cancelled'); next.observe({ auditBusy: false, auditStale: true }); await flush(); assert.equal(calls[1].status, 'cancelled');
});
