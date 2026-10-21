const test = require('node:test');
const assert = require('node:assert/strict');
const { createExistingDialoguePort } = require("../../src/design-check/dialogue-port");
const input = () => ({ source: 'codex', question: 'Test question', dialogue: [], context: null, signal: new AbortController().signal });
function setup(body = { success: true, result: 'Synthetic transport reply', source: 'codex' }, ok = true) {
  const calls = []; let sessions = 0;
  const port = createExistingDialoguePort({ endpoint: 'http://localhost:3001/analyze', createSessionId: () => `synthetic-session-${++sessions}`,
    request: async (url, request) => { calls.push({ url, request }); return { ok, status: ok ? 200 : 503, json: async () => body }; } });
  return { port, calls };
}
test('uses the existing /analyze request shape without an audit snapshot', async () => {
  const { port, calls } = setup(); await port.send(input()); const body = JSON.parse(calls[0].request.body);
  assert.equal(calls[0].url, 'http://localhost:3001/analyze'); assert.equal(body.action, 'user-question');
  assert.equal(body.component, 'apollo-agent-report'); assert.equal(body.source, 'codex');
  const text = JSON.parse(body.text); assert.equal(text.mode, 'design-dialogue');
  assert.deepEqual(text.context, { selection: null, finding: null, auditReport: null, componentContext: null });
  assert.equal(port.cancelScope, 'client-only');
});
test('session identity is stable within a dialogue and resets explicitly', async () => {
  const { port, calls } = setup(); await port.send(input()); await port.send(input()); port.resetSession(); await port.send(input());
  const ids = calls.map(call => JSON.parse(call.request.body).session_id);
  assert.equal(ids[0], ids[1]); assert.notEqual(ids[1], ids[2]);
});
test('forwards bounded history and the client abort signal', async () => {
  const { port, calls } = setup(), value = input(); value.dialogue = [{ role: 'user', text: 'Previous question' }];
  await port.send(value); assert.equal(calls[0].request.signal, value.signal);
  assert.deepEqual(JSON.parse(calls[0].request.body).dialogue, value.dialogue);
});
test('rejects missing endpoint and unsupported source/context/history before network access', async () => {
  assert.throws(() => createExistingDialoguePort({ endpoint: 'http://localhost:3001/analyze', createSessionId: () => 'test' }));
  assert.throws(() => createExistingDialoguePort({ endpoint: 'http://localhost:3001/v2/contracts/explain', createSessionId: () => 'test', request() {} }));
  const { port, calls } = setup();
  for (const override of [{ source: 'unknown' }, { context: { auditId: 'private' } }, { dialogue: Array(13).fill({ role: 'user', text: 'test' }) }, { question: ' ' }])
    await assert.rejects(port.send(Object.assign(input(), override)), /Unsupported/);
  assert.equal(calls.length, 0);
});
test('rejects transport errors, empty bodies and mismatched source identity', async () => {
  for (const [body, ok] of [[{ success: false, error: 'proxy offline' }, false], [{ success: true, result: '' }, true], [{ success: true, result: 'reply', source: 'langflow' }, true]])
    await assert.rejects(setup(body, ok).port.send(input()));
});
test('health means endpoint availability, separate from rule coverage', async () => {
  const { port, calls } = setup({ ok: true, proxy: { version: 'synthetic' }, codex: { configured: false } });
  assert.deepEqual(await port.status(), { available: true, version: 'synthetic' });
  assert.equal(calls[0].url, 'http://localhost:3001/health'); assert.equal(calls[0].request.method, 'GET');
});
