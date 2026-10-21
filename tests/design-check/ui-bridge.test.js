const test = require('node:test'), assert = require('node:assert/strict');
const { UI_SCHEMA, SOURCE_SCHEMA, SOURCE_KEY, createUiMainBridge } = require("../../src/design-check/ui-protocol");
const { createUiClient } = require("../../src/design-check/ui-client");
const { createDesignCheckController } = require("../../src/design-check/controller");
const request = (operation, payload, requestId = 'synthetic-1') => ({ type: 'design-check-ui-request', schemaVersion: UI_SCHEMA, requestId, operation, payload });
const source = name => ({ schemaVersion: SOURCE_SCHEMA, source: name });
test('closed UI main bridge serializes storage and bounds both window sizes', async () => {
  const messages = [], writes = [], sizes = []; let value;
  const bridge = createUiMainBridge({ storage: { getAsync: async key => { assert.equal(key, SOURCE_KEY); return value; },
    setAsync: async (key, v) => { writes.push([key, v]); value = v; } }, resize: (w, h) => sizes.push([w, h]), post: m => messages.push(m) });
  for (const m of [request('agent-source-get', {}, 'get-1'), request('agent-source-set', source('codex'), 'set-1'),
    request('agent-source-get', {}, 'get-2'), request('resize', { compact: true }, 'resize-1'), request('resize', { compact: false }, 'resize-2')]) assert.equal(bridge.accept(m), true);
  await bridge.flush();
  assert.deepEqual(messages.map(m => m.requestId), ['get-1', 'set-1', 'get-2', 'resize-1', 'resize-2']);
  assert.equal(messages[0].result, null); assert.deepEqual(messages[2].result, source('codex'));
  assert.deepEqual(writes, [[SOURCE_KEY, source('codex')]]); assert.deepEqual(sizes, [[400, 860], [800, 860]]);
});
test('malformed UI requests never reach storage or resize', async () => {
  let calls = 0; const messages = [];
  const bridge = createUiMainBridge({ storage: { getAsync: () => calls++, setAsync: () => calls++ }, resize: () => calls++, post: m => messages.push(m) });
  const cases = [request('resize', { width: 99999, height: -1 }), request('resize', { compact: true, auditContext: {} }),
    request('agent-source-set', source('other')), request('agent-source-get', { pageTypeId: 'form' }),
    Object.assign(request('agent-source-get', {}), { schemaVersion: 'unknown' }), request('scan', {})];
  for (const m of cases) assert.equal(bridge.accept(m), true);
  assert.equal(bridge.accept({ type: 'audit' }), false); await bridge.flush(); assert.equal(calls, 0);
  assert.equal(messages.length, cases.length); assert.ok(messages.every(m => m.error));
});
test('corrupt stored source and failed writes remain explicit errors, queue recovers', async () => {
  const messages = []; let fail = true;
  const bridge = createUiMainBridge({ storage: { getAsync: async () => ({ source: 'codex' }), setAsync: async () => { if (fail) throw Error('storage denied'); } }, resize() {}, post: m => messages.push(m) });
  bridge.accept(request('agent-source-get', {}, 'get')); bridge.accept(request('agent-source-set', source('codex'), 'set'));
  await bridge.flush(); assert.ok(messages[0].error); assert.equal(messages[1].error, 'storage denied');
  fail = false; bridge.accept(request('agent-source-set', source('langflow'), 'recover')); await bridge.flush(); assert.deepEqual(messages[2].result, source('langflow'));
});
test('actual UI client/main round trip persists only source; general/page changes stay in session', async () => {
  let client; const writes = []; const bridge = createUiMainBridge({ storage: { getAsync: async () => source('codex'), setAsync: async (key, value) => writes.push([key, value]) }, resize() {}, post: m => client.accept(m) });
  client = createUiClient(m => bridge.accept(m));
  const controller = createDesignCheckController({ preferenceScope: 'agent-source', preferences: client.preferences });
  const restore = controller.restorePreferences(); controller.updateSetting('pageTypeId', 'data-list'); controller.updateSetting('channelId', 'invest');
  await restore; await controller.flushPreferences(); assert.deepEqual(writes, []); assert.equal(controller.getState().settings.pageTypeId, 'data-list'); assert.equal(controller.getState().chat.source, 'codex');
  controller.setAgentSource('langflow'); await controller.flushPreferences(); assert.deepEqual(writes, [[SOURCE_KEY, source('langflow')]]);
  const fresh = createDesignCheckController({ preferenceScope: 'agent-source', preferences: { load: async () => ({ schemaVersion: 'apollo.design-check-ui-preferences.v1', settings: { pageTypeId: 'form' }, agentSource: 'codex' }) } });
  await fresh.restorePreferences(); assert.equal(fresh.getState().settings.pageTypeId, null); assert.equal(fresh.getState().preferenceStatus, 'error');
});
test('UI client ignores late IDs and rejects mismatched operation/schema/payload and times out', async () => {
  const sent = []; const client = createUiClient(m => sent.push(m), { timeoutMs: 15 });
  const pending = client.preferences.load(); const m = sent[0];
  client.accept({ type: 'design-check-ui-result', schemaVersion: UI_SCHEMA, requestId: 'late', operation: m.operation, result: source('codex') });
  client.accept({ type: 'design-check-ui-result', schemaVersion: UI_SCHEMA, requestId: m.requestId, operation: 'resize', result: source('codex') });
  await assert.rejects(pending, /несовместим/);
  const timed = client.resize(true); await assert.rejects(timed, /не ответил/);
  assert.equal(client.accept({ type: 'audit-result' }), false);
  for (const patch of [{ schemaVersion: 'unknown', result: null }, { result: { schemaVersion: SOURCE_SCHEMA, source: 'unknown' } }, { result: null, auditContext: {} }]) {
    const p = client.preferences.load(), req = sent.at(-1);
    client.accept(Object.assign({ type: 'design-check-ui-result', schemaVersion: UI_SCHEMA, requestId: req.requestId, operation: req.operation }, patch));
    await assert.rejects(p);
  }
});

test('UI reload request identities isolate delayed main replies', async () => {
  const sent=[]; const one=createUiClient(m=>sent.push(m)), two=createUiClient(m=>sent.push(m));
  const p1=one.preferences.load(), p2=two.preferences.load(); assert.notEqual(sent[0].requestId,sent[1].requestId);
  const reply=id=>({type:'design-check-ui-result',schemaVersion:UI_SCHEMA,requestId:id,operation:'agent-source-get',result:source('codex')});
  two.accept(reply(sent[0].requestId)); one.accept(reply(sent[0].requestId)); two.accept(reply(sent[1].requestId));
  await p1; await p2;
});
test('resize response must match the requested compact state', async () => {
  let request; const client=createUiClient(m=>{request=m;}); const pending=client.resize(false);
  client.accept({type:'design-check-ui-result',schemaVersion:UI_SCHEMA,requestId:request.requestId,operation:'resize',result:{width:400,height:860}});
  await assert.rejects(pending,/неверные значения/);
});
