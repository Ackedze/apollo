const test = require('node:test');
const assert = require('node:assert/strict');
const { createOpaqueId } = require("../../src/design-check/opaque-id");
const { createExistingDialoguePort } = require("../../src/design-check/dialogue-port");
const validId = value => assert.match(value, /^[a-z0-9-]{1,180}$/);

test('creates IDs with getRandomValues when randomUUID is absent', () => {
  let calls = 0;
  const crypto = { getRandomValues(bytes) { calls++; bytes.fill(123); return bytes; } };
  const id = createOpaqueId({ crypto });
  assert.equal(calls, 1); validId(id);
  assert.match(id, /^7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b-/);
});

test('fallback remains distinct when Web Crypto is unavailable and the clock is unchanged', () => {
  for (const crypto of [null, {}, { getRandomValues() { throw Error('restricted host'); } }]) {
    const options = { crypto, now: () => 123, random: () => 0 };
    const first = createOpaqueId(options), second = createOpaqueId(options);
    validId(first); validId(second); assert.notEqual(first, second);
  }
});

test('fallback IDs support a real dialogue port, preserve a session and reset it', async () => {
  const calls = [];
  const port = createExistingDialoguePort({ endpoint: 'http://localhost:3001/analyze',
    createSessionId: () => 'apollo-v4-' + createOpaqueId({ crypto: null, now: () => 123, random: () => 0 }),
    request: async (url, options) => { calls.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ success: true, result: 'Synthetic reply', source: 'codex' }) }; } });
  const input = { source: 'codex', question: 'Synthetic question', dialogue: [], context: null, signal: new AbortController().signal };
  await port.send(input); await port.send(input); port.resetSession(); await port.send(input);
  calls.forEach(call => validId(call.session_id));
  assert.equal(calls[0].session_id, calls[1].session_id);
  assert.notEqual(calls[1].session_id, calls[2].session_id);
});
