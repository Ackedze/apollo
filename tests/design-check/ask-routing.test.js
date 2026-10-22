const test = require('node:test'), assert = require('node:assert/strict');
const root = '../../src/design-check/';
const { createDesignCheckController } = require(root + 'controller');
const { createExistingDialoguePort } = require(root + 'dialogue-port');
const { createUiClient } = require(root + 'ui-client');
const { createUiMainBridge, SOURCE_SCHEMA, SOURCE_KEY } = require(root + 'ui-protocol');

for (const saved of [null, 'langflow', 'codex']) {
  test(`Ask uses the selected Proxy CLI with saved source ${saved}`, async () => {
    const wire = [], writes = []; let client, localCalls = 0, remoteCalls = 0, sessions = 0;
    const bridge = createUiMainBridge({ storage: {
      getAsync: async key => { assert.equal(key, SOURCE_KEY); return saved == null ? null : { schemaVersion: SOURCE_SCHEMA, source: saved }; },
      setAsync: async (key, value) => writes.push({ key, value }),
    }, resize() {}, post: message => client.accept(message) });
    client = createUiClient(message => bridge.accept(message));
    const dialogue = createExistingDialoguePort({ endpoint: 'http://localhost:3001/analyze', createSessionId: () => `owned-session-${++sessions}`,
      request: async (_url, options) => {
        const body = JSON.parse(options.body); wire.push(body);
        if (body.source === 'codex') localCalls++; else remoteCalls++;
        return { ok: true, json: async () => ({ success: true, source: body.source, result: 'Owned synthetic answer' }) };
      } });
    const controller = createDesignCheckController({ preferenceScope: 'agent-source', preferences: client.preferences, dialogue });
    await controller.restorePreferences(); await controller.flushPreferences();
    await controller.sendChat('Owned first question'); await controller.sendChat('Owned follow-up');
    assert.equal(localCalls, 2); assert.equal(remoteCalls, 0);
    assert.deepEqual(wire.map(body => body.source), ['codex', 'codex']);
    assert.equal(wire[1].session_id, wire[0].session_id); assert.equal(sessions, 1);
    assert.deepEqual(wire[1].dialogue, [{ role: 'user', text: 'Owned first question' }, { role: 'assistant', text: 'Owned synthetic answer' }]);
    assert.deepEqual(writes, saved === 'langflow' ? [{ key: SOURCE_KEY, value: { schemaVersion: SOURCE_SCHEMA, source: 'codex' } }] : []);
    assert.equal(controller.getState().chat.error, ''); controller.destroy();
  });
}

for (const provider of ['codex', 'claude', 'alfagen']) {
  test(`Ask preserves actual ${provider} provenance across the legacy codex wire`, async () => {
    const dialogue = createExistingDialoguePort({endpoint: 'http://localhost:3001/analyze', createSessionId: () => 'provider-session',
      request: async (_url, options) => {
        assert.equal(JSON.parse(options.body).source, 'codex');
        return {ok: true, json: async () => ({success: true, source: 'codex', provider, result: 'Fixture answer'})};
      }});
    const controller = createDesignCheckController({dialogue});
    await controller.sendChat('Fixture question');
    const reply = controller.getState().chat.messages.at(-1);
    assert.equal(reply.provider, provider); assert.equal(reply.returnedSource, 'codex');
    assert.equal(controller.getState().chat.error, ''); controller.destroy();
  });
}
