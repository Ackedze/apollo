const test = require('node:test'), assert = require('node:assert/strict');
const { assessCompatibility, compare, createCompatibilityClient } = require('../src/compatibility');
const { createDesignCheckController } = require('../src/design-check/controller');
const health = () => ({ ok: true, proxy: { version: '1.4.24' }, compatibility: { protocolVersion: 1,
  data: { state: 'ready', version: 'a'.repeat(64), schemaVersion: 'apollo.proxy-data-release.v1',
    profileVersion: '0.4.1', deliveryProfile: 'checking-ask-figma-mcp', generatedAt: '2026-11-05T00:00:00.000Z' } } });

for (const proxyVersion of ['1.4.24', '1.4.25', '1.5.0', '1.10.0']) test('compatible stable Proxy ' + proxyVersion, () => {
  const value = health(); value.proxy.version = proxyVersion;
  assert.equal(assessCompatibility(value).state, 'compatible');
});
for (const [name, change, expected] of [
  ['old Proxy', h => { h.proxy.version = '1.4.22'; }, 'update-proxy'],
  ['previous Proxy without the V3 data API', h => { h.proxy.version = '1.4.23'; }, 'update-proxy'],
  ['previous data before the V3 dataset', h => { h.compatibility.data.generatedAt = '2026-11-04T12:00:00.000Z'; }, 'update-data'],
  ['future major Proxy', h => { h.proxy.version = '2.0.0'; }, 'update-apollo'],
  ['missing version', h => { delete h.proxy.version; }, 'update-proxy'],
  ['unsafe version', h => { h.proxy.version = '999999999999999999999999.0.0'; }, 'update-proxy'],
  ['old build without handshake', h => { delete h.compatibility; }, 'update-proxy'],
  ['future handshake', h => { h.compatibility.protocolVersion = 2; }, 'update-apollo'],
  ['old handshake', h => { h.compatibility.protocolVersion = 0; }, 'update-proxy'],
  ['missing data', h => { h.compatibility.data = { state: 'missing' }; }, 'update-data'],
  ['invalid mounted data', h => { h.compatibility.data = { state: 'invalid' }; }, 'update-data'],
  ['invalid data identity', h => { h.compatibility.data.version = 'bad'; }, 'update-data'],
  ['older data profile', h => { h.compatibility.data.profileVersion = '0.4.0'; }, 'update-data'],
  ['future data profile', h => { h.compatibility.data.profileVersion = '0.5.0'; }, 'update-apollo'],
  ['future data schema', h => { h.compatibility.data.schemaVersion = 'future'; }, 'update-apollo'],
  ['wrong delivery profile', h => { h.compatibility.data.deliveryProfile = 'other'; }, 'update-data'],
  ['older release with the same profile', h => { h.compatibility.data.generatedAt = '2026-11-01T00:00:00Z'; }, 'update-data'],
  ['unknown data release date', h => { delete h.compatibility.data.generatedAt; }, 'update-data'],
]) test(name + ' has a specific recovery action', () => {
  const value = health(); change(value);
  assert.equal(assessCompatibility(value).state, expected);
  assert.ok(assessCompatibility(value).message.length);
});
test('numeric version order and offline are distinct from an upgrade requirement', () => {
  assert.equal(compare('1.10.0', '1.9.0'), 1);
  assert.equal(compare('1.4.11', '1.4.11'), 0);
  assert.equal(compare('invalid', '1.4.11'), null);
  assert.equal(assessCompatibility(null).state, 'unavailable');
});
test('concurrent checks share a request; each new action rechecks installed versions', async () => {
  let calls = 0, release, current = health(); const changes = [];
  const client = createCompatibilityClient({ endpoint: '/health', onChange: x => changes.push(x),
    request: async () => { calls++; await new Promise(r => { release = r; }); return { ok: true, json: async () => current }; } });
  const first = client.refresh(), second = client.refresh(); assert.equal(calls, 1); release();
  assert.equal((await first).compatibility.state, 'compatible'); await second; assert.equal(changes.length, 1);
  current = health(); current.compatibility.data.state = 'missing';
  const blocked = client.ensure(); assert.equal(calls, 2); release();
  await assert.rejects(blocked, { code: 'APOLLO_COMPATIBILITY_REQUIRED' });
  assert.equal(changes.at(-1).compatibility.state, 'update-data');
});
test('network failure is recoverable by the same refresh action', async () => {
  let offline = true;
  const client = createCompatibilityClient({ endpoint: '/health', request: async () => {
    if (offline) throw TypeError('fetch failed'); return { ok: true, json: async () => health() };
  } });
  assert.equal((await client.refresh()).compatibility.state, 'unavailable');
  offline = false; await client.ensure();
});
test('an unresponsive health fetch is aborted without an upgrade misdiagnosis', async () => {
  const client = createCompatibilityClient({ endpoint: '/health', timeoutMs: 10, request: (url, { signal }) =>
    new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(Error('aborted'), { name: 'AbortError' })), { once: true })) });
  assert.equal((await client.refresh()).compatibility.state, 'unavailable');
});
test('blocked audit and chat preserve previous results and do not dispatch operations', async () => {
  let calls = 0;
  const controller = createDesignCheckController({ beforeOperation: async () => { throw Error('update required'); },
    onAudit: () => { calls++; }, onDocumentAudit: () => { calls++; },
    dialogue: { cancelScope: 'client-only', send: async () => { calls++; } } });
  const audit = { auditId: 'previous', result: { engine: { evaluations: [] } } };
  controller.setAudit(audit); controller.setAuditReady(true); controller.setDocumentPageAvailable(true);
  assert.equal(await controller.startAudit(), false);
  assert.equal(await controller.startDocumentAudit(), false);
  assert.equal(await controller.sendChat('Do not lose my question'), false);
  assert.equal(calls, 0); assert.equal(controller.getState().audit.auditId, 'previous');
  assert.equal(controller.getState().auditStale, false); assert.equal(controller.getState().auditBusy, false);
  assert.deepEqual(controller.getState().chat.messages, []);
});
test('simultaneous start clicks do not dispatch two operations after the preflight', async () => {
  let release, calls = 0;
  const controller = createDesignCheckController({ beforeOperation: () => new Promise(r => { release = r; }), onAudit: () => { calls++; } });
  controller.setAuditReady(true);
  const first = controller.startAudit(); assert.equal(await controller.startAudit(), false);
  release(); await first; assert.equal(calls, 1);
});
test('tool preflight failures do not dispatch native scans or discard existing state', async () => {
  const sent = [], denied = async () => { throw Error('Обновите знания'); };
  const names = require('../src/skills/layer-names/client').createLayerNamesClient({ send: m => sent.push(m), beforeOperation: denied });
  await names.start(); assert.equal(sent.length, 0); assert.equal(names.getState().error, 'Обновите знания');
  const glyph = require('../src/skills/reglyph/client').createReglyphClient({ send: m => sent.push(m), beforeOperation: denied });
  glyph.setContext({ channelId: 'b2b', pickerLabel: 'Android' });
  await glyph.start(); assert.equal(sent.filter(m => m.operation === 'scan').length, 0);
  assert.equal(glyph.getState().error, 'Обновите знания');
});
for (const method of ['startAudit', 'startDocumentAudit']) test(method + ' rechecks availability after the asynchronous handshake', async () => {
  let release, calls = 0;
  const controller = createDesignCheckController({ beforeOperation: () => new Promise(r => { release = r; }),
    onAudit: () => { calls++; }, onDocumentAudit: () => { calls++; } });
  controller.setAuditReady(true); controller.setDocumentPageAvailable(true);
  const result = controller[method](); controller.setAuditReady(false); release();
  assert.equal(await result, false); assert.equal(calls, 0); assert.equal(controller.getState().auditBusy, false);
});
