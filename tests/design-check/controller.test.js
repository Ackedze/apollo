const test = require('node:test');
const assert = require('node:assert/strict');
const { createDesignCheckController } = require("../../src/design-check/controller");
const { PREFERENCE_VERSION } = require("../../src/design-check/definitions");
const { createExistingDialoguePort } = require("../../src/design-check/dialogue-port");
const tabs = ['themization', 'changesWip', 'changes', 'current'].map(id => ({ id, title: id }));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const audit = () => ({ auditId: 'synthetic-audit', result: { engine: { evaluations: [
  { evaluationId: 'v', ruleId: 'fixture.width', classification: 'violation' },
  { evaluationId: 'u', ruleId: 'fixture.context', classification: 'unknown' },
  { evaluationId: 'a', ruleId: 'fixture.swap', classification: 'allowed' },
  { evaluationId: 'p', ruleId: 'fixture.valid', classification: 'compliant' },
] }, coverage: { scope: 'available-component-contracts-in-selected-area', executionComplete: false } } });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('a failed new audit cannot display the preceding contract results or accept a late reply', async () => {
  const controller = createDesignCheckController({ tabs });
  controller.setAudit(audit());
  const native = { status: 'available', requestId: 'native-current', result: { checks: [] }, error: '' };
  controller.setDocumentAudit(native);
  controller.setTabData('current', { status: 'available', scope: 'native', executionComplete: true, items: [{ findingId: 'native-current' }] });
  controller.beginContractAudit('new-area');
  assert.equal(controller.getState().audit, null);
  assert.equal(controller.getState().tabs.changes.count, null);
  assert.deepEqual(controller.getTabItems('changes'), []);
  assert.equal(controller.getState().documentAudit, native);
  assert.equal(controller.getState().tabs.current.count, 1);
  assert.equal(controller.acceptAuditResult('previous-area', audit()), false);
  assert.equal(controller.acceptAuditError('new-area', 'AUDIT_CAPTURE_CHANGED'), true);
  assert.equal(controller.getState().auditBusy, false);
  assert.equal(controller.getState().audit, null);
  assert.equal(controller.getState().auditError, 'AUDIT_CAPTURE_CHANGED');
  controller.beginContractAudit('retry');
  assert.equal(controller.acceptAuditResult('new-area', audit()), false);
  assert.equal(controller.acceptAuditResult('retry', audit()), true);
  assert.equal(controller.getState().tabs.changes.count, 3);
  controller.destroy();
});

test('the standalone audit path clears previous results before an asynchronous failure', async () => {
  const pending = deferred(), controller = createDesignCheckController({ tabs, onAudit: () => pending.promise });
  controller.setAuditReady(true); controller.setAudit(audit());
  const run = controller.startAudit();
  assert.equal(controller.getState().audit, null);
  pending.reject(Error('new capture failed')); await run;
  assert.equal(controller.getState().auditError, 'new capture failed');
  assert.equal(controller.getState().tabs.changes.count, null);
  controller.destroy();
});

test('Proxy status is available outside chat and recovers without erasing audit errors', async () => {
  let online=false;
  const controller=createDesignCheckController({onAudit:()=>{},dialogue:{status:async()=>{if(!online)throw Error('offline');return {available:true,version:'1.3.1'};}}});
  assert.equal(controller.getState().chat.proxy.available,null);
  await controller.refreshProxyStatus();
  assert.equal(controller.getState().chat.open,false);
  assert.equal(controller.getState().chat.proxy.available,false);
  controller.beginContractAudit('synthetic-proxy-failure');
  controller.acceptAuditError('synthetic-proxy-failure','ApolloProxyControl: Failed to fetch');
  online=true;await controller.refreshProxyStatus();
  assert.equal(controller.getState().chat.proxy.available,true);
  assert.equal(controller.getState().chat.proxy.version,'1.3.1');
  assert.equal(controller.getState().auditError,'ApolloProxyControl: Failed to fetch');
  assert.equal(controller.getState().audit,null);
  controller.destroy();
});

test('older health replies cannot overwrite a newer connection observation', async () => {
  const first=deferred(),second=deferred();let calls=0;
  const controller=createDesignCheckController({dialogue:{status:()=>++calls===1?first.promise:second.promise}});
  const old=controller.refreshProxyStatus(),recent=controller.refreshProxyStatus();
  second.resolve({available:true,version:'new'});await recent;
  first.reject(Error('old offline'));await old;
  assert.equal(controller.getState().chat.proxy.version,'new');
  const pending=deferred();const other=createDesignCheckController({dialogue:{status:()=>pending.promise}});
  const health=other.refreshProxyStatus();other.setProxyStatus({available:true,version:'resolver'});
  pending.resolve({available:false,version:null});await health;
  assert.equal(other.getState().chat.proxy.version,'resolver');
  other.destroy();controller.destroy();
});

test('late Proxy status after destroy cannot notify an unmounted UI', async () => {
  const pending=deferred();const controller=createDesignCheckController({dialogue:{status:()=>pending.promise}});let changes=0;
  controller.subscribe(()=>changes++);const health=controller.refreshProxyStatus();controller.destroy();
  pending.resolve({available:false,version:null});await health;
  assert.equal(changes,0);assert.equal(controller.getState().chat.proxy.available,null);
});

test('categories begin unverified with no invented successful counts', () => {
  const controller = createDesignCheckController({ tabs });
  assert.equal(controller.getState().settings.pageTypeId, null);
  assert.equal(controller.getState().selectedTab, 'current');
  assert.equal(controller.getState().tabs.current.count, null);
  assert.equal(controller.getState().auditReady, false);
  controller.setAuditReady(true); assert.equal(controller.getState().auditReady, false);
  assert.equal(controller.selectTab('current'), true);
  assert.equal(controller.selectTab('unknown-category'), false);
});
test('v3 visibility and compact expansion preserve chosen categories', () => {
  const controller = createDesignCheckController({ tabs });
  controller.updateSetting('compact', true); controller.selectTab('current');
  assert.equal(controller.getState().settings.compact, false);
  controller.selectTab('changes'); controller.updateSetting('hideCustomizations', true);
  assert.equal(controller.getVisibleTabs().some(tab => tab.id === 'changes'), false);
  assert.equal(controller.getState().selectedTab, 'themization');
  controller.updateSetting('pickerLabel', 'iOS');
  assert.equal(controller.getState().selectedTab, 'current');
  assert.equal(controller.getVisibleTabs().some(tab => tab.id === 'themization'), false);
});
test('page type accepts the six real values and retains unknown as null', () => {
  const controller = createDesignCheckController({ tabs });
  assert.equal(controller.updateSetting('pageTypeId', 'table'), false);
  for (const value of ['form', 'details', 'data-list', 'landing', 'dashboard', 'other', null]) assert.equal(controller.updateSetting('pageTypeId', value), true);
  assert.equal(controller.updateSetting('pickerLabel', 'tablet'), false);
  assert.equal(controller.updateSetting('channelId', 'internal'), false);
});
test('unconnected runtime and Expected controls cannot change audit behavior', () => {
  const controller = createDesignCheckController({ tabs });
  for (const key of ['shellAuditEnabled', 'experimentalContractV2Enabled', 'showExpectedCustomizations']) assert.equal(controller.updateSetting(key, true), false);
  controller.setAudit(audit());
  assert.equal(controller.getTabItems('changes').length, 3);
  assert.equal(controller.getState().tabs.current.count, null);
  assert.equal(controller.getState().tabs.changes.executionComplete, false);
});
test('explicit display filter keeps unknown and violations and does not mutate the report', () => {
  const controller = createDesignCheckController({ tabs, settingCapabilities: { showExpectedCustomizations: true } });
  const value = audit(), before = JSON.stringify(value); controller.setAudit(value);
  controller.updateSetting('showExpectedCustomizations', false);
  assert.deepEqual(controller.getTabItems('changes').map(entry => entry.classification), ['violation', 'unknown']);
  assert.equal(JSON.stringify(value), before);
});
test('external category data requires an explicit scope and coverage status', () => {
  const controller = createDesignCheckController({ tabs });
  assert.throws(() => controller.setTabData('current', { status: 'available', items: [] }), /coverage/);
  controller.setTabData('current', { status: 'available', items: [], scope: 'synthetic-contract-scope', executionComplete: true });
  assert.equal(controller.getState().tabs.current.count, 0);
  assert.throws(() => controller.setTabData('invented', { status: 'not-connected', items: [] }));
});
test('preferences restore page type and display fields without enabling session runtime flags', async () => {
  const value = { schemaVersion: PREFERENCE_VERSION, settings: { pageTypeId: 'form', compact: true, hideCustomizations: true }, agentSource: 'codex' };
  const controller = createDesignCheckController({ tabs, preferences: { load: async () => value, save: async () => {} } });
  await controller.restorePreferences();
  assert.equal(controller.getState().settings.pageTypeId, 'form');
  assert.equal(controller.getState().settings.compact, true);
  assert.equal(controller.getState().settings.experimentalContractV2Enabled, false);
  assert.equal(controller.getState().chat.source, 'codex');
  assert.equal(controller.getState().audit, null);
});
test('delayed preference load cannot overwrite a newer local selection', async () => {
  const load = deferred();
  const controller = createDesignCheckController({ tabs, preferences: { load: () => load.promise, save: async () => {} } });
  const restoring = controller.restorePreferences(); controller.updateSetting('pageTypeId', 'dashboard'); controller.setAgentSource('codex');
  load.resolve({ schemaVersion: PREFERENCE_VERSION, settings: { pageTypeId: 'form', compact: true }, agentSource: 'langflow' }); await restoring;
  assert.equal(controller.getState().settings.pageTypeId, 'dashboard');
  assert.equal(controller.getState().settings.compact, true);
  assert.equal(controller.getState().chat.source, 'codex');
});
for (const completedBeforeRestore of [false, true]) {
  test(`late preference source cannot switch a ${completedBeforeRestore ? 'completed' : 'pending'} first dialogue or its session`, async () => {
    const load = deferred(), firstReply = deferred(), requests = []; let sessions = 0;
    const dialogue = createExistingDialoguePort({ endpoint: 'http://localhost:3001/analyze', createSessionId: () => `synthetic-session-${++sessions}`,
      request: async (_url, request) => {
        const body = JSON.parse(request.body); requests.push(body);
        if (requests.length === 1) await firstReply.promise;
        return { ok: true, status: 200, json: async () => ({ success: true, source: body.source, result: 'Synthetic Langflow answer' }) };
      } });
    const controller = createDesignCheckController({ tabs, dialogue, preferences: { load: () => load.promise, save: async () => {} } });
    controller.setAgentSource('langflow');
    const restoring = controller.restorePreferences(), sending = controller.sendChat('First synthetic question');
    if (completedBeforeRestore) { firstReply.resolve(); await sending; }
    load.resolve({ schemaVersion: PREFERENCE_VERSION, settings: { pageTypeId: null, compact: true }, agentSource: 'codex' });
    await restoring;
    try {
      assert.equal(controller.getState().chat.source, 'langflow');
      assert.equal(controller.getState().chat.busy, !completedBeforeRestore);
      assert.equal(controller.getState().settings.compact, true, 'Unrelated preferences must still restore');
    } finally { firstReply.resolve(); await sending; }
    assert.deepEqual(controller.getState().chat.messages.map(entry => entry.source), ['langflow', 'langflow']);
    await controller.sendChat('Second synthetic question');
    assert.equal(requests[1].source, 'langflow');
    assert.equal(requests[1].session_id, requests[0].session_id);
    assert.equal(sessions, 1);
    assert.deepEqual(requests[1].dialogue, [
      { role: 'user', text: 'First synthetic question' }, { role: 'assistant', text: 'Synthetic Langflow answer' },
    ]);
  });
}
test('restore started after an existing dialogue cannot relabel its history', async () => {
  const requests = []; let resets = 0;
  const controller = createDesignCheckController({ tabs, dialogue: { cancelScope: 'client-only', resetSession: () => resets++,
    send: async request => { requests.push(request); return { text: 'Synthetic Langflow answer' }; } },
    preferences: { load: async () => ({ schemaVersion: PREFERENCE_VERSION, settings: { pageTypeId: null }, agentSource: 'codex' }), save: async () => {} } });
  controller.setAgentSource('langflow'); resets = 0;
  await controller.sendChat('First question'); await controller.restorePreferences();
  assert.equal(controller.getState().chat.source, 'langflow');
  assert.equal(controller.getState().chat.messages.length, 2);
  assert.equal(resets, 0);
  await controller.sendChat('Follow-up'); assert.equal(requests[1].source, 'langflow');
});
test('invalid stored facts and runtime flags produce an explicit error', async () => {
  for (const settings of [{ pageTypeId: 'invented' }, { shellAuditEnabled: true }]) {
    const controller = createDesignCheckController({ tabs, preferences: { load: async () => ({ schemaVersion: PREFERENCE_VERSION, settings, agentSource: 'codex' }), save: async () => {} } });
    await controller.restorePreferences(); assert.equal(controller.getState().preferenceStatus, 'error');
    assert.equal(controller.getState().settings.pageTypeId, null); assert.equal(controller.getState().settings.shellAuditEnabled, false);
  }
});
test('serialized preference writes keep the newest settings on disk', async () => {
  const writes = [], first = deferred();
  const controller = createDesignCheckController({ tabs, preferences: { load: async () => null, save: async value => { if (!writes.length) await first.promise; writes.push(value); } } });
  controller.updateSetting('pageTypeId', 'form'); controller.updateSetting('pageTypeId', 'dashboard');
  await tick(); first.resolve(); await controller.flushPreferences();
  assert.equal(writes.length, 2); assert.equal(writes.at(-1).settings.pageTypeId, 'dashboard');
  assert.equal(Object.hasOwn(writes.at(-1).settings, 'shellAuditEnabled'), false);
  assert.equal(controller.getState().preferenceStatus, 'saved');
});
test('storage failure stays visible without changing the chosen UI context', async () => {
  const controller = createDesignCheckController({ tabs, preferences: { load: async () => { throw Error('load failed'); }, save: async () => { throw Error('storage full'); } } });
  await controller.restorePreferences(); assert.equal(controller.getState().preferenceError, 'load failed');
  controller.updateSetting('pageTypeId', 'details'); await controller.flushPreferences();
  assert.equal(controller.getState().preferenceError, 'storage full'); assert.equal(controller.getState().settings.pageTypeId, 'details');
});
test('runtime setting callback failures are visible and cannot enable a result', async () => {
  const controller = createDesignCheckController({ tabs, onSettingChange: async () => { throw Error('context not supported'); } });
  controller.updateSetting('pageTypeId', 'form'); await tick();
  assert.equal(controller.getState().settingsNotice, 'context not supported'); assert.equal(controller.getState().audit, null);
});
test('audit request and response are matched by ID and invalidated on selection change', async () => {
  let request;
  const controller = createDesignCheckController({ tabs, onAudit: input => { request = input; } });
  controller.setAuditReady(true); await controller.startAudit();
  assert.equal(controller.updateSetting('pageTypeId', 'form'), false);
  assert.equal(controller.acceptAuditResult('stale', audit()), false);
  controller.invalidateAudit(); assert.equal(controller.acceptAuditResult(request.requestId, audit()), false);
  await controller.startAudit(); assert.equal(controller.acceptAuditResult(request.requestId, audit()), true);
  assert.equal(controller.getState().auditBusy, false);
});
test('stale asynchronous audit errors cannot overwrite a new audit', async () => {
  const old = deferred(); let calls = 0;
  const controller = createDesignCheckController({ tabs, onAudit: () => ++calls === 1 ? old.promise : audit() });
  controller.setAuditReady(true); const pending = controller.startAudit(); controller.invalidateAudit();
  await controller.startAudit(); old.reject(Error('old error')); await pending;
  assert.equal(controller.getState().auditError, ''); assert.equal(controller.getState().audit.auditId, 'synthetic-audit');
});
test('chat opens and closes without starting an agent request', async () => {
  let sends = 0;
  const controller = createDesignCheckController({ tabs, dialogue: { cancelScope: 'client-only', send: async () => { sends++; return { text: 'test' }; } } });
  controller.openChat(); controller.closeChat(); assert.equal(sends, 0);
  assert.equal(controller.getState().chat.open, false);
  assert.equal(await createDesignCheckController({ tabs }).sendChat('test'), false);
});
test('dialogue carries real history and null snapshot context, separate from audits', async () => {
  const requests = [];
  const controller = createDesignCheckController({ tabs, dialogue: { cancelScope: 'client-only', send: async value => { requests.push(value); return { text: 'Synthetic test response' }; } } });
  controller.setAudit(audit()); await controller.sendChat('one'); await controller.sendChat('two');
  assert.equal(requests[0].context, null); assert.deepEqual(requests[0].dialogue, []);
  assert.deepEqual(requests[1].dialogue.map(entry => entry.role), ['user', 'assistant']);
  assert.equal(Object.hasOwn(requests[0], 'audit'), false);
});
test('closing a chat preserves pending history and result for reopening', async () => {
  const reply = deferred();
  const controller = createDesignCheckController({ tabs, dialogue: { cancelScope: 'client-only', send: () => reply.promise } });
  controller.openChat(); const request = controller.sendChat('test'); controller.closeChat();
  reply.resolve({ text: 'Synthetic result' }); await request;
  assert.equal(controller.getState().chat.unreadCount, 1); controller.openChat();
  assert.equal(controller.getState().chat.unreadCount, 0);
  assert.equal(controller.getState().chat.messages.length, 2);
});
test('reply in the open chat is read immediately; unread state never persists as a preference', async () => {
  const writes = [];
  const controller = createDesignCheckController({ tabs, preferences: { load: async () => null, save: async value => writes.push(value) },
    dialogue: { cancelScope: 'client-only', send: async () => ({ text: 'Synthetic reply' }) } });
  controller.openChat(); await controller.sendChat('test'); controller.closeChat();
  assert.equal(controller.getState().chat.unreadCount, 0);
  controller.updateSetting('pageTypeId', 'form'); await controller.flushPreferences();
  assert.ok(writes.every(value => !Object.hasOwn(value, 'unreadCount') && !Object.hasOwn(value, 'chat')));
});
test('independent audit invalidation and UI navigation keep a closed free dialogue alive', async () => {
  const reply = deferred(); let signal;
  const controller = createDesignCheckController({ tabs, onAudit: () => {}, dialogue: { cancelScope: 'client-only', send: input => { signal = input.signal; return reply.promise; } } });
  controller.openChat(); const pending = controller.sendChat('knowledge question'); controller.closeChat();
  controller.invalidateAudit(); controller.selectTab('changes'); controller.setView('report');
  controller.setAuditReady(true); await controller.startAudit();
  assert.equal(signal.aborted, false); assert.equal(controller.getState().chat.busy, true);
  reply.resolve({ text: 'Background answer' }); await pending;
  assert.equal(controller.getState().chat.unreadCount, 1); assert.equal(controller.getState().chat.messages.at(-1).text, 'Background answer');
});
test('source changes and explicit dialogue reset clear unread state; cancellation never raises it', async () => {
  const reply = deferred();
  const controller = createDesignCheckController({ tabs, dialogue: { cancelScope: 'client-only', send: () => reply.promise } });
  let pending = controller.sendChat('cancel'); controller.cancelChat(); reply.resolve({ text: 'stale' }); await pending;
  assert.equal(controller.getState().chat.unreadCount, 0);
  pending = controller.sendChat('new'); await pending;
  assert.equal(controller.getState().chat.unreadCount, 1); controller.setAgentSource('langflow');
  assert.equal(controller.getState().chat.unreadCount, 0);
  await controller.sendChat('another'); controller.setContext('explicit-new-dialogue');
  assert.equal(controller.getState().chat.unreadCount, 0); assert.deepEqual(controller.getState().chat.messages, []);
});
test('a long answer remains readable while the next request uses the v3 bounded history', async () => {
  const requests = [], answer = 'a'.repeat(9000);
  const controller = createDesignCheckController({ tabs, dialogue: { cancelScope: 'client-only', send: async value => { requests.push(value); return { text: answer }; } } });
  await controller.sendChat('one'); await controller.sendChat('two');
  assert.equal(requests[1].dialogue[1].text.length, 8000);
  assert.equal(controller.getState().chat.messages[1].text.length, 9000);
});
test('cancelled reply never reappears after a newer request', async () => {
  const old = deferred(); let calls = 0, signal;
  const controller = createDesignCheckController({ tabs, dialogue: { cancelScope: 'client-only', send: value => { signal = value.signal; return ++calls === 1 ? old.promise : Promise.resolve({ text: 'new reply' }); } } });
  const request = controller.sendChat('old question'); controller.cancelChat(); assert.equal(signal.aborted, true);
  await controller.sendChat('new question'); old.resolve({ text: 'stale reply' }); await request;
  assert.equal(controller.getState().chat.messages.some(entry => entry.text === 'stale reply'), false);
  assert.equal(controller.getState().chat.messages.at(-1).text, 'new reply');
});
test('context changes abort the active client wait and reset history', async () => {
  const reply = deferred(); let resets = 0;
  const controller = createDesignCheckController({ tabs, dialogue: { cancelScope: 'client-only', resetSession: () => resets++, send: () => reply.promise } });
  const pending = controller.sendChat('old'); controller.setContext('fresh-selection'); reply.resolve({ text: 'old snapshot answer' }); await pending;
  assert.equal(resets, 1); assert.equal(controller.getState().chat.messages.length, 0); assert.equal(controller.getState().chat.busy, false);
});
test('source changes have isolated sessions and are blocked during a request', async () => {
  const reply = deferred(); let resets = 0;
  const controller = createDesignCheckController({ tabs, dialogue: { cancelScope: 'client-only', resetSession: () => resets++, send: () => reply.promise } });
  const pending = controller.sendChat('one'); assert.equal(controller.setAgentSource('langflow'), false);
  reply.resolve({ text: 'Codex test reply' }); await pending; controller.setAgentSource('langflow');
  assert.equal(resets, 1); assert.equal(controller.getState().chat.messages.length, 0);
});
test('errors and empty agent replies stay visible without fabricated messages', async () => {
  for (const send of [async () => { throw Error('proxy unavailable'); }, async () => ({ text: '' })]) {
    const controller = createDesignCheckController({ tabs, dialogue: { cancelScope: 'client-only', send } });
    await controller.sendChat('test'); assert.equal(controller.getState().chat.busy, false);
    assert.equal(controller.getState().chat.messages.length, 1); assert.ok(controller.getState().chat.error);
  }
});
test('dispose prevents delayed results from publishing into an unmounted UI', async () => {
  const reply = deferred(); let notifications = 0;
  const controller = createDesignCheckController({ tabs, dialogue: { cancelScope: 'client-only', send: () => reply.promise } });
  controller.subscribe(() => notifications++); const pending = controller.sendChat('test'); controller.destroy();
  const observed = notifications; reply.resolve({ text: 'late result' }); await pending; assert.equal(notifications, observed);
});
