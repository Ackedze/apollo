const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../src/ui.js'), 'utf8');
const resolveSource = source.slice(source.indexOf('async function resolve(data)'), source.indexOf('\nwindow.onmessage ='));
async function request(first, catalog = true) {
  const messages = []; let posts = 0;
  const context = { contractRequests: new Map(), AbortController, setTimeout, clearTimeout, TypeError,
    BASE: 'http://localhost:3001', activeRequest: 'audit', contractStopping: false,
    send: message => messages.push(message), designCheck: { setProxyStatus() {}, setAuditProgress() {}, getState: () => ({ chat: { proxy: {} } }) },
    fetch: async () => { posts++; return posts === 1 ? first : { ok: true, status: 200, json: async () => ({ success: true }) }; } };
  vm.runInNewContext(resolveSource, context);
  await context.resolve({ type: catalog ? 'resolve-catalog-reference' : 'resolve-contracts', requestId: 'audit:catalog:component', selection: {}, releaseId: 'release' });
  return { posts, messages };
}
for (const code of ['CATALOG_REFERENCE_UNAVAILABLE', 'CATALOG_STRUCTURE_UNAVAILABLE', 'CATALOG_RESOURCE_KEY_UNAVAILABLE']) {
  test('a permanent catalogue response is delivered once: ' + code, async () => {
    const result = await request({ ok: false, status: 503, json: async () => ({ success: false, code, error: 'Pinned catalogue is unavailable' }) });
    assert.equal(result.posts, 1);
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].type, 'contracts-resolved');
    assert.equal(result.messages[0].code, code);
  });
}
test('an unstructured temporary Proxy failure still recovers', async () => {
  const result = await request({ ok: false, status: 503, json: async () => ({ success: false, error: 'Temporarily unavailable' }) });
  assert.equal(result.posts, 2);
  assert.equal(result.messages[0].type, 'contracts-progress');
  assert.equal(result.messages[0].code, 'PROXY_UNAVAILABLE');
  assert.equal(result.messages[1].data.success, true);
});
test('ordinary contract requests keep their existing transient recovery', async () => {
  const result = await request({ ok: false, status: 503, json: async () => ({ success: false, code: 'CONTRACT_V4_FAILED' }) }, false);
  assert.equal(result.posts, 2);
  assert.equal(result.messages[0].code, 'PROXY_UNAVAILABLE');
});
